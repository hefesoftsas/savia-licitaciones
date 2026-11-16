import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runOnce } from '../../runner/work-loop.mjs';
import { createTechnicalAnalysisHandler } from '../../runner/technical-analysis.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('los análisis del plan se revisan y aceptan con fuentes vigentes y versiones aisladas', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-analysis-')); let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
    worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'analysis-test' }, r2Buckets: ['FILES'], bindings: { AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', CREDENTIAL_KEY_HEX: '11'.repeat(32), CREDENTIAL_KEY_ID: 'test' } }));
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    async function signup(name) { const response = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; }
    const alice = await signup('alice'), bob = await signup('bob');
    const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project;
    const jobsPath = `/api/projects/${project.id}/jobs`, analyses = `/api/projects/${project.id}/technical-analyses`;
    const upload = () => req(`/api/projects/${project.id}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': 'pliego.txt', 'content-type': 'text/plain' }, body: 'El contrato exige informes mensuales.' });
    const file = (await (await upload()).json()).file;
    const credential = (await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'fixture', secret: 'fixture-secret' }, { cookie: alice })).json()).credential;
    const pairing = await (await post('/api/runner-pairings', {}, { cookie: alice })).json(); const runner = await (await post('/api/runners/pair', { code: pairing.code, name: 'Equipo' })).json();
    const agent = { authorization: `Bearer ${runner.token}` };
    const body = { kind: 'technical-plan.analyze', credentialId: credential.id, payload: { category: 'technical-score', fileIds: [file.id], language: 'es', dataProcessingConsent: true } };
    assert.equal((await post(jobsPath, { ...body, payload: { ...body.payload, category: 'unknown' } }, { cookie: alice, 'idempotency-key': 'bad' })).status, 400);
    assert.equal((await post(jobsPath, { ...body, payload: { ...body.payload, dataProcessingConsent: false } }, { cookie: alice, 'idempotency-key': 'no-consent' })).status, 400);
    const created = await post(jobsPath, body, { cookie: alice, 'idempotency-key': 'analysis-1' }); assert.equal(created.status, 201, await created.clone().text()); const job = (await created.json()).job;
    const claim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.analyze'] }, agent)).json(); assert.equal(claim.job.id, job.id);
    assert.equal((await post(`/api/runner/jobs/${job.id}/renew`, {lease:claim.lease,progress:'reading'},agent)).status,200);
    const activity=(await (await req(analyses,{headers:{cookie:alice}})).json()).jobs[0];
    assert.equal(activity.progress,'reading');assert.equal(activity.runnerName,'Equipo');assert.ok(activity.updatedAt);
    assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, { lease: claim.lease, status: 'succeeded', result: { content: 'Criterio técnico verificable.' } }, agent)).status, 200);
    assert.equal((await req(analyses, { headers: { cookie: bob } })).status, 404);
    assert.equal((await post(`${analyses}/technical-score/accept`, { jobId: job.id, revision: 0 }, { cookie: bob })).status, 404);
    const accepted = await post(`${analyses}/technical-score/accept`, { jobId: job.id, revision: 0 }, { cookie: alice }); assert.equal(accepted.status, 200, await accepted.clone().text());
    const saved = (await (await req(analyses, { headers: { cookie: alice } })).json()).analyses[0]; assert.equal(saved.content, 'Criterio técnico verificable.'); assert.equal(saved.revision, 1); assert.equal(saved.current, true);
    assert.equal((await post(`${analyses}/technical-score/accept`, { jobId: job.id, revision: 0 }, { cookie: alice })).status, 200);
    await upload();
    const stale = (await (await req(analyses, { headers: { cookie: alice } })).json()).analyses[0]; assert.equal(stale.current, false);
    assert.equal((await post(`${analyses}/technical-score/accept`, { jobId: job.id, revision: 1 }, { cookie: alice })).status, 409);
    const generatedJob = (await (await post(jobsPath, body, { cookie: alice, 'idempotency-key': 'analysis-pi' })).json()).job;
    let calls = 0, sawDocument = false;
    const fakeProvider = ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) {
      calls++; const context = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `analysis-${calls}` }; request.onRequestStart?.(context);
      sawDocument ||= JSON.stringify(request.body.messages).includes('informes mensuales');
      const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-file', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] } : { role: 'assistant', content: 'Los informes son mensuales (pliego.txt).\n<suggested_questions>[]</suggested_questions>' };
      return request.consumeResponse(new Response(JSON.stringify({ id: `analysis-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), context);
    } });
    const outcome = await runOnce({ server: (await worker.ready).origin, token: runner.token, handlers: { 'technical-plan.analyze': createTechnicalAnalysisHandler({ createAiService: fakeProvider }) } });
    assert.equal(outcome.state, 'succeeded'); assert.equal(outcome.jobId, generatedJob.id); assert.equal(sawDocument, true);
    const candidates = (await (await req(analyses, { headers: { cookie: alice } })).json()).jobs;
    const candidate = candidates.find(item => item.id === generatedJob.id); assert.equal(candidate.stale, false); assert.match(candidate.result.content, /informes son mensuales/);
    const concurrent = await Promise.all([post(`${analyses}/technical-score/accept`, { jobId: generatedJob.id, revision: 1 }, { cookie: alice }), post(`${analyses}/technical-score/accept`, { jobId: generatedJob.id, revision: 1 }, { cookie: alice })]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 200]);
    let proposalId;
    for (const mode of ['question','proposal']) {
      const discussion = await post(jobsPath, {kind:'tender-chat.send',credentialId:credential.id,payload:{question:mode==='question'?'¿Qué exige?':'Agregar informes trimestrales',fileIds:[file.id],language:'es',dataProcessingConsent:true,analysisDiscussion:{category:'technical-score',revision:2,baseJobId:generatedJob.id,mode}}}, {cookie:alice,'idempotency-key':`discussion-${mode}`});
      assert.equal(discussion.status,201,await discussion.clone().text());
      const discussionJob=(await discussion.json()).job;
      assert.match(discussionJob.payload.question,/informes son mensuales/);
      const outcomeDiscussion=await runOnce({server:(await worker.ready).origin,token:runner.token,handlers:{'tender-chat.send':async payload=>{assert.match(payload.question,/informes son mensuales/);return {answer:mode==='question'?'Exige informes mensuales.':'Análisis revisado con informes trimestrales.'};}}});
      assert.equal(outcomeDiscussion.jobId,discussionJob.id);assert.equal(outcomeDiscussion.state,'succeeded');
      assert.match((await (await req(analyses,{headers:{cookie:alice}})).json()).analyses[0].content,/informes son mensuales/);
      if(mode==='proposal') {
        proposalId=discussionJob.id;
        const applied=await post(`${analyses}/technical-score/accept-proposal`,{jobId:discussionJob.id,revision:2},{cookie:alice});
        assert.equal(applied.status,200,await applied.clone().text());
        assert.match((await (await req(analyses,{headers:{cookie:alice}})).json()).analyses[0].content,/informes trimestrales/);
        assert.equal((await post(`${analyses}/technical-score/accept-proposal`,{jobId:discussionJob.id,revision:2},{cookie:alice})).status,409);
      }
    }
    assert.equal((await post(`${analyses}/technical-score/edit`,{jobId:proposalId,revision:3,content:'Análisis editado manualmente.'},{cookie:alice})).status,200);
    assert.equal((await post(`${analyses}/technical-score/edit`,{jobId:proposalId,revision:3,content:'Cambio obsoleto'},{cookie:alice})).status,409);
    assert.equal((await (await req(analyses,{headers:{cookie:alice}})).json()).analyses[0].content,'Análisis editado manualmente.');
    const pendingJob = (await (await post(jobsPath, body, { cookie: alice, 'idempotency-key': 'before-file-removal' })).json()).job;
    const pendingClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.analyze'] }, agent)).json(); assert.equal(pendingClaim.job.id, pendingJob.id);
    assert.equal((await req(`/api/projects/${project.id}/files/${file.id}`, { method: 'DELETE', headers: { cookie: alice, origin: 'http://localhost' } })).status, 204);
    assert.equal((await post(`/api/runner/jobs/${pendingJob.id}/files/${file.id}`, { lease: pendingClaim.lease }, agent)).status, 409);
    assert.equal((await post(jobsPath, body, { cookie: alice, 'idempotency-key': 'after-file-removal' })).status, 404);
    const afterRemoval = (await (await req(analyses, { headers: { cookie: alice } })).json()).analyses[0]; assert.equal(afterRemoval.current, false); assert.match(afterRemoval.content, /editado manualmente/);

  } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
