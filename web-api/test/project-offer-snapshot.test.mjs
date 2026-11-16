import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runnerProjectCapture } from '../src/project-capture-route.js';

test('captura el borrador económico del propietario y detecta cambios',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'offer-snapshot'},r2Buckets:['FILES']}));
 try {
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();
  await DB.prepare('INSERT INTO projects VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  const draft={currency:'COP',budget:'1000',items:[{id:'a',name:'Servicio',quantity:'2',price:'100',rate:'0',cost:'50'}]};
  await DB.prepare('INSERT INTO economic_offer_drafts VALUES (?,?,?,?)').bind('p',JSON.stringify(draft),1,'2026').run();
  const env={DB,FILES},req=new Request('http://localhost/capture');
  const snapshot=await(await runnerProjectCapture(req,env,{ownerId:'alice'},'p')).json();assert.deepEqual(snapshot.offer,{draft,updatedAt:'2026'});
  await DB.prepare('UPDATE economic_offer_drafts SET version=2 WHERE project_id=?').bind('p').run();
  assert.notEqual((await(await runnerProjectCapture(req,env,{ownerId:'alice'},'p')).json()).revision,snapshot.revision);
  assert.equal((await runnerProjectCapture(req,env,{ownerId:'bob'},'p')).status,404);
 } finally {await worker.dispose();}
});
