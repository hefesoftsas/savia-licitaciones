import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('el emparejamiento es de un solo uso, aislado y revocable', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-runner-build-'));
  const local = await mkdtemp(join(tmpdir(), 'savia-runner-local-'));
  let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], {
      cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' },
    });
    worker = new Miniflare(convertV4MiniflareOptions({
      modules: true, script: await readFile(join(build, 'index.js'), 'utf8'),
      compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'],
      d1Databases: { DB: 'runner-test' }, r2Buckets: ['FILES'],
      bindings: { BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', AUTH_ALLOW_REGISTRATION: 'true' },
    }));
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(name => name.endsWith('.sql')).sort()) {
      const schema = await readFile(join(root, 'migrations', file), 'utf8');
      for (const statement of schema.split(';').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run();
    }
    const request = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const post = (path, body, headers = {}) => request(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    async function signUp(name) {
      const response = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'test-password-12345' });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    }
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    assert.equal((await post('/api/runner-pairings', {})).status, 401);
    const creation = await post('/api/runner-pairings', {}, { cookie: alice });
    assert.equal(creation.status, 201);
    const { code } = await creation.json();
    assert.ok(code);
    assert.equal((await post('/api/runners/pair',{code,name:'No permitido',executionMode:'hosted'})).status,400);
    const attempts = await Promise.all([post('/api/runners/pair', { code, name: 'Equipo A' }), post('/api/runners/pair', { code, name: 'Equipo A' })]);
    assert.deepEqual(attempts.map(item => item.status).sort(), [201, 401]);
    const paired = await attempts.find(item => item.status === 201).json();
    assert.ok(paired.token);
    assert.equal(paired.runner.executionMode,'local');
    const stored = await db.prepare('SELECT token_hash FROM runners WHERE id = ?').bind(paired.runner.id).first();
    assert.notEqual(stored.token_hash, paired.token);
    const pairingStored = await db.prepare('SELECT code_hash FROM runner_pairings WHERE code_hash = ?').bind(code).first();
    assert.equal(pairingStored, null);
    const list = await request('/api/runners', { headers: { cookie: alice } });
    const listData = await list.json(), listed = listData.runners;
    assert.ok(Number.isFinite(Date.parse(listData.serverTime)));
    assert.equal(listed.length, 1);
    assert.equal(listed[0].executionMode,'local');
    assert.equal(JSON.stringify(listed).includes(paired.token), false);
    assert.equal(listed[0].maxAgents,1);
    const settings=(value,cookie=alice)=>request(`/api/runners/${paired.runner.id}/settings`,{method:'PUT',headers:{origin:'http://localhost','content-type':'application/json',cookie},body:JSON.stringify({maxAgents:value})});
    assert.equal((await settings(3,bob)).status,404);
    assert.equal((await settings(0)).status,400);
    assert.equal((await settings(5)).status,400);
    assert.equal((await settings(3)).status,200);
    const runnerSettings=await post('/api/runners/heartbeat',{supportsConcurrency:true},{authorization:`Bearer ${paired.token}`});
    assert.equal((await runnerSettings.json()).maxAgents,3);
    assert.equal((await (await request('/api/runners',{headers:{cookie:alice}})).json()).runners[0].supportsConcurrency,true);
    assert.deepEqual((await (await request('/api/runners', { headers: { cookie: bob } })).json()).runners, []);
    assert.equal((await post('/api/runners/heartbeat', {}, { authorization: `Bearer ${paired.token}` })).status, 200);
    const project = (await (await post('/api/projects',{title:'Proyecto'}, {cookie:alice})).json()).project;
    const job = (await (await post(`/api/projects/${project.id}/jobs`,{kind:'economic-offer.calculate',payload:{draft:{items:[{id:'1',name:'Artículo',quantity:'2',price:'5',rate:'20'}]}}},{cookie:alice,'idempotency-key':'mode-check'})).json()).job;
    const authorization = {authorization:`Bearer ${paired.token}`};
    const claim = await (await post('/api/runner/jobs/claim',{kinds:['economic-offer.calculate']},authorization)).json();
    assert.equal(claim.job.id,job.id);
    await db.prepare("UPDATE runners SET execution_mode='hosted' WHERE id=?").bind(paired.runner.id).run();
    assert.equal((await post('/api/runners/heartbeat', {}, { authorization: `Bearer ${paired.token}` })).status, 401);
    assert.equal((await post('/api/runner/jobs/claim', {kinds:['test.sample']}, { authorization: `Bearer ${paired.token}` })).status, 401);
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`,{lease:claim.lease},authorization)).status,401);
    assert.equal((await post(`/api/runner/jobs/${job.id}/complete`,{lease:claim.lease,status:'succeeded',result:{}},authorization)).status,401);
    assert.equal((await post(`/api/runner/jobs/${job.id}/credential`,{lease:claim.lease},authorization)).status,401);
    assert.equal((await post('/api/runner/preferences-snapshot',{},authorization)).status,401);
    await db.prepare("UPDATE runners SET execution_mode='local' WHERE id=?").bind(paired.runner.id).run();
    assert.equal((await post('/api/runners/heartbeat', {}, { authorization: `Bearer ${paired.token}` })).status, 200);
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`,{lease:claim.lease},authorization)).status,200);
    assert.equal((await post(`/api/projects/${project.id}/jobs/${job.id}/cancel`,{}, {cookie:alice})).status,200);
    assert.equal((await request(`/api/runners/${paired.runner.id}`, { method: 'DELETE', headers: { cookie: bob, origin: 'http://localhost' } })).status, 404);
    assert.equal((await request(`/api/runners/${paired.runner.id}`, { method: 'DELETE', headers: { cookie: alice, origin: 'http://localhost' } })).status, 204);
    assert.equal((await post('/api/runners/heartbeat', {}, { authorization: `Bearer ${paired.token}` })).status, 401);
    const expiring = await post('/api/runner-pairings', {}, { cookie: alice });
    const expiredCode = (await expiring.json()).code;
    await db.prepare('UPDATE runner_pairings SET expires_at = 0 WHERE used_at IS NULL').run();
    assert.equal((await post('/api/runners/pair', { code: expiredCode, name: 'Expired' })).status, 401);
    const fresh = await post('/api/runner-pairings', {}, { cookie: alice });
    const newCode = (await fresh.json()).code;
    const cli = process.env.SAVIA_TEST_RUNNER_CLI || resolve(root, '../runner/cli.mjs');
    const config = join(local, 'runner.json');
    const runCli = (args, input = '', keepOpen = false) => new Promise((resolveResult, reject) => {
      const child = spawn(process.execPath, [cli, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      child.on('error', reject);
      const timer=setTimeout(()=>{child.kill();reject(new Error('El runner no terminó.'));},5000);
      child.on('close', status => {clearTimeout(timer);resolveResult({ status, output });});
      if(keepOpen)child.stdin.write(input);else child.stdin.end(input);
    });
    const connected = await runCli(['pair', '--server', (await worker.ready).origin, '--config', config, '--name', 'Equipo local'], `${newCode}\n`, true);
    assert.equal(connected.status, 0, connected.output);
    const saved = JSON.parse(await readFile(config, 'utf8'));
    assert.equal(connected.output.includes(saved.token), false);
    if (process.platform !== 'win32') assert.equal((await stat(config)).mode & 0o777, 0o600);
    assert.equal((await runCli(['heartbeat', '--config', config])).status, 0);
    assert.equal((await request(`/api/runners/${saved.runnerId}`, { method: 'DELETE', headers: { cookie: alice, origin: 'http://localhost' } })).status, 204);
    const revoked = await runCli(['heartbeat', '--config', config]);
    assert.notEqual(revoked.status, 0);
    assert.equal(revoked.output.includes(saved.token), false);
  } finally {
    await worker?.dispose();
    await rm(build, { recursive: true, force: true });
    await rm(local, { recursive: true, force: true });
  }
});
