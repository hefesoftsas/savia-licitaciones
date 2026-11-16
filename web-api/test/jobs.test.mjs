import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runOnce, recoverPending } from '../../runner/work-loop.mjs';
import { createOutbox } from '../../runner/outbox.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('la cola aísla propietarios y protege concesiones contra concurrencia y vencimiento', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-jobs-build-'));
  const local = await mkdtemp(join(tmpdir(), 'savia-jobs-runner-'));
  let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
    worker = new Miniflare(convertV4MiniflareOptions({
      modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'],
      d1Databases: { DB: 'jobs-test' }, r2Buckets: ['FILES'],
      bindings: {AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost' },
    }));
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) {
      const schema = await readFile(join(root, 'migrations', file), 'utf8');
      for (const sql of schema.split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
    }
    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    async function signup(name) {
      const r = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'test-password-12345' });
      assert.equal(r.status, 200);
      return r.headers.get('set-cookie').split(';')[0];
    }
    async function pair(cookie, name) {
      const p = await post('/api/runner-pairings', {}, { cookie });
      const { code } = await p.json();
      return (await (await post('/api/runners/pair', { code, name })).json());
    }
    const alice = await signup('alice');
    const bob = await signup('bob');
    const runnerA = await pair(alice, 'runner A');
    const runnerB = await pair(alice, 'runner B');
    const runnerOther = await pair(bob, 'runner other');
    const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project;
    const path = `/api/projects/${project.id}/jobs`;
    assert.equal((await post(path, { kind: 'test.sample', payload: { question: 'Prueba' } }, { cookie: bob })).status, 404);
    assert.equal((await post(path, { kind: 'tender-chat.send', payload: { question: 'Prueba', fileIds: [] } }, { cookie: alice, 'idempotency-key': 'bad-chat' })).status, 400);
    const created = await post(path, { kind: 'test.sample', payload: { question: 'Prueba' } }, { cookie: alice, 'idempotency-key': 'request-1' });
    assert.equal(created.status, 201, await created.clone().text());
    const { job } = await created.json();
    assert.equal(job.state, 'queued');
    const retry = await post(path, { kind: 'test.sample', payload: { question: 'Prueba' } }, { cookie: alice, 'idempotency-key': 'request-1' });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).job.id, job.id);
    const changed = await post(path, { kind: 'test.sample', payload: { question: 'Otra' } }, { cookie: alice, 'idempotency-key': 'request-1' });
    assert.equal(changed.status, 409);
    const sameBody = { kind: 'outline.generate', payload: { input: 'test' } };
    const duplicates = await Promise.all([post(path, sameBody, { cookie: alice, 'idempotency-key': 'concurrent' }), post(path, sameBody, { cookie: alice, 'idempotency-key': 'concurrent' })]);
    assert.deepEqual(duplicates.map(item => item.status).sort(), [200, 201]);
    const duplicateJobs = await Promise.all(duplicates.map(item => item.json()));
    assert.equal(duplicateJobs[0].job.id, duplicateJobs[1].job.id);
    assert.equal((await post(`${path}/${duplicateJobs[0].job.id}/cancel`, {}, { cookie: alice })).status, 200);
    const agent = token => ({ authorization: `Bearer ${token}` });
    const claim = (runner, kinds) => post('/api/runner/jobs/claim', { kinds }, agent(runner.token));
    assert.equal((await (await claim(runnerOther, ['test.sample'])).json()).job, null);
    assert.equal((await (await claim(runnerA, ['outline.generate'])).json()).job, null);
    const results = await Promise.all([claim(runnerA, ['test.sample']), claim(runnerB, ['test.sample'])]);
    const values = await Promise.all(results.map(item => item.json()));
    assert.equal(values.filter(value => value.job).length, 1);
    const idx = values.findIndex(value => value.job);
    const winner = [runnerA, runnerB][idx];
    const loser = [runnerA, runnerB][1 - idx];
    const { lease } = values[idx];
    assert.equal(values[idx].leaseDurationMs, 60_000);
    assert.equal(values[idx].job.id, job.id);
    assert.notEqual((await db.prepare('SELECT lease_hash FROM jobs WHERE id = ?').bind(job.id).first()).lease_hash, lease);
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`, { lease }, agent(loser.token))).status, 409);
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`, { lease }, agent(winner.token))).status, 200);
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`, { lease, progress: 'reading' }, agent(loser.token))).status, 409);
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`, { lease, progress: 'document secret' }, agent(winner.token))).status, 400);
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`, { lease, progress: 'reading' }, agent(winner.token))).status, 200);
    const current = (await (await req(path, { headers: { cookie: alice } })).json()).jobs.find(item => item.id === job.id);
    assert.equal(current.progress, 'reading');
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`, { lease }, agent(winner.token))).status, 200);
    assert.equal((await (await req(path, { headers: { cookie: alice } })).json()).jobs.find(item => item.id === job.id).progress, 'reading');
    assert.equal((await req(path, { headers: { cookie: bob } })).status, 404);
    const owner = (await db.prepare('SELECT owner_id FROM projects WHERE id=?').bind(project.id).first()).owner_id;
    for (const [id, state] of [['chat-old','succeeded'], ['chat-active','queued']]) await db.prepare("INSERT INTO jobs(id,project_id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at) VALUES(?,?,?,'tender-chat.send',?,'{}',?,'2026','2026')").bind(id,project.id,owner,id,state).run();
    const bucket = await worker.getR2Bucket('FILES'); await bucket.put('chat-source', 'documento');
    await db.prepare("INSERT INTO project_files(id,project_id,name,content_type,object_key,size,created_at) VALUES('chat-file',?,'pliego.txt','text/plain','chat-source',9,'2026')").bind(project.id).run();
    const clearPath = `/api/projects/${project.id}/chat-history`;
    assert.equal((await req(clearPath, { method: 'DELETE', headers: { cookie: bob, origin: 'http://localhost' } })).status, 404);
    assert.equal((await req(clearPath, { method: 'DELETE', headers: { cookie: alice, origin: 'http://evil.test' } })).status, 403);
    assert.equal((await req(clearPath, { method: 'DELETE', headers: { cookie: alice, origin: 'http://localhost' } })).status, 409);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE id IN ('chat-old','chat-active')").first()).n, 2);
    await db.prepare("UPDATE jobs SET state='cancelled' WHERE id='chat-active'").run();
    assert.equal((await req(clearPath, { method: 'DELETE', headers: { cookie: alice, origin: 'http://localhost' } })).status, 204);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE id IN ('chat-old','chat-active')").first()).n, 0);
    assert.ok(await db.prepare('SELECT id FROM jobs WHERE id=?').bind(job.id).first());
    assert.equal(await (await bucket.get('chat-source')).text(), 'documento');
    assert.ok(await db.prepare("SELECT id FROM project_files WHERE id='chat-file'").first());
    await db.prepare("INSERT INTO provider_credentials(id,owner_id,provider,model,key_id,iv,ciphertext,created_at) VALUES('chat-key',?,'opencode-go','fixture','test','iv','ciphertext','2026')").bind(owner).run();
    const previousPayload = { question: 'Pregunta', fileIds: ['chat-file'], dataProcessingConsent: true, language: 'es' };
    await db.prepare("INSERT INTO jobs(id,project_id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at,result_json) VALUES('chat-race',?,?,'tender-chat.send','race-previous',?,'succeeded','2026','2026',?)").bind(project.id,owner,JSON.stringify(previousPayload),JSON.stringify({answer:'Respuesta'})).run();
    const [newChat, cleared] = await Promise.all([
      post(path, {kind:'tender-chat.send',credentialId:'chat-key',payload:{...previousPayload,previousJobId:'chat-race'}}, {cookie:alice,'idempotency-key':'race-new'}),
      req(clearPath, {method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}}),
    ]);
    if (newChat.status === 201) {
      assert.equal(cleared.status, 409);
      const createdChat = (await newChat.json()).job;
      assert.ok(await db.prepare("SELECT id FROM jobs WHERE id='chat-race'").first());
      await db.prepare("UPDATE jobs SET state='cancelled' WHERE id=?").bind(createdChat.id).run();
      assert.equal((await req(clearPath,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}})).status,204);
    } else {
      assert.equal(cleared.status, 204);
      assert.ok([400,409].includes(newChat.status));
    }

    const questionPath = `/api/runner/jobs/${job.id}/questions`;
    const question = { lease, toolCallId: 'tool-1', question: '¿Cómo continuamos?', options: [{ label: 'Continuar', custom: false }, { label: 'Precisar', custom: true }] };
    assert.equal((await post(questionPath, question, agent(loser.token))).status, 409);
    const asked = await post(questionPath, question, agent(winner.token));
    assert.equal(asked.status, 201, await asked.clone().text());
    const questionId = (await asked.json()).question.id;
    assert.equal((await post(questionPath, question, agent(winner.token))).status, 200);
    assert.equal((await post(questionPath, { ...question, question: 'Otra' }, agent(winner.token))).status, 409);
    const userQuestions = `/api/projects/${project.id}/job-questions`;
    assert.equal((await req(userQuestions, { headers: { cookie: bob } })).status, 404);
    assert.equal((await (await req(userQuestions, { headers: { cookie: alice } })).json()).questions[0].id, questionId);
    const answerPath = `${userQuestions}/${questionId}/answer`;
    assert.equal((await post(answerPath, { option: 1, answer: '' }, { cookie: alice })).status, 400);
    assert.equal((await post(answerPath, { option: 0 }, { cookie: alice, origin: 'http://evil.example' })).status, 403);
    const answers = await Promise.all([post(answerPath, { option: 0 }, { cookie: alice }), post(answerPath, { option: 1, answer: 'Detalles' }, { cookie: alice })]);
    assert.deepEqual(answers.map(response => response.status).sort(), [200, 409]);
    const answered = await (await post(`${questionPath}/${questionId}`, { lease }, agent(winner.token))).json();
    assert.equal(answered.question.state, 'answered');
    assert.ok(['Continuar', 'Detalles'].includes(answered.question.response.answer));
    const winningAnswer = answered.question.response.is_custom ? { option: 1, answer: 'Detalles' } : { option: 0 };
    assert.equal((await post(answerPath, winningAnswer, { cookie: alice })).status, 200);
    assert.equal((await (await req(userQuestions, { headers: { cookie: alice } })).json()).questions.length, 0);
    const pending = await (await post(questionPath, { ...question, toolCallId: 'tool-2' }, agent(winner.token))).json();
    assert.equal((await post(questionPath, { ...question, toolCallId: 'tool-3' }, agent(winner.token))).status, 409);
    const completion = { lease, status: 'succeeded', result: { text: 'respuesta' } };
    assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, completion, agent(winner.token))).status, 200);
    assert.equal((await (await req(path, { headers: { cookie: alice } })).json()).jobs.find(item => item.id === job.id).progress, null);
    assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, completion, agent(winner.token))).status, 200);
    assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, { ...completion, result: { text: 'otra' } }, agent(winner.token))).status, 409);
    assert.equal((await req(path, { headers: { cookie: bob } })).status, 404);
    assert.equal((await (await req(path, { headers: { cookie: alice } })).json()).jobs.find(item => item.id === job.id).state, 'succeeded');
    const next = (await (await post(path, { kind: 'test.sample', payload: {} }, { cookie: alice, 'idempotency-key': crypto.randomUUID() })).json()).job;
    const taken = await (await claim(winner, ['test.sample'])).json();
    assert.equal(taken.job.id, next.id);
    await db.prepare('UPDATE jobs SET lease_expires_at = 0 WHERE id = ?').bind(next.id).run();
    assert.equal((await post(`/api/runner/jobs/${next.id}/complete`, { lease: taken.lease, status: 'succeeded', result: {} }, agent(winner.token))).status, 409);
    const entries = (await (await req(path, { headers: { cookie: alice } })).json()).jobs;
    assert.equal(entries.find(item => item.id === next.id).state, 'interrupted');
    assert.equal((await (await claim(winner, ['test.sample'])).json()).job, null);
    const cancelled = (await (await post(path, { kind: 'test.sample', payload: {} }, { cookie: alice, 'idempotency-key': crypto.randomUUID() })).json()).job;
    const running = await (await claim(winner, ['test.sample'])).json();
    assert.equal(running.job.id, cancelled.id);
    const cancelQuestion = await (await post(`/api/runner/jobs/${cancelled.id}/questions`, { ...question, lease: running.lease, toolCallId: 'cancel-question' }, agent(winner.token))).json();
    assert.equal((await post(`${path}/${cancelled.id}/cancel`, {}, { cookie: alice })).status, 200);
    assert.equal((await post(`/api/projects/${project.id}/job-questions/${cancelQuestion.question.id}/answer`, { option: 0 }, { cookie: alice })).status, 409);
    assert.equal((await post(`/api/runner/jobs/${cancelled.id}/questions/${cancelQuestion.question.id}`, { lease: running.lease }, agent(winner.token))).status, 409);
    assert.equal((await post(`/api/runner/jobs/${cancelled.id}/complete`, { lease: running.lease, status: 'succeeded', result: {} }, agent(winner.token))).status, 409);
    assert.equal((await req(`/api/runners/${winner.runner.id}`, { method: 'DELETE', headers: { cookie: alice, origin: 'http://localhost' } })).status, 204);
    assert.equal((await claim(winner, ['test.sample'])).status, 401);
    const unimplemented = (await (await post(path, { kind: 'test.sample', payload: { question: 'Pendiente' } }, { cookie: alice, 'idempotency-key': 'chat-pending' })).json()).job;
    const task = (await (await post(path, { kind: 'economic-offer.calculate', payload: { draft: { items: [{ id: '1', name: 'Artículo', quantity: '2', price: '5', rate: '20' }] } } }, { cookie: alice, 'idempotency-key': 'economic-1' })).json()).job;
    const config = join(local, 'runner.json');
    await writeFile(config, JSON.stringify({ server: (await worker.ready).origin, token: loser.token, runnerId: loser.runner.id }), { mode: 0o600 });
    const cli = process.env.SAVIA_TEST_RUNNER_CLI || resolve(root, '../runner/cli.mjs');
    const pairing = await (await post('/api/runner-pairings', {}, { cookie: alice })).json();
    const pairedConfig = join(local, 'paired-runner.json');
    const invoke = (args, input = '') => new Promise((resolveResult, reject) => {
      const child = spawn(process.execPath, [cli, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
      child.on('error', reject); child.on('close', status => resolveResult({ status, output }));
      child.stdin.end(input);
    });
    const paired = await invoke(['pair', '--server', (await worker.ready).origin, '--config', pairedConfig], pairing.code);
    assert.equal(paired.status, 0, paired.output);
    const heartbeat = await invoke(['heartbeat', '--config', pairedConfig]);
    assert.equal(heartbeat.status, 0, heartbeat.output);
    assert.equal(paired.output.includes(pairing.code), false);
    const configData = JSON.parse(await readFile(pairedConfig, 'utf8'));
    const pendingOutbox = createOutbox({ directory: `${pairedConfig}.outbox`, ...configData });
    const pendingId = crypto.randomUUID();
    await pendingOutbox.save(pendingId, { lease: 'fixture-lease', status: 'succeeded', result: { text: 'resultado privado' } });
    const listing = await invoke(['outbox-list', '--config', pairedConfig]);
    assert.equal(listing.status, 0, listing.output); assert.match(listing.output, new RegExp(pendingId)); assert.equal(listing.output.includes('resultado privado'), false);
    const nextPair = await (await post('/api/runner-pairings', {}, { cookie: alice })).json();
    const blockedPair = await invoke(['pair', '--server', (await worker.ready).origin, '--config', pairedConfig], nextPair.code);
    assert.notEqual(blockedPair.status, 0); assert.match(blockedPair.output, /resultados/i);
    const exportFile = join(local, 'export.json');
    const exported = await invoke(['outbox-export', '--job', pendingId, '--output', exportFile, '--config', pairedConfig]);
    assert.equal(exported.status, 0, exported.output);
    assert.equal(JSON.parse(await readFile(exportFile, 'utf8')).result.text, 'resultado privado');
    const discarded = await invoke(['outbox-discard', '--job', pendingId, '--state', 'pending', '--config', pairedConfig]);
    assert.equal(discarded.status, 0, discarded.output);
    const repaired = await invoke(['pair', '--server', (await worker.ready).origin, '--config', pairedConfig], nextPair.code);
    assert.equal(repaired.status, 0, repaired.output);
    const processResult = await new Promise((resolveResult, reject) => {
      const child = spawn(process.execPath, [cli, 'run-once', '--config', config], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
      child.on('error', reject); child.on('close', status => resolveResult({ status, output }));
    });
    assert.equal(processResult.status, 0, processResult.output);
    const savedJob = (await (await req(path, { headers: { cookie: alice } })).json()).jobs.find(item => item.id === task.id);
    assert.equal(savedJob.state, 'succeeded');
    assert.equal(savedJob.result.total, '12.00');
    const visibleRunner = (await (await req('/api/runners', { headers: { cookie: alice } })).json()).runners.find(item => item.id === loser.runner.id);
    assert.ok(visibleRunner.lastSeenAt);
    assert.equal((await (await req(path, { headers: { cookie: alice } })).json()).jobs.find(item => item.id === unimplemented.id).state, 'queued');
    const daemonTask = (await (await post(path, { kind: 'economic-offer.calculate', payload: { draft: { items: [{ id: '2', name: 'Dos', quantity: '3', price: '4', rate: '0' }] } } }, { cookie: alice, 'idempotency-key': 'economic-daemon' })).json()).job;
    const daemon = spawn(process.execPath, [cli, 'run', '--config', config, '--poll-ms', '100'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let daemonOutput = '';
    daemon.stdout.on('data', chunk => { daemonOutput += chunk; }); daemon.stderr.on('data', chunk => { daemonOutput += chunk; });
    const stopped = new Promise(resolveResult => daemon.on('close', (status, signal) => resolveResult({ status, signal })));
    try {
      const deadline = Date.now() + 10_000;
      let state;
      while (Date.now() < deadline) {
        state = (await (await req(path, { headers: { cookie: alice } })).json()).jobs.find(item => item.id === daemonTask.id);
        if (state.state === 'succeeded' || daemon.exitCode !== null) break;
        await new Promise(resolveWait => setTimeout(resolveWait, 100));
      }
      assert.equal(state.state, 'succeeded', daemonOutput);
      assert.equal(state.result.total, '12.00');
    } finally {
      daemon.kill('SIGTERM');
      await stopped;
    }
    const interactive = (await (await post(path, { kind: 'test.interactive', payload: {} }, { cookie: alice, 'idempotency-key': 'interactive' })).json()).job;
    const interactiveRun = runOnce({ server: (await worker.ready).origin, token: loser.token, questionPollMs: 30, handlers: { 'test.interactive': async (_, ctx) => ({ response: await ctx.askUser({ tool_call_id: 'interactive-1', question: '¿Continuamos?', options: [{ label: 'Sí', custom: false }, { label: 'Otro', custom: true }] }) }) } });
    let pendingQuestion;
    const questionDeadline = Date.now() + 5000;
    while (Date.now() < questionDeadline) {
      pendingQuestion = (await (await req(userQuestions, { headers: { cookie: alice } })).json()).questions.find(item => item.jobId === interactive.id);
      if (pendingQuestion) break;
      await new Promise(resolveWait => setTimeout(resolveWait, 30));
    }
    assert.ok(pendingQuestion);
    assert.equal((await post(`${userQuestions}/${pendingQuestion.id}/answer`, { option: 1, answer: 'Con ajustes' }, { cookie: alice })).status, 200);
    assert.equal((await interactiveRun).state, 'succeeded');
    const interactiveSaved = (await (await req(path, { headers: { cookie: alice } })).json()).jobs.find(item => item.id === interactive.id);
    assert.equal(interactiveSaved.result.response.answer, 'Con ajustes');
    const retryJob = (await (await post(path, { kind: 'test.delivery', payload: {} }, { cookie: alice, 'idempotency-key': 'lost-ack' })).json()).job;
    const originalFetch = globalThis.fetch;
    let dropped = false, executions = 0;
    try {
      globalThis.fetch = async (url, options) => {
        const response = await originalFetch(url, options);
        if (!dropped && String(url).endsWith(`/api/runner/jobs/${retryJob.id}/complete`)) {
          assert.equal(response.status, 200); dropped = true; throw new Error('simulated connection loss after commit');
        }
        return response;
      };
      const outcome = await runOnce({ server: (await worker.ready).origin, token: loser.token, retryDelayMs: 10, handlers: { 'test.delivery': async () => { executions++; return { text: 'guardado' }; } } });
      assert.equal(outcome.state, 'succeeded'); assert.equal(outcome.jobId, retryJob.id);
      assert.equal(dropped, true); assert.equal(executions, 1);
    } finally { globalThis.fetch = originalFetch; }
    const retried = (await (await req(path, { headers: { cookie: alice } })).json()).jobs.find(item => item.id === retryJob.id);
    assert.equal(retried.state, 'succeeded'); assert.equal(retried.result.text, 'guardado');
    const durableConfig = { directory: join(local, 'durable'), server: (await worker.ready).origin, token: loser.token, runnerId: loser.runner.id };
    const durable = createOutbox(durableConfig);
    const durableJob = (await (await post(path, { kind: 'test.durable', payload: {} }, { cookie: alice, 'idempotency-key': 'durable-ack' })).json()).job;
    let committed = false;
    try {
      globalThis.fetch = async (url, options) => {
        const response = await originalFetch(url, options);
        if (!committed && String(url).endsWith(`/api/runner/jobs/${durableJob.id}/complete`)) { assert.equal(response.status, 200); committed = true; throw new Error('respuesta perdida'); }
        return response;
      };
      await assert.rejects(runOnce({ server: durableConfig.server, token: loser.token, outbox: durable, deliveryTimeoutMs: 0, handlers: { 'test.durable': async () => ({ text: 'recuperable' }) } }), /respuesta perdida/);
    } finally { globalThis.fetch = originalFetch; }
    assert.equal((await durable.list()).length, 1);
    assert.equal((await recoverPending({ server: durableConfig.server, token: loser.token, outbox: createOutbox(durableConfig) })).delivered, 1);
    assert.deepEqual(await durable.list(), []);
    for (const type of ['expired', 'cancelled']) {
      const pending = (await (await post(path, { kind: 'test.durable', payload: {} }, { cookie: alice, 'idempotency-key': `durable-${type}` })).json()).job;
      try {
        globalThis.fetch = async (url, options) => String(url).endsWith(`/api/runner/jobs/${pending.id}/complete`) ? new Response('{}', { status: 503 }) : originalFetch(url, options);
        await assert.rejects(runOnce({ server: durableConfig.server, token: loser.token, outbox: durable, deliveryTimeoutMs: 0, handlers: { 'test.durable': async () => ({ text: 'conservar' }) } }), /503/);
      } finally { globalThis.fetch = originalFetch; }
      if (type === 'expired') await db.prepare('UPDATE jobs SET lease_expires_at = 0 WHERE id = ?').bind(pending.id).run();
      else assert.equal((await post(`${path}/${pending.id}/cancel`, {}, { cookie: alice })).status, 200);
      const recovered = await recoverPending({ server: durableConfig.server, token: loser.token, outbox: createOutbox(durableConfig) });
      assert.deepEqual(recovered.rejected, [pending.id]);
      assert.equal((await durable.read(pending.id, 'rejected')).result.text, 'conservar');
      const final = (await (await req(path, { headers: { cookie: alice } })).json()).jobs.find(item => item.id === pending.id);
      assert.equal(final.state, type === 'expired' ? 'interrupted' : 'cancelled');
    }
    const crashJob = (await (await post(path, { kind: 'economic-offer.calculate', payload: { draft: { items: [{ id: '3', name: 'Tres', quantity: '2', price: '6', rate: '0' }] } } }, { cookie: alice, 'idempotency-key': 'crash-recovery' })).json()).job;
    let crashChild, interrupted = false;
    const proxy = createServer(async (incoming, outgoing) => {
      try {
        let raw = ''; for await (const chunk of incoming) raw += chunk;
        const response = await fetch(`${(await worker.ready).origin}${incoming.url}`, { method: incoming.method, headers: { authorization: incoming.headers.authorization, 'content-type': 'application/json' }, body: raw });
        if (!interrupted && incoming.url === `/api/runner/jobs/${crashJob.id}/complete`) {
          assert.equal(response.status, 200); interrupted = true; crashChild.kill('SIGKILL'); outgoing.destroy(); return;
        }
        outgoing.writeHead(response.status, { 'content-type': 'application/json' }); outgoing.end(await response.text());
      } catch { outgoing.destroy(); }
    });
    await new Promise(resolveListen => proxy.listen(0, '127.0.0.1', resolveListen));
    try {
      const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
      const crashConfig = join(local, 'crash-runner.json');
      await writeFile(crashConfig, JSON.stringify({ server: proxyUrl, token: loser.token, runnerId: loser.runner.id }), { mode: 0o600 });
      crashChild = spawn(process.execPath, [cli, 'run-once', '--config', crashConfig], { stdio: ['ignore', 'pipe', 'pipe'] });
      const watchdog = setTimeout(() => crashChild.kill('SIGKILL'), 10_000);
      try { await new Promise((resolveClose, reject) => { crashChild.on('error', reject); crashChild.on('close', resolveClose); }); }
      finally { clearTimeout(watchdog); }
      assert.equal(interrupted, true);
      const encrypted = await readFile(join(`${crashConfig}.outbox`, `${crashJob.id}.json`), 'utf8');
      assert.equal(encrypted.includes('12.00'), false);
      const restart = await invoke(['run-once', '--config', crashConfig]);
      assert.equal(restart.status, 0, restart.output); assert.match(restart.output, /Resultados recuperados: 1/);
      const crashOutbox = createOutbox({ directory: `${crashConfig}.outbox`, server: proxyUrl, token: loser.token, runnerId: loser.runner.id });
      assert.deepEqual(await crashOutbox.list(), []);
    } finally { proxy.closeAllConnections(); await new Promise(resolveClose => proxy.close(resolveClose)); }
  } finally {
    await worker?.dispose();
    await rm(build, { recursive: true, force: true });
    await rm(local, { recursive: true, force: true });
  }
});
