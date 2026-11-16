import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runOnce } from '../../runner/work-loop.mjs';
import { createTechnicalPlanHandler } from '../../runner/technical-plan.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('el borrador de Pi respeta propietario, concesión y versión del capítulo', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-plan-pi-')); let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
    worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'plan-pi-test' }, r2Buckets: ['FILES'], bindings: {AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', CREDENTIAL_KEY_HEX: '11'.repeat(32), CREDENTIAL_KEY_ID: 'test' } }));
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    async function signup(name) { const r = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
    const alice = await signup('alice'), bob = await signup('bob');
    const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project;
    const planPath = `/api/projects/${project.id}/technical-plan`, jobsPath = `/api/projects/${project.id}/jobs`;
    const plan = await (await post(`${planPath}/nodes`, { title: 'Metodología', version: 0 }, { cookie: alice })).json(); const nodeId = plan.outline[0].id;
    const upload = await req(`/api/projects/${project.id}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': 'pliego.txt', 'content-type': 'text/plain' }, body: 'El contrato exige informes mensuales.' }); const file = (await upload.json()).file;
    const credential = (await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'fixture', secret: 'fixture-secret' }, { cookie: alice })).json()).credential;
    const pairing = await (await post('/api/runner-pairings', {}, { cookie: alice })).json(); const runner = await (await post('/api/runners/pair', { code: pairing.code, name: 'Equipo' })).json();
    const otherPair = await (await post('/api/runner-pairings', {}, { cookie: bob })).json(); const other = await (await post('/api/runners/pair', { code: otherPair.code, name: 'Otro' })).json();
    const agent = value => ({ authorization: `Bearer ${value.token}` });
    const body = { kind: 'technical-plan.generate-section', credentialId: credential.id, payload: { nodeId, planVersion: plan.version, fileIds: [file.id], instructions: 'Priorizar entregables', language: 'es', dataProcessingConsent: true } };
    assert.equal((await post(jobsPath, { ...body, payload: { ...body.payload, dataProcessingConsent: false } }, { cookie: alice, 'idempotency-key': 'no-consent' })).status, 400);
    assert.equal((await post(jobsPath, { ...body, payload: { ...body.payload, planVersion: 0 } }, { cookie: alice, 'idempotency-key': 'stale' })).status, 409);
    assert.equal((await post(jobsPath, { ...body, payload: { ...body.payload, nodeId: crypto.randomUUID() } }, { cookie: alice, 'idempotency-key': 'unknown-node' })).status, 400);
    assert.equal((await post(jobsPath, { ...body, payload: { ...body.payload, fileIds: [crypto.randomUUID()] } }, { cookie: alice, 'idempotency-key': 'unknown-file' })).status, 404);
    assert.equal((await post(jobsPath, { ...body, credentialId: crypto.randomUUID() }, { cookie: alice, 'idempotency-key': 'unknown-credential' })).status, 404);
    const created = await post(jobsPath, body, { cookie: alice, 'idempotency-key': 'draft-1' }); assert.equal(created.status, 201, await created.clone().text()); const job = (await created.json()).job;
    assert.equal((await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-section'] }, agent(other))).json()).job, null);
    const claimed = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-section'] }, agent(runner))).json(); assert.equal(claimed.job.id, job.id);
    const contextPath = `/api/runner/jobs/${job.id}/plan-context`;
    assert.equal((await post(contextPath, { lease: claimed.lease }, agent(other))).status, 409);
    const context = await post(contextPath, { lease: claimed.lease }, agent(runner)); assert.equal(context.status, 200, await context.clone().text());
    const snapshot = await context.json(); assert.equal(snapshot.node.title, 'Metodología'); assert.equal(snapshot.node.number, '1');
    assert.equal((await post(`/api/runner/jobs/${job.id}/files/${file.id}`, { lease: claimed.lease }, agent(runner))).status, 200);
    assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, { lease: claimed.lease, status: 'succeeded', result: { content: 'Borrador revisable.' } }, agent(runner))).status, 200);
    assert.equal((await post(`${planPath}/nodes/${nodeId}/apply-job`, { jobId: job.id, version: plan.version }, { cookie: bob })).status, 404);
    const applied = await post(`${planPath}/nodes/${nodeId}/apply-job`, { jobId: job.id, version: plan.version }, { cookie: alice }); assert.equal(applied.status, 200, await applied.clone().text());
    const updated = await applied.json(); assert.equal(updated.outline[0].content, 'Borrador revisable.');
    assert.equal((await post(`${planPath}/nodes/${nodeId}/apply-job`, { jobId: job.id, version: updated.version }, { cookie: alice })).status, 409);
    const next = { ...body, payload: { ...body.payload, planVersion: updated.version } };
    const second = (await (await post(jobsPath, next, { cookie: alice, 'idempotency-key': 'draft-2' })).json()).job;
    const secondClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-section'] }, agent(runner))).json(); assert.equal(secondClaim.job.id, second.id);
    const changed = await req(`${planPath}/nodes/${nodeId}/content`, { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Edición humana', version: updated.version }) }); assert.equal(changed.status, 200);
    assert.equal((await post(`/api/runner/jobs/${second.id}/plan-context`, { lease: secondClaim.lease }, agent(runner))).status, 409);
    assert.equal((await post(`/api/runner/jobs/${second.id}/complete`, { lease: secondClaim.lease, status: 'succeeded', result: { content: 'No sobrescribir' } }, agent(runner))).status, 200);
    const current = await (await req(planPath, { headers: { cookie: alice } })).json();
    assert.equal((await post(`${planPath}/nodes/${nodeId}/apply-job`, { jobId: second.id, version: current.version }, { cookie: alice })).status, 409);
    assert.equal((await (await req(planPath, { headers: { cookie: alice } })).json()).outline[0].content, 'Edición humana');
    const thirdBody = { ...body, payload: { ...body.payload, planVersion: current.version } };
    const third = (await (await post(jobsPath, thirdBody, { cookie: alice, 'idempotency-key': 'draft-3' })).json()).job;
    let modelCalls = 0, sawDocument = false;
    const fakeProvider = ({ configStore }) => ({
      getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }),
      async runAgentChatCompletion(request) {
        modelCalls++; const ctx = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `plan-${modelCalls}` };
        request.onRequestStart?.(ctx); sawDocument ||= JSON.stringify(request.body.messages).includes('informes mensuales');
        const message = modelCalls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-file', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] } : { role: 'assistant', content: 'Se prepararán informes mensuales.\n<suggested_questions>[]</suggested_questions>' };
        return request.consumeResponse(new Response(JSON.stringify({ id: `plan-${modelCalls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: modelCalls === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
      },
    });
    const outcome = await runOnce({ server: (await worker.ready).origin, token: runner.token, handlers: { 'technical-plan.generate-section': createTechnicalPlanHandler({ createAiService: fakeProvider }) } });
    assert.equal(outcome.state, 'succeeded'); assert.equal(outcome.jobId, third.id); assert.equal(sawDocument, true);
    const generated = (await (await req(jobsPath, { headers: { cookie: alice } })).json()).jobs.find(item => item.id === third.id);
    assert.equal(generated.result.content, 'Se prepararán informes mensuales.');
    const appliedPi = await post(`${planPath}/nodes/${nodeId}/apply-job`, { jobId: third.id, version: current.version }, { cookie: alice });
    assert.equal(appliedPi.status, 200); const afterPi = await appliedPi.json(); assert.equal(afterPi.outline[0].content, 'Se prepararán informes mensuales.');
    const fourthBody = { ...body, payload: { ...body.payload, planVersion: afterPi.version } };
    const fourth = (await (await post(jobsPath, fourthBody, { cookie: alice, 'idempotency-key': 'draft-4' })).json()).job;
    const fourthClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-section'] }, agent(runner))).json();
    assert.equal(fourthClaim.job.id, fourth.id);
    assert.equal((await post(`/api/runner/jobs/${fourth.id}/complete`, { lease: fourthClaim.lease, status: 'succeeded', result: { content: 'Otro borrador' } }, agent(runner))).status, 200);
    const concurrent = await Promise.all([
      post(`${planPath}/nodes/${nodeId}/apply-job`, { jobId: fourth.id, version: afterPi.version }, { cookie: alice }),
      req(`${planPath}/nodes/${nodeId}/content`, { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Nueva edición humana', version: afterPi.version }) }),
    ]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
    const final = await (await req(planPath, { headers: { cookie: alice } })).json();
    assert.equal(final.version, afterPi.version + 1); assert.ok(['Otro borrador', 'Nueva edición humana'].includes(final.outline[0].content));
  } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
