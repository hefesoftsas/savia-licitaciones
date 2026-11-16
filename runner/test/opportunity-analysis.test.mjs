import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as analysis from '../opportunity-analysis.mjs';

test('Pi recibe la captura autorizada y devuelve únicamente identificadores consultados',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-opportunities-'));let checked=0,closed=0;
 try{
  assert.equal(typeof analysis.createOpportunityAnalysisHandler,'function');
  const handler=analysis.createOpportunityAnalysisHandler({tempRoot:root,createAiService:({configStore})=>{const c=configStore.load();assert.equal(c.text_model_provider,'anthropic-api');assert.equal(c.base_url,'https://api.anthropic.com');assert.equal(c.web_runner_anthropic_native,true);assert.equal(c.reasoning_effort,'');return {};},createRuntime:()=>({async runTask(task){assert.deepEqual(task.active_tools,['read','grep','find','ls']);const input=JSON.parse(task.files[0].content);assert.deepEqual(input.profile,{industry:'Software',reviewedRup:[]});assert.deepEqual(input.candidates,[{id:'secop-ii:1',title:'Software'}]);return {assistant_text:'```json\n'+JSON.stringify([{id:'secop-ii:1',reason:'  Pertinente ',checks:' Revisar pliego '},{id:'falso',reason:'x',checks:'x'},{id:'secop-ii:1',reason:'duplicado',checks:'x'}])+'\n```'};},async close(){closed++;}})});
  const result=await handler({language:'es',dataProcessingConsent:true},{signal:new AbortController().signal,getOpportunitySources:async()=>({profile:{industry:'Software',reviewedRup:[]},shortlist:[{id:'secop-ii:1',title:'Software'}]}),getCredential:async()=>({provider:'anthropic-api',model:'model',secret:'sk-ant-api-fixture'}),assertOpportunitySources:async()=>{checked++;}});
  assert.deepEqual(result,{recommendations:[{id:'secop-ii:1',reason:'Pertinente',checks:'Revisar pliego'}]});assert.equal(checked,1);assert.equal(closed,1);assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('no lee fuentes ni credenciales sin consentimiento y descarta análisis obsoletos',async()=>{
 let read=false;const handler=analysis.createOpportunityAnalysisHandler({createAiService:()=>({}),createRuntime:()=>({runTask:async()=>({assistant_text:'[]'}),close:async()=>{}})});
 await assert.rejects(handler({language:'es',dataProcessingConsent:false},{getOpportunitySources:async()=>{read=true;}}),/consentimiento/i);assert.equal(read,false);
 await assert.rejects(handler({language:'es',dataProcessingConsent:true},{getOpportunitySources:async()=>({profile:{reviewedRup:[]},shortlist:[{id:'secop-i:1'}]}),getCredential:async()=>({provider:'opencode-go',model:'m',secret:'s'}),assertOpportunitySources:async()=>{throw Object.assign(new Error('stale'),{status:409});}}),/fuentes cambiaron/i);
});

test('el runtime Pi lee la captura y no envía la credencial en el contenido', {timeout:30000}, async()=>{
 let calls=0,sawInput=false,sawSecret=false; const stages=[];
 const handler=analysis.createOpportunityAnalysisHandler({createAiService:({configStore})=>({getConfig:()=>configStore.load(),getTextQueueStatus:()=>({active:0,queued:0,limit:1}),async runAgentChatCompletion(request){calls++;const body={...request.body,stream:false},ctx={config:configStore.load(),requestBody:body,requestId:`opportunity-${calls}`};request.onRequestStart?.(ctx);const content=JSON.stringify(body.messages);sawInput ||= content.includes('Servicios de software');sawSecret ||= content.includes('SECRET-PRIVATE');const message=calls===1?{role:'assistant',content:null,tool_calls:[{id:'read-input',type:'function',function:{name:'read',arguments:JSON.stringify({path:'input.json'})}}]}:{role:'assistant',content:JSON.stringify([{id:'secop-ii:42',reason:'Es software',checks:'Revisar requisitos'}])};return request.consumeResponse(new Response(JSON.stringify({id:`opportunity-${calls}`,object:'chat.completion',model:'fixture',choices:[{index:0,message,finish_reason:calls===1?'tool_calls':'stop'}]}),{headers:{'content-type':'application/json'}}),ctx);}})});
 const result=await handler({language:'es',dataProcessingConsent:true},{reportProgress:stage=>stages.push(stage),signal:new AbortController().signal,getOpportunitySources:async()=>({profile:{industry:'Software',reviewedRup:[]},shortlist:[{id:'secop-ii:42',title:'Servicios de software'}]}),getCredential:async()=>({provider:'opencode-go',model:'fixture',secret:'SECRET-PRIVATE'}),assertOpportunitySources:async()=>{}});
 assert.ok(stages.includes('reading'));assert.ok(stages.includes('generating'));assert.ok(stages.every(stage=>['preparing','reading','generating'].includes(stage)));
 assert.equal(result.recommendations[0].id,'secop-ii:42');assert.ok(calls>=2);assert.equal(sawInput,true);assert.equal(sawSecret,false);
});

test('al cancelar se limpia el directorio temporal y se cierra el runtime',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-opportunity-cancel-'));let closed=false;const abort=new AbortController();
 try{const handler=analysis.createOpportunityAnalysisHandler({tempRoot:root,createAiService:()=>({}),createRuntime:()=>({runTask:async task=>{abort.abort(new Error('cancelado'));task.signal.throwIfAborted();},close:async()=>{closed=true;}})});
 await assert.rejects(handler({language:'es',dataProcessingConsent:true},{signal:abort.signal,getOpportunitySources:async()=>({profile:{reviewedRup:[]},shortlist:[{id:'secop-i:1'}]}),getCredential:async()=>({provider:'opencode-go',model:'m',secret:'s'})}),/cancelado/);assert.equal(closed,true);assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Pi lee la captura autorizada mediante OpenAI API sin incluir la clave', {timeout:30000}, async()=>{
 const originalFetch=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,options={})=>{
   const target=String(url);if(/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):/.test(target))return originalFetch(url,options);
   assert.equal(target,'https://api.openai.com/v1/chat/completions');assert.equal(new Headers(options.headers).get('authorization'),'Bearer fixture-openai');
   calls.push(JSON.parse(options.body));const message=calls.length===1?{role:'assistant',content:null,tool_calls:[{id:'read-input',type:'function',function:{name:'read',arguments:JSON.stringify({path:'input.json'})}}]}:{role:'assistant',content:JSON.stringify([{id:'secop-ii:42',reason:'Es software',checks:'Revisar requisitos'}])};
   return new Response(JSON.stringify({id:`opportunity-${calls.length}`,object:'chat.completion',model:'fixture',choices:[{index:0,message,finish_reason:calls.length===1?'tool_calls':'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}),{headers:{'content-type':'application/json'}});
  };
  const result=await analysis.createOpportunityAnalysisHandler()({language:'es',dataProcessingConsent:true},{signal:new AbortController().signal,getOpportunitySources:async()=>({profile:{industry:'Software',reviewedRup:[]},shortlist:[{id:'secop-ii:42',title:'Servicios de software'}]}),getCredential:async()=>({provider:'openai-api',model:'fixture',secret:'fixture-openai'}),assertOpportunitySources:async()=>{}});
  assert.equal(result.recommendations[0].id,'secop-ii:42');assert.ok(calls.length>=2);assert.ok(JSON.stringify(calls[1].messages).includes('Servicios de software'));assert.ok(!JSON.stringify(calls).includes('fixture-openai'));assert.equal('reasoning_effort' in calls[0],false);
 }finally{globalThis.fetch=originalFetch;}
});

test('rechaza respuestas ilegibles o compuestas solo por procesos no consultados',async()=>{
 for(const text of ['no es JSON',JSON.stringify([{id:'secop-i:inventado',reason:'Motivo',checks:'Revisar'}])]){
  const handler=analysis.createOpportunityAnalysisHandler({createAiService:()=>({}),createRuntime:()=>({runTask:async()=>({assistant_text:text}),close:async()=>{}})});
  await assert.rejects(handler({language:'es',dataProcessingConsent:true},{getOpportunitySources:async()=>({profile:{reviewedRup:[]},shortlist:[{id:'secop-i:real'}]}),getCredential:async()=>({provider:'opencode-go',model:'m',secret:'s'}),assertOpportunitySources:async()=>{}}),/legible|no corresponden/i);
 }
});
