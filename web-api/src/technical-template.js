import { unselectedTemplateGuard, templateGuard } from './template-sources.js';
const conflict = () => Response.json({ error: 'template_or_sources_conflict' }, { status: 409 });
export async function technicalTemplate(request, env, ownerId, projectId) {
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
  const selected = await env.DB.prepare('SELECT * FROM project_selected_templates WHERE project_id = ?').bind(projectId).first();
  if (request.method === 'GET') {
    if (!selected) return Response.json({ selection: null });
    const guard = templateGuard(JSON.parse(selected.source_snapshot_json), selected.chapter_fingerprint, projectId, ownerId, selected.job_id, selected.revision);
    const current = Boolean(await env.DB.prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.args).first());
    return Response.json({ selection: { jobId: selected.job_id, revision: selected.revision, current } });
  }
  if (!['POST', 'DELETE'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  let input; try { input = await request.json(); } catch { return Response.json({ error: 'invalid_input' }, { status: 400 }); }
  if (request.method === 'DELETE') {
    if (!Number.isSafeInteger(input?.revision) || input.revision < 1) return Response.json({ error: 'invalid_input' }, { status: 400 });
    const removed = await env.DB.prepare('DELETE FROM project_selected_templates WHERE project_id = ? AND revision = ? RETURNING revision').bind(projectId, input.revision).first();
    return removed ? Response.json({ ok: true }) : conflict();
  }
  if (typeof input?.jobId !== 'string' || !Number.isSafeInteger(input.revision) || input.revision < 0) return Response.json({ error: 'invalid_input' }, { status: 400 });
  const job = await env.DB.prepare("SELECT payload_json FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ? AND kind = 'technical-plan.extract-template' AND state = 'succeeded'").bind(input.jobId, projectId, ownerId).first();
  if (!job) return Response.json({ error: 'not_found' }, { status: 404 });
  const payload = JSON.parse(job.payload_json);
  if (!payload.sourceSnapshot || typeof payload.chapterFingerprint !== 'string') return conflict();
  const guard = unselectedTemplateGuard(payload.sourceSnapshot, payload.chapterFingerprint, projectId, ownerId, input.jobId), now = new Date().toISOString();
  const row = await env.DB.prepare(`INSERT INTO project_selected_templates (project_id, job_id, revision, source_snapshot_json, chapter_fingerprint, updated_at) SELECT ?, ?, 1, ?, ?, ? WHERE ${guard.sql} AND COALESCE((SELECT revision FROM project_selected_templates WHERE project_id = ?), 0) = ? ON CONFLICT(project_id) DO UPDATE SET job_id = excluded.job_id, revision = revision + 1, source_snapshot_json = excluded.source_snapshot_json, chapter_fingerprint = excluded.chapter_fingerprint, updated_at = excluded.updated_at RETURNING revision`).bind(projectId, input.jobId, JSON.stringify(payload.sourceSnapshot), payload.chapterFingerprint, now, ...guard.args, projectId, input.revision).first();
  if (row) return Response.json({ revision: row.revision });
  const prior = await env.DB.prepare(`SELECT revision FROM project_selected_templates WHERE project_id = ? AND job_id = ? AND revision = ? AND ${guard.sql}`).bind(projectId, input.jobId, input.revision + 1, ...guard.args).first();
  return prior ? Response.json({ revision: prior.revision }) : conflict();
}
