import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('solicitudes y resultados de presentación permanecen privados y conservan tareas y versiones',{timeout:120000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-submission-'));let worker;
 try{execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'submission'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const DB=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  const request=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),post=(path,body,cookie,origin='http://localhost',key)=>request(path,{method:'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...(key?{'idempotency-key':key}:{})},body:JSON.stringify(body)});
  async function user(name){const response=await post('/api/auth/sign-up/email',{name,email:`${name}@example.test`,password:'password-123456'});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
  const alice=await user('alice'),bob=await user('bob'),projectResponse=await post('/api/projects',{title:'Proyecto A'},alice);assert.equal(projectResponse.status,201);const projectId=(await projectResponse.json()).project.id,base=`/api/projects/${projectId}/submission-tracking`;
  assert.equal((await request(base)).status,401);assert.equal((await request(base,{headers:{cookie:bob}})).status,404);assert.equal((await post(`${base}/requests`,{kind:'observation',title:'Aclarar'},bob)).status,404);assert.equal((await post(`${base}/requests`,{kind:'observation',title:'Aclarar'},alice,'https://otro.example')).status,403);
  assert.equal((await post(`${base}/requests`,{kind:'correction',title:'Subsanar',dueDate:'2026-02-30',note:'',createTask:true},alice)).status,400);
  const created=await post(`${base}/requests`,{kind:'correction',title:'Subsanar experiencia',dueDate:'2026-11-12',note:'Solicitud manual',createTask:true},alice);assert.equal(created.status,201);const item=(await created.json()).item;assert.equal(item.status,'pending');assert.equal(item.version,1);assert.ok(item.taskId);assert.equal(item.taskAvailable,true);
  const tasks=(await(await request(`/api/projects/${projectId}/workflow/tasks`,{headers:{cookie:alice}})).json()).items;assert.equal(tasks.length,1);assert.equal(tasks[0].id,item.taskId);assert.equal(tasks[0].dueDate,'2026-11-12');
  const dateParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value])),today=`${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  const openResponse=await post(`${base}/requests`,{kind:'observation',title:'Responder observación',dueDate:today,note:'',createTask:false},alice);assert.equal(openResponse.status,201);const openItem=(await openResponse.json()).item;
  let agenda=(await(await request('/api/agenda',{headers:{cookie:alice}})).json()).items;assert.ok(agenda.some(entry=>entry.id===`request:${openItem.id}`&&entry.kind==='request'&&entry.date===today));assert.ok(!(await(await request('/api/agenda',{headers:{cookie:bob}})).json()).items.some(entry=>entry.id===`request:${openItem.id}`));
  assert.ok((await(await request('/api/agenda/reminders',{headers:{cookie:alice}})).json()).reminders.some(entry=>entry.itemId===`request:${openItem.id}`));
  assert.equal((await request(`${base}/requests/${openItem.id}`,{method:'PATCH',headers:{cookie:alice,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({status:'resolved',version:1})})).status,200);agenda=(await(await request('/api/agenda',{headers:{cookie:alice}})).json()).items;assert.ok(!agenda.some(entry=>entry.id===`request:${openItem.id}`));
  const patch=(status,version)=>request(`${base}/requests/${item.id}`,{method:'PATCH',headers:{cookie:alice,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({status,version})});
  assert.equal((await patch('reviewed',1)).status,200);assert.equal((await patch('resolved',1)).status,409);assert.equal((await patch('resolved',2)).status,200);
  const result=await post(`${base}/results`,{result:'awarded',note:'Resultado informado por el usuario'},alice);assert.equal(result.status,201);
  const secondProject=(await (await post('/api/projects',{title:'Proyecto B'},alice)).json()).project;
  const secondBase=`/api/projects/${secondProject.id}/submission-tracking`;
  const secondState=await (await request(secondBase,{headers:{cookie:alice}})).json();
  assert.deepEqual(secondState.requests,[]);assert.deepEqual(secondState.results,[]);
  assert.equal((await post(`${secondBase}/results`,{result:'not_awarded',note:'Solo proyecto B'},alice)).status,201);
  const state=await(await request(base,{headers:{cookie:alice}})).json();assert.equal(state.requests.find(value=>value.id===item.id).status,'resolved');assert.equal(state.requests.find(value=>value.id===item.id).version,3);assert.equal(state.results.length,1);assert.equal(state.results[0].result,'awarded');assert.equal((await(await request(`/api/projects/${projectId}/workflow`,{headers:{cookie:alice}})).json()).stage,'evaluating');
  await request(`/api/projects/${projectId}/workflow/tasks/${item.taskId}`,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({version:1})});assert.equal((await(await request(base,{headers:{cookie:alice}})).json()).requests.find(value=>value.id===item.id).taskAvailable,false);
  await DB.prepare("CREATE TRIGGER fail_submission BEFORE INSERT ON project_submission_requests BEGIN SELECT RAISE(ABORT, 'test'); END").run();const failed=await post(`${base}/requests`,{kind:'observation',title:'No debe quedar tarea',dueDate:'',note:'',createTask:true},alice);assert.equal(failed.status,500);assert.equal((await(await request(`/api/projects/${projectId}/workflow/tasks`,{headers:{cookie:alice}})).json()).items.length,0);
  await DB.prepare('DROP TRIGGER fail_submission').run();const payload={kind:'observation',title:'Reintento seguro',dueDate:'',note:'',createTask:true},duplicate=await Promise.all([post(`${base}/requests`,payload,alice,undefined,'request-key'),post(`${base}/requests`,payload,alice,undefined,'request-key')]);assert.deepEqual(duplicate.map(x=>x.status).sort(),[200,201]);const copies=await Promise.all(duplicate.map(x=>x.json()));assert.equal(copies[0].item.id,copies[1].item.id);assert.equal((await(await request(`/api/projects/${projectId}/workflow/tasks`,{headers:{cookie:alice}})).json()).items.length,1);assert.equal((await post(`${base}/requests`,{...payload,title:'Distinto'},alice,undefined,'request-key')).status,409);
  const resultPayload={result:'other',note:'Revisión'},firstResult=await post(`${base}/results`,resultPayload,alice,undefined,'result-key'),secondResult=await post(`${base}/results`,resultPayload,alice,undefined,'result-key');assert.equal(firstResult.status,201);assert.equal(secondResult.status,200);assert.equal((await firstResult.json()).item.id,(await secondResult.json()).item.id);assert.equal((await post(`${base}/results`,{...resultPayload,note:'Diferente'},alice,undefined,'result-key')).status,409);
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
