import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { cleanupDesktopUploads } from '../src/desktop-file-cleanup.js';
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { PDFDocument } = require('pdf-lib');
const { createCompanyArchive } = require('./electron/services/companyBackupArchive.cjs');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('migra RUP con aislamiento, concurrencia, control de fuentes y reintentos', async () => {
 const build = await mkdtemp(join(tmpdir(), 'savia-import-rup-')); let worker;
 try {
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'rup-import-test' }, r2Buckets: ['FILES'], bindings: {AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost' } }));
  const db = await worker.getD1Database('DB'); for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options), post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  async function signup(name) { const response = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; }
  const alice = await signup('alice'), bob = await signup('bob');
  async function runnerFor(cookie) { const { code } = await (await post('/api/runner-pairings', {}, { cookie })).json(); return await (await post('/api/runners/pair', { code, name: 'Equipo' })).json(); }
  const runner = await runnerFor(alice), other = await runnerFor(bob);
  const document = await PDFDocument.create(); document.addPage(); const bytes = await document.save();
  const metadata = { name: 'RUP ñ.pdf', importedAt: '2026-01-01T00:00:00Z', issuedOn: '2025-12-31', facts: [{ id: 'original-fact', label: 'Liquidez', value: '1,5', page: 1 }] };
  const upload = async (id, runnerToken, details = metadata, file = bytes) => { const form = new FormData(); form.set('metadata', JSON.stringify(details)); form.set('pdf', new Blob([file], { type: 'application/pdf' }), 'rup.pdf'); const request = new Request(`http://localhost/api/runner/imports/rup/${id}`, { method: 'POST', headers: runnerToken ? { authorization: `Bearer ${runnerToken}` } : {}, body: form }); return worker.dispatchFetch(request.url, { method: 'POST', headers: Object.fromEntries(request.headers), body: await request.arrayBuffer() }); };
  assert.equal((await upload('import-1', null)).status, 401);
  assert.equal((await upload('bad-page', runner.token, { ...metadata, facts: [{ ...metadata.facts[0], page: 2 }] })).status, 400);
  assert.equal((await upload('bad-pdf', runner.token, metadata, Buffer.from('bad'))).status, 400);
  const results = await Promise.all([upload('import-1', runner.token), upload('import-1', runner.token)]); assert.deepEqual(results.map(x => x.status).sort(), [200, 201]);
  const certificate = (await (await req('/api/rup/certificate', { headers: { cookie: alice } })).json()).certificate; assert.equal(certificate.name, metadata.name); assert.equal(certificate.issuedOn, metadata.issuedOn); assert.equal(certificate.pages, 1);
  assert.equal((await (await req('/api/rup/certificate', { headers: { cookie: bob } })).json()).certificate, null);
  assert.equal((await req(`/api/rup/certificates/${certificate.id}/pdf`, { headers: { cookie: bob } })).status, 404);
  assert.deepEqual(Buffer.from(await (await req(`/api/rup/certificates/${certificate.id}/pdf`, { headers: { cookie: alice } })).arrayBuffer()), Buffer.from(bytes));
  const stored = await db.prepare('SELECT owner_id, object_key FROM rup_certificates WHERE id = ?').bind(certificate.id).first();
  await db.prepare("INSERT INTO desktop_file_staging (id, owner_id, object_key, state, lease_until, writer_done, created_at) VALUES ('stale-linked-rup', ?, ?, 'cleanup', 0, 1, 0)").bind(stored.owner_id, stored.object_key).run();
  await cleanupDesktopUploads({ DB: db, FILES: await worker.getR2Bucket('FILES') }, stored.owner_id);
  assert.ok(await (await worker.getR2Bucket('FILES')).get(stored.object_key));
  const facts = (await (await req('/api/rup/facts', { headers: { cookie: alice } })).json()).facts; assert.equal(facts.length, 1); assert.equal(facts[0].value, '1,5'); assert.equal(facts[0].page, 1);
  const map = await db.prepare('SELECT source_id, fact_id FROM desktop_rup_fact_id_map WHERE certificate_id = ?').bind(certificate.id).first(); assert.equal(map.source_id, 'original-fact'); assert.equal(map.fact_id, facts[0].id);
  const edited = await req(`/api/rup/facts/${facts[0].id}`, { method: 'PATCH', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ certificateId: certificate.id, certificateVersion: 1, version: 1, label: 'Liquidez', value: '1,6', page: 1 }) }); assert.equal(edited.status, 200);
  assert.equal((await upload('import-1', runner.token)).status, 200);
  assert.equal((await (await req('/api/rup/facts', { headers: { cookie: alice } })).json()).facts[0].value, '1,6');
  assert.equal((await upload('import-1', runner.token, { ...metadata, issuedOn: '' })).status, 409);
  assert.equal((await upload('another-backup', runner.token)).status, 409);
  assert.equal((await upload('import-1', other.token)).status, 201);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM rup_certificates').first()).count, 2);
  const sameSource = (await db.prepare('SELECT owner_id, fact_id FROM desktop_rup_fact_id_map WHERE request_id = ? AND source_id = ?').bind('import-1', 'original-fact').all()).results; assert.equal(sameSource.length, 2); assert.notEqual(sameSource[0].owner_id, sameSource[1].owner_id); assert.notEqual(sameSource[0].fact_id, sameSource[1].fact_id);
  const replacement = await req('/api/rup/certificate', { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'x-rup-version': '1', 'x-file-name': 'reemplazo.pdf', 'content-type': 'application/pdf' }, body: bytes }); assert.equal(replacement.status, 200); const newCertificate = (await replacement.json()).certificate;
  assert.equal((await (await upload('import-1', runner.token)).json()).current, false);
  assert.equal((await (await req('/api/rup/certificate', { headers: { cookie: alice } })).json()).certificate.id, newCertificate.id);
  const charlie = await signup('charlie'), third = await runnerFor(charlie), bucket = await worker.getR2Bucket('FILES'), before = (await bucket.list()).objects.length;
  await db.exec("CREATE TRIGGER reject_rup_fact BEFORE INSERT ON rup_reviewed_facts WHEN NEW.label = 'FALLA' BEGIN SELECT RAISE(ABORT, 'simulated failure'); END");
  let failed; try { failed = await upload('failure', third.token, { ...metadata, facts: [{ ...metadata.facts[0], label: 'FALLA' }] }); } catch { /* Miniflare can surface the injected D1 failure. */ }
  if (failed) assert.equal(failed.status, 500);
  assert.equal((await bucket.list()).objects.length, before); assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM desktop_rup_imports WHERE request_id = ?').bind('failure').first()).n, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM desktop_rup_fact_id_map WHERE request_id = ?').bind('failure').first()).n, 0);
  await db.exec('DROP TRIGGER reject_rup_fact');
  const localDb = join(build, 'source.sqlite'), fixture = new DatabaseSync(localDb);
  fixture.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT); CREATE TABLE rup_certificate (id INTEGER, file_name TEXT, stored_name TEXT, imported_at TEXT, issued_on TEXT); INSERT INTO rup_certificate VALUES (1,'RUP ñ.pdf','actual.pdf','2026-01-01T00:00:00Z','2025-12-31'); CREATE TABLE rup_reviewed_facts (id TEXT, certificate_name TEXT, label TEXT, value TEXT, page INTEGER); INSERT INTO rup_reviewed_facts VALUES ('fact-id','actual.pdf','Liquidez','1,5',1), ('old','old.pdf','Histórico','secreto-historico',1);"); fixture.close();
  const backup = join(build, 'empresa.savia'), config = join(build, 'runner.json');
  await writeFile(backup, createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes: await readFile(localDb) }, { path: 'workspace/credential-library/rup/actual.pdf', bytes: Buffer.from(bytes) }] }));
  await writeFile(config, JSON.stringify({ server: (await worker.ready).origin, runnerId: third.runner.id, token: third.token }));
  const cli = process.env.SAVIA_TEST_RUNNER_CLI || resolve(root, '../runner/cli.mjs'), execute = promisify(execFile);
  const inspection = (await execute(process.execPath, [cli, 'inspect-backup', '--backup', backup])).stdout; assert.equal(inspection.includes('Liquidez'), false); assert.equal(inspection.includes('secreto-historico'), false); assert.equal(JSON.parse(inspection).rup.factCount, 1);
  const args = [cli, 'import-rup', '--backup', backup, '--config', config];
  assert.deepEqual(JSON.parse((await execute(process.execPath, args)).stdout), { imported: true, current: true, factCount: 1 });
  assert.deepEqual(JSON.parse((await execute(process.execPath, args)).stdout), { imported: true, current: true, factCount: 1 });
  const archiveHash=createHash('sha256').update(await readFile(backup)).digest('hex'),receipt=await db.prepare('SELECT source_hash FROM desktop_rup_imports WHERE request_id=?').bind(`desktop-rup-${archiveHash}`).first();assert.equal(receipt.source_hash,createHash('sha256').update('rup:actual.pdf').digest('hex'));
  assert.equal((await (await req('/api/rup/facts', { headers: { cookie: charlie } })).json()).facts[0].value, '1,5');
 } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
