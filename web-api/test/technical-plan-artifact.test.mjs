import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const { runOnce } = await import(process.env.SAVIA_TEST_RUNNER_WORK_LOOP || new URL('../../runner/work-loop.mjs', import.meta.url));
const { createWordExportHandler } = await import(process.env.SAVIA_TEST_EXPORT_MODULE || new URL('../../runner/technical-plan-export.mjs', import.meta.url));
import { createRequire } from 'node:module';
import { wordRecovery } from '../src/word-recovery.js';
import { cleanupDesktopUploads } from '../src/desktop-file-cleanup.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('el Word versionado se entrega una sola vez al propietario con concesión vigente', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-artifact-')); let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
    worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'artifact-test' }, r2Buckets: ['FILES'], bindings: { AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost' } }));
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    async function signup(name) { const r = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
    const alice = await signup('alice'), bob = await signup('bob');
    const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project;
    const planPath = `/api/projects/${project.id}/technical-plan`, jobsPath = `/api/projects/${project.id}/jobs`;
    const plan = await (await post(`${planPath}/nodes`, { title: 'Metodología', version: 0 }, { cookie: alice })).json();
    await db.prepare("UPDATE project_technical_plan_nodes SET content_mode = 'ai-generate' WHERE project_id = ? AND node_id = ?").bind(project.id, plan.outline[0].id).run();
    const pairing = await (await post('/api/runner-pairings', {}, { cookie: alice })).json(); const runner = await (await post('/api/runners/pair', { code: pairing.code, name: 'Equipo' })).json();
    const pairing2 = await (await post('/api/runner-pairings', {}, { cookie: bob })).json(); const other = await (await post('/api/runners/pair', { code: pairing2.code, name: 'Otro' })).json();
    const agent = value => ({ authorization: `Bearer ${value.token}` });
    const create = (version, key) => post(jobsPath, { kind: 'technical-plan.export-word', payload: { planVersion: version, language: 'es' } }, { cookie: alice, 'idempotency-key': key });
    const selectedBody = {kind:'technical-plan.export-word',payload:{planVersion:plan.version,language:'es',exportFormat:{page:{paper_size:'a3',orientation:'landscape'}}}};
    const selected = await post(jobsPath,selectedBody,{cookie:alice,'idempotency-key':'selected-format'}); assert.equal(selected.status,201); const selectedJob=(await selected.json()).job;
    const selectedRow=await db.prepare('SELECT export_format_json FROM jobs WHERE id=?').bind(selectedJob.id).first();assert.equal(JSON.parse(selectedRow.export_format_json).page.orientation,'landscape');
    assert.equal((await post(jobsPath,{...selectedBody,payload:{...selectedBody.payload,exportFormat:{page:{paper_size:'letter'}}}},{cookie:alice,'idempotency-key':'selected-format'})).status,409);
    assert.equal((await post(`${jobsPath}/${selectedJob.id}/cancel`,{}, {cookie:alice})).status,200);
    assert.equal((await create(0, 'stale')).status, 409);
    const saveFormat = (version, paper) => req('/api/export-format',{method:'PUT',headers:{cookie:alice,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({version,format:{page:{paper_size:paper}}})});
    assert.equal((await saveFormat(0,'letter')).status,200);
    const created = await create(plan.version, 'export-1'); assert.equal(created.status, 201, await created.clone().text()); const job = (await created.json()).job;
    assert.equal((await saveFormat(1,'a3')).status,200);assert.equal((await create(plan.version, 'export-1')).status,200);
    const claimed = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.export-word'] }, agent(runner))).json(); assert.equal(claimed.job.id, job.id);
    assert.equal((await req(`${jobsPath}/${job.id}/artifact`, { method: 'DELETE', headers: { cookie: alice, origin: 'http://localhost' } })).status, 409);
    const contextPath = `/api/runner/jobs/${job.id}/plan-context`;
    assert.equal((await post(contextPath, { lease: claimed.lease }, agent(other))).status, 409);
    const context = await post(contextPath, { lease: claimed.lease }, agent(runner)); assert.equal(context.status, 200); const contextData=await context.json(); assert.equal(contextData.outline[0].title, 'Metodología'); assert.equal(contextData.exportFormat.page.paper_size,'letter');
    const artifactPath = `/api/runner/jobs/${job.id}/artifact`;
    const bytes = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
    const upload = (token, lease, data = bytes) => req(artifactPath, { method: 'POST', headers: { ...agent(token), 'x-savia-lease': lease, 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, body: data });
    assert.equal((await upload(other, claimed.lease)).status, 409);
    const download = `${jobsPath}/${job.id}/artifact`;
    assert.equal((await req(download, { headers: { cookie: alice } })).status, 404);
    const [first, duplicate] = await Promise.all([upload(runner, claimed.lease), upload(runner, claimed.lease)]);
    assert.equal(first.status, 200, await first.clone().text()); assert.equal(duplicate.status, 200, await duplicate.clone().text());
    const artifact = (await first.json()).artifact; assert.equal((await duplicate.json()).artifact.id, artifact.id);
    assert.equal((await upload(runner, claimed.lease, new Uint8Array([1, 2]))).status, 409);
    assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, { lease: claimed.lease, status: 'succeeded', result: { artifactId: 'wrong' } }, agent(runner))).status, 400);
    const complete = { lease: claimed.lease, status: 'succeeded', result: { artifactId: artifact.id, warnings: [] } };
    assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, complete, agent(runner))).status, 200);
    assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, complete, agent(runner))).status, 200);
    assert.equal((await req(download, { headers: { cookie: bob } })).status, 404);
    const result = await req(download, { headers: { cookie: alice } }); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);

    const saveWord=(cookie,tag,data,origin='http://localhost')=>req(download,{method:'PUT',headers:{cookie,origin,'if-match':tag,'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},body:data});
    const editedBytes=new Uint8Array([80,75,3,4,9,8,7]);
    assert.equal(result.headers.get('etag'),'"0"');
    assert.equal((await saveWord(bob,'"0"',editedBytes)).status,404);
    assert.equal((await saveWord(alice,'"0"',editedBytes,'https://other.example')).status,403);
    assert.equal((await saveWord(alice,'"0"',new Uint8Array([1,2]))).status,400);
    const savedWord=await saveWord(alice,'"0"',editedBytes);assert.equal(savedWord.status,200,await savedWord.clone().text());
    assert.equal(savedWord.headers.get('etag'),'"1"');
    assert.equal((await saveWord(alice,'"0"',bytes)).status,409);
    const reopened=await req(download,{headers:{cookie:alice}});
    assert.deepEqual(new Uint8Array(await reopened.arrayBuffer()),editedBytes);
    assert.equal(reopened.headers.get('etag'),'"1"');
    // Recovery is a separate, owner-only copy and must never change the saved Word.
    const recovery=`${download}/recovery`;
    const recoveryBytes=new Uint8Array([80,75,3,4,6,6,6]);
    const saveRecovery=(cookie,base,version,data=recoveryBytes)=>req(recovery,{method:'PUT',headers:{cookie,origin:'http://localhost','if-match':base,'x-recovery-version':version,'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},body:data});
    assert.equal((await req(recovery,{headers:{cookie:alice}})).status,404);
    assert.equal((await saveRecovery(bob,'"1"','0')).status,404);
    assert.equal((await req(recovery,{method:'PUT',headers:{cookie:alice,origin:'https://other.example','if-match':'"1"','x-recovery-version':'0'},body:recoveryBytes})).status,403);
    assert.equal((await saveRecovery(alice,'"1"','0',new Uint8Array([1,2]))).status,400);
    const recoverySaved=await saveRecovery(alice,'"1"','0');assert.equal(recoverySaved.status,200,await recoverySaved.clone().text());
    const oldRecoveryTag=recoverySaved.headers.get('etag');
    assert.equal((await saveRecovery(alice,'"1"','0')).status,409);
    const recovered=await req(recovery,{headers:{cookie:alice}});assert.equal(recovered.status,200);assert.equal(recovered.headers.get('x-base-revision'),'"1"');assert.deepEqual(new Uint8Array(await recovered.arrayBuffer()),recoveryBytes);
    assert.equal((await req(recovery,{headers:{cookie:bob}})).status,404);
    assert.deepEqual(new Uint8Array(await(await req(download,{headers:{cookie:alice}})).arrayBuffer()),editedBytes);
    assert.equal((await req(recovery,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost','if-match':oldRecoveryTag}})).status,204);
    assert.equal((await req(recovery,{headers:{cookie:alice}})).status,404);
    assert.equal((await saveRecovery(alice,'"0"','0')).status,409);
    const newRecovery=await saveRecovery(alice,'"1"','0');assert.equal(newRecovery.status,200);
    let newRecoveryVersion=newRecovery.headers.get('etag').replaceAll('"','');
    assert.equal((await req(recovery,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost','if-match':oldRecoveryTag}})).status,409);
    // A concurrent collector must not erase the old cleanup marker before the swap.
    let releaseSwap,signalSwap;const reachedSwap=new Promise(resolve=>{signalSwap=resolve;}),gate=new Promise(resolve=>{releaseSwap=resolve;});
    const delayedDb={prepare:sql=>db.prepare(sql),async batch(statements){signalSwap();await gate;return db.batch(statements);}};
    const recoveryOwner=(await db.prepare('SELECT owner_id FROM projects WHERE id=?').bind(project.id).first()).owner_id;
    const recoveryBucket=await worker.getR2Bucket('FILES');
    const recoveryEnv={DB:delayedDb,FILES:recoveryBucket,BETTER_AUTH_URL:'http://localhost'};
    const pendingSwap=wordRecovery(new Request(`http://localhost${recovery}`,{method:'PUT',headers:{origin:'http://localhost','if-match':'"1"','x-recovery-version':newRecoveryVersion},body:recoveryBytes}),recoveryEnv,recoveryOwner,project.id,job.id);
    await reachedSwap;await cleanupDesktopUploads({DB:db,FILES:recoveryBucket},recoveryOwner);releaseSwap();
    const swapped=await pendingSwap;assert.equal(swapped.status,200);newRecoveryVersion=swapped.headers.get('etag').replaceAll('"','');
    const competing=await Promise.all([saveRecovery(alice,'"1"',newRecoveryVersion,new Uint8Array([80,75,3,4,1])),saveRecovery(alice,'"1"',newRecoveryVersion,new Uint8Array([80,75,3,4,2]))]);
    assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
    newRecoveryVersion=competing.find(r=>r.status===200).headers.get('etag').replaceAll('"','');
    assert.equal((await req(recovery,{headers:{cookie:alice}})).headers.get('etag'),`"${newRecoveryVersion}"`);
    const afterSave=await (await req(jobsPath,{headers:{cookie:alice}})).json();
    assert.equal(afterSave.jobs.find(item=>item.id===job.id).wordRevision,1);
    const newerWord=new Uint8Array([80,75,3,4,4,5,6]);
    assert.equal((await saveWord(alice,'"1"',newerWord)).status,200);
    assert.equal((await req(recovery,{headers:{cookie:alice}})).headers.get('x-base-revision'),'"1"');
    assert.equal((await saveRecovery(alice,'"1"',newRecoveryVersion)).status,409);
    const remove = (cookie, origin = 'http://localhost') => req(download, { method: 'DELETE', headers: { cookie, origin } });
    assert.equal((await remove(bob)).status, 404);
    assert.equal((await remove(alice, 'https://other.example')).status, 403);
    assert.equal((await remove(alice)).status, 204);
    assert.equal((await remove(alice)).status, 204);
    assert.equal((await post(`/api/runner/jobs/${job.id}/complete`, complete, agent(runner))).status, 200);
    assert.equal((await req(download, { headers: { cookie: alice } })).status, 404);
    const listed = await (await req(jobsPath, { headers: { cookie: alice } })).json();
    assert.equal(listed.jobs.find(item => item.id === job.id).artifactState, 'deleted');
    assert.equal((await upload(runner, claimed.lease)).status, 409);
    const bucket = await worker.getR2Bucket('FILES'); assert.equal((await bucket.list()).objects.length, 0);
    // A draft preview exports the batch snapshot without applying it to the plan.
    const owner = await db.prepare('SELECT owner_id FROM projects WHERE id=?').bind(project.id).first();
    const batchId = 'preview-batch';
    await db.prepare("INSERT INTO jobs(id,project_id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at) VALUES(?,?,?,'technical-plan.generate-batch',?,?,'succeeded',?,?)").bind(batchId,project.id,owner.owner_id,batchId,JSON.stringify({planVersion:plan.version}),new Date().toISOString(),new Date().toISOString()).run();
    await db.prepare('INSERT INTO technical_batch_drafts(job_id,owner_id,project_id,node_id,content,created_at) VALUES(?,?,?,?,?,?)').bind(batchId,owner.owner_id,project.id,plan.outline[0].id,'Texto del borrador sin aplicar',new Date().toISOString()).run();
    const previewBody = id => ({kind:'technical-plan.export-word',payload:{planVersion:plan.version,language:'es',draftBatchId:id}});
    assert.equal((await post(jobsPath,previewBody('missing'),{cookie:alice,'idempotency-key':'missing-preview'})).status,409);
    assert.equal((await post(jobsPath,previewBody(batchId),{cookie:bob,'idempotency-key':'foreign-preview'})).status,404);
    const beforePreview = await (await req(planPath,{headers:{cookie:alice}})).json();
    const previewResponse = await post(jobsPath,previewBody(batchId),{cookie:alice,'idempotency-key':'batch-preview'});
    assert.equal(previewResponse.status,201,await previewResponse.clone().text());
    const previewJob = (await previewResponse.json()).job;
    const previewClaim = await (await post('/api/runner/jobs/claim',{kinds:['technical-plan.export-word']},agent(runner))).json();
    assert.equal(previewClaim.job.id,previewJob.id);
    const previewContext = () => post(`/api/runner/jobs/${previewJob.id}/plan-context`,{lease:previewClaim.lease},agent(runner));
    const previewSnapshot = await (await previewContext()).json();
    assert.equal(previewSnapshot.outline[0].content,'Texto del borrador sin aplicar');
    assert.deepEqual(await (await req(planPath,{headers:{cookie:alice}})).json(),beforePreview);
    await db.prepare('UPDATE technical_batch_drafts SET content=? WHERE job_id=?').bind('Borrador modificado',batchId).run();
    assert.equal((await previewContext()).status,409);
    assert.equal((await post(`${jobsPath}/${previewJob.id}/cancel`,{},{cookie:alice})).status,200);
    const second = (await (await create(plan.version, 'export-2')).json()).job;
    const secondClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.export-word'] }, agent(runner))).json();
    const secondPath = `/api/runner/jobs/${second.id}/artifact`;
    assert.equal((await req(secondPath, { method: 'POST', headers: { ...agent(runner), 'x-savia-lease': secondClaim.lease }, body: bytes })).status, 200);
    const activeRemove = await req(`${jobsPath}/${second.id}/artifact`, { method: 'DELETE', headers: { cookie: alice, origin: 'http://localhost' } }); assert.equal(activeRemove.status, 409);

    const changed = await req(`${planPath}/nodes/${plan.outline[0].id}/content`, { method: 'PUT', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Cambio', version: plan.version }) }); assert.equal(changed.status, 200);
    assert.equal((await post(`/api/runner/jobs/${second.id}/plan-context`, { lease: secondClaim.lease }, agent(runner))).status, 409);
    assert.equal((await post(`${jobsPath}/${second.id}/cancel`, {}, { cookie: alice })).status, 200);
    const cancelledUpload = await req(`/api/runner/jobs/${second.id}/artifact`, { method: 'POST', headers: { ...agent(runner), 'x-savia-lease': secondClaim.lease }, body: bytes }); assert.equal(cancelledUpload.status, 409);
    assert.equal((await req(`${jobsPath}/${second.id}/artifact`, { method: 'DELETE', headers: { cookie: alice, origin: 'http://localhost' } })).status, 204);
    assert.equal((await bucket.list()).objects.length, 0);
    const current = await (await req(planPath, { headers: { cookie: alice } })).json();
    const third = (await (await create(current.version, 'export-3')).json()).job;
    const originalFetch = globalThis.fetch;
    let attempts = 0;
    try {
      globalThis.fetch = async (url, options) => {
        if (String(url).endsWith('/artifact') && ++attempts === 1) { await worker.dispatchFetch(url, options); throw new Error('confirmación perdida'); }
        return worker.dispatchFetch(url, options);
      };
      const handler = createWordExportHandler({ convert: async snapshot => { assert.equal(snapshot.outline[0].content, 'Cambio'); return { bytes, warnings: [] }; } });
      const outcome = await runOnce({ server: 'http://localhost', token: runner.token, handlers: { 'technical-plan.export-word': handler }, retryDelayMs: 1 });
      assert.equal(outcome.state, 'succeeded'); assert.equal(outcome.jobId, third.id); assert.equal(attempts, 2);
    } finally { globalThis.fetch = originalFetch; }
    const delivered = await req(`${jobsPath}/${third.id}/artifact`, { headers: { cookie: alice } });
    assert.equal(delivered.status, 200); assert.deepEqual(new Uint8Array(await delivered.arrayBuffer()), bytes);
    if (process.env.SAVIA_TEST_OPENXML === '1') {
      const fourth = (await (await create(current.version, 'export-real')).json()).job;
      try {
        globalThis.fetch = (url, options) => worker.dispatchFetch(url, options);
        const outcome = await runOnce({ server: 'http://localhost', token: runner.token, handlers: { 'technical-plan.export-word': createWordExportHandler() }, retryDelayMs: 1 });
        assert.equal(outcome.state, 'succeeded'); assert.equal(outcome.jobId, fourth.id);
      } finally { globalThis.fetch = originalFetch; }
      const downloaded = await req(`${jobsPath}/${fourth.id}/artifact`, { headers: { cookie: alice } });
      assert.equal(downloaded.status, 200);
      const require = createRequire(new URL('../../client/package.json', import.meta.url));
      const Zip = require('adm-zip');
      const xml = new Zip(Buffer.from(await downloaded.arrayBuffer())).readAsText('word/document.xml');
      assert.match(xml, /Metodología/); assert.match(xml, /Cambio/);
    }
    const fifth = (await (await create(current.version, 'export-db-failure')).json()).job;
    const fifthClaim = await (await post('/api/runner/jobs/claim', { kinds: ['technical-plan.export-word'] }, agent(runner))).json();
    assert.equal(fifthClaim.job.id, fifth.id);
    const beforeFailure = (await bucket.list()).objects.length;
    await db.prepare("CREATE TRIGGER reject_artifact BEFORE INSERT ON job_artifacts BEGIN SELECT RAISE(ABORT, 'simulated_failure'); END").run();
    try {
      const failed = await req(`/api/runner/jobs/${fifth.id}/artifact`, { method: 'POST', headers: { ...agent(runner), 'x-savia-lease': fifthClaim.lease }, body: bytes });
      assert.equal(failed.status, 500);
      assert.equal((await bucket.list()).objects.length, beforeFailure);
    } finally { await db.prepare('DROP TRIGGER reject_artifact').run(); }



  } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
