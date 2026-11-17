import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {runnerProjectCapture} from '../src/project-capture-route.js';
import {importDesktopRejectionDraft} from '../src/desktop-rejection-draft-import.js';

test('captura el borrador por cuenta y lo recupera sin sobrescribir ediciones',{timeout:30000},async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'rejection-draft-snapshot'},r2Buckets:['FILES']}));
 try{
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  for(const owner of ['alice','bob'])await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind(owner,owner,`${owner}@example.com`).run();
  await DB.prepare('INSERT INTO projects (id,owner_id,title,created_at) VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();await DB.prepare('INSERT INTO projects (id,owner_id,title,created_at) VALUES (?,?,?,?)').bind('target','bob','Destino','2026').run();
  await DB.prepare('INSERT INTO desktop_plan_imports VALUES(?,?,?,?,?,?)').bind('bob','req','hash','target','mutation','2026').run();
  const draft={criteria:'Experiencia',custom:'Fechas',options:{rejectionCheck:true,typoCheck:false,logicCheck:true},updatedAt:'2026'};await DB.prepare('INSERT INTO rejection_drafts VALUES(?,?,?,?,?,?)').bind('p',draft.criteria,draft.custom,JSON.stringify(draft.options),1,draft.updatedAt).run();
  const env={DB,FILES},capture=()=>runnerProjectCapture(new Request('http://localhost/capture'),env,{ownerId:'alice'},'p');
  const first=await(await capture()).json();assert.deepEqual(first.rejectionDraft,draft);assert.equal((await runnerProjectCapture(new Request('http://localhost/capture'),env,{ownerId:'bob'},'p')).status,404);
  await DB.prepare('UPDATE rejection_drafts SET version=version+1 WHERE project_id=?').bind('p').run();assert.notEqual((await(await capture()).json()).revision,first.revision);
  const send=(owner,input)=>importDesktopRejectionDraft(new Request('http://localhost/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),env,{ownerId:owner},'req');
  assert.equal((await send('alice',draft)).status,404);assert.equal((await send('bob',{...draft,options:{rejectionCheck:true}})).status,400);
  const responses=await Promise.all([send('bob',draft),send('bob',draft)]);assert.deepEqual(responses.map(x=>x.status).sort(),[200,201]);
  await DB.prepare('UPDATE rejection_drafts SET criteria=?,version=2 WHERE project_id=?').bind('Editado','target').run();assert.equal((await send('bob',draft)).status,200);assert.equal((await DB.prepare('SELECT criteria FROM rejection_drafts WHERE project_id=?').bind('target').first()).criteria,'Editado');
  assert.equal((await send('bob',{...draft,criteria:'Diferente'})).status,409);
  await DB.prepare('DELETE FROM rejection_drafts WHERE project_id=?').bind('target').run();assert.equal((await send('bob',draft)).status,200);assert.equal(await DB.prepare('SELECT * FROM rejection_drafts WHERE project_id=?').bind('target').first(),null);
 }finally{await worker.dispose();}
});
