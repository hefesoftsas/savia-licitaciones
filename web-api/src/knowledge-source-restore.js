import { cleanupDesktopUploads, uploadLeaseMs } from './desktop-file-cleanup.js';

const missing = () => Response.json({ error: 'not_found' }, { status: 404 });
const conflict = () => Response.json({ error: 'source_conflict' }, { status: 409 });
const bad = error => Response.json({ error }, { status: 400 });
const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');

export async function restoreKnowledgeSource(request, env, ownerId, documentId) {
 if (request.method !== 'PUT') return new Response('Method not allowed', { status: 405 });
 if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
 let name; try { name = decodeURIComponent(request.headers.get('x-file-name') || '').trim(); } catch { return bad('invalid_name'); }
 if (!name || name.length > 255 || /[\x00-\x1f\x7f]/.test(name)) return bad('invalid_name');
 if (Number(request.headers.get('content-length') || 0) > 25 * 1024 * 1024) return bad('invalid_size');
 const data = await request.arrayBuffer(); if (!data.byteLength || data.byteLength > 25 * 1024 * 1024) return bad('invalid_size');
 const contentType = (request.headers.get('content-type') || 'application/octet-stream').slice(0, 200);
 const contentHash = await hash(new TextEncoder().encode(JSON.stringify({ name, contentType, bytes: await hash(data) })));
 const lookup = () => env.DB.prepare('SELECT d.id, d.deleting, d.missing_reason, d.object_key, r.object_key AS restored_key, r.content_hash FROM knowledge_documents d LEFT JOIN knowledge_source_restores r ON r.document_id = d.id AND r.owner_id = d.owner_id WHERE d.id = ? AND d.owner_id = ?').bind(documentId, ownerId).first();
 const responseFor = row => !row || row.deleting ? missing() : !row.missing_reason && row.restored_key === row.object_key && row.content_hash === contentHash ? Response.json({ restored: true }) : conflict();
 const before = await lookup(); if (!before || before.deleting) return missing(); if (!before.missing_reason) return responseFor(before);
 const mutation = crypto.randomUUID(), key = `knowledge/${crypto.randomUUID()}`, now = new Date().toISOString();
 await env.DB.prepare("INSERT INTO desktop_file_staging (id, owner_id, object_key, state, lease_until, created_at) VALUES (?, ?, ?, 'writing', ?, ?)").bind(mutation, ownerId, key, Date.now() + uploadLeaseMs, Date.now()).run();
 const release = async () => { try { await env.DB.prepare("UPDATE desktop_file_staging SET state = 'cleanup', lease_until = 0 WHERE id = ? AND owner_id = ? AND state IN ('writing', 'watching')").bind(mutation, ownerId).run(); await cleanupDesktopUploads(env, ownerId); } catch { /* Staging remains eligible for retry. */ } };
 try {
  await env.FILES.put(key, data); await env.DB.prepare('UPDATE desktop_file_staging SET writer_done = 1 WHERE id = ? AND owner_id = ?').bind(mutation, ownerId).run();
  const result = await env.DB.batch([
   env.DB.prepare("UPDATE knowledge_documents SET object_key = ?, size = ?, content_type = ?, missing_reason = NULL WHERE id = ? AND owner_id = ? AND deleting = 0 AND missing_reason IS NOT NULL AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND lease_until > ?)").bind(key, data.byteLength, contentType, documentId, ownerId, mutation, ownerId, Date.now()),
   env.DB.prepare('INSERT INTO knowledge_source_restores (document_id, owner_id, object_key, content_hash, file_name, content_type, mutation_id, created_at) SELECT id, owner_id, ?, ?, ?, ?, ?, ? FROM knowledge_documents WHERE id = ? AND owner_id = ? AND object_key = ?').bind(key, contentHash, name, contentType, mutation, now, documentId, ownerId, key),
   env.DB.prepare("DELETE FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND EXISTS (SELECT 1 FROM knowledge_source_restores WHERE document_id = ? AND owner_id = ? AND mutation_id = ?)").bind(mutation, ownerId, documentId, ownerId, mutation),
  ]);
  if (result[0].meta.changes) return Response.json({ restored: true });
 } catch (error) { await release(); throw error; }
 await release(); return responseFor(await lookup());
}
