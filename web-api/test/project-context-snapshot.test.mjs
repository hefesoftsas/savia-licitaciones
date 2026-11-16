import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runnerProjectCapture } from '../src/project-capture-route.js';

test('captura hechos y análisis del proyecto y detecta cambios',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'context-snapshot'},r2Buckets:['FILES']}));
 try {
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();
  await DB.prepare('INSERT INTO projects VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  await DB.prepare('INSERT INTO project_global_facts(project_id,revision,groups_json,snapshot_json,updated_at,mode) VALUES (?,?,?,?,?,?)').bind('p',1,JSON.stringify([{id:'fact',title:'Hecho',content:'Contenido'}]),'{}','2026','manual').run();
  await DB.prepare('INSERT INTO project_technical_analyses(project_id,category,revision,content,review_id,source_file_ids_json,source_snapshot_json,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind('p','project-overview',1,'Análisis anterior','review','[]','{}','2026').run();
  const env={DB,FILES},req=()=>new Request('http://localhost/capture'),runner={ownerId:'alice'};
  const first=await(await runnerProjectCapture(req(),env,runner,'p')).json();
  assert.equal(first.context.facts.groups[0].content,'Contenido');assert.equal(first.context.analyses[0].category,'project-overview');
  await DB.prepare('UPDATE project_global_facts SET groups_json=? WHERE project_id=?').bind('[]','p').run();
  assert.notEqual((await(await runnerProjectCapture(req(),env,runner,'p')).json()).revision,first.revision);
  assert.equal((await runnerProjectCapture(req(),env,{ownerId:'bob'},'p')).status,404);
 } finally {await worker.dispose();}
});
