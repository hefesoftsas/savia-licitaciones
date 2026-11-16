import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('guarda el informe de viabilidad por cuenta con control de concurrencia',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-feasibility-'));let worker;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'feasibility'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost',CREDENTIAL_KEY_HEX:'11'.repeat(32),CREDENTIAL_KEY_ID:'test'}}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),write=(path,method,body,headers={})=>req(path,{method,headers:{origin:'http://localhost','content-type':'application/json',...headers},body:JSON.stringify(body)});
  async function signup(name){return (await write('/api/auth/sign-up/email','POST',{name,email:`${name}@example.com`,password:'password-123456'})).headers.get('set-cookie').split(';')[0];}
  const alice=await signup('alice'),bob=await signup('bob'),path='/api/feasibility-report';
  assert.equal((await req(path)).status,401);assert.deepEqual(await (await req(path,{headers:{cookie:alice}})).json(),{report:null});
  const report={step:'content',projectInfo:{projectName:'Proyecto privado',projectType:'enterprise',industry:'Servicios',constructionUnit:'Unidad',location:'Bogotá',constructionContent:'Alcance',constructionPeriodYears:'2',operationPeriodYears:'20',totalInvestment:'100',fundingSource:'Propios'},sourceFiles:[],analysisMarkdown:'Análisis privado',outlineTemplate:'enterprise',targetWords:30000,referenceDocumentIds:[],keyParametersMarkdown:'Parámetros',outlineData:{project_name:'Proyecto privado',project_overview:'Contexto',outline:[{id:'n1',title:'Capítulo',description:'',content:'Contenido',children:[]}]}};
  assert.equal((await write(path,'PUT',{report,version:0},{cookie:alice,origin:'https://example.com'})).status,403);
  const first=await write(path,'PUT',{report,version:0},{cookie:alice});assert.equal(first.status,200);assert.equal((await first.json()).report.version,1);
  assert.deepEqual(await (await req(path,{headers:{cookie:bob}})).json(),{report:null});
  const requests=await Promise.all([write(path,'PUT',{report:{...report,analysisMarkdown:'Cambio 1'},version:1},{cookie:alice}),write(path,'PUT',{report:{...report,analysisMarkdown:'Cambio 2'},version:1},{cookie:alice})]);assert.deepEqual(requests.map(x=>x.status).sort(),[200,409]);
  const saved=(await (await req(path,{headers:{cookie:alice}})).json()).report;assert.equal(saved.version,2);assert.equal(saved.state.outlineData.outline[0].content,'Contenido');assert.match(saved.state.analysisMarkdown,/Cambio/);
  assert.equal((await write(path,'PUT',{report:{...report,outlineData:{outline:[{id:'same',title:'A'},{id:'same',title:'B'}]}},version:2},{cookie:alice})).status,400);
  assert.equal((await write(path,'PUT',{report:{...report,step:'unknown'},version:2},{cookie:alice})).status,400);assert.equal((await write(path,'PUT',{report,version:0},{cookie:alice})).status,409);
  const pairing=await (await write('/api/runner-pairings','POST',{}, {cookie:bob})).json(),paired=await (await write('/api/runners/pair','POST',{code:pairing.code,name:'Equipo'})).json(),auth={authorization:`Bearer ${paired.token}`};
  const requestId='backup-123',sourceKey='a'.repeat(64),snapshot={report:{...report,sourceFiles:[{id:'source-1',fileName:'estudio.pdf',sourceKey,expected:true}]},tasks:[{type:'feasibility-content',status:'interrupted'}]};
  const importPath=`/api/runner/imports/feasibility/${requestId}`,send=()=>write(importPath,'POST',snapshot,auth);
  const imports=await Promise.all([send(),send()]);assert.deepEqual(imports.map(x=>x.status).sort(),[200,201]);
  const filePath=`${importPath}/sources/${sourceKey}`;assert.equal((await req(filePath,{method:'POST',headers:auth,body:'Texto fuente privado'})).status,201);assert.equal((await req(filePath,{method:'POST',headers:auth,body:'Texto fuente privado'})).status,200);assert.equal((await req(filePath,{method:'POST',headers:auth,body:'Distinto'})).status,409);
  const download=`${path}/sources/${sourceKey}`;assert.equal((await req(download,{headers:{cookie:alice}})).status,404);assert.equal(await (await req(download,{headers:{cookie:bob}})).text(),'Texto fuente privado');
  const loaded=await (await req(path,{headers:{cookie:bob}})).json();assert.equal(loaded.sources[0].available,true);
  const bobReport=loaded.report;assert.equal(bobReport.state.importedTasks[0].status,'interrupted');assert.equal(bobReport.state.outlineData.outline[0].content,'Contenido');
  assert.equal((await write(path,'PUT',{report:{...bobReport.state,analysisMarkdown:'Revisado'},version:1},{cookie:bob})).status,200);assert.equal((await send()).status,200);assert.equal((await (await req(path,{headers:{cookie:bob}})).json()).report.state.analysisMarkdown,'Revisado');
  const reference='savia-asset://imported-images/feasibility-report/plano.png',assetKey=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['url',reference])))),b=>b.toString(16).padStart(2,'0')).join(''),png=Buffer.from('89504e470d0a1a0a010203','hex'),assetPath=`${importPath}/assets/${assetKey}`,assetHeaders={...auth,'x-asset-kind':'url','x-asset-reference':encodeURIComponent(reference)};
  assert.equal((await req(assetPath,{method:'POST',headers:assetHeaders,body:png})).status,201);assert.equal((await req(assetPath,{method:'POST',headers:assetHeaders,body:png})).status,200);assert.equal((await (await req(path,{headers:{cookie:bob}})).json()).report.version,3);
  assert.equal((await req(download,{method:'DELETE',headers:{cookie:bob,origin:'http://localhost'}})).status,204);assert.equal((await req(filePath,{method:'POST',headers:auth,body:'Texto fuente privado'})).status,410);

 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
