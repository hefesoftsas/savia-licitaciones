import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { PDFDocument } = require('pdf-lib');
const XLSX = require('xlsx');

test('la comparación RUP conserva las fuentes, detecta cambios y se exporta sin cambiar la valoración', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-rup-comparison-')); let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
    worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'rup-comparison-test' }, r2Buckets: ['FILES'], bindings: {AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost' } }));
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const send = (path, method, body, cookie, origin = 'http://localhost') => req(path, { method, headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    async function signup(name) { const r = await send('/api/auth/sign-up/email', 'POST', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
    const alice = await signup('alice'), bob = await signup('bob');
    const project = (await (await send('/api/projects', 'POST', { title: 'Proyecto' }, alice)).json()).project;
    const base = `/api/projects/${project.id}/workflow/requirements`;
    const requirement = (await (await send(base, 'POST', { title: 'Liquidez ≥ 1,20', source: 'Pliego p. 4', category: 'financial' }, alice)).json()).item;
    const doc = await PDFDocument.create(); doc.addPage(); const bytes = await doc.save();
    const certResponse = await req('/api/rup/certificate', { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'x-rup-version': '0', 'x-file-name': 'RUP.pdf' }, body: bytes }); const cert = await certResponse.json();
    const fact = (await (await send('/api/rup/facts', 'POST', { certificateId: cert.certificate.id, certificateVersion: cert.version, label: 'Liquidez', value: '1,234', page: 1 }, alice)).json()).fact;
    const path = `${base}/${requirement.id}/rup-comparison`;
    const input = { factId: fact.id, factVersion: 1, certificateVersion: cert.version, requirementVersion: requirement.version, version: 0, operator: 'gte', threshold: '1,20' };
    assert.equal((await req(path)).status, 401);
    assert.equal((await req(path, { headers: { cookie: bob } })).status, 404);
    assert.equal((await send(path, 'PUT', input, bob)).status, 404);
    const bobCert = await (await req('/api/rup/certificate', { method: 'PUT', headers: { cookie: bob, origin: 'http://localhost', 'x-rup-version': '0', 'x-file-name': 'RUP-bob.pdf' }, body: bytes })).json();
    const bobFact = (await (await send('/api/rup/facts', 'POST', { certificateId: bobCert.certificate.id, certificateVersion: bobCert.version, label: 'Dato ajeno', value: '2', page: 1 }, bob)).json()).fact;
    assert.equal((await send(path, 'PUT', { ...input, factId: bobFact.id, interpretedValue: '1234' }, alice)).status, 404);

    assert.equal((await send(path, 'PUT', input, alice, 'https://other.example')).status, 403);
    assert.equal((await send(path, 'PUT', input, alice)).status, 400);
    assert.equal((await send(path, 'PUT', { ...input, version: 7, interpretedValue: '1234' }, alice)).status, 409);
    assert.equal((await send(path, 'PUT', { ...input, threshold: { trim: 1 }, interpretedValue: '1234' }, alice)).status, 400);
    const attempts = await Promise.all([send(path, 'PUT', { ...input, interpretedValue: '1234' }, alice), send(path, 'PUT', { ...input, interpretedValue: '1234' }, alice)]);
    assert.deepEqual(attempts.map(response => response.status).sort(), [200, 409]);
    const savedResponse = attempts.find(response => response.status === 200);
    const saved = (await savedResponse.json()).comparison; assert.equal(saved.stale, false); assert.equal(saved.version, 1); assert.equal(saved.certificateId, cert.certificate.id); assert.equal(saved.page, 1);
    assert.equal((await send(path, 'PUT', { ...input, interpretedValue: '1234' }, alice)).status, 409);
    const list = await (await req(base, { headers: { cookie: alice } })).json(); assert.equal(list.items[0].status, 'pending');
    const csv = await (await req(`${base}/export?format=csv`, { headers: { cookie: alice } })).text(); assert.match(csv, /"RUP.pdf"/); assert.match(csv, /"1234"/); assert.match(csv, /"Vigente"/); assert.match(csv, /"Pendiente"/);
    const excel = await req(`${base}/export?format=xlsx`, { headers: { cookie: alice } }); const sheet = XLSX.read(await excel.arrayBuffer(), { type: 'array' }).Sheets.Requisitos; assert.equal(sheet.H8.v, 'RUP.pdf'); assert.equal(sheet.O8.v, 'Vigente');
    const upload = await req(`/api/projects/${project.id}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': 'pliego.txt' }, body: 'nuevo documento' }); assert.equal(upload.status, 201);
    assert.equal((await (await req(path, { headers: { cookie: alice } })).json()).comparison.stale, true);
    const refreshed = await send(path, 'PUT', { ...input, version: 1, interpretedValue: '1234' }, alice); assert.equal(refreshed.status, 200); assert.equal((await refreshed.json()).comparison.stale, false);
    const change = await send(`/api/rup/facts/${fact.id}`, 'PATCH', { certificateId: cert.certificate.id, certificateVersion: cert.version, version: 1, label: 'Liquidez', value: '2', page: 1 }, alice); assert.equal(change.status, 200);
    assert.equal((await (await req(path, { headers: { cookie: alice } })).json()).comparison.stale, true);
    assert.equal((await send(path, 'PUT', { ...input, version: 2, interpretedValue: '1234' }, alice)).status, 409);
    const original = await req(`/api/rup/certificates/${saved.certificateId}/pdf`, { headers: { cookie: alice } }); assert.equal(original.status, 200); assert.deepEqual(new Uint8Array(await original.arrayBuffer()), bytes);
    const staleCsv = await (await req(`${base}/export?format=csv`, { headers: { cookie: alice } })).text(); assert.match(staleCsv, /"Desactualizada"/);
    const next = { ...input, factVersion: 2, version: 2, interpretedValue: '' };
    assert.equal((await send(path, 'PUT', next, alice)).status, 200);
    const changedRequirement = await send(`${base}/${requirement.id}`, 'PATCH', { ...requirement, title: requirement.title, source: 'Pliego corregido p. 5', version: 1 }, alice); assert.equal(changedRequirement.status, 200);
    assert.equal((await (await req(path, { headers: { cookie: alice } })).json()).comparison.stale, true);
    assert.equal((await send(path, 'PUT', { ...next, version: 3, requirementVersion: 2 }, alice)).status, 200);
    const dateChange = await send('/api/rup/certificate', 'PATCH', { version: cert.version, issuedOn: '2026-10-01' }, alice); assert.equal(dateChange.status, 200);
    assert.equal((await (await req(path, { headers: { cookie: alice } })).json()).comparison.stale, true);
    assert.equal((await send(path, 'PUT', { ...next, version: 4, requirementVersion: 2, certificateVersion: 2 }, alice)).status, 200);
    const replacement = await req('/api/rup/certificate', { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'x-rup-version': '2', 'x-file-name': 'Nuevo.pdf' }, body: bytes }); assert.equal(replacement.status, 200);
    const replacedSnapshot = (await (await req(path, { headers: { cookie: alice } })).json()).comparison; assert.equal(replacedSnapshot.stale, true); assert.equal(replacedSnapshot.certificateId, cert.certificate.id);
    assert.equal((await req(`/api/rup/certificates/${replacedSnapshot.certificateId}/pdf`, { headers: { cookie: alice } })).status, 200);

  } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
