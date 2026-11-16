import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { importDesktopPlan } from '../src/desktop-plan-import.js';

test('conserva referencias de conocimiento autorizadas e impide las de otra cuenta',async()=>{
  const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'import-knowledge'},r2Buckets:['FILES']}));
  try {
    const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');
    for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
    for(const id of ['alice','bob'])await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind(id,id,`${id}@example.com`).run();
    await DB.prepare('INSERT INTO knowledge_folders(id,owner_id,name,created_at) VALUES (?,?,?,?)').bind('folder','alice','Fuentes','2026').run();
    await DB.prepare('INSERT INTO knowledge_documents(id,folder_id,owner_id,name,content_type,object_key,size,created_at) VALUES (?,?,?,?,?,?,?,?)').bind('doc','folder','alice','doc.pdf','application/pdf','key',4,'2026').run();
    await DB.prepare('INSERT INTO knowledge_indices VALUES (?,?,?,?,?)').bind('doc','alice',1,'job','mutation').run();
    await DB.prepare('INSERT INTO knowledge_entries VALUES (?,?,?,?,?,?,?)').bind('entry','doc','alice','Título','Resumen','Cita',0).run();
    const node={id:'node',parentId:null,sortOrder:0,title:'Capítulo',description:'',content:'',contentMode:'manual-fill',contentModeNote:'',sourceRequirementId:'',sourceRequirementTitle:'',knowledgeItemIds:['entry']};
    const req=()=>new Request('http://localhost/import',{method:'POST',headers:{'content-type':'application/json','idempotency-key':'req'},body:JSON.stringify({title:'Proyecto',nodes:[node]})});
    assert.equal((await importDesktopPlan(req(),{DB,FILES},{ownerId:'bob'})).status,409);
    const created=await importDesktopPlan(req(),{DB,FILES},{ownerId:'alice'});assert.equal(created.status,201);
    const {project}=await created.json(), saved=await DB.prepare('SELECT knowledge_item_ids_json FROM project_technical_plan_nodes WHERE project_id=?').bind(project.id).first();
    assert.deepEqual(JSON.parse(saved.knowledge_item_ids_json),['entry']);
    assert.equal((await importDesktopPlan(req(),{DB,FILES},{ownerId:'alice'})).status,200);
  } finally {await worker.dispose();}
});
