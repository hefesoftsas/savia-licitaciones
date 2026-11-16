import { knowledgeFingerprintSql, readKnowledgeSources } from './knowledge-sources.js';
import { captureRequirementSources, sourceGuard } from './requirement-sources.js';
const outlineSql = "SELECT json_group_array(json_array(node_id, parent_node_id, sort_order, title, description, content_mode, COALESCE(attr,''))) AS fingerprint FROM (SELECT * FROM project_technical_plan_nodes WHERE project_id = ? ORDER BY node_id)";
const analysesSql = 'SELECT json_group_array(json_array(category, revision, job_id)) AS fingerprint FROM (SELECT category, revision, job_id FROM project_technical_analyses WHERE project_id = ? ORDER BY category)';
export async function captureGlobalFactSources(env, ownerId, projectId, includeRup = false, knowledgeIds = []) {
  const [source, data] = await Promise.all([captureRequirementSources(env, ownerId, projectId, includeRup), env.DB.batch([env.DB.prepare(outlineSql).bind(projectId), env.DB.prepare(analysesSql).bind(projectId)])]);
  if (!source) return null;
  const { facts, ...sources } = source;
  const knowledge = knowledgeIds.length ? await readKnowledgeSources(env, ownerId, knowledgeIds) : [];
  return { sources, outlineFingerprint: data[0].results[0].fingerprint, analysesFingerprint: data[1].results[0].fingerprint, ...(knowledgeIds.length ? { knowledgeIds, knowledgeFingerprint: JSON.stringify(knowledge.map(({ id, revision }) => [id, revision])) } : {}) };
}
export function globalFactGuard(snapshot, projectId, ownerId) {
  const sources = sourceGuard(snapshot.sources, projectId, ownerId);
  const knowledge = Array.isArray(snapshot.knowledgeIds) && snapshot.knowledgeIds.length ? { sql: ` AND (${knowledgeFingerprintSql}) = ?`, args: [ownerId, JSON.stringify(snapshot.knowledgeIds), snapshot.knowledgeFingerprint] } : { sql: '', args: [] };
  return { sql: `${sources.sql} AND (${outlineSql}) = ? AND (${analysesSql}) = ?${knowledge.sql}`, args: [...sources.args, projectId, snapshot.outlineFingerprint, projectId, snapshot.analysesFingerprint, ...knowledge.args] };
}
export async function globalFactSourcesCurrent(env, ownerId, projectId, snapshot) {
  if (!snapshot?.sources || typeof snapshot.outlineFingerprint !== 'string' || typeof snapshot.analysesFingerprint !== 'string') return false;
  const guard = globalFactGuard(snapshot, projectId, ownerId);
  return Boolean(await env.DB.prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.args).first());
}
