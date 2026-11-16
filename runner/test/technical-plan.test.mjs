import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { createTechnicalPlanHandler } = await import(process.env.SAVIA_TEST_TECHNICAL_PLAN_MODULE || new URL('../technical-plan.mjs', import.meta.url));

test('Pi prepara un borrador usando el capítulo autorizado y el documento seleccionado', { timeout: 30_000 }, async () => {
  let calls = 0, sawChapter = false, sawSource = false, sawFact = false;
  const handler = createTechnicalPlanHandler({ createAiService: ({ configStore }) => ({
    getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }),
    async runAgentChatCompletion(request) {
      calls++; const requestBody = { ...request.body, stream: false }, ctx = { config: configStore.load(), requestBody, requestId: `draft-${calls}` };
      request.onRequestStart?.(ctx);
      const content = JSON.stringify(request.body.messages); sawChapter ||= content.includes('Metodología') && content.includes('entregables'); sawSource ||= content.includes('informes mensuales'); sawFact ||= content.includes('Responsable aprobado: Ana');
      const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-source', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] } : { role: 'assistant', content: 'Se elaborarán informes mensuales. Responsable: [POR DEFINIR].\n<suggested_questions>[]</suggested_questions>' };
      return request.consumeResponse(new Response(JSON.stringify({ id: `draft-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
    },
  }) });
  const result = await handler({ nodeId: 'node', planVersion: 1, fileIds: ['file'], instructions: 'Priorizar entregables', language: 'es', dataProcessingConsent: true }, {
    job: { id: 'draft-job', projectId: 'project' }, signal: new AbortController().signal,
    getPlanContext: async () => ({ projectTitle: 'Proyecto', node: { id: 'node', number: '1', title: 'Metodología', description: 'Ejecución' }, globalFacts: [{ id: 'equipo', title: 'Equipo', content: 'Responsable aprobado: Ana' }] }),
    getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture' }),
    getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('El contrato exige informes mensuales.').buffer }),
  });
  assert.match(result.content, /informes mensuales/); assert.equal(sawChapter, true); assert.equal(sawSource, true); assert.equal(sawFact, true); assert.ok(calls >= 2);
});

test('el borrador requiere consentimiento antes de obtener contexto o credenciales', async () => {
  let accessed = false; const handler = createTechnicalPlanHandler();
  await assert.rejects(handler({ nodeId: 'node', fileIds: ['file'] }, { getPlanContext: async () => { accessed = true; }, getCredential: async () => { accessed = true; } }), /consentimiento/i);
  assert.equal(accessed, false);
});

test('los hechos derivados del RUP requieren consentimiento antes de leer credenciales', async () => {
  let credentialRead = false; const handler = createTechnicalPlanHandler();
  await assert.rejects(handler({ nodeId: 'node', fileIds: ['file'], dataProcessingConsent: true }, {
    getPlanContext: async () => ({ node: { id: 'node' }, globalFactsIncludeRup: true }),
    getCredential: async () => { credentialRead = true; },
  }), /consentimiento específico/i);
  assert.equal(credentialRead, false);
});

test('si el plan cambió, no solicita credenciales ni llama al proveedor', async () => {
  let credentialRead = false; const handler = createTechnicalPlanHandler();
  await assert.rejects(handler({ nodeId: 'node', fileIds: ['file'], dataProcessingConsent: true }, {
    getPlanContext: async () => { throw Object.assign(new Error('conflict'), { status: 409 }); },
    getCredential: async () => { credentialRead = true; },
  }), /plan cambió/i);
  assert.equal(credentialRead, false);
});

test('el CLI anuncia el borrador técnico solo cuando están las herramientas', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savia-plan-cli-'));
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    if (req.url === '/api/runner/config') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"items":[]}'); return; }
    server.received = JSON.parse(raw); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"job":null}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const toolsDir = join(dir, 'tools'); await mkdir(toolsDir);
    for (const name of ['rg', 'fd', 'jq']) { const file = join(toolsDir, name + (process.platform === 'win32' ? '.exe' : '')); await writeFile(file, 'fixture'); if (process.platform !== 'win32') await chmod(file, 0o700); }
    const config = join(dir, 'runner.json');
    await writeFile(config, JSON.stringify({ server: `http://127.0.0.1:${server.address().port}`, token: 'fixture-token', runnerId: 'fixture' }));
    const cli = process.env.SAVIA_TEST_RUNNER_CLI || fileURLToPath(new URL('../cli.mjs', import.meta.url));
    const child = spawn(process.execPath, [cli, 'run-once', '--config', config], { env: { ...process.env, SAVIA_AGENT_TOOLS_BIN_DIR: toolsDir }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stderr.on('data', chunk => { output += chunk; });
    const status = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    assert.equal(status, 0, output); assert.ok(server.received.kinds.includes('technical-plan.generate-section'));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('la redacción usa únicamente conocimiento autorizado y no lee credenciales sin consentimiento', { timeout: 30000 }, async () => {
 let calls = 0, sawKnowledge = false, sawKnowledgePolicy = false, credentialReads = 0;
 const handler = createTechnicalPlanHandler({ createAiService: ({ configStore }) => ({
  getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }),
  async runAgentChatCompletion(request) {
   calls++; const ctx = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `draft-knowledge-${calls}` }; request.onRequestStart?.(ctx);
   sawKnowledge ||= JSON.stringify(request.body.messages).includes('Experiencia autorizada');
   sawKnowledgePolicy ||= JSON.stringify(request.body.messages).includes('approved knowledge entries included in the question');
   return request.consumeResponse(new Response(JSON.stringify({ id: `draft-knowledge-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message: { role: 'assistant', content: 'La experiencia ha sido documentada.\n<suggested_questions>[]</suggested_questions>' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
  },
 }) });
 const context = { job: { id: 'draft-knowledge', projectId: 'project' }, signal: new AbortController().signal, getPlanContext: async () => ({ projectTitle: 'Proyecto', node: { id: 'node', number: '1', title: 'Método', description: '' }, knowledgeEntries: [{ id: 'entry', title: 'Experiencia autorizada', summary: 'Trabajo', quote: 'Experiencia autorizada', documentName: 'obra.txt' }] }), getCredential: async () => { credentialReads++; return { provider: 'opencode-go', model: 'fixture', secret: 'fixture' }; }, getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Pliego').buffer }) };
 const payload = { nodeId: 'node', planVersion: 1, fileIds: ['file'], language: 'es', dataProcessingConsent: true, knowledgeSnapshot: { ids: ['entry'] } };
 await assert.rejects(handler(payload, context), /conocimiento|consentimiento/i); assert.equal(credentialReads, 0);
 const result = await handler({ ...payload, knowledgeConsent: true }, context); assert.match(result.content, /experiencia/i); assert.ok(sawKnowledge); assert.ok(sawKnowledgePolicy); assert.equal(credentialReads, 1);
});

test('el texto completo requiere autorización y no se descarga para borradores con solo entradas', async () => {
 let downloads = 0;
 const context = { job: { id: 'task', projectId: 'project' }, signal: new AbortController().signal, getPlanContext: async () => ({ projectTitle: 'Proyecto', node: { id: 'node', number: '1', title: 'Método' }, knowledgeEntries: [{ id: 'entry', documentId: 'doc', title: 'Obra', summary: 'Obra', quote: 'Obra', documentName: 'obra.txt' }] }), getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture' }), getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Pliego').buffer }), getKnowledgeDocumentInfo: async () => { downloads++; throw new Error('no debe descargarse'); } };
 const payload = { nodeId: 'node', fileIds: ['file'], language: 'es', dataProcessingConsent: true, knowledgeConsent: true, knowledgeSnapshot: { ids: ['entry'] } };
 const handler = createTechnicalPlanHandler({ createAiService: ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) { const ctx = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: 'no-download' }; request.onRequestStart?.(ctx); return request.consumeResponse(new Response(JSON.stringify({ id: 'no-download', object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message: { role: 'assistant', content: 'Listo.\n<suggested_questions>[]</suggested_questions>' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx); } }) });
 await assert.rejects(handler({ ...payload, includeKnowledgeDocuments: true }, context), /consentimiento/i); assert.equal(downloads, 0);
 await handler(payload, context); assert.equal(downloads, 0);
});

test('rechaza originales demasiado extensos sin invocar al proveedor', async () => {
 let providerCalls = 0; const dir = await mkdtemp(join(tmpdir(), 'savia-reference-limit-'));
 try {
  const handler = createTechnicalPlanHandler({ temporaryRoot: dir, createAiService: () => { providerCalls++; throw new Error('provider called'); } });
  const context = { job: { id: 'task', projectId: 'project' }, signal: new AbortController().signal, getPlanContext: async () => ({ node: { id: 'node' }, knowledgeEntries: [{ id: 'entry', documentId: 'doc', title: 'Obra', summary: 'Obra', quote: 'Obra', documentName: 'obra.txt' }] }), getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture' }), getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Pliego').buffer }), getKnowledgeDocumentInfo: async () => ({ name: 'obra.txt', contentType: 'application/octet-stream', bytes: new TextEncoder().encode('x'.repeat(1_000_001)).buffer }) };
  await assert.rejects(handler({ nodeId: 'node', fileIds: ['file'], language: 'es', dataProcessingConsent: true, knowledgeConsent: true, knowledgeSnapshot: { ids: ['entry'] }, includeKnowledgeDocuments: true, knowledgeDocumentConsent: true }, context), /demasiado extensos/i);
  assert.equal(providerCalls, 0); assert.deepEqual(await readdir(dir), []);
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('informa cuando un documento de biblioteca deja de estar disponible', async () => {
 const handler = createTechnicalPlanHandler();
 const context = { job: { id: 'task', projectId: 'project' }, signal: new AbortController().signal, getPlanContext: async () => ({ node: { id: 'node' }, knowledgeEntries: [{ id: 'entry', documentId: 'doc', title: 'Obra', summary: 'Obra', quote: 'Obra', documentName: 'obra.txt' }] }), getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture' }), getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Pliego').buffer }), getKnowledgeDocumentInfo: async () => { throw Object.assign(new Error('HTTP 409'), { status: 409 }); } };
 await assert.rejects(handler({ nodeId: 'node', fileIds: ['file'], language: 'es', dataProcessingConsent: true, knowledgeConsent: true, knowledgeSnapshot: { ids: ['entry'] }, includeKnowledgeDocuments: true, knowledgeDocumentConsent: true }, context), /documento.*biblioteca.*cambi[oó]|documento.*biblioteca.*disponible/i);
});
test('la redacción usa el enfoque guardado y solo las referencias elegidas para ese capítulo',async()=>{
 const seen=[],handler=createTechnicalPlanHandler({createAiService:({configStore})=>({getConfig:()=>configStore.load(),getTextQueueStatus:()=>({active:0,queued:0,limit:1}),async runAgentChatCompletion(request){const ctx={config:configStore.load(),requestBody:{...request.body,stream:false},requestId:'planned'};request.onRequestStart?.(ctx);seen.push(JSON.stringify(request.body.messages));return request.consumeResponse(new Response(JSON.stringify({id:'planned',object:'chat.completion',model:'fixture',choices:[{index:0,message:{role:'assistant',content:'Texto revisable.\n<suggested_questions>[]</suggested_questions>'},finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}}),ctx);}})}),payload={nodeId:'a',fileIds:['file'],language:'es',dataProcessingConsent:true,knowledgeConsent:true,knowledgeSnapshot:{ids:['k1','k2']},contentPlan:{writing_focus:'Explicar pruebas de calidad',target_words:500,knowledge:{item_ids:['k1']},table:{needed:true,purpose:'Responsabilidades'},image_suitability_score:1}},context={job:{id:'planned',projectId:'project'},signal:new AbortController().signal,getPlanContext:async()=>({node:{id:'a',title:'Método'},projectTitle:'Proyecto',knowledgeEntries:[{id:'k1',title:'Conocimiento permitido',documentId:'d1'},{id:'k2',title:'Entrada no elegida',documentId:'d2'}]}),getCredential:async()=>({provider:'opencode-go',model:'fixture',secret:'secret'}),getFileInfo:async()=>({name:'pliego.txt',contentType:'text/plain',bytes:new TextEncoder().encode('Pliego').buffer})};
 await handler(payload,context);const text=seen.join(' ');assert.match(text,/Explicar pruebas de calidad/);assert.match(text,/Responsabilidades/);assert.match(text,/Conocimiento permitido/);assert.doesNotMatch(text,/Entrada no elegida/);
});
