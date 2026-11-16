import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBidEvaluationHandler} from '../bid-evaluation.mjs';

test('evalúa una oferta con citas verificadas y conserva fuentes ilegibles',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-bid-eval-'));let task;
 try{
  const files={t:{name:'pliego.txt',contentType:'text/plain',bytes:Buffer.from('Soporte hasta 40 puntos.')},b:{name:'oferta.txt',contentType:'text/plain',bytes:Buffer.from('Atención en cuatro horas.')},u:{name:'ilegible.txt',contentType:'text/plain',bytes:Buffer.from('')}};
  const handler=createBidEvaluationHandler({tempRoot:root,createAiService:({configStore})=>{const c=configStore.load();assert.equal(c.text_model_provider,'anthropic-api');assert.equal(c.base_url,'https://api.anthropic.com');assert.equal(c.web_runner_anthropic_native,true);assert.equal(c.reasoning_effort,'');return {};},createRuntime:()=>({runTask:async input=>{task=input;return {assistant_text:JSON.stringify({criteria:[{name:'Soporte',tenderSourceId:'t',tenderQuote:'Soporte hasta 40 puntos',maxPoints:40,bidSourceId:'b',bidQuote:'Atención en cuatro horas',proposedPoints:20,explanation:'Revisar'} ,{name:'Inventado',tenderSourceId:'t',tenderQuote:'No aparece',maxPoints:10}]})};},close:async()=>{}})});
  const payload={fileIds:['t','b','u'],tenderFileIds:['t'],bidFileIds:['b','u'],language:'es',dataProcessingConsent:true};
  const context={job:{id:'job'},signal:new AbortController().signal,getFileInfo:async id=>files[id],getCredential:async()=>({provider:'anthropic-api',model:'fixture',secret:'sk-ant-api-fixture'})};
  const report=await handler(payload,context);assert.equal(report.result.criteria.length,1);assert.equal(report.result.criteria[0].proposedPoints,20);assert.equal(report.result.criteria[0].reviewRequired,true);assert.equal(report.result.discardedCount,1);assert.deepEqual(report.result.unreadableDocuments,['u']);assert.equal(report.result.total,null);assert.equal(report.tenderSources[0].text,'Soporte hasta 40 puntos.');assert.equal(task.secop_safe_tools,true);assert.deepEqual(await readdir(root),[]);
  await assert.rejects(handler({...payload,dataProcessingConsent:false},context),/consentimiento/i);
 }finally{await rm(root,{recursive:true,force:true});}
});
