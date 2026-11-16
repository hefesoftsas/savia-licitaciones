import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner = process.env.SAVIA_TEST_RUNNER_MODULE || fileURLToPath(new URL('../tender-chat.mjs', import.meta.url));
test('Pi procesa una consulta de texto sin cargar el paquete Electron', { timeout: 30_000 }, () => {
  const script = `
    import Module from 'node:module';
    import { pathToFileURL } from 'node:url';
    import { createRequire } from 'node:module';
    import { dirname, resolve } from 'node:path';
    const original = Module._load;
    let electronLoads = 0;
    Module._load = function(name, ...args) { if (name === 'electron') { electronLoads++; throw new Error('Electron no debe cargarse en el runner'); } return original.call(this, name, ...args); };
    const { createTenderChatHandler } = await import(pathToFileURL(process.argv[1]));
    const handler = createTenderChatHandler({ createAiService: ({ configStore }) => ({
      getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }),
      async runAgentChatCompletion(request) {
        const context = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: 'headless-fixture' };
        request.onRequestStart?.(context);
        const result = { id: 'fixture', object: 'chat.completion', model: 'test', choices: [{ index: 0, message: { role: 'assistant', content: 'Respuesta de prueba.\\n<suggested_questions>[]</suggested_questions>' }, finish_reason: 'stop' }] };
        return request.consumeResponse(new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } }), context);
      }
    }) });
    const result = await handler({ question: 'Pregunta', fileIds: ['file'], dataProcessingConsent: true }, {
      job: { id: 'fixture', projectId: 'fixture' }, signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'opencode-go', model: 'test', secret: 'test-secret' }),
      getFileInfo: async () => ({ name: 'test.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Texto').buffer })
    });
    if (result.answer !== 'Respuesta de prueba.') throw new Error('Respuesta incorrecta');
    const require = createRequire(import.meta.url);
    const errorUtils = require(resolve(dirname(process.argv[1]), '../client/electron/utils/aiHttpError.cjs'));
    errorUtils.emitAiHttpErrorToWindows({ status: 500, body: '<html>error</html>', contentType: 'text/html' });
    if (electronLoads) throw new Error('El manejo de errores intentó cargar Electron');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, runner], { encoding: 'utf8', timeout: 25_000, env: { ...process.env, SAVIA_HEADLESS_RUNNER: '1' } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('el ensamblador Word se carga sin Electron', { timeout: 30000 }, () => {
  const modulePath = process.env.SAVIA_TEST_EXPORT_MODULE || fileURLToPath(new URL('../technical-plan-export.mjs', import.meta.url));
  const script = `
    import Module from 'node:module';
    import { pathToFileURL } from 'node:url';
    const original = Module._load;
    Module._load = function(name, ...args) { if (name === 'electron') throw new Error('Electron no debe cargarse'); return original.call(this, name, ...args); };
    const { exportTechnicalPlan } = await import(pathToFileURL(process.argv[1]));
    const result = await exportTechnicalPlan({ projectTitle: 'Oferta', outline: [{ id:'a', number:'1', title:'Capítulo', content_mode:'manual-fill', content:'Texto', children:[] }] }, {
      createHelper: () => ({ createRestrictedHtmlDocx: async () => ({ bytes: Buffer.from('ok'), imageWarnings: [] }), close: async () => {} })
    });
    if (result.bytes.toString() !== 'ok') throw new Error('Resultado inválido');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, modulePath], { encoding: 'utf8', timeout: 25000, env: { ...process.env, SAVIA_HEADLESS_RUNNER: '1' } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('la generación inicial del índice se carga sin Electron', () => {
  const modulePath = fileURLToPath(new URL('../technical-outline-roots.mjs', import.meta.url));
  const script = `import Module from 'node:module'; import { pathToFileURL } from 'node:url'; const original = Module._load; Module._load = function(name, ...args) { if (name === 'electron') throw new Error('Electron no debe cargarse'); return original.call(this, name, ...args); }; const { createOutlineRootsHandler } = await import(pathToFileURL(process.argv[1])); if (typeof createOutlineRootsHandler !== 'function') throw new Error('No se cargó el generador');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, modulePath], { encoding: 'utf8', timeout: 25000, env: { ...process.env, SAVIA_HEADLESS_RUNNER: '1' } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('los hechos globales se cargan sin Electron', () => {
  const modulePath = fileURLToPath(new URL('../global-facts.mjs', import.meta.url));
  const script = `import Module from 'node:module'; import { pathToFileURL } from 'node:url'; const original = Module._load; Module._load = function(name, ...args) { if (name === 'electron') throw new Error('Electron no debe cargarse'); return original.call(this, name, ...args); }; const { createGlobalFactsHandler } = await import(pathToFileURL(process.argv[1])); if (typeof createGlobalFactsHandler !== 'function') throw new Error('No se cargó la tarea');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, modulePath], { encoding: 'utf8', timeout: 25000, env: { ...process.env, SAVIA_HEADLESS_RUNNER: '1' } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
