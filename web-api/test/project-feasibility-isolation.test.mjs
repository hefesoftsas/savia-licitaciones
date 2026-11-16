import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('aísla informes de proyectos con la misma versión y conserva el informe anterior de la cuenta',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-project-feasibility-'));let worker;
 try {
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'feasibility-project-isolation'},r2Buckets:['FILES'],bindings:{BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost',AUTH_ALLOW_REGISTRATION:'true',CREDENTIAL_KEY_HEX:'11'.repeat(32),CREDENTIAL_KEY_ID:'test'}}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options);
  const write=(path,method,body,cookie,origin='http://localhost')=>req(path,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  async function signup(name){const response=await write('/api/auth/sign-up/email','POST',{name,email:`${name}@example.com`,password:'password-123456'});assert.equal(response.status,200,await response.clone().text());return response.headers.get('set-cookie').split(';')[0];}
  const alice=await signup('alice'),bob=await signup('bob');
  async function project(name,cookie){const response=await write('/api/projects','POST',{title:name},cookie);assert.equal(response.status,201,await response.clone().text());return (await response.json()).project.id;}
  const a=await project('Proyecto A',alice),b=await project('Proyecto B',alice),foreign=await project('Proyecto privado',bob);
  const prefillOwner=(await db.prepare('SELECT owner_id FROM projects WHERE id=?').bind(a).first()).owner_id;
  await db.prepare('INSERT INTO project_secop(project_id,owner_id,source,external_id,process_json) VALUES(?,?,?,?,?)').bind(a,prefillOwner,'secop-ii','test-a',JSON.stringify({title:'Objeto',entity:'Entidad',city:'Tocancipá',department:'Cundinamarca',value:40000000})).run();
  const path=id=>`/api/projects/${id}/feasibility-report`;
  const initial=await (await req(path(a),{headers:{cookie:alice}})).json();assert.equal(initial.report,null);assert.deepEqual(initial.projectDefaults,{projectName:'Proyecto A',location:'Tocancipá, Cundinamarca',constructionContent:'Objeto',contractingEntity:'Entidad'});
  assert.equal((await req(path(a),{headers:{cookie:bob}})).status,404);
  const report=name=>({step:'content',projectInfo:{projectName:name,projectType:'enterprise',industry:'Servicios',constructionUnit:'Unidad',location:'Bogotá',constructionContent:'Alcance',constructionPeriodYears:'2',operationPeriodYears:'20',totalInvestment:'100',fundingSource:'Propios'},sourceFiles:[],analysisMarkdown:`Análisis ${name}`,outlineTemplate:'enterprise',targetWords:30000,referenceDocumentIds:[],keyParametersMarkdown:'Parámetros',outlineData:{project_name:name,project_overview:'Contexto',outline:[{id:'n1',title:'Capítulo',description:'',content:`Contenido ${name}`,children:[]}]}});
  const legacy='/api/feasibility-report';assert.equal((await write(legacy,'PUT',{report:report('legado'),version:0},alice)).status,200);
  assert.equal((await req(path(a))).status,401);
  assert.equal((await req(path(foreign),{headers:{cookie:alice}})).status,404);
  assert.equal((await req(path(a),{headers:{cookie:bob}})).status,404);
  assert.equal((await write(path(a),'PUT',{report:report('A'),version:0},alice,'https://other.example')).status,403);
  for(const [id,name] of [[a,'A'],[b,'B']]){const response=await write(path(id),'PUT',{report:report(name),version:0},alice);assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).report.version,1);}
  for(const [id,name] of [[a,'A'],[b,'B']]){const data=await(await req(path(id),{headers:{cookie:alice}})).json();assert.equal(data.report.state.projectInfo.projectName,name);assert.equal(data.report.state.analysisMarkdown,`Análisis ${name}`);}
  assert.equal((await(await req(legacy,{headers:{cookie:alice}})).json()).report.state.projectInfo.projectName,'legado');
  const competing=await Promise.all([write(path(a),'PUT',{report:report('A-1'),version:1},alice),write(path(a),'PUT',{report:report('A-2'),version:1},alice)]);assert.deepEqual(competing.map(response=>response.status).sort(),[200,409]);
  const bData=(await(await req(path(b),{headers:{cookie:alice}})).json()).report;assert.equal(bData.version,1);assert.equal(bData.state.projectInfo.projectName,'B');
  // Upload and associate sources through the browser API; the same key is scoped to a project.
  const upload=(id,name,text)=>req(`${path(id)}/uploads`,{method:'POST',headers:{cookie:alice,origin:'http://localhost','idempotency-key':'same-upload-key','x-file-name':name,'content-type':'text/plain'},body:text});
  const uploadedA=await upload(a,'a.txt','source A'),uploadedB=await upload(b,'b.txt','source B');
  assert.equal(uploadedA.status,201,await uploadedA.clone().text());assert.equal(uploadedB.status,201,await uploadedB.clone().text());
  const sourceA=(await uploadedA.json()).source,sourceB=(await uploadedB.json()).source;
  assert.deepEqual((await(await req(`${path(a)}/uploads`,{headers:{cookie:alice}})).json()).sources.map(x=>x.sourceKey),[sourceA.sourceKey]);
  assert.deepEqual((await(await req(`${path(b)}/uploads`,{headers:{cookie:alice}})).json()).sources.map(x=>x.sourceKey),[sourceB.sourceKey]);
  assert.equal((await req(`${path(b)}/sources/${sourceA.sourceKey}`,{headers:{cookie:alice}})).status,404);
  assert.equal((await req(`${path(a)}/sources/${sourceA.sourceKey}`,{headers:{cookie:bob}})).status,404);
  assert.equal(await(await req(`${path(a)}/sources/${sourceA.sourceKey}`,{headers:{cookie:alice}})).text(),'source A');
  const currentA=(await(await req(path(a),{headers:{cookie:alice}})).json()).report;
  const sourceEntry=source=>({id:source.sourceKey,sourceKey:source.sourceKey,fileName:source.fileName,sourceType:'original',contentType:source.contentType,size:source.size});
  assert.equal((await write(path(a),'PUT',{report:{...currentA.state,sourceFiles:[sourceEntry(sourceB)]},version:currentA.version},alice)).status,409);
  assert.equal((await write(path(a),'PUT',{report:{...currentA.state,sourceFiles:[sourceEntry(sourceA)]},version:currentA.version},alice)).status,200);
  const deleteSource=()=>req(`${path(a)}/sources/${sourceA.sourceKey}`,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}});
  assert.equal((await deleteSource()).status,409);
  assert.equal((await write(path(a),'PUT',{report:{...currentA.state,sourceFiles:[]},version:currentA.version+1},alice)).status,200);
  assert.equal((await deleteSource()).status,204);
  assert.equal(await(await req(`${path(b)}/sources/${sourceB.sourceKey}`,{headers:{cookie:alice}})).text(),'source B');
  // Stored originals are collected with the deleted project, not with its sibling.
  const owner=(await(await req('/api/me',{headers:{cookie:alice}})).json()).user.id;
  const bucket=await worker.getR2Bucket('FILES');
  for(const [id,key] of [[a,'project-a-source'],[b,'project-b-source']]){
   await bucket.put(key,`data ${key}`);
   await db.prepare('INSERT INTO project_feasibility_sources(project_id,owner_id,source_key,upload_key,name,content_type,content_hash,size,object_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,owner,`${id}-source`,`${id}-upload`,'fuente.txt','text/plain','hash',4,key,'2026-11-10').run();
  }
  const removeA=()=>req(`/api/projects/${a}`,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}});
  for(const [id,project] of [['job-a',a],['job-b',b]]){
   await db.prepare("INSERT INTO account_jobs(id,owner_id,project_id,kind,client_request_id,payload_json,state,created_at,updated_at) VALUES(?,?,?,'feasibility.export-word',?,'{}','queued',?,?)").bind(id,owner,project,id,'2026','2026').run();
   const key=`${id}-artifact`;await bucket.put(key,key);
   await db.prepare('INSERT INTO account_job_artifacts(id,job_id,object_key,sha256,size,created_at) VALUES(?,?,?,?,?,?)').bind(`${id}-artifact-id`,id,key,'hash',1,'2026').run();
  }
  assert.equal((await removeA()).status,409);
  assert.ok(await bucket.get('job-a-artifact'));
  await db.prepare("UPDATE account_jobs SET state='running' WHERE id='job-a'").run();
  assert.equal((await removeA()).status,409);
  await db.prepare("UPDATE account_jobs SET state='succeeded' WHERE id='job-a'").run();
  assert.equal((await removeA()).status,204);
  assert.equal(await bucket.get('job-a-artifact'),null);
  assert.ok(await bucket.get('job-b-artifact'));
  assert.ok(await db.prepare('SELECT id FROM account_jobs WHERE id=?').bind('job-b').first());
  assert.equal(await bucket.get('project-a-source'),null);
  assert.ok(await bucket.get('project-b-source'));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM project_feasibility_sources WHERE project_id=?').bind(a).first()).n,0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM project_feasibility_sources WHERE project_id=?').bind(b).first()).n,2);
  assert.deepEqual(new Set((await db.prepare('SELECT source_key FROM project_feasibility_sources WHERE project_id=?').bind(b).all()).results.map(row=>row.source_key)),new Set([`${b}-source`,sourceB.sourceKey]));
  assert.equal((await req(path(a),{headers:{cookie:alice}})).status,404);
  assert.equal((await(await req(path(b),{headers:{cookie:alice}})).json()).report.state.projectInfo.projectName,'B');
  assert.equal((await(await req(legacy,{headers:{cookie:alice}})).json()).report.state.projectInfo.projectName,'legado');
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});

test('las tareas de análisis y sus contextos permanecen en el proyecto de origen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-project-feasibility-jobs-'));let worker;
 try {
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'project-jobs'},r2Buckets:['FILES'],bindings:{BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost',AUTH_ALLOW_REGISTRATION:'true',CREDENTIAL_KEY_HEX:'11'.repeat(32),CREDENTIAL_KEY_ID:'test'}}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),post=(path,body,headers={})=>req(path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...headers},body:JSON.stringify(body)}),put=(path,body,cookie)=>req(path,{method:'PUT',headers:{origin:'http://localhost','content-type':'application/json',cookie},body:JSON.stringify(body)});
  const signup=await post('/api/auth/sign-up/email',{name:'Alice',email:'alice@example.com',password:'password-123456'});assert.equal(signup.status,200);const cookie=signup.headers.get('set-cookie').split(';')[0],user={cookie};
  const create=async title=>(await(await post('/api/projects',{title},user)).json()).project.id,a=await create('A'),b=await create('B'),base=id=>`/api/projects/${id}/feasibility-report`;
  const report=name=>({step:'materials',projectInfo:{projectName:name,projectType:'government',industry:'',constructionUnit:'',location:'',constructionContent:'',constructionPeriodYears:'2',operationPeriodYears:'20',totalInvestment:'',fundingSource:''},sourceFiles:[],analysisMarkdown:'',outlineTemplate:'government',targetWords:30000,referenceDocumentIds:[],keyParametersMarkdown:'',outlineData:null});
  for(const [id,name] of [[a,'Proyecto A'],[b,'Proyecto B']])assert.equal((await put(base(id),{report:report(name),version:0},cookie)).status,200);
  const pairing=await(await post('/api/runner-pairings',{},user)).json(),runner=await(await post('/api/runners/pair',{code:pairing.code,name:'Equipo'})).json(),auth={authorization:`Bearer ${runner.token}`};
  const body={version:1,language:'es',credentialId:'local-runner',dataProcessingConsent:true};
  const queue=async (id,key)=>{const response=await post(`${base(id)}/analyses`,body,{...user,'idempotency-key':key});assert.equal(response.status,201,await response.clone().text());return (await response.json()).job;};
  const ja=await queue(a,'analysis-a'),jb=await queue(b,'analysis-b');
  const list=async id=>(await(await req(`${base(id)}/analyses`,{headers:user})).json()).jobs;
  assert.deepEqual((await list(a)).map(j=>j.id),[ja.id]);assert.deepEqual((await list(b)).map(j=>j.id),[jb.id]);
  assert.equal((await post(`${base(b)}/analyses/${ja.id}/cancel`,{},user)).status,404);
  const expected=new Map([[ja.id,'Proyecto A'],[jb.id,'Proyecto B']]);
  for(let i=0;i<2;i++){
   const claim=await(await post('/api/runner/jobs/claim',{kinds:['feasibility.analyze'],localModel:true},auth)).json();assert.ok(expected.has(claim.job.id));
   const context=await post(`/api/runner/jobs/${claim.job.id}/feasibility-analysis`,{lease:claim.lease},auth);assert.equal(context.status,200,await context.clone().text());assert.equal((await context.json()).projectInfo.projectName,expected.get(claim.job.id));
   const owning=claim.job.id===ja.id?a:b,other=owning===a?b:a;
   const asked=await post(`/api/runner/jobs/${claim.job.id}/questions`,{lease:claim.lease,toolCallId:`question-${i}`,question:'¿Confirmar?',options:[{label:'Sí',custom:false},{label:'No',custom:false}]},auth);assert.equal(asked.status,201,await asked.clone().text());const question=(await asked.json()).question;
   assert.equal((await(await req(`${base(owning)}/questions`,{headers:user})).json()).questions.length,1);
   assert.equal((await(await req(`${base(other)}/questions`,{headers:user})).json()).questions.length,0);
   assert.equal((await(await req('/api/feasibility-report/questions',{headers:user})).json()).questions.length,0);
   assert.equal((await post(`${base(other)}/questions/${question.id}/answer`,{option:0},user)).status,404);
   assert.equal((await post(`${base(owning)}/questions/${question.id}/answer`,{option:0},user)).status,200);
   const done=await post(`/api/runner/jobs/${claim.job.id}/complete`,{lease:claim.lease,status:'succeeded',result:{content:`Resultado ${expected.get(claim.job.id)}`}},auth);assert.equal(done.status,200,await done.clone().text());
   expected.delete(claim.job.id);
  }
  assert.equal((await post(`${base(b)}/analyses/${ja.id}/apply`,{version:1},user)).status,404);
  assert.equal((await post(`${base(a)}/analyses/${ja.id}/apply`,{version:1},user)).status,200);
  assert.equal((await(await req(base(a),{headers:user})).json()).report.state.analysisMarkdown,'Resultado Proyecto A');
  assert.equal((await(await req(base(b),{headers:user})).json()).report.state.analysisMarkdown,'');
  assert.equal((await post(`${base(b)}/analyses/${jb.id}/apply`,{version:1},user)).status,200);
  assert.equal((await(await req(base(b),{headers:user})).json()).report.state.analysisMarkdown,'Resultado Proyecto B');
  const staleResponse=await post(`${base(a)}/analyses`,{...body,version:2},{...user,'idempotency-key':'stale-a'});assert.equal(staleResponse.status,201,await staleResponse.clone().text());const stale=(await staleResponse.json()).job;
  const claim=await(await post('/api/runner/jobs/claim',{kinds:['feasibility.analyze'],localModel:true},auth)).json();assert.equal(claim.job.id,stale.id);
  const state=(await(await req(base(a),{headers:user})).json()).report.state;
  assert.equal((await put(base(a),{report:{...state,analysisMarkdown:'Editado después de encolar'},version:2},cookie)).status,200);
  assert.equal((await post(`/api/runner/jobs/${stale.id}/feasibility-analysis`,{lease:claim.lease},auth)).status,409);
  assert.equal((await post(`/api/runner/jobs/${stale.id}/complete`,{lease:claim.lease,status:'succeeded',result:{content:'Resultado obsoleto'}},auth)).status,409);
  assert.equal((await post(`${base(a)}/analyses/${stale.id}/apply`,{version:2},user)).status,404);
  assert.equal((await(await req(base(b),{headers:user})).json()).report.state.analysisMarkdown,'Resultado Proyecto B');
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
