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

test('los hechos revisados se aplican atómicamente y sus cambios invalidan el texto anterior', async () => {
 const build = await mkdtemp(join(tmpdir(), 'savia-global-facts-')); let worker;
 try {
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'global-facts-test' }, r2Buckets: ['FILES'], bindings: { AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', CREDENTIAL_KEY_HEX: '11'.repeat(32), CREDENTIAL_KEY_ID: 'test' } }));
  const db = await worker.getD1Database('DB'); for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options), post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  async function signup(name) { const r = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
  const alice = await signup('alice'), bob = await signup('bob');
  const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project, path = `/api/projects/${project.id}`, factsPath = `${path}/technical-facts`;
  const plan = await (await post(`${path}/technical-plan/nodes`, { title: 'Metodología', version: 0 }, { cookie: alice })).json(), node = plan.outline[0].id;
  const saved = await req(`${path}/technical-plan/nodes/${node}/content`, { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Texto anterior', version: plan.version }) }); const initialPlan = await saved.json();
  const upload = () => req(`${path}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': 'pliego.txt', 'content-type': 'text/plain' }, body: 'El plazo es de dos meses.' }); const file = (await (await upload()).json()).file;
  const credential = (await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'fixture', secret: 'fixture-secret' }, { cookie: alice })).json()).credential;
  const pairing = await (await post('/api/runner-pairings', {}, { cookie: alice })).json(), runner = await (await post('/api/runners/pair', { code: pairing.code, name: 'Equipo' })).json(), agent = { authorization: `Bearer ${runner.token}` };
  const body = { kind: 'technical-plan.generate-facts', credentialId: credential.id, payload: { fileIds: [file.id], language: 'es', dataProcessingConsent: true, mode: 'placeholder', planVersion: initialPlan.version } };
  assert.equal((await post(`${path}/jobs`, { ...body, payload: { ...body.payload, dataProcessingConsent: false } }, { cookie: alice, 'idempotency-key': 'no-consent' })).status, 400);
  const created = await post(`${path}/jobs`, body, { cookie: alice, 'idempotency-key': 'facts-1' }); assert.equal(created.status, 201, await created.clone().text()); const job = (await created.json()).job;
  const claim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-facts'] }, agent)).json(); assert.equal(claim.job.id, job.id);
  const events=[{sequence:1,code:'preparing',at:new Date().toISOString()},{sequence:2,code:'tool.read.start',at:new Date().toISOString(),details:{path:'sources/pliego.md'}},{sequence:3,code:'agent.console',at:new Date().toISOString(),details:{text:'{"result":"Contenido de prueba"}',event:'tool.end',tool:'read',part:1,totalParts:1}}];
  assert.equal((await post(`/api/runner/jobs/${job.id}/renew`,{lease:claim.lease,events},agent)).status,200);
  assert.equal((await post(`/api/runner/jobs/${job.id}/renew`,{lease:claim.lease,events},agent)).status,200);
  assert.equal((await post(`/api/runner/jobs/${job.id}/renew`,{lease:claim.lease,events:[{...events[0],code:'secret prompt'}]},agent)).status,400);
  assert.equal((await post(`/api/runner/jobs/${job.id}/renew`,{lease:'0'.repeat(64),events},agent)).status,409);
  assert.equal((await req(`${path}/jobs/${job.id}/activity`,{headers:{cookie:bob}})).status,404);
  const activity=await (await req(`${path}/jobs/${job.id}/activity`,{headers:{cookie:alice}})).json();
  assert.equal(activity.events.length,3); assert.equal(activity.events[2].details.text,events[2].details.text); assert.equal(activity.events[1].code,'tool.read.start'); assert.deepEqual(activity.events[1].details,{path:'sources/pliego.md'});
  const context = await (await post(`/api/runner/jobs/${job.id}/plan-context`, { lease: claim.lease }, agent)).json(); assert.equal(context.outline[0].title, 'Metodología');
  const groups = [{ id: 'plazo', title: 'Plazo', content: 'Dos meses' }];
  assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, { lease: claim.lease, status: 'succeeded', result: { groups } }, agent)).status, 200);
  assert.equal((await req(factsPath, { headers: { cookie: bob } })).status, 404);
  assert.equal((await (await req(`${path}/technical-plan`, { headers: { cookie: alice } })).json()).outline[0].content, 'Texto anterior');
  assert.equal((await post(`${factsPath}/apply`, { jobId: job.id, revision: 0 }, { cookie: bob })).status, 404);
  assert.equal((await (await req(factsPath, {headers:{cookie:alice}})).json()).affectedChapterCount, 1);
  const applied = await post(`${factsPath}/apply`, { jobId: job.id, revision: 0 }, { cookie: alice }); assert.equal(applied.status, 200, await applied.clone().text());
  assert.equal((await post(`${factsPath}/apply`, { jobId: job.id, revision: 0 }, { cookie: alice })).status, 200);
  const facts = await (await req(factsPath, { headers: { cookie: alice } })).json(); assert.equal(facts.affectedChapterCount, 0); assert.equal(facts.revision, 1); assert.equal(facts.current, true); assert.deepEqual(facts.groups, groups);
  const after = await (await req(`${path}/technical-plan`, { headers: { cookie: alice } })).json(); assert.equal(after.version, initialPlan.version + 1); assert.equal(after.outline[0].content, '');
  const realJob = (await (await post(`${path}/jobs`, { ...body, payload: { ...body.payload, planVersion: after.version } }, { cookie: alice, 'idempotency-key': 'facts-pi' })).json()).job;
  let calls = 0, sawSource = false;
  const fakeProvider = ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) {
    calls++; const context = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `facts-${calls}` }; request.onRequestStart?.(context); sawSource ||= JSON.stringify(request.body.messages).includes('El plazo es de dos meses.');
    const output = JSON.stringify({ groups: [{ id: 'plazo', title: 'Plazo', content: 'Dos meses' }] });
    const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-source', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: '招标文件/招标文件-01-pliego.txt.md' }) } }] } : calls === 2 ? { role: 'assistant', content: null, tool_calls: [{ id: 'write-facts', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: 'global-facts.json', content: output }) } }] } : { role: 'assistant', content: 'Hechos listos.' };
    return request.consumeResponse(new Response(JSON.stringify({ id: `facts-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls <= 2 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), context);
  } });
  const realRun = await runOnce({ server: (await worker.ready).origin, token: runner.token, handlers: { 'technical-plan.generate-facts': createGlobalFactsHandler({ createAiService: fakeProvider }) } });
  assert.equal(realRun.state, 'succeeded'); assert.equal(realRun.jobId, realJob.id); assert.equal(sawSource, true);
  const proposals = await (await req(factsPath, { headers: { cookie: alice } })).json(); assert.equal(proposals.jobs.find(item => item.id === realJob.id).result.groups[0].title, 'Plazo');
  const removeAttempt = (jobId, cookie = alice, origin = 'http://localhost') => req(`${factsPath}/attempts`, { method: 'DELETE', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify({jobId}) });
  assert.equal((await removeAttempt(job.id, bob)).status, 404);
  assert.equal((await removeAttempt(job.id, alice, 'http://other.example')).status, 403);
  assert.equal((await removeAttempt(job.id)).status, 409); // Confirmed data provenance.
  assert.equal((await removeAttempt(realJob.id)).status, 409); // Latest attempt.
  const draftBody = { kind: 'technical-plan.generate-section', credentialId: credential.id, payload: { nodeId: node, planVersion: after.version, fileIds: [file.id], language: 'es', dataProcessingConsent: true } };
  const draft = (await (await post(`${path}/jobs`, draftBody, { cookie: alice, 'idempotency-key': 'draft-with-facts' })).json()).job;
  const draftClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-section'] }, agent)).json(); assert.equal(draftClaim.job.id, draft.id);
  const draftContext = await (await post(`/api/runner/jobs/${draft.id}/plan-context`, { lease: draftClaim.lease }, agent)).json(); assert.equal(draftContext.globalFacts[0].content, 'Dos meses');
  assert.equal((await post(`/api/runner/jobs/${draft.id}/complete`, { lease: draftClaim.lease, status: 'succeeded', result: { content: 'Borrador anterior' } }, agent)).status, 200);
  const put = data => req(factsPath, { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const changes = await Promise.all([put({ revision: 1, planVersion: after.version, groups: [{ ...groups[0], content: 'Tres meses' }] }), put({ revision: 1, planVersion: after.version, groups: [{ ...groups[0], content: 'Cuatro meses' }] })]); assert.deepEqual(changes.map(response => response.status).sort(), [200, 409]);
  const editedPlan = await (await req(`${path}/technical-plan`, { headers: { cookie: alice } })).json();
  assert.equal((await post(`${path}/technical-plan/nodes/${node}/apply-job`, { jobId: draft.id, version: editedPlan.version }, { cookie: alice })).status, 409);
  const sourceDraftBody = { ...draftBody, payload: { ...draftBody.payload, planVersion: editedPlan.version } };
  const savedGroups = await db.prepare('SELECT groups_json FROM project_global_facts WHERE project_id=?').bind(project.id).first();
  await db.prepare('UPDATE project_global_facts SET groups_json=? WHERE project_id=?').bind(JSON.stringify([{id:'plazo',title:'Plazo',content:'[Pendiente por completar]'}]),project.id).run();
  const blockedDraft = await post(`${path}/jobs`, sourceDraftBody, {cookie:alice,'idempotency-key':'draft-unresolved-facts'});
  assert.equal(blockedDraft.status,409); assert.equal((await blockedDraft.json()).error,'facts_pending_replacements');
  await db.prepare('UPDATE project_global_facts SET groups_json=? WHERE project_id=?').bind(savedGroups.groups_json,project.id).run();
  const sourceDraft = (await (await post(`${path}/jobs`, sourceDraftBody, { cookie: alice, 'idempotency-key': 'draft-source-stale' })).json()).job;
  const sourceClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-section'] }, agent)).json(); assert.equal(sourceClaim.job.id, sourceDraft.id);
  assert.equal((await post(`/api/runner/jobs/${sourceDraft.id}/complete`, { lease: sourceClaim.lease, status: 'succeeded', result: { content: 'Texto basado en fuentes anteriores' } }, agent)).status, 200);
  assert.equal((await removeAttempt(job.id)).status, 204); // Older result, no longer the source of confirmed data.
  const remainingFacts = await (await req(factsPath, {headers:{cookie:alice}})).json();
  assert.equal(remainingFacts.jobs.some(item=>item.id===job.id), false);
  assert.equal(remainingFacts.groups.length, 1);
  assert.equal((await removeAttempt(sourceDraft.id)).status, 409); // Another task kind cannot be removed here.
  await upload(); const stale = await (await req(factsPath, { headers: { cookie: alice } })).json(); assert.equal(stale.current, false);
  assert.equal((await post(`${path}/technical-plan/nodes/${node}/apply-job`, { jobId: sourceDraft.id, version: editedPlan.version }, { cookie: alice })).status, 409);
  assert.equal((await post(`${path}/jobs`, { ...draftBody, payload: { ...draftBody.payload, planVersion: editedPlan.version } }, { cookie: alice, 'idempotency-key': 'stale-facts-draft' })).status, 409);
  // Editing a fresh generated proposal must not reuse the stale saved facts snapshot.
  const renewedJob = (await (await post(`${path}/jobs`, {...body,payload:{...body.payload,planVersion:editedPlan.version}}, {cookie:alice,'idempotency-key':'renewed-facts'})).json()).job;
  const renewedClaim = await (await post('/api/runner/jobs/claim', {kinds:['technical-plan.generate-facts']}, agent)).json();
  assert.equal(renewedClaim.job.id, renewedJob.id);
  await post(`/api/runner/jobs/${renewedJob.id}/complete`, {lease:renewedClaim.lease,status:'succeeded',result:{groups}},agent);
  const editedGroups = [{...groups[0],content:'Dato completado por el usuario'}];
  assert.equal((await put({revision:stale.revision,planVersion:editedPlan.version,groups:editedGroups})).status,409);
  assert.equal((await put({revision:stale.revision,planVersion:editedPlan.version,jobId:realJob.id,groups:editedGroups})).status,409);
  const renewedSave = await put({revision:stale.revision,planVersion:editedPlan.version,jobId:renewedJob.id,groups:editedGroups});
  assert.equal(renewedSave.status,200,await renewedSave.clone().text());
  const renewedFacts = await (await req(factsPath,{headers:{cookie:alice}})).json();
  assert.equal(renewedFacts.current,true);
  assert.deepEqual(renewedFacts.groups,editedGroups);
  assert.equal(renewedFacts.sourceJobId,renewedJob.id);
 } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
