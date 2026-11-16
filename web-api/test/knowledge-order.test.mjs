import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('la migración mantiene el orden que ya tenía la biblioteca web', async () => {
 const db = new DatabaseSync(':memory:');
 try {
  db.exec(await readFile(join(root, 'migrations/0026_knowledge_library.sql'), 'utf8'));
  db.exec("INSERT INTO knowledge_folders VALUES ('f2','owner','Segundo','2026-02-01'),('f1','owner','Primero','2026-01-01'); INSERT INTO knowledge_documents VALUES ('d1','f1','owner','Antiguo','text/plain','key1',1,'2026-01-01',0),('d2','f1','owner','Reciente','text/plain','key2',1,'2026-02-01',0);");
  db.exec(await readFile(join(root, 'migrations/0044_knowledge_order.sql'), 'utf8'));
  assert.deepEqual(db.prepare('SELECT id FROM knowledge_folders ORDER BY sort_order, created_at, id').all().map(row => row.id), ['f1', 'f2']);
  assert.deepEqual(db.prepare('SELECT id FROM knowledge_documents ORDER BY sort_order, created_at DESC, id').all().map(row => row.id), ['d2', 'd1']);
 } finally { db.close(); }
});

test('el orden exige una vista actual y aísla carpetas y cuentas', async () => {
 const build = await mkdtemp(join(tmpdir(), 'savia-knowledge-order-')); let worker;
 try {
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'knowledge-order-test' }, r2Buckets: ['FILES'], bindings: {AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost' } }));
  const db = await worker.getD1Database('DB'); for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options), json = (path, method, body, cookie, origin = 'http://localhost') => req(path, { method, headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  async function signup(name) { const response = await json('/api/auth/sign-up/email', 'POST', { name, email: `${name}@example.com`, password: 'password-123456' }, ''); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; }
  const alice = await signup('alice'), bob = await signup('bob');
  const create = async name => (await (await json('/api/knowledge/folders', 'POST', { name }, alice)).json()).folder;
  const a = await create('A'), b = await create('B'), c = await create('C');
  const folderOrder = () => req('/api/knowledge/folders', { headers: { cookie: alice } }).then(r => r.json()).then(x => x.folders.map(item => item.id));
  assert.deepEqual(await folderOrder(), [a.id, b.id, c.id]);
  const folderPath = '/api/knowledge/folders/order', before = [a.id, b.id, c.id], after = [c.id, a.id, b.id];
  assert.equal((await json(folderPath, 'PUT', { before, after }, alice, 'https://other.example')).status, 403);
  assert.equal((await json(folderPath, 'PUT', { before, after }, bob)).status, 409);
  assert.equal((await json(folderPath, 'PUT', { before, after: [a.id, a.id, b.id] }, alice)).status, 400);
  const concurrent = await Promise.all([json(folderPath, 'PUT', { before, after }, alice), json(folderPath, 'PUT', { before, after: [b.id, a.id, c.id] }, alice)]); assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
  const actual = await folderOrder(); assert.notDeepEqual(actual, before);
  assert.equal((await json(folderPath, 'PUT', { before, after }, alice)).status, 409);
  await db.exec("CREATE TRIGGER reject_folder_order BEFORE UPDATE OF sort_order ON knowledge_folders WHEN NEW.name = 'B' BEGIN SELECT RAISE(ABORT, 'simulated failure'); END");
  const failed = await json(folderPath, 'PUT', { before: actual, after: [...actual].reverse() }, alice);
  assert.equal(failed.status, 500); assert.deepEqual(await folderOrder(), actual);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM knowledge_order_mutations').first()).count, 0);
  await db.exec('DROP TRIGGER reject_folder_order');
  const upload = async name => (await (await req(`/api/knowledge/folders/${a.id}/documents`, { method: 'POST', headers: { origin: 'http://localhost', cookie: alice, 'x-file-name': name, 'content-type': 'text/plain' }, body: name })).json()).document;
  const one = await upload('uno.txt'), two = await upload('dos.txt'), three = await upload('tres.txt');
  const docs = () => req(`/api/knowledge/folders/${a.id}/documents`, { headers: { cookie: alice } }).then(r => r.json()).then(x => x.documents.map(item => item.id));
  assert.deepEqual(await docs(), [one.id, two.id, three.id]);
  const docPath = `/api/knowledge/folders/${a.id}/documents/order`, docBefore = [one.id, two.id, three.id], docAfter = [three.id, one.id, two.id];
  assert.equal((await json(docPath, 'PUT', { before: docBefore, after: docAfter }, bob)).status, 404);
  assert.equal((await json(docPath, 'PUT', { before: docBefore, after: docAfter }, alice)).status, 200); assert.deepEqual(await docs(), docAfter);
  assert.equal((await json(docPath, 'PUT', { before: docBefore, after: docAfter }, alice)).status, 409);
  await upload('nuevo.txt'); assert.equal((await json(docPath, 'PUT', { before: docAfter, after: docBefore }, alice)).status, 409);
 } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
