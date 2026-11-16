import { captureRequirementSources, sameRequirementSources, sourceGuard } from './requirement-sources.js';
export const analysisCategories = ['project-overview', 'technical-score', 'response-requirements'];
const conflict = () => Response.json({ error: 'version_or_sources_conflict' }, { status: 409 });
export async function technicalAnalysis(request, env, ownerId, projectId, category, action) {
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
  if (!category && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM project_technical_analyses WHERE project_id = ? ORDER BY category').bind(projectId).all();
    const current = await captureRequirementSources(env, ownerId, projectId, false);
    const imported = await env.DB.prepare('SELECT analyses_json, content_hash FROM desktop_analysis_imports WHERE project_id = ? AND owner_id = ?').bind(projectId, ownerId).first();
    const jobs = await env.DB.prepare("SELECT id, state, progress, updated_at, (SELECT name FROM runners WHERE runners.id=jobs.runner_id) AS runner_name, payload_json, result_json FROM jobs WHERE project_id = ? AND owner_id = ? AND kind = 'technical-plan.analyze' ORDER BY created_at DESC, id").bind(projectId, ownerId).all();
    return Response.json({ analyses: rows.results.map(row => ({ category: row.category, revision: row.revision, content: row.content, jobId: row.job_id, reviewId: row.review_id, importedFromDesktop: !!row.review_id, reviewedFileIds: row.review_id ? JSON.parse(row.source_file_ids_json) : [], updatedAt: row.updated_at, current: sameRequirementSources(JSON.parse(row.source_snapshot_json), current) })), importedAnalyses: imported ? JSON.parse(imported.analyses_json) : [], importHash: imported?.content_hash || null, reviewSnapshot: imported ? current : null, jobs: jobs.results.map(row => { const payload = JSON.parse(row.payload_json); return { id: row.id, state: row.state, progress: row.state==='running'?row.progress:null, updatedAt:row.updated_at, runnerName:row.runner_name, category: payload.category, fileIds: payload.fileIds, stale: !sameRequirementSources(payload.sourceSnapshot, current), result: row.result_json ? JSON.parse(row.result_json) : null }; }) });
  }
  if (request.method !== 'POST' || !analysisCategories.includes(category)) return Response.json({ error: 'not_found' }, { status: 404 });
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  let input; try { input = await request.json(); } catch { return Response.json({ error: 'invalid_input' }, { status: 400 }); }
  if (!Number.isSafeInteger(input?.revision) || input.revision < 0) return Response.json({ error: 'invalid_input' }, { status: 400 });
  if (action === 'review-import') {
    if (!Number.isSafeInteger(input.index) || input.index < 0 || typeof input.importHash !== 'string' || !Array.isArray(input.fileIds) || !input.fileIds.length || input.fileIds.length > 50 || input.fileIds.some(id => typeof id !== 'string' || !id) || new Set(input.fileIds).size !== input.fileIds.length) return Response.json({ error: 'invalid_input' }, { status: 400 });
    const imported = await env.DB.prepare('SELECT analyses_json, content_hash FROM desktop_analysis_imports WHERE project_id = ? AND owner_id = ?').bind(projectId, ownerId).first();
    if (!imported || imported.content_hash !== input.importHash) return conflict();
    const item = JSON.parse(imported.analyses_json)[input.index], expected = { 'project-overview': ['projectOverview', 'legacy-project-overview'], 'technical-score': ['techRequirements'], 'response-requirements': ['responseFileRequirements'] };
    if (!item || !expected[category].includes(item.id) || (item.status !== 'success' && !(item.id === 'legacy-project-overview' && item.status === 'saved')) || typeof item.content !== 'string' || !item.content.trim() || item.content.length > 200_000) return Response.json({ error: 'invalid_input' }, { status: 400 });
    const placeholders = input.fileIds.map(() => '?').join(','), files = await env.DB.prepare(`SELECT COUNT(*) AS count FROM project_files WHERE project_id = ? AND id IN (${placeholders})`).bind(projectId, ...input.fileIds).first();
    if (files.count !== input.fileIds.length) return Response.json({ error: 'not_found' }, { status: 404 });
    const snapshot = await captureRequirementSources(env, ownerId, projectId, false);
    if (JSON.stringify(snapshot) !== JSON.stringify(input.reviewSnapshot)) return conflict();
    const guard = sourceGuard(snapshot, projectId, ownerId), now = new Date().toISOString(), reviewId = crypto.randomUUID();
    const row = await env.DB.prepare(`INSERT INTO project_technical_analyses (project_id, category, revision, content, job_id, review_id, source_file_ids_json, source_snapshot_json, updated_at)
      SELECT ?, ?, 1, ?, NULL, ?, ?, ?, ? WHERE ${guard.sql} AND COALESCE((SELECT revision FROM project_technical_analyses WHERE project_id = ? AND category = ?), 0) = ? AND EXISTS (SELECT 1 FROM desktop_analysis_imports WHERE project_id = ? AND owner_id = ? AND content_hash = ?)
      ON CONFLICT(project_id, category) DO UPDATE SET revision = revision + 1, content = excluded.content, job_id = NULL, review_id = excluded.review_id, source_file_ids_json = excluded.source_file_ids_json, source_snapshot_json = excluded.source_snapshot_json, updated_at = excluded.updated_at RETURNING revision`)
      .bind(projectId, category, item.content, reviewId, JSON.stringify([...input.fileIds].sort()), JSON.stringify(snapshot), now, ...guard.args, projectId, category, input.revision, projectId, ownerId, input.importHash).first();
    return row ? Response.json({ revision: row.revision }) : conflict();
  }
  if (action === 'edit') {
    if (typeof input.jobId !== 'string' || typeof input.content !== 'string' || !input.content.trim() || input.content.length > 200000) return Response.json({error:'invalid_input'},{status:400});
    const accepted = await env.DB.prepare('SELECT * FROM project_technical_analyses WHERE project_id = ? AND category = ?').bind(projectId,category).first();
    if ((accepted?.revision || 0) !== input.revision) return conflict();
    if (accepted?.review_id === input.jobId) {
      const guard = sourceGuard(JSON.parse(accepted.source_snapshot_json),projectId,ownerId);
      const row = await env.DB.prepare(`UPDATE project_technical_analyses SET content = ?, revision = revision + 1, updated_at = ? WHERE project_id = ? AND category = ? AND revision = ? AND review_id = ? AND ${guard.sql} RETURNING revision`).bind(input.content.trim(),new Date().toISOString(),projectId,category,input.revision,input.jobId,...guard.args).first();
      return row ? Response.json({revision:row.revision}) : conflict();
    }
    let snapshot;
    if (accepted?.job_id === input.jobId) snapshot = JSON.parse(accepted.source_snapshot_json);
    else {
      const base = await env.DB.prepare("SELECT payload_json FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ? AND kind = 'technical-plan.analyze' AND state = 'succeeded'").bind(input.jobId,projectId,ownerId).first();
      if (!base) return Response.json({error:'not_found'},{status:404});
      const payload = JSON.parse(base.payload_json);
      if (payload.category !== category || !payload.sourceSnapshot) return Response.json({error:'invalid_input'},{status:400});
      snapshot = payload.sourceSnapshot;
    }
    const guard = sourceGuard(snapshot, projectId, ownerId);
    const row = await env.DB.prepare(`INSERT INTO project_technical_analyses (project_id, category, revision, content, job_id, source_snapshot_json, updated_at)
      SELECT ?, ?, 1, ?, ?, ?, ? WHERE ${guard.sql} AND COALESCE((SELECT revision FROM project_technical_analyses WHERE project_id = ? AND category = ?), 0) = ?
      ON CONFLICT(project_id, category) DO UPDATE SET revision = revision + 1, content = excluded.content, job_id = excluded.job_id, review_id = NULL, source_file_ids_json = NULL, source_snapshot_json = excluded.source_snapshot_json, updated_at = excluded.updated_at RETURNING revision`)
      .bind(projectId,category,input.content.trim(),input.jobId,JSON.stringify(snapshot),new Date().toISOString(),...guard.args,projectId,category,input.revision).first();
    return row ? Response.json({revision:row.revision}) : conflict();
  }
  if (action === 'accept-proposal') {
    const job = await env.DB.prepare("SELECT payload_json, result_json FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ? AND kind = 'tender-chat.send' AND state = 'succeeded'").bind(input.jobId,projectId,ownerId).first();
    if (!job) return Response.json({error:'not_found'},{status:404});
    const payload = JSON.parse(job.payload_json), result = JSON.parse(job.result_json), d = payload.analysisDiscussion;
    if (!d || d.mode !== 'proposal' || d.category !== category || d.revision !== input.revision || typeof result?.answer !== 'string' || !result.answer.trim() || result.answer.length > 200000 || !d.sourceSnapshot) return Response.json({error:'invalid_input'},{status:400});
    const guard = sourceGuard(d.sourceSnapshot, projectId, ownerId);
    const row = await env.DB.prepare(`INSERT INTO project_technical_analyses (project_id, category, revision, content, job_id, source_snapshot_json, updated_at)
      SELECT ?, ?, 1, ?, ?, ?, ? WHERE ${guard.sql} AND COALESCE((SELECT revision FROM project_technical_analyses WHERE project_id = ? AND category = ?), 0) = ?
      ON CONFLICT(project_id, category) DO UPDATE SET revision = revision + 1, content = excluded.content, job_id = excluded.job_id, review_id = NULL, source_file_ids_json = NULL, source_snapshot_json = excluded.source_snapshot_json, updated_at = excluded.updated_at RETURNING revision`)
      .bind(projectId,category,result.answer.trim(),input.jobId,JSON.stringify(d.sourceSnapshot),new Date().toISOString(),...guard.args,projectId,category,input.revision).first();
    return row ? Response.json({revision:row.revision}) : conflict();
  }
  if (typeof input.jobId !== 'string') return Response.json({ error: 'invalid_input' }, { status: 400 });
  const job = await env.DB.prepare("SELECT payload_json, result_json FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ? AND kind = 'technical-plan.analyze' AND state = 'succeeded'").bind(input.jobId, projectId, ownerId).first();
  if (!job) return Response.json({ error: 'not_found' }, { status: 404 });
  const payload = JSON.parse(job.payload_json), result = JSON.parse(job.result_json);
  if (payload.category !== category || typeof result?.content !== 'string' || !result.content.trim() || result.content.length > 200_000 || !payload.sourceSnapshot) return Response.json({ error: 'invalid_input' }, { status: 400 });
  const snapshot = payload.sourceSnapshot, guard = sourceGuard(snapshot, projectId, ownerId), now = new Date().toISOString();
  const row = await env.DB.prepare(`INSERT INTO project_technical_analyses (project_id, category, revision, content, job_id, source_snapshot_json, updated_at)
    SELECT ?, ?, 1, ?, ?, ?, ? WHERE ${guard.sql} AND COALESCE((SELECT revision FROM project_technical_analyses WHERE project_id = ? AND category = ?), 0) = ?
    ON CONFLICT(project_id, category) DO UPDATE SET revision = revision + 1, content = excluded.content, job_id = excluded.job_id, review_id = NULL, source_file_ids_json = NULL, source_snapshot_json = excluded.source_snapshot_json, updated_at = excluded.updated_at RETURNING revision`)
    .bind(projectId, category, result.content, input.jobId, JSON.stringify(snapshot), now, ...guard.args, projectId, category, input.revision).first();
  if (row) return Response.json({ revision: row.revision });
  const prior = await env.DB.prepare(`SELECT revision FROM project_technical_analyses WHERE project_id = ? AND category = ? AND job_id = ? AND revision = ? AND ${guard.sql}`).bind(projectId, category, input.jobId, input.revision + 1, ...guard.args).first();
  return prior ? Response.json({ revision: prior.revision }) : conflict();
}
