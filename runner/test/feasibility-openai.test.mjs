import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFeasibilityAnalysisHandler } from '../feasibility-analysis.mjs';
import { createFeasibilityOutlineHandler } from '../feasibility-outline.mjs';
import { createFeasibilityParametersHandler } from '../feasibility-parameters.mjs';
import { createFeasibilityContentHandler } from '../feasibility-content.mjs';
import { textProviderConfig } from '../text-provider.mjs';

const fields = ['project_overview', 'background_and_necessity', 'demand_and_output', 'site_and_conditions', 'construction_and_technical_conditions', 'operation_conditions', 'investment_and_financing', 'impact_and_risks', 'missing_information'];
const snapshot = { projectInfo: { projectName: 'Hospital' }, sources: [], analysisMarkdown: 'Análisis', outlineTemplate: 'government', targetWords: 2000, keyParametersMarkdown: 'Parámetros', outline: [{ id: 'a', title: 'Alcance', description: '', content: '' }] };
const cases = [
  ['análisis', createFeasibilityAnalysisHandler, 'getFeasibilityAnalysisContext', {}],
  ['índice', createFeasibilityOutlineHandler, 'getFeasibilityOutlineContext', {}],
  ['parámetros', createFeasibilityParametersHandler, 'getFeasibilityParametersContext', {}],
  ['contenido', createFeasibilityContentHandler, 'getFeasibilityContentContext', { mode: 'missing' }],
];
test('la configuración rechaza proveedores no admitidos', () => {
  assert.throws(() => textProviderConfig({ provider: 'openrouter', model: 'x', secret: 'x' }), /Unsupported/);
  assert.throws(() => textProviderConfig({ provider: '__proto__', model: 'x', secret: 'x' }), /Unsupported/);
  assert.throws(() => textProviderConfig({ provider: 'openai-api', model: '', secret: 'x' }), /Unsupported/);
});
test('la API estándar de Xiaomi no acepta claves de Token Plan', () => {
  const credential = { provider: 'xiaomi-api', model: 'mimo-fixture', secret: 'sk-api-fixture' };
  assert.equal(textProviderConfig(credential).base_url, 'https://api.xiaomimimo.com/v1');
  for (const secret of ['tp-fixture', 'ttp-fixture']) assert.throws(() => textProviderConfig({ ...credential, secret }), /Unsupported/);
});
test('Azure usa un recurso por cliente y rechaza destinos y despliegues inválidos', () => {
  const credential = { provider: 'azure-openai-api', resource: 'empresa-a', model: 'modelo-deploy', secret: 'fixture-key', contextTokens: 128000, outputTokens: 8192 };
  const config = textProviderConfig(credential);
  assert.equal(config.base_url, 'https://empresa-a.openai.azure.com/openai/v1');
  assert.equal(config.model_name, 'modelo-deploy');
  assert.equal(config.web_runner_azure_native, true);
  for (const resource of ['', '../otro', 'evil.com', 'empresa-a.openai.azure.com', '-invalid', 'invalid-']) {
    assert.throws(() => textProviderConfig({ ...credential, resource }), /Unsupported/);
  }
  for (const model of ['', '../deployment', 'name=other', 'deploy,other']) {
    assert.throws(() => textProviderConfig({ ...credential, model }), /Unsupported/);
  }
  assert.throws(() => textProviderConfig({ ...credential, outputTokens: 15 }), /Unsupported/);
});
test('la configuración usa Messages nativo para claves API de Claude y rechaza OAuth', () => {
  const config = textProviderConfig({ provider: 'anthropic-api', model: 'claude-fixture', secret: 'sk-ant-api-fixture' });
  assert.equal(config.text_model_provider, 'anthropic-api');
  assert.equal(config.base_url, 'https://api.anthropic.com');
  assert.equal(config.web_runner_anthropic_native, true);
  assert.equal(config.reasoning_effort, '');
  assert.throws(() => textProviderConfig({ provider: 'anthropic-api', model: 'fixture', secret: 'sk-ant-oat-fixture' }), /Unsupported/);
});
test('la configuración usa Gemini API nativa y limita el identificador de modelo', () => {
  const config = textProviderConfig({ provider: 'google-api', model: 'gemini-fixture', secret: 'fixture-google-key' });
  assert.equal(config.base_url, 'https://generativelanguage.googleapis.com/v1beta');
  assert.equal(config.web_runner_google_native, true);
  assert.throws(() => textProviderConfig({ provider: 'google-api', model: '../invalid', secret: 'fixture-google-key' }), /Unsupported/);
});
test('usa los límites de la credencial y conserva los valores anteriores por defecto', () => {
  const credential = { provider: 'openai-api', model: 'fixture', secret: 'fixture', contextTokens: 128000, outputTokens: 8192 };
  const config = textProviderConfig(credential);
  assert.equal(config.context_length_limit, 128000);
  assert.equal(config.output_token_limit, 8192);
  const legacy = textProviderConfig({ provider: 'openai-api', model: 'fixture', secret: 'fixture' });
  assert.equal(legacy.context_length_limit, 400000);
  assert.equal(legacy.output_token_limit, 16384);
  assert.throws(() => textProviderConfig({ ...credential, outputTokens: 128001 }), /Unsupported/);
  assert.throws(() => textProviderConfig({ provider: 'xai-api', model: 'fixture', secret: 'fixture', outputTokens: 15 }), /Unsupported/);
});
for (const [name, createHandler, contextMethod, extra] of cases) {
 for (const [provider, secret, baseUrl] of [['azure-openai-api', 'fixture-azure-key', 'https://empresa-a.openai.azure.com/openai/v1'], ['openai-api', 'fixture-secret', 'https://api.openai.com/v1'], ['anthropic-api', 'sk-ant-api-fixture', 'https://api.anthropic.com'], ['google-api', 'fixture-google-key', 'https://generativelanguage.googleapis.com/v1beta'], ['google-vertex-api', 'fixture-vertex-key', 'https://aiplatform.googleapis.com'], ['groq-api', 'fixture-groq-key', 'https://api.groq.com/openai/v1'], ['xai-api', 'fixture-xai-key', 'https://api.x.ai/v1'], ['deepseek-api', 'fixture-deepseek-key', 'https://api.deepseek.com'], ['mistral-api', 'fixture-mistral-key', 'https://api.mistral.ai'], ['cerebras-api', 'fixture-cerebras-key', 'https://api.cerebras.ai/v1'], ['together-api', 'fixture-together-key', 'https://api.together.ai/v1'], ['nvidia-api', 'fixture-nvidia-key', 'https://integrate.api.nvidia.com/v1'], ['fireworks-api', 'fixture-fireworks-key', 'https://api.fireworks.ai/inference'], ['huggingface-api', 'fixture-hf-key', 'https://router.huggingface.co/v1'], ['minimax-api', 'fixture-minimax-key', 'https://api.minimax.io/anthropic'], ['minimax-cn-api', 'fixture-minimax-cn-key', 'https://api.minimaxi.com/anthropic'], ['moonshot-api', 'fixture-moonshot-key', 'https://api.moonshot.ai/v1'], ['moonshot-cn-api', 'fixture-moonshot-cn-key', 'https://api.moonshot.cn/v1'], ['xiaomi-api', 'fixture-xiaomi-key', 'https://api.xiaomimimo.com/v1'], ['zai-api', 'fixture-zai-key', 'https://api.z.ai/api/paas/v4'], ['ant-ling-api', 'fixture-ant-key', 'https://api.ant-ling.com/v1'], ['opencode-zen', 'fixture-zen-key', 'https://opencode.ai/zen/v1']]) {
  test(`viabilidad: ${name} configura ${provider} sin sustituir el proveedor`, async () => {
    let config, runs = 0, closed = false; const stages = [];
    const handler = createHandler({
      createAiService: ({ configStore }) => { config = configStore.load(); return {}; },
      createRuntime: () => ({
        runTask: async task => {
          runs++; task.onActivity?.({source: 'pi.tool.start', meta: {tool: 'read'}, message: 'Contenido privado'}); task.onActivity?.({source: 'pi.tool.end'});
          if (task.output_file === 'analysis.json') return { validation_result: Object.fromEntries(fields.map(key => [key, ''])) };
          if (task.output_file === 'outline.json') return { validation_result: { outline: [{ title: 'Alcance', description: '' }] } };
          return { output_content: 'Texto de prueba' };
        },
        close: async () => { closed = true; },
      }),
    });
    const context = { reportProgress: stage => stages.push(stage), job: { id: 'job' }, signal: new AbortController().signal, [contextMethod]: async () => snapshot,
      getCredential: async () => ({ provider, ...(provider === 'azure-openai-api' ? {resource: 'empresa-a'} : {}), model: 'fixture-model', secret, contextTokens: 128000, outputTokens: 8192 }),
      saveFeasibilityContentDraft: async () => {} };
    await handler({ language: 'es', dataProcessingConsent: true, ...extra }, context);
    assert.equal(config.text_model_provider, provider);
    assert.equal(config.base_url, baseUrl);
    assert.equal(config.model_name, 'fixture-model');
    assert.equal(config.api_key, secret);
    assert.equal(config.context_length_limit, 128000);
    assert.equal(config.output_token_limit, 8192);
    if (provider === 'anthropic-api') assert.equal(config.web_runner_anthropic_native, true);
    if (provider === 'google-api') assert.equal(config.web_runner_google_native, true);
    if (provider === 'google-vertex-api') assert.equal(config.web_runner_vertex_native, true);
    if (provider === 'groq-api') assert.equal(config.web_runner_groq_proxy, true);
    if (provider === 'xai-api') assert.equal(config.web_runner_xai_native, true);
    if (provider === 'deepseek-api') assert.equal(config.web_runner_deepseek_native, true);
    if (provider === 'mistral-api') assert.equal(config.web_runner_mistral_native, true);
    if (provider === 'cerebras-api') assert.equal(config.web_runner_cerebras_native, true);
    if (provider === 'together-api') assert.equal(config.web_runner_together_native, true);
    if (provider === 'nvidia-api') assert.equal(config.web_runner_nvidia_native, true);
    if (provider === 'zai-api') assert.equal(config.web_runner_zai_native, true);
    if (provider === 'ant-ling-api') assert.equal(config.web_runner_ant_ling_native, true);
    if (provider === 'opencode-zen') assert.equal(config.web_runner_opencode_zen_native, true);
    if (['moonshot-api','moonshot-cn-api'].includes(provider)) assert.equal(config.web_runner_moonshot_native, true);
    if (provider === 'xiaomi-api') assert.equal(config.web_runner_xiaomi_native, true);
    if (['minimax-api','minimax-cn-api'].includes(provider)) assert.equal(config.web_runner_minimax_native, true);
    if (provider === 'huggingface-api') assert.equal(config.web_runner_huggingface_native, true);
    if (provider === 'fireworks-api') assert.equal(config.web_runner_fireworks_native, true);
    assert.equal(config.reasoning_effort, '');
    assert.ok(runs > 0);
    assert.ok(stages.includes('reading')); assert.ok(stages.includes('generating'));
    assert.ok(stages.every(stage => ['preparing', 'reading', 'generating'].includes(stage)));
    assert.equal(closed, true);
  });
 }
}

test('Pi escribe los parámetros mediante el transporte OpenAI API simulado', { timeout: 30000 }, async () => {
  const originalFetch = globalThis.fetch, calls = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):/.test(target)) return originalFetch(url, options);
      assert.equal(target, 'https://api.openai.com/v1/chat/completions');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-secret');
      calls.push(JSON.parse(options.body));
      const message = calls.length === 1
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'write-params', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: 'parameters.md', content: '## Inversión\n[Pendiente por confirmar]' }) } }] }
        : { role: 'assistant', content: 'Parámetros preparados.' };
      return new Response(JSON.stringify({ id: `feas-${calls.length}`, object: 'chat.completion', model: 'fixture-model', choices: [{ index: 0, message, finish_reason: calls.length === 1 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }), { headers: { 'content-type': 'application/json' } });
    };
    const result = await createFeasibilityParametersHandler()({ language: 'es', dataProcessingConsent: true }, {
      job: { id: 'openai-parameters' }, signal: new AbortController().signal,
      getFeasibilityParametersContext: async () => snapshot,
      getCredential: async () => ({ provider: 'openai-api', model: 'fixture-model', secret: 'fixture-secret' }),
    });
    assert.match(result.content, /Pendiente por confirmar/);
    assert.ok(calls.length >= 2);
    assert.equal(calls[0].model, 'fixture-model');
    assert.equal('reasoning_effort' in calls[0], false);
  } finally { globalThis.fetch = originalFetch; }
});
