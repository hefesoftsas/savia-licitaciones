import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {runOnce} from '../../runner/work-loop.mjs';
process.env.SAVIA_HEADLESS_RUNNER='1';
const {createDuplicateJobHandler}=await import(process.env.SAVIA_TEST_DUPLICATE_MODULE||new URL('../../runner/duplicate-check.mjs',import.meta.url));
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('ejecuta una revisión de duplicados mediante concesión y conserva el informe privado',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-duplicate-job-'));let worker;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'duplicate-jobs'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),post=(path,body,headers={})=>req(path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...headers},body:JSON.stringify(body)});
  async function signup(name){return (await post('/api/auth/sign-up/email',{name,email:`${name}@example.com`,password:'password-123456'})).headers.get('set-cookie').split(';')[0];}
  const alice=await signup('alice'),bob=await signup('bob'),pair=await (await post('/api/runner-pairings',{}, {cookie:alice})).json(),runner=await (await post('/api/runners/pair',{code:pair.code,name:'Equipo'})).json();
  const project=(await (await post('/api/projects',{title:'Proyecto'},{cookie:alice})).json()).project;
  const sentence='La empresa cuenta con un equipo profesional especializado en contratación pública.';
  async function upload(name){return (await (await req(`/api/projects/${project.id}/files`,{method:'POST',headers:{cookie:alice,origin:'http://localhost','x-file-name':encodeURIComponent(name),'content-type':'text/markdown'},body:`# Plan técnico\n\n${sentence}`})).json()).file;}
  const a=await upload('A.md'),b=await upload('B.md'),jobs=`/api/projects/${project.id}/jobs`,payload={fileIds:[a.id,b.id],tenderFileIds:[],bidFileIds:[a.id,b.id],language:'es'};
  assert.equal((await post(jobs,{kind:'duplicate-check.analyze',payload:{...payload,bidFileIds:[]}},{cookie:alice,'idempotency-key':'bad'})).status,400);
  assert.equal((await post(jobs,{kind:'duplicate-check.analyze',payload},{cookie:bob,'idempotency-key':'other'})).status,404);
  const created=await post(jobs,{kind:'duplicate-check.analyze',payload},{cookie:alice,'idempotency-key':'duplicate-1'});assert.equal(created.status,201);const job=(await created.json()).job;
  const run=await runOnce({server:(await worker.ready).origin,token:runner.token,handlers:{'duplicate-check.analyze':createDuplicateJobHandler({temporaryRoot:dir})}});assert.equal(run.state,'succeeded');
  const result=(await (await req(jobs,{headers:{cookie:alice}})).json()).jobs.find(item=>item.id===job.id);assert.equal(result.state,'succeeded');assert.equal(result.result.analysisStatus,'success');assert.equal(result.artifactState,'stored');
  const artifact=`${jobs}/${job.id}/artifact`;assert.equal((await req(artifact,{headers:{cookie:bob}})).status,404);const response=await req(artifact,{headers:{cookie:alice}});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/json/);const report=await response.json();assert.ok(report.contentAnalysis.duplicateSentences.some(item=>item.sentence.includes('equipo profesional')));
  const cliJob=(await (await post(jobs,{kind:'duplicate-check.analyze',payload},{cookie:alice,'idempotency-key':'cli'})).json()).job,config=join(dir,'runner.json');
  await writeFile(config,JSON.stringify({server:(await worker.ready).origin,runnerId:runner.runner.id,token:runner.token}));
  const cli=process.env.SAVIA_TEST_RUNNER_CLI||resolve(root,'../runner/cli.mjs');const cliResult=await promisify(execFile)(process.execPath,[cli,'run-once','--config',config]);assert.match(cliResult.stdout,/succeeded/);
  const cliStored=(await (await req(jobs,{headers:{cookie:alice}})).json()).jobs.find(item=>item.id===cliJob.id);assert.equal(cliStored.state,'succeeded');assert.equal(cliStored.artifactState,'stored');
  const pending=(await (await post(jobs,{kind:'duplicate-check.analyze',payload},{cookie:alice,'idempotency-key':'cancel'})).json()).job,auth={authorization:`Bearer ${runner.token}`};
  const claim=await (await post('/api/runner/jobs/claim',{kinds:['duplicate-check.analyze']},auth)).json();assert.equal(claim.job.id,pending.id);
  assert.equal((await post(`/api/runner/jobs/${pending.id}/complete`,{lease:claim.lease,status:'succeeded',result:{artifactId:'missing'}},auth)).status,400);
  const sendArtifact=body=>req(`/api/runner/jobs/${pending.id}/artifact`,{method:'POST',headers:{...auth,'x-savia-lease':claim.lease,'content-type':'application/json'},body});
  const uploads=await Promise.all([sendArtifact('{"revisión":1}'),sendArtifact('{"revisión":1}')]);assert.deepEqual(uploads.map(item=>item.status),[200,200]);const receipt=await Promise.all(uploads.map(item=>item.json()));assert.equal(receipt[0].artifact.id,receipt[1].artifact.id);assert.equal((await sendArtifact('{"revisión":2}')).status,409);
  assert.equal((await post(`${jobs}/${pending.id}/cancel`,{},{cookie:alice})).status,200);
  assert.equal((await req(`/api/runner/jobs/${pending.id}/artifact`,{method:'POST',headers:{...auth,'x-savia-lease':claim.lease,'content-type':'application/json'},body:'{}'})).status,409);
  assert.equal((await req(artifact,{method:'DELETE',headers:{cookie:bob,origin:'http://localhost'}})).status,404);
  assert.equal((await req(artifact,{method:'DELETE',headers:{cookie:alice,origin:'https://other.example'}})).status,403);
  assert.equal((await req(artifact,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}})).status,204);
  assert.equal((await req(artifact,{headers:{cookie:alice}})).status,404);
  assert.equal((await req(artifact,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}})).status,204);
  const deleted=(await (await req(jobs,{headers:{cookie:alice}})).json()).jobs.find(item=>item.id===job.id);assert.equal(deleted.artifactState,'deleted');
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
