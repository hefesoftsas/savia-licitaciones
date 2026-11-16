import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {runOnce} from '../../runner/work-loop.mjs';
process.env.SAVIA_HEADLESS_RUNNER='1';
const {createRejectionJobHandler}=await import(process.env.SAVIA_TEST_REJECTION_MODULE||new URL('../../runner/rejection-check.mjs',import.meta.url));
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('extrae criterios revisables y ejecuta la revisión con consentimiento y concesión',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-rejection-jobs-'));let worker;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'rejection-jobs'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost',CREDENTIAL_KEY_HEX:'11'.repeat(32),CREDENTIAL_KEY_ID:'test'}}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),post=(path,body,headers={})=>req(path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...headers},body:JSON.stringify(body)});
  async function signup(name){return (await post('/api/auth/sign-up/email',{name,email:`${name}@example.com`,password:'password-123456'})).headers.get('set-cookie').split(';')[0];}
  const alice=await signup('alice'),bob=await signup('bob'),pair=await (await post('/api/runner-pairings',{}, {cookie:alice})).json(),runner=await (await post('/api/runners/pair',{code:pair.code,name:'Equipo'})).json();
  const credential=(await (await post('/api/provider-credentials',{provider:'opencode-go',model:'modelo',secret:'fixture-secret'},{cookie:alice})).json()).credential,project=(await (await post('/api/projects',{title:'Proyecto'},{cookie:alice})).json()).project;
  async function upload(name,text){return (await (await req(`/api/projects/${project.id}/files`,{method:'POST',headers:{cookie:alice,origin:'http://localhost','x-file-name':name,'content-type':'text/plain'},body:text})).json()).file;}
  const tender=await upload('pliego.txt','Se exige acreditar experiencia.'),bid=await upload('oferta.txt','La oferta acredita experiensia.'),jobs=`/api/projects/${project.id}/jobs`;
  const extraction={kind:'rejection-check.extract',credentialId:credential.id,payload:{fileIds:[tender.id],language:'es',dataProcessingConsent:true}};
  assert.equal((await post(jobs,{...extraction,payload:{...extraction.payload,dataProcessingConsent:false}},{cookie:alice,'idempotency-key':'no'})).status,400);
  assert.equal((await post(jobs,extraction,{cookie:bob,'idempotency-key':'other'})).status,404);
  const extractionJob=(await (await post(jobs,extraction,{cookie:alice,'idempotency-key':'extract'})).json()).job;
  const handler=createRejectionJobHandler({temporaryRoot:dir,createAiService:()=>({}),createRuntime:()=>({close:async()=>{},runTask:async task=>{const output=task.output_file==='response.json'?JSON.stringify({findings:[{bidDocumentId:bid.id,wrongText:'experiensia',correctText:'experiencia',reason:'Error'}]}):'Acreditar experiencia.';return {validation_result:task.validateOutput({output_content:output}).value};}})}),server=(await worker.ready).origin;
  assert.equal((await runOnce({server,token:runner.token,handlers:{'rejection-check.extract':handler}})).state,'succeeded');
  const extracted=(await (await req(jobs,{headers:{cookie:alice}})).json()).jobs.find(item=>item.id===extractionJob.id);assert.equal(extracted.result.criteria,'Acreditar experiencia.');
  const payload={fileIds:[tender.id,bid.id],tenderFileIds:[tender.id],bidFileIds:[bid.id],language:'es',dataProcessingConsent:true,criteria:'Criterio revisado',customCheckItems:'',options:{rejectionCheck:false,typoCheck:true,logicCheck:false}};
  assert.equal((await post(jobs,{kind:'rejection-check.analyze',credentialId:credential.id,payload:{...payload,options:{rejectionCheck:false,typoCheck:false,logicCheck:false}}},{cookie:alice,'idempotency-key':'invalid'})).status,400);
  assert.equal((await post(jobs,{kind:'rejection-check.analyze',credentialId:credential.id,payload:{...payload,criteria:'',options:{rejectionCheck:true,typoCheck:false,logicCheck:false}}},{cookie:alice,'idempotency-key':'no-reviewed-criteria'})).status,400);
  const job=(await (await post(jobs,{kind:'rejection-check.analyze',credentialId:credential.id,payload},{cookie:alice,'idempotency-key':'analyze'})).json()).job;
  assert.equal((await runOnce({server,token:runner.token,handlers:{'rejection-check.analyze':handler}})).state,'succeeded');
  const complete=(await (await req(jobs,{headers:{cookie:alice}})).json()).jobs.find(item=>item.id===job.id);assert.equal(complete.artifactState,'stored');assert.equal(complete.result.analysisStatus,'success');assert.equal(JSON.stringify(complete).includes('fixture-secret'),false);
  const path=`${jobs}/${job.id}/artifact`;assert.equal((await req(path,{headers:{cookie:bob}})).status,404);const result=await (await req(path,{headers:{cookie:alice}})).json();assert.equal(result.typoCheckResult.findings[0].wrongText,'experiensia');assert.equal(result.criteria.content,'Criterio revisado');
  const finding=result.typoCheckResult.findings[0].id,removeFinding=`${jobs}/${job.id}/rejection-findings/remove`,mutation={section:'typo',findingId:finding};
  assert.equal((await post(removeFinding,mutation,{cookie:bob})).status,404);assert.equal((await post(removeFinding,mutation,{cookie:alice,origin:'https://other.example'})).status,403);assert.equal((await post(removeFinding,{...mutation,section:'logic'},{cookie:alice})).status,404);
  const removals=await Promise.all([post(removeFinding,mutation,{cookie:alice}),post(removeFinding,mutation,{cookie:alice})]);assert.deepEqual(removals.map(item=>item.status),[200,200]);
  const reviewed=await (await req(path,{headers:{cookie:alice}})).json();assert.deepEqual(reviewed.typoCheckResult.findings,[]);assert.equal(reviewed.typoCheckResult.removedCount,1);
  const queued=(await (await post(jobs,{kind:'rejection-check.analyze',credentialId:credential.id,payload},{cookie:alice,'idempotency-key':'cancel'})).json()).job,auth={authorization:`Bearer ${runner.token}`},claimed=await (await post('/api/runner/jobs/claim',{kinds:['rejection-check.analyze']},auth)).json();assert.equal(claimed.job.id,queued.id);
  assert.equal((await post(`${jobs}/${queued.id}/cancel`,{},{cookie:alice})).status,200);assert.equal((await req(`/api/runner/jobs/${queued.id}/artifact`,{method:'POST',headers:{...auth,'x-savia-lease':claimed.lease},body:'{}'})).status,409);assert.equal((await post(`/api/runner/jobs/${queued.id}/credential`,{lease:claimed.lease},auth)).status,409);
  assert.equal((await req(path,{method:'DELETE',headers:{cookie:bob,origin:'http://localhost'}})).status,404);assert.equal((await req(path,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}})).status,204);assert.equal((await req(path,{headers:{cookie:alice}})).status,404);assert.equal((await req(path,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}})).status,204);assert.equal((await post(removeFinding,mutation,{cookie:alice})).status,404);
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
