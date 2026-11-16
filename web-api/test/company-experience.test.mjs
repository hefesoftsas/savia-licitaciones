import {test} from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {dirname,join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('experiencia empresarial aislada, versionada y reflejada en las fuentes de recomendaciones',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-experience-'));let worker;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'experience'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(url,options={})=>worker.dispatchFetch(`http://localhost${url}`,options),write=(url,method,body,cookie)=>req(url,{method,headers:{cookie,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(body)}),signup=async name=>{const r=await write('/api/auth/sign-up/email','POST',{name,email:`${name}@example.com`,password:'password-123456'},'');return r.headers.get('set-cookie').split(';')[0];};
  const alice=await signup('alice'),bob=await signup('bob'),path='/api/company-experience',read=async cookie=>(await(await req(path,{headers:{cookie}})).json()).projects,sources=async cookie=>(await(await req('/api/opportunity-suggestions/settings',{headers:{cookie}})).json());
  assert.equal((await req(path)).status,401);assert.deepEqual(await read(alice),[]);const before=await sources(alice);
  const draft={projectName:'Hospital digital',projectNumber:'C-12',customerName:'Entidad',projectType:'service',projectManager:'Ana',contractAmount:'500',startDate:'2024-01-01',endDate:'2025-01-01',projectStatus:'Completado',introduction:'Implementación de software.'};
  assert.equal((await write(path,'POST',{...draft,extra:'x'},alice)).status,400);const created=await write(path,'POST',draft,alice);assert.equal(created.status,201);const item=(await created.json()).project;assert.equal(item.projectName,'Hospital digital');assert.equal(item.version,1);
  assert.deepEqual(await read(bob),[]);assert.equal((await write(`${path}/${item.id}`,'DELETE',{version:1},bob)).status,404);
  const after=await sources(alice);assert.notEqual(after.sourceFingerprint,before.sourceFingerprint);assert.ok(after.terms.includes('hospital'));
  const edits=await Promise.all([write(`${path}/${item.id}`,'PUT',{...draft,projectName:'Hospital rural',version:1},alice),write(`${path}/${item.id}`,'PUT',{...draft,projectName:'Otro',version:1},alice)]);assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
  const revised=(await read(alice))[0];assert.equal(revised.version,2);assert.notEqual((await sources(alice)).sourceFingerprint,after.sourceFingerprint);
  assert.equal((await write(`${path}/${item.id}`,'DELETE',{version:1},alice)).status,409);assert.equal((await write(`${path}/${item.id}`,'DELETE',{version:2},alice)).status,204);assert.deepEqual(await read(alice),[]);assert.equal((await sources(alice)).sourceFingerprint,before.sourceFingerprint);
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
