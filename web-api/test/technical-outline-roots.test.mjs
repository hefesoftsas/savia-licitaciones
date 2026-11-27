import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runOnce } from '../../runner/work-loop.mjs';
import { createOutlineRootsHandler } from '../../runner/technical-outline-roots.mjs';
import { createOutlineExpandHandler } from '../../runner/technical-outline-expand.mjs';
import { flattenExpanded } from '../src/technical-outline.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('selecciona raíces revisadas sin reemplazar el plan y detecta cambios de fuentes o análisis', async () => {
 const build = await mkdtemp(join(tmpdir(), 'savia-outline-')); let worker;
 try {
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'roots-test' }, r2Buckets: ['FILES'], bindings: { AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', CREDENTIAL_KEY_HEX: '11'.repeat(32), CREDENTIAL_KEY_ID: 'test' } }));
  const db = await worker.getD1Database('DB'); for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
  const post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  async function signup(name) { const r = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
  const alice = await signup('alice'), bob = await signup('bob');
  const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project;
  const path = `/api/projects/${project.id}`, jobs = `${path}/jobs`, analyses = `${path}/technical-analyses`, outline = `${path}/technical-outline`;
  await req(`${path}/technical-plan`, { headers: { cookie: alice } });
  const file = (await (await req(`${path}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': 'pliego.txt', 'content-type': 'text/plain' }, body: 'Pliego' })).json()).file;
  const credential = (await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'fixture', secret: 'fixture-secret' }, { cookie: alice })).json()).credential;
  const pairing = await (await post('/api/runner-pairings', {}, { cookie: alice })).json(); const runner = await (await post('/api/runners/pair', { code: pairing.code, name: 'Equipo' })).json(); const agent = { authorization: `Bearer ${runner.token}` };
  const rootsBody = { kind: 'technical-plan.generate-roots', credentialId: credential.id, payload: { fileIds: [file.id], language: 'es', dataProcessingConsent: true, planVersion: 0 } };
  assert.equal((await post(jobs, rootsBody, { cookie: alice, 'idempotency-key': 'missing' })).status, 409);
  for (const category of ['project-overview', 'technical-score', 'response-requirements']) {
   const analysis = (await (await post(jobs, { kind: 'technical-plan.analyze', credentialId: credential.id, payload: { category, fileIds: [file.id], language: 'es', dataProcessingConsent: true } }, { cookie: alice, 'idempotency-key': category })).json()).job;
   const claim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.analyze'] }, agent)).json(); assert.equal(claim.job.id, analysis.id);
   assert.equal((await post(`/api/runner/jobs/${analysis.id}/complete`, { lease: claim.lease, status: 'succeeded', result: { content: `Contenido ${category}` } }, agent)).status, 200);
   assert.equal((await post(`${analyses}/${category}/accept`, { jobId: analysis.id, revision: 0 }, { cookie: alice })).status, 200);
  }
  const owner = (await (await req('/api/me', { headers: { cookie: alice } })).json()).user.id;
  const imported = [{ id: 'projectOverview', label: 'Resumen', status: 'success', content: 'Resumen revisado de escritorio', error: null, sortOrder: 0 }, { id: 'techRequirements', label: 'Técnico', status: 'error', content: 'No usar', error: null, sortOrder: 1 }, { id: 'techRequirements', label: 'Técnico', status: 'success', content: 'Criterios de escritorio', error: null, sortOrder: 2 }, { id: 'responseFileRequirements', label: 'Respuesta', status: 'success', content: 'Requisitos de escritorio', error: null, sortOrder: 3 }, { id: 'legacy-project-overview', label: '', status: 'saved', content: 'Resumen anterior', error: null, sortOrder: 4 }];
  await db.prepare('INSERT INTO desktop_analysis_imports (owner_id, request_id, project_id, content_hash, analyses_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(owner, 'fixture', project.id, 'fixture-hash', JSON.stringify(imported), new Date().toISOString()).run();
  const reviewData = await (await req(analyses, { headers: { cookie: alice } })).json();
  const review = { index: 0, revision: 1, fileIds: [file.id], importHash: reviewData.importHash, reviewSnapshot: reviewData.reviewSnapshot };
  const oldJob = (await (await post(jobs, rootsBody, { cookie: alice, 'idempotency-key': 'roots-before-import' })).json()).job;
  const oldClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-roots'] }, agent)).json(); assert.equal(oldClaim.job.id, oldJob.id);
  assert.equal((await post(`${analyses}/project-overview/review-import`, review, { cookie: bob })).status, 404);
  assert.equal((await post(`${analyses}/technical-score/review-import`, { ...review, index: 1 }, { cookie: alice })).status, 400);
  assert.equal((await post(`${analyses}/project-overview/review-import`, { ...review, fileIds: ['foreign'] }, { cookie: alice })).status, 404);
  assert.equal((await post(`${analyses}/project-overview/review-import`, { ...review, reviewSnapshot: {} }, { cookie: alice })).status, 409);
  const extraFile = await req(`${path}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': 'nuevo.txt', 'content-type': 'text/plain' }, body: 'Nuevo documento' });
  const extraId = (await extraFile.json()).file.id;
  assert.equal((await post(`${analyses}/project-overview/review-import`, review, { cookie: alice })).status, 409);
  await db.prepare('DELETE FROM project_files WHERE id = ?').bind(extraId).run();
  assert.equal((await post(`${analyses}/project-overview/review-import`, review, { cookie: alice })).status, 200);
  assert.equal((await post(`${analyses}/project-overview/review-import`, review, { cookie: alice })).status, 409);
  assert.equal((await post(`/api/runner/jobs/${oldJob.id}/plan-context`, { lease: oldClaim.lease }, agent)).status, 409);
  assert.equal((await post(`${jobs}/${oldJob.id}/cancel`, {}, { cookie: alice })).status, 200);
  const reviewedAnalysis = (await (await req(analyses, { headers: { cookie: alice } })).json()).analyses.find(x => x.category === 'project-overview'); assert.equal(reviewedAnalysis.importedFromDesktop, true); assert.equal(reviewedAnalysis.content, imported[0].content); assert.deepEqual(reviewedAnalysis.reviewedFileIds, [file.id]);
  const created = await post(jobs, rootsBody, { cookie: alice, 'idempotency-key': 'roots' }); assert.equal(created.status, 201, await created.clone().text()); const job = (await created.json()).job;
  const claim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-roots'] }, agent)).json();
  const context = await (await post(`/api/runner/jobs/${job.id}/plan-context`, { lease: claim.lease }, agent)).json(); assert.match(context.analyses['technical-score'], /Contenido/); assert.equal(context.analyses['project-overview'], 'Resumen revisado de escritorio');
  const id1 = crypto.randomUUID(), id2 = crypto.randomUUID();
  const candidate = [{ id: id1, title: 'Técnico', description: 'Alcance', attr: '技术', content_mode: 'ai-generate', number: '1' }, { id: id2, title: 'Oferta', description: 'Precio', attr: '报价', content_mode: 'manual-fill', number: '2' }];
  assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, { lease: claim.lease, status: 'succeeded', result: { outline: candidate } }, agent)).status, 200);
  assert.equal((await req(outline, { headers: { cookie: bob } })).status, 404);
  const proposals = await (await req(outline, { headers: { cookie: alice } })).json(); assert.equal(proposals.jobs[0].stale, false);
  const body = { jobId: job.id, revision: 0, items: [{ id: id1, attr: '技术', content_mode: 'ai-generate' }] };
  assert.equal((await post(`${outline}/selection`, body, { cookie: bob })).status, 404);
  assert.equal((await post(`${outline}/selection`, { ...body, items: [{ ...body.items[0], id: crypto.randomUUID() }] }, { cookie: alice })).status, 400);
  assert.equal((await post(`${outline}/selection`, body, { cookie: alice })).status, 200);
  const selected = await (await req(outline, { headers: { cookie: alice } })).json(); assert.equal(selected.selection.items.length, 1); assert.equal(selected.selection.items[0].id, id1); assert.equal(selected.selection.current, true);
  assert.equal((await (await req(`${path}/technical-plan`, { headers: { cookie: alice } })).json()).outline.length, 0);
  assert.equal((await post(`${outline}/selection`, body, { cookie: alice })).status, 200);
  assert.equal((await post(`${outline}/selection`, { ...body, items: [{ id: id2, attr: '报价', content_mode: 'manual-fill' }] }, { cookie: alice })).status, 409);
  const piJob = (await (await post(jobs, rootsBody, { cookie: alice, 'idempotency-key': 'roots-pi' })).json()).job;
  let calls = 0, readApproved = false;
  const fakeProvider = ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) {
    calls++; const context = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `roots-${calls}` }; request.onRequestStart?.(context);
    readApproved ||= JSON.stringify(request.body.messages).includes('Contenido technical-score');
    const output = JSON.stringify({ outline: [{ id: null, title: 'Propuesta técnica', description: 'Respuesta a criterios', attr: '技术', content_mode: 'ai-generate' }] });
    const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-analysis', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'technical-score.md' }) } }] } : calls === 2 ? { role: 'assistant', content: null, tool_calls: [{ id: 'write-outline', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: 'outline.json', content: output }) } }] } : { role: 'assistant', content: 'Índice preparado.' };
    return request.consumeResponse(new Response(JSON.stringify({ id: `roots-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls <= 2 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), context);
  } });
  const executed = await runOnce({ server: (await worker.ready).origin, token: runner.token, handlers: { 'technical-plan.generate-roots': createOutlineRootsHandler({ createAiService: fakeProvider }) } });
  assert.equal(executed.state, 'succeeded'); assert.equal(executed.jobId, piJob.id); assert.equal(readApproved, true);
  const piResult = (await (await req(outline, { headers: { cookie: alice } })).json()).jobs.find(item => item.id === piJob.id); assert.equal(piResult.result.outline[0].title, 'Propuesta técnica');

  const expandBody = { kind: 'technical-plan.expand-outline', credentialId: credential.id, payload: { language: 'es', dataProcessingConsent: true, noTechnicalScore: true, selectionRevision: 1 } };
  const expandCreated = await post(jobs, expandBody, { cookie: alice, 'idempotency-key': 'expand' }); assert.equal(expandCreated.status, 201, await expandCreated.clone().text()); const expansion = (await expandCreated.json()).job;
  const expandClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.expand-outline'] }, agent)).json(); assert.equal(expandClaim.job.id, expansion.id);
  const expandContext = await (await post(`/api/runner/jobs/${expansion.id}/plan-context`, { lease: expandClaim.lease }, agent)).json(); assert.equal(expandContext.roots[0].id, id1);
  const generatedOutline = [{ id: id1, title: 'Técnico', description: 'Alcance', attr: '技术', number: '1', children: [{ id: crypto.randomUUID(), title: 'Método', description: 'Método de trabajo', content_mode: 'ai-generate', number: '1.1' }, { id: crypto.randomUUID(), title: 'Gestión', description: 'Gestión del trabajo', content_mode: 'ai-generate', number: '1.2' }] }];
  assert.equal((await post(`/api/runner/jobs/${expansion.id}/complete`, { lease: expandClaim.lease, status: 'succeeded', result: { outline: generatedOutline, warnings: [] } }, agent)).status, 200);
  const altered = (await (await post(jobs, expandBody, { cookie: alice, 'idempotency-key': 'expand-altered' })).json()).job;
  const alteredClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.expand-outline'] }, agent)).json(); assert.equal(alteredClaim.job.id, altered.id);
  assert.equal((await post(`/api/runner/jobs/${altered.id}/complete`, { lease: alteredClaim.lease, status: 'succeeded', result: { outline: [{ ...generatedOutline[0], title: 'Título no aprobado' }] } }, agent)).status, 200);
  assert.equal((await post(`${outline}/apply`, { jobId: altered.id }, { cookie: alice })).status, 400);
  assert.equal((await (await req(`${path}/technical-plan`, { headers: { cookie: alice } })).json()).version, 0);
  const actualExpansion = (await (await post(jobs, expandBody, { cookie: alice, 'idempotency-key': 'expand-pi' })).json()).job;
  let stages = 0;
  const expansionProvider = ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) {
    stages++; const context = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `expand-${stages}` }; request.onRequestStart?.(context);
    const expanded = JSON.stringify({ outline: [{ id: id1, title: 'Técnico', description: 'Alcance', attr: '技术', children: [{ id: null, title: 'Método', description: 'Método de trabajo', content_mode: 'ai-generate' }, { id: null, title: 'Gestión', description: 'Gestión del trabajo', content_mode: 'ai-generate' }] }] });
    const review = JSON.stringify({ status: 'passed', issues: [], user_feedback: '', summary: 'Revisado' });
    const write = (path, content) => ({ role: 'assistant', content: null, tool_calls: [{ id: `write-${stages}`, type: 'function', function: { name: 'write', arguments: JSON.stringify({ path, content }) } }] });
    const message = stages === 1 ? write('outline.json', expanded) : stages === 3 ? write('outline-review.json', review) : { role: 'assistant', content: 'Etapa terminada.' };
    return request.consumeResponse(new Response(JSON.stringify({ id: `expand-${stages}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: stages === 1 || stages === 3 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), context);
  } });
  const expandedRun = await runOnce({ server: (await worker.ready).origin, token: runner.token, handlers: { 'technical-plan.expand-outline': createOutlineExpandHandler({ createAiService: expansionProvider }) } });
  assert.equal(expandedRun.state, 'succeeded'); assert.equal(expandedRun.jobId, actualExpansion.id); assert.ok(stages >= 4);
  assert.equal((await post(`${outline}/apply`, { jobId: expansion.id }, { cookie: bob })).status, 404);
  assert.equal((await post(`${outline}/apply`, {jobId:actualExpansion.id,edits:[{id:crypto.randomUUID(),title:'Inválido',description:'Inválido'}]}, {cookie:alice})).status,400);
  const edits=[{id:id1,title:'Capítulo editado',description:'Descripción revisada'}];
  const applied = await Promise.all([post(`${outline}/apply`, { jobId: actualExpansion.id, edits }, { cookie: alice }), post(`${outline}/apply`, { jobId: actualExpansion.id, edits }, { cookie: alice })]); assert.deepEqual(applied.map(value => value.status).sort(), [200, 200]);
  assert.equal((await post(`${outline}/apply`, { jobId: expansion.id }, { cookie: alice })).status, 409);
  const appliedPlan = await (await req(`${path}/technical-plan`, { headers: { cookie: alice } })).json(); assert.equal(appliedPlan.version, 1); assert.equal(appliedPlan.outline[0].id, id1); assert.equal(appliedPlan.outline[0].title, 'Capítulo editado'); assert.equal(appliedPlan.outline[0].description, 'Descripción revisada'); assert.equal(appliedPlan.outline[0].children.length, 2);
  assert.equal((await post(`${outline}/discard`, {jobId:piJob.id}, {cookie:bob})).status,404);
  assert.equal((await post(`${outline}/discard`, {jobId:piJob.id}, {cookie:alice})).status,200);
  const discarded = await (await req(outline, {headers:{cookie:alice}})).json();
  assert.equal(discarded.jobs.find(item=>item.id===piJob.id).discarded,true);
  assert.deepEqual((await (await req(`${path}/technical-plan`, {headers:{cookie:alice}})).json()).outline, appliedPlan.outline);
  assert.equal((await post(`${outline}/selection`, {jobId:piJob.id,revision:1,items:[{id:piResult.result.outline[0].id,attr:'技术',content_mode:'ai-generate'}]}, {cookie:alice})).status,409);
  const nextRoot=(await (await post(jobs,{...rootsBody,payload:{...rootsBody.payload,planVersion:1}},{cookie:alice,'idempotency-key':'next-proposal'})).json()).job;
  const nextClaim=await (await post('/api/runner/jobs/claim',{kinds:['technical-plan.generate-roots']},agent)).json();
  const nextId=crypto.randomUUID(), nextItems=[{id:nextId,title:'Nueva propuesta',description:'Alternativa',attr:'技术',content_mode:'ai-generate'}];
  assert.equal((await post(`/api/runner/jobs/${nextRoot.id}/complete`,{lease:nextClaim.lease,status:'succeeded',result:{outline:nextItems}},agent)).status,200);
  assert.equal((await post(`${outline}/selection`,{jobId:nextRoot.id,revision:1,items:[{id:nextId,attr:'技术',content_mode:'ai-generate'}]},{cookie:alice})).status,200);
  assert.deepEqual((await (await req(`${path}/technical-plan`,{headers:{cookie:alice}})).json()).outline,appliedPlan.outline);
  assert.equal((await post(`${outline}/discard`,{jobId:nextRoot.id},{cookie:alice})).status,200);
  assert.equal((await (await req(outline,{headers:{cookie:alice}})).json()).selection.current,false);
  assert.equal((await post(jobs,{...expandBody,payload:{...expandBody.payload,selectionRevision:2}},{cookie:alice,'idempotency-key':'discarded-expand'})).status,409);
  const updatedAnalysis = (await (await post(jobs, { kind: 'technical-plan.analyze', credentialId: credential.id, payload: { category: 'technical-score', fileIds: [file.id], language: 'es', dataProcessingConsent: true } }, { cookie: alice, 'idempotency-key': 'new-score' })).json()).job;
  const analysisClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.analyze'] }, agent)).json();
  assert.equal((await post(`/api/runner/jobs/${updatedAnalysis.id}/complete`, { lease: analysisClaim.lease, status: 'succeeded', result: { content: 'Nuevos criterios' } }, agent)).status, 200);
  assert.equal((await post(`${analyses}/technical-score/accept`, { jobId: updatedAnalysis.id, revision: 1 }, { cookie: alice })).status, 200);
  const changedAnalysis = await (await req(outline, { headers: { cookie: alice } })).json(); assert.equal(changedAnalysis.selection.current, false);
  assert.equal((await post(`${outline}/selection`, { ...body, revision: 1 }, { cookie: alice })).status, 409);
  await post(`${path}/technical-plan/nodes`, { title: 'Edición humana', version: 0 }, { cookie: alice });
  const stale = await (await req(outline, { headers: { cookie: alice } })).json(); assert.equal(stale.selection.current, false); assert.equal(stale.jobs.find(item => item.id === job.id).stale, true);
  assert.equal((await post(`${outline}/selection`, { ...body, revision: 1 }, { cookie: alice })).status, 409);
  const newOverview = (await (await post(jobs, { kind: 'technical-plan.analyze', credentialId: credential.id, payload: { category: 'project-overview', fileIds: [file.id], language: 'es', dataProcessingConsent: true } }, { cookie: alice, 'idempotency-key': 'replace-import' })).json()).job;
  const overviewClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.analyze'] }, agent)).json(); assert.equal(overviewClaim.job.id, newOverview.id);
  assert.equal((await post(`/api/runner/jobs/${newOverview.id}/complete`, { lease: overviewClaim.lease, status: 'succeeded', result: { content: 'Análisis nuevo' } }, agent)).status, 200);
  assert.equal((await post(`${analyses}/project-overview/accept`, { jobId: newOverview.id, revision: 2 }, { cookie: alice })).status, 200);
  const replacement = (await (await req(analyses, { headers: { cookie: alice } })).json()).analyses.find(item => item.category === 'project-overview'); assert.equal(replacement.content, 'Análisis nuevo'); assert.equal(replacement.importedFromDesktop, false);
  const finalReviewData = await (await req(analyses, { headers: { cookie: alice } })).json();
  const finalReview = { fileIds: [file.id], importHash: finalReviewData.importHash, reviewSnapshot: finalReviewData.reviewSnapshot };
  assert.equal((await post(`${analyses}/technical-score/review-import`, { ...finalReview, index: 2, revision: 2 }, { cookie: alice })).status, 200);
  assert.equal((await post(`${analyses}/response-requirements/review-import`, { ...finalReview, index: 3, revision: 1 }, { cookie: alice })).status, 200);
  const finalJobResponse = await post(jobs, { ...rootsBody, payload: { ...rootsBody.payload, planVersion: 1 } }, { cookie: alice, 'idempotency-key': 'roots-reviewed-three' }); assert.equal(finalJobResponse.status, 201, await finalJobResponse.clone().text());
  const finalJob = (await finalJobResponse.json()).job, finalClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.generate-roots'] }, agent)).json(); assert.equal(finalClaim.job.id, finalJob.id);
  const finalContext = await (await post(`/api/runner/jobs/${finalJob.id}/plan-context`, { lease: finalClaim.lease }, agent)).json(); assert.equal(finalContext.analyses['technical-score'], 'Criterios de escritorio'); assert.equal(finalContext.analyses['response-requirements'], 'Requisitos de escritorio'); assert.equal(finalContext.analyses['project-overview'], 'Análisis nuevo');
  assert.equal((await post(`${analyses}/project-overview/review-import`, { ...finalReview, index: 4, revision: 3 }, { cookie: alice })).status, 200);
  await post(`${jobs}/${finalJob.id}/cancel`,{}, {cookie:alice});
  const replacementJob=(await (await post(jobs,{...rootsBody,payload:{...rootsBody.payload,planVersion:1}},{cookie:alice,'idempotency-key':'replace-outline-roots'})).json()).job;
  const replacementClaim=await (await post('/api/runner/jobs/claim',{kinds:['technical-plan.generate-roots']},agent)).json(); assert.equal(replacementClaim.job.id,replacementJob.id);
  const replacementId=crypto.randomUUID(), replacementItems=[{id:replacementId,title:'Índice nuevo',description:'Oferta revisada',attr:'技术',content_mode:'ai-generate'}];
  assert.equal((await post(`/api/runner/jobs/${replacementJob.id}/complete`,{lease:replacementClaim.lease,status:'succeeded',result:{outline:replacementItems}},agent)).status,200);
  assert.equal((await post(`${outline}/selection`,{jobId:replacementJob.id,revision:2,items:[{id:replacementId,attr:'技术',content_mode:'ai-generate'}]},{cookie:alice})).status,200);
  const replaceExpand=(await (await post(jobs,{...expandBody,payload:{...expandBody.payload,selectionRevision:3}},{cookie:alice,'idempotency-key':'replace-outline-expanded'})).json()).job;
  const replaceClaim=await (await post('/api/runner/jobs/claim',{kinds:['technical-plan.expand-outline']},agent)).json(); assert.equal(replaceClaim.job.id,replaceExpand.id);
  assert.equal((await post(`/api/runner/jobs/${replaceExpand.id}/complete`,{lease:replaceClaim.lease,status:'succeeded',result:{outline:replacementItems}},agent)).status,200);
  assert.deepEqual((await (await req(`${path}/technical-plan`,{headers:{cookie:alice}})).json()).outline,appliedPlan.outline);
  assert.equal((await post(`${outline}/apply`,{jobId:replaceExpand.id},{cookie:alice})).status,200);
  const replaced=await (await req(`${path}/technical-plan`,{headers:{cookie:alice}})).json(); assert.equal(replaced.version,2); assert.equal(replaced.outline[0].title,'Índice nuevo');
 } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});

test('flattenExpanded reconcilia UUIDs transpuestos entre raíces confirmadas y rechaza alteraciones', () => {
  const rootA = { id: crypto.randomUUID(), title: 'Garantía de seriedad', description: 'Póliza', attr: '商务/资信', content_mode: 'template-fill' };
  const rootB = { id: crypto.randomUUID(), title: 'Experiencia habilitante', description: 'Contratos previos', attr: '业绩', content_mode: 'template-fill' };
  const rootC = { id: crypto.randomUUID(), title: 'Enfoque metodológico', description: 'Metodología técnica', attr: '技术', content_mode: 'ai-generate' };
  const child1 = { id: crypto.randomUUID(), title: 'Fase diagnóstica', description: 'Diagnóstico', content_mode: 'ai-generate' };
  const child2 = { id: crypto.randomUUID(), title: 'Fase de control', description: 'Control', content_mode: 'ai-generate' };

  const swapped = [
    { ...rootA, id: rootB.id },
    { ...rootB, id: rootA.id },
    { id: rootC.id, title: rootC.title, description: rootC.description, attr: rootC.attr, children: [child1, child2] },
  ];
  const flattened = flattenExpanded(swapped, [rootA, rootB, rootC]);
  assert.ok(flattened);
  assert.equal(flattened[0].id, rootA.id);
  assert.equal(flattened[0].title, rootA.title);
  assert.equal(flattened[1].id, rootB.id);
  assert.equal(flattened[1].title, rootB.title);
  assert.equal(flattened[2].id, rootC.id);
  assert.equal(flattened[3].parent, rootC.id);
  assert.equal(flattened[4].parent, rootC.id);

  assert.equal(flattenExpanded([{ ...rootA, title: 'Título modificado' }, rootB, swapped[2]], [rootA, rootB, rootC]), null);
  assert.equal(flattenExpanded([{ ...rootA, children: [child1, child2] }, rootB, rootC], [rootA, rootB, rootC]), null);

  const regenerated = [
    { ...rootA, id: crypto.randomUUID() },
    rootB,
    swapped[2],
  ];
  const recovered = flattenExpanded(regenerated, [rootA, rootB, rootC]);
  assert.ok(recovered);
  assert.equal(recovered[0].id, rootA.id);
  assert.equal(recovered[0].title, rootA.title);
});
