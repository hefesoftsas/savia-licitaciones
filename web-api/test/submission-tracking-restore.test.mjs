import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {importSubmissionTrackingItem} from '../src/desktop-submission-tracking-import.js';

const hash=x=>createHash('sha256').update(x).digest('hex');
test('restaura solicitudes y resultados sin duplicar ni recuperar ediciones o eliminaciones',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'submission-restore'}}));
 try{const DB=await worker.getD1Database('DB');for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  for(const owner of ['alice','bob']){await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind(owner,owner,`${owner}@example.test`).run();await DB.prepare('INSERT INTO projects VALUES(?,?,?,?)').bind(`p-${owner}`,owner,'Proyecto','2026').run();await DB.prepare('INSERT INTO desktop_plan_imports VALUES(?,?,?,?,?,?)').bind(owner,'restore','hash',`p-${owner}`,'mutation','2026').run();await DB.prepare('INSERT INTO desktop_workflow_imports VALUES(?,?,?,?,?,?)').bind(owner,'restore',`p-${owner}`,'hash','mutation','2026').run();}
  await DB.prepare("INSERT INTO project_tasks VALUES('task-web','p-alice','Tarea','',0,1,'2026','2026')").run();await DB.prepare("INSERT INTO desktop_task_id_map VALUES('alice','restore','p-alice','task-old','task-web')").run();
  const request={id:'request',kind:'correction',title:'Subsanar',dueDate:'2026-12-01',note:'nota',status:'reviewed',taskId:'task-old',version:2,createdAt:'2026',updatedAt:'2026'},result={id:'result',result:'awarded',note:'resultado',createdAt:'2026'};
  const send=(owner,kind,item,key=hash(item.id))=>importSubmissionTrackingItem(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(item)}),{DB},{ownerId:owner},'restore',kind,key);
  assert.equal((await send('alice','requests',request)).status,201);assert.equal((await send('alice','results',result)).status,201);assert.equal((await send('bob','requests',request)).status,201);
  const alice=await DB.prepare('SELECT * FROM project_submission_requests WHERE project_id=?').bind('p-alice').first(),bob=await DB.prepare('SELECT * FROM project_submission_requests WHERE project_id=?').bind('p-bob').first();assert.equal(alice.task_id,'task-web');assert.notEqual(bob.task_id,'task-web');assert.match(bob.task_id,/^unresolved:/);assert.equal(alice.status,'reviewed');
  await DB.prepare("UPDATE project_submission_requests SET status='resolved' WHERE id=?").bind(alice.id).run();assert.equal((await send('alice','requests',request)).status,200);assert.equal((await DB.prepare('SELECT status FROM project_submission_requests WHERE id=?').bind(alice.id).first()).status,'resolved');
  assert.equal((await send('alice','requests',{...request,title:'Otro'})).status,409);assert.equal((await send('alice','requests',request,hash('other'))).status,400);
  await DB.prepare('DELETE FROM project_submission_requests WHERE id=?').bind(alice.id).run();assert.equal((await send('alice','requests',request)).status,410);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM project_submission_requests WHERE project_id=?').bind('p-alice').first()).n,0);
 }finally{await worker.dispose();}
});
