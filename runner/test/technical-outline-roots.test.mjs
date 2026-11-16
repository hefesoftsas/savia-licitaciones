import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOutlineRootsHandler } from '../technical-outline-roots.mjs';

test('genera solo raíces y preserva el contrato de identidad y atributos del escritorio', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-outline-roots-')); let captured, closed = false;
  try {
    const context = { signal: new AbortController().signal, job: { id: 'job' }, getPlanContext: async () => ({ analyses: { 'project-overview': 'Resumen', 'technical-score': 'Criterios', 'response-requirements': 'Documentos de respuesta' } }), getCredential: async () => ({ provider:'anthropic-api', model: 'fixture', secret:'sk-ant-api-fixture' }), askUser: async () => ({ answer: 'Sí' }) };
    const handler = createOutlineRootsHandler({ temporaryRoot, createAiService: ({configStore}) => { const config = configStore.load(); assert.equal(config.text_model_provider, 'anthropic-api'); assert.equal(config.base_url, 'https://api.anthropic.com'); assert.equal(config.web_runner_anthropic_native, true); assert.equal(config.reasoning_effort, ''); return {}; }, createRuntime: () => ({ async runTask(task) { captured = task; return { validation_result: task.validateOutput({ output_content: JSON.stringify({ outline: [{ id: null, title: 'Propuesta técnica', description: 'Contenido técnico', attr: '技术', content_mode: 'ai-generate' }] }) }).value }; }, async close() { closed = true; } }) });
    const result = await handler({ language: 'es', dataProcessingConsent: true }, context);
    assert.equal(result.outline.length, 1); assert.match(result.outline[0].id, /^[a-f0-9-]{36}$/); assert.equal(result.outline[0].content_mode, 'ai-generate');
    assert.ok(captured.files.some(file => file.content.includes('Criterios'))); assert.ok(captured.active_tools.includes('ask-user')); assert.equal(closed, true);
    const invalid = captured.validateOutput({ output_content: JSON.stringify({ outline: [{ id: null, title: 'Root', description: 'Root', attr: '技术', children: [{ id: null, title: 'Uno', description: 'Uno', content_mode: 'ai-generate' }, { id: null, title: 'Dos', description: 'Dos', content_mode: 'ai-generate' }] }] }) });
    assert.ok(invalid.issues.length);
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('Pi escribe y valida la propuesta de raíces con un proveedor simulado', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-outline-pi-')); let calls = 0, sawContext = false;
  try {
    const createAiService = ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) {
      calls++; const ctx = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `outline-${calls}` }; request.onRequestStart?.(ctx);
      sawContext ||= JSON.stringify(request.body.messages).includes('Criterios técnicos');
      const json = JSON.stringify({ outline: [{ id: null, title: 'Propuesta técnica', description: 'Respuesta a criterios', attr: '技术', content_mode: 'ai-generate' }] });
      const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-analysis', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'technical-score.md' }) } }] } : calls === 2 ? { role: 'assistant', content: null, tool_calls: [{ id: 'write-outline', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: 'outline.json', content: json }) } }] } : { role: 'assistant', content: 'Índice preparado.' };
      return request.consumeResponse(new Response(JSON.stringify({ id: `outline-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls <= 2 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
    } });
    const handler = createOutlineRootsHandler({ temporaryRoot, createAiService });
    const result = await handler({ language: 'es', dataProcessingConsent: true }, { signal: new AbortController().signal, job: { id: 'task-roots' }, getPlanContext: async () => ({ analyses: { 'project-overview': 'Proyecto', 'technical-score': 'Criterios técnicos', 'response-requirements': 'Sección técnica' } }), getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture-key' }), askUser: async () => { throw new Error('unexpected question'); } });
    assert.equal(result.outline[0].title, 'Propuesta técnica'); assert.match(result.outline[0].id, /^[a-f0-9-]{36}$/); assert.ok(sawContext); assert.ok(calls >= 2);
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('descarta las raíces si el plan o los análisis cambian durante la generación', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-outline-stale-')); let reads = 0, closed = false;
  try {
    const handler = createOutlineRootsHandler({ temporaryRoot, createAiService: () => ({}), createRuntime: () => ({ async runTask(task) { return { validation_result: task.validateOutput({ output_content: JSON.stringify({ outline: [{ id: null, title: 'Técnico', description: 'Contenido', attr: '技术', content_mode: 'ai-generate' }] }) }).value }; }, async close() { closed = true; } }) });
    await assert.rejects(handler({ language: 'es', dataProcessingConsent: true }, { job: { id: 'job' }, signal: new AbortController().signal, getPlanContext: async () => { if (++reads === 2) throw Object.assign(new Error('conflict'), { status: 409 }); return { analyses: { 'technical-score': 'Criterios' } }; }, getCredential: async () => ({ provider: 'opencode-go', model: 'test', secret: 'fixture' }), askUser: async () => {} }), /plan o sus fuentes cambiaron/i);
    assert.equal(closed, true);
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('Pi consulta OpenAI API y guarda raíces basadas en el análisis', { timeout: 30_000 }, async () => {
  const originalFetch = globalThis.fetch, calls = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):/.test(target)) return originalFetch(url, options);
      assert.equal(target, 'https://api.openai.com/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-key');
      calls.push(JSON.parse(options.body));
      const json = JSON.stringify({ outline: [{ id: null, title: 'Propuesta técnica', description: 'Respuesta a criterios', attr: '技术', content_mode: 'ai-generate' }] });
      const message = calls.length === 1
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-analysis', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'technical-score.md' }) } }] }
        : calls.length === 2 ? { role: 'assistant', content: null, tool_calls: [{ id: 'write-outline', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: 'outline.json', content: json }) } }] }
          : { role: 'assistant', content: 'Índice preparado.' };
      return new Response(JSON.stringify({ id: `outline-${calls.length}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls.length <= 2 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }), { headers: { 'content-type': 'application/json' } });
    };
    const result = await createOutlineRootsHandler()({ language: 'es', dataProcessingConsent: true }, { signal: new AbortController().signal, job: { id: 'task-openai-roots' }, getPlanContext: async () => ({ analyses: { 'project-overview': 'Proyecto', 'technical-score': 'Criterios técnicos', 'response-requirements': 'Sección técnica' } }), getCredential: async () => ({ provider: 'openai-api', model: 'fixture', secret: 'fixture-key' }), askUser: async () => { throw new Error('unexpected question'); } });
    assert.equal(result.outline[0].title, 'Propuesta técnica');
    assert.ok(calls.length >= 3);
    assert.ok(JSON.stringify(calls[1].messages).includes('Criterios técnicos'));
    assert.equal('reasoning_effort' in calls[0], false);
  } finally { globalThis.fetch = originalFetch; }
});
