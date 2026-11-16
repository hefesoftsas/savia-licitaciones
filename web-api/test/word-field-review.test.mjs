import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {wordFieldReview} from '../src/word-field-review.js';

test('guarda y recupera 216 respuestas por documento y cuenta',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'reviews'}}));
 try{
  const DB=await mf.getD1Database('DB');
  for(const sql of ['CREATE TABLE jobs(id TEXT PRIMARY KEY,project_id TEXT,owner_id TEXT,kind TEXT,state TEXT)','CREATE TABLE job_artifacts(job_id TEXT,edit_revision INTEGER,deleted_at TEXT)','CREATE TABLE word_field_reviews(job_id TEXT PRIMARY KEY,owner_id TEXT,state_json TEXT,updated_at TEXT)',"INSERT INTO jobs VALUES('word','project','alice','technical-plan.export-word','succeeded')","INSERT INTO job_artifacts VALUES('word',0,NULL)"])await DB.prepare(sql).run();
  const env={DB,BETTER_AUTH_URL:'http://localhost'}, url='http://localhost/api/projects/project/jobs/word/artifact/field-review';
  const req=(method,body)=>new Request(url,{method,headers:{origin:'http://localhost','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const state={contexts:Array.from({length:216},(_,i)=>`campo ${i}`),rows:Array.from({length:216},(_,id)=>({id,context:`campo ${id}`,question:'',proposal:`respuesta ${id}`,source:''})),finished:true};
  assert.equal((await wordFieldReview(req('PUT',state),env,'alice','project','word')).status,200);
  assert.deepEqual((await (await wordFieldReview(req('GET'),env,'alice','project','word')).json()).review,state);
  assert.equal((await wordFieldReview(req('GET'),env,'bob','project','word')).status,404);
  assert.equal((await wordFieldReview(req('GET'),env,'alice','other','word')).status,404);
 }finally{await mf.dispose();}
});
