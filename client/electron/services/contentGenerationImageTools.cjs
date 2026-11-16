const { normalizeSaviaMarkup } = require('../utils/saviaMarkup.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { load } = require('cheerio');
const { applyRangeEdits } = require('../utils/textEdit.cjs');
const { extractAiSource } = require('../utils/aiSourceExtraction.cjs');
const { AI_IMAGE_STYLES } = require('./aiImageStyles.cjs');
const { TASK_DIR, LIST_DIR, TASK_FILE_WRITING, taskFilePath, readTaskFile, writeListFile, compactResults } = require('./contentGenerationTaskFiles.cjs');
const { createAiBatchGuard, isBatchCancelled } = require('../utils/aiBatchGuard.cjs');
const { compressGeneratedImage } = require('../utils/imageCompression.cjs');
const { ORIGINAL_GENERATION, allowedImageGenerations, imageKindList } = require('./contentImageKinds.cjs');

const AI_IMAGE_STYLE_OPTIONS = Object.entries(AI_IMAGE_STYLES).map(([key, { label, usage }]) => `${key}=${label}（${usage}）`).join('；');

// Agent source paths and content image references must be relative paths within the current workspace.
function resolveImageWorkspaceFile(workspaceDir, file) {
  if (!file || file.includes('\\') || path.isAbsolute(file) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(file) || file.split('/').includes('..')) {
    throw new Error('图片或源码路径必须是当前工作区内使用正斜杠的相对路径');
  }
  return path.join(workspaceDir, file);
}

// Check actual image references on content completion; ungenerated placeholders cannot be submitted as final results.
function validateContentImageReferences(workspaceDir, html) {
  const $ = require('cheerio').load(normalizeSaviaMarkup(html), null, false);
  $('img').each((_index, element) => {
    const reference = $(element).attr('data-sv-asset-ref');
    if (!reference) throw new Error(`图片尚未生成或未填写 data-sv-asset-ref：${$(element).attr('alt') || '未命名图片'}`);
    const file = resolveImageWorkspaceFile(workspaceDir, reference);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`正文引用的图片文件不存在：${reference}`);
  });
}

// Read latest content while preserving source positions; do not reserialize HTML and alter content or image-group layout.
// Reuse original images only (original marker, original-image directory reference, or section mapping, including legacy aiImage markers);
// generation methods restrict only pending images; existing valid images remain readable and reusable even if their method was disabled, such as unavailable AI generation.
function readSectionImages(workspaceDir, section, generations) {
  const file = resolveImageWorkspaceFile(workspaceDir, section.file);
  const html = normalizeSaviaMarkup(fs.readFileSync(file, 'utf8'));
  const $ = load(html, { sourceCodeLocationInfo: true }, false);
  const ids = new Set();
  const images = $('figure').toArray().map(figure => {
    const node = $(figure);
    const id = node.attr('id');
    if (!id?.trim() || ids.has(id)) throw new Error(`小节 ${section.id} 的 figure id 为空或重复：${id || '空'}`);
    ids.add(id);
    const image = node.find('img');
    const prompt = node.find('template[data-sv-role="prompt"]');
    const generation = node.attr('data-sv-generation');
    const frameSize = node.attr('data-sv-size');
    if (node.find('figure').length || image.length !== 1 || prompt.length !== 1 || !prompt.text().trim()) {
      throw new Error(`图片 ${id} 必须有一个 img 和一个非空提示词，不能嵌套 figure`);
    }
    if (!['square', 'wide', 'tall', 'panorama'].includes(frameSize)) throw new Error(`图片 ${id} 的画框比例无效`);
    const reference = image.attr('data-sv-asset-ref') || '';
    const reusedOriginal = generation === ORIGINAL_GENERATION || reference.startsWith('原图/')
      || Boolean(section.restored_content?.images?.some(item => item.asset_ref === reference));
    const exists = reference ? fs.existsSync(resolveImageWorkspaceFile(workspaceDir, reference))
      && fs.statSync(resolveImageWorkspaceFile(workspaceDir, reference)).isFile() : false;
    if (!reusedOriginal && !exists && !generations.has(generation)) throw new Error(`图片 ${id} 的生成方式无效，请按配图类型对照表填写`);
    const table = node.closest('table');
    const layout = table.length ? table.attr('data-sv-preset') || '' : 'single';
    return {
      image_id: `${encodeURIComponent(section.id)}/${encodeURIComponent(id)}`,
      section_id: section.id, file: section.file, figure_id: id,
      generation, frame_size: frameSize, prompt: prompt.text().trim(),
      alt: image.attr('alt') || '', caption: node.find('figcaption').text().trim(),
      asset_ref: reference, asset_exists: exists,
      reused_original: reusedOriginal,
      fit: node.attr('data-sv-fit') || '',
      layout, table: table[0], image_text_left: layout === 'imageText' && node.closest('td').prevAll('td').length === 0,
      location: image[0].sourceCodeLocation,
    };
  });
  if ($('img').length !== images.length) throw new Error(`小节 ${section.id} 存在 figure 之外的图片，请先修复正文结构`);
  return { file, html, images };
}

// Replace or insert image-reference attributes only, using parser positions and preserving every other source character.
function imageReferenceEdit(html, image, assetRef) {
  const location = image.location;
  if (!location?.startTag) throw new Error(`无法定位图片原始标签：${image.image_id}`);
  const attribute = location.attrs?.['data-sv-asset-ref'];
  const value = assetRef.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const text = `data-sv-asset-ref="${value}"`;
  if (attribute) return { start: attribute.startOffset, end: attribute.endOffset, newText: text };
  const tag = html.slice(location.startTag.startOffset, location.startTag.endOffset);
  const closing = tag.search(/\s*\/?>$/);
  if (closing < 0) throw new Error(`无法定位图片标签结尾：${image.image_id}`);
  const offset = location.startTag.startOffset + closing;
  return { start: offset, end: offset, newText: ` ${text}` };
}

// Concurrent source models handle only the current image; layout rules come with each request, independent of primary-session context.
function buildImageSourcePrompt(kind, frameSize) {
  const common = 'Generate the source code for one illustration in a tender document. Return source code only, without Markdown fences or explanations. Use only the supplied content and data; do not invent facts, numbers, or commitments. You have no search, file-writing, or rendering tools and are not responsible for other illustrations, document structure, or inserting images.';
  if (kind === 'mermaid') {
    return common + '\nGenerate valid Mermaid source: use flowchart for processes, mindmap for mind maps, and erDiagram for entity relationships. Use the language of the supplied illustration prompt for all labels. Keep nodes and connections clear and avoid overcrowding. Do not generate HTML.';
  }
  const height = { square: 1240, wide: 827, tall: 1653, panorama: 698 }[frameSize];
  if (!height) throw new Error('HTML illustrations require a valid frame_size: square, wide, tall or panorama');
  return common + `
Generate a complete standalone HTML document using HTML, CSS, and SVG. Do not use scripts, external resources, or network dependencies.
The frame is ${frameSize}, with a fixed design size of 1240×${height}px. Use body as the canvas, including the 40px padding applied on all sides; the available inner area is 1160×${height - 80}px. Output is rendered at twice the pixel size. Keep the body Flex/Grid layout; do not add another canvas wrapper or duplicate the outer margin.
Use a clear, professional palette, visual hierarchy, consistent fonts and lines; body and node text must be at least 24px. Use the language of the supplied illustration prompt for all visible text. Allocate remaining height to the main content with Flex/Grid, distributing diagrams, nodes and cards evenly without leaving a large empty area at the bottom.
Keep content within the canvas and padding. Do not fill space with meaningless text, stretched shapes or empty cards, shrink everything to fit, or hide overflow to mask clipping.`;
}

// Save images and standalone source in the current workspace; source generation uses the text queue and image conversion reuses local rendering.
// Read tasks from taskDir and write complete image manifests to listDir; single-section edits use separate subdirectories.
// On consecutive upstream failures, failTask ends the owning task while tool results retain images completed in this batch.
// Enabled generation-method names for callers setting active_tools; listing and reference updates are always available.
function imageToolNames(kinds) {
  return ['list-section-images', 'apply-section-images', ...(kinds.length ? ['generate-section-images'] : []),
    ...['html', 'mermaid'].filter(kind => kinds.includes(kind)).map(kind => `render-${kind}-image`)];
}

// imageKinds lists enabled methods: register only corresponding generation/rendering tools, and limit descriptions, statistics, and task validation accordingly.
function createContentGenerationImageTools({ aiService, signal, localImageRenderService, onActivity, htmlImageOptimization = false, imageKinds = [], sections = [], getSections = () => sections, beforeApply = () => {}, failTask = () => {}, taskDir = TASK_DIR, listDir = LIST_DIR }, { Type, workspaceDir }) {
  const generations = allowedImageGenerations(imageKinds);
  // Send progress only to business code without adding model context or tool calls; skipped existing images display as complete.
  const report = (step, label, items, extra = {}) => onActivity?.({ progress: { step, label, unit: '张', items, ...extra } });
  const imageProgress = result => ({ id: result.image_id, status: result.status === 'skipped' ? 'success' : result.status || 'rendering', kind: result.kind,
    source_ready: Boolean(result.source_file), source_file: result.source_file, asset_ref: result.asset_ref });
  // Generate separate image and source files each time so failures or regeneration do not overwrite existing artifacts.
  function saveImage(buffer, extension) {
    const assetRef = `图片/${crypto.randomUUID()}${extension}`;
    fs.mkdirSync(path.join(workspaceDir, '图片'), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, assetRef), buffer);
    return assetRef;
  }

  // Return compact text and structured details without adding image binary data to model context.
  function toolResult(result, text = result) {
    return { content: [{ type: 'text', text: JSON.stringify(text) }], details: result };
  }

  // Combine reference updates by section and save atomically; write nothing for a failed section. Share this between batch updates and per-image generation/render updates.
  function applyImageReferences(items, combinedSignal) {
    const targets = getTargets();
    const groups = new Map();
    const results = new Map();
    for (const item of items) {
      try {
        const parts = item.image_id.split('/');
        const id = decodeURIComponent(parts[0]);
        if (parts.length !== 2 || !targets.has(id)) throw new Error('图片不属于本次目标小节，请使用清单中的 image_id');
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(item);
      } catch (error) { results.set(item.image_id, { image_id: item.image_id, status: 'error', error: error.message }); }
    }
    for (const [id, group] of groups) {
      combinedSignal?.throwIfAborted();
      try {
        const { file, html, images: current } = readSectionImages(workspaceDir, targets.get(id), generations);
        const edits = [];
        for (const item of group) {
          const image = current.find(image => image.image_id === item.image_id);
          if (!image) throw new Error(`图片标识不存在：${item.image_id}`);
          const asset = resolveImageWorkspaceFile(workspaceDir, item.asset_ref);
          if (!fs.existsSync(asset) || !fs.statSync(asset).isFile()) throw new Error(`图片文件不存在：${item.asset_ref}`);
          if (!/\.(?:png|jpe?g|webp|gif|bmp)$/i.test(item.asset_ref)) throw new Error('回填必须使用图片资源，不能使用绘图源码');
          if (image.asset_ref === item.asset_ref) continue;
          if (image.asset_ref !== item.previous_asset_ref) throw new Error(`图片引用已变化，请刷新清单：${item.image_id}`);
          edits.push(imageReferenceEdit(html, image, item.asset_ref));
        }
        if (edits.length) {
          const edited = applyRangeEdits(html, edits);
          if (edited.errors.length) throw new Error(edited.errors.join('；'));
          combinedSignal?.throwIfAborted();
          const temporary = `${file}.images.tmp`;
          try { fs.writeFileSync(temporary, edited.content, 'utf8'); fs.renameSync(temporary, file); }
          finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
        }
        for (const item of group) results.set(item.image_id, { image_id: item.image_id, section_id: id, status: 'success', asset_ref: item.asset_ref });
      } catch (error) {
        for (const item of group) results.set(item.image_id, { image_id: item.image_id, section_id: id, status: 'error', error: error.message });
      }
    }
    return items.map(item => results.get(item.image_id));
  }

  // Read latest content before generation to confirm image locations and record original references for updates or completion skips; do not call models for missing images.
  function readImageReferences(images) {
    const targets = getTargets();
    const references = new Map();
    const errors = new Map();
    for (const id of new Set(images.map(image => decodeURIComponent(image.image_id.split('/')[0])))) {
      try {
        if (!targets.has(id)) throw new Error('图片不属于本次目标小节，请使用清单中的 image_id');
        for (const image of readSectionImages(workspaceDir, targets.get(id), generations).images) references.set(image.image_id, image);
      } catch (error) { errors.set(id, error.message); }
    }
    return image => {
      if (image.image_id.split('/').length === 2 && references.has(image.image_id)) return references.get(image.image_id);
      throw new Error(errors.get(decodeURIComponent(image.image_id.split('/')[0])) || `正文中不存在该图片，请使用清单中的 image_id：${image.image_id}`);
    };
  }

  // Existing valid images count as complete and duplicate task submissions do not regenerate them; regenerate explicitly requests replacement, while original-plan images are always reused.
  // Reuse existing images whose generation method was disabled; do not silently replace them through another method.
  function completedImage(current, image) {
    if (current.reused_original && !current.asset_exists) throw new Error('原方案图片不重新生成，请修复原图引用');
    if (image.regenerate && !current.reused_original && !generations.has(current.generation)) throw new Error('该图片只能复用，不能重新生成');
    return current.asset_exists && (current.reused_original || !image.regenerate);
  }

  // Initial generation and source repair share rendering logic; enqueue in the existing local queue as soon as source is ready.
  async function renderImage(result, combinedSignal) {
    combinedSignal.throwIfAborted();
    const renderer = localImageRenderService || require('./localImageRenderService.cjs').getLocalImageRenderService();
    const pauseOptions = { isPauseRequested: () => combinedSignal.aborted, createPauseError: () => combinedSignal.reason };
    const source = fs.readFileSync(resolveImageWorkspaceFile(workspaceDir, result.source_file), 'utf8');
    report('images', '正在生成图片与本地转图', [imageProgress(result)]);
    const rendered = result.kind === 'html'
      ? await renderer.renderHtmlToPng(source, { ...pauseOptions, frameSize: result.frame_size, checkLayout: htmlImageOptimization })
      : await renderer.renderMermaidToPng(source, pauseOptions);
    combinedSignal.throwIfAborted();
    // Compress rendering output before saving; Word conversion and layout checks directly use compressed images.
    const compressed = compressGeneratedImage(rendered.buffer, 'png');
    Object.assign(result, {
      asset_ref: saveImage(compressed.buffer, `.${compressed.extension}`), width: compressed.width, height: compressed.height,
      ...(result.kind === 'html' ? { layout_issues: rendered.layout_issues } : {}),
      status: result.kind === 'html' && rendered.layout_issues?.length ? 'needs_repair' : 'success',
    });
  }

  // Return after the whole batch settles; update content immediately after each image succeeds so completed images survive pauses.
  // Keep complete per-item results in details for code and session recovery; model text lists only failed or unapplied items.
  async function runImageBatch(images, toolSignal, onUpdate, processImage) {
    const combinedSignal = AbortSignal.any([signal, toolSignal].filter(Boolean));
    combinedSignal.throwIfAborted();
    beforeApply();
    if (new Set(images.map(image => image.image_id)).size !== images.length) throw new Error('同一任务文件中图片的 image_id 不能重复');
    const currentImage = readImageReferences(images);
    const skipped = image => { try { return completedImage(currentImage(image), image); } catch { return false; } };
    report('images', '正在生成图片与本地转图', images.map(image => skipped(image)
      ? { id: image.image_id, kind: image.kind, status: 'success', asset_ref: currentImage(image).asset_ref }
      : { id: image.image_id, kind: image.kind, status: image.source_file ? 'rendering' : 'generating', source_ready: Boolean(image.source_file) }));
    let completed = 0;
    const guard = createAiBatchGuard({ signal: combinedSignal });
    const results = await Promise.all(images.map(async image => {
      const result = { image_id: image.image_id, kind: image.kind,
        ...(image.source_file ? { source_file: image.source_file } : {}),
        ...(image.kind === 'html' ? { frame_size: image.frame_size } : {}),
        stage: image.source_file ? 'render' : 'generate' };
      try {
        guard.signal.throwIfAborted();
        const current = currentImage(image);
        if (completedImage(current, image)) {
          Object.assign(result, { status: 'skipped', stage: 'complete', asset_ref: current.asset_ref });
        } else {
          await processImage(image, result, guard.signal);
          guard.success();
          if (result.status === 'success') {
            result.stage = 'complete';
            // Reference updates are synchronous so later pauses cannot lose successful images; retain image addresses after failures for batch-update retry.
            const [applied] = applyImageReferences([{ image_id: image.image_id, asset_ref: result.asset_ref, previous_asset_ref: current.asset_ref }]);
            Object.assign(result, applied.status === 'success' ? { applied: true } : { applied: false, previous_asset_ref: current.asset_ref, apply_error: applied.error });
          }
        }
      } catch (error) {
        const cancelled = isBatchCancelled(error, guard.signal);
        if (!cancelled) guard.failure(error);
        Object.assign(result, { status: cancelled ? 'cancelled' : 'error', error: error.message });
      }
      report('images', '正在生成图片与本地转图', [imageProgress(result)]);
      onUpdate?.(toolResult({ completed: ++completed, total: images.length, result }));
      return result;
    }));
    // Preserve batch results first, as for pauses, then let the owning task end with the upstream error.
    if (guard.error) failTask(guard.error);
    const applied = results.filter(result => result.applied !== undefined);
    if (applied.length) report('image-apply', '正在回填图片地址', applied.map(result => ({ id: result.image_id, status: result.applied ? 'success' : 'error' })));
    const unresolved = results.filter(result => result.status !== 'skipped' && (result.status !== 'success' || !result.applied));
    const cancelled = guard.signal.aborted ? { cancelled: true } : {};
    const output = toolResult({ results, ...cancelled }, { total: results.length, applied: applied.filter(result => result.applied).length,
      skipped: results.filter(result => result.status === 'skipped').length, unresolved, ...cancelled });
    if (unresolved.length) output.isError = true;
    return output;
  }

  // The main workflow provides final targets after planning and restoration; single-section edits still pass a fixed target directly.
  const getTargets = () => new Map(getSections().map(section => [section.id, section]));
  const listFile = `${listDir}/正文图片清单.json`;
  const taskFile = key => taskFilePath(key, taskDir);
  const skipNote = 'Items with valid references are skipped automatically; resubmitting the task file does not regenerate them. Set "regenerate": true to replace an existing image; never regenerate original-plan images.';
  const hasAi = imageKinds.includes('ai');
  const hasHtml = imageKinds.includes('html');
  const sourceKinds = ['html', 'mermaid'].filter(kind => imageKinds.includes(kind));
  const sourceLabel = sourceKinds.map(kind => (kind === 'html' ? 'HTML' : 'Mermaid')).join('/');
  const generateDescription = [
    `Read and generate all image tasks from ${taskFile('images')} as {"images":[{"image_id":"inventory identifier","kind":"${imageKindList(imageKinds)}","prompt":"…"}]}. Use each inventory image_id exactly and only once in the file; kind must be ${imageKindList(imageKinds)}${imageKinds.length > 1 ? ' as appropriate' : ''}.`,
    hasAi ? `For AI items, describe the subject, visible elements, viewpoint and composition, environment and lighting positively and in that order. Include distinctive visual details and preserve the body frame ratio and orientation. style determines the visual form; do not describe a conflicting style or repeat the program’s brand, watermark and unrelated-text restrictions. AI items require a concrete size matching each figure’s data-sv-size: square=1:1, wide=3:2, tall=3:4, panorama=16:9; the current gpt-image-2-1k tall size is 768x1024. Do not pass a frame name or omit size. style is required and must match the template’s visual form: ${AI_IMAGE_STYLE_OPTIONS}. An optional title is a short image name.` : '',
    sourceKinds.length ? `${sourceLabel} prompts must specify purpose, accurate content and data, and preserve the body frame ratio and orientation. Do not provide only a path or ask the model to search.` : '',
    hasHtml ? 'HTML items require frame_size matching the body figure’s data-sv-size.' : '',
    `${skipNote} Write the file before submitting it to the tool.`,
    `${[hasAi && 'AI uses the image-generation queue', sourceKinds.length && `${sourceLabel} source uses the text queue and each source enters its local render queue immediately on completion`].filter(Boolean).join('; ')}. Overflow is queued automatically.`,
    `Successful image references are applied immediately; no application tool is needed for them. Returns total, applied (successfully generated and applied), skipped (existing images) and unresolved. unresolved lists only failed or unapplied items with status, stage, asset_ref${sourceKinds.length ? ', source_file' : ''} and error; application failures also include apply_error and previous_asset_ref. Refresh the inventory and retry the application tool if needed.`,
    hasHtml && htmlImageOptimization ? 'When HTML returns needs_repair, edit source according to layout_issues and render again until successful.' : '',
    sourceKinds.length ? 'For failed items with source_file, repair source and call the render tool; retry generation only for items without source.' : '',
    'Pause preserves completed results; resume fills only unfinished items.',
    'Write every image prompt in the same language as the proposal (Spanish or English), including diagram descriptions and instructions; preserve technical identifiers, file paths and user-provided names exactly.',
  ].join(' ');
  return [{
    name: 'list-section-images', label: '读取正文图片清单', executionMode: 'sequential',
    description: `Read the latest HTML for target sections and inventory each image's image_id, generation method, ratio, fit, prompt, caption, current reference and file existence. Omit sections without images. Without section_ids, read all targets, write the full inventory to ${listFile} and return summary: new image count, generation method distribution, counts of layout groups and images missing captions, data-sv-fit or valid references. The inventory file summary contains the individual image_id values; use the summary for layout and distribution checks. With section_ids, read only those sections and return image details directly without rewriting the inventory. Pass image_id unchanged to image and application tools; do not construct it yourself. Images marked reused_original belong to the original plan and must be reused, never regenerated.`,
    parameters: Type.Object({ section_ids: Type.Optional(Type.Array(Type.String(), { uniqueItems: true })) }, { additionalProperties: false }),
    async execute(_callId, { section_ids }, toolSignal) {
      const combinedSignal = AbortSignal.any([signal, toolSignal].filter(Boolean));
      combinedSignal.throwIfAborted();
      const targets = getTargets();
      report('image-list', '正在整理正文图片清单', (section_ids || [...targets.keys()]).map(id => ({ id, status: 'running' })), { unit: '节' });
      const parsed = [];
      const results = (section_ids || [...targets.keys()]).map(id => {
        combinedSignal.throwIfAborted();
        try {
          if (!targets.has(id)) throw new Error(`不能读取非目标小节：${id}`);
          const { images } = readSectionImages(workspaceDir, targets.get(id), generations);
          parsed.push(...images);
          // Grouping already supplies section IDs and files; aggregate layout and other statistics into summary.
          return { section_id: id, status: 'success', images: images.map(({ location, section_id, file, layout, table, image_text_left, ...image }) => image) };
        } catch (error) { return { section_id: id, status: 'error', error: error.message }; }
      });
      report('image-list', '图片清单检查完成', results.map(result => ({ id: result.section_id, status: result.status })), { unit: '节', done: true });
      const images = results.flatMap(result => result.images || []);
      const added = parsed.filter(image => !image.reused_original);
      const count = (list, key) => list.reduce((counts, item) => ({ ...counts, [key(item)]: (counts[key(item)] || 0) + 1 }), {});
      const tables = new Set(added.filter(image => image.table).map(image => image.table));
      const summary = {
        new_images: added.length, reused_original_images: parsed.length - added.length,
        new_images_by_generation: { ...Object.fromEntries([...generations].map(generation => [generation, 0])), ...count(added, image => image.generation) },
        new_layout_groups: { single: added.filter(image => image.layout === 'single').length, imageText: 0, threeImages: 0, fourImages: 0,
          ...count([...tables], table => table.attribs['data-sv-preset'] || 'unknown') },
        missing_caption: parsed.filter(image => !image.caption && !image.image_text_left).map(image => image.image_id),
        missing_fit: parsed.filter(image => !image.fit).map(image => image.image_id),
        missing_asset: parsed.filter(image => !image.asset_exists).map(image => image.image_id),
      };
      const items = images.filter(image => !image.reused_original).map(image => ({ id: image.image_id, kind: ({ aiImage: 'ai', htmlImage: 'html', mermaid: 'mermaid' })[image.generation], ...(image.asset_exists ? { status: 'success', asset_ref: image.asset_ref } : {}) }));
      if (results.every(result => result.status === 'success')) report('images', `图片清单已整理，复用原图 ${images.filter(image => image.reused_original).length} 张`, items, { inventory: results.filter(result => result.status === 'success').map(result => result.section_id) });
      const listed = results.filter(result => result.status !== 'success' || result.images.length);
      if (section_ids) return toolResult({ summary, results: listed });
      // The complete manifest grows with section count, so write it for on-demand reading; the model receives only counts and failed section reads.
      const { missing_caption, missing_fit, missing_asset, ...counts } = summary;
      const errors = results.filter(result => result.status !== 'success');
      const file = writeListFile(workspaceDir, 'images', { summary, results: listed }, listDir);
      return toolResult({ summary, results: listed, file }, { file, summary: { ...counts, missing_caption_count: missing_caption.length,
        missing_fit_count: missing_fit.length, missing_asset_count: missing_asset.length }, ...(errors.length ? { errors } : {}) });
    },
  }, {
    name: 'apply-section-images', label: '批量回填正文图片', executionMode: 'sequential',
    description: `Successful images are applied automatically. Use this tool only to retry items with applied=false or repair original-image references. Submit all entries from ${taskFile('applyImages')} in the form {"images":[{"image_id":"inventory identifier","asset_ref":"asset_ref returned by image tool","previous_asset_ref":"previous_asset_ref returned by image tool or original inventory reference; empty string if absent"}]}. ${TASK_FILE_WRITING}Changes are combined and saved per section, modifying only img data-sv-asset-ref. Refresh the inventory if a reference changed; resubmitting the same reference does not repeat the change. Do not write unsuccessful items; reuse original images. Returns total, success and unresolved (failed applications and reasons). Mark the task complete only after all required applications succeed.`,
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_callId, _params, toolSignal) {
      const combinedSignal = AbortSignal.any([signal, toolSignal].filter(Boolean));
      combinedSignal.throwIfAborted();
      beforeApply();
      const { images } = readTaskFile(workspaceDir, 'applyImages', taskDir);
      report('image-apply', '正在回填图片地址', images.map(image => ({ id: image.image_id, status: 'running' })));
      if (new Set(images.map(item => item.image_id)).size !== images.length) throw new Error('同一任务文件中回填的 image_id 不能重复');
      const ordered = applyImageReferences(images, combinedSignal);
      report('image-apply', '正在回填图片地址', ordered.map(item => ({ id: item.image_id, status: item.status })));
      return toolResult({ results: ordered }, compactResults(ordered));
    },
  }, ...(imageKinds.length ? [{
    name: 'generate-section-images', label: '批量生成正文图片', executionMode: 'sequential',
    description: generateDescription,
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_callId, _params, toolSignal, onUpdate) {
      const { images } = readTaskFile(workspaceDir, 'images', taskDir, imageKinds);
      return runImageBatch(images, toolSignal, onUpdate, async (image, result, combinedSignal) => {
        const { image_id, kind, prompt, frame_size } = image;
        if (kind === 'ai') {
          const { image_id: _id, kind: _kind, regenerate: _regenerate, ...params } = image;
          const generated = await aiService.generateImage({ ...params, signal: combinedSignal });
          combinedSignal.throwIfAborted();
          // Image-service local paths and preview addresses are only for programmatic copying, never model context.
          Object.assign(result, { status: 'success', asset_ref: saveImage(fs.readFileSync(generated.file_path), path.extname(generated.file_path)) });
        } else {
          const response = await aiService.chat({
            signal: combinedSignal, logTitle: `Agent 配图源码-${kind}-${image_id}`,
            messages: [{ role: 'system', content: buildImageSourcePrompt(kind, frame_size) }, { role: 'user', content: prompt }],
          });
          combinedSignal.throwIfAborted();
          const source = extractAiSource(response, kind);
          result.source_file = saveImage(Buffer.from(source, 'utf8'), kind === 'html' ? '.html' : '.mmd');
          result.stage = 'render';
          await renderImage(result, combinedSignal);
        }
      });
    },
  }] : []), ...sourceKinds.map(kind => ({
    name: `render-${kind}-image`, label: kind === 'html' ? '批量 HTML 转图片' : '批量 Mermaid 转图片',
    description: `Submit all render tasks from ${taskFile(kind === 'html' ? 'renderHtml' : 'renderMermaid')} as {"images":[{"image_id":"image_id used for source generation","source_file":"workspace-relative source path, e.g. 图片/实施流程.${kind === 'html' ? 'html' : 'mmd'}"${kind === 'html' ? ',"frame_size":"matches the body figure data-sv-size"' : ''}}]}. Source must be UTF-8 without Markdown fences. ${kind === 'html' ? 'frame_size design dimensions: square=1240×1240, wide=1240×827, tall=1240×1653, panorama=1240×698, including 40px padding on every side. Write HTML for these dimensions; the program screenshots body as a fixed canvas and outputs at 2x resolution. ' : ''}${skipNote} ${TASK_FILE_WRITING}The local render queue controls concurrency and converts to PNG; successful references are applied immediately. Returns total, applied, skipped and unresolved; unresolved lists only failed or unapplied items with status, source path, error or apply_error. ${kind === 'html' && htmlImageOptimization ? 'When needs_repair is returned, edit the source according to layout_issues and render again until successful. ' : ''}Modify and resubmit only failed items or those needing correction, preserving other results.`,
    executionMode: 'sequential',
    parameters: Type.Object({}, { additionalProperties: false }),
    // Repairs rerender existing source only, reusing initial generation's result and cancellation handling.
    async execute(_callId, _params, toolSignal, onUpdate) {
      const { images } = readTaskFile(workspaceDir, kind === 'html' ? 'renderHtml' : 'renderMermaid', taskDir);
      return runImageBatch(images.map(image => ({ ...image, kind })), toolSignal, onUpdate,
        async (_image, result, combinedSignal) => renderImage(result, combinedSignal));
    },
  }))];
}

module.exports = { createContentGenerationImageTools, validateContentImageReferences, imageToolNames, buildImageSourcePrompt };
