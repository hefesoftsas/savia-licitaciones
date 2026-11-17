import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runnerProjectCapture } from '../src/project-capture-route.js';

test('captura consultas como historial sin credenciales ni tareas activas',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'chat-snapshot'},r2Buckets:['FILES']}));
 try {
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();
  await DB.prepare('INSERT INTO projects (id,owner_id,title,created_at) VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  const insert=DB.prepare('INSERT INTO jobs(id,project_id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at,result_json) VALUES (?,?,?,?,?,?,?,?,?,?)');
  await insert.bind('job-1','p','alice','tender-chat.send','req-1',JSON.stringify({question:'¿Qué plazo?',credentialId:'secret-credential'}),'succeeded','2026-01','2026-02',JSON.stringify({answer:'Treinta días',followUps:['¿Desde cuándo?']})).run();
  await insert.bind('job-2','p','alice','tender-chat.send','req-2',JSON.stringify({question:'¿Cuál es el valor?'}),'running','2026-03','2026-03',null).run();
  const imported=[{id:'old',role:'user',content:'Consulta anterior',status:'complete',createdAt:'2025',followupsJson:null}];
  await DB.prepare('INSERT INTO desktop_chat_imports VALUES (?,?,?,?,?,?)').bind('alice','import','p','hash',JSON.stringify(imported),'2025').run();
  const env={DB,FILES},request=new Request('http://localhost/capture'),response=await runnerProjectCapture(request,env,{ownerId:'alice'},'p'),snapshot=await response.json();
  assert.deepEqual(snapshot.chat.map(item=>item.content),['Consulta anterior','¿Qué plazo?','Treinta días','¿Cuál es el valor?','']);
  assert.equal(snapshot.chat.at(-1).status,'interrupted');assert.deepEqual(JSON.parse(snapshot.chat[2].followupsJson).questions,['¿Desde cuándo?']);
  assert.doesNotMatch(JSON.stringify(snapshot),/secret-credential/);
  await DB.prepare('UPDATE jobs SET result_json=? WHERE id=?').bind(JSON.stringify({answer:'Cuarenta días'}),'job-1').run();
  assert.notEqual((await(await runnerProjectCapture(request,env,{ownerId:'alice'},'p')).json()).revision,snapshot.revision);
  assert.equal((await runnerProjectCapture(request,env,{ownerId:'bob'},'p')).status,404);
 } finally {await worker.dispose();}
});
