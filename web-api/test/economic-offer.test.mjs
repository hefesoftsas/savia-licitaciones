import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('oferta web guarda borradores aislados, calcula con precisión y detecta conflictos', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-offer-test-'));
  let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
    worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'offer-test' }, r2Buckets: ['FILES'], bindings: {AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost' } }));
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const write = (path, method, body, cookie) => req(path, { method, headers: { origin: 'http://localhost', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    async function signup(name) { const r = await write('/api/auth/sign-up/email', 'POST', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
    const alice = await signup('alice'); const bob = await signup('bob');
    const project = (await (await write('/api/projects', 'POST', { title: 'Oferta' }, alice)).json()).project;
    const path = `/api/projects/${project.id}/economic-offer`;
    assert.equal((await req(path)).status, 401);
    assert.equal((await req(path, { headers: { cookie: bob } })).status, 404);
    assert.equal((await (await req(path, { headers: { cookie: alice } })).json()).offer, null);
    const draft = { currency: 'COP', budget: '100', items: [{ id: '1', name: '=Servicio', quantity: '2', cost: '20', price: '30', discount: '10', rate: '19' }] };
    const first = await write(path, 'PUT', { draft, version: 0 }, alice);
    assert.equal(first.status, 200, await first.clone().text());
    const saved = (await first.json()).offer;
    assert.equal(saved.version, 1); assert.equal(saved.calculation.total, '64.26'); assert.equal(saved.calculation.budgetDifference, '35.74');
    assert.equal((await write(path, 'PUT', { draft, version: 0 }, alice)).status, 409);
    assert.equal((await write(path, 'PUT', { draft, version: 1 }, bob)).status, 404);
    const csv = await write(`${path}/export`, 'POST', { draft, language: 'es' }, alice);
    assert.equal(csv.status, 200); assert.match((await csv.json()).csv, /"'=Servicio"/);
    const incomplete = { ...draft, items: [{ ...draft.items[0], name: '' }] };
    const next = await write(path, 'PUT', { draft: incomplete, version: 1 }, alice);
    const after = (await next.json()).offer; assert.equal(after.version, 2); assert.equal(after.calculation, null); assert.match(after.error, /descripción/);
    assert.deepEqual((await (await req(path, { headers: { cookie: alice } })).json()).offer.draft, incomplete);
    const concurrent = await Promise.all([write(path, 'PUT', { draft, version: 2 }, alice), write(path, 'PUT', { draft: incomplete, version: 2 }, alice)]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
    const forbiddenOrigin = await req(path, { method: 'PUT', headers: { cookie: alice, origin: 'https://other.example', 'content-type': 'application/json' }, body: JSON.stringify({ draft, version: 3 }) });
    assert.equal(forbiddenOrigin.status, 403);
  } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
