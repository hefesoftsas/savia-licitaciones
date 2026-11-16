import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { recoverPending, runOnce } from '../../runner/work-loop.mjs';
import { createRupAnalysisHandler } from '../../runner/rup-analysis.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { PDFDocument } = require('pdf-lib');

test('análisis RUP por cuenta usa concesiones, aislamiento y recuperación idempotente', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-rup-job-')); let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
    worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'rup-jobs-test' }, r2Buckets: ['FILES'], bindings: { AUTH_ALLOW_REGISTRATION: 'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', CREDENTIAL_KEY_HEX: '11'.repeat(32), CREDENTIAL_KEY_ID: 'test' } }));
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const post = (path, body, headers = {}, origin = 'http://localhost') => req(path, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    async function signup(name) { const r = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
    const alice = await signup('alice'), bob = await signup('bob');
    const doc = await PDFDocument.create(); doc.addPage().drawText('Liquidity 1.25'); const bytes = await doc.save();
    const certificate = await (await req('/api/rup/certificate', { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'x-rup-version': '0', 'x-file-name': 'RUP.pdf' }, body: bytes })).json();
    const credential = (await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'fixture', secret: 'fixture-secret' }, { cookie: alice })).json()).credential;
    const pair = await (await post('/api/runner-pairings', {}, { cookie: alice })).json(); const runner = await (await post('/api/runners/pair', { code: pair.code, name: 'Equipo' })).json();
    const pair2 = await (await post('/api/runner-pairings', {}, { cookie: bob })).json(); const other = await (await post('/api/runners/pair', { code: pair2.code, name: 'Otro' })).json();
    const agent = value => ({ authorization: `Bearer ${value.token}` });
    const body = { certificateId: certificate.certificate.id, certificateVersion: certificate.version, credentialId: credential.id, language: 'es', dataProcessingConsent: true };
    const create = (data, key, cookie = alice) => post('/api/rup/analyses', data, { cookie, 'idempotency-key': key });
    const localResponse=await create({...body,credentialId:'local-runner'},'local-rup');assert.equal(localResponse.status,201,await localResponse.clone().text());const localJob=(await localResponse.json()).job;assert.equal(localJob.credentialId,null);assert.equal(localJob.payload.localRunner,true);assert.equal((await(await post('/api/runner/jobs/claim',{kinds:['rup.analyze'],localModel:false},agent(runner))).json()).job,null);assert.equal((await(await post('/api/runner/jobs/claim',{kinds:['rup.analyze'],localModel:true},agent(runner))).json()).job.id,localJob.id);assert.equal((await post(`/api/rup/analyses/${localJob.id}/cancel`,{},{cookie:alice})).status,200);
    const cnCredential=(await(await post('/api/provider-credentials',{provider:'minimax-cn-api',model:'MiniMax-M3',secret:'fixture-cn-secret'},{cookie:alice})).json()).credential;
    const cnResponse=await create({...body,credentialId:cnCredential.id},'minimax-cn');assert.equal(cnResponse.status,201);const cnJob=(await cnResponse.json()).job;const cnClaim=await(await post('/api/runner/jobs/claim',{kinds:['rup.analyze']},agent(runner))).json();assert.equal(cnClaim.job.id,cnJob.id);assert.equal((await(await post(`/api/runner/jobs/${cnJob.id}/credential`,{lease:cnClaim.lease},agent(runner))).json()).credential.provider,'minimax-cn-api');assert.equal((await post(`/api/rup/analyses/${cnJob.id}/cancel`,{},{cookie:alice})).status,200);
    const vertexCredential=(await(await post('/api/provider-credentials',{provider:'google-vertex-api',model:'gemini-fixture',secret:'fixture-vertex-secret'},{cookie:alice})).json()).credential;const vertexResponse=await create({...body,credentialId:vertexCredential.id},'vertex');assert.equal(vertexResponse.status,201);const vertexJob=(await vertexResponse.json()).job;const vertexClaim=await(await post('/api/runner/jobs/claim',{kinds:['rup.analyze']},agent(runner))).json();assert.equal(vertexClaim.job.id,vertexJob.id);assert.equal((await(await post(`/api/runner/jobs/${vertexJob.id}/credential`,{lease:vertexClaim.lease},agent(runner))).json()).credential.provider,'google-vertex-api');assert.equal((await post(`/api/rup/analyses/${vertexJob.id}/cancel`,{},{cookie:alice})).status,200);
    assert.equal((await create({ ...body, dataProcessingConsent: false }, 'no-consent')).status, 400);
    assert.equal((await create(body, 'bob', bob)).status, 404);
    assert.equal((await create({ ...body, certificateVersion: 0 }, 'stale')).status, 409);
    const created = await create(body, 'analysis-1'); assert.equal(created.status, 201, await created.clone().text()); const job = (await created.json()).job;
    assert.equal((await (await create(body, 'analysis-1')).json()).job.id, job.id);
    assert.deepEqual((await (await req('/api/rup/analyses', { headers: { cookie: bob } })).json()).jobs, []);
    assert.equal((await (await post('/api/runner/jobs/claim', { kinds: ['rup.analyze'] }, agent(other))).json()).job, null);
    const simultaneous = await Promise.all([post('/api/runner/jobs/claim', { kinds: ['rup.analyze'] }, agent(runner)), post('/api/runner/jobs/claim', { kinds: ['rup.analyze'] }, agent(runner))]);
    const results = await Promise.all(simultaneous.map(response => response.json()));
    assert.equal(results.filter(result => result.job).length, 1); const claim = results.find(result => result.job); assert.equal(claim.job.id, job.id); assert.equal(claim.job.projectId, null);
    assert.equal((await post(`/api/runner/jobs/${job.id}/rup`, { lease: claim.lease }, agent(other))).status, 409);
    assert.equal((await post(`/api/runner/jobs/${job.id}/credential`, { lease: claim.lease }, agent(other))).status, 409);
    const pdf = await post(`/api/runner/jobs/${job.id}/rup`, { lease: claim.lease }, agent(runner)); assert.equal(pdf.status, 200); assert.deepEqual(new Uint8Array(await pdf.arrayBuffer()), bytes);
    assert.equal((await (await post(`/api/runner/jobs/${job.id}/credential`, { lease: claim.lease }, agent(runner))).json()).credential.secret, 'fixture-secret');
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`, { lease: claim.lease }, agent(runner))).status, 200);
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`, { lease: claim.lease, progress: 'reading' }, agent(other))).status, 409);
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`, { lease: claim.lease, progress: 'texto privado' }, agent(runner))).status, 400);
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`, { lease: claim.lease, progress: 'reading' }, agent(runner))).status, 200);
    assert.equal((await (await req('/api/rup/analyses', { headers: { cookie: alice } })).json()).jobs.find(item => item.id === job.id).progress, 'reading');
    assert.deepEqual((await (await req('/api/rup/analyses', { headers: { cookie: bob } })).json()).jobs, []);
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`, { lease: claim.lease }, agent(runner))).status, 200);
    assert.equal((await (await req('/api/rup/analyses', { headers: { cookie: alice } })).json()).jobs.find(item => item.id === job.id).progress, 'reading');
    const completion = { lease: claim.lease, status: 'succeeded', result: { suggestions: [{ label: 'Liquidez', value: '1,25', page: 1, quote: 'Liquidez 1,25' }], rejectedCount: 0, pagesWithoutText: [] } };
    assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, completion, agent(runner))).status, 200);
    assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, completion, agent(runner))).status, 200);
    const originalRecoveryFetch = globalThis.fetch; let removed = false;
    try {
      globalThis.fetch = (url, options) => String(url).startsWith('http://localhost/') ? worker.dispatchFetch(url, options) : originalRecoveryFetch(url, options);
      const recovered = await recoverPending({ server: 'http://localhost', token: runner.token, outbox: { list: async () => [{ jobId: job.id, state: 'pending' }], read: async () => completion, remove: async () => { removed = true; } } });
      assert.equal(recovered.delivered, 1); assert.equal(removed, true);
    } finally { globalThis.fetch = originalRecoveryFetch; }

    assert.equal((await post(`/api/runner/jobs/${job.id}/rup`, { lease: claim.lease }, agent(runner))).status, 409);
    assert.equal((await (await req('/api/rup/analyses', { headers: { cookie: alice } })).json()).jobs[0].result.suggestions[0].value, '1,25');
    const next = await create(body, 'analysis-2'); const nextJob = (await next.json()).job;
    const nextClaim = await (await post('/api/runner/jobs/claim', { kinds: ['rup.analyze'] }, agent(runner))).json(); assert.equal(nextClaim.job.id, nextJob.id);
    const date = await req('/api/rup/certificate', { method: 'PATCH', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ version: certificate.version, issuedOn: '2026-10-01' }) }); assert.equal(date.status, 200);
    assert.equal((await post(`/api/runner/jobs/${nextJob.id}/rup`, { lease: nextClaim.lease }, agent(runner))).status, 409);
    assert.equal((await post(`/api/rup/analyses/${nextJob.id}/cancel`, {}, { cookie: bob })).status, 404);
    assert.equal((await post(`/api/rup/analyses/${nextJob.id}/cancel`, {}, { cookie: alice })).status, 200);
    assert.equal((await post(`/api/runner/jobs/${nextJob.id}/complete`, { ...completion, lease: nextClaim.lease }, agent(runner))).status, 409);
    const openai = (await (await post('/api/provider-credentials', { provider: 'openai-api', model: 'fixture-openai', secret: 'fixture-openai-key' }, { cookie: alice })).json()).credential;
    const third = await create({ ...body, credentialId: openai.id, certificateVersion: 2 }, 'analysis-3'); assert.equal(third.status, 201); const thirdJob = (await third.json()).job;
    let calls = 0, sawSource = false;
    const handler = createRupAnalysisHandler({ createAiService: ({ configStore }) => ({
      getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }),
      async runAgentChatCompletion(request) {
        assert.equal(configStore.load().text_model_provider, 'openai-api');
        assert.equal(configStore.load().base_url, 'https://api.openai.com/v1');
        calls++; const requestBody = { ...request.body, stream: false }, ctx = { config: configStore.load(), requestBody, requestId: `rup-${calls}` }; request.onRequestStart?.(ctx);
        sawSource ||= JSON.stringify(requestBody.messages).includes('Liquidity 1.25');
        const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-page', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'pages/1.txt' }) } }] } : { role: 'assistant', content: JSON.stringify([{ label: 'Liquidity', value: '1.25', page: 1, quote: 'Liquidity 1.25' }]) };
        return request.consumeResponse(new Response(JSON.stringify({ id: `rup-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
      },
    }) });
    const originalFetch = globalThis.fetch;
    try { globalThis.fetch = (url, options) => String(url).startsWith('http://localhost/') ? worker.dispatchFetch(url, options) : originalFetch(url, options); const outcome = await runOnce({ server: 'http://localhost', token: runner.token, handlers: { 'rup.analyze': handler } }); assert.equal(outcome.state, 'succeeded'); assert.equal(outcome.jobId, thirdJob.id); }
    finally { globalThis.fetch = originalFetch; }
    const final = (await (await req('/api/rup/analyses', { headers: { cookie: alice } })).json()).jobs.find(item => item.id === thirdJob.id);
    assert.equal(final.result.suggestions[0].value, '1.25'); assert.ok(calls >= 2); assert.equal(sawSource, true);
    const antCredential=(await(await post('/api/provider-credentials',{provider:'ant-ling-api',model:'Ling-2.6-flash',secret:'fixture-ant-key'},{cookie:alice})).json()).credential;
    const antResponse=await create({...body,credentialId:antCredential.id,certificateVersion:2},'analysis-ant');assert.equal(antResponse.status,201);const antJob=(await antResponse.json()).job;
    const antClaim=await(await post('/api/runner/jobs/claim',{kinds:['rup.analyze']},agent(runner))).json();assert.equal(antClaim.job.id,antJob.id);
    const antLease=await post(`/api/runner/jobs/${antJob.id}/credential`,{lease:antClaim.lease},agent(runner));assert.equal((await antLease.json()).credential.provider,'ant-ling-api');
    assert.equal((await post(`/api/rup/analyses/${antJob.id}/cancel`,{},{cookie:alice})).status,200);
    const zenCredential=(await(await post('/api/provider-credentials',{provider:'opencode-zen',model:'big-pickle',secret:'fixture-zen-key'},{cookie:alice})).json()).credential;
    const zenResponse=await create({...body,credentialId:zenCredential.id,certificateVersion:2},'analysis-zen');assert.equal(zenResponse.status,201);const zenJob=(await zenResponse.json()).job;
    const zenClaim=await(await post('/api/runner/jobs/claim',{kinds:['rup.analyze']},agent(runner))).json();assert.equal(zenClaim.job.id,zenJob.id);
    const zenLease=await post(`/api/runner/jobs/${zenJob.id}/credential`,{lease:zenClaim.lease},agent(runner));assert.equal((await zenLease.json()).credential.provider,'opencode-zen');
    assert.equal((await post(`/api/rup/analyses/${zenJob.id}/cancel`,{},{cookie:alice})).status,200);
    const xiaomiCredential=(await(await post('/api/provider-credentials',{provider:'xiaomi-api',model:'mimo-v2-flash',secret:'fixture-xiaomi-key'},{cookie:alice})).json()).credential;
    const xiaomiResponse=await create({...body,credentialId:xiaomiCredential.id,certificateVersion:2},'analysis-xiaomi');assert.equal(xiaomiResponse.status,201);const xiaomiJob=(await xiaomiResponse.json()).job;
    const xiaomiClaim=await(await post('/api/runner/jobs/claim',{kinds:['rup.analyze']},agent(runner))).json();assert.equal(xiaomiClaim.job.id,xiaomiJob.id);
    const xiaomiLease=await post(`/api/runner/jobs/${xiaomiJob.id}/credential`,{lease:xiaomiClaim.lease},agent(runner));assert.equal((await xiaomiLease.json()).credential.provider,'xiaomi-api');
    assert.equal((await post(`/api/rup/analyses/${xiaomiJob.id}/cancel`,{},{cookie:alice})).status,200);
    const azureCredential=(await(await post('/api/provider-credentials',{provider:'azure-openai-api',resource:'empresa-a',model:'deploy-a',secret:'fixture-azure-key'},{cookie:alice})).json()).credential;
    const azureResponse=await create({...body,credentialId:azureCredential.id,certificateVersion:2},'analysis-azure');assert.equal(azureResponse.status,201);const azureJob=(await azureResponse.json()).job;
    const azureClaim=await(await post('/api/runner/jobs/claim',{kinds:['rup.analyze']},agent(runner))).json();assert.equal(azureClaim.job.id,azureJob.id);
    const azureLease=await post(`/api/runner/jobs/${azureJob.id}/credential`,{lease:azureClaim.lease},agent(runner));assert.equal((await azureLease.json()).credential.resource,'empresa-a');
    assert.equal((await post(`/api/rup/analyses/${azureJob.id}/cancel`,{},{cookie:alice})).status,200);
    const older = (await (await create({ ...body, certificateVersion: 2 }, 'analysis-older')).json()).job;
    const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project;
    const projectJob = (await (await post(`/api/projects/${project.id}/jobs`, { kind: 'economic-offer.calculate', payload: {} }, { cookie: alice, 'idempotency-key': 'newer' })).json()).job;
    await db.prepare('UPDATE account_jobs SET created_at = ? WHERE id = ?').bind('2020-01-01T00:00:00.000Z', older.id).run();
    await db.prepare('UPDATE jobs SET created_at = ? WHERE id = ?').bind('2021-01-01T00:00:00.000Z', projectJob.id).run();
    const fairClaim = await (await post('/api/runner/jobs/claim', { kinds: ['rup.analyze', 'economic-offer.calculate'] }, agent(runner))).json();
    assert.equal(fairClaim.job.id, older.id);
    await db.prepare('UPDATE account_jobs SET lease_expires_at = ? WHERE id = ?').bind(Date.now() - 1, older.id).run();
    const expired = (await (await req('/api/rup/analyses', { headers: { cookie: alice } })).json()).jobs.find(item => item.id === older.id);
    assert.equal(expired.state, 'interrupted');
    assert.equal((await post(`/api/runner/jobs/${older.id}/renew`, { lease: fairClaim.lease }, agent(runner))).status, 409);
    const projectClaim = await (await post('/api/runner/jobs/claim', { kinds: ['rup.analyze', 'economic-offer.calculate'] }, agent(runner))).json(); assert.equal(projectClaim.job.id, projectJob.id);
    const replaced = await req('/api/rup/certificate', { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'x-rup-version': '2', 'x-file-name': 'Nuevo.pdf' }, body: bytes }); assert.equal(replaced.status, 200);
    assert.equal((await create({ ...body, certificateVersion: 2 }, 'old-certificate')).status, 409);




  } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
