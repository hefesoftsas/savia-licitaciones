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
test('los borradores autorizan solo las entradas elegidas y rechazan versiones obsoletas al aplicar', async () => {
 const build = await mkdtemp(join(tmpdir(), 'savia-draft-knowledge-')); let worker;
 try {
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'draft-knowledge-test' }, r2Buckets: ['FILES'], bindings: {AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', CREDENTIAL_KEY_HEX: '11'.repeat(32), CREDENTIAL_KEY_ID: 'test' } }));
  const db = await worker.getD1Database('DB'); for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options), post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  async function signup(name) { const response = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; }
  const alice = await signup('alice'), bob = await signup('bob'), owner = (await (await req('/api/me', { headers: { cookie: alice } })).json()).user.id, other = (await (await req('/api/me', { headers: { cookie: bob } })).json()).user.id;
  async function addEntry(ownerId, id, title) {
   const doc = `doc-${id}`, folder = `folder-${id}`;
   await db.prepare('INSERT INTO knowledge_folders (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)').bind(folder, ownerId, folder, '2026-01-01').run();
   await db.prepare('INSERT INTO knowledge_documents (id, folder_id, owner_id, name, content_type, object_key, size, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)').bind(doc, folder, ownerId, `${id}.txt`, 'text/plain', doc, '2026-01-01').run();
   await (await worker.getR2Bucket('FILES')).put(doc, `${title} contenido completo adicional`);
   await db.prepare('INSERT INTO knowledge_indices (document_id, owner_id, revision, job_id, mutation_id) VALUES (?, ?, 1, ?, ?)').bind(doc, ownerId, 'fixture', 'fixture').run();
   await db.prepare('INSERT INTO knowledge_entries (id, document_id, owner_id, title, summary, quote, sort_order) VALUES (?, ?, ?, ?, ?, ?, 0)').bind(id, doc, ownerId, title, `${title} resumen`, `${title} cita`).run(); return doc;
  }
  const selectedDoc = await addEntry(owner, 'selected', 'Experiencia autorizada'); await addEntry(owner, 'unselected', 'Contenido no seleccionado'); await addEntry(other, 'foreign', 'Contenido ajeno');
  const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project, path = `/api/projects/${project.id}`;
  const plan = await (await post(`${path}/technical-plan/nodes`, { title: 'Metodología', version: 0 }, { cookie: alice })).json();
  const file = (await (await req(`${path}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': 'pliego.txt', 'content-type': 'text/plain' }, body: 'Pliego.' })).json()).file;
  const credential = (await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'fixture', secret: 'fixture-secret' }, { cookie: alice })).json()).credential;
  const base = { kind: 'technical-plan.generate-section', credentialId: credential.id, payload: { nodeId: plan.outline[0].id, planVersion: plan.version, fileIds: [file.id], language: 'es', dataProcessingConsent: true } };
  const submit = (payload, key) => post(`${path}/jobs`, { ...base, payload: { ...base.payload, ...payload } }, { cookie: alice, 'idempotency-key': key });
  assert.equal((await submit({ knowledgeSelections: [{ id: 'selected', revision: 1 }] }, 'no-consent')).status, 400);
  assert.equal((await submit({ knowledgeSelections: [{ id: 'selected', revision: 1 }], knowledgeConsent: true, includeKnowledgeDocuments: true }, 'no-full-consent')).status, 400);
  assert.equal((await submit({ includeKnowledgeDocuments: true, knowledgeDocumentConsent: true }, 'no-selection')).status, 400);
  assert.equal((await submit({ knowledgeSelections: [{ id: 'foreign', revision: 1 }], knowledgeConsent: true }, 'foreign')).status, 409);
  assert.equal((await submit({ knowledgeSelections: [{ id: 'selected', revision: 2 }], knowledgeConsent: true }, 'stale')).status, 409);
  const pair = await (await post('/api/runner-pairings', {}, { cookie: alice })).json(), runner = await (await post('/api/runners/pair', { code: pair.code, name: 'Equipo' })).json(), auth = { authorization: `Bearer ${runner.token}` };
  const plain = (await (await submit({}, 'plain')).json()).job, claimPlain = (await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-section'] }, auth)).json());
  assert.equal(claimPlain.job.id, plain.id); assert.equal((await (await post(`/api/runner/jobs/${plain.id}/plan-context`, { lease: claimPlain.lease }, auth)).json()).knowledgeEntries, undefined);
  await post(`${path}/jobs/${plain.id}/cancel`, {}, { cookie: alice });
  const created = await submit({ knowledgeSelections: [{ id: 'selected', revision: 1 }], knowledgeConsent: true }, 'selected'); assert.equal(created.status, 201); const job = (await created.json()).job;
  assert.equal(JSON.stringify(job.payload).includes('Experiencia autorizada'), false);
  const claim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-section'] }, auth)).json(); assert.equal(claim.job.id, job.id);
  assert.notEqual((await post(`/api/runner/jobs/${job.id}/knowledge-documents/${selectedDoc}`, { lease: claim.lease }, auth)).status, 200);
  const context = await (await post(`/api/runner/jobs/${job.id}/plan-context`, { lease: claim.lease }, auth)).json(); assert.equal(context.knowledgeEntries.length, 1); assert.equal(context.knowledgeEntries[0].title, 'Experiencia autorizada'); assert.equal(JSON.stringify(context).includes('Contenido no seleccionado'), false);
  await db.prepare('UPDATE knowledge_indices SET revision = 2 WHERE document_id = ?').bind('doc-unselected').run(); assert.equal((await post(`/api/runner/jobs/${job.id}/plan-context`, { lease: claim.lease }, auth)).status, 200);
  assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, { lease: claim.lease, status: 'succeeded', result: { content: 'Borrador.' } }, auth)).status, 200);
  await db.prepare('UPDATE knowledge_indices SET revision = 2 WHERE document_id = ?').bind(selectedDoc).run();
  const listed = (await (await req(`${path}/jobs`, { headers: { cookie: alice } })).json()).jobs; assert.equal(listed.find(item => item.id === job.id).sourcesStale, true);
  assert.equal((await post(`${path}/technical-plan/nodes/${plan.outline[0].id}/apply-job`, { version: plan.version, jobId: job.id }, { cookie: alice })).status, 409);
  const after = await (await req(`${path}/technical-plan`, { headers: { cookie: alice } })).json(); assert.equal(after.outline[0].content, '');
  const checking = await submit({ knowledgeSelections: [{ id: 'selected', revision: 2 }], knowledgeConsent: true, includeKnowledgeDocuments: true, knowledgeDocumentConsent: true }, 'reference-check'); assert.equal(checking.status, 201); const checkJob = (await checking.json()).job;
  const checkClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-section'] }, auth)).json(); assert.equal(checkClaim.job.id, checkJob.id);
  const ref = `/api/runner/jobs/${checkJob.id}/knowledge-documents`;
  assert.equal(await (await post(`${ref}/${selectedDoc}`, { lease: checkClaim.lease }, auth)).text(), 'Experiencia autorizada contenido completo adicional');
  assert.notEqual((await post(`${ref}/doc-unselected`, { lease: checkClaim.lease }, auth)).status, 200);
  assert.notEqual((await post(`${ref}/doc-foreign`, { lease: checkClaim.lease }, auth)).status, 200);
  const otherPair = await (await post('/api/runner-pairings', {}, { cookie: bob })).json(), otherRunner = await (await post('/api/runners/pair', { code: otherPair.code, name: 'Otro' })).json();
  assert.notEqual((await post(`${ref}/${selectedDoc}`, { lease: checkClaim.lease }, { authorization: `Bearer ${otherRunner.token}` })).status, 200);
  await db.prepare('UPDATE knowledge_indices SET revision = 3 WHERE document_id = ?').bind(selectedDoc).run();
  assert.equal((await post(`${ref}/${selectedDoc}`, { lease: checkClaim.lease }, auth)).status, 409);

  await post(`${path}/jobs/${checkJob.id}/cancel`, {}, { cookie: alice });
  assert.notEqual((await post(`${ref}/${selectedDoc}`, { lease: checkClaim.lease }, auth)).status, 200);
  const fresh = await submit({ knowledgeSelections: [{ id: 'selected', revision: 3 }], knowledgeConsent: true, includeKnowledgeDocuments: true, knowledgeDocumentConsent: true }, 'fresh'); assert.equal(fresh.status, 201); const freshJob = (await fresh.json()).job;
  let sawKnowledge = false, sawFull = false, calls = 0;
  const fakeProvider = ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) {
   const ctx = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: 'draft-knowledge' }; request.onRequestStart?.(ctx);
   calls++; sawKnowledge ||= JSON.stringify(request.body.messages).includes('Experiencia autorizada'); sawFull ||= JSON.stringify(request.body.messages).includes('contenido completo adicional');
   const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-library', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/2.md' }) } }] } : { role: 'assistant', content: 'Borrador aceptado.\n<suggested_questions>[]</suggested_questions>' };
   return request.consumeResponse(new Response(JSON.stringify({ id: 'draft-knowledge', object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
  } });
  const outcome = await runOnce({ server: (await worker.ready).origin, token: runner.token, handlers: { 'technical-plan.generate-section': createTechnicalPlanHandler({ createAiService: fakeProvider }) } });
  assert.equal(outcome.state, 'succeeded'); assert.equal(outcome.jobId, freshJob.id); assert.ok(sawKnowledge); assert.ok(sawFull);
  assert.equal((await post(`${path}/technical-plan/nodes/${plan.outline[0].id}/apply-job`, { version: plan.version, jobId: freshJob.id }, { cookie: alice })).status, 200);
  assert.equal((await (await req(`${path}/technical-plan`, { headers: { cookie: alice } })).json()).outline[0].content, 'Borrador aceptado.');

 } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
