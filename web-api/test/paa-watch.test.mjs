import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('seguimiento PAA aísla cuentas, detecta cambios y evita respuestas obsoletas',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-paa-'));let worker,version='1',status='Publicado',fail=false,calls=0,gate=null;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  const outboundService=async request=>{const url=new URL(request.url);assert.equal(url.hostname,'www.datos.gov.co');assert.equal(url.pathname,'/resource/b6m4-qgqv.json');calls++;if(gate){gate.enter();await gate.promise;}if(fail)return new Response('unavailable',{status:503});return Response.json([{id_plan_anual_de_adquisiciones:'plan-1',identificador_unico:'header',nombre_entidad:'Entidad',anno:'2026',version,fecha_de_ultima_modificacion:'2026-01-01',estado:status}]);};
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'paa'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'},outboundService}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),send=(path,method,body,cookie,origin='http://localhost')=>req(path,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  async function signup(name){const r=await send('/api/auth/sign-up/email','POST',{name,email:`${name}@example.com`,password:'password-123456'});return r.headers.get('set-cookie').split(';')[0];}
  const alice=await signup('alice'),bob=await signup('bob');
  assert.equal((await req('/api/paa-watches')).status,401);assert.equal((await send('/api/paa-watches','POST',{planId:'plan-1'},alice,'https://other.example')).status,403);
  const follow=await send('/api/paa-watches','POST',{planId:'plan-1'},alice);assert.equal(follow.status,201);const watch=(await follow.json()).watch;assert.equal(watch.version,'1');
  assert.equal((await (await req('/api/paa-watches',{headers:{cookie:bob}})).json()).items.length,0);assert.equal((await send(`/api/paa-watches/${watch.id}/check`,'POST',{},bob)).status,404);
  const state=async()=>await (await req('/api/paa-watches',{headers:{cookie:alice}})).json();
  assert.equal((await send(`/api/paa-watches/${watch.id}/check`,'POST',{},alice)).status,200);assert.equal((await state()).alerts.length,0);
  version='2';const checks=await Promise.all([send(`/api/paa-watches/${watch.id}/check`,'POST',{},alice),send(`/api/paa-watches/${watch.id}/check`,'POST',{},alice)]);assert.ok(checks.every(r=>[200,409].includes(r.status)));let observed=await state();assert.equal(observed.alerts.length,1);assert.equal(observed.unreadCount,1);assert.equal(observed.alerts[0].previous.version,'1');assert.equal(observed.alerts[0].current.version,'2');
  assert.equal((await send(`/api/paa-alerts/${observed.alerts[0].id}/review`,'POST',{},bob)).status,404);assert.equal((await send(`/api/paa-alerts/${observed.alerts[0].id}/review`,'POST',{},alice)).status,200);assert.equal((await state()).unreadCount,0);
  fail=true;assert.equal((await send(`/api/paa-watches/${watch.id}/check`,'POST',{},alice)).status,502);observed=await state();assert.equal(observed.items[0].version,'2');assert.ok(observed.items[0].error);fail=false;
  const before=calls;assert.equal((await send('/api/paa-watches/check-due','POST',{},alice)).status,200);assert.equal(calls,before);
  await db.prepare('UPDATE paa_watches SET checked_at = ? WHERE id = ?').bind('2020-01-01T00:00:00.000Z',watch.id).run();version='3';const due=await send('/api/paa-watches/check-due','POST',{},alice);assert.equal((await due.json()).checked,1);assert.equal((await state()).alerts.length,2);

  let enter,release;const started=new Promise(resolve=>enter=resolve);gate={enter,promise:new Promise(resolve=>release=resolve)};
  const inFlight=send(`/api/paa-watches/${watch.id}/check`,'POST',{},alice);await started;
  assert.equal((await send(`/api/paa-watches/${watch.id}`,'DELETE',{},alice)).status,204);version='4';release();gate=null;assert.ok([404,409].includes((await inFlight).status));assert.equal((await state()).items.length,0);assert.equal((await state()).alerts.length,0);
  let enterFollow,releaseFollow;const firstStarted=new Promise(resolve=>enterFollow=resolve);gate={enter:enterFollow,promise:new Promise(resolve=>releaseFollow=resolve)};
  const firstFollow=send('/api/paa-watches','POST',{planId:'plan-1'},alice);await firstStarted;gate=null;
  const secondFollow=await send('/api/paa-watches','POST',{planId:'plan-1'},alice);assert.equal(secondFollow.status,201);const newWatch=(await secondFollow.json()).watch;
  assert.equal((await send(`/api/paa-watches/${newWatch.id}`,'DELETE',{},alice)).status,204);releaseFollow();assert.equal((await firstFollow).status,409);assert.equal((await state()).items.length,0);

 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
