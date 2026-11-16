import { captureGlobalFactSources, globalFactGuard, globalFactSourcesCurrent } from './global-fact-sources.js';
const bad = () => Response.json({ error: 'invalid_input' }, { status: 400 });
const conflict = () => Response.json({ error: 'facts_or_sources_conflict' }, { status: 409 });
function normalizeGroups(groups) {
  if (!Array.isArray(groups) || groups.length > 100) return null;
  const ids = new Set(), normalized = [];
  for (const group of groups) {
    if (!group || typeof group.id !== 'string' || !group.id.trim() || group.id.length > 100 || ids.has(group.id) || typeof group.title !== 'string' || !group.title.trim() || group.title.length > 300 || typeof group.content !== 'string' || !group.content.trim() || group.content.length > 20000) return null;
    ids.add(group.id); normalized.push({ id: group.id, title: group.title.trim(), content: group.content.trim() });
  }
  return JSON.stringify(normalized).length <= 500_000 ? normalized : null;
}
export async function globalFacts(request, env, ownerId, projectId, action) {
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
  const [facts, plan] = await Promise.all([env.DB.prepare('SELECT * FROM project_global_facts WHERE project_id = ?').bind(projectId).first(), env.DB.prepare('SELECT version FROM project_technical_plans WHERE project_id = ?').bind(projectId).first()]);
  if (request.method === 'GET' && !action) {
    const jobs = await env.DB.prepare("SELECT id, state, progress, updated_at, (SELECT name FROM runners WHERE runners.id=jobs.runner_id) AS runner_name, payload_json, result_json FROM jobs WHERE project_id = ? AND owner_id = ? AND kind = 'technical-plan.generate-facts' ORDER BY created_at DESC, id").bind(projectId, ownerId).all();
    const savedSnapshot = facts ? JSON.parse(facts.snapshot_json) : null;
    const parsedJobs = jobs.results.map(row => ({ row, payload: JSON.parse(row.payload_json) }));
    const matches = snapshot => globalFactSourcesCurrent(env, ownerId, projectId, snapshot);
    const views = await Promise.all(parsedJobs.map(async ({ row, payload }) => ({ id: row.id, state: row.state, progress:row.state==='running'?row.progress:null, updatedAt:row.updated_at, runnerName:row.runner_name, planVersion: payload.planVersion, mode: payload.mode, includeRup: payload.includeRup === true, includesKnowledge: !!payload.factsSnapshot?.knowledgeIds?.length, stale: payload.planVersion !== plan?.version || !await matches(payload.factsSnapshot), result: row.result_json ? JSON.parse(row.result_json) : null })));
    const current = facts ? await matches(savedSnapshot) : true;
    const importReviewPending = savedSnapshot?.desktopImportPending === true;
    const reviewSnapshot = importReviewPending ? await captureGlobalFactSources(env, ownerId, projectId) : null;
    const affected = await env.DB.prepare("SELECT COUNT(*) AS count FROM project_technical_plan_nodes WHERE project_id = ? AND LENGTH(TRIM(content)) > 0").bind(projectId).first();
    return Response.json({ affectedChapterCount: affected.count, revision: facts?.revision || 0, planVersion: plan?.version ?? 0, groups: facts ? JSON.parse(facts.groups_json) : [], current, importReviewPending, importedFromDesktop: importReviewPending || savedSnapshot?.importedFromDesktop === true, reviewSnapshot, includesKnowledge: !!savedSnapshot?.knowledgeIds?.length, includesRup: savedSnapshot?.sources?.includeRup === true, sourceJobId: facts?.source_job_id || null, mode: facts?.mode || 'manual', jobs: views });
  }
  if (request.method === 'DELETE' && action === 'attempts') {
    if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
    let input; try { input = await request.json(); } catch { return bad(); }
    if (typeof input?.jobId !== 'string' || !input.jobId) return bad();
    // Keep active work, the latest attempt and the provenance of confirmed facts intact.
    const removed = await env.DB.prepare(`DELETE FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ?
      AND kind = 'technical-plan.generate-facts' AND state IN ('succeeded','failed','cancelled','interrupted')
      AND id != (SELECT id FROM jobs WHERE project_id = ? AND owner_id = ? AND kind = 'technical-plan.generate-facts' ORDER BY created_at DESC, id LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM project_global_facts WHERE source_job_id = jobs.id) RETURNING id`)
      .bind(input.jobId, projectId, ownerId, projectId, ownerId).first();
    return removed ? new Response(null, { status: 204 }) : conflict();
  }
  if ((request.method !== 'PUT' || action) && (request.method !== 'POST' || !['apply', 'review-import'].includes(action))) return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  let input; try { input = await request.json(); } catch { return bad(); }
  if (!Number.isSafeInteger(input?.revision) || input.revision < 0) return bad();
  if (action === 'review-import') {
    if (!Number.isSafeInteger(input.planVersion) || input.planVersion < 0) return bad();
    if (!facts || facts.revision !== input.revision || plan?.version !== input.planVersion || JSON.parse(facts.snapshot_json)?.desktopImportPending !== true) return conflict();
    const snapshot = await captureGlobalFactSources(env, ownerId, projectId);
    if (JSON.stringify(input.reviewSnapshot) !== JSON.stringify(snapshot)) return conflict();
    const guard = globalFactGuard(snapshot, projectId, ownerId), token = crypto.randomUUID(), now = new Date().toISOString();
    const result = await env.DB.batch([
      env.DB.prepare(`UPDATE project_technical_plans SET version = version + 1, mutation_token = ?, updated_at = ? WHERE project_id = ? AND version = ? AND EXISTS (SELECT 1 FROM project_global_facts WHERE project_id = ? AND revision = ? AND snapshot_json = ?) AND ${guard.sql}`).bind(token, now, projectId, input.planVersion, projectId, input.revision, facts.snapshot_json, ...guard.args),
      env.DB.prepare('UPDATE project_global_facts SET revision = revision + 1, snapshot_json = ?, updated_at = ? WHERE project_id = ? AND EXISTS (SELECT 1 FROM project_technical_plans WHERE project_id = ? AND mutation_token = ?)').bind(JSON.stringify({ ...snapshot, importedFromDesktop: true }), now, projectId, projectId, token),
    ]);
    return result[0].meta.changes === 1 ? Response.json({ revision: input.revision + 1, planVersion: input.planVersion + 1 }) : conflict();
  }
  let groups, snapshot, planVersion, sourceJobId = null, mode = facts?.mode || 'manual';
  if (action === 'apply' || input.jobId !== undefined) {
    if (typeof input.jobId !== 'string' || !input.jobId) return bad();
    const job = await env.DB.prepare("SELECT payload_json, result_json FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ? AND kind = 'technical-plan.generate-facts' AND state = 'succeeded'").bind(input.jobId, projectId, ownerId).first();
    if (!job) return Response.json({ error: 'not_found' }, { status: 404 });
    const payload = JSON.parse(job.payload_json), result = JSON.parse(job.result_json); groups = normalizeGroups(action === 'apply' ? result?.groups : input.groups); snapshot = payload.factsSnapshot; planVersion = payload.planVersion; sourceJobId = input.jobId; mode = ['placeholder', 'omit', 'fabricate'].includes(payload.mode) ? payload.mode : 'manual';
    if (!groups?.length) return bad();
    if (action !== 'apply' && input.planVersion !== planVersion) return conflict();
  } else {
    if (!Number.isSafeInteger(input.planVersion) || input.planVersion < 0) return bad();
    groups = normalizeGroups(input.groups); planVersion = input.planVersion;
    if (!groups) return bad();
    snapshot = facts ? JSON.parse(facts.snapshot_json) : await captureGlobalFactSources(env, ownerId, projectId);
  }
  if (!snapshot || !Number.isSafeInteger(planVersion)) return bad();
  const serialized = JSON.stringify(groups);
  if (facts?.revision === input.revision + 1 && facts.groups_json === serialized && facts.source_job_id === sourceJobId && facts.mode === mode && plan?.version >= planVersion + 1 && await globalFactSourcesCurrent(env, ownerId, projectId, snapshot)) return Response.json({ revision: facts.revision, planVersion: planVersion + 1 });
  if (!plan || plan.version !== planVersion || (facts?.revision || 0) !== input.revision || !await globalFactSourcesCurrent(env, ownerId, projectId, snapshot)) return conflict();
  if (facts && facts.groups_json === serialized && facts.mode === mode && facts.snapshot_json === JSON.stringify(snapshot)) return Response.json({ revision: facts.revision, planVersion });
  const token = crypto.randomUUID(), now = new Date().toISOString(), guard = globalFactGuard(snapshot, projectId, ownerId), own = 'EXISTS (SELECT 1 FROM project_technical_plans WHERE project_id = ? AND mutation_token = ?)';
  const batch = await env.DB.batch([
    env.DB.prepare(`UPDATE project_technical_plans SET version = version + 1, mutation_token = ?, updated_at = ? WHERE project_id = ? AND version = ? AND COALESCE((SELECT revision FROM project_global_facts WHERE project_id = ?), 0) = ? AND ${guard.sql}`).bind(token, now, projectId, planVersion, projectId, input.revision, ...guard.args),
    env.DB.prepare(`INSERT INTO project_global_facts (project_id, revision, groups_json, snapshot_json, source_job_id, updated_at, mode) SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${own} ON CONFLICT(project_id) DO UPDATE SET revision = excluded.revision, groups_json = excluded.groups_json, snapshot_json = excluded.snapshot_json, source_job_id = excluded.source_job_id, updated_at = excluded.updated_at, mode = excluded.mode`).bind(projectId, input.revision + 1, serialized, JSON.stringify(snapshot), sourceJobId, now, mode, projectId, token),
    env.DB.prepare(`UPDATE project_technical_plan_nodes SET content = '', status = 'idle', plan_json = NULL, updated_at = ? WHERE project_id = ? AND ${own}`).bind(now, projectId, projectId, token),
  ]);
  if (batch[0].meta.changes === 1) return Response.json({ revision: input.revision + 1, planVersion: planVersion + 1 });
  const prior = await env.DB.prepare(`SELECT revision, groups_json, source_job_id, mode FROM project_global_facts WHERE project_id = ? AND ${guard.sql}`).bind(projectId, ...guard.args).first();
  return prior?.revision === input.revision + 1 && prior.groups_json === serialized && prior.source_job_id === sourceJobId && prior.mode === mode ? Response.json({ revision: prior.revision, planVersion: planVersion + 1 }) : conflict();
}
