// Fixed destinations prevent credentials from being forwarded to an arbitrary endpoint.
const providers = {
  'azure-openai-api': { baseUrl: '', reasoningEffort: '' },
  'opencode-zen': { baseUrl: 'https://opencode.ai/zen/v1', reasoningEffort: '' },
  'opencode-go': { baseUrl: 'https://opencode.ai/inference/go/openai/v1', reasoningEffort: 'low' },
  'openai-api': { baseUrl: 'https://api.openai.com/v1', reasoningEffort: '' },
  'anthropic-api': { baseUrl: 'https://api.anthropic.com', reasoningEffort: '' },
  'google-api': { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', reasoningEffort: '' },
  'google-vertex-api': { baseUrl: 'https://aiplatform.googleapis.com', reasoningEffort: '' },
  'groq-api': { baseUrl: 'https://api.groq.com/openai/v1', reasoningEffort: '' },
  'xai-api': { baseUrl: 'https://api.x.ai/v1', reasoningEffort: '' },
  'deepseek-api': { baseUrl: 'https://api.deepseek.com', reasoningEffort: '' },
  'fireworks-api': { baseUrl: 'https://api.fireworks.ai/inference', reasoningEffort: '' },
  'nvidia-api': { baseUrl: 'https://integrate.api.nvidia.com/v1', reasoningEffort: '' },
  'together-api': { baseUrl: 'https://api.together.ai/v1', reasoningEffort: '' },
  'cerebras-api': { baseUrl: 'https://api.cerebras.ai/v1', reasoningEffort: '' },
  'ant-ling-api': { baseUrl: 'https://api.ant-ling.com/v1', reasoningEffort: '' },
  'zai-api': { baseUrl: 'https://api.z.ai/api/paas/v4', reasoningEffort: '' },
  'moonshot-cn-api': { baseUrl: 'https://api.moonshot.cn/v1', reasoningEffort: '' },
  'moonshot-api': { baseUrl: 'https://api.moonshot.ai/v1', reasoningEffort: '' },
  'xiaomi-api': { baseUrl: 'https://api.xiaomimimo.com/v1', reasoningEffort: '' },
  'minimax-api': { baseUrl: 'https://api.minimax.io/anthropic', reasoningEffort: '' },
  'minimax-cn-api': { baseUrl: 'https://api.minimaxi.com/anthropic', reasoningEffort: '' },
  'huggingface-api': { baseUrl: 'https://router.huggingface.co/v1', reasoningEffort: '' },
  'mistral-api': { baseUrl: 'https://api.mistral.ai', reasoningEffort: '' },
};

export function isSupportedTextCredential(credential) {
  const contextTokens = credential?.contextTokens ?? 400000, outputTokens = credential?.outputTokens ?? 16384;
  return Object.hasOwn(providers, credential?.provider) && typeof credential.model === 'string' && !!credential.model && typeof credential.secret === 'string' && !!credential.secret && (credential.provider !== 'anthropic-api' || credential.secret.startsWith('sk-ant-api')) && (credential.provider !== 'google-vertex-api' || (/^[A-Za-z0-9_-]+$/.test(credential.secret) && credential.secret !== 'gcp-vertex-credentials')) && (credential.provider !== 'xiaomi-api' || !/^\s*t?tp-/.test(credential.secret)) && (!['google-api','google-vertex-api'].includes(credential.provider) || /^[A-Za-z0-9._-]+$/.test(credential.model)) && (credential.provider !== 'azure-openai-api' || (typeof credential.resource === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(credential.resource) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(credential.model))) && Number.isSafeInteger(contextTokens) && contextTokens >= 1024 && contextTokens <= 2000000 && Number.isSafeInteger(outputTokens) && outputTokens >= (['xai-api', 'azure-openai-api'].includes(credential.provider) ? 16 : 1) && outputTokens <= contextTokens;
}

export function textProviderConfig(credential) {
  if (!isSupportedTextCredential(credential)) throw new Error('Unsupported text credential.');
  return { text_model_provider: credential.provider, api_key: credential.secret, model_name: credential.model,
    base_url: credential.provider === 'azure-openai-api' ? `https://${credential.resource}.openai.azure.com/openai/v1` : providers[credential.provider].baseUrl, reasoning_effort: providers[credential.provider].reasoningEffort,
    context_length_limit: credential.contextTokens ?? 400000, output_token_limit: credential.outputTokens ?? 16384, web_runner_model_limits: true,
    ...(credential.provider === 'anthropic-api' ? { web_runner_anthropic_native: true } : {}),
    ...(credential.provider === 'google-api' ? { web_runner_google_native: true } : {}),
    ...(credential.provider === 'google-vertex-api' ? { web_runner_vertex_native: true } : {}),
    ...(credential.provider === 'groq-api' ? { web_runner_groq_proxy: true } : {}),
    ...(credential.provider === 'xai-api' ? { web_runner_xai_native: true } : {}),
    ...(credential.provider === 'deepseek-api' ? { web_runner_deepseek_native: true } : {}),
    ...(credential.provider === 'fireworks-api' ? { web_runner_fireworks_native: true } : {}),
    ...(credential.provider === 'nvidia-api' ? { web_runner_nvidia_native: true } : {}),
    ...(credential.provider === 'together-api' ? { web_runner_together_native: true } : {}),
    ...(credential.provider === 'cerebras-api' ? { web_runner_cerebras_native: true } : {}),
    ...(credential.provider === 'opencode-zen' ? { web_runner_opencode_zen_native: true } : {}),
    ...(credential.provider === 'ant-ling-api' ? { web_runner_ant_ling_native: true } : {}),
    ...(credential.provider === 'zai-api' ? { web_runner_zai_native: true } : {}),
    ...(['moonshot-api','moonshot-cn-api'].includes(credential.provider) ? { web_runner_moonshot_native: true } : {}),
    ...(credential.provider === 'xiaomi-api' ? { web_runner_xiaomi_native: true } : {}),
    ...(credential.provider === 'azure-openai-api' ? { web_runner_azure_native: true } : {}),
    ...(['minimax-api','minimax-cn-api'].includes(credential.provider) ? { web_runner_minimax_native: true } : {}),
    ...(credential.provider === 'huggingface-api' ? { web_runner_huggingface_native: true } : {}),
    ...(credential.provider === 'mistral-api' ? { web_runner_mistral_native: true } : {}) };
}
