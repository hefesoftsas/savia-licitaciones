import { RUNNER_CONFIG_CATALOG } from './runner-config-catalog.js';
import { authenticateRunner } from './runners.js';

const VALID_CATEGORIES = new Set(['skill', 'hook', 'prompt']);
const ID_PATTERN = /^[a-z0-9:-]+$/;
const CATALOG_BY_ID = new Map(RUNNER_CONFIG_CATALOG.map((item) => [item.id, item]));

function privateResponse(response) {
  const result = new Response(response.body, response);
  result.headers.set('cache-control', 'no-store');
  return result;
}

function parseHookConfig(content) {
  if (typeof content !== 'string' || !content.trim()) return {};
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function formatCatalogItem(builtIn, row) {
  if (row) {
    return {
      id: builtIn.id,
      category: builtIn.category,
      title: row.title,
      description: row.description,
      sourcePath: row.source_path || builtIn.sourcePath,
      defaultContent: builtIn.defaultContent,
      content: row.content,
      enabled: Boolean(row.enabled),
      isBuiltIn: true,
      isCustomized: true,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by ?? null,
    };
  }
  return {
    id: builtIn.id,
    category: builtIn.category,
    title: builtIn.title,
    description: builtIn.description,
    sourcePath: builtIn.sourcePath,
    defaultContent: builtIn.defaultContent,
    content: builtIn.defaultContent,
    enabled: Boolean(builtIn.defaultEnabled),
    isBuiltIn: true,
    isCustomized: false,
    updatedAt: null,
    updatedBy: null,
  };
}

function formatCustomItem(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    description: row.description,
    sourcePath: row.source_path || '',
    defaultContent: '',
    content: row.content,
    enabled: Boolean(row.enabled),
    isBuiltIn: false,
    isCustomized: true,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
  };
}

function mergeRunnerConfigItems(rows, categoryFilter = '') {
  const rowsById = new Map((rows || []).map((row) => [row.id, row]));
  const items = [];
  for (const builtIn of RUNNER_CONFIG_CATALOG) {
    if (categoryFilter && builtIn.category !== categoryFilter) continue;
    items.push(formatCatalogItem(builtIn, rowsById.get(builtIn.id) || null));
  }
  for (const row of rows || []) {
    if (CATALOG_BY_ID.has(row.id)) continue;
    if (categoryFilter && row.category !== categoryFilter) continue;
    items.push(formatCustomItem(row));
  }
  return items;
}

async function readAllConfigRows(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, category, title, description, source_path, content, enabled, updated_by, created_at, updated_at FROM runner_config_items ORDER BY id',
  ).all();
  return results || [];
}

export async function handleAdminRunnerConfig(request, env, session, url) {
  if (!session) return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
  if (env.AUTH_REQUIRE_VERIFIED_EMAIL === 'true' && !session.user?.emailVerified) {
    return privateResponse(Response.json({ error: 'email_not_verified' }, { status: 403 }));
  }
  const roles = (session.user?.role || '').split(',').map((x) => x.trim());
  if (!roles.includes('superadmin')) {
    return privateResponse(Response.json({ error: 'forbidden' }, { status: 403 }));
  }
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) {
    return privateResponse(Response.json({ error: 'invalid_origin' }, { status: 403 }));
  }

  const parsedUrl = url instanceof URL ? url : new URL(request.url);
  const path = parsedUrl.pathname;

  if (path === '/api/admin/runner-config' && request.method === 'GET') {
    const category = (parsedUrl.searchParams.get('category') || '').trim();
    if (category && !VALID_CATEGORIES.has(category)) {
      return privateResponse(Response.json({ error: 'invalid_category' }, { status: 400 }));
    }
    const rows = await readAllConfigRows(env);
    return privateResponse(Response.json({ items: mergeRunnerConfigItems(rows, category) }));
  }

  if (path === '/api/admin/runner-config' && request.method === 'POST') {
    let input;
    try {
      input = await request.json();
    } catch {
      return privateResponse(Response.json({ error: 'invalid_json' }, { status: 400 }));
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return privateResponse(Response.json({ error: 'invalid_request' }, { status: 400 }));
    }

    const id = typeof input.id === 'string' ? input.id.trim() : '';
    if (!id || id.length > 128 || !ID_PATTERN.test(id)) {
      return privateResponse(Response.json({ error: 'invalid_id' }, { status: 400 }));
    }
    const category = typeof input.category === 'string' ? input.category.trim() : '';
    if (!VALID_CATEGORIES.has(category)) {
      return privateResponse(Response.json({ error: 'invalid_category' }, { status: 400 }));
    }
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title || title.length > 200) {
      return privateResponse(Response.json({ error: 'invalid_title' }, { status: 400 }));
    }
    if (typeof input.content !== 'string' || !input.content.trim()) {
      return privateResponse(Response.json({ error: 'invalid_content' }, { status: 400 }));
    }
    if (input.description !== undefined && typeof input.description !== 'string') {
      return privateResponse(Response.json({ error: 'invalid_description' }, { status: 400 }));
    }
    if (input.sourcePath !== undefined && typeof input.sourcePath !== 'string') {
      return privateResponse(Response.json({ error: 'invalid_source_path' }, { status: 400 }));
    }

    const existing = await env.DB.prepare('SELECT id FROM runner_config_items WHERE id = ?').bind(id).first();
    if (CATALOG_BY_ID.has(id) || existing) {
      return privateResponse(Response.json({ error: 'already_exists' }, { status: 409 }));
    }

    const now = new Date().toISOString();
    const updatedBy = session.user?.email || session.user?.id || null;
    const description = input.description ?? '';
    const sourcePath = input.sourcePath ?? '';
    const enabled = input.enabled === undefined ? 1 : (input.enabled ? 1 : 0);

    await env.DB.prepare(
      'INSERT INTO runner_config_items (id, category, title, description, source_path, content, enabled, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id, category, title, description, sourcePath, input.content, enabled, updatedBy, now, now)
      .run();

    const row = await env.DB.prepare(
      'SELECT id, category, title, description, source_path, content, enabled, updated_by, created_at, updated_at FROM runner_config_items WHERE id = ?',
    )
      .bind(id)
      .first();

    return privateResponse(Response.json({ item: formatCustomItem(row) }, { status: 201 }));
  }

  const itemMatch = /^\/api\/admin\/runner-config\/([^/]+)$/.exec(path);
  if (itemMatch) {
    let id;
    try {
      id = decodeURIComponent(itemMatch[1]).trim();
    } catch {
      return privateResponse(Response.json({ error: 'invalid_id' }, { status: 400 }));
    }
    if (!id || id.length > 128 || !ID_PATTERN.test(id)) {
      return privateResponse(Response.json({ error: 'invalid_id' }, { status: 400 }));
    }

    if (request.method === 'PUT') {
      let input;
      try {
        input = await request.json();
      } catch {
        return privateResponse(Response.json({ error: 'invalid_json' }, { status: 400 }));
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return privateResponse(Response.json({ error: 'invalid_request' }, { status: 400 }));
      }

      const builtIn = CATALOG_BY_ID.get(id) || null;
      const existing = await env.DB.prepare(
        'SELECT id, category, title, description, source_path, content, enabled, updated_by, created_at, updated_at FROM runner_config_items WHERE id = ?',
      )
        .bind(id)
        .first();

      if (!builtIn && !existing) {
        return privateResponse(Response.json({ error: 'not_found' }, { status: 404 }));
      }

      let title = existing ? existing.title : builtIn.title;
      if (input.title !== undefined) {
        if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 200) {
          return privateResponse(Response.json({ error: 'invalid_title' }, { status: 400 }));
        }
        title = input.title.trim();
      }

      let description = existing ? existing.description : builtIn.description;
      if (input.description !== undefined) {
        if (typeof input.description !== 'string') {
          return privateResponse(Response.json({ error: 'invalid_description' }, { status: 400 }));
        }
        description = input.description;
      }

      let sourcePath = existing ? existing.source_path : builtIn.sourcePath;
      if (input.sourcePath !== undefined) {
        if (typeof input.sourcePath !== 'string') {
          return privateResponse(Response.json({ error: 'invalid_source_path' }, { status: 400 }));
        }
        sourcePath = input.sourcePath;
      }

      let content = existing ? existing.content : builtIn.defaultContent;
      if (input.content !== undefined) {
        if (typeof input.content !== 'string') {
          return privateResponse(Response.json({ error: 'invalid_content' }, { status: 400 }));
        }
        content = input.content;
      }

      let enabled = existing ? Number(existing.enabled) : (builtIn.defaultEnabled ? 1 : 0);
      if (input.enabled !== undefined) {
        if (typeof input.enabled !== 'boolean' && input.enabled !== 0 && input.enabled !== 1) {
          return privateResponse(Response.json({ error: 'invalid_enabled' }, { status: 400 }));
        }
        enabled = input.enabled ? 1 : 0;
      }

      const category = builtIn ? builtIn.category : existing.category;
      const now = new Date().toISOString();
      const updatedBy = session.user?.email || session.user?.id || null;

      await env.DB.prepare(
        `INSERT INTO runner_config_items (id, category, title, description, source_path, content, enabled, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           source_path = excluded.source_path,
           content = excluded.content,
           enabled = excluded.enabled,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      )
        .bind(id, category, title, description, sourcePath, content, enabled, updatedBy, now, now)
        .run();

      const saved = await env.DB.prepare(
        'SELECT id, category, title, description, source_path, content, enabled, updated_by, created_at, updated_at FROM runner_config_items WHERE id = ?',
      )
        .bind(id)
        .first();

      const item = builtIn ? formatCatalogItem(builtIn, saved) : formatCustomItem(saved);
      return privateResponse(Response.json({ item }));
    }

    if (request.method === 'DELETE') {
      const builtIn = CATALOG_BY_ID.get(id) || null;
      const deleted = await env.DB.prepare('DELETE FROM runner_config_items WHERE id = ? RETURNING id').bind(id).first();
      if (!deleted && !builtIn) {
        return privateResponse(Response.json({ error: 'not_found' }, { status: 404 }));
      }
      return privateResponse(
        Response.json({
          ok: true,
          id,
          isBuiltIn: Boolean(builtIn),
          item: builtIn ? formatCatalogItem(builtIn, null) : null,
        }),
      );
    }
  }

  return privateResponse(Response.json({ error: 'not_found' }, { status: 404 }));
}

export async function handleRunnerFetchConfig(request, env) {
  if (request.method !== 'GET') {
    return privateResponse(new Response('Method not allowed', { status: 405 }));
  }
  const runner = await authenticateRunner(request, env);
  if (!runner) {
    return privateResponse(Response.json({ error: 'unauthorized' }, { status: 401 }));
  }

  const rows = await readAllConfigRows(env);
  const items = mergeRunnerConfigItems(rows);

  const skills = [];
  const hooks = {};
  const prompts = {};

  for (const item of items) {
    if (item.category === 'skill') {
      if (item.enabled && item.content.trim()) {
        skills.push(item.content);
      }
    } else if (item.category === 'hook') {
      hooks[item.id] = {
        enabled: item.enabled,
        config: parseHookConfig(item.content),
      };
    } else if (item.category === 'prompt') {
      if (item.enabled && item.isCustomized) {
        prompts[item.id] = item.content;
      }
    }
  }

  let updatedAt = null;
  for (const row of rows) {
    if (row.updated_at && (!updatedAt || row.updated_at > updatedAt)) {
      updatedAt = row.updated_at;
    }
  }

  return privateResponse(
    Response.json({
      items,
      overrides: {
        skills,
        hooks,
        prompts,
      },
      updatedAt,
    }),
  );
}
