import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('seguimiento SECOP detecta cambios y conserva fuentes incompletas',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-secop-watch-'));let worker,status='Abierto',deadline='2026-12-01',second=false,partial=false,calls=0,gate=null;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  const outboundService=async request=>{calls++;const url=new URL(request.url);assert.equal(url.hostname,'www.datos.gov.co');if(url.pathname==='/resource/p6dx-8zbt.json' && gate){gate.enter();await gate.promise;}if(url.pathname==='/resource/p6dx-8zbt.json')return Response.json([{id_del_proceso:'CO1.PRO.123',id_del_portafolio:'CO1.BDOS.123',entidad:'Entidad',nombre_del_procedimiento:'Compra',estado_del_procedimiento:status,fecha_de_recepcion_de:deadline}]);if(partial&&url.pathname==='/resource/dmgg-8hin.json')return new Response('unavailable',{status:503});return Response.json([{id_documento:'1',nombre_archivo:'Pliego.pdf',extensi_n:'pdf'},...(second?[{id_documento:'2',nombre_archivo:'Adenda.pdf',extensi_n:'pdf'}]:[])]);};
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'secop-watch'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'},outboundService}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),send=(path,method,body,cookie,origin='http://localhost')=>req(path,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  async function signup(name){const r=await send('/api/auth/sign-up/email','POST',{name,email:`${name}@example.com`,password:'password-123456'});return r.headers.get('set-cookie').split(';')[0];}const alice=await signup('alice'),bob=await signup('bob');
  const tenderData={source:'secop-ii',id:'CO1.PRO.123',title:'Compra',portfolioId:'CO1.BDOS.123',deadline:'2026-11-01',deadlineVerified:false};const project=(await (await send('/api/projects/from-secop','POST',{process:tenderData},alice)).json()).project,path=`/api/projects/${project.id}/secop-watch`;
  assert.equal((await req(path)).status,401);assert.equal((await req(path,{headers:{cookie:bob}})).status,404);assert.equal((await send(path,'POST',{},alice,'https://other.example')).status,403);
  assert.equal((await send(path,'POST',{},alice)).status,200);let state=await (await req(path,{headers:{cookie:alice}})).json();assert.equal(state.alerts.length,0);assert.equal(state.baseline.deadline,'2026-12-01');
  let agenda=(await (await req('/api/agenda',{headers:{cookie:alice}})).json()).items;assert.equal(agenda[0].date,'2026-12-01');assert.equal(agenda[0].deadlineSource,'watch');
  status='Cerrado';deadline='2026-12-03';second=true;const simultaneous=await Promise.all([send(path,'POST',{},alice),send(path,'POST',{},alice)]);assert.ok(simultaneous.every(r=>[200,409].includes(r.status)));state=await (await req(path,{headers:{cookie:alice}})).json();assert.deepEqual(state.alerts.map(x=>x.kind).sort(),['deadline','document','status']);assert.equal(state.unreadCount,3);assert.equal(state.alerts.find(x=>x.kind==='document').current.name,'Adenda.pdf');assert.equal(state.alerts.find(x=>x.kind==='status').previous,'Abierto');
  const overview=await (await req('/api/secop-watch',{headers:{cookie:alice}})).json();assert.equal(overview.alerts.length,3);assert.equal(overview.alerts[0].projectId,project.id);assert.equal((await (await req('/api/secop-watch',{headers:{cookie:bob}})).json()).alerts.length,0);
  const alert=state.alerts[0];assert.equal((await send(`/api/secop-alerts/${alert.id}/review`,'POST',{},bob)).status,404);assert.equal((await send(`/api/secop-alerts/${alert.id}/review`,'POST',{},alice)).status,200);
  partial=true;assert.equal((await send(path,'POST',{},alice)).status,200);state=await (await req(path,{headers:{cookie:alice}})).json();assert.equal(state.alerts.length,3);assert.ok(state.error);assert.equal(state.baseline.deadline,'2026-12-03');
  const before=calls;assert.equal((await send('/api/secop-watch/check-due','POST',{},alice)).status,200);assert.equal(calls,before);
  await db.prepare('UPDATE secop_watch_baselines_web SET checked_at = ? WHERE project_id = ?').bind('2020-01-01T00:00:00.000Z',project.id).run();partial=false;const due=await send('/api/secop-watch/check-due','POST',{},alice);assert.equal((await due.json()).checked,1);
  let enter,release;const started=new Promise(resolve=>enter=resolve);gate={enter,promise:new Promise(resolve=>release=resolve)};const pending=send(path,'POST',{},alice);await started;const callsAtRemoval=calls;await db.prepare('DELETE FROM project_secop WHERE project_id = ?').bind(project.id).run();release();gate=null;assert.equal((await pending).status,409);assert.equal(calls,callsAtRemoval);assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM secop_watch_alerts_web WHERE project_id = ?').bind(project.id).first()).count,3);

 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
