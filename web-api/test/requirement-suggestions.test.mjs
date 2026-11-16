import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const { runOnce } = await import(process.env.SAVIA_TEST_RUNNER_WORK_LOOP || new URL('../../runner/work-loop.mjs', import.meta.url));
const { createRequirementSuggestionsHandler } = await import(process.env.SAVIA_TEST_REQUIREMENTS_MODULE || new URL('../../runner/requirement-suggestions.mjs', import.meta.url));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { PDFDocument } = require('pdf-lib');

test('sugerencias verificables requieren consentimiento y solo se aceptan con fuentes vigentes', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-requirements-api-')); let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
    worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'requirements-test' }, r2Buckets: ['FILES'], bindings: {AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', CREDENTIAL_KEY_HEX: '11'.repeat(32), CREDENTIAL_KEY_ID: 'test' } }));
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    async function signup(name) { const r = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
    const alice = await signup('alice'), bob = await signup('bob');
    const project = (await (await post('/api/projects', { title: 'Oferta' }, { cookie: alice })).json()).project;
    const jobsPath = `/api/projects/${project.id}/jobs`;
    const upload = async name => (await (await req(`/api/projects/${project.id}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': name, 'content-type': 'text/plain' }, body: 'Debe acreditar liquidez de 1,5.' })).json()).file;
    const file = await upload('pliego.txt');
    const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = await pdf.save();
    const cert = await (await req('/api/rup/certificate', { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'x-rup-version': '0', 'x-file-name': 'RUP.pdf' }, body: bytes })).json();
    const fact = (await (await post('/api/rup/facts', { certificateId: cert.certificate.id, certificateVersion: cert.version, label: 'Liquidez', value: '2', page: 1 }, { cookie: alice })).json()).fact;
    const credential = (await (await post('/api/provider-credentials', { provider:'openai-api', model: 'fixture', secret: 'secret' }, { cookie: alice })).json()).credential;
    const pairing = await (await post('/api/runner-pairings', {}, { cookie: alice })).json(); const runner = await (await post('/api/runners/pair', { code: pairing.code, name: 'Equipo' })).json();
    const pairing2 = await (await post('/api/runner-pairings', {}, { cookie: bob })).json(); const other = await (await post('/api/runners/pair', { code: pairing2.code, name: 'Otro' })).json();
    const agent = value => ({ authorization: `Bearer ${value.token}` });
    const body = { kind: 'requirements.suggest', credentialId: credential.id, payload: { fileIds: [file.id], language: 'es', dataProcessingConsent: true, includeRup: true } };
    const create = (input, key, cookie = alice) => post(jobsPath, input, { cookie, 'idempotency-key': key });
    assert.equal((await create({ ...body, payload: { ...body.payload, dataProcessingConsent: false } }, 'no-consent')).status, 400);
    assert.equal((await create(body, 'other', bob)).status, 404);
    const response = await create(body, 'suggest-1'); assert.equal(response.status, 201, await response.clone().text()); const job = (await response.json()).job;
    assert.equal((await create(body, 'suggest-1')).status, 200); assert.equal((await create(body, 'duplicate-active')).status, 409);
    const claimed = await (await post('/api/runner/jobs/claim', { kinds: ['requirements.suggest'] }, agent(runner))).json(); assert.equal(claimed.job.id, job.id);
    const context = `/api/runner/jobs/${job.id}/requirements-context`;
    assert.equal((await post(context, { lease: claimed.lease }, agent(other))).status, 409);
    const profile = await post(context, { lease: claimed.lease }, agent(runner)); assert.equal(profile.status, 200); assert.equal((await profile.json()).facts[0].id, fact.id);
    const suggestion = { id: 'candidate', title: 'Liquidez mínima', category: 'financial', sourceId: file.id, quote: 'Debe acreditar liquidez de 1,5.', factIds: [fact.id], certificateIds: [], reviewRequired: true };
    const completion = { lease: claimed.lease, status: 'succeeded', result: { requirements: [suggestion], discardedCount: 0, discardedLinks: 0, unreadableSources: [], reviewRequired: true } };
    assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, completion, agent(runner))).status, 200);
    const accept = `/api/projects/${project.id}/requirement-suggestions/${job.id}/accept`;
    assert.equal((await post(accept, { suggestionId: suggestion.id }, { cookie: bob })).status, 404);
    const accepts = await Promise.all([post(accept, { suggestionId: suggestion.id }, { cookie: alice }), post(accept, { suggestionId: suggestion.id }, { cookie: alice })]);
    assert.deepEqual(accepts.map(item => item.status).sort(), [200, 201]);
    const acceptedItems = await Promise.all(accepts.map(item => item.json())); const saved = acceptedItems[0].item;
    assert.equal(acceptedItems[1].item.id, saved.id); assert.equal(saved.status, 'pending'); assert.match(saved.source, /pliego\.txt/); assert.match(saved.source, /liquidez/);
    assert.equal((await (await req(`/api/projects/${project.id}/workflow/requirements`, { headers: { cookie: alice } })).json()).items.length, 1);

    const next = await create(body, 'suggest-2'); const nextJob = (await next.json()).job;
    const nextClaim = await (await post('/api/runner/jobs/claim', { kinds: ['requirements.suggest'] }, agent(runner))).json(); assert.equal(nextClaim.job.id, nextJob.id);
    await upload('adenda.txt');
    assert.equal((await post(`/api/runner/jobs/${nextJob.id}/requirements-context`, { lease: nextClaim.lease }, agent(runner))).status, 409);
    assert.equal((await post(`/api/runner/jobs/${nextJob.id}/complete`, { ...completion, lease: nextClaim.lease }, agent(runner))).status, 200);
    assert.equal((await post(`/api/projects/${project.id}/requirement-suggestions/${nextJob.id}/accept`, { suggestionId: 'other' }, { cookie: alice })).status, 409);
    const withoutProfile = await create({ ...body, payload: { ...body.payload, includeRup: false } }, 'without-rup'); const noProfileJob = (await withoutProfile.json()).job;
    const noProfileClaim = await (await post('/api/runner/jobs/claim', { kinds: ['requirements.suggest'] }, agent(runner))).json(); assert.equal(noProfileClaim.job.id, noProfileJob.id);
    const noProfile = await (await post(`/api/runner/jobs/${noProfileJob.id}/requirements-context`, { lease: noProfileClaim.lease }, agent(runner))).json(); assert.deepEqual(noProfile.facts, []);
    const editFact = await req(`/api/rup/facts/${fact.id}`, { method: 'PATCH', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ certificateId: cert.certificate.id, certificateVersion: cert.version, version: fact.version, label: 'Liquidez', value: '3', page: 1 }) }); assert.equal(editFact.status, 200);
    assert.equal((await post(`/api/runner/jobs/${noProfileJob.id}/requirements-context`, { lease: noProfileClaim.lease }, agent(runner))).status, 200);
    assert.equal((await post(`/api/projects/${project.id}/jobs/${noProfileJob.id}/cancel`, {}, { cookie: alice })).status, 200);
    const withProfileJob = (await (await create(body, 'rup-changed')).json()).job;
    const withProfileClaim = await (await post('/api/runner/jobs/claim', { kinds: ['requirements.suggest'] }, agent(runner))).json(); assert.equal(withProfileClaim.job.id, withProfileJob.id);
    const editAgain = await req(`/api/rup/facts/${fact.id}`, { method: 'PATCH', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ certificateId: cert.certificate.id, certificateVersion: cert.version, version: 2, label: 'Liquidez', value: '4', page: 1 }) }); assert.equal(editAgain.status, 200);
    assert.equal((await post(`/api/runner/jobs/${withProfileJob.id}/requirements-context`, { lease: withProfileClaim.lease }, agent(runner))).status, 409);
    assert.equal((await post(`/api/projects/${project.id}/jobs/${withProfileJob.id}/cancel`, {}, { cookie: alice })).status, 200);
    const live = await create({ ...body, payload: { ...body.payload, includeRup: false } }, 'live-pi'); assert.equal(live.status, 201); const liveJob = (await live.json()).job;
    let calls = 0, sawDocument = false;
    const handler = createRequirementSuggestionsHandler({ createAiService: ({ configStore }) => ({
      getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }),
      async runAgentChatCompletion(request) {
        calls++; const requestBody = { ...request.body, stream: false }, ctx = { config: configStore.load(), requestBody, requestId: `requirements-${calls}` }; request.onRequestStart?.(ctx);
        sawDocument ||= JSON.stringify(requestBody.messages).includes('Debe acreditar liquidez de 1,5.');
        const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-tender', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'tender/1.md' }) } }] } : { role: 'assistant', content: JSON.stringify({ requirements: [{ title: 'Liquidez', category: 'financial', sourceId: file.id, quote: 'Debe acreditar liquidez de 1,5.' }] }) };
        return request.consumeResponse(new Response(JSON.stringify({ id: `requirements-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
      },
    }) });
    const originalFetch = globalThis.fetch;
    try { globalThis.fetch = (url, options) => String(url).startsWith('http://localhost/') ? worker.dispatchFetch(url, options) : originalFetch(url, options); const outcome = await runOnce({ server: 'http://localhost', token: runner.token, handlers: { 'requirements.suggest': handler } }); assert.equal(outcome.state, 'succeeded'); assert.equal(outcome.jobId, liveJob.id); }
    finally { globalThis.fetch = originalFetch; }
    const listing = await (await req(`/api/projects/${project.id}/requirement-suggestions`, { headers: { cookie: alice } })).json();
    const liveResult = listing.jobs.find(item => item.id === liveJob.id); assert.equal(liveResult.stale, false); assert.equal(liveResult.result.requirements[0].quote, 'Debe acreditar liquidez de 1,5.'); assert.ok(calls >= 2); assert.equal(sawDocument, true);
    const liveAccepted = await post(`/api/projects/${project.id}/requirement-suggestions/${liveJob.id}/accept`, { suggestionId: liveResult.result.requirements[0].id }, { cookie: alice }); assert.equal(liveAccepted.status, 201);
    const concurrent = await Promise.all([create({ ...body, payload: { ...body.payload, includeRup: false } }, 'active-a'), create({ ...body, payload: { ...body.payload, includeRup: false } }, 'active-b')]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 409]);



  } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
