import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequirementSuggestionsHandler } from '../requirement-suggestions.mjs';

test('el runner valida citas y solo incluye el perfil expresamente autorizado', async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-requirements-')); let calls = 0, checked = 0;
  try {
    const handler = createRequirementSuggestionsHandler({ tempRoot: root, createAiService:({configStore})=>{const c=configStore.load();assert.equal(c.text_model_provider,'anthropic-api');assert.equal(c.base_url,'https://api.anthropic.com');assert.equal(c.web_runner_anthropic_native,true);assert.equal(c.reasoning_effort,'');return {};}, createRuntime: () => ({
      async runTask(task) { calls++; assert.deepEqual(task.active_tools, ['read', 'grep', 'find', 'ls']); assert.match(task.files.find(file => file.path === 'profile.json').content, /Liquidez/); assert.ok(task.signal); return { assistant_text: JSON.stringify({ requirements: [
        { title: 'Liquidez mínima', category: 'financial', sourceId: 'doc', quote: 'Debe acreditar liquidez de 1,5.', factIds: ['fact', 'inventado'] },
        { title: 'Invención', sourceId: 'doc', quote: 'No aparece en el pliego' },
      ] }) }; }, async close() {},
    }) });
    const result = await handler({ fileIds: ['doc', 'bad'], language: 'es', dataProcessingConsent: true, includeRup: true }, { signal: new AbortController().signal,
      getFileInfo: async id => id === 'doc' ? ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Debe acreditar liquidez de 1,5.').buffer }) : ({ name: 'ilegible.pdf', contentType: 'application/pdf', bytes: new Uint8Array([1, 2]).buffer }),
      getCredential: async () => ({ provider:'anthropic-api', model: 'fixture', secret:'sk-ant-api-fixture' }),
      getRequirementSources: async () => ({ facts: [{ id: 'fact', label: 'Liquidez', value: '2', page: 1 }], certificates: [] }),
      assertRequirementSources: async () => { checked++; },
    });
    assert.equal(calls, 1); assert.equal(checked, 1); assert.equal(result.requirements.length, 1); assert.deepEqual(result.requirements[0].factIds, ['fact']); assert.equal(result.discardedCount, 1); assert.equal(result.discardedLinks, 1); assert.deepEqual(result.unreadableSources, [{ id: 'bad', name: 'ilegible.pdf' }]);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('requiere consentimiento antes de acceder a documentos o credenciales', async () => {
  let access = false; const handler = createRequirementSuggestionsHandler();
  await assert.rejects(handler({ fileIds: ['doc'], dataProcessingConsent: false }, { getCredential: async () => { access = true; } }), /consentimiento/i); assert.equal(access, false);
});

test('Pi propone requisitos con herramientas de lectura sin enviar el perfil si no fue autorizado', { timeout: 30000 }, async () => {
  let calls = 0, sawSource = false, sawProfile = false;
  const handler = createRequirementSuggestionsHandler({ createAiService: ({ configStore }) => ({
    getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }),
    async runAgentChatCompletion(request) {
      calls++; const body = { ...request.body, stream: false }, ctx = { config: configStore.load(), requestBody: body, requestId: `requirements-${calls}` }; request.onRequestStart?.(ctx);
      const content = JSON.stringify(body.messages); sawSource ||= content.includes('Debe acreditar liquidez'); sawProfile ||= content.includes('DATO PRIVADO');
      const message = calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-tender', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'tender/1.md' }) } }] } : { role: 'assistant', content: JSON.stringify({ requirements: [{ title: 'Liquidez', category: 'financial', sourceId: 'doc', quote: 'Debe acreditar liquidez de 1,5.' }] }) };
      return request.consumeResponse(new Response(JSON.stringify({ id: `requirements-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
    },
  }) });
  const result = await handler({ fileIds: ['doc'], language: 'es', dataProcessingConsent: true, includeRup: false }, { signal: new AbortController().signal,
    getRequirementSources: async () => ({ facts: [{ id: 'private', label: 'DATO PRIVADO', value: '2', page: 1 }], certificates: [] }),
    assertRequirementSources: async () => {}, getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'secret' }),
    getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Debe acreditar liquidez de 1,5.').buffer }),
  });
  assert.equal(result.requirements.length, 1); assert.ok(calls >= 2); assert.equal(sawSource, true); assert.equal(sawProfile, false); assert.deepEqual(result.facts, []);
});

test('el archivo de perfil queda vacío cuando no se autoriza enviar RUP', async () => {
  const handler = createRequirementSuggestionsHandler({ createAiService: () => ({}), createRuntime: () => ({
    async runTask(task) { assert.deepEqual(JSON.parse(task.files.find(file => file.path === 'profile.json').content), { facts: [], certificates: [] }); return { assistant_text: '{"requirements":[]}' }; }, async close() {},
  }) });
  const result = await handler({ fileIds: ['doc'], language: 'es', dataProcessingConsent: true, includeRup: false }, { signal: new AbortController().signal,
    getRequirementSources: async () => ({ facts: [{ id: 'private', label: 'Dato privado', value: '2', page: 1 }], certificates: [{ id: 'cert' }] }),
    assertRequirementSources: async () => {}, getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture' }),
    getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Texto').buffer }),
  });
  assert.deepEqual(result.facts, []); assert.deepEqual(result.certificates, []);
});

test('Pi obtiene requisitos mediante OpenAI API y valida la cita', { timeout: 30000 }, async () => {
  const originalFetch = globalThis.fetch, calls = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):/.test(target)) return originalFetch(url, options);
      assert.equal(target, 'https://api.openai.com/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-openai');
      calls.push(JSON.parse(options.body));
      const message = calls.length === 1
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'read-tender', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'tender/1.md' }) } }] }
        : { role: 'assistant', content: JSON.stringify({ requirements: [{ title: 'Liquidez', category: 'financial', sourceId: 'doc', quote: 'Debe acreditar liquidez de 1,5.' }] }) };
      return new Response(JSON.stringify({ id: `requirements-${calls.length}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls.length === 1 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }), { headers: { 'content-type': 'application/json' } });
    };
    const result = await createRequirementSuggestionsHandler()({ fileIds: ['doc'], language: 'es', dataProcessingConsent: true, includeRup: false }, {
      signal: new AbortController().signal, getRequirementSources: async () => ({ facts: [], certificates: [] }), assertRequirementSources: async () => {},
      getCredential: async () => ({ provider: 'openai-api', model: 'fixture', secret: 'fixture-openai' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Debe acreditar liquidez de 1,5.').buffer }),
    });
    assert.equal(result.requirements.length, 1);
    assert.ok(calls.length >= 2);
    assert.ok(JSON.stringify(calls[1].messages).includes('Debe acreditar liquidez de 1,5.'));
    assert.equal('reasoning_effort' in calls[0], false);
  } finally { globalThis.fetch = originalFetch; }
});

test('si cambian las fuentes antes del análisis no solicita la credencial', async () => {
  let credentialRead = false; const handler = createRequirementSuggestionsHandler();
  await assert.rejects(handler({ fileIds: ['doc'], language: 'es', dataProcessingConsent: true }, { getRequirementSources: async () => { throw Object.assign(new Error('stale'), { status: 409 }); }, getCredential: async () => { credentialRead = true; } }), /fuentes cambiaron/i);
  assert.equal(credentialRead, false);
});

test('rechaza fuentes sin texto legible sin consultar a Pi', async () => {
  let calls = 0; const handler = createRequirementSuggestionsHandler({ createAiService: () => ({}), createRuntime: () => ({ runTask: async () => { calls++; }, close: async () => {} }) });
  await assert.rejects(handler({ fileIds: ['doc'], language: 'es', dataProcessingConsent: true }, { signal: new AbortController().signal,
    getRequirementSources: async () => ({ facts: [], certificates: [] }), getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture' }),
    getFileInfo: async () => ({ name: 'ilegible.pdf', contentType: 'application/pdf', bytes: new Uint8Array([1, 2]).buffer }),
  }), /texto legible/i); assert.equal(calls, 0);
});

test('descarta sugerencias si las fuentes cambian durante el análisis', async () => {
  const handler = createRequirementSuggestionsHandler({ createAiService: () => ({}), createRuntime: () => ({ runTask: async () => ({ assistant_text: '{"requirements":[]}' }), close: async () => {} }) });
  await assert.rejects(handler({ fileIds: ['doc'], language: 'es', dataProcessingConsent: true }, { signal: new AbortController().signal,
    getRequirementSources: async () => ({ facts: [], certificates: [] }), getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture' }),
    getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Texto').buffer }), assertRequirementSources: async () => { throw Object.assign(new Error('stale'), { status: 409 }); },
  }), /fuentes cambiaron/i);
});

test('la cancelación interrumpe Pi y limpia sus archivos temporales', async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-requirements-cancel-')), abort = new AbortController(); let closed = false;
  try {
    const handler = createRequirementSuggestionsHandler({ tempRoot: root, createAiService: () => ({}), createRuntime: () => ({ runTask: async task => { abort.abort(new Error('cancelado')); task.signal.throwIfAborted(); }, close: async () => { closed = true; } }) });
    await assert.rejects(handler({ fileIds: ['doc'], language: 'es', dataProcessingConsent: true, includeRup: false }, { signal: abort.signal,
      getRequirementSources: async () => ({ facts: [], certificates: [] }), getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Texto').buffer }),
    }), /cancelado/);
    assert.equal(closed, true); assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
