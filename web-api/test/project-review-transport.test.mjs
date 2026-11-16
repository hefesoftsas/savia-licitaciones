import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {prepareReviewTransport,openReviewSource} from '../src/project-review-transport.js';
import {runnerReviewCapture} from '../src/project-review-capture.js';
const hash=value=>createHash('sha256').update(value).digest('hex');

test('captura informes de duplicados, rechazo y hallazgos retirados por cuenta',{timeout:30000},async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'review-transport'},r2Buckets:['FILES']}));
 try{
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  for(const id of ['alice','bob'])await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind(id,id,`${id}@example.com`).run();await DB.prepare('INSERT INTO projects VALUES(?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  const job=async(id,kind,state,result)=>DB.prepare('INSERT INTO jobs(id,project_id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at,result_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,'p','alice',kind,id,JSON.stringify({fileIds:['f'],tenderFileIds:[],bidFileIds:['f']}),state,'2026','2026',result?JSON.stringify(result):null).run();
  await job('duplicate','duplicate-check.analyze','succeeded',{analysisStatus:'success'});await job('reject','rejection-check.analyze','succeeded',{analysisStatus:'success'});await job('extract','rejection-check.extract','succeeded',{criteria:'Causales revisables'});await job('active','rejection-check.analyze','running',null);
  const duplicate=Buffer.from('{"status":"success","sourceFiles":[]}'),reject=Buffer.from('{"rejectionCheckResult":{"findings":[{"id":"one"},{"id":"two"}]}}');
  for(const [id,data] of [['duplicate',duplicate],['reject',reject]]){await FILES.put(id,data);await DB.prepare('INSERT INTO job_artifacts(id,job_id,object_key,sha256,size,created_at) VALUES(?,?,?,?,?,?)').bind(`artifact-${id}`,id,id,hash(data),data.length,'2026').run();}
  await DB.prepare('INSERT INTO rejection_finding_removals VALUES(?,?,?,?,?)').bind('reject','alice','rejection','one','2026').run();
  const env={DB,FILES},snapshot=await prepareReviewTransport(env,'alice','p');assert.equal(await prepareReviewTransport(env,'bob','p'),null);assert.equal(snapshot.tasks.length,4);
  const rejected=snapshot.tasks.find(item=>item.id==='reject');assert.deepEqual(rejected.removals,[{section:'rejection',findingId:'one',createdAt:'2026'}]);assert.equal(snapshot.tasks.find(item=>item.id==='active').state,'interrupted');assert.equal(snapshot.tasks.find(item=>item.id==='extract').result.criteria,'Causales revisables');
  assert.equal(await openReviewSource(env,'bob','p','reject',rejected.artifact.etag,rejected.artifact.version),null);assert.equal(await new Response(await openReviewSource(env,'alice','p','reject',rejected.artifact.etag,rejected.artifact.version)).text(),reject.toString());
  const query=`?etag=${encodeURIComponent(rejected.artifact.etag)}&version=${rejected.artifact.version}`,req=new Request(`http://localhost/capture${query}`);
  assert.equal((await runnerReviewCapture(req,env,{ownerId:'bob'},'p')).status,404);assert.equal((await runnerReviewCapture(req,env,{ownerId:'alice'},'p','reject')).status,200);
  await DB.prepare('INSERT INTO rejection_finding_removals VALUES(?,?,?,?,?)').bind('reject','alice','rejection','two','2026').run();await assert.rejects(snapshot.assertUnchanged());await assert.rejects(openReviewSource(env,'alice','p','reject',rejected.artifact.etag,rejected.artifact.version));
  assert.equal((await runnerReviewCapture(req,env,{ownerId:'alice'},'p','reject')).status,409);
  const updated=await prepareReviewTransport(env,'alice','p');assert.notDeepEqual(updated.revisionData,snapshot.revisionData);
  await FILES.put('reject','cambiado');await assert.rejects(updated.assertUnchanged());await assert.rejects(prepareReviewTransport(env,'alice','p'));
  await FILES.put('reject',reject);await DB.prepare("UPDATE job_artifacts SET deleted_at='2026' WHERE job_id='reject'").run();await assert.rejects(prepareReviewTransport(env,'alice','p'));
  await DB.prepare("UPDATE job_artifacts SET storage_deleted_at='2026' WHERE job_id='reject'").run();assert.ok(!(await prepareReviewTransport(env,'alice','p')).tasks.some(item=>item.id==='reject'));
 }finally{await worker.dispose();}
});
