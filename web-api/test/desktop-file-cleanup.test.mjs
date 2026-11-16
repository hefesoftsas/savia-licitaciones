import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createHash } from 'node:crypto';
import { importDesktopFile } from '../src/desktop-file-import.js';
import { cleanupDesktopUploads } from '../src/desktop-file-cleanup.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('limpieza reanuda cargas expiradas sin tocar cargas activas, archivos vinculados ni otras cuentas', async () => {
 const build = await mkdtemp(join(tmpdir(), 'savia-import-cleanup-')); let worker;
 try {
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'cleanup-test' }, r2Buckets: ['FILES'], bindings: {AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost' } }));
  const db = await worker.getD1Database('DB'); for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options), post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  async function signup(name) { const response = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; }
  const alice = await signup('alice'), bob = await signup('bob'), owner = (await (await req('/api/me', { headers: { cookie: alice } })).json()).user.id, other = (await (await req('/api/me', { headers: { cookie: bob } })).json()).user.id;
  const pairing = await (await post('/api/runner-pairings', {}, { cookie: alice })).json(), runner = await (await post('/api/runners/pair', { code: pairing.code, name: 'Equipo' })).json(), auth = { authorization: `Bearer ${runner.token}` };
  const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project, bucket = await worker.getR2Bucket('FILES'), now = Date.now();
  const stage = async (id, user, state, lease, key) => { await bucket.put(key, 'datos'); await db.prepare('INSERT INTO desktop_file_staging (id, owner_id, object_key, state, lease_until, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, user, key, state, lease, now - 10000).run(); };
  await stage('expired', owner, 'writing', now - 1, 'staging/expired'); await stage('active', owner, 'writing', now + 60000, 'staging/active'); await stage('other', other, 'cleanup', now - 1, 'staging/other'); await stage('referenced', owner, 'cleanup', now - 1, 'staging/referenced');
  await db.prepare('INSERT INTO project_files (id, project_id, name, content_type, object_key, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind('kept', project.id, 'keep.txt', 'text/plain', 'staging/referenced', 5, new Date().toISOString()).run();
  await stage('runner-idle', owner, 'cleanup', now - 1, 'staging/runner-idle');
  const config = join(build, 'runner.json'); await writeFile(config, JSON.stringify({server:(await worker.ready).origin, runnerId:runner.runner.id, token:runner.token}));
  const child = spawn(process.execPath, [resolve(root,'../runner/cli.mjs'),'run','--config',config,'--poll-ms','100'], {stdio:'ignore'});
  try {
   const deadline = Date.now() + 15000;
   while (await bucket.head('staging/runner-idle')) { if (child.exitCode !== null || Date.now() > deadline) throw new Error('El runner no limpió la carga pendiente.'); await new Promise(resolve => setTimeout(resolve, 100)); }
  } finally { if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); } }
  assert.ok(await bucket.get('staging/active')); assert.ok(await bucket.get('staging/other')); assert.ok(await bucket.get('staging/referenced'));
  await db.prepare("UPDATE desktop_file_staging SET state='writing',lease_until=0 WHERE id='expired'").run(); await bucket.put('staging/expired','datos');
  assert.equal((await post('/api/runner/imports/cleanup', {})).status, 401);
  const responses = await Promise.all([post('/api/runner/imports/cleanup', {}, auth), post('/api/runner/imports/cleanup', {}, auth)]); assert.ok(responses.every(response => response.status === 200));
  assert.equal(await bucket.get('staging/expired'), null); assert.ok(await bucket.get('staging/active')); assert.ok(await bucket.get('staging/other')); assert.ok(await bucket.get('staging/referenced'));
  assert.equal((await db.prepare('SELECT state FROM desktop_file_staging WHERE id = ?').bind('expired').first()).state, 'watching');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM desktop_file_staging WHERE id = ?').bind('active').first()).n, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM desktop_file_staging WHERE id = ?').bind('other').first()).n, 1);
  assert.equal(await (await req(`/api/projects/${project.id}/files/kept`, { headers: { cookie: alice } })).text(), 'datos');
  await stage('automatic', owner, 'cleanup', now - 1, 'staging/automatic');
  const receipt = await post('/api/runner/imports/technical-plan', { title: 'Importación', nodes: [] }, { ...auth, 'idempotency-key': 'recover' }); assert.equal(receipt.status, 201); assert.equal(await bucket.get('staging/automatic'), null);
  const bytes = Buffer.from('carga privada'), digest = createHash('sha256').update(bytes).digest('hex'), sourceKey = 'a'.repeat(64);
  const request = () => new Request('http://localhost/import', { method: 'POST', headers: { 'x-file-name': 'archivo.txt', 'x-content-sha256': digest, 'content-type': 'text/plain' }, body: bytes });
  const broken = { DB: db, FILES: { put: async (key, value) => { await bucket.put(key, value); throw new Error('put acknowledgment lost'); }, delete: async () => { throw new Error('storage unavailable'); } } };
  await assert.rejects(importDesktopFile(request(), broken, { ownerId: owner }, 'recover', sourceKey), /acknowledgment/);
  let pending = await db.prepare('SELECT * FROM desktop_file_staging WHERE owner_id = ? AND state = ?').bind(owner, 'cleanup').first(); assert.ok(pending); assert.ok(await bucket.get(pending.object_key));
  const first = await cleanupDesktopUploads(broken, owner); assert.equal(first.failed, 1); assert.ok(await bucket.get(pending.object_key));
  const fixed = await cleanupDesktopUploads({ DB: db, FILES: bucket }, owner); assert.equal(fixed.removed, 1); assert.equal(await bucket.get(pending.object_key), null);
  assert.equal((await db.prepare('SELECT state FROM desktop_file_staging WHERE id = ?').bind(pending.id).first()).state, 'watching');
  await bucket.put(pending.object_key, 'late write'); await db.prepare('UPDATE desktop_file_staging SET lease_until = 0 WHERE id = ?').bind(pending.id).run();
  const rechecked = await cleanupDesktopUploads({ DB: db, FILES: bucket }, owner); assert.ok(rechecked.removed >= 1); assert.equal(await bucket.get(pending.object_key), null);
  const valid = await importDesktopFile(request(), { DB: db, FILES: bucket }, { ownerId: owner }, 'recover', sourceKey); assert.equal(valid.status, 201);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM desktop_file_staging WHERE owner_id = ? AND object_key LIKE ? AND state = 'writing'").bind(owner, 'desktop-imports/%').first()).n, 0);
  let expiredKey;
  const raced = { DB: db, FILES: { put: async (key, value) => { expiredKey = key; await bucket.put(key, value); await db.prepare('UPDATE desktop_file_staging SET lease_until = ? WHERE object_key = ?').bind(0, key).run(); await cleanupDesktopUploads({ DB: db, FILES: bucket }, owner); }, delete: key => bucket.delete(key) } };
  const expiredUpload = await importDesktopFile(request(), raced, { ownerId: owner }, 'recover', 'b'.repeat(64)); assert.equal(expiredUpload.status, 409); assert.equal(await bucket.get(expiredKey), null);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM desktop_plan_file_imports WHERE owner_id = ? AND request_id = ? AND source_key = ?').bind(owner, 'recover', 'b'.repeat(64)).first()).n, 0);
  await stage('late-race', owner, 'writing', 0, 'staging/late-race');
  let firstDelete = true;
  const lateWriter = { DB: db, FILES: { delete: async key => { await bucket.delete(key); if (key === 'staging/late-race' && firstDelete) { firstDelete = false; await bucket.put(key, 'late completion'); await db.prepare('UPDATE desktop_file_staging SET writer_done = 1 WHERE id = ?').bind('late-race').run(); } } } };
  await cleanupDesktopUploads(lateWriter, owner);
  assert.equal(await bucket.get('staging/late-race'), null);
  assert.equal(await db.prepare('SELECT id FROM desktop_file_staging WHERE id = ?').bind('late-race').first(), null);

 } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
