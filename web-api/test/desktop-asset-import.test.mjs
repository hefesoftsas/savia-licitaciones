import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { importDesktopAsset } from '../src/desktop-asset-import.js';
import { cleanupDesktopUploads } from '../src/desktop-file-cleanup.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('importa imágenes aisladas y reintenta sin duplicar ni mezclarlas con documentos', async () => {
 const build = await mkdtemp(join(tmpdir(), 'savia-assets-api-')); let worker;
 try {
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'assets-test' }, r2Buckets: ['FILES'], bindings: {AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost' } }));
  const db = await worker.getD1Database('DB'); for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options), post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  async function signup(name) { const r = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
  const alice = await signup('alice'), bob = await signup('bob');
  async function pair(cookie) { const p = await (await post('/api/runner-pairings', {}, { cookie })).json(); return (await (await post('/api/runners/pair', { code: p.code, name: 'Equipo' })).json()).token; }
  const token = await pair(alice), other = await pair(bob), auth = { authorization: `Bearer ${token}` };
  const node = { id: 'chapter', parentId: null, sortOrder: 0, title: 'Capítulo', description: '', content: 'Texto', contentMode: 'manual-fill', contentModeNote: '', sourceRequirementId: '', sourceRequirementTitle: '' };
  const plan = await post('/api/runner/imports/technical-plan', { title: 'Proyecto', nodes: [node] }, { ...auth, 'idempotency-key': 'asset-project' }); assert.equal(plan.status, 201); const project = (await plan.json()).project;
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=', 'base64'), reference = 'savia-asset://imported-images/technical-plan-1/plano%20%C3%B1.png', kind = 'url';
  const sha = value => createHash('sha256').update(value).digest('hex'), sourceKey = sha(JSON.stringify([kind, reference])), path = `/api/runner/imports/technical-plan/asset-project/assets/${sourceKey}`;
  const upload = (data = bytes, headers = auth) => req(path, { method: 'POST', headers: { ...headers, 'x-asset-kind': kind, 'x-asset-reference': encodeURIComponent(reference), 'x-content-sha256': sha(data), 'content-type': 'application/octet-stream' }, body: data });
  assert.equal((await upload(bytes, {})).status, 401); assert.equal((await upload(bytes, { authorization: `Bearer ${other}` })).status, 404); assert.equal((await upload(Buffer.from('not image'))).status, 400);
  const results = await Promise.all([upload(), upload()]); assert.deepEqual(results.map(r => r.status).sort(), [200, 201]); const asset = (await results[0].json()).asset; assert.equal((await results[1].json()).asset.id, asset.id);
  const listPath = `/api/projects/${project.id}/plan-assets`;
  assert.equal((await req(listPath)).status, 401); assert.equal((await req(listPath, { headers: { cookie: bob } })).status, 404);
  const listed = await req(listPath, { headers: { cookie: alice } }); assert.equal(listed.status, 200); assert.equal(listed.headers.get('cache-control'), 'no-store'); assert.deepEqual((await listed.json()).assets, [{ id: asset.id, kind, reference }]);
  assert.equal((await (await req(`/api/projects/${project.id}/files`, { headers: { cookie: alice } })).json()).files.length, 0);
  const url = `/api/projects/${project.id}/plan-assets/${asset.id}`; assert.equal((await req(url, { headers: { cookie: bob } })).status, 404);
  const download = await req(url, { headers: { cookie: alice } }); assert.equal(download.status, 200); assert.equal(download.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  assert.equal((await upload(Buffer.concat([bytes, Buffer.from('changed')]))).status, 409);
  const libraryUpload = async cookie => (await (await req('/api/image-library', { method:'POST', headers:{cookie,origin:'http://localhost','x-file-name':'imagen.png'}, body:bytes })).json()).image.id; const aliceImage=await libraryUpload(alice), bobImage=await libraryUpload(bob);
  const jobResponse = await post(`/api/projects/${project.id}/jobs`, { kind: 'technical-plan.export-word', payload: { planVersion: 1, language: 'es' } }, { cookie: alice, 'idempotency-key': 'export-assets' }); assert.equal(jobResponse.status, 201); const job = (await jobResponse.json()).job;
  const claim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.export-word'] }, auth)).json(); assert.equal(claim.job.id, job.id);
  const context = await (await post(`/api/runner/jobs/${job.id}/plan-context`, { lease: claim.lease }, auth)).json(); assert.ok(context.assets.some(item => item.id===asset.id && item.reference===reference)); assert.ok(context.assets.some(item => item.id===`library-${aliceImage}` && item.reference===`/api/image-library/${aliceImage}/file`)); assert.ok(!context.assets.some(item => item.id===`library-${bobImage}`)); const libraryPath=`/api/runner/jobs/${job.id}/plan-assets/library-${aliceImage}`; assert.deepEqual(Buffer.from(await (await post(libraryPath,{lease:claim.lease},auth)).arrayBuffer()),bytes); assert.equal((await post(`/api/runner/jobs/${job.id}/plan-assets/library-${bobImage}`,{lease:claim.lease},auth)).status,404); assert.equal((await post(libraryPath,{lease:claim.lease},{authorization:`Bearer ${other}`})).status,409);
  const assetPath = `/api/runner/jobs/${job.id}/plan-assets/${asset.id}`;
  assert.equal((await post(assetPath, { lease: claim.lease }, { authorization: `Bearer ${other}` })).status, 409);
  const runnerDownload = await post(assetPath, { lease: claim.lease }, auth); assert.equal(runnerDownload.status, 200); assert.deepEqual(Buffer.from(await runnerDownload.arrayBuffer()), bytes);
  const uploadedArtifact = await req(`/api/runner/jobs/${job.id}/artifact`, { method: 'POST', headers: { ...auth, 'x-savia-lease': claim.lease }, body: Buffer.from('documento') }); assert.equal(uploadedArtifact.status, 200); const artifact = (await uploadedArtifact.json()).artifact;
  const newReference = 'savia-asset://imported-images/technical-plan-1/otro.png', newKey = sha(JSON.stringify(['url', newReference]));
  const secondAsset = await req(`/api/runner/imports/technical-plan/asset-project/assets/${newKey}`, { method: 'POST', headers: { ...auth, 'x-asset-kind': 'url', 'x-asset-reference': encodeURIComponent(newReference), 'x-content-sha256': sha(bytes) }, body: bytes }); assert.equal(secondAsset.status, 201);
  assert.equal((await post(assetPath, { lease: claim.lease }, auth)).status, 409);
  assert.equal((await post(`/api/runner/jobs/${job.id}/plan-context`, { lease: claim.lease }, auth)).status, 409);
  assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, { lease: claim.lease, status: 'succeeded', result: { artifactId: artifact.id, warnings: [] } }, auth)).status, 409);
  const staged = await db.prepare('SELECT object_key FROM project_plan_assets WHERE id = ?').bind(asset.id).first();
  const owner = (await (await req('/api/me', { headers: { cookie: alice } })).json()).user.id;
  await db.prepare("INSERT INTO desktop_file_staging (id, owner_id, object_key, state, lease_until, writer_done, created_at) VALUES (?, ?, ?, 'cleanup', 0, 1, 0)").bind('referenced-asset', owner, staged.object_key).run();
  const cleaned = await post('/api/runner/imports/cleanup', {}, auth); assert.equal(cleaned.status, 200); assert.ok(await (await worker.getR2Bucket('FILES')).get(staged.object_key));
  const bucket = await worker.getR2Bucket('FILES'), brokenReference = 'savia-asset://imported-images/technical-plan-1/lost.png', brokenKey = sha(JSON.stringify(['url', brokenReference]));
  const brokenRequest = () => new Request('http://localhost/import', { method: 'POST', headers: { 'x-asset-kind': 'url', 'x-asset-reference': encodeURIComponent(brokenReference), 'x-content-sha256': sha(bytes) }, body: bytes });
  const broken = { DB: db, FILES: { put: async (key, data) => { await bucket.put(key, data); throw new Error('lost acknowledgment'); }, delete: async () => { throw new Error('storage unavailable'); } } };
  await assert.rejects(importDesktopAsset(brokenRequest(), broken, { ownerId: owner }, 'asset-project', brokenKey), /acknowledgment/);
  const pending = await db.prepare("SELECT * FROM desktop_file_staging WHERE owner_id = ? AND state = 'cleanup'").bind(owner).first(); assert.ok(pending); assert.ok(await bucket.get(pending.object_key));
  assert.equal((await cleanupDesktopUploads(broken, owner)).failed, 1); await cleanupDesktopUploads({ DB: db, FILES: bucket }, owner); assert.equal(await bucket.get(pending.object_key), null);
  assert.equal((await db.prepare('SELECT state FROM desktop_file_staging WHERE id = ?').bind(pending.id).first()).state, 'watching');
  await db.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 998) INSERT INTO project_plan_assets (id, owner_id, project_id, request_id, source_key, reference, kind, content_hash, content_type, size, object_key, mutation_id, created_at) SELECT printf('%036d', i), ?, ?, 'bulk', printf('%064d', i), 'reference-' || i, 'url', ?, 'image/png', 1, 'fixture/' || i, 'fixture-' || i, '2026-01-01' FROM n`).bind(owner, project.id, 'a'.repeat(64)).run();
  const largeExport = await post(`/api/projects/${project.id}/jobs`, { kind: 'technical-plan.export-word', payload: { planVersion: 1, language: 'es' } }, { cookie: alice, 'idempotency-key': 'export-many-images' }); assert.equal(largeExport.status, 201, await largeExport.clone().text());
 } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
