import { cleanupDesktopUploads, uploadLeaseMs } from './desktop-file-cleanup.js';
const bad = () => Response.json({ error: 'invalid_file' }, { status: 400 });
const missing = () => Response.json({ error: 'not_found' }, { status: 404 });
const conflict = () => Response.json({ error: 'source_conflict' }, { status: 409 });
const view = row => ({ id: row.file_id, name: row.name, contentType: row.content_type, size: row.size, createdAt: row.created_at });
export async function importDesktopFile(request, env, runner, requestId, sourceKey) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId) || !/^[a-f0-9]{64}$/.test(sourceKey)) return bad();
 const project = await env.DB.prepare('SELECT p.id FROM desktop_plan_imports i JOIN projects p ON p.id = i.project_id AND p.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ?').bind(runner.ownerId, requestId).first();
 if (!project) return missing();
 let name; try { name = decodeURIComponent(request.headers.get('x-file-name') || ''); } catch { return bad(); }
 const contentType = request.headers.get('content-type') || 'application/octet-stream', expectedHash = request.headers.get('x-content-sha256') || '';
 if (!name.trim() || name.length > 255 || /[\x00-\x1f\x7f]/.test(name) || contentType.length > 200 || !/^[a-f0-9]{64}$/.test(expectedHash)) return bad();
 const streamSize = request.headers.get('x-savia-stream-size');
 let bytes, size, digest;
 if (streamSize !== null) {
  if (!/^[1-9]\d*$/.test(streamSize) || !Number.isSafeInteger(Number(streamSize)) || Number(streamSize) > 50 * 1024 * 1024 || !request.body) return bad();
  size = Number(streamSize); digest = expectedHash;
 } else {
  const length = Number(request.headers.get('content-length') || 0); if (length > 25 * 1024 * 1024) return Response.json({ error: 'file_too_large' }, { status: 413 });
  bytes = await request.arrayBuffer(); if (bytes.byteLength > 25 * 1024 * 1024) return Response.json({ error: 'file_too_large' }, { status: 413 });
  size = bytes.byteLength; digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), item => item.toString(16).padStart(2, '0')).join('');
  if (digest !== expectedHash) return bad();
 }
 const lookup = () => env.DB.prepare('SELECT * FROM desktop_plan_file_imports WHERE owner_id = ? AND request_id = ? AND source_key = ?').bind(runner.ownerId, requestId, sourceKey).first();
 const matches = row => row && row.content_hash === digest && row.name === name && row.content_type === contentType && row.size === size;
 const responseForPrior = async row => {
  if (!matches(row)) return conflict();
  const removed = await env.DB.prepare('SELECT 1 AS present FROM project_file_deletions WHERE id = ? AND project_id = ?').bind(row.file_id, row.project_id).first();
  return removed ? Response.json({ error: 'file_removed' }, { status: 410 }) : Response.json({ file: view(row) });
 };
 const prior = await lookup();
 if (prior) {
  if (streamSize !== null) {
   const checksum = new crypto.DigestStream('SHA-256');
   try { await request.body.pipeThrough(new FixedLengthStream(size)).pipeTo(checksum); }
   catch { return bad(); }
   const actual = Array.from(new Uint8Array(await checksum.digest), item => item.toString(16).padStart(2, '0')).join('');
   if (actual !== expectedHash) return bad();
  }
  return responseForPrior(prior);
 }
 const id = crypto.randomUUID(), mutation = crypto.randomUUID(), key = `desktop-imports/${project.id}/${crypto.randomUUID()}`, now = new Date().toISOString(), leaseUntil = Date.now() + uploadLeaseMs;
 await env.DB.prepare("INSERT INTO desktop_file_staging (id, owner_id, object_key, state, lease_until, created_at) VALUES (?, ?, ?, 'writing', ?, ?)").bind(mutation, runner.ownerId, key, leaseUntil, Date.now()).run();
 const release = async () => {
  try {
   await env.DB.prepare("UPDATE desktop_file_staging SET state = 'cleanup', lease_until = 0 WHERE id = ? AND owner_id = ? AND state IN ('writing', 'watching')").bind(mutation, runner.ownerId).run();
   await cleanupDesktopUploads(env, runner.ownerId);
  } catch { /* The durable staging row remains eligible for a later retry. */ }
 };
 try {
  if (streamSize !== null) {
   const stream = request.body.pipeThrough(new FixedLengthStream(size));
   await env.FILES.put(key, stream, {sha256:expectedHash});
  } else await env.FILES.put(key, bytes);
  await env.DB.prepare('UPDATE desktop_file_staging SET writer_done = 1 WHERE id = ? AND owner_id = ?').bind(mutation, runner.ownerId).run();
  const outcome = await env.DB.batch([
   env.DB.prepare("INSERT INTO desktop_plan_file_imports (owner_id, request_id, source_key, file_id, project_id, content_hash, name, content_type, size, object_key, mutation_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND lease_until > ?) ON CONFLICT(owner_id, request_id, source_key) DO NOTHING").bind(runner.ownerId, requestId, sourceKey, id, project.id, digest, name, contentType, size, key, mutation, now, mutation, runner.ownerId, Date.now()),
   env.DB.prepare('INSERT INTO project_files (id, project_id, name, content_type, object_key, size, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM desktop_plan_file_imports WHERE owner_id = ? AND request_id = ? AND source_key = ? AND mutation_id = ?)').bind(id, project.id, name, contentType, key, size, now, runner.ownerId, requestId, sourceKey, mutation),
   env.DB.prepare("DELETE FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND EXISTS (SELECT 1 FROM desktop_plan_file_imports WHERE owner_id = ? AND request_id = ? AND source_key = ? AND mutation_id = ?)").bind(mutation, runner.ownerId, runner.ownerId, requestId, sourceKey, mutation),
  ]);
  if (outcome[0].meta.changes) return Response.json({ file: { id, name, contentType, size, createdAt: now } }, { status: 201 });
 } catch (error) { await release(); throw error; }
 await release();
 const existing = await lookup(); return existing ? responseForPrior(existing) : conflict();
}
