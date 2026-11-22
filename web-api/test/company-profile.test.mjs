import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('el perfil empresarial se aísla por cuenta y protege ediciones simultáneas',async()=>{
 const build=await mkdtemp(join(tmpdir(),'savia-company-profile-'));let worker;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',build],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(build,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'profile'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),write=(method,body,cookie)=>req('/api/company-profile',{method,headers:{origin:'http://localhost','content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)}),signup=async name=>{const response=await req('/api/auth/sign-up/email',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({name,email:`${name}@example.com`,password:'password-123456'})});return response.headers.get('set-cookie').split(';')[0];};
  const alice=await signup('alice'),bob=await signup('bob');assert.equal((await req('/api/company-profile')).status,401);
  const empty=await(await req('/api/company-profile',{headers:{cookie:alice}})).json();assert.equal(empty.version,0);assert.equal(empty.profile.companyName,'');assert.equal(empty.profile.watermarkEnabled,false);
  const profile={...empty.profile,companyName:'Empresa Ñ',industry:'Tecnología',businessScope:'Software y datos',bankAccountNumber:'123',watermarkEnabled:true};
  assert.equal((await req('/api/company-profile',{method:'PUT',headers:{origin:'http://other.example',cookie:alice,'content-type':'application/json'},body:JSON.stringify({version:0,profile})})).status,403);
  assert.equal((await write('PUT',{version:0,profile:{...profile,extra:'no'}},alice)).status,400);
  assert.equal((await write('PUT',{version:0,profile:{...profile,companyIntro:'x'.repeat(100001)}},alice)).status,400);
  const saves=await Promise.all([write('PUT',{version:0,profile},alice),write('PUT',{version:0,profile:{...profile,companyName:'Otro'}},alice)]);assert.deepEqual(saves.map(r=>r.status).sort(),[200,409]);
  const saved=await(await req('/api/company-profile',{headers:{cookie:alice}})).json();assert.equal(saved.version,1);assert.equal(saved.profile.industry,'Tecnología');assert.equal(saved.profile.bankAccountNumber,'123');
  assert.equal((await(await req('/api/company-profile',{headers:{cookie:bob}})).json()).version,0);
  assert.equal((await write('PUT',{version:0,profile},alice)).status,409);
  assert.equal((await write('PUT',{version:1,profile:{...saved.profile,watermarkEnabled:'true'}},alice)).status,400);
  assert.equal((await write('PUT',{version:1,profile:{...saved.profile,businessScope:'Nuevo alcance'}},alice)).status,200);
  assert.equal((await(await req('/api/company-profile',{headers:{cookie:alice}})).json()).profile.businessScope,'Nuevo alcance');
  const bidBenchmarks='2025: 400000 EUR; medición: 110 EUR/km';
  const updated=await write('PUT',{version:2,profile:{...profile,bidBenchmarks}},alice);
  assert.equal((await updated.json()).profile.bidBenchmarks,bidBenchmarks);
  const legacy=await write('PUT',{version:3,profile},alice);
  assert.equal((await legacy.json()).profile.bidBenchmarks,bidBenchmarks);
  assert.equal((await write('PUT',{version:4,profile:{...profile,bidBenchmarks:42}},alice)).status,400);
 }finally{await worker?.dispose();await rm(build,{recursive:true,force:true});}
});
