import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runnerProjectCapture } from '../src/project-capture-route.js';

test('captura el proceso SECOP, alertas y correspondencia de documentos por cuenta',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'secop-snapshot'},r2Buckets:['FILES']}));
 try {
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();
  await DB.prepare('INSERT INTO projects VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  await DB.prepare('INSERT INTO project_secop VALUES (?,?,?,?,?)').bind('p','alice','secop-ii','process',JSON.stringify({id:'process',source:'secop-ii',title:'Proceso'})).run();
  await DB.prepare('INSERT INTO secop_watch_baselines_web VALUES (?,?,?,?,?,?,?,?)').bind('p','alice',JSON.stringify({status:'open'}),JSON.stringify([{id:'d',name:'Pliego'}]),'2026','',1,'mutation').run();
  await DB.prepare('INSERT INTO secop_watch_alerts_web VALUES (?,?,?,?,?,?,?,?,?)').bind('alert','p','alice','Proceso','status','"old"','"new"','2026',1).run();
  await FILES.put('key','data');
  await DB.prepare('INSERT INTO project_files VALUES (?,?,?,?,?,?,?)').bind('file','p','pliego.pdf','application/pdf','key',4,'2026').run();
  await DB.prepare('INSERT INTO project_secop_files VALUES (?,?,?)').bind('p','d','file').run();
  const req=new Request('http://localhost/capture'),env={DB,FILES};
  const snapshot=await(await runnerProjectCapture(req,env,{ownerId:'alice'},'p')).json();
  assert.equal(snapshot.secop.process.id,'process');assert.equal(snapshot.secop.alerts[0].reviewed,true);
  assert.deepEqual(snapshot.secop.links,[{kind:'document',documentId:'d',fileId:'file'}]);
  await DB.prepare('UPDATE secop_watch_alerts_web SET reviewed=0 WHERE id=?').bind('alert').run();
  assert.notEqual((await(await runnerProjectCapture(req,env,{ownerId:'alice'},'p')).json()).revision,snapshot.revision);
  assert.equal((await runnerProjectCapture(req,env,{ownerId:'bob'},'p')).status,404);
 } finally {await worker.dispose();}
});
