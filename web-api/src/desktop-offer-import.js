import { validDraft } from './economic-offer.js';

export async function importDesktopOffer(request, env, runner, requestId) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 let input; try { input = await request.json(); } catch { return Response.json({ error: 'invalid_draft' }, { status: 400 }); }
 if (!input?.draft || typeof input.draft !== 'object' || Array.isArray(input.draft) || typeof input.updatedAt !== 'string' || !input.updatedAt || input.updatedAt.length > 100) return Response.json({ error: 'invalid_draft' }, { status: 400 });
 const draft = { ...input.draft, currency: input.draft.currency === undefined ? '' : input.draft.currency };
 const draftJson = JSON.stringify(draft);
 if (!validDraft(draft) || draftJson.length > 200_000) return Response.json({ error: 'invalid_draft' }, { status: 400 });
 const body = JSON.stringify({ draft, updatedAt: input.updatedAt });
 const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))), byte => byte.toString(16).padStart(2, '0')).join('');
 const project = await env.DB.prepare('SELECT i.project_id FROM desktop_plan_imports i JOIN projects p ON p.id = i.project_id AND p.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ?').bind(runner.ownerId, requestId).first();
 if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
 const token = crypto.randomUUID(), now = new Date().toISOString();
 const result = await env.DB.batch([
  env.DB.prepare('INSERT INTO desktop_offer_imports (owner_id, request_id, project_id, content_hash, mutation_id, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM economic_offer_drafts WHERE project_id = ?) ON CONFLICT(owner_id, request_id) DO NOTHING').bind(runner.ownerId, requestId, project.project_id, hash, token, now, project.project_id),
  env.DB.prepare('INSERT INTO economic_offer_drafts (project_id, draft_json, version, updated_at) SELECT ?, ?, 1, ? WHERE EXISTS (SELECT 1 FROM desktop_offer_imports WHERE owner_id = ? AND request_id = ? AND mutation_id = ?)').bind(project.project_id, draftJson, input.updatedAt, runner.ownerId, requestId, token),
 ]);
 if (result[0].meta.changes) return Response.json({ imported: true }, { status: 201 });
 const previous = await env.DB.prepare('SELECT content_hash FROM desktop_offer_imports WHERE owner_id = ? AND request_id = ?').bind(runner.ownerId, requestId).first();
 return previous?.content_hash === hash ? Response.json({ imported: true }) : Response.json({ error: 'offer_conflict' }, { status: 409 });
}
