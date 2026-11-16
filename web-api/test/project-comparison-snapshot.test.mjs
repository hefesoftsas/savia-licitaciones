import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {runnerProjectCapture} from '../src/project-capture-route.js';

test('captura comparaciones y sus fuentes solo para el dueño y detecta cambios',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'comparison-snapshot'},r2Buckets:['FILES']}));
 try{const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();await DB.prepare('INSERT INTO projects VALUES(?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  const snapshot={factId:'fact',label:'Indicador',value:'1',page:1,title:'Requisito',source:'pliego',operator:'>=',threshold:'1',interpretedValue:'1',documentsHash:'hash',updatedAt:'2026',certificateName:'rup.pdf',issuedOn:'2026'};
  await FILES.put('pdf','%PDF-ejemplo');await DB.prepare('INSERT INTO imported_rup_comparisons VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind('comparison','alice','p','req','source','old-requirement',JSON.stringify(snapshot),'hash','pdf',null,'mutation','2026').run();
  const env={DB,FILES},request=new Request('http://localhost/capture'),first=await(await runnerProjectCapture(request,env,{ownerId:'alice'},'p')).json();assert.equal(first.comparisons.length,1);assert.equal(first.comparisons[0].id,'comparison');assert.equal(first.comparisons[0].requirementId,null);assert.equal(first.comparisons[0].source.size,12);
  assert.equal((await runnerProjectCapture(request,env,{ownerId:'bob'},'p')).status,404);
  assert.equal((await runnerProjectCapture(request,env,{ownerId:'alice'},'p','comparison','comparisons')).status,409);
  const source=first.comparisons[0].source,oldRequest=new Request(`http://localhost/capture?etag=${encodeURIComponent(source.etag)}&version=${source.version}`);
  assert.equal(await (await runnerProjectCapture(oldRequest,env,{ownerId:'alice'},'p','comparison','comparisons')).text(),'%PDF-ejemplo');
  await FILES.put('pdf','%PDF-cambio');assert.equal((await runnerProjectCapture(oldRequest,env,{ownerId:'alice'},'p','comparison','comparisons')).status,409);assert.notEqual((await(await runnerProjectCapture(request,env,{ownerId:'alice'},'p')).json()).revision,first.revision);
 }finally{await worker.dispose();}
});
