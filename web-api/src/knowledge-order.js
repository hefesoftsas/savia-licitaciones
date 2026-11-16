const bad = () => Response.json({ error: 'invalid_order' }, { status: 400 });
const conflict = () => Response.json({ error: 'order_conflict' }, { status: 409 });

export async function reorderKnowledge(request, env, ownerId, folderId = null) {
 if (request.method !== 'PUT') return new Response('Method not allowed', { status: 405 });
 if (folderId && !await env.DB.prepare('SELECT id FROM knowledge_folders WHERE id = ? AND owner_id = ?').bind(folderId, ownerId).first()) return Response.json({ error: 'not_found' }, { status: 404 });
 let input; try { input = await request.json(); } catch { return bad(); }
 const { before, after } = input || {};
 if (!Array.isArray(before) || !Array.isArray(after) || before.length > 2000 || before.length !== after.length || before.some(id => typeof id !== 'string' || !id || id.length > 256) || after.some(id => typeof id !== 'string' || !id || id.length > 256) || new Set(before).size !== before.length || new Set(after).size !== after.length || before.some(id => !after.includes(id))) return bad();
 const token = crypto.randomUUID(), scope = folderId ? `documents:${folderId}` : 'folders';
 const currentSql = folderId ? 'SELECT json_group_array(id) AS ids FROM (SELECT id FROM knowledge_documents WHERE owner_id = ? AND folder_id = ? ORDER BY sort_order, created_at DESC, id)' : 'SELECT json_group_array(id) AS ids FROM (SELECT id FROM knowledge_folders WHERE owner_id = ? ORDER BY sort_order, created_at, id)';
 const insert = folderId
  ? env.DB.prepare(`INSERT INTO knowledge_order_mutations (id, owner_id, scope) SELECT ?, ?, ? WHERE (${currentSql}) = ?`).bind(token, ownerId, scope, ownerId, folderId, JSON.stringify(before))
  : env.DB.prepare(`INSERT INTO knowledge_order_mutations (id, owner_id, scope) SELECT ?, ?, ? WHERE (${currentSql}) = ?`).bind(token, ownerId, scope, ownerId, JSON.stringify(before));
 const update = folderId
  ? env.DB.prepare("UPDATE knowledge_documents SET sort_order = (SELECT CAST(key AS INTEGER) FROM json_each(?) WHERE value = knowledge_documents.id) WHERE owner_id = ? AND folder_id = ? AND id IN (SELECT value FROM json_each(?)) AND EXISTS (SELECT 1 FROM knowledge_order_mutations WHERE id = ? AND owner_id = ? AND scope = ?)").bind(JSON.stringify(after), ownerId, folderId, JSON.stringify(after), token, ownerId, scope)
  : env.DB.prepare("UPDATE knowledge_folders SET sort_order = (SELECT CAST(key AS INTEGER) FROM json_each(?) WHERE value = knowledge_folders.id) WHERE owner_id = ? AND id IN (SELECT value FROM json_each(?)) AND EXISTS (SELECT 1 FROM knowledge_order_mutations WHERE id = ? AND owner_id = ? AND scope = ?)").bind(JSON.stringify(after), ownerId, JSON.stringify(after), token, ownerId, scope);
 const result = await env.DB.batch([insert, update, env.DB.prepare('DELETE FROM knowledge_order_mutations WHERE id = ? AND owner_id = ? AND scope = ?').bind(token, ownerId, scope)]);
 return result[0].meta.changes ? Response.json({ ordered: true }) : conflict();
}
