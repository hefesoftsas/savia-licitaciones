import { uploadSecopStream } from './secop-stream.js';
import { cleanupDesktopUploads, uploadLeaseMs } from './desktop-file-cleanup.js';

export const maxFileBytes = 50 * 1024 * 1024;
export const fileTypes = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
};

export function sameOrigin(request, env) {
  return request.headers.get('origin') === new URL(env.BETTER_AUTH_URL).origin;
}

export async function projectProcess(env, ownerId, projectId) {
  const row = await env.DB.prepare('SELECT process_json FROM project_secop WHERE project_id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  return row ? JSON.parse(row.process_json) : null;
}

export async function existingFile(env, projectId, documentId) {
  return env.DB.prepare('SELECT f.id, f.name, f.content_type AS contentType, f.size, f.created_at AS createdAt FROM project_secop_files s JOIN project_files f ON f.id = s.file_id WHERE s.project_id = ? AND s.document_id = ?').bind(projectId, documentId).first();
}

export async function cached(env, key, ttl, load, fresh = false) {
  const now = Date.now();
  if (!fresh) {
    const row = await env.DB.prepare('SELECT response_json FROM secop_search_cache WHERE cache_key=? AND expires_at>?').bind(key, now).first();
    if (row) return JSON.parse(row.response_json);
  }
  const result = await load();
  if (result.success) {
    await env.DB.prepare('DELETE FROM secop_search_cache WHERE expires_at<=?').bind(now).run();
    await env.DB.prepare('INSERT INTO secop_search_cache(cache_key,response_json,expires_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET response_json=excluded.response_json,expires_at=excluded.expires_at').bind(key, JSON.stringify(result), now + ttl).run();
  }
  return result;
}

function sanitizeDocumentName(rawName, extension) {
  return (rawName || `documento.${extension}`)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 240) || `documento.${extension}`;
}

export async function storeDownloadedDocument({ env, ownerId, projectId, documentId, name: rawName, extension, body }) {
  const name = sanitizeDocumentName(rawName, extension);
  const file = {
    id: crypto.randomUUID(),
    name,
    contentType: fileTypes[extension],
    size: 0,
    createdAt: new Date().toISOString(),
  };
  const key = `projects/${projectId}/${file.id}`;
  const staging = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)")
    .bind(staging, ownerId, key, now + uploadLeaseMs, now).run();
  let published = false;
  try {
    try {
      file.size = (await uploadSecopStream({ body, bucket: env.FILES, key, extension, maxBytes: maxFileBytes })).size;
    } catch (error) {
      if (error?.code === 'file_too_large') return Response.json({ error: 'file_too_large' }, { status: 413 });
      if (error?.code === 'invalid_file') return Response.json({ error: 'invalid_file' }, { status: 400 });
      return Response.json({ error: 'download_failed' }, { status: 502 });
    }
    await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(staging, ownerId).run();
    try {
      const results = await env.DB.batch([
        env.DB.prepare("INSERT INTO project_files (id,project_id,name,content_type,object_key,size,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND owner_id=?) AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?)")
          .bind(file.id, projectId, name, file.contentType, key, file.size, file.createdAt, projectId, ownerId, staging, ownerId, Date.now()),
        env.DB.prepare('INSERT INTO project_secop_files (project_id,document_id,file_id) SELECT ?,?,id FROM project_files WHERE id=? AND project_id=?')
          .bind(projectId, documentId, file.id, projectId),
        env.DB.prepare("DELETE FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND EXISTS (SELECT 1 FROM project_files WHERE id=? AND project_id=? AND object_key=?)")
          .bind(staging, ownerId, file.id, projectId, key),
      ]);
      if (!results[0].meta.changes) return Response.json({ error: 'project_conflict' }, { status: 409 });
      published = true;
      return Response.json({ file }, { status: 201 });
    } catch (error) {
      const saved = await existingFile(env, projectId, documentId);
      if (saved) return Response.json({ file: saved });
      throw error;
    }
  } finally {
    if (!published) {
      try {
        await env.DB.prepare("UPDATE desktop_file_staging SET writer_done=1,state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')")
          .bind(staging, ownerId).run();
        await cleanupDesktopUploads(env, ownerId);
      } catch {
        /* La limpieza se reintenta después. */
      }
    }
  }
}
