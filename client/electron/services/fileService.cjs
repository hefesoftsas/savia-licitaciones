const brand = require('../../brand.json');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { dialog } = process.env.SAVIA_HEADLESS_RUNNER === '1' ? {} : require('electron');
const mimeTypes = require('mime-types');
const { formatDocumentParseError, isLibreOfficeMissingError, normalizeDocumentParseError } = require('./documentParseErrors.cjs');
const { compactLogError, createDeveloperLogger, textMetrics } = require('../utils/developerLog.cjs');
const { getImportedImagesDir } = require('../utils/paths.cjs');
const { pickLocaleMessage, detectLocaleFromConfig } = require('../utils/localeMessages.cjs');
const { nativeUiText } = require('../utils/nativeUiText.cjs');

const parserLabels = {
  local: '本地解析',
  'mineru-accurate-api': 'MinerU 精准解析 API',
  'mineru-agent-api': 'MinerU-Agent 轻量解析 API',
};

const localSupportedExtensions = new Set(['.txt', '.md', '.markdown', '.docx', '.pdf', '.doc', '.wps', '.xls', '.xlsx']);
const mineruAgentSupportedExtensions = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.jp2', '.webp', '.gif', '.bmp',
]);
const mineruAccurateSupportedExtensions = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.jp2', '.webp', '.gif', '.bmp', '.html',
]);
const duplicateCheckSupportedExtensions = new Set(['.doc', '.docx', '.wps', '.pdf', '.md', '.markdown', '.xls', '.xlsx']);
const remoteImageTimeoutMs = 10000;
const markdownImagePattern = /!\[(?<alt>[^\]]*)\]\((?<target><[^>]+>|[^)\s]+)(?<title>\s+"[^"]*")?\)/gi;
const htmlImageSrcPattern = /(<img\b[^>]*?\bsrc=["'])(?<src>[^"']+)(["'][^>]*>)/gi;

/** Save original tender Word files in the workspace; convert .doc/.wps to .docx first. */
async function persistTenderSourceDocx(sourcePath, destPath) {
  const input = String(sourcePath || '').trim();
  const output = String(destPath || '').trim();
  if (!input || !output) return false;
  const ext = path.extname(input).toLowerCase();
  await fs.mkdir(path.dirname(output), { recursive: true });
  if (ext === '.docx') {
    await fs.copyFile(input, output);
    return true;
  }
  if (ext === '.doc' || ext === '.wps') {
    const { withLegacyWordDocxFile } = await import('./doc2markdown/convert.mjs');
    await withLegacyWordDocxFile(input, async (docxPath) => {
      await fs.copyFile(docxPath, output);
    });
    return true;
  }
  return false;
}

function getSupportedExtensions(provider) {
  if (provider === 'mineru-agent-api') {
    return mineruAgentSupportedExtensions;
  }
  if (provider === 'mineru-accurate-api') {
    return mineruAccurateSupportedExtensions;
  }
  return localSupportedExtensions;
}

function getSelectableExtensions(provider) {
  if (provider === 'local') {
    return localSupportedExtensions;
  }
  return new Set([...getSupportedExtensions(provider), ...localSupportedExtensions]);
}

function resolveFileParser(config, filePath) {
  const requestedProvider = config.components?.file_parser?.provider || 'local';
  const ext = path.extname(filePath).toLowerCase();
  const requestedSupported = getSupportedExtensions(requestedProvider).has(ext);
  if (requestedSupported) {
    return { provider: requestedProvider, requestedProvider, ext, supported: true, fallbackToLocal: false };
  }

  if (requestedProvider !== 'local' && localSupportedExtensions.has(ext)) {
    return { provider: 'local', requestedProvider, ext, supported: true, fallbackToLocal: true };
  }

  return { provider: requestedProvider, requestedProvider, ext, supported: false, fallbackToLocal: false };
}

async function summarizeFileForLog(filePath) {
  const summary = {
    file_name: path.basename(filePath || ''),
    extension: path.extname(filePath || '').toLowerCase(),
  };
  try {
    const stats = await fs.stat(filePath);
    summary.size = stats.size;
    summary.modified_at = stats.mtime.toISOString();
  } catch {
    summary.size = null;
    summary.modified_at = '';
  }
  return summary;
}

function summarizeParserForLog(parser, options = {}) {
  return {
    provider: parser.provider,
    requested_provider: parser.requestedProvider,
    extension: parser.ext,
    supported: parser.supported,
    fallback_to_local: parser.fallbackToLocal,
    preserve_images: options.preserveImages === true,
    asset_scope: String(options.assetScope || 'documents'),
  };
}

async function parseLocalDocument(filePath, options = {}) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.txt') {
    return fs.readFile(filePath, 'utf-8');
  }

  const { convertPathToMarkdown } = await import('./doc2markdown/convert.mjs');
  return convertPathToMarkdown(filePath, {
    includeImages: options.preserveImages,
    imageResolver: options.imageResolver,
  });
}

function formatImportError(error, filePath) {
  const normalized = normalizeDocumentParseError(error, filePath);
  if (isLibreOfficeMissingError(normalized)) {
    return normalized.message;
  }

  const rawMessage = formatDocumentParseError(normalized, filePath);
  if (/Can't find end of central directory|is this a zip file/i.test(rawMessage)) {
    return '文件解析失败：该文件不是有效的 DOCX 文档，请用 Word/WPS 另存为标准 DOCX 后重试';
  }
  return `文件解析失败：${rawMessage || '未知错误'}`;
}

async function parseWithMineruAgent(_filePath, _options = {}) {
  // MinerU online parsing is disconnected per AGENTS.md; return empty offline result.
  return '';
}

async function parseWithMineruAccurate(_filePath, _token, _options = {}) {
  // MinerU online parsing is disconnected per AGENTS.md; return empty offline result.
  return '';
}

async function createLocalFileSelection(filePath) {
  const stats = await fs.stat(filePath);
  const extension = path.extname(filePath).toLowerCase();
  return {
    id: crypto.createHash('sha1').update(filePath).digest('hex'),
    file_name: path.basename(filePath),
    file_path: filePath,
    extension,
    size: stats.size,
    modified_at: stats.mtime.toISOString(),
  };
}

function stripMarkdownImages(text) {
  return String(text || '')
    .replace(markdownImagePattern, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/\n{3,}/g, '\n\n');
}

function createAssetContext(app, scope = 'documents') {
  if (!app?.getPath) return null;
  const safeScope = String(scope || 'documents').replace(/[^A-Za-z0-9._-]+/g, '_') || 'documents';
  const batchId = `${safeScope}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return {
    baseDir: path.join(getImportedImagesDir(app), batchId),
    urlPrefix: `savia-asset://imported-images/${encodeURIComponent(batchId)}`,
    index: 0,
  };
}

async function deleteImportedImageAssets(assets) {
  if (!assets?.baseDir) return;
  await fs.rm(assets.baseDir, { recursive: true, force: true });
}

// Preserve the source-declared image type in imported extensions so Word export can embed original bytes when headers are unrecognized.
function imageExtensionFromMime(mime) {
  const normalized = String(mime || '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
  if (normalized.includes('png')) return '.png';
  if (normalized.includes('gif')) return '.gif';
  if (normalized.includes('bmp')) return '.bmp';
  if (normalized.includes('webp')) return '.webp';
  // Word declares metafiles as image/x-emf and image/x-wmf, whose extensions are absent from the standard type library.
  if (normalized === 'image/x-emf') return '.emf';
  if (normalized === 'image/x-wmf') return '.wmf';
  const extension = normalized.startsWith('image/') && mimeTypes.extension(normalized);
  return extension ? `.${extension}` : '';
}

function imageExtensionFromPath(value) {
  const ext = path.extname(String(value || '').split(/[?#]/)[0]).toLowerCase();
  if (ext === '.jpeg') return '.jpg';
  return String(mimeTypes.lookup(ext) || '').startsWith('image/') ? ext : '';
}

async function saveImportedImage(assets, buffer, sourceName, mime) {
  if (!assets || !buffer?.length) return null;
  const ext = imageExtensionFromMime(mime) || imageExtensionFromPath(sourceName) || '.png';
  assets.index += 1;
  const fileName = `image-${String(assets.index).padStart(4, '0')}${ext}`;
  await fs.mkdir(assets.baseDir, { recursive: true });
  await fs.writeFile(path.join(assets.baseDir, fileName), buffer);
  return `${assets.urlPrefix}/${encodeURIComponent(fileName)}`;
}

function createImageResolver(assets) {
  if (!assets) return null;
  return ({ buffer, mime, sourceName }) => saveImportedImage(assets, Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer), sourceName, mime);
}

function cleanMarkdownImageTarget(target) {
  const value = String(target || '').trim();
  return value.startsWith('<') && value.endsWith('>') ? value.slice(1, -1) : value;
}

function parseDataUrl(value) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(String(value || ''));
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function loadRemoteImage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remoteImageTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/^image\//i.test(contentType)) return null;
    return { buffer: Buffer.from(await response.arrayBuffer()), mime: contentType };
  } finally {
    clearTimeout(timeout);
  }
}

function findZipEntryImage(zipEntries, imagePath, markdownEntryName) {
  let decodedPath = imagePath;
  try {
    decodedPath = decodeURIComponent(imagePath);
  } catch {
    decodedPath = imagePath;
  }
  const normalized = decodedPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const markdownDir = path.posix.dirname(String(markdownEntryName || '').replace(/\\/g, '/'));
  const candidates = [
    normalized,
    path.posix.normalize(path.posix.join(markdownDir === '.' ? '' : markdownDir, normalized)),
  ].map((item) => item.replace(/^\/+/, '').toLowerCase());
  const direct = zipEntries.find((entry) => candidates.includes(entry.entryName.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()));
  if (direct) return direct;
  const basename = path.posix.basename(normalized).toLowerCase();
  return zipEntries.find((entry) => path.posix.basename(entry.entryName.replace(/\\/g, '/')).toLowerCase() === basename);
}

function isPathInsideDirectory(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolveImageToAssetUrl(source, assets, context = {}) {
  const value = cleanMarkdownImageTarget(source);
  if (!value) return null;
  if (new RegExp("^(?:savia|__BRAND_SLUG__)-asset:\\/\\/".replaceAll('__BRAND_SLUG__', brand.slug), "i").test(value)) return value;

  const data = parseDataUrl(value);
  if (data) {
    return saveImportedImage(assets, data.buffer, 'data-image', data.mime);
  }

  if (/^https?:\/\//i.test(value) || context.baseUrl) {
    try {
      const url = /^https?:\/\//i.test(value) ? value : new URL(value, context.baseUrl).toString();
      const loaded = await loadRemoteImage(url);
      if (loaded) {
        return saveImportedImage(assets, loaded.buffer, url, loaded.mime);
      }
    } catch {
      return null;
    }
  }

  if (context.zipEntries) {
    const entry = findZipEntryImage(context.zipEntries, value, context.markdownEntryName);
    if (entry && !entry.isDirectory) {
      return saveImportedImage(assets, entry.getData(), entry.entryName, '');
    }
  }

  if (context.localBaseDir && !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    try {
      let decodedValue = value;
      try {
        decodedValue = decodeURIComponent(value);
      } catch {
        decodedValue = value;
      }
      if (path.isAbsolute(decodedValue)) {
        return null;
      }
      const baseDir = path.resolve(context.localBaseDir);
      const localPath = path.resolve(baseDir, decodedValue);
      if (!isPathInsideDirectory(baseDir, localPath)) {
        return null;
      }
      const buffer = await fs.readFile(localPath);
      return saveImportedImage(assets, buffer, localPath, '');
    } catch {
      return null;
    }
  }

  return null;
}

async function rewriteMarkdownImages(markdown, assets, context = {}) {
  let result = await replaceMatchesAsync(String(markdown || ''), markdownImagePattern, async (match) => {
    const nextUrl = await resolveImageToAssetUrl(match.groups?.target || '', assets, context);
    const alt = match.groups?.alt || '';
    const title = match.groups?.title || '';
    return nextUrl ? `![${alt}](${nextUrl}${title})` : '';
  });

  result = await replaceMatchesAsync(result, htmlImageSrcPattern, async (match) => {
    const nextUrl = await resolveImageToAssetUrl(match.groups?.src || '', assets, context);
    return nextUrl ? `${match[1]}${nextUrl}${match[3]}` : '';
  });
  return result;
}

async function replaceMatchesAsync(text, pattern, createReplacement) {
  const matches = [...String(text || '').matchAll(pattern)];
  if (!matches.length) return text;

  const parts = [];
  let lastIndex = 0;
  for (const match of matches) {
    const index = match.index ?? 0;
    parts.push(text.slice(lastIndex, index));
    parts.push(await createReplacement(match));
    lastIndex = index + match[0].length;
  }
  parts.push(text.slice(lastIndex));
  return parts.join('');
}

async function parseDocumentWithConfig(app, filePath, config, options = {}) {
  const startedAt = Date.now();
  const parser = resolveFileParser(config, filePath);
  const developerLogger = createDeveloperLogger({
    app,
    config,
    moduleName: 'file-parser',
    name: path.basename(filePath || 'document'),
    meta: summarizeParserForLog(parser, options),
  });
  developerLogger.write('file.parse.started', {
    file: await summarizeFileForLog(filePath),
    parser: summarizeParserForLog(parser, options),
  });
  if (!parser.supported) {
    const error = new Error(`当前${parserLabels[parser.requestedProvider] || '解析方式'}不支持该文件格式`);
    developerLogger.write('file.parse.error', {
      duration_ms: Date.now() - startedAt,
      parser: summarizeParserForLog(parser, options),
      error: compactLogError(error),
    });
    throw error;
  }
  const provider = parser.provider;
  const preserveImages = options.preserveImages === true;
  const assets = preserveImages ? createAssetContext(app, options.assetScope || 'documents') : null;
  const parseOptions = { preserveImages, assets, imageResolver: createImageResolver(assets) };
  let markdown = '';
  try {
    if (provider === 'mineru-agent-api') {
      markdown = await parseWithMineruAgent(filePath, parseOptions);
    } else if (provider === 'mineru-accurate-api') {
      markdown = await parseWithMineruAccurate(filePath, config.components?.file_parser?.mineru_token || '', parseOptions);
    } else {
      markdown = await parseLocalDocument(filePath, parseOptions);
      markdown = preserveImages ? await rewriteMarkdownImages(markdown, assets, { localBaseDir: path.dirname(filePath) }) : stripMarkdownImages(markdown);
    }
  } catch (error) {
    await deleteImportedImageAssets(assets).catch(() => undefined);
    developerLogger.write('file.parse.error', {
      duration_ms: Date.now() - startedAt,
      parser: summarizeParserForLog(parser, options),
      asset_count: assets?.index || 0,
      error: compactLogError(error),
    });
    throw normalizeDocumentParseError(error, filePath);
  }
  const result = preserveImages ? markdown : stripMarkdownImages(markdown);
  developerLogger.write('file.parse.completed', {
    duration_ms: Date.now() - startedAt,
    parser: summarizeParserForLog(parser, options),
    asset_count: assets?.index || 0,
    markdown_metrics: textMetrics(result),
  });
  return result;
}

function createFileService({ app, configStore } = {}) {
  const ui = (es, en, zh) => nativeUiText(configStore, { es, en, zh });
  const supportedName = () => ui('Documentos compatibles', 'Supported documents', '支持的文档');
  const allFilesName = () => ui('Todos los archivos', 'All files', '所有文件');
  /** Skip the system chooser when paths are supplied directly, such as drag-and-drop uploads. */
  function normalizeProvidedFilePaths(filePaths) {
    if (!Array.isArray(filePaths)) return [];
    return filePaths.map((item) => String(item || '').trim()).filter(Boolean);
  }

  async function importTechnicalPlanDocument(documentLabel = '招标文件', options = {}) {
    const label = String(documentLabel || '招标文件').trim() || '招标文件';
    const multiple = options?.multiple === true;
const config = configStore ? configStore.load() : { components: { file_parser: { provider: 'local' } } };
    const provider = config.components?.file_parser?.provider || 'local';
    const supportedExtensions = getSelectableExtensions(provider);
    let selectedPaths = normalizeProvidedFilePaths(options?.filePaths);
    if (!multiple && selectedPaths.length > 1) {
      selectedPaths = selectedPaths.slice(0, 1);
    }
    if (!selectedPaths.length) {
      const result = await dialog.showOpenDialog({
        title: label === '原方案'
          ? ui('Seleccionar propuesta original', 'Select original proposal', `选择${label}`)
          : label === '可研资料'
            ? ui('Seleccionar documentos de viabilidad', 'Select feasibility documents', `选择${label}`)
            : ui('Seleccionar pliego', 'Select tender document', `选择${label}`),
        properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: [
          { name: supportedName(), extensions: [...supportedExtensions].map((item) => item.slice(1)) },
          { name: allFilesName(), extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: '已取消选择' };
      }
      selectedPaths = result.filePaths;
    }

    const parsedDocuments = [];
    const errors = [];
    for (const filePath of selectedPaths) {
      const ext = path.extname(filePath).toLowerCase();
      const parser = resolveFileParser(config, filePath);
      if (!supportedExtensions.has(ext)) {
        errors.push(`${path.basename(filePath)}：当前${parserLabels[provider] || '解析方式'}不支持该文件格式`);
        continue;
      }

      let fileContent = '';
      try {
        const assetHash = crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 12);
        fileContent = (await parseDocumentWithConfig(app, filePath, config, {
          assetScope: `${options?.assetScopePrefix || 'technical-plan'}-${assetHash}`,
          preserveImages: options.preserveImages === true,
        })).trim();
      } catch (error) {
        errors.push(`${path.basename(filePath)}：${formatImportError(error, filePath)}`);
        continue;
      }

      if (!fileContent) {
        errors.push(`${path.basename(filePath)}：未提取到有效 Markdown 内容，请检查文件内容`);
        continue;
      }

      parsedDocuments.push({
        file_content: fileContent,
        file_name: path.basename(filePath),
        source_path: filePath,
        parser_provider: parser.provider,
        parser_label: parserLabels[parser.provider] || '本地解析',
        fallback_to_local: Boolean(parser.fallbackToLocal),
      });
    }

    if (!parsedDocuments.length) {
      return { success: false, message: errors[0] || '未提取到有效 Markdown 内容，请检查文件内容', documents: [] };
    }

    const fallbackToLocal = parsedDocuments.some((item) => item.fallback_to_local);
    const messageParts = [multiple ? `文件解析完成，共 ${parsedDocuments.length} 份` : '文件解析完成'];
    if (fallbackToLocal) messageParts.push('当前格式已自动使用本地解析');
    if (errors.length) messageParts.push(`失败 ${errors.length} 份`);
    const first = parsedDocuments[0];

    return {
      success: true,
      message: messageParts.join('，'),
      file_content: first.file_content,
      file_name: first.file_name,
      parser_provider: first.parser_provider,
      parser_label: first.parser_label,
      documents: parsedDocuments,
      errors,
    };
  }

  return {
    async importDocument(options = {}) {
      return importTechnicalPlanDocument('招标文件', options);
    },

    persistTenderSourceDocx,

    importTechnicalPlanDocument,

    async importRejectionCheckDocument(role = 'tender', filePaths, options = {}) {
      const documentRole = role === 'bid' ? 'bid' : 'tender';
      const documentLabel = documentRole === 'bid' ? '投标文件' : '招标文件';
      const config = configStore ? configStore.load() : { components: { file_parser: { provider: 'local' } } };
      const provider = config.components?.file_parser?.provider || 'local';
      const supportedExtensions = getSelectableExtensions(provider);
      const multiple = documentRole === 'bid' || documentRole === 'tender';
      let selectedPaths = normalizeProvidedFilePaths(filePaths);
      if (!selectedPaths.length) {
        const result = await dialog.showOpenDialog({
          title: documentRole === 'bid' ? ui('Seleccionar ofertas', 'Select bid documents', `选择${documentLabel}`) : ui('Seleccionar pliegos', 'Select tender documents', `选择${documentLabel}`),
          properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
          filters: [
            { name: supportedName(), extensions: [...supportedExtensions].map((item) => item.slice(1)) },
            { name: allFilesName(), extensions: ['*'] },
          ],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, message: '已取消选择' };
        }
        selectedPaths = result.filePaths;
      }

      const parsedDocuments = [];
      const errors = [];
      for (const filePath of selectedPaths) {
        const ext = path.extname(filePath).toLowerCase();
        const parser = resolveFileParser(config, filePath);
        if (!supportedExtensions.has(ext)) {
          errors.push(`${path.basename(filePath)}：当前${parserLabels[provider] || '解析方式'}不支持该文件格式`);
          continue;
        }

        let fileContent = '';
        try {
          const assetHash = crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 12);
          fileContent = (await parseDocumentWithConfig(app, filePath, config, { assetScope: `rejection-check-${documentRole}-${assetHash}`, preserveImages: false })).trim();
        } catch (error) {
          errors.push(`${path.basename(filePath)}：${formatImportError(error, filePath)}`);
          continue;
        }

        if (!fileContent) {
          errors.push(`${path.basename(filePath)}：未提取到有效 Markdown 内容，请检查文件内容`);
          continue;
        }

        parsedDocuments.push({
          file_content: fileContent,
          file_name: path.basename(filePath),
          ...(options.includeSourcePath ? { source_path: filePath } : {}),
          parser_provider: parser.provider,
          parser_label: parserLabels[parser.provider] || '本地解析',
          fallback_to_local: Boolean(parser.fallbackToLocal),
        });
      }

      if (!parsedDocuments.length) {
        return {
          success: false,
          message: errors[0] || '未提取到有效 Markdown 内容，请检查文件内容',
          errors,
          documents: [],
        };
      }

      const fallbackToLocal = parsedDocuments.some((item) => item.fallback_to_local);
      const messageParts = [multiple ? `文件解析完成，共 ${parsedDocuments.length} 份` : '文件解析完成'];
      if (fallbackToLocal) messageParts.push('当前格式已自动使用本地解析');
      if (errors.length) messageParts.push(`失败 ${errors.length} 份`);
      return {
        success: true,
        message: messageParts.join('，'),
        file_content: parsedDocuments[0].file_content,
        file_name: parsedDocuments[0].file_name,
        parser_provider: parsedDocuments[0].parser_provider,
        parser_label: parsedDocuments[0].parser_label,
        documents: parsedDocuments,
        errors,
      };
    },

    async selectDuplicateCheckFiles(options = {}) {
      const multiple = options?.multiple !== false;
      let selectedPaths = normalizeProvidedFilePaths(options?.filePaths);
      if (!multiple && selectedPaths.length > 1) {
        selectedPaths = selectedPaths.slice(0, 1);
      }
      if (!selectedPaths.length) {
        const result = await dialog.showOpenDialog({
          title: multiple ? ui('Seleccionar ofertas', 'Select bid documents', '选择投标文件') : ui('Seleccionar pliego', 'Select tender document', '选择招标文件'),
          properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
          filters: [
            { name: supportedName(), extensions: [...duplicateCheckSupportedExtensions].map((item) => item.slice(1)) },
            { name: allFilesName(), extensions: ['*'] },
          ],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, message: '已取消选择', files: [] };
        }
        selectedPaths = result.filePaths;
      }

      const supportedPaths = selectedPaths.filter((filePath) => duplicateCheckSupportedExtensions.has(path.extname(filePath).toLowerCase()));
      if (!supportedPaths.length) {
        return { success: false, message: '未选择支持的文件类型', files: [] };
      }

      const files = await Promise.all(supportedPaths.map(createLocalFileSelection));
      return {
        success: true,
        message: `已选择 ${files.length} 个文件`,
        files,
      };
    },

    /** Tender files for blind-bid format extraction: select only here; parse in the background task. */
    async selectBlindCheckTenderFile() {
      const config = configStore ? configStore.load() : { components: { file_parser: { provider: 'local' } } };
      const provider = config.components?.file_parser?.provider || 'local';
      const supportedExtensions = getSelectableExtensions(provider);
      const result = await dialog.showOpenDialog({
        title: ui('Seleccionar pliego', 'Select tender document', '选择招标文件'),
        properties: ['openFile'],
        filters: [
          { name: supportedName(), extensions: [...supportedExtensions].map((item) => item.slice(1)) },
          { name: allFilesName(), extensions: ['*'] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: '已取消选择', files: [] };
      }
      if (!supportedExtensions.has(path.extname(result.filePaths[0]).toLowerCase())) {
        return { success: false, message: `当前${parserLabels[provider] || '解析方式'}不支持该文件格式`, files: [] };
      }
      return { success: true, message: '已选择 1 个文件', files: [await createLocalFileSelection(result.filePaths[0])] };
    },

    /** Convert tender files to Markdown using current parser settings without preserving images. */
    async parseBlindCheckTender(filePath) {
      const config = configStore ? configStore.load() : { components: { file_parser: { provider: 'local' } } };
      const parser = resolveFileParser(config, filePath);
      const assetHash = crypto.createHash('sha1').update(String(filePath)).digest('hex').slice(0, 12);
      let content = '';
      try {
        content = (await parseDocumentWithConfig(app, filePath, config, { assetScope: `blind-check-tender-${assetHash}`, preserveImages: false })).trim();
      } catch (error) {
        throw new Error(`${path.basename(filePath)}：${formatImportError(error, filePath)}`);
      }
      if (!content) throw new Error(pickLocaleMessage(detectLocaleFromConfig(configStore), `${path.basename(filePath)}：未提取到有效文字，请检查文件内容`, `${path.basename(filePath)}: no se extrajo texto válido; revise el contenido`, `${path.basename(filePath)}: no valid text extracted; check the file content`));
      return { fileName: path.basename(filePath), content, parserLabel: parserLabels[parser.provider] || '本地解析' };
    },

    /** Blind-bid compliance accepts .docx only: .doc/.wps conversion changes formatting and makes inspection inaccurate. */
    async selectBlindCheckFile(options = {}) {
      let selectedPaths = normalizeProvidedFilePaths(options?.filePaths).slice(0, 1);
      if (!selectedPaths.length) {
        const result = await dialog.showOpenDialog({
          title: ui('Seleccionar la oferta que deseas revisar', 'Select the bid document to review', '选择需要检查的投标文件'),
          properties: ['openFile'],
          filters: [{ name: ui('Documento Word', 'Word document', 'Word 文档'), extensions: ['docx'] }],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, message: '已取消选择', files: [] };
        }
        selectedPaths = result.filePaths.slice(0, 1);
      }
      if (path.extname(selectedPaths[0]).toLowerCase() !== '.docx') {
        return { success: false, message: '暗标合规检查仅支持 .docx，请先在 Word / WPS 中另存为 .docx', files: [] };
      }
      return { success: true, message: '已选择 1 个文件', files: [await createLocalFileSelection(selectedPaths[0])] };
    },
  };
}

module.exports = {
  createFileService,
  parseDocumentWithConfig,
  resolveFileParser,
};
