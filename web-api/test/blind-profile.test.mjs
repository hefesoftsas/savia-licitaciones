import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('conserva perfiles por proyecto, detecta conflictos y copia las reglas a cada tarea',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-blind-profile-'));let worker;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'blind-profile'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),write=(path,method,body,cookie,origin='http://localhost',extra={})=>req(path,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...extra},body:JSON.stringify(body)});
  async function signup(name){return (await write('/api/auth/sign-up/email','POST',{name,email:`${name}@example.com`,password:'password-123456'})).headers.get('set-cookie').split(';')[0];}
  const alice=await signup('alice'),bob=await signup('bob'),project=(await (await write('/api/projects','POST',{title:'Proyecto'},alice)).json()).project,base=`/api/projects/${project.id}/blind-profile`,get=cookie=>req(base,{headers:{cookie}});
  assert.equal((await req(base)).status,401);assert.equal((await get(bob)).status,404);
  const initial=await (await get(alice)).json();assert.equal(initial.version,0);assert.equal(initial.profile.page.paper,'A4');
  const profile={...initial.profile,page:{...initial.profile.page,paper:'Letter'},body:{...initial.profile.body,font_en:'Arial'},unknown:'discard'};
  assert.equal((await write(base,'PUT',{version:0,profile},bob)).status,404);assert.equal((await write(base,'PUT',{version:0,profile},alice,'https://other.example')).status,403);
  const saved=await write(base,'PUT',{version:0,profile},alice);assert.equal(saved.status,200);const snapshot=await saved.json();assert.equal(snapshot.version,1);assert.equal(snapshot.profile.page.paper,'Letter');assert.equal(snapshot.profile.unknown,undefined);
  assert.equal((await write(base,'PUT',{version:0,profile},alice)).status,409);
  const jobs=`/api/projects/${project.id}/jobs`,bytes=Buffer.from('PK\x03\x04test'),file=(await (await req(`/api/projects/${project.id}/files`,{method:'POST',headers:{cookie:alice,origin:'http://localhost','x-file-name':'a.docx','content-type':'application/octet-stream'},body:bytes})).json()).file;
  const payload={fileIds:[file.id],language:'es',preset:'project',profileVersion:1,sensitiveWords:[]};
  const created=await write(jobs,'POST',{kind:'blind-check.inspect',payload},alice,'http://localhost',{'idempotency-key':'one'});assert.equal(created.status,201);const job=(await created.json()).job;assert.equal(job.payload.profile.page.paper,'Letter');
  assert.equal((await write(base,'PUT',{version:1,profile:{...profile,page:{...profile.page,paper:'A3'}}},alice)).status,200);
  assert.equal((await write(jobs,'POST',{kind:'blind-check.inspect',payload},alice,'http://localhost',{'idempotency-key':'two'})).status,409);
  const stored=(await (await req(jobs,{headers:{cookie:alice}})).json()).jobs.find(item=>item.id===job.id);assert.equal(stored.payload.profile.page.paper,'Letter');assert.equal(stored.payload.profileVersion,1);
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
