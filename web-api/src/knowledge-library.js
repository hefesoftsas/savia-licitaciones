import { restoreKnowledgeSource } from './knowledge-source-restore.js';
import { reorderKnowledge } from './knowledge-order.js';

const notFound = () => Response.json({ error: 'not_found' }, { status: 404 });
const bad = error => Response.json({ error }, { status: 400 });
const folderView = row => ({ id: row.id, name: row.name, createdAt: row.created_at });
const documentView = row => ({ id: row.id, folderId: row.folder_id, name: row.name, contentType: row.content_type, size: row.size, createdAt: row.created_at, deleting: !!row.deleting, sourceAvailable: !row.missing_reason, missingReason: row.missing_reason ?? null, attachedName: row.restored_name ?? null });
const docColumns = 'id, folder_id, name, content_type, object_key, size, created_at, deleting, missing_reason, (SELECT file_name FROM knowledge_source_restores WHERE document_id = knowledge_documents.id AND owner_id = knowledge_documents.owner_id) AS restored_name';

export async function knowledgeLibrary(request, env, ownerId) {
  const url = new URL(request.url), path = url.pathname;
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  if (path === '/api/knowledge/folders/order') return reorderKnowledge(request, env, ownerId);
  const orderMatch = /^\/api\/knowledge\/folders\/([^/]+)\/documents\/order$/.exec(path);
  if (orderMatch) return reorderKnowledge(request, env, ownerId, orderMatch[1]);
  if (path === '/api/knowledge/folders') {
    if (request.method === 'GET') {
      const result = await env.DB.prepare('SELECT id, name, created_at FROM knowledge_folders WHERE owner_id = ? ORDER BY sort_order, created_at, id').bind(ownerId).all();
      return Response.json({ folders: result.results.map(folderView) });
    }
    if (request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return bad('invalid_json'); }
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 300) return bad('invalid_name');
      const row = { id: crypto.randomUUID(), name, created_at: new Date().toISOString() };
      await env.DB.prepare('INSERT INTO knowledge_folders (id, owner_id, name, created_at, sort_order) SELECT ?, ?, ?, ?, COALESCE(MAX(sort_order) + 1, 0) FROM knowledge_folders WHERE owner_id = ?').bind(row.id, ownerId, name, row.created_at, ownerId).run();
      return Response.json({ folder: folderView(row) }, { status: 201 });
    }
  }
  const folderMatch = /^\/api\/knowledge\/folders\/([^/]+)(\/documents)?$/.exec(path);
  if (folderMatch) {
    const folder = await env.DB.prepare('SELECT id FROM knowledge_folders WHERE id = ? AND owner_id = ?').bind(folderMatch[1], ownerId).first();
    if (!folder) return notFound();
    if (!folderMatch[2] && request.method === 'DELETE') {
      const result = await env.DB.prepare('DELETE FROM knowledge_folders WHERE id = ? AND owner_id = ? AND NOT EXISTS (SELECT 1 FROM knowledge_documents WHERE folder_id = ?)').bind(folder.id, ownerId, folder.id).run();
      return result.meta.changes ? Response.json({ deleted: true }) : Response.json({ error: 'folder_not_empty' }, { status: 409 });
    }
    if (folderMatch[2] && request.method === 'GET') {
      const result = await env.DB.prepare(`SELECT ${docColumns} FROM knowledge_documents WHERE folder_id = ? AND owner_id = ? ORDER BY sort_order, created_at DESC, id`).bind(folder.id, ownerId).all();
      return Response.json({ documents: result.results.map(documentView) });
    }
    if (folderMatch[2] && request.method === 'POST') {
      let name; try { name = decodeURIComponent(request.headers.get('x-file-name') || '').trim(); } catch { return bad('invalid_name'); }
      if (!name || name.length > 255) return bad('invalid_name');
      const bytes = await request.arrayBuffer(); if (!bytes.byteLength || bytes.byteLength > 25 * 1024 * 1024) return bad('invalid_size');
      const row = { id: crypto.randomUUID(), folder_id: folder.id, name, content_type: (request.headers.get('content-type') || 'application/octet-stream').slice(0, 200), size: bytes.byteLength, created_at: new Date().toISOString(), deleting: 0 };
      row.object_key = `knowledge/${crypto.randomUUID()}`;
      await env.FILES.put(row.object_key, bytes);
      try {
        const inserted = await env.DB.prepare('INSERT INTO knowledge_documents (id, folder_id, owner_id, name, content_type, object_key, size, created_at, sort_order) SELECT ?, id, owner_id, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM knowledge_documents WHERE folder_id = ? AND owner_id = ?) FROM knowledge_folders WHERE id = ? AND owner_id = ?').bind(row.id, name, row.content_type, row.object_key, row.size, row.created_at, folder.id, ownerId, folder.id, ownerId).run();
        if (!inserted.meta.changes) { await env.FILES.delete(row.object_key); return notFound(); }
      } catch (error) { await env.FILES.delete(row.object_key); throw error; }
      return Response.json({ document: documentView(row) }, { status: 201 });
    }
  }
  if (path === '/api/knowledge/documents' && request.method === 'GET') {
    const query = (url.searchParams.get('q') || '').trim().slice(0, 255);
    const result = await env.DB.prepare(`SELECT ${docColumns} FROM knowledge_documents WHERE owner_id = ? AND instr(lower(name), lower(?)) > 0 ORDER BY created_at DESC, id LIMIT 200`).bind(ownerId, query).all();
    return Response.json({ documents: result.results.map(documentView) });
  }
  const docMatch = /^\/api\/knowledge\/documents\/([^/]+)(\/file)?$/.exec(path);
  if (docMatch) {
    if (request.method === 'PUT' && docMatch[2]) return restoreKnowledgeSource(request, env, ownerId, docMatch[1]);
    const row = await env.DB.prepare(`SELECT ${docColumns} FROM knowledge_documents WHERE id = ? AND owner_id = ?`).bind(docMatch[1], ownerId).first();
    if (!row) return notFound();
    if (request.method === 'GET' && docMatch[2]) {
      if (row.deleting || row.missing_reason) return notFound();
      const object = await env.FILES.get(row.object_key); if (!object) return notFound();
      return new Response(object.body, { headers: { 'content-type': row.content_type, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.restored_name || row.name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,  'x-content-type-options': 'nosniff' } });
    }
    if (request.method === 'GET' && !docMatch[2]) return Response.json({ document: documentView(row) });
    if (request.method === 'DELETE' && !docMatch[2]) {
      const marked = await env.DB.batch([
        env.DB.prepare('UPDATE knowledge_documents SET deleting = 1 WHERE id = ? AND owner_id = ? RETURNING object_key, missing_reason').bind(row.id, ownerId),
        env.DB.prepare("DELETE FROM account_jobs WHERE owner_id = ? AND kind = 'knowledge.analyze' AND json_extract(payload_json, '$.documentId') = ?").bind(ownerId, row.id),
      ]);
      const current = marked[0].results[0]; if (!current) return notFound();
      if (!current.missing_reason) await env.FILES.delete(current.object_key);
      await env.DB.prepare('DELETE FROM knowledge_documents WHERE id = ? AND owner_id = ? AND deleting = 1').bind(row.id, ownerId).run();
      return Response.json({ deleted: true });
    }
  }
  return new Response('Method not allowed', { status: 405 });
}
