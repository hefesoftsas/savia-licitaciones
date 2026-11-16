import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRupAnalysisHandler } from '../rup-analysis.mjs';
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { PDFDocument, StandardFonts } = require('pdf-lib');

async function certificatePdf() { const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); pdf.addPage().drawText('Liquidity 1.25', { x: 40, y: 700, font }); pdf.addPage(); return await pdf.save(); }

test('analiza el RUP con Messages nativo de Claude y verifica las citas', { timeout: 30000 }, async () => {
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):/.test(target)) return originalFetch(url, options);
      assert.equal(target, 'https://api.anthropic.com/v1/messages');
      assert.equal(new Headers(options.headers).get('x-api-key'), 'sk-ant-api-fixture');
      requests.push(JSON.parse(options.body));
      const content = requests.length === 1
        ? [{ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'read-page', name: 'read', input: {} } }, { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ path: 'pages/1.txt' }) } }, { type: 'content_block_stop', index: 0 }]
        : [{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: JSON.stringify([{ label: 'Liquidity', value: '1.25', page: 1, quote: 'Liquidity 1.25' }, { label: 'Inventado', value: '9', page: 1, quote: 'Liquidity 9' }]) } }, { type: 'content_block_stop', index: 0 }];
      const events = [{ type: 'message_start', message: { id: `msg-${requests.length}`, type: 'message', role: 'assistant', model: 'claude-fixture', content: [], usage: { input_tokens: 10, output_tokens: 0 } } }, ...content, { type: 'message_delta', delta: { stop_reason: requests.length === 1 ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } }, { type: 'message_stop' }];
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createRupAnalysisHandler()({ language: 'en', dataProcessingConsent: true }, { signal: new AbortController().signal, getRupPdf: certificatePdf, assertRupCurrent: async () => {}, getCredential: async () => ({ provider: 'anthropic-api', model: 'claude-fixture', secret: 'sk-ant-api-fixture' }) });
    assert.equal(result.suggestions[0].value, '1.25'); assert.equal(result.rejectedCount, 1);
    assert.ok(requests.length >= 2); assert.ok(JSON.stringify(requests[1].messages).includes('Liquidity 1.25'));
    assert.ok(!JSON.stringify(requests).includes('sk-ant-api-fixture'));
  } finally { globalThis.fetch = originalFetch; }
});

test('analiza el RUP con OpenAI API mediante Pi y verifica las citas', { timeout: 30000 }, async () => {
  const originalFetch = globalThis.fetch, requests = [], stages = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):/.test(target)) return originalFetch(url, options);
      assert.equal(target, 'https://api.openai.com/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-rup-openai');
      const body = JSON.parse(options.body); requests.push(body);
      const message = requests.length === 1
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-page', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'pages/1.txt' }) } }] }
        : { role: 'assistant', content: JSON.stringify([{ label: 'Liquidity', value: '1.25', page: 1, quote: 'Liquidity 1.25' }, { label: 'Inventado', value: '9', page: 1, quote: 'Liquidity 9' }]) };
      return new Response(JSON.stringify({ id: `rup-${requests.length}`, object: 'chat.completion', model: 'fixture-model', choices: [{ index: 0, message, finish_reason: requests.length === 1 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }), { headers: { 'content-type': 'application/json' } });
    };
    const result = await createRupAnalysisHandler()({ language: 'en', dataProcessingConsent: true }, { reportProgress: stage => stages.push(stage), signal: new AbortController().signal, getRupPdf: certificatePdf, assertRupCurrent: async () => {}, getCredential: async () => ({ provider: 'openai-api', model: 'fixture-model', secret: 'fixture-rup-openai' }) });
    assert.ok(stages.includes('reading')); assert.ok(stages.includes('generating'));
    assert.ok(stages.every(stage => ['preparing', 'reading', 'generating'].includes(stage)));
    assert.equal(result.suggestions[0].value, '1.25');
    assert.equal(result.rejectedCount, 1);
    assert.ok(requests.length >= 2);
    assert.ok(JSON.stringify(requests[1].messages).includes('Liquidity 1.25'));
    assert.equal(requests[0].model, 'fixture-model');
    assert.equal('reasoning_effort' in requests[0], false);
  } finally { globalThis.fetch = originalFetch; }
});

test('el runner extrae páginas y valida citas de Pi antes de entregar sugerencias', async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-rup-runner-')); let reads = 0, checks = 0, closed = false, calls = 0;
  try {
    const bytes = await certificatePdf();
    const handler = createRupAnalysisHandler({ tempRoot: root, createAiService: ({configStore}) => { assert.equal(configStore.load().text_model_provider, 'fireworks-api'); assert.equal(configStore.load().web_runner_fireworks_native, true); return {}; }, createRuntime: () => ({
      async runTask(task) { calls++; assert.deepEqual(task.active_tools, ['read', 'grep', 'find', 'ls']); assert.ok(task.files[0].content.includes('Liquidity')); assert.ok(task.signal); return { assistant_text: JSON.stringify([{ label: 'Liquidity', value: '1.25', page: 1, quote: 'Liquidity 1.25' }, { label: 'Inventado', value: '9', page: 1, quote: 'Liquidity 9' }]) }; },
      async close() { closed = true; },
    }) });
    const result = await handler({ language: 'en', dataProcessingConsent: true }, { signal: new AbortController().signal, getRupPdf: async () => { reads++; return bytes; }, assertRupCurrent: async () => { checks++; }, getCredential: async () => ({ provider: 'fireworks-api', model: 'fixture-model', secret: 'fixture-fireworks-key' }) });
    assert.equal(calls, 1); assert.equal(reads, 1); assert.equal(checks, 1); assert.equal(closed, true);
    assert.deepEqual(result.suggestions, [{ label: 'Liquidity', value: '1.25', page: 1, quote: 'Liquidity 1.25' }]); assert.equal(result.rejectedCount, 1); assert.deepEqual(result.pagesWithoutText, [2]);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('sin consentimiento o con versión vencida no obtiene credenciales', async () => {
  const handler = createRupAnalysisHandler(); let credentials = 0;
  const context = { getRupPdf: async () => { throw Object.assign(new Error('stale'), { status: 409 }); }, getCredential: async () => { credentials++; } };
  await assert.rejects(handler({ language: 'es', dataProcessingConsent: false }, context), /consentimiento/i);
  await assert.rejects(handler({ language: 'es', dataProcessingConsent: true }, context), /cambió|venció/i);
  assert.equal(credentials, 0);
});

test('Pi usa el transporte configurado y herramientas de lectura para analizar el RUP', { timeout: 30000 }, async () => {
  let calls = 0, sawPage = false, currentChecks = 0;
  const bytes = await certificatePdf();
  const handler = createRupAnalysisHandler({ createAiService: ({ configStore }) => ({
    getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }),
    async runAgentChatCompletion(request) {
      calls++; const body = { ...request.body, stream: false }, ctx = { config: configStore.load(), requestBody: body, requestId: `rup-${calls}` };
      request.onRequestStart?.(ctx); sawPage ||= JSON.stringify(body.messages).includes('Liquidity 1.25');
      const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-page', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'pages/1.txt' }) } }] } : { role: 'assistant', content: JSON.stringify([{ label: 'Liquidity', value: '1.25', page: 1, quote: 'Liquidity 1.25' }]) };
      return request.consumeResponse(new Response(JSON.stringify({ id: `rup-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
    },
  }) });
  const result = await handler({ language: 'en', dataProcessingConsent: true }, { signal: new AbortController().signal, getRupPdf: async () => bytes, assertRupCurrent: async () => { currentChecks++; }, getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture-secret' }) });
  assert.equal(result.suggestions[0].value, '1.25'); assert.ok(calls >= 2); assert.equal(sawPage, true); assert.equal(currentChecks, 1);
});

test('rechaza un PDF sin texto y limpia el espacio temporal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-rup-scanned-'));
  try {
    const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = await pdf.save();
    const handler = createRupAnalysisHandler({ tempRoot: root, createAiService: () => ({}), createRuntime: () => ({ runTask: async () => { throw new Error('No debe llamar al modelo'); }, close: async () => {} }) });
    await assert.rejects(handler({ language: 'es', dataProcessingConsent: true }, { signal: new AbortController().signal, getRupPdf: async () => bytes, getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture' }) }), /texto seleccionable/i);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('descarta el análisis si el certificado cambia mientras Pi trabaja', async () => {
  const bytes = await certificatePdf();
  const handler = createRupAnalysisHandler({ createAiService: () => ({}), createRuntime: () => ({ runTask: async () => ({ assistant_text: '[]' }), close: async () => {} }) });
  await assert.rejects(handler({ language: 'es', dataProcessingConsent: true }, { signal: new AbortController().signal, getRupPdf: async () => bytes, getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture' }), assertRupCurrent: async () => { throw Object.assign(new Error('stale'), { status: 409 }); } }), /cambió/i);
});

test('la señal de cancelación llega a Pi y elimina temporales', async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-rup-cancel-')), abort = new AbortController(); let closed = false;
  try {
    const bytes = await certificatePdf();
    const handler = createRupAnalysisHandler({ tempRoot: root, createAiService: () => ({}), createRuntime: () => ({ runTask: async task => { abort.abort(new Error('cancelado')); task.signal.throwIfAborted(); }, close: async () => { closed = true; } }) });
    await assert.rejects(handler({ language: 'es', dataProcessingConsent: true }, { signal: abort.signal, getRupPdf: async () => bytes, getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture' }) }), /cancelado/);
    assert.equal(closed, true); assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
