export async function importDesktopChat(request, env, runner, requestId) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 let input; try { input = await request.json(); } catch { return Response.json({ error: 'invalid_input' }, { status: 400 }); }
 const messages = input?.messages;
 if (!Array.isArray(messages) || !messages.length || messages.length > 5000) return Response.json({ error: 'invalid_input' }, { status: 400 });
 for (const item of messages) {
  if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 256 || typeof item.role !== 'string' || item.role.length > 100 || typeof item.content !== 'string' || item.content.length > 1_000_000 || typeof item.status !== 'string' || item.status.length > 100 || typeof item.createdAt !== 'string' || item.createdAt.length > 100 || (item.followupsJson !== null && (typeof item.followupsJson !== 'string' || item.followupsJson.length > 100_000))) return Response.json({ error: 'invalid_input' }, { status: 400 });
 }
 const body = JSON.stringify(messages.map(({ id, role, content, status, createdAt, followupsJson }) => ({ id, role, content, status, createdAt, followupsJson })));
 if (body.length > 3_000_000) return Response.json({ error: 'too_large' }, { status: 413 });
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)), hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
 const imported = await env.DB.prepare('SELECT i.project_id FROM desktop_plan_imports i JOIN projects p ON p.id = i.project_id AND p.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ?').bind(runner.ownerId, requestId).first();
 if (!imported) return Response.json({ error: 'not_found' }, { status: 404 });
 const row = await env.DB.prepare('INSERT INTO desktop_chat_imports (owner_id, request_id, project_id, content_hash, messages_json, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING project_id').bind(runner.ownerId, requestId, imported.project_id, hash, body, new Date().toISOString()).first();
 if (row) return Response.json({ imported: messages.length }, { status: 201 });
 const previous = await env.DB.prepare('SELECT content_hash FROM desktop_chat_imports WHERE owner_id = ? AND request_id = ?').bind(runner.ownerId, requestId).first();
 return previous?.content_hash === hash ? Response.json({ imported: messages.length }) : Response.json({ error: 'chat_conflict' }, { status: 409 });
}

export async function importedDesktopChat(request, env, ownerId, projectId) {
 if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
 const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, ownerId).first();
 if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
 const row = await env.DB.prepare('SELECT messages_json FROM desktop_chat_imports WHERE project_id = ? AND owner_id = ?').bind(projectId, ownerId).first();
 return Response.json({ messages: row ? JSON.parse(row.messages_json) : [] });
}
