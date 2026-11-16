import pdfLib from '../../client/node_modules/pdf-lib/cjs/index.js';

const missing = () => Response.json({ error: 'not_found' }, { status: 404 });
const conflict = () => Response.json({ error: 'version_conflict' }, { status: 409 });
const bad = () => Response.json({ error: 'invalid_input' }, { status: 400 });
const maxPdfBytes = 25 * 1024 * 1024;
const validVersion = value => Number.isSafeInteger(value) && value >= 0;
const factView = row => ({ id: row.id, certificateId: row.certificate_id, label: row.label, value: row.value, page: row.page, version: row.version });
async function current(env, ownerId) {
  return env.DB.prepare('SELECT c.version, p.id, p.name, p.pages, p.imported_at, p.issued_on FROM rup_current c LEFT JOIN rup_certificates p ON p.id = c.certificate_id WHERE c.owner_id = ?').bind(ownerId).first();
}
function certificateView(row) { return row?.id ? { id: row.id, name: row.name, pages: row.pages, importedAt: row.imported_at, issuedOn: row.issued_on } : null; }
async function json(request) { try { return await request.json(); } catch { return null; } }
export async function rup(request, env, ownerId) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  if (path === '/api/rup/certificate') {
    if (request.method === 'GET') { const row = await current(env, ownerId); return Response.json({ certificate: certificateView(row), version: row?.version ?? 0 }); }
    if (request.method === 'PATCH') {
      const input = await json(request);
      if (!input || !validVersion(input.version) || typeof input.issuedOn !== 'string' || (input.issuedOn && (!/^\d{4}-\d{2}-\d{2}$/.test(input.issuedOn) || Number.isNaN(Date.parse(`${input.issuedOn}T00:00:00Z`)) || new Date(`${input.issuedOn}T00:00:00Z`).toISOString().slice(0, 10) !== input.issuedOn))) return bad();
      const before = await current(env, ownerId); if (!before?.id) return missing();
      if (before.version !== input.version) return conflict();
      const token = crypto.randomUUID();
      const result = await env.DB.batch([
        env.DB.prepare('UPDATE rup_current SET version = version + 1, mutation_token = ? WHERE owner_id = ? AND version = ? AND certificate_id = ?').bind(token, ownerId, input.version, before.id),
        env.DB.prepare('UPDATE rup_certificates SET issued_on = ? WHERE id = ? AND owner_id = ? AND EXISTS (SELECT 1 FROM rup_current WHERE owner_id = ? AND certificate_id = ? AND mutation_token = ?)').bind(input.issuedOn, before.id, ownerId, ownerId, before.id, token),
      ]);
      if (!result[0].meta.changes) return conflict();
      return Response.json({ certificate: { ...certificateView(before), issuedOn: input.issuedOn }, version: input.version + 1 });
    }
    if (request.method !== 'PUT') return new Response('Method not allowed', { status: 405 });
    const versionText = request.headers.get('x-rup-version');
    if (!versionText || !/^\d+$/.test(versionText) || !validVersion(Number(versionText))) return bad();
    const version = Number(versionText);
    const before = await current(env, ownerId);
    if ((before?.version ?? 0) !== version) return conflict();
    let name; try { name = decodeURIComponent(request.headers.get('x-file-name') || '').trim(); } catch { return bad(); }
    if (!name || name.length > 255 || !/\.pdf$/i.test(name)) return bad();
    if (Number(request.headers.get('content-length')) > maxPdfBytes) return Response.json({ error: 'file_too_large' }, { status: 413 });
    const data = await request.arrayBuffer();
    if (data.byteLength > maxPdfBytes) return Response.json({ error: 'file_too_large' }, { status: 413 });
    if (new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-') return bad();
    let pages; try { const pdf = await pdfLib.PDFDocument.load(data); pages = pdf.getPageCount(); } catch { return bad(); }
    if (!pages) return bad();
    const id = crypto.randomUUID(), key = `rup/${ownerId}/${id}`, now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO rup_current (owner_id, certificate_id, version) VALUES (?, NULL, 0) ON CONFLICT(owner_id) DO NOTHING').bind(ownerId).run();
    await env.FILES.put(key, data);
    try {
      const results = await env.DB.batch([
        env.DB.prepare('UPDATE rup_current SET certificate_id = ?, version = version + 1 WHERE owner_id = ? AND version = ?').bind(id, ownerId, version),
        env.DB.prepare('INSERT INTO rup_certificates (id, owner_id, name, object_key, pages, imported_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rup_current WHERE owner_id = ? AND certificate_id = ?)').bind(id, ownerId, name, key, pages, now, ownerId, id),
      ]);
      if (!results[0].meta.changes) { await env.FILES.delete(key); return conflict(); }
      return Response.json({ certificate: { id, name, pages, importedAt: now, issuedOn: '' }, version: version + 1 });
    } catch (error) { await env.FILES.delete(key); throw error; }
  }
  const pdf = /^\/api\/rup\/certificates\/([^/]+)\/pdf$/.exec(path);
  if (pdf) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    const row = await env.DB.prepare('SELECT object_key FROM rup_certificates WHERE id = ? AND owner_id = ?').bind(pdf[1], ownerId).first();
    if (!row) return missing(); const object = await env.FILES.get(row.object_key); if (!object) return missing();
    return new Response(object.body, { headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline', 'x-content-type-options': 'nosniff' } });
  }
  const fact = /^\/api\/rup\/facts(?:\/([^/]+))?$/.exec(path);
  if (!fact) return missing();
  const row = await current(env, ownerId);
  if (request.method === 'GET' && !fact[1]) {
    if (!row?.id) return Response.json({ facts: [], certificateId: null, version: row?.version ?? 0 });
    const result = await env.DB.prepare('SELECT * FROM rup_reviewed_facts WHERE certificate_id = ? ORDER BY created_at, id').bind(row.id).all();
    return Response.json({ facts: result.results.map(factView), certificateId: row.id, version: row.version });
  }
  if (!['POST', 'PATCH', 'DELETE'].includes(request.method) || (request.method === 'POST') === Boolean(fact[1])) return new Response('Method not allowed', { status: 405 });
  const input = await json(request); if (!input || typeof input.certificateId !== 'string' || !validVersion(input.certificateVersion)) return bad();
  if (!row || row.id !== input.certificateId) {
    const owned = await env.DB.prepare('SELECT id FROM rup_certificates WHERE id = ? AND owner_id = ?').bind(input.certificateId, ownerId).first();
    return owned ? conflict() : missing();
  }
  if (row.version !== input.certificateVersion) return conflict();
  if (request.method !== 'DELETE' && (typeof input.label !== 'string' || !input.label.trim() || input.label.length > 300 || typeof input.value !== 'string' || !input.value.trim() || input.value.length > 300 || !Number.isSafeInteger(input.page) || input.page < 1 || input.page > row.pages)) return bad();
  if (request.method !== 'POST' && (!validVersion(input.version) || input.version < 1)) return bad();
  const guard = 'EXISTS (SELECT 1 FROM rup_current WHERE owner_id = ? AND certificate_id = ? AND version = ?)';
  const now = new Date().toISOString(); let saved;
  if (request.method === 'POST') {
    saved = await env.DB.prepare(`INSERT INTO rup_reviewed_facts (id, certificate_id, label, value, page, version, created_at, updated_at) SELECT ?, ?, ?, ?, ?, 1, ?, ? WHERE ${guard} RETURNING *`).bind(crypto.randomUUID(), row.id, input.label.trim(), input.value.trim(), input.page, now, now, ownerId, row.id, row.version).first();
  } else if (request.method === 'PATCH') {
    saved = await env.DB.prepare(`UPDATE rup_reviewed_facts SET label = ?, value = ?, page = ?, version = version + 1, updated_at = ? WHERE id = ? AND certificate_id = ? AND version = ? AND ${guard} RETURNING *`).bind(input.label.trim(), input.value.trim(), input.page, now, fact[1], row.id, input.version, ownerId, row.id, row.version).first();
  } else {
    saved = await env.DB.prepare(`DELETE FROM rup_reviewed_facts WHERE id = ? AND certificate_id = ? AND version = ? AND ${guard} RETURNING *`).bind(fact[1], row.id, input.version, ownerId, row.id, row.version).first();
  }
  if (!saved) {
    if (request.method === 'POST') return conflict();
    const found = await env.DB.prepare('SELECT id FROM rup_reviewed_facts WHERE id = ? AND certificate_id = ?').bind(fact[1], row.id).first();
    return found ? conflict() : missing();
  }
  return request.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ fact: factView(saved) }, { status: request.method === 'POST' ? 201 : 200 });
}
