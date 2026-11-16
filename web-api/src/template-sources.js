import { sourceGuard } from './requirement-sources.js';
export const chaptersSql = `SELECT json_group_array(json_array(node_id, title, description, content_mode, COALESCE(attr, ''))) AS fingerprint FROM (SELECT n.* FROM project_technical_plan_nodes n WHERE n.project_id = ? AND n.parent_node_id IS NULL AND n.content_mode = 'template-fill' AND NOT EXISTS (SELECT 1 FROM project_technical_plan_nodes c WHERE c.project_id = n.project_id AND c.parent_node_id = n.node_id) ORDER BY n.node_id)`;
export async function chapterFingerprint(env, projectId) { return (await env.DB.prepare(chaptersSql).bind(projectId).first()).fingerprint; }
export function templateGuard(snapshot, fingerprint, projectId, ownerId, jobId, revision) {
  const source = sourceGuard(snapshot, projectId, ownerId);
  return { sql: `${source.sql} AND (${chaptersSql}) = ? AND EXISTS (SELECT 1 FROM project_selected_templates s JOIN job_artifacts a ON a.job_id = s.job_id WHERE s.project_id = ? AND s.job_id = ? AND s.revision = ? AND a.deleted_at IS NULL)`, args: [...source.args, projectId, fingerprint, projectId, jobId, revision] };
}
export function unselectedTemplateGuard(snapshot, fingerprint, projectId, ownerId, jobId) {
  const source = sourceGuard(snapshot, projectId, ownerId);
  return { sql: `${source.sql} AND (${chaptersSql}) = ? AND EXISTS (SELECT 1 FROM job_artifacts a JOIN jobs j ON j.id = a.job_id WHERE j.id = ? AND j.project_id = ? AND j.owner_id = ? AND j.kind = 'technical-plan.extract-template' AND j.state = 'succeeded' AND a.deleted_at IS NULL)`, args: [...source.args, projectId, fingerprint, jobId, projectId, ownerId] };
}
export function templateValuesGuard(snapshot, fingerprint, projectId, ownerId, jobId, revision, valuesRevision) {
  const base = templateGuard(snapshot, fingerprint, projectId, ownerId, jobId, revision);
  return { sql: `${base.sql} AND COALESCE((SELECT revision FROM project_template_values WHERE project_id = ? AND job_id = ?), 0) = ?`, args: [...base.args, projectId, jobId, valuesRevision] };
}
