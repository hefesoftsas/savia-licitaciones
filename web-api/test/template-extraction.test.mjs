import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runOnce } from '../../runner/work-loop.mjs';
import { createTemplateExtractionHandler } from '../../runner/template-extraction.mjs';
import { createWordExportHandler, resolvePackagedHelper } from '../../runner/technical-plan-export.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('extrae una plantilla por concesión, aísla documentos y rechaza fuentes o planes obsoletos', async () => {
 const build = await mkdtemp(join(tmpdir(), 'savia-template-api-')); let worker;
 try {
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'template-test' }, r2Buckets: ['FILES'], bindings: {AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', CREDENTIAL_KEY_HEX: '11'.repeat(32), CREDENTIAL_KEY_ID: 'test' } }));
  const db = await worker.getD1Database('DB'); for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options), post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  async function signup(name) { const r = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
  const alice = await signup('alice'), bob = await signup('bob');
  const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project, path = `/api/projects/${project.id}`;
  const plan = await (await post(`${path}/technical-plan/nodes`, { title: 'Formulario', version: 0 }, { cookie: alice })).json();
  await db.prepare("UPDATE project_technical_plan_nodes SET content_mode = 'template-fill' WHERE project_id = ?").bind(project.id).run();
  const upload = (name, bytes) => req(`${path}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': name, 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, body: bytes });
  const file = (await (await upload('pliego.docx', Uint8Array.from([0x50, 0x4b, 3, 4]))).json()).file;
  const credential = (await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'test', secret: 'fixture' }, { cookie: alice })).json()).credential;
  const pairing = await (await post('/api/runner-pairings', {}, { cookie: alice })).json(), runner = await (await post('/api/runners/pair', { code: pairing.code, name: 'Equipo' })).json();
  const body = { kind: 'technical-plan.extract-template', credentialId: credential.id, payload: { fileIds: [file.id], language: 'es', dataProcessingConsent: true, planVersion: plan.version } };
  assert.equal((await post(`${path}/jobs`, { ...body, payload: { ...body.payload, dataProcessingConsent: false } }, { cookie: alice, 'idempotency-key': 'no-consent' })).status, 400);
  const created = await post(`${path}/jobs`, body, { cookie: alice, 'idempotency-key': 'extract' }); assert.equal(created.status, 201, await created.clone().text()); const job = (await created.json()).job;
  const handler = createTemplateExtractionHandler({ createAiService: () => ({}), createRuntime: () => ({ close: async () => {} }), createHelper: () => ({ close: async () => {} }), runExtraction: async options => { assert.equal(options.outline[0].title, 'Formulario'); await mkdir(dirname(options.workspaceStore.getBidTemplatePath()), { recursive: true }); await writeFile(options.workspaceStore.getBidTemplatePath(), 'documento'); await writeFile(options.workspaceStore.getBidTemplateFieldsPath(), JSON.stringify({ version: 1, fields: [{ id: 'f0001', name: 'Empresa', fill_by: 'manual' }, { id: 'f0002', name: 'Empresa', fill_by: 'manual' }] })); return { status: 'success', field_count: 1 }; } });
  const outcome = await runOnce({ server: (await worker.ready).origin, token: runner.token, handlers: { 'technical-plan.extract-template': handler } }); assert.equal(outcome.state, 'succeeded'); assert.equal(outcome.jobId, job.id);
  const saved = (await (await req(`${path}/jobs`, { headers: { cookie: alice } })).json()).jobs.find(item => item.id === job.id); assert.equal(saved.result.fields[0].name, 'Empresa'); assert.equal(saved.artifactState, 'stored');
  assert.equal((await req(`${path}/jobs/${job.id}/artifact`, { headers: { cookie: bob } })).status, 404);
  const download = await req(`${path}/jobs/${job.id}/artifact`, { headers: { cookie: alice } }); assert.equal(download.status, 200); assert.equal(await download.text(), 'documento');
  assert.equal((await post(`${path}/technical-template`, { jobId: job.id, revision: 0 }, { cookie: bob })).status, 404);
  assert.equal((await post(`${path}/technical-template`, { jobId: job.id, revision: 0 }, { cookie: alice })).status, 200);
  assert.equal((await post(`${path}/technical-template`, { jobId: job.id, revision: 0 }, { cookie: alice })).status, 200);
  assert.equal((await (await req(`${path}/technical-template`, { headers: { cookie: alice } })).json()).selection.current, true);
  const valuePath = `${path}/technical-template/values`;
  assert.equal((await req(valuePath, { headers: { cookie: bob } })).status, 404);
  const initialValues = await (await req(valuePath, { headers: { cookie: alice } })).json(); assert.equal(initialValues.revision, 0); assert.equal(initialValues.fields[0].id, 'f0001');
  const putValues = (data, who = alice) => req(valuePath, { method: 'PUT', headers: { cookie: who, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await putValues({ selectionRevision: 1, revision: 0, values: { unknown: 'valor' } })).status, 400);
  assert.equal((await putValues({ selectionRevision: 1, revision: 0, values: { f0001: 'Solo una' } })).status, 400);
  assert.equal((await putValues({ selectionRevision: 1, revision: 0, values: { f0001: 'x', f0002: 'x' } }, bob)).status, 404);
  assert.equal((await putValues({ selectionRevision: 1, revision: 0, values: { f0001: 'Empresa S.A.S.', f0002: 'Empresa S.A.S.' } })).status, 200);
  assert.equal((await putValues({ selectionRevision: 1, revision: 0, values: { f0001: 'Empresa S.A.S.', f0002: 'Empresa S.A.S.' } })).status, 200);
  assert.equal((await putValues({ selectionRevision: 1, revision: 0, values: { f0001: 'Otra', f0002: 'Otra' } })).status, 409);
  assert.equal((await (await req(valuePath, { headers: { cookie: alice } })).json()).values.f0001, 'Empresa S.A.S.');

  const updated = await req(`${path}/technical-plan/nodes/${plan.outline[0].id}/content`, { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Nota', version: plan.version }) }); assert.equal(updated.status, 200); const updatedPlan = await updated.json();
  assert.equal((await (await req(`${path}/technical-template`, { headers: { cookie: alice } })).json()).selection.current, true);
  assert.equal((await post(`${path}/jobs`, { kind: 'technical-plan.export-word', payload: { planVersion: updatedPlan.version, language: 'es' } }, { cookie: alice, 'idempotency-key': 'missing-selected-template' })).status, 409);
  const exportBody = { kind: 'technical-plan.export-word', payload: { planVersion: updatedPlan.version, language: 'es', templateJobId: job.id, exportFormat: {page:{paper_size:'a3',orientation:'landscape'}} } };
  const exportJob = (await (await post(`${path}/jobs`, exportBody, { cookie: alice, 'idempotency-key': 'export-template' })).json()).job;
  const exportHandler = createWordExportHandler({ convert: async snapshot => { assert.equal(snapshot.bidTemplate.toString(), 'documento'); assert.equal(snapshot.exportFormat.page.orientation, 'landscape'); assert.equal(snapshot.templateValues.f0001, 'Empresa S.A.S.'); return { bytes: Buffer.from('exportación'), warnings: [] }; } });
  const exportOutcome = await runOnce({ server: (await worker.ready).origin, token: runner.token, handlers: { 'technical-plan.export-word': exportHandler } }); assert.equal(exportOutcome.state, 'succeeded'); assert.equal(exportOutcome.jobId, exportJob.id);
  assert.equal((await req(`${path}/jobs/${exportJob.id}/artifact`, { headers: { cookie: alice } })).status, 200);
  const pendingExport = (await (await post(`${path}/jobs`, exportBody, { cookie: alice, 'idempotency-key': 'values-stale-export' })).json()).job;
  assert.equal((await putValues({ selectionRevision: 1, revision: 1, values: { f0001: 'Nuevo valor', f0002: 'Nuevo valor' } })).status, 200);
  const pendingClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.export-word'] }, { authorization: `Bearer ${runner.token}` })).json(); assert.equal(pendingClaim.job.id, pendingExport.id);
  assert.equal((await post(`/api/runner/jobs/${pendingExport.id}/plan-context`, { lease: pendingClaim.lease }, { authorization: `Bearer ${runner.token}` })).status, 409);
  assert.equal((await post(`/api/runner/jobs/${pendingExport.id}/complete`, { lease: pendingClaim.lease, status: 'failed', result: { message: 'Valores cambiaron' } }, { authorization: `Bearer ${runner.token}` })).status, 200);
  const parallel = await Promise.all([putValues({ selectionRevision: 1, revision: 2, values: { f0001: 'Primera', f0002: 'Primera' } }), putValues({ selectionRevision: 1, revision: 2, values: { f0001: 'Segunda', f0002: 'Segunda' } })]);
  assert.deepEqual(parallel.map(response => response.status).sort(), [200, 409]);


  const updatedBody = { ...body, payload: { ...body.payload, planVersion: updatedPlan.version } };
  const next = (await (await post(`${path}/jobs`, updatedBody, { cookie: alice, 'idempotency-key': 'stale-source' })).json()).job;
  await upload('otro.docx', Uint8Array.from([0x50, 0x4b, 3, 4]));
  assert.equal((await (await req(`${path}/technical-template`, { headers: { cookie: alice } })).json()).selection.current, false);
  assert.equal((await post(`${path}/jobs`, exportBody, { cookie: alice, 'idempotency-key': 'stale-template-export' })).status, 409);
  assert.equal((await req(`${path}/jobs/${job.id}/artifact`, { method: 'DELETE', headers: { cookie: alice, origin: 'http://localhost' } })).status, 204);
  assert.equal((await req(`${path}/jobs/${job.id}/artifact`, { headers: { cookie: alice } })).status, 404);
  assert.equal((await (await req(`${path}/technical-template`, { headers: { cookie: alice } })).json()).selection.current, false);

  assert.equal((await req(`${path}/technical-template`, { method: 'DELETE', headers: { cookie: alice, origin: 'http://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ revision: 1 }) })).status, 403);
  assert.equal((await req(`${path}/technical-template`, { method: 'DELETE', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ revision: 1 }) })).status, 200);
  assert.equal((await (await req(`${path}/technical-template`, { headers: { cookie: alice } })).json()).selection, null);

  const claim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.extract-template'] }, { authorization: `Bearer ${runner.token}` })).json(); assert.equal(claim.job.id, next.id);
  assert.equal((await post(`/api/runner/jobs/${next.id}/plan-context`, { lease: claim.lease }, { authorization: `Bearer ${runner.token}` })).status, 409);
 } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});

test('desde Miniflare se guardan campos y el runner los incorpora al Word con OpenXML real', { timeout: 60000, skip: !resolvePackagedHelper(fileURLToPath(new URL('../..', import.meta.url))) }, async () => {
 const { createRequire } = await import('node:module'); const require = createRequire(new URL('../../client/package.json', import.meta.url));
 const { Document, Packer, Paragraph, HeadingLevel } = require('docx');
 const bytes = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ text: 'Formulario', heading: HeadingLevel.HEADING_1 }), new Paragraph('Nombre de la empresa: ____________________')] }] }));
 const build = await mkdtemp(join(tmpdir(), 'savia-template-e2e-')); let worker;
 try {
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'template-e2e-test' }, r2Buckets: ['FILES'], bindings: {AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', CREDENTIAL_KEY_HEX: '11'.repeat(32), CREDENTIAL_KEY_ID: 'test' } }));
  const db = await worker.getD1Database('DB'); for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options), post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const account = await post('/api/auth/sign-up/email', { name: 'alice', email: 'alice@example.com', password: 'password-123456' }); const cookie = account.headers.get('set-cookie').split(';')[0];
  const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie })).json()).project, path = `/api/projects/${project.id}`;
  const plan = await (await post(`${path}/technical-plan/nodes`, { title: 'Formulario', version: 0 }, { cookie })).json();
  await db.prepare("UPDATE project_technical_plan_nodes SET content_mode = 'template-fill' WHERE project_id = ?").bind(project.id).run();
  const upload = await req(`${path}/files`, { method: 'POST', headers: { cookie, origin: 'http://localhost', 'x-file-name': 'pliego.docx', 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, body: bytes }); const file = (await upload.json()).file;
  const credential = (await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'test', secret: 'fixture' }, { cookie })).json()).credential;
  const pairing = await (await post('/api/runner-pairings', {}, { cookie })).json(), runner = await (await post('/api/runners/pair', { code: pairing.code, name: 'Equipo' })).json();
  const queued = await post(`${path}/jobs`, { kind: 'technical-plan.extract-template', credentialId: credential.id, payload: { fileIds: [file.id], language: 'es', dataProcessingConsent: true, planVersion: plan.version } }, { cookie, 'idempotency-key': 'extract-real' }); assert.equal(queued.status, 201); const job = (await queued.json()).job;
  let calls = 0;
  const createAiService = ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) {
   calls++; const ctx = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `template-e2e-${calls}` }; request.onRequestStart?.(ctx);
   const call = (name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id: `call-${calls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
   let message;
   if (calls === 1) message = call('openxml', { action: 'list-blocks' });
   else if (calls === 2) message = call('openxml', { action: 'extract-chapters', chapters: [{ id: plan.outline[0].id, title: 'Formulario', sourceTitle: 'Formulario' }] });
   else if (calls === 3) message = call('openxml', { action: 'scan-template-fields' });
   else if (calls === 4) { const contents = request.body.messages.flatMap(item => typeof item.content === 'string' ? [item.content] : []); const scan = contents.map(value => { try { return JSON.parse(value); } catch { return null; } }).find(value => value?.action === 'scan-template-fields' && Array.isArray(value.candidates)); assert.ok(scan?.candidates.length); message = call('write', { path: '投标模版字段分类.json', content: JSON.stringify({ fields: scan.candidates.map(candidate => ({ candidate_id: candidate.candidate_id, name: 'Empresa', fill_by: 'manual' })), ignored_candidate_ids: [] }) }); }
   else if (calls === 5) message = call('openxml', { action: 'apply-template-fields', fields_file: '投标模版字段分类.json' });
   else message = { role: 'assistant', content: 'Plantilla lista.' };
   return request.consumeResponse(new Response(JSON.stringify({ id: `template-e2e-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls <= 5 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
  } });
  assert.equal((await runOnce({ server: (await worker.ready).origin, token: runner.token, handlers: { 'technical-plan.extract-template': createTemplateExtractionHandler({ createAiService }) } })).state, 'succeeded');
  assert.equal((await post(`${path}/technical-template`, { jobId: job.id, revision: 0 }, { cookie })).status, 200);
  const fields = await (await req(`${path}/technical-template/values`, { headers: { cookie } })).json(); assert.ok(fields.fields.length);
  const values = Object.fromEntries(fields.fields.map(field => [field.id, 'Peña & Cía']));
  assert.equal((await req(`${path}/technical-template/values`, { method: 'PUT', headers: { cookie, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ selectionRevision: 1, revision: 0, values }) })).status, 200);
  const exported = await post(`${path}/jobs`, { kind: 'technical-plan.export-word', payload: { planVersion: plan.version, language: 'es', templateJobId: job.id } }, { cookie, 'idempotency-key': 'export-real' }); assert.equal(exported.status, 201); const exportJob = (await exported.json()).job;
  assert.equal((await runOnce({ server: (await worker.ready).origin, token: runner.token, handlers: { 'technical-plan.export-word': createWordExportHandler() } })).state, 'succeeded');
  const response = await req(`${path}/jobs/${exportJob.id}/artifact`, { headers: { cookie } }); assert.equal(response.status, 200);
  const AdmZip = require('adm-zip'), xml = new AdmZip(Buffer.from(await response.arrayBuffer())).readAsText('word/document.xml'); assert.match(require('cheerio').load(xml, { xmlMode: true }).text(), /Peña & Cía/); assert.match(xml, /savia:field:/);
 } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
