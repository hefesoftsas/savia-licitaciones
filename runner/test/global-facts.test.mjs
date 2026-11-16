import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGlobalFactsHandler } from '../global-facts.mjs';

for (const language of ['es', 'en']) test(`genera hechos en ${language} con documentos e índice en el contexto`, async () => {
 const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-facts-')); let runtimeClosed = false, invoked;
 try {
  const handler = createGlobalFactsHandler({ temporaryRoot, createAiService: ({configStore}) => { const config = configStore.load(); assert.equal(config.text_model_provider, 'anthropic-api'); assert.equal(config.base_url, 'https://api.anthropic.com'); assert.equal(config.web_runner_anthropic_native, true); assert.equal(config.reasoning_effort, ''); return {}; }, createRuntime: () => ({ close: async () => { runtimeClosed = true; }, runTask: async task => { invoked = task; const report = task.validateOutput({ output_content: JSON.stringify({ groups: [{ id: 'equipo', title: 'Equipo', content: '- Responsable: [Pendiente por completar]' }] }) }); assert.deepEqual(report.issues, []); return { validation_result: report.value }; } }) });
  const result = await handler({ language, dataProcessingConsent: true, fileIds: ['doc'], mode: 'placeholder' }, { job: { id: 'task' }, signal: new AbortController().signal, getPlanContext: async () => ({ outline: [{ id: 'id', title: 'Método', number: '1' }], analyses: { 'technical-score': 'Criterio revisado' } }), getCredential: async () => ({ provider:'anthropic-api', model: 'test', secret:'sk-ant-api-fixture' }), getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Plazo dos meses').buffer }), askUser: async () => {} });
  assert.match(invoked.prompt, language === 'en' ? /OUTPUT LANGUAGE: Write every title/ : /IDIOMA DE SALIDA: Escribe todos/); assert.doesNotMatch(invoked.prompt, /只写简体中文/); assert.equal(result.groups[0].title, 'Equipo'); assert.ok(invoked.files.some(file => file.content.includes('Plazo dos meses'))); assert.ok(invoked.files.some(file => file.content.includes('Método'))); assert.ok(invoked.files.some(file => file.content.includes('Criterio revisado'))); assert.equal(runtimeClosed, true); assert.deepEqual(await readdir(temporaryRoot), []);
 } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('Pi produce y valida hechos con la tarea real del escritorio y proveedor simulado', { timeout: 30000 }, async () => {
 const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-facts-pi-')); let calls = 0, sawSource = false;
 try {
  const createAiService = ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) {
   calls++; const ctx = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `facts-${calls}` }; request.onRequestStart?.(ctx);
   sawSource ||= JSON.stringify(request.body.messages).includes('plazo de dos meses');
   const output = JSON.stringify({ groups: [{ id: 'plazo', title: 'Plazo', content: '- Duración: dos meses.' }] });
   const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-source', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: '招标文件/招标文件-01-pliego.txt.md' }) } }] } : calls === 2 ? { role: 'assistant', content: null, tool_calls: [{ id: 'write-facts', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: 'global-facts.json', content: output }) } }] } : { role: 'assistant', content: 'Hechos preparados.' };
   return request.consumeResponse(new Response(JSON.stringify({ id: `facts-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls <= 2 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
  } });
  const handler = createGlobalFactsHandler({ temporaryRoot, createAiService });
  const result = await handler({ language: 'es', dataProcessingConsent: true, fileIds: ['doc'], mode: 'placeholder' }, { job: { id: 'task-facts' }, signal: new AbortController().signal, getPlanContext: async () => ({ outline: [{ id: 'id', title: 'Método', number: '1' }], analyses: {} }), getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'key' }), getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('El plazo de dos meses.').buffer }), askUser: async () => {} });
  assert.equal(result.groups[0].title, 'Plazo'); assert.ok(sawSource); assert.ok(calls >= 3); assert.deepEqual(await readdir(temporaryRoot), []);
 } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('solo incorpora los datos revisados del RUP con autorización específica', async () => {
 const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-facts-rup-')); const requests = [];
 try {
  const handler = createGlobalFactsHandler({ temporaryRoot, createAiService: () => ({}), createRuntime: () => ({ close: async () => {}, runTask: async task => { requests.push(task); const report = task.validateOutput({ output_content: JSON.stringify({ groups: [{ id: 'empresa', title: 'Empresa', content: 'Revisar datos' }] }) }); return { validation_result: report.value }; } }) });
  const context = { job: { id: 'task' }, signal: new AbortController().signal, getPlanContext: async () => ({ outline: [{ id: 'node', title: 'Método', number: '1' }], analyses: {}, rupFacts: [{ id: 'r1', label: 'Liquidez', value: '2,5', page: 1 }] }), getCredential: async () => ({ provider: 'opencode-go', model: 'test', secret: 'key' }), getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Pliego').buffer }), askUser: async () => {} };
  const payload = { language: 'es', dataProcessingConsent: true, fileIds: ['doc'], mode: 'placeholder' };
  await handler(payload, context); assert.equal(requests[0].files.some(file => file.content.includes('Liquidez')), false);
  await assert.rejects(handler({ ...payload, includeRup: true }, context), /RUP|consentimiento/i);
  await handler({ ...payload, includeRup: true, rupConsent: true }, context); assert.ok(requests[1].files.some(file => file.content.includes('Liquidez') && file.content.includes('2,5')));
 } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('incorpora solo conocimiento seleccionado y autorizado al generar hechos', async () => {
 const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-facts-knowledge-')); const requests = [];
 try {
  const handler = createGlobalFactsHandler({ temporaryRoot, createAiService: () => ({}), createRuntime: () => ({ close: async () => {}, runTask: async task => { requests.push(task); const report = task.validateOutput({ output_content: JSON.stringify({ groups: [{ id: 'experiencia', title: 'Experiencia', content: 'Verificar' }] }) }); return { validation_result: report.value }; } }) });
  const context = { job: { id: 'task' }, signal: new AbortController().signal, getPlanContext: async () => ({ outline: [{ id: 'node', title: 'Método', number: '1' }], analyses: {}, knowledgeEntries: [{ id: 'k', title: 'Obra', summary: 'Construcción', quote: 'Obra construida', documentName: 'obra.txt' }] }), getCredential: async () => ({ provider: 'opencode-go', model: 'test', secret: 'key' }), getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Pliego').buffer }), askUser: async () => {} };
  const payload = { language: 'es', dataProcessingConsent: true, fileIds: ['doc'], mode: 'placeholder' };
  await handler(payload, context); assert.equal(requests[0].files.some(file => file.content.includes('Obra construida')), false);
  await assert.rejects(handler({ ...payload, factsSnapshot: { knowledgeIds: ['k'] } }, context), /conocimiento|consentimiento/i);
  await handler({ ...payload, knowledgeConsent: true, factsSnapshot: { knowledgeIds: ['k'] } }, context); assert.ok(requests[1].files.some(file => file.content.includes('Obra construida') && file.content.includes('obra.txt')));
 } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('Pi lee la entrada de conocimiento seleccionada con proveedor simulado', { timeout: 30000 }, async () => {
 const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-facts-knowledge-pi-')); let calls = 0, sawKnowledge = false;
 try {
  const createAiService = ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) {
   calls++; const ctx = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `knowledge-facts-${calls}` }; request.onRequestStart?.(ctx);
   sawKnowledge ||= JSON.stringify(request.body.messages).includes('Obra construida en 2025');
   const output = JSON.stringify({ groups: [{ id: 'obra', title: 'Experiencia', content: 'Obra construida en 2025.' }] });
   const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-knowledge', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'references/knowledge.json' }) } }] } : calls === 2 ? { role: 'assistant', content: null, tool_calls: [{ id: 'write-facts', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: 'global-facts.json', content: output }) } }] } : { role: 'assistant', content: 'Hechos listos.' };
   return request.consumeResponse(new Response(JSON.stringify({ id: `knowledge-facts-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls <= 2 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
  } });
  const handler = createGlobalFactsHandler({ temporaryRoot, createAiService });
  const result = await handler({ language: 'es', dataProcessingConsent: true, fileIds: ['doc'], mode: 'placeholder', knowledgeConsent: true, factsSnapshot: { knowledgeIds: ['k'] } }, { job: { id: 'task-knowledge' }, signal: new AbortController().signal, getPlanContext: async () => ({ outline: [{ id: 'id', title: 'Método', number: '1' }], analyses: {}, knowledgeEntries: [{ id: 'k', title: 'Obra', summary: 'Experiencia', quote: 'Obra construida en 2025', documentName: 'obra.txt' }] }), getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'key' }), getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('El pliego.').buffer }), askUser: async () => {} });
  assert.equal(result.groups[0].title, 'Experiencia'); assert.ok(sawKnowledge); assert.ok(calls >= 3); assert.deepEqual(await readdir(temporaryRoot), []);
 } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});
