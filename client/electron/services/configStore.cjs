const fs = require('node:fs');
const path = require('node:path');
const { getConfigFilePath } = require('../utils/paths.cjs');
const { createAnalyticsClientId } = require('../utils/machineIdentity.cjs');
const { defaultExportFormat, normalizeExportFormat } = require('./exportFormatDefaults.cjs');
const { normalizeCompanyRegistry } = require('./companyRegistry.cjs');

// Store text-model keys by provider; unknown legacy providers
// still normalize to OpenRouter.
const textModelProviders = ['openrouter', 'opencode-go'];
const imageModelProviders = ['openrouter'];
const fileParserProviders = ['local'];
const aiRequestModes = ['normal', 'stream'];
// Update checks are disabled; old channel preferences migrate to Savia's release page.
const updateChannels = ['github'];
const DEFAULT_TEXT_CONTEXT_LENGTH_LIMIT = 400000;
const DEFAULT_TEXT_OUTPUT_TOKEN_LIMIT = 128000;
const DEFAULT_TEXT_CONCURRENCY_LIMIT = 10;
const DEFAULT_TEXT_TEMPERATURE = 0.7;
const DEFAULT_IMAGE_CONCURRENCY_LIMIT = 2;
const DEFAULT_COMPONENT_CONCURRENCY_LIMIT = 5;
const MIN_COMPONENT_CONCURRENCY_LIMIT = 1;
const MAX_COMPONENT_CONCURRENCY_LIMIT = 20;
const DEFAULT_AGENT_AUTO_ANSWER_ENABLED = false;
const openAICompatibleImageSizes = ['auto', '1K', '2K', '3K', '4K', '1024x768', '1024x1024', '768x1024', '1536x1024', '1024x1536', '2048x2048', '2048x1152', '3840x2160', '2160x3840'];
const googleImageSizes = ['512', '1K', '2K', '4K'];
const agnesImageRatios = ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'];

const textProviderBaseUrls = {
  openrouter: 'https://openrouter.ai/api/v1',
  'opencode-go': 'https://opencode.ai/inference/go/openai/v1',
};

const defaultTextModelProfiles = {
  openrouter: {
    api_key: '',
    base_url: textProviderBaseUrls.openrouter,
    model_name: '',
    multimodal_enabled: false,
    reasoning_effort: '',
    context_length_limit: DEFAULT_TEXT_CONTEXT_LENGTH_LIMIT,
    output_token_limit: DEFAULT_TEXT_OUTPUT_TOKEN_LIMIT,
    concurrency_limit: DEFAULT_TEXT_CONCURRENCY_LIMIT,
    temperature_enabled: false,
    temperature: DEFAULT_TEXT_TEMPERATURE,
    request_mode: 'stream',
  },
  'opencode-go': {
    api_key: '', base_url: textProviderBaseUrls['opencode-go'], model_name: 'muse-spark-1.3-contributor',
    multimodal_enabled: false, reasoning_effort: 'low', context_length_limit: DEFAULT_TEXT_CONTEXT_LENGTH_LIMIT,
    output_token_limit: 16384, concurrency_limit: 2, temperature_enabled: false,
    temperature: DEFAULT_TEXT_TEMPERATURE, request_mode: 'normal',
  },
};

const defaultImageModelProfiles = {
  openrouter: {
    provider: 'openrouter',
    base_url: 'https://openrouter.ai/api/v1',
    api_key: '',
    model_name: 'google/gemini-2.5-flash-image',
    image_size: '1024x1024',
    request_mode: 'normal',
    concurrency_limit: DEFAULT_IMAGE_CONCURRENCY_LIMIT,
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
};

const defaultConfig = {
  ui_language: '',
  ui_theme: 'system',
  ui_color_theme: 'neutral',
  ui_style: 'vega',
  ui_opportunity_detail: 'dialog',
  text_model_provider: 'openrouter',
  official_api_model_type: 'cost-effective',
  text_model_profiles: defaultTextModelProfiles,
  ...defaultTextModelProfiles.openrouter,
  image_model: {
    ...defaultImageModelProfiles.openrouter,
  },
  image_model_profiles: defaultImageModelProfiles,
  components: {
    document_editor: 'builtin',
    file_parser: {
      provider: 'local',
      mineru_token: '',
    },
    mermaid_concurrency_limit: DEFAULT_COMPONENT_CONCURRENCY_LIMIT,
    html_concurrency_limit: DEFAULT_COMPONENT_CONCURRENCY_LIMIT,
  },
  update_channel: 'github',
  gpu_hardware_acceleration_enabled: true,
  gpu_hardware_acceleration_configured: true,
  export_format: defaultExportFormat,
  agent_auto_answer_enabled: DEFAULT_AGENT_AUTO_ANSWER_ENABLED,
  developer_mode: false,
  developer_token_stats_auto_open: false,
  developer_agent_monitor_auto_open: false,
  storage_cleanup_version: 0,
  analytics_enabled: false,
  analytics_client_id: '',
  analytics_created_at: '',
  // Optional datos.gov.co (Socrata) token to increase request limits
  // for SECOP Opportunities. Sent as X-App-Token; empty means anonymous.
  secop_app_token: '',
};

function createAnalyticsCreatedAt() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isTextModelProvider(value) {
  return textModelProviders.includes(value);
}

function isImageModelProvider(value) {
  return imageModelProviders.includes(value);
}

function normalizeAiRequestMode(value, fallback = 'stream') {
  return aiRequestModes.includes(value) ? value : fallback;
}

function normalizeUpdateChannel(value, fallback = defaultConfig.update_channel) {
  return updateChannels.includes(value) ? value : fallback;
}

function normalizeTextContextLengthLimit(value, fallback = DEFAULT_TEXT_CONTEXT_LENGTH_LIMIT) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

// Normalize the output token limit; use the default when absent or nonpositive.
function normalizeTextOutputTokenLimit(value, fallback = DEFAULT_TEXT_OUTPUT_TOKEN_LIMIT) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function normalizeTextConcurrencyLimit(value, fallback = DEFAULT_TEXT_CONCURRENCY_LIMIT) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

// Normalize text-model temperature to the common OpenAI-compatible range of 0–2.
function normalizeTextTemperature(value, fallback = DEFAULT_TEXT_TEMPERATURE) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 2 ? number : fallback;
}

// Normalize the text-model temperature toggle.
function normalizeTextTemperatureEnabled(value, fallback = false) {
  return value === undefined ? fallback : Boolean(value);
}

// Normalize the multimodal toggle; default off when absent in older configurations.
function normalizeTextMultimodalEnabled(value, fallback = false) {
  return value === undefined ? fallback : Boolean(value);
}

// Normalize text-model reasoning effort; an empty string omits the parameter.
function normalizeReasoningEffort(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value).trim();
}

function normalizeImageConcurrencyLimit(value, fallback = DEFAULT_IMAGE_CONCURRENCY_LIMIT) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

// Normalize component conversion concurrency to 1–20.
function normalizeComponentConcurrencyLimit(value, fallback = DEFAULT_COMPONENT_CONCURRENCY_LIMIT) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(MAX_COMPONENT_CONCURRENCY_LIMIT, Math.max(MIN_COMPONENT_CONCURRENCY_LIMIT, Math.round(number)));
}

// Normalize component settings (file parsing and Mermaid/HTML conversion concurrency).
function normalizeComponentsConfig(source) {
  const components = source && typeof source === 'object' ? source : {};
  const fileParser = components.file_parser && typeof components.file_parser === 'object'
    ? components.file_parser
    : {};
  return {
    document_editor: components.document_editor === 'libreoffice' ? 'libreoffice' : 'builtin',
    file_parser: {
      // Local parsing only; external-network MinerU presets were removed.
      provider: fileParserProviders.includes(fileParser.provider) ? fileParser.provider : 'local',
      mineru_token: fileParser.mineru_token || defaultConfig.components.file_parser.mineru_token,
    },
    mermaid_concurrency_limit: normalizeComponentConcurrencyLimit(
      components.mermaid_concurrency_limit,
      defaultConfig.components.mermaid_concurrency_limit,
    ),
    html_concurrency_limit: normalizeComponentConcurrencyLimit(
      components.html_concurrency_limit,
      defaultConfig.components.html_concurrency_limit,
    ),
  };
}

function normalizeTextModelProfile(provider, profile) {
  const defaults = defaultTextModelProfiles[provider] || defaultTextModelProfiles.openrouter;
  const source = profile || {};
  // Endpoints are fixed per provider and cannot be supplied through the settings file.
  const sourceBaseUrl = defaults.base_url;
  return {
    api_key: source.api_key !== undefined ? source.api_key : defaults.api_key,
    base_url: sourceBaseUrl,
    model_name: source.model_name !== undefined ? source.model_name : defaults.model_name,
    multimodal_enabled: normalizeTextMultimodalEnabled(source.multimodal_enabled, defaults.multimodal_enabled),
    reasoning_effort: normalizeReasoningEffort(source.reasoning_effort, defaults.reasoning_effort),
    context_length_limit: normalizeTextContextLengthLimit(source.context_length_limit, defaults.context_length_limit),
    output_token_limit: normalizeTextOutputTokenLimit(source.output_token_limit, defaults.output_token_limit),
    concurrency_limit: normalizeTextConcurrencyLimit(source.concurrency_limit, defaults.concurrency_limit),
    temperature_enabled: normalizeTextTemperatureEnabled(source.temperature_enabled, defaults.temperature_enabled),
    temperature: normalizeTextTemperature(source.temperature, defaults.temperature),
    request_mode: normalizeAiRequestMode(source.request_mode, defaults.request_mode),
  };
}

function normalizeTextModelProfiles(sourceProfiles) {
  const profiles = {};
  textModelProviders.forEach((provider) => {
    profiles[provider] = normalizeTextModelProfile(
      provider,
      sourceProfiles && typeof sourceProfiles === 'object' ? sourceProfiles[provider] : null,
    );
  });
  return profiles;
}

function textProfileFromFlatConfig(source, fallback, provider) {
  // Endpoints are fixed per provider and cannot be supplied through the settings file.
  const sourceBaseUrl = fallback.base_url;
  return {
    api_key: source.api_key !== undefined ? source.api_key : fallback.api_key,
    base_url: sourceBaseUrl,
    model_name: source.model_name !== undefined ? source.model_name : fallback.model_name,
    multimodal_enabled: normalizeTextMultimodalEnabled(source.multimodal_enabled, fallback.multimodal_enabled),
    reasoning_effort: normalizeReasoningEffort(source.reasoning_effort, fallback.reasoning_effort),
    context_length_limit: normalizeTextContextLengthLimit(source.context_length_limit !== undefined ? source.context_length_limit : fallback.context_length_limit, fallback.context_length_limit),
    output_token_limit: normalizeTextOutputTokenLimit(source.output_token_limit !== undefined ? source.output_token_limit : fallback.output_token_limit, fallback.output_token_limit),
    concurrency_limit: normalizeTextConcurrencyLimit(source.concurrency_limit !== undefined ? source.concurrency_limit : fallback.concurrency_limit, fallback.concurrency_limit),
    temperature_enabled: normalizeTextTemperatureEnabled(source.temperature_enabled, fallback.temperature_enabled),
    temperature: normalizeTextTemperature(source.temperature !== undefined ? source.temperature : fallback.temperature, fallback.temperature),
    request_mode: normalizeAiRequestMode(source.request_mode !== undefined ? source.request_mode : fallback.request_mode, fallback.request_mode),
  };
}

function getImageSizeOptions(provider) {
  return provider === 'google-ai-studio' ? googleImageSizes : openAICompatibleImageSizes;
}

function normalizeImageSize(provider, value, fallback) {
  const options = getImageSizeOptions(provider);
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (options.includes(candidate)) {
    return candidate;
  }

  const fallbackCandidate = typeof fallback === 'string' ? fallback.trim() : '';
  if (options.includes(fallbackCandidate)) {
    return fallbackCandidate;
  }

  return provider === 'google-ai-studio' ? '1K' : '1024x1024';
}

// Normalize Agnes 2.1 image aspect ratio.
function normalizeImageRatio(value) {
  return agnesImageRatios.includes(value) ? value : '1:1';
}

function normalizeImageModelProfile(provider, profile) {
  const defaults = defaultImageModelProfiles[provider] || defaultImageModelProfiles.openrouter;
  const source = profile || {};
  // Single provider: openrouter. No provider-dependent conditional defaults.
  return {
    provider: 'openrouter',
    base_url: defaults.base_url,
    api_key: source.api_key !== undefined ? source.api_key : defaults.api_key,
    model_name: source.model_name !== undefined ? source.model_name : defaults.model_name,
    image_size: normalizeImageSize('openrouter', source.image_size, defaults.image_size),
    request_mode: normalizeAiRequestMode(source.request_mode, defaults.request_mode),
    concurrency_limit: normalizeImageConcurrencyLimit(source.concurrency_limit, defaults.concurrency_limit),
    comfyui_workflow: '',
    status: source.status !== undefined ? source.status : defaults.status,
    tested_at: source.tested_at !== undefined ? source.tested_at : defaults.tested_at,
    last_error: source.last_error !== undefined ? source.last_error : defaults.last_error,
  };
}

function normalizeImageModelProfiles(sourceProfiles) {
  const profiles = {};
  imageModelProviders.forEach((provider) => {
    profiles[provider] = normalizeImageModelProfile(
      provider,
      sourceProfiles && typeof sourceProfiles === 'object' ? sourceProfiles[provider] : null,
    );
  });
  return profiles;
}

function normalizeConfig(config) {
  const source = config || {};
  const rawTextProvider = typeof source.text_model_provider === 'string' ? source.text_model_provider : '';
  const sourceTextProvider = isTextModelProvider(rawTextProvider) ? rawTextProvider : '';
  // Unknown legacy providers fall back to openrouter.
  const textModelProvider = sourceTextProvider || defaultConfig.text_model_provider;
  const textModelProfiles = normalizeTextModelProfiles(source.text_model_profiles);
  if (sourceTextProvider) {
    const fallbackProfile = textModelProfiles[textModelProvider]
      || defaultTextModelProfiles[textModelProvider];
    textModelProfiles[textModelProvider] = textProfileFromFlatConfig(source, fallbackProfile, textModelProvider);
  }
  const officialApiModelType = source.official_api_model_type ?? defaultConfig.official_api_model_type;
  const activeTextProfile = textModelProfiles[textModelProvider];
  const sourceImageModel = source.image_model && typeof source.image_model === 'object' ? source.image_model : {};
  const imageModelProvider = isImageModelProvider(sourceImageModel.provider) ? sourceImageModel.provider : defaultConfig.image_model.provider;
  const imageModelProfiles = normalizeImageModelProfiles(source.image_model_profiles);
  imageModelProfiles[imageModelProvider] = normalizeImageModelProfile(imageModelProvider, sourceImageModel);
  const activeImageProfile = imageModelProfiles[imageModelProvider];
  const hasGpuHardwareAccelerationEnabled = typeof source.gpu_hardware_acceleration_enabled === 'boolean';
  const hasGpuHardwareAccelerationConfigured = typeof source.gpu_hardware_acceleration_configured === 'boolean';
  const gpuHardwareAccelerationConfigured = hasGpuHardwareAccelerationConfigured
    ? source.gpu_hardware_acceleration_configured
    : defaultConfig.gpu_hardware_acceleration_configured;
  const gpuHardwareAccelerationEnabled = gpuHardwareAccelerationConfigured === false
    ? defaultConfig.gpu_hardware_acceleration_enabled
    : hasGpuHardwareAccelerationEnabled ? source.gpu_hardware_acceleration_enabled : defaultConfig.gpu_hardware_acceleration_enabled;

  return {
    ...defaultConfig,
    ui_language: ['es', 'en'].includes(source.ui_language) ? source.ui_language : source.ui_language ? 'es' : '',
    ui_theme: ['light', 'dark', 'system'].includes(source.ui_theme) ? source.ui_theme : 'system',
    ui_opportunity_detail: source.ui_opportunity_detail === 'drawer' ? 'drawer' : 'dialog',
    ui_style: ['vega', 'nova', 'maia', 'lyra', 'mira'].includes(source.ui_style) ? source.ui_style : 'vega',
    ui_color_theme: ['neutral', 'blue', 'green', 'violet', 'rose'].includes(source.ui_color_theme) ? source.ui_color_theme : 'neutral',
    text_model_provider: textModelProvider,
    official_api_model_type: officialApiModelType,
    text_model_profiles: textModelProfiles,
    api_key: activeTextProfile.api_key,
    base_url: activeTextProfile.base_url,
    model_name: activeTextProfile.model_name,
    multimodal_enabled: activeTextProfile.multimodal_enabled,
    reasoning_effort: activeTextProfile.reasoning_effort,
    context_length_limit: activeTextProfile.context_length_limit,
    output_token_limit: activeTextProfile.output_token_limit,
    concurrency_limit: activeTextProfile.concurrency_limit,
    temperature_enabled: activeTextProfile.temperature_enabled,
    temperature: activeTextProfile.temperature,
    request_mode: activeTextProfile.request_mode,
    image_model: activeImageProfile,
    image_model_profiles: imageModelProfiles,
    components: normalizeComponentsConfig(source.components),
    update_channel: normalizeUpdateChannel(source.update_channel),
    gpu_hardware_acceleration_enabled: gpuHardwareAccelerationEnabled,
    gpu_hardware_acceleration_configured: gpuHardwareAccelerationConfigured === false ? true : gpuHardwareAccelerationConfigured,
    export_format: normalizeExportFormat(source.export_format),
    agent_auto_answer_enabled: source.agent_auto_answer_enabled === undefined
      ? defaultConfig.agent_auto_answer_enabled
      : Boolean(source.agent_auto_answer_enabled),
    developer_mode: source.developer_mode === undefined ? defaultConfig.developer_mode : Boolean(source.developer_mode),
    developer_token_stats_auto_open: source.developer_token_stats_auto_open === undefined ? defaultConfig.developer_token_stats_auto_open : Boolean(source.developer_token_stats_auto_open),
    developer_agent_monitor_auto_open: source.developer_agent_monitor_auto_open === undefined ? defaultConfig.developer_agent_monitor_auto_open : Boolean(source.developer_agent_monitor_auto_open),
    storage_cleanup_version: Number.isFinite(Number(source.storage_cleanup_version))
      ? Math.max(0, Math.floor(Number(source.storage_cleanup_version)))
      : defaultConfig.storage_cleanup_version,
    // Telemetry removed: analytics_enabled normalizes to false.
    // secop_app_token is the optional datos.gov.co (Socrata) App Token.
    analytics_enabled: false,
    analytics_client_id: source.analytics_client_id || defaultConfig.analytics_client_id,
    analytics_created_at: source.analytics_created_at || defaultConfig.analytics_created_at,
    secop_app_token: typeof source.secop_app_token === 'string' ? source.secop_app_token.trim() : '',
    secop_search_preferences: source.secop_search_preferences && typeof source.secop_search_preferences === 'object' ? source.secop_search_preferences : null,
    company_workspaces: normalizeCompanyRegistry(source.company_workspaces),
  };
}

function createConfigStore(app) {
  const configFile = getConfigFilePath(app);

  function persist(config) {
    let tempFile = '';
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    try {
      tempFile = `${configFile}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(config, null, 2), 'utf-8');
      fs.renameSync(tempFile, configFile);
    } catch (error) {
      if (tempFile) {
        try { fs.rmSync(tempFile, { force: true }); } catch {}
      }
      throw error;
    }
  }

  function withAnalyticsIdentity(config) {
    if (config.analytics_client_id && config.analytics_created_at) {
      return config;
    }

    return {
      ...config,
      analytics_client_id: config.analytics_client_id || createAnalyticsClientId(),
      analytics_created_at: config.analytics_created_at || createAnalyticsCreatedAt(),
    };
  }

  return {
    getConfigFilePath() {
      return configFile;
    },

    load() {
      if (!fs.existsSync(configFile)) {
        const config = withAnalyticsIdentity(normalizeConfig());
        persist(config);
        return config;
      }

      try {
        const raw = fs.readFileSync(configFile, 'utf-8');
        const parsedConfig = JSON.parse(raw);
        const config = normalizeConfig(parsedConfig);
        const nextConfig = withAnalyticsIdentity(config);
        if (JSON.stringify(parsedConfig) !== JSON.stringify(nextConfig)) {
          persist(nextConfig);
        }
        return nextConfig;
      } catch (error) {
        throw new Error(`配置文件读取失败：${error.message}`);
      }
    },

    save(config) {
      try {
        const currentConfig = fs.existsSync(configFile)
          ? normalizeConfig(JSON.parse(fs.readFileSync(configFile, 'utf-8')))
          : normalizeConfig();
        // Merge provider fields individually; omitted fields keep the latest disk value, and switching reads the target profile.
        const textModelProfiles = Object.fromEntries(textModelProviders.map((provider) => [provider, {
          ...currentConfig.text_model_profiles[provider],
          ...config?.text_model_profiles?.[provider],
        }]));
        const provider = config?.text_model_provider ?? currentConfig.text_model_provider;
        const activeTextProfile = textProfileFromFlatConfig(config || {}, textModelProfiles[provider], provider);
        const nextConfig = withAnalyticsIdentity(normalizeConfig({
          ...currentConfig,
          ...config,
          ...activeTextProfile,
          text_model_profiles: textModelProfiles,
          image_model_profiles: {
            ...currentConfig.image_model_profiles,
            ...(config && config.image_model_profiles ? config.image_model_profiles : {}),
          },
          analytics_client_id: config?.analytics_client_id || currentConfig.analytics_client_id,
          analytics_created_at: config?.analytics_created_at || currentConfig.analytics_created_at,
        }));
        persist(nextConfig);
        return { success: true, message: '配置已保存', config_path: configFile };
      } catch (error) {
        throw new Error(`配置文件保存失败：${error.message}`);
      }
    },
  };
}

module.exports = {
  createConfigStore,
};
