import { captureRequirementSources, sameRequirementSources, sourceGuard } from './requirement-sources.js';
import { analysisCategories } from './technical-analysis.js';

export async function captureOutlineSources(env, ownerId, projectId, fileIds, planVersion) {
  const current = await captureRequirementSources(env, ownerId, projectId, false);
  const rows = await env.DB.prepare('SELECT a.category, a.revision, COALESCE(a.job_id, a.review_id) AS job_id, a.source_snapshot_json, CASE WHEN a.job_id IS NOT NULL THEN j.payload_json ELSE json_object(\'fileIds\', json(a.source_file_ids_json)) END AS payload_json FROM project_technical_analyses a LEFT JOIN jobs j ON j.id = a.job_id WHERE a.project_id = ?').bind(projectId).all();
  const expectedFiles = JSON.stringify([...fileIds].sort());
  if (rows.results.length !== analysisCategories.length || rows.results.some(row => !analysisCategories.includes(row.category) || !sameRequirementSources(JSON.parse(row.source_snapshot_json), current) || JSON.stringify([...(JSON.parse(row.payload_json).fileIds || [])].sort()) !== expectedFiles)) return null;
  const { facts, ...sources } = current;
  return { sources, planVersion, analyses: rows.results.map(row => ({ category: row.category, revision: row.revision, jobId: row.job_id })).sort((a, b) => a.category.localeCompare(b.category)) };
}
export function outlineGuard(snapshot, projectId, ownerId) {
  const source = sourceGuard(snapshot.sources, projectId, ownerId);
  return { sql: `${source.sql} AND EXISTS (SELECT 1 FROM project_technical_plans WHERE project_id = ? AND version = ?) AND ${snapshot.analyses.map(() => 'EXISTS (SELECT 1 FROM project_technical_analyses WHERE project_id = ? AND category = ? AND revision = ? AND COALESCE(job_id, review_id) = ?)').join(' AND ')}`,
    args: [...source.args, projectId, snapshot.planVersion, ...snapshot.analyses.flatMap(item => [projectId, item.category, item.revision, item.jobId])] };
}
export async function outlineSnapshotCurrent(env, ownerId, projectId, snapshot) {
  if (!snapshot?.sources || !Number.isSafeInteger(snapshot.planVersion) || !Array.isArray(snapshot.analyses) || snapshot.analyses.length !== analysisCategories.length || new Set(snapshot.analyses.map(item => item.category)).size !== analysisCategories.length || snapshot.analyses.some(item => !analysisCategories.includes(item.category) || !Number.isSafeInteger(item.revision) || typeof item.jobId !== 'string')) return false;
  const guard = outlineGuard(snapshot, projectId, ownerId);
  return Boolean(await env.DB.prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.args).first());
}
export function expandedOutlineGuard(snapshot, projectId, ownerId, selectionRevision, selectionJobId) {
  const base = outlineGuard(snapshot, projectId, ownerId);
  return { sql: `${base.sql} AND EXISTS (SELECT 1 FROM project_outline_root_selections s JOIN jobs j ON j.id=s.job_id WHERE s.project_id = ? AND s.revision = ? AND s.job_id = ? AND COALESCE(json_extract(j.result_json,'$.outlineDiscarded'),0)=0)`, args: [...base.args, projectId, selectionRevision, selectionJobId] };
}
