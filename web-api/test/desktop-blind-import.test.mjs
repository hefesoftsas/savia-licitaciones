import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {importDesktopBlindTask} from '../src/desktop-blind-import.js';

const hash=data=>createHash('sha256').update(data).digest('hex');
test('recupera revisiones privadas, remapea vínculos y respeta eliminaciones y reintentos',{timeout:30000},async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'blind-restore'},r2Buckets:['FILES']}));
 try{
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');
  for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  for(const id of ['alice','bob'])await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind(id,id,`${id}@example.com`).run();
  await DB.prepare('INSERT INTO projects VALUES(?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  await DB.prepare('INSERT INTO desktop_plan_imports VALUES(?,?,?,?,?,?)').bind('alice','request','hash','p','mutation','2026').run();
  await DB.prepare('INSERT INTO desktop_plan_file_imports VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind('alice','request',hash('original'),'new-file','p','hash','oferta.docx','application/octet-stream',1,'source','mutation','2026').run();
  await DB.prepare('INSERT INTO project_files VALUES(?,?,?,?,?,?,?)').bind('new-file','p','oferta.docx','application/octet-stream','source',1,'2026').run();
  const inspect=Buffer.from(JSON.stringify({sourceFile:{id:'original',name:'oferta.docx'},groups:[],summary:{total:0}}));
  const meta={id:'inspection',kind:'blind-check.inspect',state:'succeeded',payload:{fileIds:['original']},result:{artifactId:'old'},createdAt:'2026',updatedAt:'2026',artifact:{size:inspect.length,sha256:hash(inspect)},report:null};
  const send=async(task,artifact,report,owner='alice')=>{const form=new FormData();form.set('metadata',JSON.stringify(task));if(artifact)form.set('artifact',new Blob([artifact]),'artifact');if(report)form.set('report',new Blob([report]),'report');return importDesktopBlindTask(new Request('http://localhost/import',{method:'POST',body:form}),{DB,FILES},{ownerId:owner},'request',hash(task.id));};
  assert.equal((await send(meta,inspect,null,'bob')).status,404);
  const [first,second]=await Promise.all([send(meta,inspect),send(meta,inspect)]);assert.deepEqual([first.status,second.status].sort(),[200,201]);
  const jobId=(await first.json()).jobId;assert.equal((await second.json()).jobId,jobId);
  const job=await DB.prepare('SELECT payload_json,result_json FROM jobs WHERE id=?').bind(jobId).first();assert.deepEqual(JSON.parse(job.payload_json).fileIds,['new-file']);
  const stored=await DB.prepare('SELECT object_key FROM job_artifacts WHERE job_id=?').bind(jobId).first();assert.equal((await(await FILES.get(stored.object_key)).json()).sourceFile.id,'new-file');
  const bytes=Buffer.from([0x50,0x4b,0x03,0x04,0x55]),report=Buffer.from('{"after":{"groups":[]}}');
  const fix={id:'fix',kind:'blind-check.fix-report',state:'succeeded',payload:{fileIds:['original'],inspectionJobId:'inspection',reportVersion:1},result:{inspectionJobId:'inspection'},createdAt:'2026',updatedAt:'2026',artifact:{size:bytes.length,sha256:hash(bytes)},report:{size:report.length,sha256:hash(report)},parentExpected:true};
  assert.equal((await send({...fix,id:'early',payload:{...fix.payload,inspectionJobId:'not-yet'}},bytes,report)).status,409);
  const fixed=await send(fix,bytes,report);assert.equal(fixed.status,201);const fixId=(await fixed.json()).jobId;
  const fixedJob=await DB.prepare('SELECT payload_json,result_json FROM jobs WHERE id=?').bind(fixId).first();assert.equal(JSON.parse(fixedJob.payload_json).inspectionJobId,jobId);assert.equal(JSON.parse(fixedJob.result_json).inspectionJobId,jobId);
  const missing={id:'missing',kind:'blind-check.inspect',state:'interrupted',payload:{fileIds:['deleted-file']},result:null,createdAt:'2026',updatedAt:'2026',artifact:null,report:null};const missingResponse=await send(missing);assert.equal(missingResponse.status,201);const missingJob=await DB.prepare('SELECT payload_json,state FROM jobs WHERE id=?').bind((await missingResponse.json()).jobId).first();assert.equal(missingJob.state,'interrupted');assert.notEqual(JSON.parse(missingJob.payload_json).fileIds[0],'deleted-file');
  const interrupted={...meta,id:'staging-expired'},stagingForm=new FormData();stagingForm.set('metadata',JSON.stringify(interrupted));stagingForm.set('artifact',new Blob([inspect]),'artifact');
  const interruptedFiles={put:async(key,value)=>{await FILES.put(key,value);await DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE object_key=?").bind(key).run();},delete:(...args)=>FILES.delete(...args)};
  const interruptedResponse=await importDesktopBlindTask(new Request('http://localhost/import',{method:'POST',body:stagingForm}),{DB,FILES:interruptedFiles},{ownerId:'alice'},'request',hash(interrupted.id));
  assert.equal(interruptedResponse.status,409);assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM desktop_blind_task_imports WHERE source_key=?').bind(hash(interrupted.id)).first()).count,0);
  const changed={...meta,result:{message:'different'}};assert.equal((await send(changed,inspect)).status,409);
  await DB.prepare("UPDATE job_artifacts SET deleted_at='2026',storage_deleted_at='2026' WHERE job_id=?").bind(jobId).run();assert.equal((await send(meta,inspect)).status,410);
  const badReport={...fix,id:'bad',report:{...fix.report,sha256:'0'.repeat(64)}};assert.equal((await send(badReport,bytes,report)).status,400);
 }finally{await worker.dispose();}
});
