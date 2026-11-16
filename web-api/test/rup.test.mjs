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

test('certificados y datos revisados permanecen aislados y detectan modificaciones simultáneas', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-rup-')); let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
    worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'rup-test' }, r2Buckets: ['FILES'], bindings: { BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', AUTH_ALLOW_REGISTRATION: 'true' } }));
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const send = (path, method, body, cookie, origin = 'http://localhost') => req(path, { method, headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    async function signup(name) { const r = await send('/api/auth/sign-up/email', 'POST', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
    const alice = await signup('alice'), bob = await signup('bob');
    const doc = await PDFDocument.create(); doc.addPage(); doc.addPage(); const bytes = await doc.save();
    const upload = (cookie, version, data = bytes, origin = 'http://localhost') => req('/api/rup/certificate', { method: 'PUT', headers: { cookie, origin, 'x-rup-version': String(version), 'x-file-name': encodeURIComponent('RUP ñ.pdf'), 'content-type': 'application/pdf' }, body: data });
    assert.equal((await req('/api/rup/certificate')).status, 401);
    const initial = await (await req('/api/rup/certificate', { headers: { cookie: alice } })).json(); assert.equal(initial.version, 0); assert.equal(initial.certificate, null);
    assert.equal((await upload(alice, 0, new TextEncoder().encode('fake'))).status, 400);
    assert.equal((await upload(alice, 0, bytes, 'https://other.example')).status, 403);
    const first = await upload(alice, 0); assert.equal(first.status, 200, await first.clone().text()); const saved = await first.json();
    assert.equal(saved.version, 1); assert.equal(saved.certificate.name, 'RUP ñ.pdf'); assert.equal(saved.certificate.pages, 2);
    assert.equal((await upload(alice, 0)).status, 409);
    const invalidDate = await send('/api/rup/certificate', 'PATCH', { version: 1, issuedOn: '2026-02-30' }, alice); assert.equal(invalidDate.status, 400);
    const dated = await send('/api/rup/certificate', 'PATCH', { version: 1, issuedOn: '2026-10-01' }, alice); assert.equal(dated.status, 200); const datedCertificate = await dated.json(); assert.equal(datedCertificate.version, 2); assert.equal(datedCertificate.certificate.issuedOn, '2026-10-01');
    assert.equal((await send('/api/rup/certificate', 'PATCH', { version: 1, issuedOn: '' }, alice)).status, 409);
    saved.version = 2;

    assert.equal((await req(`/api/rup/certificates/${saved.certificate.id}/pdf`, { headers: { cookie: bob } })).status, 404);
    const pdf = await req(`/api/rup/certificates/${saved.certificate.id}/pdf`, { headers: { cookie: alice } }); assert.equal(pdf.status, 200); assert.deepEqual(new Uint8Array(await pdf.arrayBuffer()), bytes); assert.equal(pdf.headers.get('cache-control'), 'no-store');
    const fact = { certificateId: saved.certificate.id, certificateVersion: saved.version, label: 'Liquidez', value: '1,25', page: 2 };
    assert.equal((await send('/api/rup/facts', 'POST', { ...fact, page: 3 }, alice)).status, 400);
    assert.equal((await send('/api/rup/facts', 'POST', fact, bob)).status, 404);
    const added = await send('/api/rup/facts', 'POST', fact, alice); assert.equal(added.status, 201); const item = (await added.json()).fact; assert.equal(item.version, 1);
    assert.equal((await send(`/api/rup/facts/${item.id}`, 'PATCH', { ...fact, value: '1,30', version: 1 }, bob)).status, 404);
    const update = await send(`/api/rup/facts/${item.id}`, 'PATCH', { ...fact, value: '1,30', version: 1 }, alice); assert.equal(update.status, 200); assert.equal((await update.json()).fact.version, 2);
    assert.equal((await send(`/api/rup/facts/${item.id}`, 'PATCH', { ...fact, version: 1 }, alice)).status, 409);
    const extra = (await (await send('/api/rup/facts', 'POST', { ...fact, label: 'Endeudamiento' }, alice)).json()).fact;
    assert.equal((await send(`/api/rup/facts/${extra.id}`, 'DELETE', { certificateId: fact.certificateId, certificateVersion: fact.certificateVersion, version: 2 }, alice)).status, 409);
    assert.equal((await send(`/api/rup/facts/${extra.id}`, 'DELETE', { certificateId: fact.certificateId, certificateVersion: fact.certificateVersion, version: 1 }, alice)).status, 204);

    const second = await upload(alice, 2); assert.equal(second.status, 200); const replaced = await second.json(); assert.notEqual(replaced.certificate.id, saved.certificate.id); assert.equal(replaced.version, 3);
    assert.deepEqual((await (await req('/api/rup/facts', { headers: { cookie: alice } })).json()).facts, []);
    assert.equal((await send('/api/rup/facts', 'POST', fact, alice)).status, 409);
    assert.equal((await req(`/api/rup/certificates/${saved.certificate.id}/pdf`, { headers: { cookie: alice } })).status, 200);
    assert.equal((await (await req('/api/rup/certificate', { headers: { cookie: bob } })).json()).certificate, null);
    const bucket = await worker.getR2Bucket('FILES');
    const before = (await bucket.list()).objects.length;
    await db.prepare("CREATE TRIGGER reject_rup BEFORE INSERT ON rup_certificates BEGIN SELECT RAISE(ABORT, 'simulated_failure'); END").run();
    try { assert.equal((await upload(alice, replaced.version)).status, 500); assert.equal((await bucket.list()).objects.length, before); }
    finally { await db.prepare('DROP TRIGGER reject_rup').run(); }
    assert.equal((await (await req('/api/rup/certificate', { headers: { cookie: alice } })).json()).version, replaced.version);
    const concurrent = await Promise.all([upload(bob, 0), upload(bob, 0)]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
    assert.equal((await bucket.list()).objects.length, before + 1);
    const dates = await Promise.all(['2026-01-01', '2026-02-01'].map(issuedOn => send('/api/rup/certificate', 'PATCH', { version: 1, issuedOn }, bob)));
    assert.deepEqual(dates.map(response => response.status).sort(), [200, 409]);
    const winning = await dates.find(response => response.status === 200).json();
    const currentBob = await (await req('/api/rup/certificate', { headers: { cookie: bob } })).json();
    assert.equal(currentBob.certificate.issuedOn, winning.certificate.issuedOn);


  } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
