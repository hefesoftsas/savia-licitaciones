import economicOffer from '../../client/electron/services/economicOfferService.cjs';

export function validDraft(draft) {
  const text = (value, limit) => typeof value === 'string' && value.length <= limit;
  return draft && text(draft.currency, 100) && text(draft.budget, 100) && Array.isArray(draft.items) && draft.items.length <= 500 && draft.items.every(item => item && text(item.id, 100) && text(item.name, 1000) && ['quantity', 'price', 'rate', 'cost'].every(key => text(item[key], 100)) && (item.discount === undefined || text(item.discount, 100)));
}
function view(row) {
  const draft = JSON.parse(row.draft_json);
  let calculation = null, error = '';
  try { calculation = economicOffer.calculateOffer(draft); } catch (reason) { error = String(reason.message || reason); }
  return { draft, calculation, error, updatedAt: row.updated_at, version: row.version };
}
export async function handleEconomicOffer(request, env, ownerId, projectId, exporting) {
  const project = await env.DB.prepare('SELECT id, title FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
  if (request.method === 'GET' && !exporting) {
    const row = await env.DB.prepare('SELECT * FROM economic_offer_drafts WHERE project_id = ?').bind(projectId).first();
    return Response.json({ offer: row ? view(row) : null });
  }
  if ((request.method !== 'PUT' || exporting) && (request.method !== 'POST' || !exporting)) return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  let input;
  try { input = await request.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!validDraft(input?.draft) || JSON.stringify(input.draft).length > 200_000) return Response.json({ error: 'invalid_draft' }, { status: 400 });
  if (exporting) {
    try { return Response.json({ csv: economicOffer.formatOfferCsv(input.draft, input.language === 'en' ? 'en' : 'es', { title: project.title }) }); }
    catch { return Response.json({ error: 'invalid_calculation' }, { status: 400 }); }
  }
  if (!Number.isSafeInteger(input.version) || input.version < 0) return Response.json({ error: 'invalid_version' }, { status: 400 });
  const now = new Date().toISOString();
  const row = input.version === 0
    ? await env.DB.prepare('INSERT INTO economic_offer_drafts (project_id, draft_json, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(project_id) DO NOTHING RETURNING *').bind(projectId, JSON.stringify(input.draft), now).first()
    : await env.DB.prepare('UPDATE economic_offer_drafts SET draft_json = ?, version = version + 1, updated_at = ? WHERE project_id = ? AND version = ? RETURNING *').bind(JSON.stringify(input.draft), now, projectId, input.version).first();
  return row ? Response.json({ offer: view(row) }) : Response.json({ error: 'version_conflict' }, { status: 409 });
}
