import { cleanupDesktopUploads } from './desktop-file-cleanup.js';
const bad = () => Response.json({ error: 'invalid_plan' }, { status: 400 });
function normalized(input) {
 if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 300 || !Array.isArray(input.nodes) || input.nodes.length > 500) return null;
 const ids = new Set(), nodes = [];
 for (const row of input.nodes) {
  if (!row || typeof row.id !== 'string' || !row.id.trim() || row.id.length > 128 || ids.has(row.id) || (row.parentId !== null && (typeof row.parentId !== 'string' || !row.parentId.trim() || row.parentId.length > 128)) || !Number.isSafeInteger(row.sortOrder) || row.sortOrder < 0) return null;
  for (const [key, max] of [['title', 300], ['description', 2000], ['content', 1_000_000], ['contentMode', 100], ['contentModeNote', 2000], ['sourceRequirementId', 128], ['sourceRequirementTitle', 300]]) if (typeof row[key] !== 'string' || row[key].length > max || (key === 'title' && !row[key].trim())) return null;
  if (Object.hasOwn(row,'attr') && row.attr !== null && !['通用','商务/资信','技术','其他','目录','报价','业绩'].includes(row.attr)) return null;
  if (Object.hasOwn(row,'knowledgeItemIds') && (!Array.isArray(row.knowledgeItemIds) || row.knowledgeItemIds.length>1000 || row.knowledgeItemIds.some(id=>typeof id!=='string' || !id || id.length>128) || new Set(row.knowledgeItemIds).size!==row.knowledgeItemIds.length)) return null;
  ids.add(row.id); nodes.push({ id: row.id, parentId: row.parentId, sortOrder: row.sortOrder, title: row.title, description: row.description, content: row.content, contentMode: row.contentMode || 'manual-fill', contentModeNote: row.contentModeNote, sourceRequirementId: row.sourceRequirementId, sourceRequirementTitle: row.sourceRequirementTitle, ...(Object.hasOwn(row,'attr')?{attr:row.attr}:{}), ...(Object.hasOwn(row,'knowledgeItemIds')?{knowledgeItemIds:row.knowledgeItemIds}:{}) });
 }
 const byId = new Map(nodes.map(node => [node.id, node]));
 for (const node of nodes) { let parent = node.parentId, depth = 1; const visited = new Set([node.id]); while (parent !== null) { if (!byId.has(parent) || visited.has(parent) || ++depth > 10) return null; visited.add(parent); parent = byId.get(parent).parentId; } node.depth = depth; }
 nodes.sort((a, b) => a.depth - b.depth || a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
 return { title: input.title.trim(), nodes };
}
export async function importDesktopPlan(request, env, runner) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 const requestId = request.headers.get('idempotency-key') || ''; if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) return bad();
 let input; try { input = await request.json(); } catch { return bad(); }
 const data = normalized(input); if (!data) return bad();
 const body = JSON.stringify(data); if (body.length > 3_000_000) return Response.json({ error: 'plan_too_large' }, { status: 413 });
 await cleanupDesktopUploads(env, runner.ownerId);
 const hashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
 const hash = Array.from(new Uint8Array(hashBytes), byte => byte.toString(16).padStart(2, '0')).join('');
 const id = crypto.randomUUID(), mutation = crypto.randomUUID(), now = new Date().toISOString();
 const knowledgeIds = [...new Set(data.nodes.flatMap(node=>node.knowledgeItemIds || []))];
 const own = 'EXISTS (SELECT 1 FROM desktop_plan_imports WHERE owner_id = ? AND request_id = ? AND mutation_id = ?)';
 const result = await env.DB.batch([
  env.DB.prepare("INSERT INTO desktop_plan_imports (owner_id, request_id, request_hash, project_id, mutation_id, created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM json_each(?) selected WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries e JOIN knowledge_documents d ON d.id=e.document_id AND d.owner_id=e.owner_id JOIN knowledge_indices i ON i.document_id=d.id AND i.owner_id=d.owner_id WHERE e.id=selected.value AND e.owner_id=? AND d.deleting=0 AND d.missing_reason IS NULL)) ON CONFLICT(owner_id, request_id) DO NOTHING").bind(runner.ownerId, requestId, hash, id, mutation, now, JSON.stringify(knowledgeIds), runner.ownerId),
  env.DB.prepare(`INSERT INTO projects (id, owner_id, title, created_at) SELECT ?, ?, ?, ? WHERE ${own}`).bind(id, runner.ownerId, data.title, now, runner.ownerId, requestId, mutation),
  env.DB.prepare(`INSERT INTO project_technical_plans (project_id, version, updated_at) SELECT ?, 1, ? WHERE ${own}`).bind(id, now, runner.ownerId, requestId, mutation),
  env.DB.prepare(`INSERT INTO project_technical_plan_nodes (project_id, node_id, parent_node_id, sort_order, title, description, content_mode, content_mode_note, source_requirement_id, source_requirement_title, content, status, created_at, updated_at, attr, knowledge_item_ids_json) SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.parentId'), json_extract(value, '$.sortOrder'), json_extract(value, '$.title'), json_extract(value, '$.description'), json_extract(value, '$.contentMode'), NULLIF(json_extract(value, '$.contentModeNote'), ''), NULLIF(json_extract(value, '$.sourceRequirementId'), ''), NULLIF(json_extract(value, '$.sourceRequirementTitle'), ''), json_extract(value, '$.content'), CASE WHEN length(trim(json_extract(value, '$.content'))) > 0 THEN 'success' ELSE 'idle' END, ?, ?, json_extract(value, '$.attr'), json_extract(value, '$.knowledgeItemIds') FROM json_each(?) WHERE ${own} ORDER BY json_extract(value, '$.depth'), json_extract(value, '$.sortOrder'), json_extract(value, '$.id')`).bind(id, now, now, JSON.stringify(data.nodes), runner.ownerId, requestId, mutation),
 ]);
 if (result[0].meta.changes) return Response.json({ project: { id, title: data.title, createdAt: now } }, { status: 201 });
 const previous = await env.DB.prepare('SELECT i.request_hash, p.id, p.title, p.created_at FROM desktop_plan_imports i JOIN projects p ON p.id = i.project_id AND p.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ?').bind(runner.ownerId, requestId).first();
 return previous?.request_hash === hash ? Response.json({ project: { id: previous.id, title: previous.title, createdAt: previous.created_at } }) : Response.json({ error: 'idempotency_conflict' }, { status: 409 });
}
