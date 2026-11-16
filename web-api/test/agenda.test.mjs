import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('agenda reúne fechas de la cuenta y aplica la semántica del escritorio', async () => {
 const build = await mkdtemp(join(tmpdir(), 'savia-agenda-')); let worker;
 try {
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  worker = new Miniflare(convertV4MiniflareOptions({ modules:true, script:await readFile(join(build,'index.js'),'utf8'), compatibilityDate:'2026-10-30', compatibilityFlags:['nodejs_compat'], d1Databases:{DB:'agenda'}, r2Buckets:['FILES'], bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'} }));
  const db = await worker.getD1Database('DB'); for (const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options), post=(path,body,cookie)=>req(path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  async function signup(name) { const r=await post('/api/auth/sign-up/email',{name,email:`${name}@example.com`,password:'password-123456'}); assert.equal(r.status,200); return r.headers.get('set-cookie').split(';')[0]; }
  const alice=await signup('alice'), bob=await signup('bob');
  const create=async (title,cookie)=> (await (await post('/api/projects',{title},cookie)).json()).project;
  const plain=await create('Proyecto propio',alice), other=await create('Proyecto ajeno',bob);
  const tenderData={source:'secop-ii',id:'SECOP-1',title:'Licitación',deadline:'2026-12-03T10:00:00',deadlineVerified:true};
  const tender=(await (await post('/api/projects/from-secop',{process:tenderData},alice)).json()).project;
  const task=async (project,title,dueDate,cookie)=> (await (await post(`/api/projects/${project.id}/workflow/tasks`,{title,dueDate},cookie)).json()).item;
  const a=await task(plain,'Preparar','2026-12-01',alice), done=await task(tender,'Completada','2026-11-01',alice); await task(tender,'Sin fecha','',alice); await task(other,'Privada','2026-11-01',bob);
  await req(`/api/projects/${tender.id}/workflow/tasks/${done.id}`,{method:'PATCH',headers:{origin:'http://localhost',cookie:alice,'content-type':'application/json'},body:JSON.stringify({completed:true,version:done.version})});
  assert.equal((await req('/api/agenda')).status,401);
  const response=await req('/api/agenda',{headers:{cookie:alice}}); assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
  const items=(await response.json()).items; assert.deepEqual(items.map(x=>x.title),['Preparar','Licitación']); assert.equal(items[0].processId,plain.id); assert.equal(items[0].id,`task:${a.id}`); assert.equal(items[1].deadlineVerified,true); assert.equal(items[1].deadlineSource,'saved');
  const bobItems=(await (await req('/api/agenda',{headers:{cookie:bob}})).json()).items; assert.deepEqual(bobItems.map(x=>x.title),['Privada']);
  await db.prepare('UPDATE project_secop SET process_json = ? WHERE project_id = ?').bind(JSON.stringify({...tenderData, deadline:'2026-02-30',deadlineVerified:false}),tender.id).run();
  assert.deepEqual((await (await req('/api/agenda',{headers:{cookie:alice}})).json()).items.map(x=>x.title),['Preparar']);
  await db.prepare('UPDATE project_secop SET process_json = ? WHERE project_id = ?').bind(JSON.stringify({...tenderData, deadline:'2026-12-04',deadlineVerified:false}),tender.id).run();
  const unverified=(await (await req('/api/agenda',{headers:{cookie:alice}})).json()).items; assert.equal(unverified[1].deadlineVerified,false); assert.equal(unverified[1].date,'2026-12-04');
  await db.prepare('UPDATE project_secop SET process_json = ? WHERE project_id = ?').bind(JSON.stringify({...tenderData, source:'secop-i',deadline:'2026-12-04'}),tender.id).run();
  assert.deepEqual((await (await req('/api/agenda',{headers:{cookie:alice}})).json()).items.map(x=>x.title),['Preparar']);
  const certPath='/api/company-certificates', payload={name:'Certificado ñ',number:'123',validityMode:'range',validFrom:'2026-01-01',validTo:'2026-12-02'};
  assert.equal((await req(certPath)).status,401);
  assert.equal((await req(certPath,{method:'POST',headers:{origin:'https://other.example',cookie:alice,'content-type':'application/json'},body:JSON.stringify(payload)})).status,403);
  assert.equal((await post(certPath,{...payload,validTo:'2026-02-30'},alice)).status,400);
  const created=await post(certPath,payload,alice); assert.equal(created.status,201); const cert=(await created.json()).certificate; assert.equal(cert.version,1);
  assert.deepEqual((await (await req(certPath,{headers:{cookie:bob}})).json()).certificates,[]);
  const itemPath=`${certPath}/${cert.id}`, update=(cookie,body)=>req(itemPath,{method:'PUT',headers:{origin:'http://localhost',cookie,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await update(bob,{...payload,version:1})).status,404);
  assert.deepEqual((await (await req('/api/agenda',{headers:{cookie:alice}})).json()).items.map(x=>x.title),['Preparar','Certificado ñ']);
  assert.equal((await (await req('/api/agenda',{headers:{cookie:bob}})).json()).items.length,1);
  const changes=await Promise.all([update(alice,{...payload,name:'Editado',version:1}),update(alice,{...payload,name:'Otro',version:1})]); assert.deepEqual(changes.map(x=>x.status).sort(),[200,409]);
  assert.equal((await update(alice,{...payload,validityMode:'long-term',version:1})).status,409);
  const saved=(await (await req(certPath,{headers:{cookie:alice}})).json()).certificates[0]; assert.equal(saved.version,2);
  const permanent=await update(alice,{...payload,validityMode:'long-term',version:2}); assert.equal(permanent.status,200); assert.equal((await permanent.json()).certificate.validTo,'');
  assert.deepEqual((await (await req('/api/agenda',{headers:{cookie:alice}})).json()).items.map(x=>x.title),['Preparar']);
  const remove=(cookie,version)=>req(itemPath,{method:'DELETE',headers:{origin:'http://localhost',cookie,'content-type':'application/json'},body:JSON.stringify({version})});
  assert.equal((await remove(bob,3)).status,404); assert.equal((await remove(alice,2)).status,409); assert.equal((await remove(alice,3)).status,204);
  assert.deepEqual((await (await req(certPath,{headers:{cookie:alice}})).json()).certificates,[]);
  const blankCert=await post(certPath,{name:'',number:'',validityMode:'',validFrom:'',validTo:''},alice); assert.equal(blankCert.status,201);
  assert.equal((await post(certPath,{...payload,validityMode:'invalid'},alice)).status,400);
  assert.deepEqual((await (await req('/api/agenda',{headers:{cookie:alice}})).json()).items.map(x=>x.title),['Preparar']);


 } finally { await worker?.dispose(); await rm(build,{recursive:true,force:true}); }
});
