import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
process.env.SAVIA_HEADLESS_RUNNER='1';
const { runOnce } = await import(process.env.SAVIA_TEST_WORK_LOOP || new URL('../../runner/work-loop.mjs',import.meta.url));
const { createTechnicalPlanHandler } = await import(process.env.SAVIA_TEST_TECHNICAL_PLAN_MODULE || new URL('../../runner/technical-plan.mjs',import.meta.url));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('planifica hojas en el orden real del árbol, no por nivel', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-plan-pi-')); let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
    worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'plan-pi-test' }, r2Buckets: ['FILES'], bindings: { AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', CREDENTIAL_KEY_HEX: '11'.repeat(32), CREDENTIAL_KEY_ID: 'test' } }));
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    async function signup(name) { const r = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
    const alice = await signup('alice'), bob = await signup('bob');
    const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project;
    const planPath = `/api/projects/${project.id}/technical-plan`, jobsPath = `/api/projects/${project.id}/jobs`;
    const plan = await (await post(`${planPath}/nodes`, { title: 'Metodología', version: 0 }, { cookie: alice })).json(); const nodeId = plan.outline[0].id;
    const upload = await req(`/api/projects/${project.id}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': 'pliego.txt', 'content-type': 'text/plain' }, body: 'El contrato exige informes mensuales.' }); const file = (await upload.json()).file;
    const credential = (await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'fixture', secret: 'fixture-secret' }, { cookie: alice })).json()).credential;
    const pairing = await (await post('/api/runner-pairings', {}, { cookie: alice })).json(); const runner = await (await post('/api/runners/pair', { code: pairing.code, name: 'Equipo' })).json();
    const otherPair = await (await post('/api/runner-pairings', {}, { cookie: bob })).json(); const other = await (await post('/api/runners/pair', { code: otherPair.code, name: 'Otro' })).json();
    const agent = value => ({ authorization: `Bearer ${value.token}` });
    const rootB=await(await post(`${planPath}/nodes`,{title:'Segundo',version:plan.version},{cookie:alice})).json(),nestedA=await(await post(`${planPath}/nodes`,{title:'Hijo A',parentId:nodeId,version:rootB.version},{cookie:alice})).json(),nestedB=await(await post(`${planPath}/nodes`,{title:'Hijo B',parentId:nodeId,version:nestedA.version},{cookie:alice})).json();
    const payload={mode:'all',planning:true,planningOptions:{sectionWords:1000,maxTables:1},planVersion:nestedB.version,fileIds:[file.id],language:'es',dataProcessingConsent:true},created=await post(jobsPath,{kind:'technical-plan.generate-batch',credentialId:credential.id,payload},{cookie:alice,'idempotency-key':'outline-order'});assert.equal(created.status,201);const job=(await created.json()).job;assert.deepEqual(job.payload.targets,[nestedB.outline[0].children[0].id,nestedB.outline[0].children[1].id,nestedB.outline[1].id]);
    // A failed batch using the runner's own model can resume with its drafts.
    const owner=(await db.prepare('SELECT owner_id FROM jobs WHERE id=?').bind(job.id).first()).owner_id;
    await db.prepare("UPDATE jobs SET state='failed',credential_id=NULL,payload_json=json_set(payload_json,'$.localRunner',json('true')) WHERE id=?").bind(job.id).run();
    await db.prepare('INSERT INTO technical_batch_drafts(job_id,owner_id,project_id,node_id,content,created_at) VALUES(?,?,?,?,?,?)').bind(job.id,owner,project.id,job.payload.targets[0],`Texto ${job.payload.targets[0]}`,new Date().toISOString()).run();
    const resumed=await post(`/api/projects/${project.id}/technical-batches/${job.id}/resume`,{},{cookie:alice});assert.equal(resumed.status,200);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM technical_batch_drafts WHERE job_id=?').bind(job.id).first()).count,1);
    const activeDelete=await req(`/api/projects/${project.id}/technical-batches/${job.id}/delete`,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}});assert.equal(activeDelete.status,409);
    const locked=await post(`${planPath}/nodes/${nestedB.outline[0].children[0].id}/move`,{version:nestedB.version,direction:'down'},{cookie:alice});assert.equal(locked.status,409);
    await db.prepare("UPDATE jobs SET state='succeeded' WHERE id=?").bind(job.id).run();
    for(const id of job.payload.targets.slice(1))await db.prepare('INSERT INTO technical_batch_drafts(job_id,owner_id,project_id,node_id,content,created_at) VALUES(?,?,?,?,?,?)').bind(job.id,owner,project.id,id,`Texto ${id}`,new Date().toISOString()).run();
    const movedResponse=await post(`${planPath}/nodes/${nestedB.outline[0].children[0].id}/move`,{version:nestedB.version,direction:'down'},{cookie:alice});assert.equal(movedResponse.status,200);const moved=await movedResponse.json();
    const stored=await db.prepare('SELECT payload_json FROM jobs WHERE id=?').bind(job.id).first();assert.equal(JSON.parse(stored.payload_json).planVersion,moved.version);
    const drafts=await (await req(`/api/projects/${project.id}/technical-batches/${job.id}/drafts`,{headers:{cookie:alice}})).json();assert.equal(drafts.drafts.length,3);assert.ok(drafts.drafts.every(d=>d.content===`Texto ${d.nodeId}`));
    const applied=await post(`/api/projects/${project.id}/technical-batches/${job.id}/apply`,{version:moved.version},{cookie:alice});assert.equal(applied.status,200);
    const updated=await (await req(planPath,{headers:{cookie:alice}})).json();assert.equal(updated.outline[0].children[0].id,nestedB.outline[0].children[1].id);assert.equal(updated.outline[0].children[0].content,`Texto ${nestedB.outline[0].children[1].id}`);
    const doomed=crypto.randomUUID();await db.prepare("INSERT INTO jobs(id,project_id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at) SELECT ?,project_id,owner_id,kind,?,payload_json,'failed',created_at,updated_at FROM jobs WHERE id=?").bind(doomed,crypto.randomUUID(),job.id).run();
    await db.prepare('INSERT INTO technical_batch_drafts(job_id,owner_id,project_id,node_id,content,created_at) VALUES(?,?,?,?,?,?)').bind(doomed,owner,project.id,job.payload.targets[0],'Borrador de prueba',new Date().toISOString()).run();
    const otherDelete=await req(`/api/projects/${project.id}/technical-batches/${doomed}/delete`,{method:'DELETE',headers:{cookie:bob,origin:'http://localhost'}});assert.equal(otherDelete.status,404);
    const deleted=await req(`/api/projects/${project.id}/technical-batches/${doomed}/delete`,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}});assert.equal(deleted.status,204);assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM technical_batch_drafts WHERE job_id=?').bind(doomed).first()).count,0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM technical_batch_drafts WHERE job_id=?').bind(job.id).first()).count,3);


  } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
