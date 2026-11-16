import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
process.env.SAVIA_HEADLESS_RUNNER='1';const {runOnce}=await import(new URL('../../runner/work-loop.mjs',import.meta.url)),{createFeasibilityContentHandler}=await import(new URL('../../runner/feasibility-content.mjs',import.meta.url));
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');


test('HTTP de índice y parámetros usa runner y permanece aislado',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-content-project-'));let worker;try{
 execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
 worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'content-project'},r2Buckets:['FILES'],bindings:{BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost',AUTH_ALLOW_REGISTRATION:'true',CREDENTIAL_KEY_HEX:'11'.repeat(32),CREDENTIAL_KEY_ID:'test'}}));
 const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
 const req=(p,o={})=>worker.dispatchFetch(`http://localhost${p}`,o),write=(p,b,h={})=>req(p,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...h},body:JSON.stringify(b)});
 const signup=await write('/api/auth/sign-up/email',{name:'Alice',email:'alice@example.com',password:'password-123456'}),cookie=signup.headers.get('set-cookie').split(';')[0],user={cookie};
 async function project(title){const r=await write('/api/projects',{title},user);assert.equal(r.status,201);return (await r.json()).project.id}const a=await project('A'),b=await project('B'),path=id=>`/api/projects/${id}/feasibility-report`;
 const report=name=>({step:'content',projectInfo:{projectName:name,projectType:'enterprise',industry:'',constructionUnit:'',location:'',constructionContent:'',constructionPeriodYears:'2',operationPeriodYears:'20',totalInvestment:'',fundingSource:''},sourceFiles:[],analysisMarkdown:'Datos',outlineTemplate:'enterprise',targetWords:30000,referenceDocumentIds:[],keyParametersMarkdown:'Parámetros',outlineData:{outline:[{id:'same',title:'Capítulo',description:'',content:'',children:[]}]}});
 for(const [id,name] of [[a,'A'],[b,'B']]){const r=await req(path(id),{method:'PUT',headers:{...user,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({report:report(name),version:0})});assert.equal(r.status,200,await r.clone().text())}
 const pair=(await(await write('/api/runner-pairings',{},user)).json()).code,runner=(await(await write('/api/runners/pair',{code:pair,name:'Runner'})).json()).token,auth={authorization:`Bearer ${runner}`};

 for(const [type,version,kind,result] of [['outlines',1,'feasibility.generate-outline',{outline:[{id:'generated',title:'Capítulo generado',description:'',content:''}]}],['parameters',2,'feasibility.generate-parameters',{content:'Parámetros generados'}]]){const base=`${path(a)}/${type}`,body={version,language:'es',credentialId:'local-runner',dataProcessingConsent:true};const r=await write(base,body,{...user,'idempotency-key':`test-${type}`});assert.equal(r.status,201,await r.clone().text());const job=(await r.json()).job;assert.equal((await write(`${path(b)}/${type}/${job.id}/apply`,{version},user)).status,404);const claim=await(await write('/api/runner/jobs/claim',{kinds:[kind],localModel:true},auth)).json();assert.equal(claim.job.id,job.id);const ctx=await write(`/api/runner/jobs/${job.id}/feasibility-${type==='outlines'?'outline':'parameters'}-context`,{lease:claim.lease},auth);assert.equal(ctx.status,200,await ctx.clone().text());assert.equal((await ctx.json()).projectInfo.projectName,'A');const complete=await write(`/api/runner/jobs/${job.id}/complete`,{lease:claim.lease,status:'succeeded',result},auth);assert.equal(complete.status,200,await complete.clone().text());const apply=await write(`${base}/${job.id}/apply`,{version},user);assert.equal(apply.status,200,await apply.clone().text());}
 const state=(await(await req(path(a),{headers:user})).json()).report;assert.equal(state.version,3);assert.equal(state.state.outlineData.outline[0].title,'Capítulo generado');assert.equal(state.state.keyParametersMarkdown,'Parámetros generados');const other=(await(await req(path(b),{headers:user})).json()).report;assert.equal(other.version,1);assert.equal(other.state.projectInfo.projectName,'B');
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true})}});
