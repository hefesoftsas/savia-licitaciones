import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createKnowledgeAnalysisHandler } from '../knowledge-analysis.mjs';

test('Pi extrae entradas citadas, descarta citas inventadas y limpia los temporales', async () => {
 const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-knowledge-runner-')); let seen = false, closed = false;
 try {
  const handler = createKnowledgeAnalysisHandler({ temporaryRoot, createAiService:({configStore})=>{const c=configStore.load();assert.equal(c.text_model_provider,'anthropic-api');assert.equal(c.base_url,'https://api.anthropic.com');assert.equal(c.web_runner_anthropic_native,true);assert.equal(c.reasoning_effort,'');return {};}, createRuntime: () => ({ close: async () => { closed = true; }, runTask: async task => {
   seen = task.files.some(file => file.content.includes('Plazo de tres meses'));
   const report = task.validateOutput({ output_content: JSON.stringify({ entries: [{ title: 'Plazo', summary: 'Duración documentada', quote: 'Plazo de tres meses' }, { title: 'Inventado', summary: 'No respaldado', quote: 'cinco años' }] }) });
   assert.equal(report.issues.length, 0); return { validation_result: report.value };
  } }) });
  let checked = 0;
  const context = { job: { id: 'job' }, signal: new AbortController().signal, getKnowledgeFile: async () => ({ name: 'obra.txt', contentType: 'application/octet-stream', bytes: new TextEncoder().encode('Plazo de tres meses para la obra.').buffer }), getCredential: async () => ({ provider:'anthropic-api', model: 'fixture', secret:'sk-ant-api-fixture' }), assertKnowledgeCurrent: async () => { checked++; } };
  await assert.rejects(handler({ language: 'es', documentId: 'doc' }, context), /consentimiento/i);
  const result = await handler({ language: 'es', documentId: 'doc', dataProcessingConsent: true }, context);
  assert.equal(result.entries.length, 1); assert.equal(result.entries[0].quote, 'Plazo de tres meses'); assert.equal(result.discardedCount, 1); assert.equal(checked, 1); assert.ok(seen && closed); assert.deepEqual(await readdir(temporaryRoot), []);
 } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('Pi usa el documento y produce entradas con un proveedor simulado', { timeout: 30000 }, async () => {
 const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-knowledge-pi-')); let calls = 0, sawSource = false; const stages = [];
 try {
  const createAiService = ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) {
   calls++; const ctx = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `knowledge-${calls}` }; request.onRequestStart?.(ctx);
   sawSource ||= JSON.stringify(request.body.messages).includes('Obra terminada en 2025');
   const output = JSON.stringify({ entries: [{ title: 'Obra', summary: 'Obra terminada en 2025', quote: 'Obra terminada en 2025' }] });
   const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-source', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'source.md' }) } }] } : calls === 2 ? { role: 'assistant', content: null, tool_calls: [{ id: 'write-knowledge', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: 'knowledge.json', content: output }) } }] } : { role: 'assistant', content: 'Análisis listo.' };
   return request.consumeResponse(new Response(JSON.stringify({ id: `knowledge-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls <= 2 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
  } });
  const handler = createKnowledgeAnalysisHandler({ temporaryRoot, createAiService });
  const result = await handler({ language: 'es', documentId: 'doc', dataProcessingConsent: true }, { reportProgress: stage => stages.push(stage), job: { id: 'task-knowledge' }, signal: new AbortController().signal, getKnowledgeFile: async () => ({ name: 'obra.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Obra terminada en 2025.').buffer }), getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'key' }), assertKnowledgeCurrent: async () => {} });
  assert.ok(stages.includes('reading')); assert.ok(stages.includes('generating')); assert.ok(stages.every(stage => ['preparing', 'reading', 'generating'].includes(stage)));
  assert.equal(result.entries[0].title, 'Obra'); assert.ok(sawSource); assert.ok(calls >= 3); assert.deepEqual(await readdir(temporaryRoot), []);
 } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('analiza XLS y XLSX con citas literales y rechaza contenido inventado',async()=>{
 const {createRequire}=await import('node:module'),requireClient=createRequire(new URL('../../client/package.json',import.meta.url)),xlsx=requireClient('xlsx'),temporaryRoot=await mkdtemp(join(tmpdir(),'savia-knowledge-excel-'));
 try{const book=xlsx.utils.book_new();xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet([['Proyecto','Monto'],['Hospital',42]]),'Obras');
  for(const [ext,type] of [['xls','xls'],['xlsx','xlsx']]){let seen='';const handler=createKnowledgeAnalysisHandler({temporaryRoot,createAiService:()=>({}),createRuntime:()=>({close:async()=>{},runTask:async task=>{seen=task.files[0].content;const report=task.validateOutput({output_content:JSON.stringify({entries:[{title:'Obra',summary:'Proyecto',quote:'Hospital'},{title:'Inventado',summary:'No aparece',quote:'Pista inexistente'}]})});return {validation_result:report.value};}})});
   const result=await handler({documentId:'doc',language:'es',dataProcessingConsent:true},{job:{id:'excel'},getKnowledgeFile:async()=>({name:`obra.${ext}`,contentType:'application/octet-stream',bytes:xlsx.write(book,{type:'buffer',bookType:type})}),getCredential:async()=>({provider:'opencode-go',model:'fixture',secret:'fixture'}),assertKnowledgeCurrent:async()=>{}});
   assert.match(seen,/Hospital/);assert.equal(result.entries[0].quote,'Hospital');assert.equal(result.discardedCount,1);
  }assert.deepEqual(await readdir(temporaryRoot),[]);
 }finally{await rm(temporaryRoot,{recursive:true,force:true});}
});
