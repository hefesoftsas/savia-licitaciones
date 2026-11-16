const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { nativeImage } = process.env.SAVIA_HEADLESS_RUNNER === '1' ? {} : require('electron');
const { getGeneratedImagesDir } = require('../utils/paths.cjs');
const { compressGeneratedImage } = require('../utils/imageCompression.cjs');
const { createDeveloperLogger } = require('../utils/developerLog.cjs');
const { createAiRequestQueue } = require('../utils/aiRequestQueue.cjs');
const { bindAiRequestActivity, notifyAiResponse, withAiResponseActivity } = require('../utils/aiRequestActivity.cjs');
const { fetchWithRedirect } = require('../utils/fetchWithRedirect.cjs');
const {
  copyAiHttpError,
  createAiHttpErrorFromResponse,
  emitAiHttpErrorToWindows,
} = require('../utils/aiHttpError.cjs');
const {
  copyAiRequestErrorMeta,
  markAiRequestError,
  runWithAiRetry,
} = require('../utils/aiRetry.cjs');
const {
  createAiRequestId: createRequestId,
  getAiErrorLogError,
  getAiErrorLogResponse,
  resolveAiLogTitle,
  writeAiLog,
} = require('../utils/aiLog.cjs');
const textTokenStatsStore = require('./textTokenStatsStore.cjs');
const { buildImageStylePrompt } = require('./aiImageStyles.cjs');
const { pickLocaleMessage, detectLocaleFromConfig } = require('../utils/localeMessages.cjs');
const { normalizeTokenUsage } = textTokenStatsStore;
const { toResponsesRequest, toChatCompletion } = require('./opencodeResponses.cjs');
const OPENCODE_RESPONSES_URL = 'https://opencode.ai/inference/go/openai/v1/responses';
const opencodeSessionSalt = crypto.randomUUID();

const AI_REQUEST_TIMEOUT_MS = 600000;
const MULTIMODAL_IMAGE_MAX_EDGE = 2048;
const MULTIMODAL_IMAGE_JPEG_QUALITY = 85;

const IMAGE_MODEL_TEST_TIMEOUT_MESSAGE = '生图模型测试超时，请检查 Base URL、API Key 或模型名称';
function trimBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function requireBaseUrl(baseUrl, message) {
  const trimmed = trimBaseUrl(baseUrl);
  if (!trimmed) {
    throw new Error(message);
  }
  return trimmed;
}

function isResponseFormatUnsupported(message) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('response_format') && [
    'not supported',
    'does not support',
    'not support',
    'unsupported',
    'unknown parameter',
    'invalid parameter',
    'must be',
  ].some((marker) => normalized.includes(marker));
}

function createModuleDeveloperLogger(app, config, moduleName, request = {}) {
  return createDeveloperLogger({
    app,
    config,
    moduleName,
    name: request.name || request.logTitle || moduleName,
    meta: request.meta || {},
  });
}

function getTextTokenStatsSnapshot() {
  return textTokenStatsStore.getTextTokenStatsSnapshot();
}

function recordTextTokenStats(config, usage) {
  if (!config?.developer_mode) {
    return;
  }

  textTokenStatsStore.recordTextTokenStats(usage);
}

function resetTextTokenStats() {
  return textTokenStatsStore.resetTextTokenStats();
}

function onTextTokenStatsChanged(listener) {
  return textTokenStatsStore.onTextTokenStatsChanged(listener);
}

function extractOpenAIUsage(responseData) {
  return normalizeTokenUsage(responseData?.usage);
}

function extractGoogleUsage(responseData) {
  return normalizeTokenUsage(responseData?.usageMetadata || responseData?.usage_metadata);
}

function normalizeRequestTimeoutMs(request) {
  const timeoutMs = Number(request?.timeout_ms);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : AI_REQUEST_TIMEOUT_MS;
}

function normalizeTextRequestMode(config) {
  if (config?.text_model_provider === 'opencode-go') return 'normal';
  return config?.request_mode === 'normal' ? 'normal' : 'stream';
}

// Read a local image, proportionally reduce its longest edge, and encode it as a JPEG Base64 data URL.
async function compressLocalImageToDataUrl(filePath) {
  const normalizedPath = String(filePath || '').trim();
  if (!normalizedPath) {
    throw new Error('本地图片路径不能为空');
  }

  try {
    const sourceBuffer = await fs.promises.readFile(normalizedPath);
    const sourceImage = nativeImage.createFromBuffer(sourceBuffer);
    if (sourceImage.isEmpty()) {
      throw new Error('图片格式不受支持或文件已损坏');
    }

    const { width, height } = sourceImage.getSize();
    const maxEdge = Math.max(width, height);
    const image = maxEdge > MULTIMODAL_IMAGE_MAX_EDGE
      ? sourceImage.resize(width >= height
        ? { width: MULTIMODAL_IMAGE_MAX_EDGE, quality: 'best' }
        : { height: MULTIMODAL_IMAGE_MAX_EDGE, quality: 'best' })
      : sourceImage;
    const compressedBuffer = image.toJPEG(MULTIMODAL_IMAGE_JPEG_QUALITY);
    if (!compressedBuffer.length) {
      throw new Error('图片压缩结果为空');
    }

    return `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;
  } catch (error) {
    throw new Error(`图片读取或压缩失败（${path.basename(normalizedPath)}）：${error.message}`);
  }
}

// Block text-model requests containing images when multimodal support is disabled.
function ensureMultimodalEnabled(config, messages) {
  if (config.multimodal_enabled) return;
  const hasImage = messages.some((message) => Array.isArray(message.content)
    && message.content.some((part) => part?.type === 'local_image' || part?.type === 'image_url'));
  if (hasImage) {
    throw new Error(pickLocaleMessage(detectLocaleFromConfig(config), '当前文本模型未开启多模态支持，请在设置中开启后重试', 'El modelo de texto actual no admite multimodalidad; actívelo en Ajustes y reintente', 'Current text model does not support multimodality; enable it in Settings and retry'));
  }
}

// Check multimodal support and sequentially convert local images into OpenAI Chat Completions image content blocks.
async function prepareMultimodalMessages(config, messages) {
  ensureMultimodalEnabled(config, messages);
  // Some inference services (such as LM Studio with Qwen3 models and strict official chat templates) require
  // the system message to come first or they reject the request. Before sending, merge all system messages in original order
  // into one leading message; preserve the order of all other messages.
  const sourceMessages = Array.isArray(messages) ? messages : [];
  const systemParts = sourceMessages
    .filter((message) => message?.role === 'system')
    .map((message) => message.content)
    .filter((content) => Array.isArray(content) ? content.length > 0 : content?.trim());
  const nonSystemMessages = sourceMessages.filter((message) => message?.role !== 'system');
  // Preserve blank lines between messages and leave structured content blocks unchanged for subsequent image conversion.
  const systemContent = systemParts.some(Array.isArray)
    ? systemParts.flatMap((content, index) => [
      ...(index > 0 ? [{ type: 'text', text: '\n\n' }] : []),
      ...(Array.isArray(content) ? content : [{ type: 'text', text: content }]),
    ])
    : systemParts.join('\n\n');
  const normalizedMessages = systemParts.length
    ? [{ role: 'system', content: systemContent }, ...nonSystemMessages]
    : nonSystemMessages;

  const preparedMessages = [];
  for (const message of normalizedMessages) {
    if (!Array.isArray(message.content)) {
      preparedMessages.push(message);
      continue;
    }

    const content = [];
    for (const part of message.content) {
      if (part?.type !== 'local_image') {
        content.push(part);
        continue;
      }

      content.push({
        type: 'image_url',
        image_url: {
          url: await compressLocalImageToDataUrl(part.path),
          ...(part.detail ? { detail: part.detail } : {}),
        },
      });
    }
    preparedMessages.push({ ...message, content });
  }
  return preparedMessages;
}

// Build an OpenAI-compatible image request using the provider's protocol.
function createAbortError() {
  const error = new Error('AI 请求超时');
  error.name = 'AbortError';
  return markAiRequestError(error, { retryable: true });
}

function createOperationTimeout(timeoutMs) {
  const controller = new AbortController();
  const timeoutPromise = new Promise((_resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(createAbortError());
    }, timeoutMs);
    controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  });

  return {
    signal: controller.signal,
    run(promise) {
      return Promise.race([promise, timeoutPromise]);
    },
    clear() {
      controller.abort();
    },
  };
}

async function runWithOperationTimeout(runner, timeoutMs = AI_REQUEST_TIMEOUT_MS, parentSignal) {
  const timeout = createOperationTimeout(timeoutMs);
  try {
    const signal = parentSignal ? AbortSignal.any([timeout.signal, parentSignal]) : timeout.signal;
    return await timeout.run(runner(signal));
  } finally {
    timeout.clear();
  }
}

// Build model request headers; only the official text service includes the open-source client identifier.
function createHeaders(apiKey, textModelProvider) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    ...(textModelProvider === 'official' ? { 'X-Savia-Client-Type': 'open-source' } : {}),
  };
}

// Telemetry removed: preserve the signature to keep approximately 18 call sites
// unchanged; no network requests are made.
function trackAiRequest(app, config, payload) {
  return undefined;
}

function imageExtensionFromMime(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('bmp')) return 'bmp';
  return 'png';
}

function getImageModelAvailability(config) {
  const imageConfig = config.image_model || {};
  if (imageConfig.status !== 'available') {
    return { available: false, status: imageConfig.status || 'untested', message: '生图模型未测试可用' };
  }

  if (!imageConfig.api_key) {
    return { available: false, status: 'unavailable', message: '请先填写生图模型 API Key' };
  }

  if (!imageConfig.model_name) {
    return { available: false, status: 'unavailable', message: '请先填写生图模型名称' };
  }

  if (!trimBaseUrl(imageConfig.base_url)) {
    return { available: false, status: 'unavailable', message: '请先填写生图模型 Base URL' };
  }

  return { available: true, status: 'available', message: '生图模型可用' };
}

function normalizeImagePrompt(request) {
  const prompt = String(request.prompt || '').trim();
  if (!prompt) {
    throw new Error(pickLocaleMessage(detectLocaleFromConfig(), '生图提示词为空', 'El prompt de generación de imágenes está vacío', 'Image generation prompt is empty'));
  }

  return buildImageStylePrompt(prompt, request.style);
}

function safeImageResponse(data) {
  return {
    ...data,
    data: Array.isArray(data?.data)
      ? data.data.map((item) => ({ ...item, b64_json: item.b64_json ? '[base64 omitted]' : item.b64_json }))
      : data?.data,
    candidates: Array.isArray(data?.candidates) ? '[candidates omitted]' : data?.candidates,
  };
}

function copyRawAiErrorResponse(source, target) {
  for (const key of ['raw_response_body', 'raw_response_payload', 'raw_response_data', 'raw_sse_data']) {
    if (Object.prototype.hasOwnProperty.call(source || {}, key)) {
      target[key] = source[key];
    }
  }
  return copyAiHttpError(source, target);
}

function createAiResponseDataError(message, responseData) {
  const error = new Error(message);
  error.raw_response_data = responseData;
  return error;
}

async function downloadImage(url, options = {}) {
  let response = null;
  try {
    response = await fetch(url, { signal: options.signal });
  } catch (error) {
    throw markAiRequestError(error, { retryable: true });
  }
  await ensureOk(response, '图片下载失败');
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mime_type: response.headers.get('content-type') || 'image/png',
  };
}

// Compress generated images before saving; subsequent content, previews, and Word exports use the compressed files.
function saveGeneratedImage(app, image) {
  const imagesDir = getGeneratedImagesDir(app);
  fs.mkdirSync(imagesDir, { recursive: true });
  const compressed = compressGeneratedImage(image.buffer, imageExtensionFromMime(image.mime_type));
  const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.${compressed.extension}`;
  const filePath = path.join(imagesDir, fileName);
  fs.writeFileSync(filePath, compressed.buffer);
  return {
    asset_url: `savia-asset://generated-images/${encodeURIComponent(fileName)}`,
    file_path: filePath,
    mime_type: compressed.extension === 'jpg' ? 'image/jpeg' : image.mime_type,
  };
}

async function ensureOk(response, fallbackMessage, options = {}) {
  if (response.ok) {
    return;
  }

  throw await createAiHttpErrorFromResponse(response, fallbackMessage, { source: options.source || 'ai-service' });
}

function extractJsonContent(content) {
  const normalized = String(content || '').trim();
  if (!normalized.startsWith('```')) {
    return normalized;
  }

  const lines = normalized.split(/\r?\n/);
  const firstLine = (lines[0] || '').trim().toLowerCase();
  const lastLine = (lines[lines.length - 1] || '').trim();
  if ((firstLine === '```' || firstLine === '```json') && lastLine.startsWith('```')) {
    return lines.slice(1, -1).join('\n').trim();
  }

  return normalized;
}

function extractFencedJsonBlocks(content) {
  const blocks = [];
  const normalized = String(content || '').trim();
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match = fenceRegex.exec(normalized);

  while (match) {
    const block = String(match[1] || '').trim();
    if (block) {
      blocks.push(block);
    }
    match = fenceRegex.exec(normalized);
  }

  return blocks;
}

function extractBalancedJsonCandidates(content) {
  const text = String(content || '');
  const candidates = [];

  for (let start = 0; start < text.length; start += 1) {
    const firstChar = text[start];
    if (firstChar !== '{' && firstChar !== '[') {
      continue;
    }

    const stack = [firstChar];
    let inString = false;
    let escaped = false;

    for (let index = start + 1; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{' || char === '[') {
        stack.push(char);
        continue;
      }

      if (char === '}' || char === ']') {
        const expectedOpen = char === '}' ? '{' : '[';
        if (stack[stack.length - 1] !== expectedOpen) {
          break;
        }

        stack.pop();
        if (!stack.length) {
          const candidate = text.slice(start, index + 1).trim();
          if (candidate) {
            candidates.push(candidate);
          }
          start = index;
          break;
        }
      }
    }
  }

  return candidates;
}

const jsonEscapeChars = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't']);
const markdownEscapeChars = new Set(['.', '(', ')', '[', ']', '{', '}', '#', '*', '+', '-', '_', '!', '<', '>', '|', '`']);

function repairInvalidJsonStringEscapes(content) {
  const text = String(content || '');
  let output = '';
  let inString = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (!inString) {
      output += char;
      if (char === '"') {
        inString = true;
      }
      continue;
    }

    if (char === '"') {
      output += char;
      inString = false;
      continue;
    }

    if (char !== '\\') {
      output += char;
      continue;
    }

    const nextChar = text[index + 1] || '';
    if (!nextChar) {
      output += '\\\\';
      continue;
    }

    if (nextChar === 'u') {
      const unicodeDigits = text.slice(index + 2, index + 6);
      if (/^[0-9a-fA-F]{4}$/.test(unicodeDigits)) {
        output += text.slice(index, index + 6);
        index += 5;
      } else {
        output += '\\\\';
      }
      continue;
    }

    if (jsonEscapeChars.has(nextChar)) {
      output += char + nextChar;
      index += 1;
      continue;
    }

    if (markdownEscapeChars.has(nextChar)) {
      output += nextChar;
      index += 1;
      continue;
    }

    output += '\\\\';
  }

  return output;
}

function parseJsonContent(content) {
  const normalized = String(content || '').replace(/^\uFEFF/, '').trim();
  const candidates = [
    normalized,
    extractJsonContent(normalized),
    ...extractFencedJsonBlocks(normalized),
  ].filter(Boolean);

  const withBalancedCandidates = [];
  for (const candidate of candidates) {
    withBalancedCandidates.push(candidate);
    withBalancedCandidates.push(...extractBalancedJsonCandidates(candidate));
  }

  const repairedCandidates = [];
  for (const candidate of withBalancedCandidates) {
    const repaired = repairInvalidJsonStringEscapes(candidate);
    if (repaired !== candidate) {
      repairedCandidates.push(repaired);
    }
  }

  const uniqueCandidates = [...new Set([...withBalancedCandidates, ...repairedCandidates].map((item) => item.trim()).filter(Boolean))];
  let lastError = null;

  for (const candidate of uniqueCandidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('AI 返回内容为空，无法解析 JSON');
}

function formatJsonIssues(error) {
  if (error instanceof SyntaxError) {
    return [`JSON 语法错误：${error.message}`];
  }

  return [error?.message || String(error || '字段校验失败')];
}

function buildJsonRepairMessages(invalidContent, issues, targetDescription) {
  const issueLines = (issues || []).map((item, index) => `${index + 1}. ${item}`).join('\n');
  return [
    {
      role: 'system',
      content: `你是一个严格的 JSON 修复助手。请根据给出的原始内容和校验问题，修复现有结果。

要求：
1. 优先在原结果基础上做最小必要修改，不要整体重写
2. 尽量保留原有结构、字段值、节点顺序和已生成内容
3. 若缺少必填字段，应结合现有上下文补齐合理内容，不要用空字符串敷衍
4. 若存在多余说明、代码块包裹、字段名错误、children 结构不规范或顶层包裹错误，应修正为合法 JSON
5. 必须修复 JSON 字符串中的非法反斜杠转义，例如将 1\\. 改为 1.，或将必须保留的反斜杠写成 \\\\
6. 只返回修复后的完整 JSON，不要输出任何解释`,
    },
    { role: 'user', content: `目标结果类型：${targetDescription}` },
    { role: 'user', content: `当前校验问题：\n${issueLines}` },
    {
      role: 'user',
      content: `待修复内容：\n\`\`\`json\n${String(invalidContent || '').slice(0, 60000)}\n\`\`\``,
    },
    {
      role: 'user',
      content: '请在保留原有正确内容的前提下，仅修复上述问题，并返回完整 JSON。',
    },
  ];
}

async function emitProgress(progressCallback, message) {
  if (!progressCallback) {
    return;
  }

  await Promise.resolve(progressCallback(message));
}

function normalizeJsonPayload(request, parsed) {
  const normalized = request.normalizer ? request.normalizer(parsed) : parsed;
  if (request.validator) {
    request.validator(normalized);
  }
  return normalized;
}

async function repairJsonResponse(app, config, invalidContent, issues, responseFormat, progressCallback, progressLabel, repairMessagesBuilder, logTitle, signal) {
  await emitProgress(progressCallback, `${progressLabel}格式校验失败，正在基于当前结果进行修复。`);
  return chatWithConfig(app, config, {
    messages: repairMessagesBuilder
      ? repairMessagesBuilder({ invalidContent, issues, progressLabel })
      : buildJsonRepairMessages(invalidContent, issues, progressLabel),
    response_format: responseFormat,
    logTitle: logTitle ? `${logTitle}修复` : `${progressLabel}修复`,
    signal,
  });
}

async function parseOrRepairJsonResponseWithConfig(app, config, request, content) {
  const responseFormat = request.response_format || { type: 'json_object' };
  const progressLabel = request.progressLabel || 'JSON结果';
  const failureMessage = request.failureMessage || '模型返回的 JSON 数据格式无效';
  const logTitle = resolveAiLogTitle(request, progressLabel);

  try {
    return normalizeJsonPayload(request, parseJsonContent(content));
  } catch (error) {
    const issues = formatJsonIssues(error);
    try {
      const repairedContent = await repairJsonResponse(
        app,
        config,
        content,
        issues,
        responseFormat,
        request.progressCallback,
        progressLabel,
        request.repairMessagesBuilder,
        logTitle,
        request.signal,
      );
      return normalizeJsonPayload(request, parseJsonContent(repairedContent));
    } catch (repairError) {
      throw jsonFailureError(failureMessage, repairError);
    }
  }
}

// On final failure, retain the last validation or repair cause and AI request marker for callers and user diagnostics.
function jsonFailureError(failureMessage, cause) {
  const reason = String(cause?.message || '').trim();
  return copyAiRequestErrorMeta(cause, new Error(reason ? `${failureMessage}：${reason}` : failureMessage));
}

async function collectJsonResponseWithConfig(app, config, request) {
  const preparedMessages = await prepareMultimodalMessages(config, request.messages);
  const maxRetries = request.max_retries ?? 2;
  const totalAttempts = maxRetries + 1;
  const responseFormat = request.response_format || { type: 'json_object' };
  const progressLabel = request.progressLabel || 'JSON结果';
  const failureMessage = request.failureMessage || '模型返回的 JSON 数据格式无效';
  const logTitle = resolveAiLogTitle(request, progressLabel);
  let lastError = null;

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const content = await chatWithConfig(app, config, {
      messages: preparedMessages,
      response_format: responseFormat,
      timeout_ms: request.timeout_ms,
      timeout_message: request.timeout_message,
      logTitle,
      signal: request.signal,
    });

    try {
      const parsed = parseJsonContent(content);
      return normalizeJsonPayload(request, parsed);
    } catch (error) {
      lastError = error;
      const issues = formatJsonIssues(error);

      try {
        const repairedContent = await repairJsonResponse(
          app,
          config,
          content,
          issues,
          responseFormat,
          request.progressCallback,
          progressLabel,
          request.repairMessagesBuilder,
          logTitle,
          request.signal,
        );
        const repairedParsed = parseJsonContent(repairedContent);
        return normalizeJsonPayload(request, repairedParsed);
      } catch (repairError) {
        lastError = repairError;

        if (attempt === maxRetries) {
          await emitProgress(request.progressCallback, `${progressLabel}连续 ${totalAttempts} 次校验失败。`);
          throw jsonFailureError(failureMessage, repairError);
        }

        await emitProgress(request.progressCallback, `${progressLabel}第 ${attempt + 1}/${totalAttempts} 次校验失败，正在重试。`);
      }
    }
  }

  throw new Error(lastError?.message || failureMessage);
}

// Use max_completion_tokens for every provider, overriding the Agent SDK length parameter; individual requests may specify their own limit.
function applyOutputTokenLimit(body, config, requestLimit = 0) {
  delete body.max_output_tokens;
  delete body.max_tokens;
  delete body.max_completion_tokens;
  const limit = requestLimit > 0 ? requestLimit : config.output_token_limit;
  if (limit > 0) {
    body.max_completion_tokens = limit;
  } else {
    delete body.max_completion_tokens;
  }
  return body;
}

// Build regular, streaming, and JSON text requests.
function createChatRequestBody(config, request, options = {}) {
  const body = {
    model: config.model_name,
    messages: request.messages,
  };

  if (config.temperature_enabled) {
    body.temperature = config.temperature;
  }

  if (config.reasoning_effort) {
    body.reasoning_effort = config.reasoning_effort;
  }

  if (options.stream) {
    body.stream = true;
  }

  if (request.response_format && !options.omitResponseFormat) {
    body.response_format = request.response_format;
  }

  return applyOutputTokenLimit(body, config, request.output_token_limit);
}

// Preserve Pi tool-call protocol fields and consistently apply the current text-model configuration.
function createAgentChatRequestBody(config, sourceBody) {
  const source = sourceBody && typeof sourceBody === 'object' ? sourceBody : {};
  const messages = Array.isArray(source.messages) ? source.messages : [];
  if (!messages.length) {
    throw new Error('Agent 代理请求缺少 messages');
  }

  const body = {
    ...source,
    model: config.model_name,
    messages,
    stream: normalizeTextRequestMode(config) === 'stream',
  };
  if (!body.stream) delete body.stream_options;
  if (config.temperature_enabled) {
    body.temperature = config.temperature;
  } else {
    delete body.temperature;
  }
  if (config.reasoning_effort) {
    body.reasoning_effort = config.reasoning_effort;
  } else {
    delete body.reasoning_effort;
  }

  return applyOutputTokenLimit(body, config);
}

async function fetchChatCompletion(app, config, body, options = {}) {
  const controller = options.signal ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS) : null;
  const baseUrl = requireBaseUrl(config.base_url, '请先在设置中配置文本模型 Base URL');
  try {
    if (config.text_model_provider === 'opencode-go') {
      const session = crypto.createHash('sha256').update(`${opencodeSessionSalt}:${options.sessionId || 'app'}`).digest('hex');
      const response = await fetchWithRedirect(OPENCODE_RESPONSES_URL, {
        method: 'POST',
        headers: { ...createHeaders(config.api_key, config.text_model_provider), 'User-Agent':'licitaciones-app/1.0', 'x-opencode-session':session },
        body: JSON.stringify(toResponsesRequest(body)),
        signal: options.signal || controller.signal,
      });
      if (!response.ok) return response;
      const data = await response.json();
      return new Response(JSON.stringify(toChatCompletion(data)), {status:response.status,headers:{'content-type':'application/json'}});
    }
    return await fetchWithRedirect(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: createHeaders(config.api_key, config.text_model_provider),
      body: JSON.stringify(body),
      signal: options.signal || controller.signal,
    });
  } catch (error) {
    throw markAiRequestError(error, { retryable: true });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function ensureTextAiResponseOk(response, fallbackMessage) {
  if (response.ok) {
    return;
  }

  throw await createAiHttpErrorFromResponse(response, fallbackMessage, {
    source: 'text-model',
    responseFormatUnsupportedChecker: isResponseFormatUnsupported,
  });
}

function appendStreamChoiceContent(choice, contentParts) {
  const deltaContent = choice?.delta?.content;
  const messageContent = choice?.message?.content;
  const textContent = choice?.text;

  if (typeof deltaContent === 'string') {
    contentParts.push(deltaContent);
    return;
  }

  if (typeof messageContent === 'string') {
    contentParts.push(messageContent);
    return;
  }

  if (typeof textContent === 'string') {
    contentParts.push(textContent);
  }
}

function normalizeStreamPayloadError(error, fallbackMessage) {
  if (!error) {
    return fallbackMessage;
  }

  if (typeof error === 'string') {
    return error;
  }

  return error.message || error.code || fallbackMessage;
}

async function readSseJsonDataLine(line, state, options) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) {
    return;
  }

  const data = trimmed.slice(5).trim();
  if (!data) {
    return;
  }

  if (data === '[DONE]') {
    state.done = true;
    return;
  }

  let payload = null;
  try {
    payload = JSON.parse(data);
  } catch (error) {
    const parseError = new Error(`${options.parseErrorMessage || 'AI 流式响应解析失败'}：${error.message}`);
    parseError.raw_response_body = data;
    throw markAiRequestError(parseError, { retryable: true });
  }

  if (payload?.error && options.throwOnPayloadError !== false) {
    const streamError = new Error(normalizeStreamPayloadError(payload.error, options.failureMessage || 'AI 流式请求失败'));
    streamError.raw_response_payload = payload;
    streamError.raw_sse_data = data;
    throw markAiRequestError(streamError, { retryable: true });
  }

  await Promise.resolve(options.onPayload?.(payload));
}

async function readSseJsonStream(response, options = {}) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    throw markAiRequestError(new Error(options.unreadableMessage || 'AI 流式响应不可读'), { retryable: true });
  }

  const decoder = new TextDecoder('utf-8');
  const state = { done: false };
  let buffer = '';

  while (!state.done) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    if (value?.byteLength) notifyAiResponse();
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      await readSseJsonDataLine(line, state, options);
      if (state.done) {
        break;
      }
    }
  }

  buffer += decoder.decode();
  if (!state.done && buffer.trim()) {
    const lines = buffer.split(/\r?\n/);
    for (const line of lines) {
      await readSseJsonDataLine(line, state, options);
      if (state.done) {
        break;
      }
    }
  }
}

async function readOpenAIChatStream(response) {
  const state = { usage: null, contentParts: [], finishReason: null };

  await readSseJsonStream(response, {
    unreadableMessage: 'AI 流式响应不可读',
    parseErrorMessage: 'AI 流式响应解析失败',
    failureMessage: 'AI 流式请求失败',
    onPayload(payload) {
      if (payload?.usage) {
        state.usage = payload.usage;
      }

      const choices = Array.isArray(payload?.choices) ? payload.choices : [];
      choices.forEach((choice) => {
        appendStreamChoiceContent(choice, state.contentParts);
        if (choice?.finish_reason) state.finishReason = choice.finish_reason;
      });
    },
  });

  const content = state.contentParts.join('');
  return {
    content,
    usage: state.usage,
    finishReason: state.finishReason,
    responseData: {
      stream: true,
      choices: [{ message: { content }, finish_reason: state.finishReason }],
      usage: state.usage,
    },
  };
}

async function requestTextAiNormal(app, config, requestBody, options = {}) {
  const response = await fetchChatCompletion(app, config, requestBody, { signal: options.signal, sessionId: options.sessionId });
  await ensureTextAiResponseOk(response, 'AI 请求失败');
  let responseData = null;
  try {
    responseData = await response.json();
  } catch (error) {
    throw markAiRequestError(error, { retryable: true });
  }
  return {
    content: responseData.choices?.[0]?.message?.content || '',
    usage: extractOpenAIUsage(responseData),
    finishReason: responseData.choices?.[0]?.finish_reason || null,
    responseData,
  };
}

async function requestTextAiStream(app, config, requestBody, options = {}) {
  const response = await fetchChatCompletion(app, config, requestBody, { signal: options.signal, sessionId: options.sessionId });
  await ensureTextAiResponseOk(response, 'AI 请求失败');
  return readOpenAIChatStream(response);
}

async function requestTextAi(app, config, requestBody, options = {}) {
  return withAiResponseActivity(async () => {
    if (options.requestMode === 'stream') {
      return requestTextAiStream(app, config, requestBody, options);
    }

    return requestTextAiNormal(app, config, requestBody, options);
  });
}

async function chatWithConfig(app, config, request) {
  if (!config.api_key) {
    throw new Error(pickLocaleMessage(detectLocaleFromConfig(config), '请先在设置中配置文本模型 API Key', 'Configure la API Key del modelo de texto en Ajustes', 'Configure the text model API Key in Settings'));
  }

  if (!config.model_name) {
    throw new Error(pickLocaleMessage(detectLocaleFromConfig(config), '请先在设置中配置文本模型名称', 'Configure el nombre del modelo de texto en Ajustes', 'Configure the text model name in Settings'));
  }

  requireBaseUrl(config.base_url, pickLocaleMessage(detectLocaleFromConfig(config), '请先在设置中配置文本模型 Base URL', 'Configure la Base URL del modelo de texto en Ajustes', 'Configure the text model Base URL in Settings'));

  const preparedRequest = {
    ...request,
    messages: await prepareMultimodalMessages(config, request.messages),
  };
  const requestId = createRequestId();
  const logTitle = resolveAiLogTitle(request, '文本请求');
  const requestMode = normalizeTextRequestMode(config);
  let requestBody = createChatRequestBody(config, preparedRequest, { stream: requestMode === 'stream' });
  let responseData = null;
  let errorMessage = '';
  let analyticsTracked = false;
  const timeoutMs = normalizeRequestTimeoutMs(request);

  try {
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat-pending',
      request_mode: requestMode,
      url: `${trimBaseUrl(config.base_url)}/chat/completions`,
      request: requestBody,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    let result = null;
    result = await runWithAiRetry(() => runWithOperationTimeout(async (signal) => {
      try {
        return await requestTextAi(app, config, requestBody, { signal, requestMode, sessionId: request.opencodeSessionId || request.queueScopeId || request.queue_scope_id });
      } catch (error) {
        if (!preparedRequest.response_format || !error.responseFormatUnsupported) {
          throw error;
        }

        requestBody = createChatRequestBody(config, preparedRequest, { omitResponseFormat: true, stream: requestMode === 'stream' });
        return requestTextAi(app, config, requestBody, { signal, requestMode, sessionId: request.opencodeSessionId || request.queueScopeId || request.queue_scope_id });
      }
    }, timeoutMs, request.signal));

    responseData = result.responseData;
    recordTextTokenStats(config, result.usage);
    trackAiRequest(app, config, { ai_request_type: 'text', usage: result.usage });
    analyticsTracked = true;
    if (result.finishReason === 'length' && !String(result.content || '').trim()) {
      throw new Error(pickLocaleMessage(detectLocaleFromConfig(config),
        '模型达到输出长度上限但未返回正文，可能是推理消耗了全部额度。请在文本模型设置中降低推理强度或提高输出上限后重试。',
        'El modelo agotó el límite de salida sin devolver texto; el razonamiento puede haber consumido el límite. Reduce la intensidad de razonamiento o aumenta el límite de salida en Ajustes y vuelve a intentarlo.',
        'The model exhausted the output limit without returning text; reasoning may have consumed the budget. Lower reasoning effort or increase the output limit in Settings and retry.'));
    }
    // When complete output is required, treat length-limited replies as failures instead of saving them; retrying the same request usually truncates again.
    if (request.reject_truncated_output && result.finishReason === 'length') {
      throw new Error(pickLocaleMessage(detectLocaleFromConfig(config), '模型输出达到长度上限被截断，本次结果未保存。可在设置-文本模型中提高输出长度上限后重试。', 'La salida alcanzó el límite de longitud y se truncó; no se guardó. Aumente el límite en Ajustes - Modelo de texto y reintente.', 'Model output was truncated at the length limit and not saved. Increase the output limit in Settings - Text model and retry.'));
    }
    const content = result.content || '';
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat',
      request_mode: requestMode,
      url: `${trimBaseUrl(config.base_url)}/chat/completions`,
      request: requestBody,
      response: responseData,
      content,
      created_at: new Date().toISOString(),
    });
    return content;
  } catch (error) {
    errorMessage = error.name === 'AbortError'
      ? request.timeout_message || `AI 请求超时（${timeoutMs / 1000} 秒）`
      : error.message;
    if (!analyticsTracked) {
      recordTextTokenStats(config, null);
      trackAiRequest(app, config, { ai_request_type: 'text' });
      analyticsTracked = true;
    }
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat-error',
      request_mode: requestMode,
      url: `${trimBaseUrl(config.base_url)}/chat/completions`,
      request: requestBody,
      response: getAiErrorLogResponse(error, responseData),
      error: getAiErrorLogError(error, errorMessage),
      created_at: new Date().toISOString(),
    });
    const wrappedError = new Error(errorMessage || 'AI 请求失败');
    if (error.status || error.statusCode) {
      wrappedError.status = error.status || error.statusCode;
      wrappedError.statusCode = error.status || error.statusCode;
    }
    copyRawAiErrorResponse(error, wrappedError);
    copyAiRequestErrorMeta(error, wrappedError);
    markAiRequestError(wrappedError, { retryable: false });
    emitAiHttpErrorToWindows(wrappedError);
    throw wrappedError;
  }
}

// Execute one agent Chat Completions request through the shared text endpoint; release the queue slot only after consuming the response.
async function runAgentChatCompletionWithConfig(app, config, request) {
  if (!config.api_key) {
    throw new Error(pickLocaleMessage(detectLocaleFromConfig(config), '请先在设置中配置文本模型 API Key', 'Configure la API Key del modelo de texto en Ajustes', 'Configure the text model API Key in Settings'));
  }
  if (!config.model_name) {
    throw new Error(pickLocaleMessage(detectLocaleFromConfig(config), '请先在设置中配置文本模型名称', 'Configure el nombre del modelo de texto en Ajustes', 'Configure the text model name in Settings'));
  }
  requireBaseUrl(config.base_url, pickLocaleMessage(detectLocaleFromConfig(config), '请先在设置中配置文本模型 Base URL', 'Configure la Base URL del modelo de texto en Ajustes', 'Configure the text model Base URL in Settings'));
  if (typeof request.consumeResponse !== 'function') {
    throw new Error('Agent 代理请求缺少响应消费函数');
  }

  const requestId = createRequestId();
  const requestBody = createAgentChatRequestBody(config, request.body);
  ensureMultimodalEnabled(config, requestBody.messages);
  const requestMode = requestBody.stream ? 'stream' : 'normal';
  const logTitle = resolveAiLogTitle(request, 'Pi Agent');
  let responseData = null;
  let analyticsTracked = false;

  try {
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat-pending',
      request_mode: requestMode,
      url: `${trimBaseUrl(config.base_url)}/chat/completions`,
      request: requestBody,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    await Promise.resolve(request.onRequestStart?.({ config, requestBody, requestId }));
    const response = await fetchChatCompletion(app, config, requestBody, { signal: request.signal, sessionId: request.opencodeSessionId || request.queueScopeId || request.queue_scope_id });
    await ensureTextAiResponseOk(response, 'AI 请求失败');
    const result = await request.consumeResponse(response, {
      config,
      requestBody,
      requestId,
    });
    responseData = result?.responseData ?? null;
    recordTextTokenStats(config, result?.usage);
    trackAiRequest(app, config, { ai_request_type: 'text', usage: result?.usage });
    analyticsTracked = true;
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat',
      request_mode: requestMode,
      url: `${trimBaseUrl(config.base_url)}/chat/completions`,
      request: requestBody,
      response: responseData,
      content: result?.content || '',
      created_at: new Date().toISOString(),
    });
    return result;
  } catch (error) {
    if (!analyticsTracked) {
      recordTextTokenStats(config, null);
      trackAiRequest(app, config, { ai_request_type: 'text' });
    }
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat-error',
      request_mode: requestMode,
      url: `${trimBaseUrl(config.base_url)}/chat/completions`,
      request: requestBody,
      response: getAiErrorLogResponse(error, responseData),
      error: getAiErrorLogError(error, error?.message || 'AI 请求失败'),
      created_at: new Date().toISOString(),
    });
    throw error;
  } finally {
    notifyAiResponse();
  }
}

// OpenRouter image generation uses chat/completions with modalities (OpenRouter has no /images/generations endpoint).
function createOpenRouterImageRequestBody(prompt, modelName) {
  return {
    model: String(modelName || '').trim(),
    messages: [{ role: 'user', content: prompt }],
    modalities: ['image', 'text'],
  };
}

function createOpenRouterImageHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-Title': 'Savia Licitaciones',
  };
}

async function requestOpenRouterImageData(baseUrl, apiKey, requestBody, fallbackMessage, options = {}) {
  return withAiResponseActivity(async () => {
    const response = await fetchWithRedirect(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: createOpenRouterImageHeaders(apiKey),
      body: JSON.stringify(requestBody),
      signal: options.signal,
    });
    await ensureOk(response, fallbackMessage, { source: 'openrouter-image-model' });
    try {
      return await response.json();
    } catch (error) {
      throw markAiRequestError(error, { retryable: true });
    }
  });
}

function extractOpenRouterImageUrl(responseData) {
  const message = responseData?.choices?.[0]?.message || {};
  const images = Array.isArray(message.images) ? message.images : [];
  for (const item of images) {
    const url = item?.image_url?.url;
    if (typeof url === 'string' && url) return url;
  }
  return '';
}

function extractOpenRouterImageText(responseData) {
  const content = responseData?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('');
  }
  return '';
}

function parseOpenRouterDataUrlImage(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?;base64,(.+)$/s);
  if (!match) return null;
  return {
    buffer: Buffer.from(match[2], 'base64'),
    mime_type: match[1] || 'image/png',
  };
}

function safeOpenRouterImageResponse(responseData) {
  if (!responseData || typeof responseData !== 'object' || !Array.isArray(responseData.choices)) {
    return safeImageResponse(responseData);
  }
  return {
    ...responseData,
    choices: responseData.choices.map((choice) => {
      const message = choice?.message || {};
      if (!Array.isArray(message.images)) return choice;
      return { ...choice, message: { ...message, images: message.images.map(() => '[image omitted]') } };
    }),
  };
}

async function testOpenRouterImageModel(app, config) {
  const imageConfig = config.image_model || {};
  let analyticsTracked = false;

  if (!imageConfig.api_key) {
    throw new Error('请先填写 OpenRouter API Key');
  }

  if (!imageConfig.model_name) {
    throw new Error('请先填写 OpenRouter 生图模型名称');
  }

  const baseUrl = requireBaseUrl(imageConfig.base_url, 'OpenRouter Base URL 缺失，请重新选择服务商后保存配置');
  const requestId = createRequestId();
  const logTitle = 'AI生图测试-OpenRouter';
  const requestBody = createOpenRouterImageRequestBody('大字报，内容是“SaviaAI老好了”', imageConfig.model_name);
  const url = `${baseUrl}/chat/completions`;
  let responseData = null;

  try {
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image-test-pending',
      provider: 'openrouter',
      request_mode: 'normal',
      url,
      request: requestBody,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    responseData = await runWithAiRetry(() => runWithOperationTimeout(
      (signal) => requestOpenRouterImageData(
        baseUrl,
        imageConfig.api_key,
        requestBody,
        'OpenRouter 生图测试失败',
        { signal },
      ),
      AI_REQUEST_TIMEOUT_MS,
    ));
    trackAiRequest(app, config, { ai_request_type: 'image', usage: extractOpenAIUsage(responseData) });
    analyticsTracked = true;
    const imageUrl = extractOpenRouterImageUrl(responseData);
    const text = extractOpenRouterImageText(responseData);

    if (!imageUrl) {
      throw createAiResponseDataError('OpenRouter 生图测试未返回图片数据', responseData);
    }

    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image-test',
      provider: 'openrouter',
      request_mode: 'normal',
      request: requestBody,
      response: safeOpenRouterImageResponse(responseData),
      result: {
        image_data: '[base64 omitted]',
        mime_type: 'image/png',
      },
      created_at: new Date().toISOString(),
    });

    return {
      success: true,
      message: `测试成功：已返回图片${text ? `，${text}` : ''}`,
      image_data: imageUrl.startsWith('data:') ? imageUrl.slice(imageUrl.indexOf(',') + 1) : '',
      image_url: imageUrl.startsWith('data:') ? '' : imageUrl,
      mime_type: 'image/png',
    };
  } catch (error) {
    if (!analyticsTracked) {
      trackAiRequest(app, config, { ai_request_type: 'image' });
    }
    const errorMessage = error?.name === 'AbortError' ? IMAGE_MODEL_TEST_TIMEOUT_MESSAGE : error?.message || '生图模型测试失败';
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image-test-error',
      provider: 'openrouter',
      request_mode: 'normal',
      request: requestBody,
      response: getAiErrorLogResponse(error, responseData ? safeOpenRouterImageResponse(responseData) : null),
      error: getAiErrorLogError(error, errorMessage),
      created_at: new Date().toISOString(),
    });
    const wrappedError = copyRawAiErrorResponse(error, new Error(errorMessage));
    emitAiHttpErrorToWindows(wrappedError);
    throw wrappedError;
  }
}

async function generateOpenRouterImage(app, config, request) {
  const imageConfig = config.image_model || {};
  const requestId = createRequestId();
  const logTitle = resolveAiLogTitle(request, request.title ? `AI生图-${request.title}` : 'AI生图');
  const requestBody = createOpenRouterImageRequestBody(normalizeImagePrompt(request), imageConfig.model_name);
  const baseUrl = requireBaseUrl(imageConfig.base_url, 'OpenRouter Base URL 缺失，请重新选择服务商后保存配置');
  const url = `${baseUrl}/chat/completions`;
  let responseData = null;
  let analyticsTracked = false;

  try {
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image-pending',
      provider: 'openrouter',
      request_mode: 'normal',
      url,
      request: requestBody,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    responseData = await runWithAiRetry(() => runWithOperationTimeout(
      (signal) => requestOpenRouterImageData(
        baseUrl,
        imageConfig.api_key,
        requestBody,
        'OpenRouter 生图失败',
        { signal, source: 'openrouter-image-model' },
      ),
      AI_REQUEST_TIMEOUT_MS,
      request.signal,
    ));
    trackAiRequest(app, config, { ai_request_type: 'image', usage: extractOpenAIUsage(responseData) });
    analyticsTracked = true;
    const imageUrl = extractOpenRouterImageUrl(responseData);

    if (!imageUrl) {
      throw createAiResponseDataError('OpenRouter 生图未返回图片数据', responseData);
    }

    let image = parseOpenRouterDataUrlImage(imageUrl);
    if (!image) {
      image = await runWithOperationTimeout(
        (signal) => downloadImage(imageUrl, { signal }),
        AI_REQUEST_TIMEOUT_MS,
        request.signal,
      );
    }

    if (!image) {
      throw createAiResponseDataError('OpenRouter 生图未返回图片数据', responseData);
    }

    const saved = saveGeneratedImage(app, image);
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image',
      provider: 'openrouter',
      request_mode: 'normal',
      request: requestBody,
      response: safeOpenRouterImageResponse(responseData),
      result: saved,
      created_at: new Date().toISOString(),
    });
    return { success: true, title: request.title || '', ...saved };
  } catch (error) {
    if (!analyticsTracked) {
      trackAiRequest(app, config, { ai_request_type: 'image' });
      analyticsTracked = true;
    }
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image-error',
      provider: 'openrouter',
      request_mode: 'normal',
      request: requestBody,
      response: getAiErrorLogResponse(error, responseData ? safeOpenRouterImageResponse(responseData) : null),
      error: getAiErrorLogError(error, error.message),
      created_at: new Date().toISOString(),
    });
    const finalError = markAiRequestError(error, { retryable: false });
    emitAiHttpErrorToWindows(finalError);
    throw finalError;
  }
}

// Historical prompt tuple layouts differ by version ([prio, workflow, ...] or [prio, id, workflow, ...]);
// the first element whose values are node objects is the workflow.
// Read timestamps from execution messages (execution_start/execution_success) for sorting.
// Select the latest successful text-to-image workflow from /history.
// When the server has a checkpoint model, assemble a minimal text-to-image workflow using the standard structure.
// Workflow template priority: manually pasted JSON > latest successful server workflow > automatic assembly from installed server models.
async function generateImageWithConfig(app, config, request) {
  const availability = getImageModelAvailability(config);
  if (!availability.available) {
    throw new Error(availability.message);
  }

  if (config.image_model?.provider === 'openrouter') {
    return generateOpenRouterImage(app, config, request);
  }

  throw new Error('当前生图服务商暂不支持正文配图');
}

function createAiService({ app, configStore }) {
  const textRequestQueue = createAiRequestQueue({
    defaultLimit: 10,
    getLimit() {
      return configStore.load()?.concurrency_limit;
    },
  });
  const imageRequestQueue = createAiRequestQueue({
    defaultLimit: 2,
    getLimit() {
      return configStore.load()?.image_model?.concurrency_limit;
    },
  });

  function getQueueScopeId(request) {
    return String(request?.queueScopeId || request?.queue_scope_id || '').trim();
  }

  function withQueueScope(request, queueScopeId, signal) {
    const normalizedScopeId = String(queueScopeId || '').trim();
    if (!normalizedScopeId || !request || typeof request !== 'object') {
      return request;
    }

    return {
      ...request,
      queueScopeId: getQueueScopeId(request) || normalizedScopeId,
      ...(signal && !request.signal ? { signal } : {}),
    };
  }

  function enqueueTextRequest(request, runner, options = {}) {
    return textRequestQueue.enqueue(bindAiRequestActivity(runner), {
      scopeId: getQueueScopeId(request),
      signal: options.signal,
      maxAttempts: options.maxAttempts,
    });
  }

  function enqueueImageRequest(request, runner) {
    return imageRequestQueue.enqueue(bindAiRequestActivity(runner), { scopeId: getQueueScopeId(request), signal: request?.signal });
  }

  const service = {
    getConfig() {
      return configStore.load();
    },

    async chat(request) {
      return enqueueTextRequest(request, () => {
        const config = configStore.load();
        return chatWithConfig(app, config, request);
      }, { signal: request?.signal });
    },

    async runAgentChatCompletion(request) {
      return enqueueTextRequest(request, () => {
        const config = configStore.load();
        // Recheck at dispatch: the user may have changed the provider while this chat was queued.
        if (String(request?.queueScopeId || '').startsWith('tender-chat-') && config.text_model_provider !== 'opencode-go' && !(config.text_model_provider === 'openai-api' && config.web_runner_openai_chat === true) && !(config.text_model_provider === 'groq-api' && config.web_runner_groq_proxy === true && config.base_url === 'https://api.groq.com/openai/v1')) {
          throw new Error('El chat de documentos requiere OpenCode Go.');
        }
        return runAgentChatCompletionWithConfig(app, config, request);
      }, {
        signal: request?.signal,
        // Pi sessions retain native turn-level retries; this queue only handles shared scheduling and concurrency.
        maxAttempts: 1,
      });
    },

    async requestJson(request) {
      return enqueueTextRequest(request, () => {
        const config = configStore.load();
        return collectJsonResponseWithConfig(app, config, request);
      }, { signal: request?.signal });
    },

    async collectJsonResponse(request) {
      return enqueueTextRequest(request, () => {
        const config = configStore.load();
        return collectJsonResponseWithConfig(app, config, request);
      }, { signal: request?.signal });
    },

    async parseJsonResponseContent(request, content) {
      return enqueueTextRequest(request, () => {
        const config = configStore.load();
        return parseOrRepairJsonResponseWithConfig(app, config, request, content);
      }, { signal: request?.signal });
    },

    pauseQueueScope(scopeId) {
      return textRequestQueue.pauseScope(scopeId) + imageRequestQueue.pauseScope(scopeId);
    },

    resumeQueueScope(scopeId) {
      textRequestQueue.resumeScope(scopeId);
      imageRequestQueue.resumeScope(scopeId);
    },

    getTextQueueStatus() {
      return textRequestQueue.getStatus();
    },

    getImageQueueStatus() {
      return imageRequestQueue.getStatus();
    },

    getTextTokenStats() {
      return getTextTokenStatsSnapshot();
    },

    resetTextTokenStats() {
      return resetTextTokenStats();
    },

    onTextTokenStatsChanged(listener) {
      return onTextTokenStatsChanged(listener);
    },

    withQueueScope(scopeId, signal) {
      return {
        ...service,
        chat(request) {
          return service.chat(withQueueScope(request, scopeId, signal));
        },
        requestJson(request) {
          return service.requestJson(withQueueScope(request, scopeId, signal));
        },
        collectJsonResponse(request) {
          return service.collectJsonResponse(withQueueScope(request, scopeId, signal));
        },
        parseJsonResponseContent(request, content) {
          return service.parseJsonResponseContent(withQueueScope(request, scopeId, signal), content);
        },
        runAgentChatCompletion(request) {
          return service.runAgentChatCompletion(withQueueScope(request, scopeId, signal));
        },
        generateImage(request) {
          return service.generateImage(withQueueScope(request, scopeId, signal));
        },
      };
    },

    async testImageModel(config) {
      const currentConfig = configStore.load();
      const trackedConfig = {
        ...config,
        analytics_client_id: config.analytics_client_id || currentConfig.analytics_client_id,
        analytics_created_at: config.analytics_created_at || currentConfig.analytics_created_at,
      };

      if (trackedConfig.image_model?.provider === 'openrouter') {
        return testOpenRouterImageModel(app, trackedConfig);
      }

      throw new Error(pickLocaleMessage(detectLocaleFromConfig(configStore), '当前服务商暂不支持测试', 'El proveedor actual no admite pruebas', 'Current provider does not support testing'));
    },

    getImageModelAvailability() {
      return getImageModelAvailability(configStore.load());
    },

    isDeveloperMode() {
      return Boolean(configStore.load()?.developer_mode);
    },

    createTechnicalPlanDeveloperLogger(request) {
      const config = configStore.load();
      return createModuleDeveloperLogger(app, config, 'technical-plan', request);
    },

    createDeveloperLogger(moduleName, request) {
      const config = configStore.load();
      return createModuleDeveloperLogger(app, config, moduleName, request);
    },

    async generateImage(request) {
      return enqueueImageRequest(request, () => {
        const config = configStore.load();
        return generateImageWithConfig(app, config, request);
      });
    },

    async listModels(configOverride) {
      const config = configOverride || configStore.load();

      if (config.text_model_provider === 'opencode-go') {
        return { success:true, message:'Modelos Muse conocidos; la disponibilidad depende de tu cuenta y región.', models:['muse-spark-1.3-contributor','muse-spark-1.2-contributor'] };
      }

      if (!config.api_key) {
        return { success: false, message: '请先填写文本模型 API Key', models: [] };
      }

      if (!trimBaseUrl(config.base_url)) {
        return { success: false, message: '请先填写文本模型 Base URL', models: [] };
      }

      let data = null;
      try {
        data = await runWithAiRetry(async () => {
          let response = null;
          try {
            response = await fetchWithRedirect(`${trimBaseUrl(config.base_url)}/models`, {
              method: 'GET',
              headers: createHeaders(config.api_key, config.text_model_provider),
            });
          } catch (error) {
            throw markAiRequestError(error, { retryable: true });
          }

          await ensureOk(response, '获取模型列表失败');
          try {
            return await response.json();
          } catch (error) {
            throw markAiRequestError(error, { retryable: true });
          }
        });
      } catch (error) {
        emitAiHttpErrorToWindows(error);
        throw error;
      }

      const models = Array.isArray(data.data) ? data.data.map((item) => item.id).filter(Boolean) : [];
      return {
        success: true,
        message: '模型列表已更新',
        models,
      };
    },

    async getModelInfo(modelName) {
      const normalizedModelName = String(modelName || '').trim();
      if (!normalizedModelName) {
        return { success: false, message: '请先填写文本模型名称', modelName: '', model: null, syncedAt: '' };
      }

      // Model-info service is disconnected with the other Cloudflare services; without remote caching,
      // advanced model parameters are entered manually.
      return {
        success: false,
        message: `模型信息服务已断开（${normalizedModelName}），请手动录入`,
        modelName: normalizedModelName,
        model: null,
        syncedAt: '',
      };
    },
  };

  return service;
}

module.exports = {
  createAiService,
};
