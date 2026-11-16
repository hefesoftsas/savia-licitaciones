import pdfLib from '../../client/node_modules/pdf-lib/cjs/index.js';
import { cleanupDesktopUploads, uploadLeaseMs } from './desktop-file-cleanup.js';

const bad = () => Response.json({ error: 'invalid_rup' }, { status: 400 });
const conflict = () => Response.json({ error: 'rup_conflict' }, { status: 409 });
const sha256 = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), b => b.toString(16).padStart(2, '0')).join('');
const text = (value, max) => typeof value === 'string' && !!value.trim() && value.length <= max;
const validDate = value => value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);

export async function importDesktopRup(request, env, runner, requestId) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId) || Number(request.headers.get('content-length') || 0) > 26 * 1024 * 1024) return bad();
 let form, metadata; try { form = await request.formData(); metadata = JSON.parse(form.get('metadata')); } catch { return bad(); }
 const file = form.get('pdf');
 if (!metadata || !text(metadata.name, 255) || !/\.pdf$/i.test(metadata.name) || !text(metadata.importedAt, 100) || !validDate(metadata.issuedOn) || !Array.isArray(metadata.facts) || metadata.facts.length > 500 || !file || typeof file === 'string' || file.size > 25 * 1024 * 1024) return bad();
 if(metadata.sourceId!==undefined && (!text(metadata.sourceId,255)||metadata.sourceId==='.'||metadata.sourceId==='..'||/[\\/:\x00-\x1f\x7f]/.test(metadata.sourceId)))return bad();
 const data = await file.arrayBuffer();
 if (new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-') return bad();
 let pages; try { pages = (await pdfLib.PDFDocument.load(data)).getPageCount(); } catch { return bad(); }
 if (!pages) return bad();
 const ids = new Set();
 for (const fact of metadata.facts) {
  if (!fact || !text(fact.id, 256) || ids.has(fact.id) || !text(fact.label, 300) || !text(fact.value, 300) || !Number.isSafeInteger(fact.page) || fact.page < 1 || fact.page > pages) return bad();
  ids.add(fact.id);
 }
 const details = { name: metadata.name, importedAt: metadata.importedAt, issuedOn: metadata.issuedOn, facts: metadata.facts.map(({ id, label, value, page }) => ({ id, label, value, page })), pdfHash: await sha256(data) };
 const body = JSON.stringify(details); if (body.length > 1_000_000) return bad();
 const hash = await sha256(new TextEncoder().encode(body)), sourceHash=metadata.sourceId===undefined?null:await sha256(new TextEncoder().encode(`rup:${metadata.sourceId}`)), lookup = () => env.DB.prepare('SELECT certificate_id, content_hash, source_hash FROM desktop_rup_imports WHERE owner_id = ? AND request_id = ?').bind(runner.ownerId, requestId).first();
 const responseFor = async row => {
  if (!row || row.content_hash !== hash || (row.source_hash && row.source_hash !== sourceHash)) return conflict();
  const current = await env.DB.prepare('SELECT certificate_id FROM rup_current WHERE owner_id = ?').bind(runner.ownerId).first();
  return Response.json({ imported: true, certificateId: row.certificate_id, current: current?.certificate_id === row.certificate_id });
 };
 const previous = await lookup(); if (previous) return responseFor(previous);
 const id = crypto.randomUUID(), mutation = crypto.randomUUID(), key = `rup/${runner.ownerId}/${id}`, now = new Date().toISOString();
 await env.DB.prepare("INSERT INTO desktop_file_staging (id, owner_id, object_key, state, lease_until, created_at) VALUES (?, ?, ?, 'writing', ?, ?)").bind(mutation, runner.ownerId, key, Date.now() + uploadLeaseMs, Date.now()).run();
 const release = async () => { try { await env.DB.prepare("UPDATE desktop_file_staging SET state = 'cleanup', lease_until = 0 WHERE id = ? AND owner_id = ? AND state IN ('writing', 'watching')").bind(mutation, runner.ownerId).run(); await cleanupDesktopUploads(env, runner.ownerId); } catch { /* Durable staging remains eligible for retry. */ } };
 try {
  await env.FILES.put(key, data);
  await env.DB.prepare('UPDATE desktop_file_staging SET writer_done = 1 WHERE id = ? AND owner_id = ?').bind(mutation, runner.ownerId).run();
  const facts = JSON.stringify(details.facts.map(item => ({ ...item, newId: crypto.randomUUID() })));
  const own = 'EXISTS (SELECT 1 FROM desktop_rup_imports WHERE owner_id = ? AND request_id = ? AND mutation_id = ?)';
  const result = await env.DB.batch([
   env.DB.prepare('INSERT INTO rup_current (owner_id, certificate_id, version) VALUES (?, NULL, 0) ON CONFLICT(owner_id) DO NOTHING').bind(runner.ownerId),
   env.DB.prepare("INSERT INTO rup_certificates (id, owner_id, name, object_key, pages, imported_at, issued_on) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rup_current WHERE owner_id = ? AND certificate_id IS NULL) AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND lease_until > ?)").bind(id, runner.ownerId, details.name, key, pages, details.importedAt, details.issuedOn, runner.ownerId, mutation, runner.ownerId, Date.now()),
   env.DB.prepare('INSERT INTO desktop_rup_imports (owner_id, request_id, certificate_id, content_hash, mutation_id, created_at, source_hash) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rup_certificates WHERE id = ? AND owner_id = ?) ON CONFLICT(owner_id, request_id) DO NOTHING').bind(runner.ownerId, requestId, id, hash, mutation, now, sourceHash, id, runner.ownerId),
   env.DB.prepare(`UPDATE rup_current SET certificate_id = ?, version = version + 1 WHERE owner_id = ? AND certificate_id IS NULL AND ${own}`).bind(id, runner.ownerId, runner.ownerId, requestId, mutation),
   env.DB.prepare(`INSERT INTO rup_reviewed_facts (id, certificate_id, label, value, page, version, created_at, updated_at) SELECT json_extract(value, '$.newId'), ?, json_extract(value, '$.label'), json_extract(value, '$.value'), json_extract(value, '$.page'), 1, ?, ? FROM json_each(?) WHERE ${own}`).bind(id, now, now, facts, runner.ownerId, requestId, mutation),
   env.DB.prepare(`INSERT INTO desktop_rup_fact_id_map (owner_id, request_id, certificate_id, source_id, fact_id) SELECT ?, ?, ?, json_extract(value, '$.id'), json_extract(value, '$.newId') FROM json_each(?) WHERE ${own}`).bind(runner.ownerId, requestId, id, facts, runner.ownerId, requestId, mutation),
   env.DB.prepare(`DELETE FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND ${own}`).bind(mutation, runner.ownerId, runner.ownerId, requestId, mutation),
   env.DB.prepare(`DELETE FROM rup_certificates WHERE id = ? AND owner_id = ? AND NOT ${own}`).bind(id, runner.ownerId, runner.ownerId, requestId, mutation),
  ]);
  if (result[2].meta.changes) return Response.json({ imported: true, certificateId: id, current: true }, { status: 201 });
 } catch (error) { await release(); throw error; }
 await release(); return responseFor(await lookup());
}
