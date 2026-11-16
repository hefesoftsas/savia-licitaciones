export class KnowledgeSnapshotError extends Error {}
const unavailable = () => { throw new KnowledgeSnapshotError('Las referencias de conocimiento no están disponibles para esta cuenta.'); };

export async function readReferencedKnowledge(env, owner, ids) {
  if (!Array.isArray(ids) || ids.length > 1000 || ids.some(id=>typeof id!=='string' || !id || id.length>128) || new Set(ids).size !== ids.length) unavailable();
  if (!ids.length) return {folders:[],documents:[],indices:[],entries:[]};
  const selected = `SELECT DISTINCT d.id FROM knowledge_entries e JOIN knowledge_documents d ON d.id=e.document_id AND d.owner_id=e.owner_id JOIN knowledge_indices i ON i.document_id=d.id AND i.owner_id=d.owner_id JOIN knowledge_folders f ON f.id=d.folder_id AND f.owner_id=d.owner_id WHERE e.owner_id=? AND e.id IN (SELECT value FROM json_each(?)) AND d.deleting=0 AND d.missing_reason IS NULL`;
  const args = [owner,JSON.stringify(ids)];
  const [folders,documents,indices,entries] = await env.DB.batch([
    env.DB.prepare(`SELECT f.id,f.name,f.created_at,f.sort_order FROM knowledge_folders f WHERE f.owner_id=? AND f.id IN (SELECT d.folder_id FROM knowledge_documents d WHERE d.id IN (${selected}) AND d.owner_id=?) ORDER BY f.id`).bind(owner,...args,owner),
    env.DB.prepare(`SELECT d.id,d.folder_id,d.name,d.content_type,d.object_key,d.size,d.created_at,d.sort_order FROM knowledge_documents d WHERE d.owner_id=? AND d.id IN (${selected}) ORDER BY d.id`).bind(owner,...args),
    env.DB.prepare(`SELECT i.document_id,i.revision FROM knowledge_indices i WHERE i.owner_id=? AND i.document_id IN (${selected}) ORDER BY i.document_id`).bind(owner,...args),
    env.DB.prepare(`SELECT e.id,e.document_id,e.title,e.summary,e.quote,e.sort_order FROM knowledge_entries e WHERE e.owner_id=? AND e.document_id IN (${selected}) ORDER BY e.document_id,e.sort_order,e.id`).bind(owner,...args),
  ]);
  const returned = new Set(entries.results.map(row=>row.id));
  if (ids.some(id=>!returned.has(id)) || documents.results.length > 1000 || entries.results.length > 10000) unavailable();
  return {folders:folders.results,documents:documents.results,indices:indices.results,entries:entries.results};
}
