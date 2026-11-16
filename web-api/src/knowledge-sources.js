const rowsSql = `SELECT e.id, i.revision, e.title, e.summary, e.quote, d.id AS documentId, d.name AS documentName FROM knowledge_entries e JOIN knowledge_documents d ON d.id = e.document_id AND d.owner_id = e.owner_id AND d.deleting = 0 AND d.missing_reason IS NULL JOIN knowledge_indices i ON i.document_id = e.document_id AND i.owner_id = e.owner_id WHERE e.owner_id = ? AND e.id IN (SELECT value FROM json_each(?)) ORDER BY e.id`;
export const knowledgeFingerprintSql = `SELECT json_group_array(json_array(id, revision)) AS fingerprint FROM (${rowsSql})`;
export async function readKnowledgeSources(env, ownerId, ids) {
 const rows = await env.DB.prepare(rowsSql).bind(ownerId, JSON.stringify(ids)).all();
 return rows.results;
}
export function selectionFingerprint(selections) { return JSON.stringify([...selections].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(({ id, revision }) => [id, revision])); }
export function validKnowledgeSelections(selections, consent) {
 return Array.isArray(selections) && selections.length <= 30 && !selections.some(item => !item || typeof item.id !== 'string' || !item.id || item.id.length > 128 || !Number.isSafeInteger(item.revision) || item.revision < 1) && new Set(selections.map(item => item.id)).size === selections.length && (!selections.length || consent === true);
}
export function knowledgeSnapshotGuard(snapshot, ownerId) {
 if (!snapshot?.ids?.length) return { sql: '1 = 1', args: [] };
 return { sql: `(${knowledgeFingerprintSql}) = ?`, args: [ownerId, JSON.stringify(snapshot.ids), snapshot.fingerprint] };
}
export async function knowledgeSnapshotCurrent(env, ownerId, snapshot) {
 const guard = knowledgeSnapshotGuard(snapshot, ownerId);
 return Boolean(await env.DB.prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.args).first());
}
