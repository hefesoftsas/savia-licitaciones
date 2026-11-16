import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createRequire } from 'node:module';
const { PDFDocument } = createRequire(new URL('../../client/package.json', import.meta.url))('pdf-lib');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('hechos globales incluyen solo conocimiento autorizado y vigilan sus revisiones', async () => {
 const build = await mkdtemp(join(tmpdir(), 'savia-facts-knowledge-')); let worker;
 try {
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'facts-knowledge-test' }, r2Buckets: ['FILES'], bindings: { AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', CREDENTIAL_KEY_HEX: '11'.repeat(32), CREDENTIAL_KEY_ID: 'test' } }));
  const db = await worker.getD1Database('DB'); for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options), post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  async function signup(name) { const response = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; }
  const alice = await signup('alice'), bob = await signup('bob');
  const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project, path = `/api/projects/${project.id}`;
  const plan = await (await post(`${path}/technical-plan/nodes`, { title: 'Metodología', version: 0 }, { cookie: alice })).json();
  const file = (await (await req(`${path}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': 'pliego.txt', 'content-type': 'text/plain' }, body: 'Pliego.' })).json()).file;
  const credential = (await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'fixture', secret: 'fixture-secret' }, { cookie: alice })).json()).credential;
  async function addKnowledge(cookie, name, id, title) {
   const owner = (await (await req('/api/me', { headers: { cookie } })).json()).user.id;
   const folder = (await (await post('/api/knowledge/folders', { name }, { cookie })).json()).folder;
   const doc = (await (await req(`/api/knowledge/folders/${folder.id}/documents`, { method: 'POST', headers: { cookie, origin: 'http://localhost', 'x-file-name': 'obra.txt', 'content-type': 'text/plain' }, body: 'Documento.' })).json()).document;
   await db.prepare('INSERT INTO knowledge_indices (document_id, owner_id, revision, job_id, mutation_id) VALUES (?, ?, 1, ?, ?)').bind(doc.id, owner, 'fixture', 'fixture').run();
   await db.prepare('INSERT INTO knowledge_entries (id, document_id, owner_id, title, summary, quote, sort_order) VALUES (?, ?, ?, ?, ?, ?, 0)').bind(id, doc.id, owner, title, `${title} resumen`, `${title} cita`).run(); return doc;
  }
  const doc = await addKnowledge(alice, 'Personal', 'selected', 'Experiencia seleccionada');
  await addKnowledge(alice, 'Otra', 'unselected', 'Contenido no seleccionado'); await addKnowledge(bob, 'Ajena', 'other-user', 'Contenido ajeno');
  const base = { kind: 'technical-plan.generate-facts', credentialId: credential.id, payload: { fileIds: [file.id], language: 'es', dataProcessingConsent: true, mode: 'placeholder', planVersion: plan.version } };
  const submit = (extra, key) => post(`${path}/jobs`, { ...base, payload: { ...base.payload, ...extra } }, { cookie: alice, 'idempotency-key': key });
  const selection = [{ id: 'selected', revision: 1 }];
  assert.equal((await submit({ knowledgeSelections: selection }, 'no-consent')).status, 400);
  assert.equal((await submit({ knowledgeSelections: [{ id: 'other-user', revision: 1 }], knowledgeConsent: true }, 'other')).status, 409);
  assert.equal((await submit({ knowledgeSelections: [{ id: 'selected', revision: 2 }], knowledgeConsent: true }, 'stale')).status, 409);
  const without = (await (await submit({}, 'plain')).json()).job;
  const pair = await (await post('/api/runner-pairings', {}, { cookie: alice })).json(), runner = await (await post('/api/runners/pair', { code: pair.code, name: 'Equipo' })).json(), auth = { authorization: `Bearer ${runner.token}` };
  let claim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-facts'] }, auth)).json(); assert.equal(claim.job.id, without.id);
  let context = await (await post(`/api/runner/jobs/${without.id}/plan-context`, { lease: claim.lease }, auth)).json(); assert.equal(context.knowledgeEntries, undefined);
  await post(`${path}/jobs/${without.id}/cancel`, {}, { cookie: alice });
  const selected = await submit({ knowledgeSelections: selection, knowledgeConsent: true }, 'selected'); assert.equal(selected.status, 201); const job = (await selected.json()).job;
  assert.equal(JSON.stringify(job.payload).includes('Experiencia seleccionada'), false);
  claim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-facts'] }, auth)).json(); assert.equal(claim.job.id, job.id);
  context = await (await post(`/api/runner/jobs/${job.id}/plan-context`, { lease: claim.lease }, auth)).json(); assert.equal(context.knowledgeEntries.length, 1); assert.equal(context.knowledgeEntries[0].title, 'Experiencia seleccionada'); assert.equal(JSON.stringify(context).includes('Contenido no seleccionado'), false);
  await db.prepare('UPDATE knowledge_indices SET revision = revision + 1 WHERE document_id = (SELECT document_id FROM knowledge_entries WHERE id = ?)').bind('unselected').run();
  assert.equal((await post(`/api/runner/jobs/${job.id}/plan-context`, { lease: claim.lease }, auth)).status, 200);
  assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, { lease: claim.lease, status: 'succeeded', result: { groups: [{ id: 'x', title: 'Experiencia', content: 'Experiencia seleccionada' }] } }, auth)).status, 200);
  assert.equal((await post(`${path}/technical-facts/apply`, { jobId: job.id, revision: 0 }, { cookie: alice })).status, 200);
  let facts = await (await req(`${path}/technical-facts`, { headers: { cookie: alice } })).json(); assert.equal(facts.current, true); assert.equal(facts.includesKnowledge, true);
  await db.prepare('UPDATE knowledge_indices SET revision = revision + 1 WHERE document_id = ?').bind(doc.id).run();
  facts = await (await req(`${path}/technical-facts`, { headers: { cookie: alice } })).json(); assert.equal(facts.current, false);
  const current = await (await req(`${path}/technical-plan`, { headers: { cookie: alice } })).json();
  assert.equal((await post(`${path}/jobs`, { kind: 'technical-plan.generate-section', credentialId: credential.id, payload: { nodeId: plan.outline[0].id, planVersion: current.version, fileIds: [file.id], language: 'es', dataProcessingConsent: true } }, { cookie: alice, 'idempotency-key': 'stale-draft' })).status, 409);
  const regenerated = await post(`${path}/jobs`, { ...base, payload: { ...base.payload, planVersion: current.version } }, { cookie: alice, 'idempotency-key': 'same-facts-new-sources' }); assert.equal(regenerated.status, 201); const replacement = (await regenerated.json()).job;
  const replacementClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-facts'] }, auth)).json(); assert.equal(replacementClaim.job.id, replacement.id);
  assert.equal((await post(`/api/runner/jobs/${replacement.id}/complete`, { lease: replacementClaim.lease, status: 'succeeded', result: { groups: [{ id: 'x', title: 'Experiencia', content: 'Experiencia seleccionada' }] } }, auth)).status, 200);
  assert.equal((await post(`${path}/technical-facts/apply`, { jobId: replacement.id, revision: 1 }, { cookie: alice })).status, 200);
  facts = await (await req(`${path}/technical-facts`, { headers: { cookie: alice } })).json(); assert.equal(facts.revision, 2); assert.equal(facts.includesKnowledge, false); assert.equal(facts.current, true);
  const planAfter = await (await req(`${path}/technical-plan`, { headers: { cookie: alice } })).json();
  const pdf = await PDFDocument.create(); pdf.addPage();
  const cert = await (await req('/api/rup/certificate', { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'x-rup-version': '0', 'x-file-name': 'rup.pdf' }, body: await pdf.save() })).json();
  const rupFact = (await (await post('/api/rup/facts', { certificateId: cert.certificate.id, certificateVersion: cert.version, label: 'Liquidez', value: '3', page: 1 }, { cookie: alice })).json()).fact;
  const combined = await post(`${path}/jobs`, { ...base, payload: { ...base.payload, planVersion: planAfter.version, knowledgeSelections: [{ id: 'selected', revision: 2 }], knowledgeConsent: true, includeRup: true, rupConsent: true, rupConsentSnapshot: { certificateId: cert.certificate.id, certificateVersion: cert.version, factsFingerprint: JSON.stringify([[rupFact.id, rupFact.version]]) } } }, { cookie: alice, 'idempotency-key': 'combined-sources' }); assert.equal(combined.status, 201); const combinedJob = (await combined.json()).job;
  const combinedClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-facts'] }, auth)).json(); assert.equal(combinedClaim.job.id, combinedJob.id);
  const combinedContext = await (await post(`/api/runner/jobs/${combinedJob.id}/plan-context`, { lease: combinedClaim.lease }, auth)).json(); assert.equal(combinedContext.rupFacts[0].value, '3'); assert.equal(combinedContext.knowledgeEntries[0].id, 'selected');
  await post(`${path}/jobs/${combinedJob.id}/cancel`, {}, { cookie: alice });
  const deletionTask = await post(`${path}/jobs`, { ...base, payload: { ...base.payload, planVersion: planAfter.version, knowledgeSelections: [{ id: 'selected', revision: 2 }], knowledgeConsent: true } }, { cookie: alice, 'idempotency-key': 'deleted-source' }); assert.equal(deletionTask.status, 201); const deletedJob = (await deletionTask.json()).job;
  const deletedClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-facts'] }, auth)).json(); assert.equal(deletedClaim.job.id, deletedJob.id);
  assert.equal((await req(`/api/knowledge/documents/${doc.id}`, { method: 'DELETE', headers: { cookie: alice, origin: 'http://localhost' } })).status, 200);
  assert.equal((await post(`/api/runner/jobs/${deletedJob.id}/plan-context`, { lease: deletedClaim.lease }, auth)).status, 409);
  assert.equal((await (await req(`${path}/technical-facts`, { headers: { cookie: alice } })).json()).current, true);


 } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
