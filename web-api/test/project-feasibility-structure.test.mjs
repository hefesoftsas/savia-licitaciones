import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {projectFeasibilityStructure,runnerProjectFeasibilityStructure} from '../src/project-feasibility-structure.js';import {digest} from '../src/runners.js';
import {userFeasibilityOutlines,runnerFeasibilityOutlineContext} from '../src/feasibility-outline.js';
import {userFeasibilityParameters,runnerFeasibilityParametersContext} from '../src/feasibility-parameters.js';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
for(const type of ['outline','parameters'])test(`aísla ${type} por proyecto y comprueba contexto, permisos y versión`,async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:`project-structure-${type}`}}));
 try{const DB=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  for(const user of ['alice','bob'])await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind(user,user,`${user}@example.test`).run();
  await DB.prepare("INSERT INTO runners(id,owner_id,name,token_hash,created_at) VALUES('runner','alice','Mac','hash','2026')").run();
  for(const [id,owner] of [['a','alice'],['b','alice'],['c','bob']]){await DB.prepare('INSERT INTO projects (id,owner_id,title,created_at) VALUES (?,?,?,?)').bind(id,owner,`Proyecto ${id}`,'2026').run();const state={projectInfo:{projectName:`Proyecto ${id}`},analysisMarkdown:`Análisis ${id}`,outlineTemplate:'government',targetWords:30000,referenceDocumentIds:[],outlineData:{outline:[{id:'chapter',title:'Título',description:'',content:'Anterior'}]},keyParametersMarkdown:'previo',importedTasks:[]};await DB.prepare('INSERT INTO project_feasibility_reports VALUES(?,?,?,1,?)').bind(id,owner,JSON.stringify(state),'2026').run();}
  const env={DB,BETTER_AUTH_URL:'https://savia.test'},body={version:1,language:'es',credentialId:'local-runner',dataProcessingConsent:true};
  const call=(project,method='GET',jobId,action,input=body,key=`key-${project}`)=>projectFeasibilityStructure(new Request('https://savia.test/',{method,headers:{origin:'https://savia.test','content-type':'application/json','idempotency-key':key},...(method==='POST'?{body:JSON.stringify(input)}:{})}),env,'alice',project,jobId,action,type);
  assert.equal((await call('c')).status,404);const qa=await call('a','POST');assert.equal(qa.status,201,await qa.clone().text());const ja=(await qa.json()).job;const qb=await call('b','POST');assert.equal(qb.status,201,await qb.clone().text());const jb=(await qb.json()).job;
  assert.equal((await call('b','POST',undefined,undefined,body,'key-a')).status,409);
  assert.deepEqual((await(await call('a')).json()).jobs.map(job=>job.id),[ja.id]);assert.deepEqual((await(await call('b')).json()).jobs.map(job=>job.id),[jb.id]);
  assert.equal((await call('b','POST',ja.id,'cancel',{})).status,404);assert.equal((await call('b','POST',ja.id,'apply',{version:1})).status,404);
  const legacy=type==='outline'?userFeasibilityOutlines:userFeasibilityParameters;
  const legacyCall=(method,jobId,action,input=body,key='legacy')=>legacy(new Request('https://savia.test/',{method,headers:{origin:'https://savia.test','content-type':'application/json','idempotency-key':key},...(method==='POST'?{body:JSON.stringify(input)}:{})}),env,'alice',jobId,action);
  assert.deepEqual((await(await legacyCall('GET')).json()).jobs,[]);
  assert.equal((await legacyCall('POST',ja.id,'cancel',{})).status,404);
  assert.equal((await legacyCall('POST',ja.id,'apply',{version:1})).status,404);
  assert.equal((await legacyCall('POST',undefined,undefined,body,'key-a')).status,409);
  const lease='a'.repeat(64),runner={id:'runner',ownerId:'alice'};await DB.prepare("UPDATE account_jobs SET state='running',runner_id='runner',lease_hash=?,lease_expires_at=? WHERE id=?").bind(await digest(lease),Date.now()+60000,ja.id).run();
  const legacyRunner=type==='outline'?runnerFeasibilityOutlineContext:runnerFeasibilityParametersContext;assert.equal((await legacyRunner(new Request('https://savia.test/',{method:'POST',body:JSON.stringify({lease})}),env,runner,ja.id)).status,409);
  const context=await runnerProjectFeasibilityStructure(new Request('https://savia.test/',{method:'POST',body:JSON.stringify({lease})}),env,runner,ja.id,type);assert.equal(context.status,200,await context.clone().text());assert.equal((await context.json()).projectInfo.projectName,'Proyecto a');
  const result=type==='outline'?{outline:[{id:'x',title:'Nuevo',description:'',content:''}]}:{content:'Parámetros nuevos'};await DB.prepare("UPDATE account_jobs SET state='succeeded',result_json=? WHERE id=?").bind(JSON.stringify(result),ja.id).run();
  const applied=await call('a','POST',ja.id,'apply',{version:1});assert.equal(applied.status,200,await applied.clone().text());const a=await DB.prepare('SELECT * FROM project_feasibility_reports WHERE project_id=?').bind('a').first(),b=await DB.prepare('SELECT * FROM project_feasibility_reports WHERE project_id=?').bind('b').first();assert.equal(a.version,2);assert.equal(b.version,1);assert.equal(JSON.parse(b.state_json).projectInfo.projectName,'Proyecto b');if(type==='outline')assert.equal(JSON.parse(a.state_json).outlineData.outline[0].title,'Nuevo');else assert.equal(JSON.parse(a.state_json).keyParametersMarkdown,'Parámetros nuevos');
  assert.equal((await call('a','POST',ja.id,'apply',{version:1})).status,200);
  await DB.prepare("UPDATE account_jobs SET state='running',runner_id='runner',lease_hash=?,lease_expires_at=? WHERE id=?").bind(await digest(lease),Date.now()+60000,jb.id).run();await DB.prepare("UPDATE project_feasibility_reports SET version=2 WHERE project_id='b'").run();const stale=await runnerProjectFeasibilityStructure(new Request('https://savia.test/',{method:'POST',body:JSON.stringify({lease})}),env,runner,jb.id,type);assert.equal(stale.status,409);
 }finally{await worker.dispose();}
});
