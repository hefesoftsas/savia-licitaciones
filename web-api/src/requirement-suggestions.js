import { digest } from './runners.js';
import { captureRequirementSources, sameRequirementSources, sourceGuard } from './requirement-sources.js';
const missing = () => Response.json({ error: 'not_found' }, { status: 404 });
const conflict = () => Response.json({ error: 'sources_changed' }, { status: 409 });
const bad = () => Response.json({ error: 'invalid_input' }, { status: 400 });

export async function runnerRequirementContext(request, env, runner, jobId) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let input; try { input = await request.json(); } catch { return bad(); }
  if (typeof input?.lease !== 'string' || !/^[a-f0-9]{64}$/.test(input.lease)) return bad();
  const job = await env.DB.prepare("SELECT project_id, payload_json FROM jobs WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = 'running' AND lease_expires_at > ? AND kind IN ('requirements.suggest', 'technical-plan.analyze')").bind(jobId, runner.ownerId, runner.id, await digest(input.lease), Date.now()).first();
  if (!job) return conflict();
  const payload = JSON.parse(job.payload_json), current = await captureRequirementSources(env, runner.ownerId, job.project_id, payload.sourceSnapshot.includeRup);
  if (!sameRequirementSources(payload.sourceSnapshot, current)) return conflict();
  if (new URL(request.url).searchParams.get('check') === '1') return Response.json({ ok: true });
  return Response.json({ facts: current.facts.map(({ id, label, value, page }) => ({ id, label, value, page })), certificates: [] });
}
export async function userRequirementSuggestions(request, env, ownerId, projectId, jobId) {
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  if (!project) return missing();
  if (request.method === 'GET' && !jobId) {
    const rows = await env.DB.prepare("SELECT id, state, payload_json, result_json, created_at, updated_at FROM jobs WHERE project_id = ? AND owner_id = ? AND kind = 'requirements.suggest' ORDER BY created_at DESC, id").bind(projectId, ownerId).all();
    const accepted = await env.DB.prepare('SELECT suggestion_id, requirement_id FROM requirement_suggestion_acceptances WHERE project_id = ?').bind(projectId).all();
    const currentWithout = await captureRequirementSources(env, ownerId, projectId, false);
    const currentWith = rows.results.some(row => JSON.parse(row.payload_json).sourceSnapshot.includeRup) ? await captureRequirementSources(env, ownerId, projectId, true) : null;
    return Response.json({ jobs: rows.results.map(row => { const payload = JSON.parse(row.payload_json); return { id: row.id, state: row.state, payload, result: row.result_json ? JSON.parse(row.result_json) : null, createdAt: row.created_at, updatedAt: row.updated_at, stale: !sameRequirementSources(payload.sourceSnapshot, payload.sourceSnapshot.includeRup ? currentWith : currentWithout), accepted: accepted.results.map(item => ({ suggestionId: item.suggestion_id, requirementId: item.requirement_id })) }; }) });
  }
  if (request.method !== 'POST' || !jobId) return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  let input; try { input = await request.json(); } catch { return bad(); }
  if (typeof input?.suggestionId !== 'string' || !input.suggestionId || input.suggestionId.length > 128) return bad();
  const job = await env.DB.prepare("SELECT payload_json, result_json FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ? AND kind = 'requirements.suggest' AND state = 'succeeded'").bind(jobId, projectId, ownerId).first();
  if (!job) return missing();
  const payload = JSON.parse(job.payload_json), result = JSON.parse(job.result_json);
  const existing = await env.DB.prepare('SELECT r.* FROM requirement_suggestion_acceptances a JOIN project_requirements r ON r.id = a.requirement_id AND r.project_id = a.project_id WHERE a.project_id = ? AND a.suggestion_id = ?').bind(projectId, input.suggestionId).first();
  if (existing) return Array.isArray(result?.requirements) && result.requirements.some(item => item.id === input.suggestionId) ? Response.json({ item: requirementView(existing) }) : missing();
  const current = await captureRequirementSources(env, ownerId, projectId, payload.sourceSnapshot.includeRup);
  if (!sameRequirementSources(payload.sourceSnapshot, current)) return conflict();
  const suggestion = Array.isArray(result?.requirements) ? result.requirements.find(item => item.id === input.suggestionId) : null;
  if (!suggestion || !Array.isArray(payload.fileIds) || !payload.fileIds.includes(suggestion.sourceId) || typeof suggestion.title !== 'string' || !suggestion.title.trim() || suggestion.title.length > 300 || typeof suggestion.quote !== 'string' || !suggestion.quote.trim() || !['general', 'legal', 'financial', 'technical', 'experience'].includes(suggestion.category)) return bad();
  const file = await env.DB.prepare('SELECT name FROM project_files WHERE project_id = ? AND id = ?').bind(projectId, suggestion.sourceId).first();
  if (!file) return conflict();
  const source = `${file.name} · «${suggestion.quote}»`; if (source.length > 20000) return bad();
  const id = crypto.randomUUID(), now = new Date().toISOString(), guard = sourceGuard(payload.sourceSnapshot, projectId, ownerId);
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO project_requirements (id, project_id, title, source, evidence, status, category, version, created_at, updated_at) SELECT ?, ?, ?, ?, '', 'pending', ?, 1, ?, ? WHERE ${guard.sql} AND NOT EXISTS (SELECT 1 FROM requirement_suggestion_acceptances WHERE project_id = ? AND suggestion_id = ?)`).bind(id, projectId, suggestion.title.trim(), source, suggestion.category, now, now, ...guard.args, projectId, input.suggestionId),
    env.DB.prepare('INSERT INTO requirement_suggestion_acceptances (project_id, suggestion_id, requirement_id, job_id) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM project_requirements WHERE project_id = ? AND id = ?)').bind(projectId, input.suggestionId, id, jobId, projectId, id),
  ]);
  if (!results[0].meta.changes) {
    const duplicate = await env.DB.prepare('SELECT r.* FROM requirement_suggestion_acceptances a JOIN project_requirements r ON r.id = a.requirement_id AND r.project_id = a.project_id WHERE a.project_id = ? AND a.suggestion_id = ?').bind(projectId, input.suggestionId).first();
    return duplicate ? Response.json({ item: requirementView(duplicate) }) : conflict();
  }
  const row = await env.DB.prepare('SELECT * FROM project_requirements WHERE id = ? AND project_id = ?').bind(id, projectId).first();
  return Response.json({ item: requirementView(row) }, { status: 201 });
}
function requirementView(row) { return { id: row.id, projectId: row.project_id, title: row.title, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, source: row.source, evidence: row.evidence, status: row.status, category: row.category }; }
