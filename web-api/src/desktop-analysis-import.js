export async function importDesktopAnalyses(request, env, runner, requestId) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 let input; try { input = await request.json(); } catch { return Response.json({ error: 'invalid_input' }, { status: 400 }); }
 const analyses = input?.analyses;
 if (!Array.isArray(analyses) || !analyses.length || analyses.length > 500) return Response.json({ error: 'invalid_input' }, { status: 400 });
 for (const item of analyses) {
  if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 256 || typeof item.label !== 'string' || item.label.length > 20000 || typeof item.status !== 'string' || item.status.length > 100 || typeof item.content !== 'string' || item.content.length > 1_000_000 || (item.error !== null && (typeof item.error !== 'string' || item.error.length > 20000)) || !Number.isSafeInteger(item.sortOrder)) return Response.json({ error: 'invalid_input' }, { status: 400 });
 }
 const body = JSON.stringify(analyses.map(({ id, label, status, content, error, sortOrder }) => ({ id, label, status, content, error, sortOrder })));
 if (body.length > 3_000_000) return Response.json({ error: 'too_large' }, { status: 413 });
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)), hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
 const imported = await env.DB.prepare('SELECT i.project_id FROM desktop_plan_imports i JOIN projects p ON p.id = i.project_id AND p.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ?').bind(runner.ownerId, requestId).first();
 if (!imported) return Response.json({ error: 'not_found' }, { status: 404 });
 const row = await env.DB.prepare('INSERT INTO desktop_analysis_imports (owner_id, request_id, project_id, content_hash, analyses_json, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING project_id').bind(runner.ownerId, requestId, imported.project_id, hash, body, new Date().toISOString()).first();
 if (row) return Response.json({ imported: analyses.length }, { status: 201 });
 const previous = await env.DB.prepare('SELECT content_hash FROM desktop_analysis_imports WHERE owner_id = ? AND request_id = ?').bind(runner.ownerId, requestId).first();
 return previous?.content_hash === hash ? Response.json({ imported: analyses.length }) : Response.json({ error: 'analyses_conflict' }, { status: 409 });
}
