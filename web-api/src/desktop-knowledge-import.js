import { cleanupDesktopUploads, uploadLeaseMs } from './desktop-file-cleanup.js';

const bad = () => Response.json({ error: 'invalid_knowledge_import' }, { status: 400 });
const missing = () => Response.json({ error: 'not_found' }, { status: 404 });
const removed = () => Response.json({ error: 'removed' }, { status: 410 });
const conflict = () => Response.json({ error: 'knowledge_import_conflict' }, { status: 409 });
const text = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || !!value.trim());
const sha256 = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), byte => byte.toString(16).padStart(2, '0')).join('');
const hashText = value => sha256(new TextEncoder().encode(value));
const validPath = (requestId, sourceKey) => /^[A-Za-z0-9._:-]{1,128}$/.test(requestId) && /^[a-f0-9]{64}$/.test(sourceKey);

export async function importKnowledgeFolder(request, env, runner, requestId, sourceKey) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 if (!validPath(requestId, sourceKey)) return bad();
 let input; try { input = await request.json(); } catch { return bad(); }
 if (!input || !text(input.sourceId, 256, true) || await hashText(input.sourceId) !== sourceKey || !text(input.name, 300, true) || !text(input.createdAt, 100, true)) return bad();
 const body = JSON.stringify({ sourceId: input.sourceId, name: input.name, createdAt: input.createdAt }), hash = await hashText(body);
 const lookup = () => env.DB.prepare('SELECT i.folder_id, i.content_hash, f.id AS present FROM desktop_knowledge_folder_imports i LEFT JOIN knowledge_folders f ON f.id = i.folder_id AND f.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ? AND i.source_key = ?').bind(runner.ownerId, requestId, sourceKey).first();
 const responseFor = row => !row || row.content_hash !== hash ? conflict() : row.present ? Response.json({ folderId: row.folder_id }) : removed();
 const previous = await lookup(); if (previous) return responseFor(previous);
 const id = crypto.randomUUID(), mutation = crypto.randomUUID(), now = new Date().toISOString();
 const result = await env.DB.batch([
  env.DB.prepare('INSERT INTO knowledge_folders (id, owner_id, name, created_at, sort_order) SELECT ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM knowledge_folders WHERE owner_id = ?) WHERE NOT EXISTS (SELECT 1 FROM desktop_knowledge_folder_imports WHERE owner_id = ? AND request_id = ? AND source_key = ?)').bind(id, runner.ownerId, input.name, input.createdAt, runner.ownerId, runner.ownerId, requestId, sourceKey),
  env.DB.prepare('INSERT INTO desktop_knowledge_folder_imports (owner_id, request_id, source_key, folder_id, content_hash, mutation_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM knowledge_folders WHERE id = ? AND owner_id = ?) ON CONFLICT(owner_id, request_id, source_key) DO NOTHING').bind(runner.ownerId, requestId, sourceKey, id, hash, mutation, now, id, runner.ownerId),
  env.DB.prepare('DELETE FROM knowledge_folders WHERE id = ? AND owner_id = ? AND NOT EXISTS (SELECT 1 FROM desktop_knowledge_folder_imports WHERE owner_id = ? AND request_id = ? AND source_key = ? AND mutation_id = ?)').bind(id, runner.ownerId, runner.ownerId, requestId, sourceKey, mutation),
 ]);
 return result[1].meta.changes ? Response.json({ folderId: id }, { status: 201 }) : responseFor(await lookup());
}

export async function importKnowledgeDocument(request, env, runner, requestId, sourceKey) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 if (!validPath(requestId, sourceKey) || Number(request.headers.get('content-length') || 0) > 29 * 1024 * 1024) return bad();
 let form, input; try { form = await request.formData(); input = JSON.parse(form.get('metadata')); } catch { return bad(); }
 const file = form.get('file');
 const noFile = !file;
 if (!input || !text(input.sourceId, 256, true) || await hashText(input.sourceId) !== sourceKey || !text(input.folderSourceId, 256, true) || !text(input.name, 255, true) || !text(input.createdAt, 100, true) || !Array.isArray(input.items) || input.items.length > 500 || (noFile ? !['not_found', 'unsafe_path', 'empty', 'too_large'].includes(input.missingReason) : typeof file === 'string' || !file.size || file.size > 25 * 1024 * 1024)) return bad();
 if (input.restoredName !== undefined && (noFile || !text(input.restoredName,255,true) || /[\x00-\x1f\x7f]/.test(input.restoredName))) return bad();
 const ids = new Set();
 for (const item of input.items) {
  if (!item || !text(item.id, 256, true) || ids.has(item.id) || !text(item.title, 20000) || !text(item.summary, 200000) || !text(item.content, 1_000_000) || !text(item.source, 4096)) return bad(); ids.add(item.id);
 }
 const itemsJson = JSON.stringify(input.items.map(({ id, title, summary, content, source }) => ({ id, title, summary, content, source })));
 if (itemsJson.length > 3_000_000) return Response.json({ error: 'too_large' }, { status: 413 });
 const data = noFile ? null : await file.arrayBuffer(), contentType = text(input.contentType, 200, true) ? input.contentType : 'application/octet-stream';
 const hash = await hashText(JSON.stringify({ sourceId: input.sourceId, folderSourceId: input.folderSourceId, name: input.name, createdAt: input.createdAt, contentType, items: JSON.parse(itemsJson), fileHash: data ? await sha256(data) : null, ...(noFile ? { missingReason: input.missingReason } : {}), ...(input.restoredName !== undefined ? { restoredName: input.restoredName } : {}) }));
 const restoredHash = input.restoredName !== undefined ? await hashText(JSON.stringify({ name: input.restoredName, contentType, bytes: await sha256(data) })) : null;
 const lookup = () => env.DB.prepare('SELECT i.document_id, i.content_hash, d.id AS present, d.deleting FROM desktop_knowledge_document_imports i LEFT JOIN knowledge_documents d ON d.id = i.document_id AND d.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ? AND i.source_key = ?').bind(runner.ownerId, requestId, sourceKey).first();
 const responseFor = row => !row || row.content_hash !== hash ? conflict() : row.present && !row.deleting ? Response.json({ documentId: row.document_id }) : removed();
 const previous = await lookup(); if (previous) return responseFor(previous);
 const folderKey = await hashText(input.folderSourceId), folder = await env.DB.prepare('SELECT i.folder_id, f.id AS present FROM desktop_knowledge_folder_imports i LEFT JOIN knowledge_folders f ON f.id = i.folder_id AND f.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ? AND i.source_key = ?').bind(runner.ownerId, requestId, folderKey).first();
 if (!folder) return missing(); if (!folder.present) return removed();
 const id = crypto.randomUUID(), mutation = crypto.randomUUID(), key = noFile ? `missing-knowledge/${id}` : `knowledge/${crypto.randomUUID()}`, now = new Date().toISOString();
 if (data) await env.DB.prepare("INSERT INTO desktop_file_staging (id, owner_id, object_key, state, lease_until, created_at) VALUES (?, ?, ?, 'writing', ?, ?)").bind(mutation, runner.ownerId, key, Date.now() + uploadLeaseMs, Date.now()).run();
 const release = async () => { if (!data) return; try { await env.DB.prepare("UPDATE desktop_file_staging SET state = 'cleanup', lease_until = 0 WHERE id = ? AND owner_id = ? AND state IN ('writing', 'watching')").bind(mutation, runner.ownerId).run(); await cleanupDesktopUploads(env, runner.ownerId); } catch { /* Staging remains eligible for retry. */ } };
 try {
  if (data) { await env.FILES.put(key, data); await env.DB.prepare('UPDATE desktop_file_staging SET writer_done = 1 WHERE id = ? AND owner_id = ?').bind(mutation, runner.ownerId).run(); }
  const own = 'EXISTS (SELECT 1 FROM desktop_knowledge_document_imports WHERE owner_id = ? AND request_id = ? AND source_key = ? AND mutation_id = ?)';
  const result = await env.DB.batch([
   env.DB.prepare("INSERT INTO knowledge_documents (id, folder_id, owner_id, name, content_type, object_key, size, created_at, missing_reason, sort_order) SELECT ?, id, owner_id, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM knowledge_documents WHERE folder_id = ? AND owner_id = ?) FROM knowledge_folders WHERE id = ? AND owner_id = ? AND (? = 1 OR EXISTS (SELECT 1 FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND lease_until > ?)) AND NOT EXISTS (SELECT 1 FROM desktop_knowledge_document_imports WHERE owner_id = ? AND request_id = ? AND source_key = ?)").bind(id, input.name, contentType, key, data?.byteLength || 0, input.createdAt, noFile ? input.missingReason : null, folder.folder_id, runner.ownerId, folder.folder_id, runner.ownerId, noFile ? 1 : 0, mutation, runner.ownerId, Date.now(), runner.ownerId, requestId, sourceKey),
   env.DB.prepare('INSERT INTO desktop_knowledge_document_imports (owner_id, request_id, source_key, document_id, content_hash, mutation_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM knowledge_documents WHERE id = ? AND owner_id = ?) ON CONFLICT(owner_id, request_id, source_key) DO NOTHING').bind(runner.ownerId, requestId, sourceKey, id, hash, mutation, now, id, runner.ownerId),
   env.DB.prepare(`INSERT INTO knowledge_imported_items (document_id, owner_id, items_json) SELECT ?, ?, ? WHERE ${own}`).bind(id, runner.ownerId, itemsJson, runner.ownerId, requestId, sourceKey, mutation),
   env.DB.prepare(`INSERT INTO knowledge_source_restores(document_id,owner_id,object_key,content_hash,file_name,content_type,mutation_id,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ? IS NOT NULL AND ${own}`).bind(id,runner.ownerId,key,restoredHash,input.restoredName ?? null,contentType,mutation,now,restoredHash,runner.ownerId,requestId,sourceKey,mutation),
   env.DB.prepare(`DELETE FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND ${own}`).bind(mutation, runner.ownerId, runner.ownerId, requestId, sourceKey, mutation),
   env.DB.prepare(`DELETE FROM knowledge_documents WHERE id = ? AND owner_id = ? AND NOT ${own}`).bind(id, runner.ownerId, runner.ownerId, requestId, sourceKey, mutation),
  ]);
  if (result[1].meta.changes) return Response.json({ documentId: id }, { status: 201 });
 } catch (error) { await release(); throw error; }
 await release(); const existing = await lookup(); return existing ? responseFor(existing) : conflict();
}

export async function importedKnowledgeItems(request, env, ownerId, documentId) {
 if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
 const row = await env.DB.prepare('SELECT i.items_json FROM knowledge_imported_items i JOIN knowledge_documents d ON d.id = i.document_id AND d.owner_id = i.owner_id WHERE i.document_id = ? AND i.owner_id = ? AND d.deleting = 0').bind(documentId, ownerId).first();
 if (row) return Response.json({ items: JSON.parse(row.items_json) });
 const doc = await env.DB.prepare('SELECT id FROM knowledge_documents WHERE id = ? AND owner_id = ? AND deleting = 0').bind(documentId, ownerId).first();
 return doc ? Response.json({ items: [] }) : missing();
}
