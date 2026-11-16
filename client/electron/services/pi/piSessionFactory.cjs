const brand = require('../../../brand.json');
const {
  createPiJsonValidationTool,
  createPiJsonValidator,
} = require('./piJsonValidationTool.cjs');
const {
  createPiUserQuestionTool,
} = require('./piUserQuestionTool.cjs');
const {
  AGENT_TASK_FAILURE_TOOL_NAME,
  createPiTaskFailureTool,
} = require('./piTaskFailureTool.cjs');
const {
  OPENXML_TOOL_NAME,
  createPiOpenXmlTool,
} = require('./piOpenXmlTool.cjs');
const {
  createPiRetryErrorNormalizer,
} = require('./piRetryErrorNormalizer.cjs');
const {
  PI_NO_SUMMARY_INSTRUCTIONS,
  withTaskCompletionParameter,
  installTaskCompletionHook,
} = require('./piSummaryControl.cjs');

const { NATIVE_AGENT_TOOLS } = require('../agent/agentToolEnvironment.cjs');
let piModulesPromise = null;
const FIXED_TOOL_LIST_INSTRUCTIONS = '工具列表覆盖本任务的全部阶段。read、write、edit、bash、grep、find、ls 全程可用，优先按当前任务指导选择工具；业务工具仍按当前阶段使用。';

// Lazily load the ESM Pi SDK for CommonJS Electron Main.
function loadPiModules() {
  if (!piModulesPromise) {
    piModulesPromise = Promise.all([
      import('@earendil-works/pi-coding-agent'),
      import('@earendil-works/pi-ai'),
      import('typebox'),
      import('@earendil-works/pi-ai/api/azure-openai-responses'),
    ]).then(([codingAgent, piAi, typebox, azureAi]) => ({ codingAgent, piAi, typebox, azureAi }));
  }
  return piModulesPromise;
}

function normalizeContextLimit(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 400000;
}

function normalizeOutputLimit(contextLength) {
  const normalizedContextLength = normalizeContextLimit(contextLength);
  return Math.min(32768, normalizedContextLength);
}

function modelOutputLimit(config) {
  const limit = Number(config.output_token_limit);
  if (config.web_runner_model_limits === true && Number.isSafeInteger(limit) && limit > 0) return Math.min(limit, normalizeContextLimit(config.context_length_limit));
  return normalizeOutputLimit(config.context_length_limit);
}

function resolveRunnerConfig(optionConfig) {
  let raw = optionConfig;
  if (!raw && typeof process !== 'undefined' && process.env && process.env.SAVIA_RUNNER_CONFIG_JSON) {
    try {
      raw = JSON.parse(process.env.SAVIA_RUNNER_CONFIG_JSON);
    } catch {
      raw = null;
    }
  }
  const source = raw && typeof raw === 'object' && raw.overrides && typeof raw.overrides === 'object'
    ? raw.overrides
    : raw;
  if (!source || typeof source !== 'object') {
    return { skills: [], hooks: {}, prompts: {} };
  }
  const skills = Array.isArray(source.skills)
    ? source.skills.filter((item) => typeof item === 'string' && item.trim())
    : [];
  const hooks = source.hooks && typeof source.hooks === 'object' && !Array.isArray(source.hooks)
    ? source.hooks
    : {};
  const prompts = source.prompts && typeof source.prompts === 'object' && !Array.isArray(source.prompts)
    ? source.prompts
    : {};
  return { skills, hooks, prompts };
}

function resolvePiRuntimeOverrides({ runnerConfig, environment, config, summaryEnabled = true, fixedToolList = false, secopSafeTools = false }) {
  const resolved = resolveRunnerConfig(runnerConfig);
  const workspaceOverride = typeof resolved.prompts['prompt:agent-workspace'] === 'string'
    && resolved.prompts['prompt:agent-workspace'].trim()
    ? resolved.prompts['prompt:agent-workspace']
    : null;
  const baseWorkspace = workspaceOverride ?? (environment?.instructions || '');
  const localizedWorkspace = secopSafeTools
    ? require('./secopToolGuard.cjs').spanishWorkspaceInstructions(baseWorkspace, config?.ui_language)
    : baseWorkspace;
  const skillsSection = resolved.skills.length
    ? `## Active Runner Skills\n\n${resolved.skills.join('\n\n')}`
    : '';
  const workspaceInstructions = [localizedWorkspace, skillsSection]
    .filter((part) => typeof part === 'string' && part.trim())
    .join('\n\n');

  const noSummaryInstructions = typeof resolved.prompts['prompt:pi-no-summary'] === 'string'
    && resolved.prompts['prompt:pi-no-summary'].trim()
    ? resolved.prompts['prompt:pi-no-summary']
    : PI_NO_SUMMARY_INSTRUCTIONS;
  const fixedToolListInstructions = typeof resolved.prompts['prompt:fixed-tool-list'] === 'string'
    && resolved.prompts['prompt:fixed-tool-list'].trim()
    ? resolved.prompts['prompt:fixed-tool-list']
    : FIXED_TOOL_LIST_INSTRUCTIONS;

  const retryErrorNormalizerEnabled = resolved.hooks['hook:retry-error-normalizer']?.enabled !== false;
  const taskCompletionEnabled = resolved.hooks['hook:task-completion']?.enabled !== false;
  const fixedToolListHookEnabled = Boolean(fixedToolList) && resolved.hooks['hook:fixed-tool-list']?.enabled !== false;

  const appendSystemPrompt = [
    ...(summaryEnabled === false ? [noSummaryInstructions] : []),
    ...(fixedToolListHookEnabled ? [fixedToolListInstructions] : []),
  ];

  return {
    runnerConfig: resolved,
    workspaceInstructions,
    appendSystemPrompt,
    retryErrorNormalizerEnabled,
    taskCompletionEnabled,
    fixedToolListHookEnabled,
  };
}

// Create isolated Pi sessions; persistent tasks can reopen their original session in later complete runs.
async function createPiSession({ workspaceDir, sessionsDir, sessionFile, environment, proxyInfo, config, timeoutMs, jsonValidationSchemas, requestUserQuestion, requestTerminationDecision, reportTaskFailure, openXmlTool, createTools, activeTools, beforeToolCall, summaryEnabled = true, isFinalToolCall, fixedToolList = false, secopSafeTools = false, baseline, runnerConfig }) {
  const runtimeOverrides = resolvePiRuntimeOverrides({ runnerConfig, environment, config, summaryEnabled, fixedToolList, secopSafeTools });
  const { codingAgent, piAi, typebox, azureAi } = await loadPiModules();
  const credentials = new piAi.InMemoryCredentialStore();
  const modelsStore = new piAi.InMemoryModelsStore();
  const modelRuntime = await codingAgent.ModelRuntime.create({
    credentials,
    modelsStore,
    modelsPath: null,
    allowModelNetwork: false,
  });
  const useNativeAnthropic = config.text_model_provider === 'anthropic-api' && config.web_runner_anthropic_native === true && config.base_url === 'https://api.anthropic.com' && String(config.api_key || '').startsWith('sk-ant-api');
  const useNativeGoogle = config.text_model_provider === 'google-api' && config.web_runner_google_native === true && config.base_url === 'https://generativelanguage.googleapis.com/v1beta' && !!config.api_key && /^[A-Za-z0-9._-]+$/.test(config.model_name || '');
  const useNativeVertex = config.text_model_provider === 'google-vertex-api' && config.web_runner_vertex_native === true && config.base_url === 'https://aiplatform.googleapis.com' && /^[A-Za-z0-9_-]+$/.test(config.api_key || '') && config.api_key !== 'gcp-vertex-credentials' && /^[A-Za-z0-9._-]+$/.test(config.model_name || '');
  const useNativeXai = config.text_model_provider === 'xai-api' && config.web_runner_xai_native === true && config.base_url === 'https://api.x.ai/v1' && !!config.api_key;
  const useNativeDeepSeek = config.text_model_provider === 'deepseek-api' && config.web_runner_deepseek_native === true && config.base_url === 'https://api.deepseek.com' && !!config.api_key;
  const useNativeFireworks = config.text_model_provider === 'fireworks-api' && config.web_runner_fireworks_native === true && config.base_url === 'https://api.fireworks.ai/inference' && !!config.api_key && !String(config.api_key).includes('sk-ant-oat');
  const useNativeNvidia = config.text_model_provider === 'nvidia-api' && config.web_runner_nvidia_native === true && config.base_url === 'https://integrate.api.nvidia.com/v1' && !!config.api_key;
  const useNativeTogether = config.text_model_provider === 'together-api' && config.web_runner_together_native === true && config.base_url === 'https://api.together.ai/v1' && !!config.api_key;
  const useNativeCerebras = config.text_model_provider === 'cerebras-api' && config.web_runner_cerebras_native === true && config.base_url === 'https://api.cerebras.ai/v1' && !!config.api_key;
  const useNativeZen = config.text_model_provider === 'opencode-zen' && config.web_runner_opencode_zen_native === true && config.base_url === 'https://opencode.ai/zen/v1' && !!config.api_key;
  const useNativeAntLing = config.text_model_provider === 'ant-ling-api' && config.web_runner_ant_ling_native === true && config.base_url === 'https://api.ant-ling.com/v1' && !!config.api_key;
  const useNativeZai = config.text_model_provider === 'zai-api' && config.web_runner_zai_native === true && config.base_url === 'https://api.z.ai/api/paas/v4' && !!config.api_key;
  const useNativeMoonshot = ((config.text_model_provider === 'moonshot-api' && config.base_url === 'https://api.moonshot.ai/v1') || (config.text_model_provider === 'moonshot-cn-api' && config.base_url === 'https://api.moonshot.cn/v1')) && config.web_runner_moonshot_native === true && !!config.api_key;
  const useNativeXiaomi = config.text_model_provider === 'xiaomi-api' && config.web_runner_xiaomi_native === true && config.base_url === 'https://api.xiaomimimo.com/v1' && !!config.api_key;
  const useNativeAzure = config.text_model_provider === 'azure-openai-api' && config.web_runner_azure_native === true && /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.openai\.azure\.com\/openai\/v1$/.test(config.base_url) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(config.model_name) && !!config.api_key;
  const useNativeMiniMax = ((config.text_model_provider === 'minimax-api' && config.base_url === 'https://api.minimax.io/anthropic') || (config.text_model_provider === 'minimax-cn-api' && config.base_url === 'https://api.minimaxi.com/anthropic')) && config.web_runner_minimax_native === true && !!config.api_key && !String(config.api_key).includes('sk-ant-oat');
  const useNativeHuggingFace = config.text_model_provider === 'huggingface-api' && config.web_runner_huggingface_native === true && config.base_url === 'https://router.huggingface.co/v1' && !!config.api_key;
  const useNativeMistral = config.text_model_provider === 'mistral-api' && config.web_runner_mistral_native === true && config.base_url === 'https://api.mistral.ai' && !!config.api_key;
  if (config.text_model_provider === 'anthropic-api' && !useNativeAnthropic) throw new Error('Invalid Claude API configuration.');
  if (config.text_model_provider === 'google-api' && !useNativeGoogle) throw new Error('Invalid Gemini API configuration.');
  if (config.text_model_provider === 'google-vertex-api' && !useNativeVertex) throw new Error('Invalid Vertex API configuration.');
  if (config.text_model_provider === 'xai-api' && !useNativeXai) throw new Error('Invalid xAI API configuration.');
  if (config.text_model_provider === 'deepseek-api' && !useNativeDeepSeek) throw new Error('Invalid DeepSeek API configuration.');
  if (config.text_model_provider === 'fireworks-api' && !useNativeFireworks) throw new Error('Invalid Fireworks API configuration.');
  if (config.text_model_provider === 'nvidia-api' && !useNativeNvidia) throw new Error('Invalid NVIDIA API configuration.');
  if (config.text_model_provider === 'together-api' && !useNativeTogether) throw new Error('Invalid Together API configuration.');
  if (config.text_model_provider === 'cerebras-api' && !useNativeCerebras) throw new Error('Invalid Cerebras API configuration.');
  if (config.text_model_provider === 'opencode-zen' && !useNativeZen) throw new Error('Invalid OpenCode Zen configuration.');
  if (config.text_model_provider === 'ant-ling-api' && !useNativeAntLing) throw new Error('Invalid Ant Ling API configuration.');
  if (config.text_model_provider === 'zai-api' && !useNativeZai) throw new Error('Invalid Z.AI API configuration.');
  if (['moonshot-api','moonshot-cn-api'].includes(config.text_model_provider) && !useNativeMoonshot) throw new Error('Invalid Kimi API configuration.');
  if (config.text_model_provider === 'xiaomi-api' && !useNativeXiaomi) throw new Error('Invalid Xiaomi MiMo API configuration.');
  if (config.text_model_provider === 'azure-openai-api' && !useNativeAzure) throw new Error('Invalid Azure OpenAI configuration.');
  if (['minimax-api','minimax-cn-api'].includes(config.text_model_provider) && !useNativeMiniMax) throw new Error('Invalid MiniMax API configuration.');
  if (config.text_model_provider === 'huggingface-api' && !useNativeHuggingFace) throw new Error('Invalid Hugging Face API configuration.');
  if (config.text_model_provider === 'mistral-api' && !useNativeMistral) throw new Error('Invalid Mistral API configuration.');
  if (useNativeAzure || useNativeAnthropic || useNativeGoogle || useNativeVertex || useNativeXai || useNativeDeepSeek || useNativeMistral || useNativeCerebras || useNativeTogether || useNativeNvidia || useNativeFireworks || useNativeHuggingFace || useNativeMiniMax || useNativeMoonshot || useNativeXiaomi || useNativeZai || useNativeAntLing || useNativeZen) {
    const fireworksModel = useNativeFireworks ? modelRuntime.getModel('fireworks', config.model_name) : null;
    if (useNativeFireworks && (!fireworksModel || !((fireworksModel.api === 'anthropic-messages' && fireworksModel.baseUrl === 'https://api.fireworks.ai/inference') || (fireworksModel.api === 'openai-completions' && fireworksModel.baseUrl === 'https://api.fireworks.ai/inference/v1')))) throw new Error('Fireworks model is not supported by the integrated Pi catalog.');
    const zenModel = useNativeZen ? modelRuntime.getModel('opencode', config.model_name) : null;
    if (useNativeZen && (!zenModel || !((zenModel.api === 'anthropic-messages' && zenModel.baseUrl === 'https://opencode.ai/zen') || (['openai-completions','openai-responses','google-generative-ai'].includes(zenModel.api) && zenModel.baseUrl === 'https://opencode.ai/zen/v1')))) throw new Error('OpenCode Zen model is not supported by the integrated Pi catalog.');
    const antLingModel = useNativeAntLing ? modelRuntime.getModel('ant-ling', config.model_name) : null;
    if (useNativeAntLing && (!antLingModel || antLingModel.api !== 'openai-completions' || antLingModel.baseUrl !== 'https://api.ant-ling.com/v1')) throw new Error('Ant Ling model is not supported by the integrated Pi catalog.');
    const zaiModel = useNativeZai ? modelRuntime.getModel('zai', config.model_name) : null;
    const moonshotModel = useNativeMoonshot ? modelRuntime.getModel(config.text_model_provider === 'moonshot-cn-api' ? 'moonshotai-cn' : 'moonshotai', config.model_name) : null;
    const xiaomiModel = useNativeXiaomi ? modelRuntime.getModel('xiaomi', config.model_name) : null;
    const huggingfaceModel = useNativeHuggingFace ? modelRuntime.getModel('huggingface', config.model_name) : null;
    const nvidiaModel = useNativeNvidia ? modelRuntime.getModel('nvidia', config.model_name) : null;
    const togetherModel = useNativeTogether ? modelRuntime.getModel('together', config.model_name) : null;
    const nativeProvider = useNativeAzure ? 'azure-openai-responses' : useNativeAnthropic ? 'anthropic' : useNativeVertex ? 'google-vertex' : useNativeGoogle ? 'google' : useNativeXai ? 'xai' : useNativeDeepSeek ? 'deepseek' : useNativeCerebras ? 'cerebras' : useNativeTogether ? 'together' : useNativeNvidia ? 'nvidia' : useNativeFireworks ? 'fireworks' : useNativeHuggingFace ? 'huggingface' : useNativeMiniMax ? (config.text_model_provider === 'minimax-cn-api' ? 'minimax-cn' : 'minimax') : useNativeMoonshot ? (config.text_model_provider === 'moonshot-cn-api' ? 'moonshotai-cn' : 'moonshotai') : useNativeXiaomi ? 'xiaomi' : useNativeZai ? 'zai' : useNativeAntLing ? 'ant-ling' : useNativeZen ? 'opencode' : 'mistral';
    modelRuntime.registerProvider(nativeProvider, {
      name: useNativeAzure ? 'Azure OpenAI' : useNativeAnthropic ? 'Claude API' : useNativeVertex ? 'Vertex AI Express' : useNativeGoogle ? 'Gemini API' : useNativeXai ? 'xAI API' : useNativeDeepSeek ? 'DeepSeek API' : useNativeCerebras ? 'Cerebras API' : useNativeTogether ? 'Together API' : useNativeNvidia ? 'NVIDIA NIM API' : useNativeFireworks ? 'Fireworks API' : useNativeHuggingFace ? 'Hugging Face API' : useNativeMiniMax ? 'MiniMax API' : useNativeMoonshot ? 'Kimi API' : useNativeXiaomi ? 'Xiaomi MiMo API' : useNativeZai ? 'Z.AI API' : useNativeAntLing ? 'Ant Ling API' : useNativeZen ? 'OpenCode Zen' : 'Mistral API', baseUrl: useNativeZen ? zenModel.baseUrl : useNativeFireworks ? fireworksModel.baseUrl : config.base_url, api: useNativeAzure ? 'azure-openai-responses' : useNativeZen ? zenModel.api : useNativeFireworks ? fireworksModel.api : useNativeAnthropic || useNativeMiniMax ? 'anthropic-messages' : useNativeVertex ? 'google-vertex' : useNativeGoogle ? 'google-generative-ai' : useNativeXai ? 'openai-responses' : useNativeDeepSeek || useNativeCerebras || useNativeTogether || useNativeNvidia || useNativeFireworks || useNativeHuggingFace || useNativeMoonshot || useNativeXiaomi || useNativeZai || useNativeAntLing ? 'openai-completions' : 'mistral-conversations',
      ...(useNativeAzure ? { streamSimple: (model, context, options) => azureAi.streamSimple(model, context, { ...options, env: { ...options?.env, AZURE_OPENAI_BASE_URL: config.base_url, AZURE_OPENAI_API_VERSION: 'v1', AZURE_OPENAI_DEPLOYMENT_NAME_MAP: `${config.model_name}=${config.model_name}` } }) } : {}),
      models: [{ id: config.model_name, name: config.model_name, reasoning: useNativeXai || useNativeDeepSeek || useNativeCerebras || (useNativeTogether && !!togetherModel?.reasoning) || (useNativeNvidia && !!nvidiaModel?.reasoning) || (useNativeFireworks && !!fireworksModel?.reasoning) || (useNativeHuggingFace && !!huggingfaceModel?.reasoning) || (useNativeMoonshot && !!moonshotModel?.reasoning) || useNativeXiaomi || (useNativeZai && !!zaiModel?.reasoning) || (useNativeAntLing && !!antLingModel?.reasoning) || (useNativeZen && !!zenModel?.reasoning), input: ['text'],
        ...(useNativeXai ? { thinkingLevelMap: { off: null }, compat: { supportsDeveloperRole: false, supportsLongCacheRetention: false } } : {}),
        ...(useNativeFireworks ? { ...(fireworksModel.compat ? { compat: fireworksModel.compat } : {}), ...(fireworksModel.headers ? { headers: fireworksModel.headers } : {}), ...(fireworksModel.thinkingLevelMap ? { thinkingLevelMap: fireworksModel.thinkingLevelMap } : {}) } : {}),
        ...(useNativeNvidia ? { compat: nvidiaModel?.compat || { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens', supportsStrictMode: false, supportsLongCacheRetention: false }, ...(nvidiaModel?.headers ? { headers: nvidiaModel.headers } : {}), ...(nvidiaModel?.thinkingLevelMap ? { thinkingLevelMap: nvidiaModel.thinkingLevelMap } : {}) } : {}),
        ...(useNativeTogether ? { compat: togetherModel?.compat || { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens', supportsStrictMode: false, supportsLongCacheRetention: false }, ...(togetherModel?.thinkingLevelMap ? { thinkingLevelMap: togetherModel.thinkingLevelMap } : {}) } : {}),
        ...(useNativeZen ? { ...(zenModel.compat ? { compat: zenModel.compat } : {}), ...(zenModel.headers ? { headers: zenModel.headers } : {}), ...(zenModel.thinkingLevelMap ? { thinkingLevelMap: zenModel.thinkingLevelMap } : {}) } : {}),
        ...(useNativeAntLing ? { ...(antLingModel.compat ? { compat: antLingModel.compat } : {}), ...(antLingModel.thinkingLevelMap ? { thinkingLevelMap: antLingModel.thinkingLevelMap } : {}) } : {}),
        ...(useNativeZai ? { thinkingLevelMap: { ...zaiModel?.thinkingLevelMap, off: null }, compat: { ...zaiModel?.compat, supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens', requiresReasoningContentOnAssistantMessages: true, thinkingFormat: 'zai' } } : {}),
        ...(useNativeMoonshot ? { thinkingLevelMap: { ...moonshotModel?.thinkingLevelMap, off: null }, compat: { ...moonshotModel?.compat, supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens', supportsStrictMode: false, requiresReasoningContentOnAssistantMessages: true, thinkingFormat: 'deepseek' } } : {}),
        ...(useNativeXiaomi ? { thinkingLevelMap: { ...xiaomiModel?.thinkingLevelMap, off: null }, compat: { ...xiaomiModel?.compat, supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens', supportsStrictMode: false, requiresReasoningContentOnAssistantMessages: true, thinkingFormat: 'deepseek' } } : {}),
        ...(useNativeHuggingFace ? { compat: { ...huggingfaceModel?.compat, supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens' } } : {}),
        ...(useNativeCerebras ? { compat: { supportsStore: false, supportsDeveloperRole: false } } : {}),
        ...(useNativeDeepSeek ? { thinkingLevelMap: { off: null }, compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens', requiresReasoningContentOnAssistantMessages: true, thinkingFormat: 'deepseek' } } : {}),
        contextWindow: normalizeContextLimit(config.context_length_limit), maxTokens: modelOutputLimit(config),
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    });
    await modelRuntime.setRuntimeApiKey(nativeProvider, config.api_key);
  } else for (const provider of [brand.slug]) {
  modelRuntime.registerProvider(provider, {
    name: 'Savia AI',
    baseUrl: `${proxyInfo.baseUrl}/v1`,
    api: 'openai-completions',
    models: [{
      id: 'default',
      name: 'Savia Current Text Model',
      reasoning: false,
      input: ['text'],
      contextWindow: normalizeContextLimit(config.context_length_limit),
      maxTokens: modelOutputLimit(config),
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        supportsUsageInStreaming: false,
        maxTokensField: 'max_tokens',
      },
    }],
  });
  await modelRuntime.setRuntimeApiKey(provider, proxyInfo.token);
  }
  const model = modelRuntime.getModel(useNativeAzure ? 'azure-openai-responses' : useNativeAnthropic ? 'anthropic' : useNativeVertex ? 'google-vertex' : useNativeGoogle ? 'google' : useNativeXai ? 'xai' : useNativeDeepSeek ? 'deepseek' : useNativeMistral ? 'mistral' : useNativeCerebras ? 'cerebras' : useNativeTogether ? 'together' : useNativeNvidia ? 'nvidia' : useNativeFireworks ? 'fireworks' : useNativeHuggingFace ? 'huggingface' : useNativeMiniMax ? (config.text_model_provider === 'minimax-cn-api' ? 'minimax-cn' : 'minimax') : useNativeMoonshot ? (config.text_model_provider === 'moonshot-cn-api' ? 'moonshotai-cn' : 'moonshotai') : useNativeXiaomi ? 'xiaomi' : useNativeZai ? 'zai' : useNativeAntLing ? 'ant-ling' : useNativeZen ? 'opencode' : 'savia', useNativeAzure || useNativeAnthropic || useNativeGoogle || useNativeVertex || useNativeXai || useNativeDeepSeek || useNativeMistral || useNativeCerebras || useNativeTogether || useNativeNvidia || useNativeFireworks || useNativeHuggingFace || useNativeMiniMax || useNativeMoonshot || useNativeXiaomi || useNativeZai || useNativeAntLing || useNativeZen ? config.model_name : 'default');
  if (!model) throw new Error('Pi Agent 模型注册失败');
  const jsonValidator = createPiJsonValidator({ workspaceDir, validationSchemas: jsonValidationSchemas });

  const settingsManager = codingAgent.SettingsManager.inMemory({
    defaultProvider: 'savia',
    defaultModel: 'default',
    defaultThinkingLevel: 'off',
    defaultProjectTrust: 'never',
    retry: { enabled: true, provider: { maxRetries: 0, timeoutMs } },
    compaction: { enabled: true },
    images: { autoResize: false, blockImages: true },
    enableInstallTelemetry: false,
    enableAnalytics: false,
    shellPath: environment.shellPath,
    httpIdleTimeoutMs: timeoutMs,
  }, { projectTrusted: false });
  const resourceLoader = new codingAgent.DefaultResourceLoader({
    cwd: workspaceDir,
    agentDir: environment.layout.agentDir,
    settingsManager,
    extensionFactories: runtimeOverrides.retryErrorNormalizerEnabled ? [createPiRetryErrorNormalizer()] : [],
    noContextFiles: true,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    agentsFilesOverride: () => ({
      agentsFiles: [{ path: '<savia-agent-workspace>', content: runtimeOverrides.workspaceInstructions }],
    }),
    systemPromptOverride: () => undefined,
    appendSystemPromptOverride: () => runtimeOverrides.appendSystemPrompt,
  });
  await resourceLoader.reload();
  const bashTool = codingAgent.createBashToolDefinition(workspaceDir, {
    shellPath: environment.shellPath,
    commandPrefix: environment.shellCommandPrefix,
    spawnHook: ({ command, cwd, env }) => ({
      command,
      cwd,
      env: { ...env, ...environment.env },
    }),
  });
  const jsonValidationTool = codingAgent.defineTool(createPiJsonValidationTool({
    Type: typebox.Type,
    validator: jsonValidator,
  }));
  let questionDefinition = createPiUserQuestionTool({
    Type: typebox.Type,
    requestUserQuestion,
  });
  if (secopSafeTools) questionDefinition = require('./secopToolGuard.cjs').spanishQuestionTool(questionDefinition, config?.ui_language);
  const userQuestionTool = codingAgent.defineTool(questionDefinition);
  let failureDefinition = createPiTaskFailureTool({
    Type: typebox.Type,
    reportTaskFailure,
    requestTerminationDecision: secopSafeTools ? null : requestTerminationDecision,
  });
  if (secopSafeTools) failureDefinition = require('./secopToolGuard.cjs').spanishFailureTool(failureDefinition, config?.ui_language);
  const taskFailureTool = codingAgent.defineTool(failureDefinition);
  const openXmlCustomTool = openXmlTool
    ? codingAgent.defineTool(createPiOpenXmlTool({
      workspaceDir,
      Type: typebox.Type,
      ...openXmlTool,
    }))
    : null;
  const sessionManager = sessionFile
    ? codingAgent.SessionManager.open(sessionFile, sessionsDir, workspaceDir)
    : sessionsDir
      ? codingAgent.SessionManager.create(workspaceDir, sessionsDir)
      : codingAgent.SessionManager.inMemory(workspaceDir);
  // Inject business tools per call; the shared Pi layer does not depend on business services.
  let session;
  let requestedTools;
  // Native tools remain available across business stages; custom tools retain declared permissions.
  const withNativeTools = names => {
    const tools = [...new Set([...NATIVE_AGENT_TOOLS, ...names])];
    return secopSafeTools ? require('./secopToolGuard.cjs').filterSecopToolList(tools) : tools;
  };
  // Set permissions at creation for resumed tasks; use Pi's tool-list interface for runtime switching.
  // With fixed tool lists, update stage gates only, preserving system prompts/tools for prefix-cache reuse.
  const setActiveTools = toolNames => {
    requestedTools = withNativeTools(toolNames);
    if (!runtimeOverrides.fixedToolListHookEnabled) session?.setActiveToolsByName(requestedTools);
  };
  const taskTools = (createTools?.({ Type: typebox.Type, workspaceDir, setActiveTools, baseline }) || []).map(tool => codingAgent.defineTool(tool));
  let customTools = [bashTool, jsonValidationTool, userQuestionTool, taskFailureTool, ...(openXmlCustomTool ? [openXmlCustomTool] : []), ...taskTools];
  if (summaryEnabled === false && runtimeOverrides.taskCompletionEnabled && !isFinalToolCall) {
    customTools = [
      codingAgent.createReadToolDefinition(workspaceDir, { autoResizeImages: false }),
      codingAgent.createEditToolDefinition(workspaceDir),
      codingAgent.createWriteToolDefinition(workspaceDir),
      codingAgent.createFindToolDefinition(workspaceDir),
      codingAgent.createLsToolDefinition(workspaceDir),
      codingAgent.createGrepToolDefinition(workspaceDir),
      ...customTools,
    ].map(withTaskCompletionParameter);
  }
  const defaultTools = withNativeTools(['json-validation', 'ask-user', AGENT_TASK_FAILURE_TOOL_NAME, ...(openXmlCustomTool ? [OPENXML_TOOL_NAME] : []), ...taskTools.map(tool => tool.name)]);
  const initialTools = withNativeTools(requestedTools || activeTools || defaultTools);
  // SDK tools also limits registration; register all task tools first, then enable by stage.
  ({ session } = await codingAgent.createAgentSession({
    cwd: workspaceDir,
    agentDir: environment.layout.agentDir,
    model,
    modelRuntime,
    thinkingLevel: 'off',
    tools: [...new Set([...defaultTools, ...initialTools])],
    customTools,
    resourceLoader,
    settingsManager,
    sessionManager,
  }));
  session.setActiveToolsByName(runtimeOverrides.fixedToolListHookEnabled ? defaultTools : initialTools);
  if (beforeToolCall) {
    // List changes affect only the next turn; execution gates must also block already scheduled disabled calls in the current turn.
    const previousBeforeToolCall = session.agent.beforeToolCall;
    session.agent.beforeToolCall = async (context, signal) => {
      await beforeToolCall(context, signal);
      return previousBeforeToolCall?.(context, signal);
    };
  }
  if (runtimeOverrides.fixedToolListHookEnabled) {
    // Run stage gates first so disabled tools never enter business callbacks.
    requestedTools = initialTools;
    const previousBeforeToolCall = session.agent.beforeToolCall;
    session.agent.beforeToolCall = async (context, signal) => {
      if (!requestedTools.includes(context.toolCall.name)) throw new Error(`当前阶段不能调用 ${context.toolCall.name}，请只使用当前阶段说明的工具。`);
      return previousBeforeToolCall?.(context, signal);
    };
  }
  if (summaryEnabled === false && runtimeOverrides.taskCompletionEnabled) installTaskCompletionHook(session.agent, isFinalToolCall);
  return {
    session,
    sessionFile: session.sessionFile || sessionManager.getSessionFile() || '',
    snapshot: {
      sdk_version: codingAgent.VERSION || '',
      model: {
        provider: model.provider || '',
        id: model.id || '',
        api: model.api || '',
        base_url: model.baseUrl || '',
        context_window: Number(model.contextWindow || 0),
        max_tokens: Number(model.maxTokens || 0),
      },
      transport: {
        proxy_base_url: proxyInfo.baseUrl,
        proxy_port: Number(proxyInfo.port || 0),
        provider_timeout_ms: Number(timeoutMs || 0),
        http_idle_timeout_ms: Number(timeoutMs || 0),
      },
      context_files: resourceLoader.getAgentsFiles().agentsFiles.map((item) => item.path),
      skills: resourceLoader.getSkills().skills.map((item) => item.name),
      prompts: resourceLoader.getPrompts().prompts.map((item) => item.name),
      extensions: resourceLoader.getExtensions().extensions.map((item) => item.path),
      active_tools: runtimeOverrides.fixedToolListHookEnabled ? [...requestedTools] : session.getActiveToolNames(),
      registered_tools: session.getActiveToolNames(),
    },
  };
}

module.exports = {
  createPiSession,
  loadPiModules,
  resolveRunnerConfig,
  resolvePiRuntimeOverrides,
};
