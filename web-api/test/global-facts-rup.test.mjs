import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runOnce } from '../../runner/work-loop.mjs';
import { createGlobalFactsHandler } from '../../runner/global-facts.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

import { createRequire } from 'node:module';
const requireClient = createRequire(new URL('../../client/package.json', import.meta.url));
const { PDFDocument } = requireClient('pdf-lib');
test('el RUP solo se entrega con consentimiento y los cambios invalidan propuestas y hechos derivados', async () => {
 const build = await mkdtemp(join(tmpdir(), 'savia-facts-rup-')); let worker;
 try {
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'facts-rup-test' }, r2Buckets: ['FILES'], bindings: { AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', CREDENTIAL_KEY_HEX: '11'.repeat(32), CREDENTIAL_KEY_ID: 'test' } }));
  const db = await worker.getD1Database('DB'); for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options), post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  async function signup(name) { const r = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
  const alice = await signup('alice'), bob = await signup('bob');
  const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project, path = `/api/projects/${project.id}`, factsPath = `${path}/technical-facts`;
  const plan = (await (await post(`${path}/technical-plan/nodes`, { title: 'Metodología', version: 0 }, { cookie: alice })).json());
  const file = (await (await req(`${path}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': 'pliego.txt', 'content-type': 'text/plain' }, body: 'Pliego.' })).json()).file;
  const credential = (await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'fixture', secret: 'fixture-secret' }, { cookie: alice })).json()).credential;
  async function pair(cookie) { const pairing = await (await post('/api/runner-pairings', {}, { cookie })).json(); return (await (await post('/api/runners/pair', { code: pairing.code, name: 'Equipo' })).json()); }
  const runner = await pair(alice), other = await pair(bob), agent = item => ({ authorization: `Bearer ${item.token}` });
  const base = { kind: 'technical-plan.generate-facts', credentialId: credential.id, payload: { fileIds: [file.id], language: 'es', dataProcessingConsent: true, mode: 'placeholder', planVersion: plan.version } };
  const submit = (payload, key) => post(`${path}/jobs`, { ...base, payload: { ...base.payload, ...payload } }, { cookie: alice, 'idempotency-key': key });
  assert.equal((await submit({ includeRup: true }, 'no-rup-consent')).status, 400);
  assert.equal((await submit({ includeRup: true, rupConsent: true }, 'missing-rup')).status, 400);
  const pdf = await PDFDocument.create(); pdf.addPage(); const cert = await (await req('/api/rup/certificate', { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'x-rup-version': '0', 'x-file-name': 'RUP.pdf' }, body: await pdf.save() })).json();
  let fact = (await (await post('/api/rup/facts', { certificateId: cert.certificate.id, certificateVersion: cert.version, label: 'Liquidez', value: '2,5', page: 1 }, { cookie: alice })).json()).fact;
  const rupSnapshot = () => ({ certificateId: cert.certificate.id, certificateVersion: cert.version, factsFingerprint: JSON.stringify([[fact.id, fact.version]]) });
  const plain = (await (await submit({}, 'without-rup')).json()).job;
  const plainClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-facts'] }, agent(runner))).json(); assert.equal(plainClaim.job.id, plain.id);
  const plainContext = await (await post(`/api/runner/jobs/${plain.id}/plan-context`, { lease: plainClaim.lease }, agent(runner))).json(); assert.ok(!plainContext.rupFacts?.length); assert.equal(JSON.stringify(plainContext).includes('Liquidez'), false);
  let edit = await req(`/api/rup/facts/${fact.id}`, { method: 'PATCH', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ certificateId: cert.certificate.id, certificateVersion: cert.version, version: fact.version, label: 'Liquidez', value: '3', page: 1 }) }); fact = (await edit.json()).fact;
  assert.equal((await post(`/api/runner/jobs/${plain.id}/plan-context`, { lease: plainClaim.lease }, agent(runner))).status, 200);
  await post(`${path}/jobs/${plain.id}/cancel`, {}, { cookie: alice });
  const withRup = (await (await submit({ includeRup: true, rupConsent: true, rupConsentSnapshot: rupSnapshot() }, 'with-rup')).json()).job;
  const claim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-facts'] }, agent(runner))).json(); assert.equal(claim.job.id, withRup.id);
  assert.equal((await post(`/api/runner/jobs/${withRup.id}/plan-context`, { lease: claim.lease }, agent(other))).status, 409);
  const context = await (await post(`/api/runner/jobs/${withRup.id}/plan-context`, { lease: claim.lease }, agent(runner))).json(); assert.equal(context.rupFacts[0].value, '3'); assert.equal('pdf' in context, false);
  edit = await req(`/api/rup/facts/${fact.id}`, { method: 'PATCH', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ certificateId: cert.certificate.id, certificateVersion: cert.version, version: fact.version, label: 'Liquidez', value: '4', page: 1 }) }); fact = (await edit.json()).fact;
  assert.equal((await post(`/api/runner/jobs/${withRup.id}/plan-context`, { lease: claim.lease }, agent(runner))).status, 409);
  await post(`${path}/jobs/${withRup.id}/cancel`, {}, { cookie: alice });
  assert.equal((await submit({ includeRup: true, rupConsent: true, rupConsentSnapshot: { ...rupSnapshot(), factsFingerprint: '[]' } }, 'stale-consent')).status, 409);
  const approved = (await (await submit({ includeRup: true, rupConsent: true, rupConsentSnapshot: rupSnapshot() }, 'approved-rup')).json()).job;
  let calls = 0, sawRup = false;
  const fakeProvider = ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) {
    calls++; const context = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `rup-facts-${calls}` }; request.onRequestStart?.(context);
    sawRup ||= JSON.stringify(request.body.messages).includes('Liquidez');
    const output = JSON.stringify({ groups: [{ id: 'liquidez', title: 'Liquidez', content: '4' }] });
    const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-rup', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'references/rup-reviewed.json' }) } }] } : calls === 2 ? { role: 'assistant', content: null, tool_calls: [{ id: 'write-facts', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: 'global-facts.json', content: output }) } }] } : { role: 'assistant', content: 'Hechos listos.' };
    return request.consumeResponse(new Response(JSON.stringify({ id: `rup-facts-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls <= 2 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), context);
  } });
  const outcome = await runOnce({ server: (await worker.ready).origin, token: runner.token, handlers: { 'technical-plan.generate-facts': createGlobalFactsHandler({ createAiService: fakeProvider }) } });
  assert.equal(outcome.state, 'succeeded'); assert.equal(outcome.jobId, approved.id); assert.equal(sawRup, true);
  assert.equal((await post(`${factsPath}/apply`, { jobId: approved.id, revision: 0 }, { cookie: alice })).status, 200);
  assert.equal((await (await req(factsPath, { headers: { cookie: alice } })).json()).current, true);
  const planWithFacts = await (await req(`${path}/technical-plan`, { headers: { cookie: alice } })).json();
  const draftBody = { kind: 'technical-plan.generate-section', credentialId: credential.id, payload: { nodeId: plan.outline[0].id, planVersion: planWithFacts.version, fileIds: [file.id], language: 'es', dataProcessingConsent: true } };
  assert.equal((await post(`${path}/jobs`, draftBody, { cookie: alice, 'idempotency-key': 'draft-without-rup-consent' })).status, 400);
  const allowedDraft = await post(`${path}/jobs`, { ...draftBody, payload: { ...draftBody.payload, rupConsent: true } }, { cookie: alice, 'idempotency-key': 'draft-with-rup-consent' }); assert.equal(allowedDraft.status, 201); const draft = (await allowedDraft.json()).job;
  const draftClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-section'] }, agent(runner))).json(); assert.equal(draftClaim.job.id, draft.id);
  const draftContext = await (await post(`/api/runner/jobs/${draft.id}/plan-context`, { lease: draftClaim.lease }, agent(runner))).json(); assert.equal(draftContext.globalFacts[0].content, '4'); assert.equal(draftContext.rupFacts, undefined);
  await post(`${path}/jobs/${draft.id}/cancel`, {}, { cookie: alice });

  edit = await req(`/api/rup/facts/${fact.id}`, { method: 'PATCH', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ certificateId: cert.certificate.id, certificateVersion: cert.version, version: fact.version, label: 'Liquidez', value: '5', page: 1 }) }); assert.equal(edit.status, 200);
  assert.equal((await (await req(factsPath, { headers: { cookie: alice } })).json()).current, false);
  const latest = await (await req(`${path}/technical-plan`, { headers: { cookie: alice } })).json();
  assert.equal((await post(`${path}/jobs`, { kind: 'technical-plan.generate-section', credentialId: credential.id, payload: { nodeId: plan.outline[0].id, planVersion: latest.version, fileIds: [file.id], language: 'es', dataProcessingConsent: true } }, { cookie: alice, 'idempotency-key': 'draft-stale-rup' })).status, 409);
 } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
