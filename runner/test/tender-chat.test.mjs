import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const tenderChatUrl=process.env.SAVIA_TEST_PACKAGED_RUNNER?pathToFileURL(join(process.env.SAVIA_TEST_PACKAGED_RUNNER,'runner','tender-chat.mjs')).href:new URL('../tender-chat.mjs',import.meta.url).href;
const {createTenderChatHandler}=await import(tenderChatUrl);

test('Pi lee el documento seleccionado y produce la respuesta usando el proxy real', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-pi-test-'));
  let calls = 0;
  let sawDocument = false;
  let sawHistory = false;
  let sawAnswer = false;
  let asked = false;
  try {
    const createAiService = ({ configStore }) => ({
      getConfig: () => configStore.load(),
      getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }),
      async runAgentChatCompletion(request) {
        calls++;
        const requestBody = { ...request.body, stream: false };
        if (JSON.stringify(requestBody.messages).includes('¿En qué año?') && JSON.stringify(requestBody.messages).includes('En 2027.')) sawHistory = true;
        const config = configStore.load();
        const context = { config, requestBody, requestId: `fixture-${calls}` };
        request.onRequestStart?.(context);
        let message;
        let finish;
        if (calls === 1) {
          message = { role: 'assistant', content: null, tool_calls: [{ id: 'call_read', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] };
          finish = 'tool_calls';
        } else if (calls === 2) {
          sawDocument = JSON.stringify(request.body.messages).includes('El plazo es de dos meses');
          message = { role: 'assistant', content: null, tool_calls: [{ id: 'call_question', type: 'function', function: { name: 'ask-user', arguments: JSON.stringify({ question: '¿Qué plazo prefieres?', options: [{ label: 'Dos meses', custom: false }, { label: 'Otro plazo', custom: true }] }) } }] };
          finish = 'tool_calls';
        } else {
          sawAnswer = JSON.stringify(request.body.messages).includes('Dos meses');
          message = { role: 'assistant', content: 'El plazo es de dos meses.\n<suggested_questions>["¿Cuándo comienza?"]</suggested_questions>' };
          finish = 'stop';
        }
        const response = new Response(JSON.stringify({ id: `fixture-${calls}`, object: 'chat.completion', created: 1, model: 'default', choices: [{ index: 0, message, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }), { headers: { 'content-type': 'application/json' } });
        return request.consumeResponse(response, context);
      },
    });
    const handler = createTenderChatHandler({ createAiService, temporaryRoot });
    const result = await handler({ question: '¿Cuál es el plazo?', fileIds: ['file-one'], language: 'es', dataProcessingConsent: true, history: [{ question: '¿En qué año?', answer: 'En 2027.' }] }, {
      job: { id: 'task-one', projectId: 'project-one' }, signal: new AbortController().signal,
      askUser: async request => { asked = true; assert.equal(request.question, '¿Qué plazo prefieres?'); return { answer: 'Dos meses', selected_option: 'Dos meses', is_custom: false }; },
      getCredential: async () => ({ provider: 'opencode-go', model: 'fixture-model', secret: 'fixture-key' }),
      getFileInfo: async () => {const entries=await readdir(temporaryRoot);assert.equal(entries.length,1);const owner=JSON.parse(await readFile(join(temporaryRoot,entries[0],'.savia-owner.json'),'utf8'));assert.equal(owner.pid,process.pid);return { contentType: 'text/plain', bytes: new TextEncoder().encode('El plazo es de dos meses').buffer };},
    });
    assert.equal(result.answer, 'El plazo es de dos meses.');
    assert.deepEqual(result.followUps, ['¿Cuándo comienza?']);
    assert.ok(calls >= 2);
    assert.equal(sawDocument, true);
    assert.equal(sawAnswer, true);
    assert.equal(asked, true);
    assert.equal(sawHistory, true);
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('rechaza formatos binarios antes de iniciar el agente', async () => {
  let started = false;
  const handler = createTenderChatHandler({ createAiService() { started = true; throw Error('no debe iniciarse'); } });
  await assert.rejects(handler({ question: '¿Plazo?', fileIds: ['pdf'], language: 'es', dataProcessingConsent: true }, {
    job: { id: 'task-two', projectId: 'project-two' }, signal: new AbortController().signal,
    getCredential: async () => ({ provider: 'opencode-go', model: 'test', secret: 'fixture' }),
    getFileInfo: async () => ({ contentType: 'image/png', bytes: new Uint8Array([0, 1, 2]).buffer }),
  }), /formato/i);
  assert.equal(started, false);
});

test('usa el transporte OpenCode Go existente con Pi sin red externa en la prueba', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-pi-transport-'));
  const originalFetch = globalThis.fetch;
  const captured = [], sessions = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://opencode.ai/inference/go/openai/v1/responses');
      sessions.push(new Headers(options.headers).get('x-opencode-session'));
      const body = JSON.parse(options.body);
      captured.push(body);
      const output = captured.length % 2 === 1
        ? [{ type: 'function_call', call_id: 'call_read', name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) }]
        : [{ type: 'message', content: [{ type: 'output_text', text: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }] }];
      return new Response(JSON.stringify({ id: `fixture-${captured.length}`, status: 'completed', model: 'fixture-model', output, usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20, input_tokens_details: {cached_tokens:4}, output_tokens_details:{reasoning_tokens:2} } }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const handler = createTenderChatHandler({ temporaryRoot });
    const result = await handler({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-transport', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'opencode-go', model: 'fixture-model', secret: 'fixture-only' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.deepEqual(result.usage,{input:12,output:20,cacheRead:8,cacheWrite:0,reportedCalls:2,unreportedCalls:0});
    assert.ok(captured.length >= 2);
    assert.equal(captured[0].model, 'fixture-model');
    assert.ok(JSON.stringify(captured[1].input).includes('La entrega es en dos meses'));
    await handler({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'different-task', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'opencode-go', model: 'fixture-model', secret: 'fixture-only' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(sessions.length, 4);assert.ok(sessions.every(value => /^[a-f0-9]{64}$/.test(value)));
    assert.equal(sessions[0],sessions[1]);assert.equal(sessions[2],sessions[3]);assert.notEqual(sessions[0],sessions[2]);
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('usa OpenAI API y llamadas de herramientas sin enviar la clave a otro proveedor', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-openai-transport-'));
  const originalFetch = globalThis.fetch;
  const captured = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.openai.com/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-openai-key');
      const body = JSON.parse(options.body);
      captured.push(body);
      const message = captured.length === 1
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'call_read', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }
        : { role: 'assistant', content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' };
      return new Response(JSON.stringify({ id: `fixture-${captured.length}`, object: 'chat.completion', created: 1, model: 'fixture-model', choices: [{ index: 0, message, finish_reason: captured.length === 1 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }), { headers: { 'content-type': 'application/json' } });
    };
    const handler = createTenderChatHandler({ temporaryRoot });
    const result = await handler({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-openai', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'openai-api', model: 'fixture-model', secret: 'fixture-openai-key' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(captured.length >= 2);
    assert.equal(captured[0].model, 'fixture-model');
    assert.equal('reasoning_effort' in captured[0], false);
    assert.ok(JSON.stringify(captured[1].messages).includes('La entrega es en dos meses'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('usa Groq API y llamadas de herramientas sin enviar la clave a otro proveedor', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-groq-transport-'));
  const originalFetch = globalThis.fetch;
  const captured = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.groq.com/openai/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-groq-key');
      const body = JSON.parse(options.body);
      captured.push(body);
      const message = captured.length === 1
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'call_read', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }
        : { role: 'assistant', content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' };
      return new Response(JSON.stringify({ id: `fixture-${captured.length}`, object: 'chat.completion', created: 1, model: 'fixture-model', choices: [{ index: 0, message, finish_reason: captured.length === 1 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }), { headers: { 'content-type': 'application/json' } });
    };
    const handler = createTenderChatHandler({ temporaryRoot });
    const result = await handler({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-groq', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'groq-api', model: 'fixture-model', secret: 'fixture-groq-key' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(captured.length >= 2);
    assert.equal(captured[0].model, 'fixture-model');
    assert.equal('reasoning_effort' in captured[0], false);
    assert.ok(JSON.stringify(captured[1].messages).includes('La entrega es en dos meses'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('Azure Responses aísla el recurso, la clave y el despliegue de cada cliente', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-azure-transport-'));
  const originalFetch = globalThis.fetch, requests = [];
  const names = ['AZURE_OPENAI_BASE_URL', 'AZURE_OPENAI_RESOURCE_NAME', 'AZURE_OPENAI_API_VERSION', 'AZURE_OPENAI_DEPLOYMENT_NAME_MAP'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.AZURE_OPENAI_BASE_URL = 'https://otro.openai.azure.com/openai/v1';
  process.env.AZURE_OPENAI_RESOURCE_NAME = 'otro';
  process.env.AZURE_OPENAI_API_VERSION = 'wrong-version';
  process.env.AZURE_OPENAI_DEPLOYMENT_NAME_MAP = 'deploy-a=otro,deploy-b=otro';
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      const index = Math.floor(requests.length / 2), resource = ['empresa-a', 'empresa-b'][index];
      assert.ok(target.startsWith(`https://${resource}.openai.azure.com/openai/v1/`), target);
      assert.equal(new URL(target).searchParams.get('api-version'), 'v1');
      assert.equal(new Headers(options.headers).get('api-key'), `fixture-key-${index}`);
      requests.push(JSON.parse(options.body));
      const tool = { type: 'function_call', id: 'fc_fixture', call_id: 'call_fixture', name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }), status: 'completed' };
      const message = { type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>', annotations: [] }] };
      const items = requests.length % 2 ? [tool] : [message];
      const events = [{ type: 'response.created', response: { id: `resp-${requests.length}` } }, ...items.flatMap((item, i) => [{ type: 'response.output_item.added', output_index: i, item }, { type: 'response.output_item.done', output_index: i, item }]), { type: 'response.completed', response: { id: `resp-${requests.length}`, status: 'completed', output: items, usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 } } }];
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    for (const [index, resource] of ['empresa-a', 'empresa-b'].entries()) {
      const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
        job: { id: `azure-${index}`, projectId: 'project-test' }, signal: new AbortController().signal,
        getCredential: async () => ({ provider: 'azure-openai-api', resource, model: `deploy-${['a', 'b'][index]}`, secret: `fixture-key-${index}`, contextTokens: 128000, outputTokens: 8192 }),
        getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
      });
      assert.equal(result.answer, 'La entrega es en dos meses.');
    }
    assert.equal(requests.length, 4);
    for (const [index, request] of requests.entries()) {
      assert.equal(request.model, index < 2 ? 'deploy-a' : 'deploy-b');
      assert.equal(request.max_output_tokens, 8192);
      assert.equal(request.store, false);
    }
    assert.ok(JSON.stringify(requests[1].input).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('usa xAI Responses y conserva razonamiento cifrado al llamar herramientas', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-xai-responses-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.x.ai/v1/responses');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-xai-key');
      requests.push(JSON.parse(options.body));
      const reasoning = { type: 'reasoning', id: 'rs_fixture', summary: [], encrypted_content: 'encrypted-fixture' };
      const tool = { type: 'function_call', id: 'fc_fixture', call_id: 'call_fixture', name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }), status: 'completed' };
      const message = { type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>', annotations: [] }] };
      const items = requests.length === 1 ? [reasoning, tool] : [message];
      const events = [{ type: 'response.created', response: { id: `resp-${requests.length}` } }, ...items.flatMap((item, index) => [{ type: 'response.output_item.added', output_index: index, item }, { type: 'response.output_item.done', output_index: index, item }]), { type: 'response.completed', response: { id: `resp-${requests.length}`, status: 'completed', output: items, usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 } } }];
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-xai-responses', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'xai-api', model: 'grok-fixture', secret: 'fixture-xai-key', contextTokens: 128000, outputTokens: 50000 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 2);
    assert.equal(requests[0].store, false);
    assert.equal(requests[0].max_output_tokens, 50000);
    assert.ok(requests[0].include.includes('reasoning.encrypted_content'));
    assert.ok(JSON.stringify(requests[1].input).includes('encrypted-fixture'));
    assert.ok(JSON.stringify(requests[1].input).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-xai-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa Messages nativo de Claude con herramientas y sin red externa', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-claude-transport-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.anthropic.com/v1/messages');
      assert.equal(new Headers(options.headers).get('x-api-key'), 'sk-ant-api-fixture');
      requests.push(JSON.parse(options.body));
      const content = requests.length === 1
        ? [{ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'read-1', name: 'read', input: {} } }, { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ path: 'sources/1.md' }) } }, { type: 'content_block_stop', index: 0 }]
        : [{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' } }, { type: 'content_block_stop', index: 0 }];
      const events = [{ type: 'message_start', message: { id: `msg-${requests.length}`, type: 'message', role: 'assistant', model: 'claude-fixture', content: [], usage: { input_tokens: 10, output_tokens: 0 } } }, ...content,
        { type: 'message_delta', delta: { stop_reason: requests.length === 1 ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } }, { type: 'message_stop' }];
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-claude', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'anthropic-api', model: 'claude-fixture', secret: 'sk-ant-api-fixture' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.deepEqual(result.usage, {input:20,output:20,cacheRead:0,cacheWrite:0,reportedCalls:2,unreportedCalls:0});
    assert.ok(requests.length >= 2);
    assert.equal(requests[0].model, 'claude-fixture');
    assert.ok(JSON.stringify(requests[1].messages).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('sk-ant-api-fixture'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa Fireworks con protocolo Messages del catálogo Pi', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-fireworks-messages-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.fireworks.ai/inference/v1/messages');
      assert.equal(new Headers(options.headers).get('x-api-key'), 'fixture-fireworks-key');
      requests.push(JSON.parse(options.body));
      const content = requests.length === 1
        ? [{ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'read-1', name: 'read', input: {} } }, { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ path: 'sources/1.md' }) } }, { type: 'content_block_stop', index: 0 }]
        : [{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' } }, { type: 'content_block_stop', index: 0 }];
      const events = [{ type: 'message_start', message: { id: `msg-${requests.length}`, type: 'message', role: 'assistant', model: 'accounts/fireworks/models/deepseek-v4-flash', content: [], usage: { input_tokens: 10, output_tokens: 0 } } }, ...content,
        { type: 'message_delta', delta: { stop_reason: requests.length === 1 ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } }, { type: 'message_stop' }];
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-fireworks', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'fireworks-api', model: 'accounts/fireworks/models/deepseek-v4-flash', secret: 'fixture-fireworks-key' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 2);
    assert.equal(requests[0].model, 'accounts/fireworks/models/deepseek-v4-flash');
    assert.ok(JSON.stringify(requests[1].messages).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-fireworks-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa MiniMax con protocolo Messages del catálogo Pi', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-minimax-messages-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.minimax.io/anthropic/v1/messages');
      assert.equal(new Headers(options.headers).get('x-api-key'), 'fixture-minimax-key');
      requests.push(JSON.parse(options.body));
      const content = requests.length === 1
        ? [{ type:'content_block_start', index:0, content_block:{type:'thinking',thinking:''} }, {type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'Revisaré el documento.'}}, {type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'firma-fixture'}}, {type:'content_block_stop',index:0}, { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'read-1', name: 'read', input: {} } }, { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ path: 'sources/1.md' }) } }, { type: 'content_block_stop', index: 1 }]
        : [{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' } }, { type: 'content_block_stop', index: 0 }];
      const events = [{ type: 'message_start', message: { id: `msg-${requests.length}`, type: 'message', role: 'assistant', model: 'MiniMax-M3', content: [], usage: { input_tokens: 10, output_tokens: 0 } } }, ...content,
        { type: 'message_delta', delta: { stop_reason: requests.length === 1 ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } }, { type: 'message_stop' }];
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-minimax', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'minimax-api', model: 'MiniMax-M3', secret: 'fixture-minimax-key' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 2);
    assert.equal(requests[0].model, 'MiniMax-M3');
    assert.ok(JSON.stringify(requests[1].messages).includes('La entrega es en dos meses'));
    assert.ok(JSON.stringify(requests[1].messages).includes('firma-fixture'));
    assert.ok(JSON.stringify(requests[1].messages).includes('Revisaré el documento.'));
    assert.ok(!JSON.stringify(requests).includes('fixture-minimax-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa MiniMax China con protocolo Messages y destino propio', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-minimax-cn-messages-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.minimaxi.com/anthropic/v1/messages');
      assert.equal(new Headers(options.headers).get('x-api-key'), 'fixture-minimax-cn-key');
      requests.push(JSON.parse(options.body));
      const content = requests.length === 1
        ? [{ type:'content_block_start', index:0, content_block:{type:'thinking',thinking:''} }, {type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'Revisaré el documento.'}}, {type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'firma-fixture'}}, {type:'content_block_stop',index:0}, { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'read-1', name: 'read', input: {} } }, { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ path: 'sources/1.md' }) } }, { type: 'content_block_stop', index: 1 }]
        : [{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' } }, { type: 'content_block_stop', index: 0 }];
      const events = [{ type: 'message_start', message: { id: `msg-${requests.length}`, type: 'message', role: 'assistant', model: 'MiniMax-M3', content: [], usage: { input_tokens: 10, output_tokens: 0 } } }, ...content,
        { type: 'message_delta', delta: { stop_reason: requests.length === 1 ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } }, { type: 'message_stop' }];
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-minimax', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'minimax-cn-api', model: 'MiniMax-M3', secret: 'fixture-minimax-cn-key' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 2);
    assert.equal(requests[0].model, 'MiniMax-M3');
    assert.ok(JSON.stringify(requests[1].messages).includes('La entrega es en dos meses'));
    assert.ok(JSON.stringify(requests[1].messages).includes('firma-fixture'));
    assert.ok(JSON.stringify(requests[1].messages).includes('Revisaré el documento.'));
    assert.ok(!JSON.stringify(requests).includes('fixture-minimax-cn-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('rechaza una credencial OAuth de Claude antes de iniciar Pi', async () => {
  let started = false;
  const handler = createTenderChatHandler({ createAiService: () => { started = true; throw new Error('no debe iniciarse'); } });
  await assert.rejects(handler({ question: '¿Plazo?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
    signal: new AbortController().signal, getCredential: async () => ({ provider: 'anthropic-api', model: 'fixture', secret: 'sk-ant-oat-fixture' }),
  }), /proveedor compatible/);
  assert.equal(started, false);
});

test('usa Gemini API nativa con herramientas y sin red externa', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-gemini-transport-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      const parsed = new URL(target);
      assert.equal(parsed.origin, 'https://generativelanguage.googleapis.com');
      assert.match(parsed.pathname, /^\/v1beta\/models\/gemini-fixture:streamGenerateContent$/);
      assert.ok(!target.includes('fixture-gemini-key'));
      assert.equal(new Headers(options.headers).get('x-goog-api-key'), 'fixture-gemini-key');
      requests.push(JSON.parse(options.body));
      const part = requests.length === 1 ? { functionCall: { id: 'read-1', name: 'read', args: { path: 'sources/1.md' } } } : { text: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' };
      const response = { candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 } };
      return new Response(`data: ${JSON.stringify(response)}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-gemini', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'google-api', model: 'gemini-fixture', secret: 'fixture-gemini-key' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 2);
    assert.ok(JSON.stringify(requests[1]).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-gemini-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa Vertex AI exprés con clave y herramientas sin red externa', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-vertex-transport-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      const parsed = new URL(target);
      assert.equal(parsed.origin, 'https://aiplatform.googleapis.com');
      assert.match(parsed.pathname, /^\/v1\/publishers\/google\/models\/gemini-fixture:streamGenerateContent$/);
      assert.ok(!target.includes('fixture-vertex-key'));
      assert.equal(new Headers(options.headers).get('x-goog-api-key'), 'fixture-vertex-key');
      requests.push(JSON.parse(options.body));
      const part = requests.length === 1 ? { functionCall: { id: 'read-1', name: 'read', args: { path: 'sources/1.md' } } } : { text: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' };
      const response = { candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 } };
      return new Response(`data: ${JSON.stringify(response)}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-gemini', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'google-vertex-api', model: 'gemini-fixture', secret: 'fixture-vertex-key' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 2);
    assert.ok(JSON.stringify(requests[1]).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-vertex-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa DeepSeek con herramientas y reenvía el razonamiento del turno', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-deepseek-transport-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.deepseek.com/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-deepseek-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ reasoning_content: requests.length === 1 ? 'Revisaré el documento.' : 'Confirmaré el plazo.' }, { tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `deepseek-${requests.length}`, object: 'chat.completion.chunk', model: 'deepseek-fixture', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-deepseek', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'deepseek-api', model: 'deepseek-fixture', secret: 'fixture-deepseek-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_tokens, 8192); assert.equal('max_completion_tokens' in requests[0], false);
    assert.notEqual(requests[0].thinking?.type, 'disabled');
    assert.ok(JSON.stringify(requests[1].messages).includes('Revisaré el documento.'));
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    const replay = requests[2].messages.filter(message => message.role === 'assistant');
    assert.ok(replay.some(message => message.reasoning_content === 'Revisaré el documento.'));
    assert.ok(replay.some(message => message.reasoning_content === 'Confirmaré el plazo.'));
    assert.ok(!JSON.stringify(requests).includes('fixture-deepseek-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa Kimi API con herramientas y reenvía el razonamiento del turno', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-moonshot-transport-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.moonshot.ai/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-moonshot-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ reasoning_content: requests.length === 1 ? 'Revisaré el documento.' : 'Confirmaré el plazo.' }, { tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `moonshot-${requests.length}`, object: 'chat.completion.chunk', model: 'kimi-k2-thinking', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-moonshot', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'moonshot-api', model: 'kimi-k2-thinking', secret: 'fixture-moonshot-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_tokens, 8192); assert.equal('max_completion_tokens' in requests[0], false);
    assert.notEqual(requests[0].thinking?.type, 'disabled');
    assert.ok(JSON.stringify(requests[1].messages).includes('Revisaré el documento.'));
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    const replay = requests[2].messages.filter(message => message.role === 'assistant');
    assert.ok(replay.some(message => message.reasoning_content === 'Revisaré el documento.'));
    assert.ok(replay.some(message => message.reasoning_content === 'Confirmaré el plazo.'));
    assert.ok(!JSON.stringify(requests).includes('fixture-moonshot-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa Kimi API de China con herramientas y reenvía el razonamiento del turno', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-moonshot-cn-transport-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.moonshot.cn/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-moonshot-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ reasoning_content: requests.length === 1 ? 'Revisaré el documento.' : 'Confirmaré el plazo.' }, { tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `moonshot-${requests.length}`, object: 'chat.completion.chunk', model: 'kimi-k2-thinking', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-moonshot', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'moonshot-cn-api', model: 'kimi-k2-thinking', secret: 'fixture-moonshot-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_tokens, 8192); assert.equal('max_completion_tokens' in requests[0], false);
    assert.notEqual(requests[0].thinking?.type, 'disabled');
    assert.ok(JSON.stringify(requests[1].messages).includes('Revisaré el documento.'));
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    const replay = requests[2].messages.filter(message => message.role === 'assistant');
    assert.ok(replay.some(message => message.reasoning_content === 'Revisaré el documento.'));
    assert.ok(replay.some(message => message.reasoning_content === 'Confirmaré el plazo.'));
    assert.ok(!JSON.stringify(requests).includes('fixture-moonshot-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa Xiaomi MiMo API con herramientas y reenvía el razonamiento del turno', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-xiaomi-transport-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.xiaomimimo.com/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-xiaomi-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ reasoning_content: requests.length === 1 ? 'Revisaré el documento.' : 'Confirmaré el plazo.' }, { tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `xiaomi-${requests.length}`, object: 'chat.completion.chunk', model: 'mimo-v2-flash', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-xiaomi', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'xiaomi-api', model: 'mimo-v2-flash', secret: 'fixture-xiaomi-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_tokens, 8192); assert.equal('max_completion_tokens' in requests[0], false);
    assert.notEqual(requests[0].thinking?.type, 'disabled');
    assert.ok(JSON.stringify(requests[1].messages).includes('Revisaré el documento.'));
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    const replay = requests[2].messages.filter(message => message.role === 'assistant');
    assert.ok(replay.some(message => message.reasoning_content === 'Revisaré el documento.'));
    assert.ok(replay.some(message => message.reasoning_content === 'Confirmaré el plazo.'));
    assert.ok(!JSON.stringify(requests).includes('fixture-xiaomi-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa Z.AI API con herramientas y reenvía el razonamiento del turno', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-zai-transport-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.z.ai/api/paas/v4/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-zai-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ reasoning_content: requests.length === 1 ? 'Revisaré el documento.' : 'Confirmaré el plazo.' }, { tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `zai-${requests.length}`, object: 'chat.completion.chunk', model: 'glm-4.5-air', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-zai', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'zai-api', model: 'glm-4.5-air', secret: 'fixture-zai-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_tokens, 8192); assert.equal('max_completion_tokens' in requests[0], false);
    assert.notEqual(requests[0].thinking?.type, 'disabled');
    assert.ok(JSON.stringify(requests[1].messages).includes('Revisaré el documento.'));
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    const replay = requests[2].messages.filter(message => message.role === 'assistant');
    assert.ok(replay.some(message => message.reasoning_content === 'Revisaré el documento.'));
    assert.ok(replay.some(message => message.reasoning_content === 'Confirmaré el plazo.'));
    assert.ok(!JSON.stringify(requests).includes('fixture-zai-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('respeta streaming de herramientas del catálogo Z.AI', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-zai-transport-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.z.ai/api/paas/v4/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-zai-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ reasoning_content: requests.length === 1 ? 'Revisaré el documento.' : 'Confirmaré el plazo.' }, { tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `zai-${requests.length}`, object: 'chat.completion.chunk', model: 'glm-4.7', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-zai', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'zai-api', model: 'glm-4.7', secret: 'fixture-zai-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.equal(requests[0].tool_stream, true); assert.ok(requests.length >= 3); assert.equal(requests[0].max_tokens, 8192); assert.equal('max_completion_tokens' in requests[0], false);
    assert.notEqual(requests[0].thinking?.type, 'disabled');
    assert.ok(JSON.stringify(requests[1].messages).includes('Revisaré el documento.'));
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    const replay = requests[2].messages.filter(message => message.role === 'assistant');
    assert.ok(replay.some(message => message.reasoning_content === 'Revisaré el documento.'));
    assert.ok(replay.some(message => message.reasoning_content === 'Confirmaré el plazo.'));
    assert.ok(!JSON.stringify(requests).includes('fixture-zai-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa Cerebras con herramientas de Pi y destino fijo', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-cerebras-transport-'));
  const originalFetch = globalThis.fetch, requests = [], stages = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.cerebras.ai/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-cerebras-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ reasoning_content: requests.length === 1 ? 'Revisaré el documento.' : 'Confirmaré el plazo.' }, { tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `cerebras-${requests.length}`, object: 'chat.completion.chunk', model: 'cerebras-fixture', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      reportProgress: stage => stages.push(stage),
      job: { id: 'task-cerebras', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'cerebras-api', model: 'cerebras-fixture', secret: 'fixture-cerebras-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(stages.includes('preparing')); assert.ok(stages.includes('reading')); assert.ok(stages.includes('generating'));
    assert.ok(stages.every(stage => ['preparing', 'reading', 'generating'].includes(stage)));
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_completion_tokens, 8192); assert.equal('store' in requests[0], false);
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-cerebras-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa Hugging Face con herramientas de Pi y destino fijo', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-huggingface-transport-'));
  const originalFetch = globalThis.fetch, requests = [], stages = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://router.huggingface.co/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-huggingface-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ reasoning_content: requests.length === 1 ? 'Revisaré el documento.' : 'Confirmaré el plazo.' }, { tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `huggingface-${requests.length}`, object: 'chat.completion.chunk', model: 'huggingface-fixture', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      reportProgress: stage => stages.push(stage),
      job: { id: 'task-huggingface', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'huggingface-api', model: 'huggingface-fixture', secret: 'fixture-huggingface-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(stages.includes('preparing')); assert.ok(stages.includes('reading')); assert.ok(stages.includes('generating'));
    assert.ok(stages.every(stage => ['preparing', 'reading', 'generating'].includes(stage)));
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_tokens, 8192); assert.equal('store' in requests[0], false);
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-huggingface-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa Together con herramientas de Pi y destino fijo', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-together-transport-'));
  const originalFetch = globalThis.fetch, requests = [], stages = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.together.ai/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-together-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ reasoning_content: requests.length === 1 ? 'Revisaré el documento.' : 'Confirmaré el plazo.' }, { tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `together-${requests.length}`, object: 'chat.completion.chunk', model: 'Qwen/Qwen2.5-7B-Instruct-Turbo', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      reportProgress: stage => stages.push(stage),
      job: { id: 'task-together', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'together-api', model: 'Qwen/Qwen2.5-7B-Instruct-Turbo', secret: 'fixture-together-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_tokens, 8192); assert.equal('max_completion_tokens' in requests[0], false); assert.equal('store' in requests[0], false);
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-together-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa Fireworks con Chat Completions del catálogo Pi', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-fireworks-transport-'));
  const originalFetch = globalThis.fetch, requests = [], stages = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.fireworks.ai/inference/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-fireworks-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ reasoning_content: requests.length === 1 ? 'Revisaré el documento.' : 'Confirmaré el plazo.' }, { tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `fireworks-${requests.length}`, object: 'chat.completion.chunk', model: 'accounts/fireworks/models/glm-5p2', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      reportProgress: stage => stages.push(stage),
      job: { id: 'task-fireworks', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'fireworks-api', model: 'accounts/fireworks/models/glm-5p2', secret: 'fixture-fireworks-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_completion_tokens, 8192); assert.equal('store' in requests[0], false);
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-fireworks-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa NVIDIA NIM con herramientas y cabeceras del catálogo Pi', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-nvidia-transport-'));
  const originalFetch = globalThis.fetch, requests = [], stages = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://integrate.api.nvidia.com/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-nvidia-key');
      assert.equal(new Headers(options.headers).get('nvcf-poll-seconds'), '3600');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ reasoning_content: requests.length === 1 ? 'Revisaré el documento.' : 'Confirmaré el plazo.' }, { tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `nvidia-${requests.length}`, object: 'chat.completion.chunk', model: 'meta/llama-3.1-70b-instruct', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      reportProgress: stage => stages.push(stage),
      job: { id: 'task-nvidia', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'nvidia-api', model: 'meta/llama-3.1-70b-instruct', secret: 'fixture-nvidia-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_tokens, 8192); assert.equal('max_completion_tokens' in requests[0], false); assert.equal('store' in requests[0], false);
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-nvidia-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('respeta la configuración de razonamiento Together del catálogo Pi', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-together-transport-'));
  const originalFetch = globalThis.fetch, requests = [], stages = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.together.ai/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-together-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ reasoning_content: requests.length === 1 ? 'Revisaré el documento.' : 'Confirmaré el plazo.' }, { tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `together-${requests.length}`, object: 'chat.completion.chunk', model: 'MiniMaxAI/MiniMax-M3', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      reportProgress: stage => stages.push(stage),
      job: { id: 'task-together', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'together-api', model: 'MiniMaxAI/MiniMax-M3', secret: 'fixture-together-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_tokens, 8192); assert.equal('max_completion_tokens' in requests[0], false); assert.equal('store' in requests[0], false); assert.deepEqual(requests[0].reasoning, {enabled: false});
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-together-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('usa Mistral API nativa con herramientas y sin red externa', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-mistral-transport-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const request = url instanceof Request ? url : new Request(url, options);
      if (request.url.startsWith('http://127.0.0.1:') || request.url.startsWith('http://[::1]:') || request.url.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(request.url, 'https://api.mistral.ai/v1/chat/completions');
      assert.equal(request.headers.get('authorization'), 'Bearer fixture-mistral-key');
      requests.push(await request.clone().json());
      const delta = requests.length === 1 ? { role: 'assistant', tool_calls: [{ index: 0, id: 'Abc123456', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] } : { role: 'assistant', content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' };
      const chunk = { id: `mistral-${requests.length}`, object: 'chat.completion.chunk', created: 1, model: 'mistral-fixture', choices: [{ index: 0, delta, finish_reason: requests.length === 1 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } };
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-mistral', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'mistral-api', model: 'mistral-fixture', secret: 'fixture-mistral-key', contextTokens: 128000, outputTokens: 4096 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 2); assert.equal(requests[0].max_tokens, 4096);
    assert.ok(JSON.stringify(requests[1].messages).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-mistral-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('rechaza UTF-8 inválido y respeta la cancelación antes de iniciar', async () => {
  const handler = createTenderChatHandler({ createAiService() { throw Error('no debe iniciarse'); } });
  const base = {
    job: { id: 'task-invalid', projectId: 'project-test' },
    getCredential: async () => ({ provider: 'opencode-go', model: 'test', secret: 'fixture' }),
    getFileInfo: async () => ({ name: 'invalido.txt', contentType: 'text/plain', bytes: new Uint8Array([0xff, 0xfe]).buffer }),
  };
  await assert.rejects(handler({ question: '¿Plazo?', fileIds: ['x'], dataProcessingConsent: true }, { ...base, signal: new AbortController().signal }), /UTF-8/);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(handler({ question: '¿Plazo?', fileIds: ['x'], dataProcessingConsent: true }, { ...base, signal: abort.signal }), { name: 'AbortError' });
});

test('rechaza un PDF etiquetado erróneamente como texto', async () => {
  const handler = createTenderChatHandler({ createAiService() { throw Error('no debe iniciarse'); } });
  await assert.rejects(handler({ question: '¿Plazo?', fileIds: ['x'], dataProcessingConsent: true }, {
    job: { id: 'task-pdf', projectId: 'project-test' }, signal: new AbortController().signal,
    getCredential: async () => ({ provider: 'opencode-go', model: 'test', secret: 'fixture' }),
    getFileInfo: async () => ({ name: 'pliego.pdf', contentType: 'text/plain', bytes: new TextEncoder().encode('%PDF-1.4\nfixture').buffer }),
  }), /formato/i);
});


test('procesa PDF con texto y DOCX con el parser local existente', { timeout: 30_000 }, async () => {
  const requireClient = createRequire(new URL('../../client/package.json', import.meta.url));
  const { PDFDocument, StandardFonts } = requireClient('pdf-lib');
  const { Document, Packer, Paragraph } = requireClient('docx');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('PDF deadline is two months', { x: 40, y: 700, font });
  const pdfBytes = await pdf.save();
  const docxBytes = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('DOCX delivery is next year')] }] }));
  let calls = 0;
  let readBoth = false;
  const handler = createTenderChatHandler({ createAiService: ({ configStore }) => ({
    getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }),
    async runAgentChatCompletion(request) {
      calls++;
      const ctx = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `fixture-docs-${calls}` };
      request.onRequestStart?.(ctx);
      let message, finish;
      if (calls === 1) {
        message = { role: 'assistant', content: null, tool_calls: ['sources/1.md', 'sources/2.md'].map((path, index) => ({ id: `read-${index}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path }) } })) };
        finish = 'tool_calls';
      } else {
        const messages = JSON.stringify(request.body.messages);
        readBoth = messages.includes('PDF deadline is two months') && messages.includes('DOCX delivery is next year');
        message = { role: 'assistant', content: 'Documents read.\n<suggested_questions>[]</suggested_questions>' };
        finish = 'stop';
      }
      return request.consumeResponse(new Response(JSON.stringify({ id: `docs-${calls}`, object: 'chat.completion', model: 'default', choices: [{ index: 0, message, finish_reason: finish }] }), { headers: { 'content-type': 'application/json' } }), ctx);
    },
  }) });
  const result = await handler({ question: 'What are the deadlines?', fileIds: ['pdf', 'docx'], language: 'en', dataProcessingConsent: true }, {
    job: { id: 'docs-task', projectId: 'docs-project' }, signal: new AbortController().signal,
    getCredential: async () => ({ provider: 'opencode-go', model: 'test', secret: 'fixture' }),
    getFileInfo: async id => id === 'pdf' ? { name: 'pliego.pdf', contentType: 'application/pdf', bytes: pdfBytes } : { name: 'oferta.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: docxBytes },
  });
  assert.equal(result.answer, 'Documents read.');
  assert.equal(readBoth, true);
});


test('no inicia una consulta Contributor sin consentimiento explícito', async () => {
  let accessed = false;
  const handler = createTenderChatHandler();
  await assert.rejects(handler({ question: '¿Plazo?', fileIds: ['x'] }, {
    job: { id: 'no-consent', projectId: 'project-test' }, signal: new AbortController().signal,
    getCredential: async () => { accessed = true; return {}; },
    getFileInfo: async () => { accessed = true; return {}; },
  }), /consentimiento/i);
  assert.equal(accessed, false);
});

test('cancela Pi durante una solicitud y elimina los archivos temporales', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-pi-cancel-'));
  const abort = new AbortController();
  let providerStarted = false;
  try {
    const handler = createTenderChatHandler({ temporaryRoot, createAiService: ({ configStore }) => ({
      getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }),
      async runAgentChatCompletion(request) {
        providerStarted = true;
        request.onRequestStart?.({ config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: 'cancel-fixture' });
        setTimeout(() => abort.abort(), 10);
        await new Promise((_, reject) => {
          if (request.signal.aborted) return reject(new DOMException('Abortado', 'AbortError'));
          request.signal.addEventListener('abort', () => reject(new DOMException('Abortado', 'AbortError')), { once: true });
        });
      },
    }) });
    await assert.rejects(handler({ question: '¿Plazo?', fileIds: ['x'], dataProcessingConsent: true }, {
      job: { id: 'task-cancel', projectId: 'project-test' }, signal: abort.signal,
      getCredential: async () => ({ provider: 'opencode-go', model: 'test', secret: 'fixture' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Plazo de dos meses').buffer }),
    }));
    assert.equal(providerStarted, true);
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('rechaza un modelo Fireworks desconocido antes de llamar al proveedor', {timeout: 30000}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-fireworks-unknown-'));
  const originalFetch = globalThis.fetch; let external = false;
  try {
    globalThis.fetch = async (url, options) => {
      if (/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):/.test(String(url))) return originalFetch(url, options);
      external = true; throw new Error('external request');
    };
    const handler = createTenderChatHandler({temporaryRoot: root});
    await assert.rejects(handler({question:'¿Plazo?',fileIds:['f'],language:'en',dataProcessingConsent:true},{job:{id:'unknown',projectId:'p'},signal:new AbortController().signal,getCredential:async()=>({provider:'fireworks-api',model:'unknown-model',secret:'fixture-fireworks-key'}),getFileInfo:async()=>({name:'source.txt',contentType:'text/plain',bytes:new TextEncoder().encode('Plazo: dos meses').buffer})}));
    assert.equal(external, false);
  } finally { globalThis.fetch = originalFetch; await rm(root,{recursive:true,force:true}); }
});

test('usa Ant Ling con herramientas y catálogo Pi', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-ant-ling-transport-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.ant-ling.com/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-ant-ling-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `ant-ling-${requests.length}`, object: 'chat.completion.chunk', model: 'Ling-2.6-flash', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-ant-ling', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'ant-ling-api', model: 'Ling-2.6-flash', secret: 'fixture-ant-ling-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_tokens, 8192); assert.equal('max_completion_tokens' in requests[0], false);
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-ant-ling-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});


test('Ant Ling conserva el razonamiento al usar herramientas', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-ant-ling-thinking-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://api.ant-ling.com/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-ant-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ reasoning_content: requests.length === 1 ? 'Revisaré el documento.' : 'Confirmaré el plazo.' }, { tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `ant-${requests.length}`, object: 'chat.completion.chunk', model: 'Ring-2.6-1T', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-ant-thinking', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'ant-ling-api', model: 'Ring-2.6-1T', secret: 'fixture-ant-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_tokens, 8192); assert.equal('max_completion_tokens' in requests[0], false);
    assert.ok(JSON.stringify(requests[1].messages).includes('Revisaré el documento.'));
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    const replay = requests[2].messages.filter(message => message.role === 'assistant');
    assert.ok(replay.some(message => message.reasoning_content === 'Revisaré el documento.'));
    assert.ok(replay.some(message => message.reasoning_content === 'Confirmaré el plazo.'));
    assert.ok(!JSON.stringify(requests).includes('fixture-ant-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});


test('rechaza un modelo Ant Ling desconocido antes de llamar al proveedor', {timeout: 30000}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-ant-ling-unknown-'));
  const originalFetch = globalThis.fetch; let external = false;
  try {
    globalThis.fetch = async (url, options) => {
      if (/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):/.test(String(url))) return originalFetch(url, options);
      external = true; throw new Error('external request');
    };
    const handler = createTenderChatHandler({temporaryRoot: root});
    await assert.rejects(handler({question:'¿Plazo?',fileIds:['f'],language:'en',dataProcessingConsent:true},{job:{id:'unknown',projectId:'p'},signal:new AbortController().signal,getCredential:async()=>({provider:'ant-ling-api',model:'unknown-model',secret:'fixture-ant-key'}),getFileInfo:async()=>({name:'source.txt',contentType:'text/plain',bytes:new TextEncoder().encode('Plazo: dos meses').buffer})}));
    assert.equal(external, false);
  } finally { globalThis.fetch = originalFetch; await rm(root,{recursive:true,force:true}); }
});


test('usa Zen Chat Completions con herramientas', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-zen-chat-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://opencode.ai/zen/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-zen-key');
      requests.push(JSON.parse(options.body));
      const chunks = requests.length <= 2
        ? [{ tool_calls: [{ index: 0, id: `call-read-${requests.length}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }) } }] }]
        : [{ content: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' }];
      const events = chunks.map((delta, index) => ({ id: `ant-ling-${requests.length}`, object: 'chat.completion.chunk', model: 'big-pickle', choices: [{ index: 0, delta, finish_reason: index === chunks.length - 1 ? (requests.length <= 2 ? 'tool_calls' : 'stop') : null }] }));
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-zen', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'opencode-zen', model: 'big-pickle', secret: 'fixture-zen-key', contextTokens: 128000, outputTokens: 8192 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 3); assert.equal(requests[0].max_tokens, 8192); assert.equal('max_completion_tokens' in requests[0], false);
    assert.ok(JSON.stringify(requests[2].messages).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-zen-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});



test('usa Zen Responses con herramientas', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-zen-responses-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://opencode.ai/zen/v1/responses');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-zen-key');
      requests.push(JSON.parse(options.body));
      const reasoning = { type: 'reasoning', id: 'rs_fixture', summary: [], encrypted_content: 'encrypted-fixture' };
      const tool = { type: 'function_call', id: 'fc_fixture', call_id: 'call_fixture', name: 'read', arguments: JSON.stringify({ path: 'sources/1.md' }), status: 'completed' };
      const message = { type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>', annotations: [] }] };
      const items = requests.length === 1 ? [reasoning, tool] : [message];
      const events = [{ type: 'response.created', response: { id: `resp-${requests.length}` } }, ...items.flatMap((item, index) => [{ type: 'response.output_item.added', output_index: index, item }, { type: 'response.output_item.done', output_index: index, item }]), { type: 'response.completed', response: { id: `resp-${requests.length}`, status: 'completed', output: items, usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 } } }];
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-zen-responses', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'opencode-zen', model: 'gpt-5', secret: 'fixture-zen-key', contextTokens: 128000, outputTokens: 50000 }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 2);
    assert.equal(requests[0].max_output_tokens, 50000);
    assert.ok(JSON.stringify(requests[1].input).includes('encrypted-fixture'));
    assert.ok(JSON.stringify(requests[1].input).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-zen-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});


test('usa Zen Messages con herramientas', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-zen-messages-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      assert.equal(target, 'https://opencode.ai/zen/v1/messages');
      assert.equal(new Headers(options.headers).get('x-api-key'), 'fixture-zen-key');
      requests.push(JSON.parse(options.body));
      const content = requests.length === 1
        ? [{ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'read-1', name: 'read', input: {} } }, { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ path: 'sources/1.md' }) } }, { type: 'content_block_stop', index: 0 }]
        : [{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' } }, { type: 'content_block_stop', index: 0 }];
      const events = [{ type: 'message_start', message: { id: `msg-${requests.length}`, type: 'message', role: 'assistant', model: 'claude-sonnet-4-5', content: [], usage: { input_tokens: 10, output_tokens: 0 } } }, ...content,
        { type: 'message_delta', delta: { stop_reason: requests.length === 1 ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } }, { type: 'message_stop' }];
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-zen-messages', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'opencode-zen', model: 'claude-sonnet-4-5', secret: 'fixture-zen-key' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.deepEqual(result.usage, {input:20,output:20,cacheRead:0,cacheWrite:0,reportedCalls:2,unreportedCalls:0});
    assert.ok(requests.length >= 2);
    assert.equal(requests[0].model, 'claude-sonnet-4-5');
    assert.ok(JSON.stringify(requests[1].messages).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-zen-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});


test('usa Zen Gemini con herramientas', { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-zen-gemini-'));
  const originalFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('http://127.0.0.1:') || target.startsWith('http://[::1]:') || target.startsWith('http://localhost:')) return originalFetch(url, options);
      const parsed = new URL(target);
      assert.equal(parsed.origin, 'https://opencode.ai');
      assert.match(parsed.pathname, /^\/zen\/v1\/models\/gemini-3-flash:streamGenerateContent$/);
      assert.ok(!target.includes('fixture-zen-key'));
      assert.equal(new Headers(options.headers).get('x-goog-api-key'), 'fixture-zen-key');
      requests.push(JSON.parse(options.body));
      const part = requests.length === 1 ? { functionCall: { id: 'read-1', name: 'read', args: { path: 'sources/1.md' } } } : { text: 'La entrega es en dos meses.\n<suggested_questions>[]</suggested_questions>' };
      const response = { candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 } };
      return new Response(`data: ${JSON.stringify(response)}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    };
    const result = await createTenderChatHandler({ temporaryRoot })({ question: '¿Cuándo es la entrega?', fileIds: ['f'], language: 'es', dataProcessingConsent: true }, {
      job: { id: 'task-zen-gemini', projectId: 'project-test' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'opencode-zen', model: 'gemini-3-flash', secret: 'fixture-zen-key' }),
      getFileInfo: async () => ({ name: 'pliego.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('La entrega es en dos meses').buffer }),
    });
    assert.equal(result.answer, 'La entrega es en dos meses.');
    assert.ok(requests.length >= 2);
    assert.ok(JSON.stringify(requests[1]).includes('La entrega es en dos meses'));
    assert.ok(!JSON.stringify(requests).includes('fixture-zen-key'));
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { globalThis.fetch = originalFetch; await rm(temporaryRoot, { recursive: true, force: true }); }
});


test('rechaza un modelo Zen desconocido antes de llamar al proveedor', {timeout: 30000}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-fireworks-unknown-'));
  const originalFetch = globalThis.fetch; let external = false;
  try {
    globalThis.fetch = async (url, options) => {
      if (/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):/.test(String(url))) return originalFetch(url, options);
      external = true; throw new Error('external request');
    };
    const handler = createTenderChatHandler({temporaryRoot: root});
    await assert.rejects(handler({question:'¿Plazo?',fileIds:['f'],language:'en',dataProcessingConsent:true},{job:{id:'unknown',projectId:'p'},signal:new AbortController().signal,getCredential:async()=>({provider:'opencode-zen',model:'unknown-model',secret:'fixture-zen-key'}),getFileInfo:async()=>({name:'source.txt',contentType:'text/plain',bytes:new TextEncoder().encode('Plazo: dos meses').buffer})}));
    assert.equal(external, false);
  } finally { globalThis.fetch = originalFetch; await rm(root,{recursive:true,force:true}); }
});


test('Vertex exprés rechaza marcadores que activarían credenciales del entorno',async()=>{
 let started=false;const handler=createTenderChatHandler({createAiService:()=>{started=true;throw new Error('no debe iniciarse');}});
 for(const secret of ['gcp-vertex-credentials','<API_KEY>','   '])await assert.rejects(handler({question:'¿Plazo?',fileIds:['f'],language:'es',dataProcessingConsent:true},{signal:new AbortController().signal,getCredential:async()=>({provider:'google-vertex-api',model:'gemini-fixture',secret})}),/proveedor compatible/);
 assert.equal(started,false);
});

test('continúa con fuentes legibles e informa los PDF sin texto', {timeout:30000}, async()=>{
 const temporaryRoot=await mkdtemp(join(tmpdir(),'savia-partial-chat-'));let calls=0,sawPartial=false;
 try{const handler=createTenderChatHandler({temporaryRoot,parse:async()=>{const error=new Error('no text');error.code='pdf_text_layer_missing';throw error;},createAiService:({configStore})=>({getConfig:()=>configStore.load(),getTextQueueStatus:()=>({active:0,queued:0,limit:1}),async runAgentChatCompletion(request){calls++;sawPartial ||= JSON.stringify(request.body).includes('cobertura de fuentes es parcial');const context={config:configStore.load(),requestBody:{...request.body,stream:false},requestId:`partial-${calls}`};request.onRequestStart?.(context);const message=calls===1?{role:'assistant',content:null,tool_calls:[{id:'read-one',type:'function',function:{name:'read',arguments:JSON.stringify({path:'sources/1.md'})}}]}:{role:'assistant',content:'El plazo es tres meses. Respuesta parcial.\n<suggested_questions>[]</suggested_questions>'};return request.consumeResponse(new Response(JSON.stringify({id:`partial-${calls}`,object:'chat.completion',choices:[{index:0,message,finish_reason:calls===1?'tool_calls':'stop'}]}),{headers:{'content-type':'application/json'}}),context);}})});
 const result=await handler({question:'¿Cuál es el plazo?',fileIds:['text','scan'],language:'es',dataProcessingConsent:true},{job:{id:'partial',projectId:'project'},signal:new AbortController().signal,getCredential:async()=>({provider:'opencode-go',model:'fixture',secret:'fixture'}),getFileInfo:async id=>id==='text'?{name:'pliego.txt',contentType:'text/plain',bytes:new TextEncoder().encode('El plazo es tres meses').buffer}:{name:'anexo.pdf',contentType:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.7').buffer}});
 assert.match(result.answer,/tres meses/);assert.equal(result.readableSourceCount,1);assert.equal(result.unreadableSources[0].fileName,'anexo.pdf');assert.match(result.unreadableSources[0].reason,/OCR/);assert.ok(sawPartial);assert.deepEqual(await readdir(temporaryRoot),[]);
 }finally{await rm(temporaryRoot,{recursive:true,force:true});}
});
test('no inicia inferencia si todos los documentos carecen de texto',async()=>{
 let called=false;const handler=createTenderChatHandler({parse:async()=>{const e=new Error('scan');e.code='pdf_text_layer_missing';throw e;},createAiService:()=>{called=true;throw Error('unexpected inference');}});
 await assert.rejects(handler({question:'Resume',fileIds:['scan'],language:'es',dataProcessingConsent:true},{job:{id:'all-scans',projectId:'p'},getCredential:async()=>({provider:'opencode-go',model:'fixture',secret:'fixture'}),getFileInfo:async()=>({name:'escaneado.pdf',contentType:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.7').buffer})}),/escaneado.pdf.*OCR/);assert.equal(called,false);
});
