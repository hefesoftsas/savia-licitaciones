import { templateGuard } from './template-sources.js';
const conflict = () => Response.json({ error: 'template_or_values_conflict' }, { status: 409 });
const invalid = () => Response.json({ error: 'invalid_input' }, { status: 400 });
export async function templateValues(request, env, ownerId, projectId) {
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
  const selected = await env.DB.prepare('SELECT s.*, j.result_json FROM project_selected_templates s JOIN jobs j ON j.id = s.job_id WHERE s.project_id = ? AND j.owner_id = ?').bind(projectId, ownerId).first();
  if (!selected) return request.method === 'GET' ? Response.json({ selection: null, fields: [], values: {}, revision: 0 }) : conflict();
  const result = JSON.parse(selected.result_json), fields = result?.fields;
  if (!Array.isArray(fields) || fields.length > 5000 || fields.some(field => typeof field?.id !== 'string' || !/^f\d+$/.test(field.id) || typeof field.name !== 'string' || !field.name.trim() || !['ai', 'manual'].includes(field.fill_by)) || new Set(fields.map(field => field.id)).size !== fields.length) return conflict();
  const existing = await env.DB.prepare('SELECT revision, values_json FROM project_template_values WHERE project_id = ? AND job_id = ?').bind(projectId, selected.job_id).first();
  const guard = templateGuard(JSON.parse(selected.source_snapshot_json), selected.chapter_fingerprint, projectId, ownerId, selected.job_id, selected.revision);
  if (request.method === 'GET') return Response.json({ selection: { jobId: selected.job_id, revision: selected.revision, current: Boolean(await env.DB.prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.args).first()) }, fields, values: existing ? JSON.parse(existing.values_json) : {}, revision: existing?.revision || 0 });
  if (request.method !== 'PUT') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  let input; try { input = await request.json(); } catch { return invalid(); }
  if (Number.isSafeInteger(input?.selectionRevision) && input.selectionRevision !== selected.revision) return conflict();
  if (!Number.isSafeInteger(input?.selectionRevision) || !Number.isSafeInteger(input.revision) || input.revision < 0 || !input.values || typeof input.values !== 'object' || Array.isArray(input.values)) return invalid();
  const allowed = new Set(fields.map(field => field.id)), entries = Object.entries(input.values);
  if (entries.some(([id, value]) => !allowed.has(id) || typeof value !== 'string' || !value.trim() || value.length > 5000 || /[\r\n\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]/u.test(value)) || JSON.stringify(input.values).length > 500_000) return invalid();
  const groups = new Map();
  for (const field of fields) { const value = input.values[field.id] ?? ''; if (groups.has(field.name) && groups.get(field.name) !== value) return invalid(); groups.set(field.name, value); }
  const valuesJson = JSON.stringify(Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))));
  const row = await env.DB.prepare(`INSERT INTO project_template_values (project_id, job_id, revision, values_json, updated_at) SELECT ?, ?, 1, ?, ? WHERE ${guard.sql} AND COALESCE((SELECT revision FROM project_template_values WHERE project_id = ? AND job_id = ?), 0) = ? ON CONFLICT(project_id, job_id) DO UPDATE SET revision = revision + 1, values_json = excluded.values_json, updated_at = excluded.updated_at RETURNING revision`).bind(projectId, selected.job_id, valuesJson, new Date().toISOString(), ...guard.args, projectId, selected.job_id, input.revision).first();
  if (row) return Response.json({ revision: row.revision });
  const prior = await env.DB.prepare(`SELECT revision FROM project_template_values WHERE project_id = ? AND job_id = ? AND revision = ? AND values_json = ? AND ${guard.sql}`).bind(projectId, selected.job_id, input.revision + 1, valuesJson, ...guard.args).first();
  return prior ? Response.json({ revision: prior.revision }) : conflict();
}
