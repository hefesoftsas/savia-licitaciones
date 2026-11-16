export async function importDesktopFacts(request, env, runner, requestId) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 let input; try { input = await request.json(); } catch { return Response.json({ error: 'invalid_input' }, { status: 400 }); }
 const groups = input?.groups, ids = new Set();
 if (!Array.isArray(groups) || !groups.length || groups.length > 500) return Response.json({ error: 'invalid_input' }, { status: 400 });
 for (const group of groups) {
  if (!group || typeof group.id !== 'string' || !group.id || group.id.length > 256 || ids.has(group.id) || typeof group.title !== 'string' || group.title.length > 20000 || typeof group.content !== 'string' || group.content.length > 1_000_000) return Response.json({ error: 'invalid_input' }, { status: 400 });
  ids.add(group.id);
 }
 const body = JSON.stringify(groups.map(({ id, title, content }) => ({ id, title, content })));
 if (body.length > 3_000_000) return Response.json({ error: 'too_large' }, { status: 413 });
 const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)), hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
 const imported = await env.DB.prepare('SELECT i.project_id FROM desktop_plan_imports i JOIN projects p ON p.id = i.project_id AND p.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ?').bind(runner.ownerId, requestId).first();
 if (!imported) return Response.json({ error: 'not_found' }, { status: 404 });
 const token = crypto.randomUUID(), now = new Date().toISOString(), own = 'EXISTS (SELECT 1 FROM desktop_fact_imports WHERE owner_id = ? AND request_id = ? AND mutation_id = ?)';
 const result = await env.DB.batch([
  env.DB.prepare('INSERT INTO desktop_fact_imports (owner_id, request_id, project_id, content_hash, mutation_id, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM project_global_facts WHERE project_id = ?) ON CONFLICT(owner_id, request_id) DO NOTHING').bind(runner.ownerId, requestId, imported.project_id, hash, token, now, imported.project_id),
  env.DB.prepare(`INSERT INTO project_global_facts (project_id, revision, groups_json, snapshot_json, source_job_id, updated_at, mode) SELECT ?, 1, ?, ?, NULL, ?, 'manual' WHERE ${own}`).bind(imported.project_id, body, JSON.stringify({ desktopImportPending: true }), now, runner.ownerId, requestId, token),
  env.DB.prepare(`UPDATE project_technical_plans SET version = version + 1, updated_at = ? WHERE project_id = ? AND ${own}`).bind(now, imported.project_id, runner.ownerId, requestId, token),
 ]);
 if (result[0].meta.changes) return Response.json({ imported: groups.length }, { status: 201 });
 const previous = await env.DB.prepare('SELECT content_hash FROM desktop_fact_imports WHERE owner_id = ? AND request_id = ?').bind(runner.ownerId, requestId).first();
 return previous?.content_hash === hash ? Response.json({ imported: groups.length }) : Response.json({ error: 'facts_conflict' }, { status: 409 });
}
