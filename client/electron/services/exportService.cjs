const brand = require('../../brand.json');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { app, dialog, nativeImage } = process.env.SAVIA_HEADLESS_RUNNER === '1' ? {} : require('electron');
const cheerio = require('cheerio');
const { imageSize } = require('image-size');
const mime = require('mime-types');
const { compactLogError, createDeveloperLogger, textMetrics } = require('../utils/developerLog.cjs');
const { getGeneratedImagesDir, getImportedImagesDir } = require('../utils/paths.cjs');
const { pickLocaleMessage, detectLocaleFromConfig } = require('../utils/localeMessages.cjs');
const { normalizePendingMarkers } = require('../utils/pendingMarkers.cjs');
const { localizeExportFormat } = require('../utils/localizeExportFormat.cjs');
const { exportGeneratedOutlineTitle } = require('../utils/generatedOutlineTitle.cjs');
const { renderMarkdownHtml } = require('../utils/renderMarkdownHtml.cjs');
const {
  renderChromePngs,
  loadChromeModule,
  resolveChromeLayoutSync,
} = require('./chromeAssetService.cjs');
const {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  LevelSuffix,
  Packer,
  PageNumber,
  PageBreak,
  PageOrientation,
  Paragraph,
  SectionType,
  ShadingType,
  SimpleField,
  Table,
  TableAnchorType,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  TextWrappingType,
  ImportedXmlComponent,
} = require('docx');

const MAX_IMAGE_WIDTH = 520;
const MAX_IMAGE_HEIGHT_PERCENT = 90;
const NUMBERING_REFERENCE_PREFIX = 'technical-plan-numbering';
const HEADING_NUMBERING_REFERENCE = 'technical-plan-heading-numbering';
const DOCX_TABLE_WIDTH_TWIPS = 9000;
const DEFAULT_HEADING_BORDER_CELL_COLORS = ['#e0ecff', '#e9f1ff', '#f2f7ff', '#f8fbff', '#ffffff', '#ffffff'];
const DEFAULT_TABLE_STYLE = {
  border_width: 1,
  border_color: '#dcdff6',
  cell_padding_pt: 6,
  full_width: true,
  caption_font: '宋体',
  caption_size: '小四',
  caption_alignment: '居中对齐',
  caption_bold: true,
  caption_italic: false,
  header_row: { font: '黑体', size: '小四', alignment: '居中对齐', text_color: '#243048', background_color: '#eef5ff' },
  first_column: { font: '宋体', size: '小四', alignment: '左对齐', text_color: '#243048', background_color: '#ffffff' },
  body_cell: { font: '宋体', size: '小四', alignment: '左对齐', text_color: '#243048', background_color: '#ffffff' },
};
const DEFAULT_IMAGE_STYLE = {
  max_width_percent: 90,
  alignment: '居中对齐',
  caption_font: '宋体',
  caption_size: '小五',
  caption_alignment: '居中对齐',
  caption_bold: false,
  caption_italic: false,
};
const UNORDERED_LIST_MARKERS = {
  disc: { text: '•', font: 'Arial', sizeScale: 0.75 },
  circle: { text: '○', font: 'Arial', sizeScale: 0.82 },
  square: { text: '■', font: 'Arial', sizeScale: 0.72 },
  diamond: { text: '◆', font: 'Arial', sizeScale: 0.72 },
  dash: { text: '–', font: 'Arial', sizeScale: 0.9 },
  check: { text: '✓', font: 'Segoe UI Symbol', sizeScale: 0.85 },
  arrow: { text: '➢', font: 'Segoe UI Symbol', sizeScale: 0.88 },
  sparkle: { text: '✧', font: 'Segoe UI Symbol', sizeScale: 0.9 },
};
const ORDERED_LIST_WORD_STYLES = {
  'decimal-dot': { format: LevelFormat.DECIMAL, text: (level) => `%${level + 1}.` },
  'decimal-paren': { format: LevelFormat.DECIMAL, text: (level) => `%${level + 1}）` },
  'decimal-full-paren': { format: LevelFormat.DECIMAL, text: (level) => `（%${level + 1}）` },
  'chinese-dot': { format: LevelFormat.CHINESE_COUNTING, text: (level) => `%${level + 1}、` },
  'chinese-paren': { format: LevelFormat.CHINESE_COUNTING, text: (level) => `（%${level + 1}）` },
  'lower-alpha': { format: LevelFormat.LOWER_LETTER, text: (level) => `%${level + 1}.` },
  'upper-alpha': { format: LevelFormat.UPPER_LETTER, text: (level) => `%${level + 1}.` },
  'lower-roman': { format: LevelFormat.LOWER_ROMAN, text: (level) => `%${level + 1}.` },
  'upper-roman': { format: LevelFormat.UPPER_ROMAN, text: (level) => `%${level + 1}.` },
};

// Paper dimensions in mm (portrait width × height), matching Renderer exportFormat.ts.
const PAPER_DIMENSIONS_MM = {
  a4: { width: 210, height: 297 },
  a3: { width: 297, height: 420 },
  a5: { width: 148, height: 210 },
  b4: { width: 250, height: 353 },
  b5: { width: 176, height: 250 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
  '16k': { width: 184, height: 260 },
};

function mmToTwips(mm) {
  return Math.round(mm * 56.6929); // 1mm = 1440 twips ÷ 25.4 mm/inch
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampPercent(value) {
  return Math.max(0, Math.min(Math.round(Number(value) || 0), 100));
}

function reportProgress(context, progress, message, extra = {}) {
  if (!context?.onProgress) return;
  try {
    context.onProgress({
      phase: extra.phase || 'running',
      progress: clampPercent(progress),
      message,
      warnings: [...(context.warnings || [])],
      ...extra,
    });
  } catch (error) {
    console.warn('[export-word] progress callback failed', error);
  }
}

function reportConversionProgress(context, message) {
  const stats = context?.stats || {};
  const total = Math.max(1, stats.leafCount || 0);
  const done = Math.min(total, context.convertedLeafCount || 0);
  reportProgress(context, 10 + (done / total) * 78, message);
}

function writeExportLog(context, event, payload = {}) {
  if (!context?.developerLogger?.enabled) return;
  context.developerLogger.write(event, payload);
}

function addWarning(context, message) {
  if (context?.warnings) {
    context.warnings.push(message);
  }
  writeExportLog(context, 'export.warning', { message });
  if (!context?.quietWarnings) console.warn(`[export-word] ${message}`);
}

function addUnsupportedHtmlWarning(context, tagName) {
  const tag = String(tagName || '').toLowerCase();
  if (!tag) return;
  if (!context.unsupportedHtmlTags) {
    context.unsupportedHtmlTags = new Set();
  }
  if (context.unsupportedHtmlTags.has(tag)) {
    return;
  }
  context.unsupportedHtmlTags.add(tag);
  addWarning(context, context.locale === 'es' ? `La etiqueta HTML <${tag}> se simplificó al exportar; revisa el documento Word.` : `HTML 标签 <${tag}> 导出时已降级，请核对 Word 内容。`);
}

function compactText(value, maxLength = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function countOutlineStats(items = []) {
  let leafCount = 0;

  for (const item of items || []) {
    if (item.children?.length) {
      const childStats = countOutlineStats(item.children);
      leafCount += childStats.leafCount;
    } else {
      leafCount += 1;
    }
  }

  return { leafCount };
}

/** Build a pending-input placeholder; continue the chapter frame only when the current node uses the template. */
function buildPendingContentModeParagraph(item, context) {
  if (String(item?.content || '').trim()) return null;
  const message = getPendingContentModeMessage(item);
  return message
    ? paragraph([textRun(`[${message}]`, {
      font: context.bodyRunFont,
      size: context.bodyRunSize,
      color: '8A650B',
      italics: true,
    })], { ...chapterFrameParagraphOptions(context), after: 120 })
    : null;
}

/** Share pending-node placeholders across export paths. */
function getPendingContentModeMessage(item, locale = 'zh') {
  let message = '';
  if (locale === 'es') {
    if (item?.content_mode === 'template-fill') return 'Pendiente de completar con la plantilla del pliego.';
    if (item?.content_mode === 'directory-generate') return 'Pendiente de generar o actualizar el índice después de exportar.';
    if (item?.content_mode === 'manual-fill') return 'Pendiente de completar manualmente después de exportar.';
    if (item?.content_mode === 'other') return `Pendiente: ${String(item?.content_mode_note || '').trim() || 'esta sección requiere un tratamiento especial.'}`;
  }
  if (item?.content_mode === 'template-fill') {
    message = '待模板填写：后续将从招标文件提取并填充内容。';
  } else if (item?.content_mode === 'directory-generate') {
    message = '待目录生成：请在导出后生成或更新目录。';
  } else if (item?.content_mode === 'manual-fill') {
    message = '待人工填写：请在导出后补充内容。';
  } else if (item?.content_mode === 'other') {
    message = `待处理：${String(item?.content_mode_note || '').trim() || '该小节采用其他特殊处理模式。'}`;
  }
  return message;
}

function collectOutlineContents(items = []) {
  const contents = [];
  for (const item of items || []) {
    if (item.children?.length) {
      contents.push(...collectOutlineContents(item.children));
    } else {
      contents.push(String(item.content || ''));
    }
  }
  return contents;
}

function countOutlineContentMetrics(items = []) {
  const contents = collectOutlineContents(items);
  return {
    ...textMetrics(contents.join('\n\n')),
    leaf_content_count: contents.filter((content) => content.trim()).length,
  };
}

function loadDeveloperConfig(configStore) {
  try {
    return configStore?.load?.() || {};
  } catch {
    return {};
  }
}

function sanitizeFilename(value) {
  return String(value || '标书文档')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || '标书文档';
}

function formatExportTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function cleanText(value) {
  return String(value || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function normalizeDocxColor(value, fallback = '536176') {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return raw.split('').map((char) => `${char}${char}`).join('').toUpperCase();
  }
  return fallback;
}

function textRun(text, options = {}) {
  return new TextRun({
    text: cleanText(text),
    font: options.font || '宋体',
    size: options.size || 24,
    bold: options.bold,
    italics: options.italics,
    strike: options.strike,
    color: options.color,
    underline: options.underline ? { type: UnderlineType.SINGLE } : undefined,
  });
}

function lineBreakRun() {
  return new TextRun({ break: 1 });
}

function textRunsWithBreaks(value, options = {}) {
  const parts = String(value || '').split(/<br\s*\/?\s*>/gi);
  const runs = [];

  parts.forEach((part, index) => {
    if (index > 0) {
      runs.push(lineBreakRun());
    }
    if (part) {
      runs.push(textRun(part, options));
    }
  });

  return runs;
}

/** Convert body spacing to native Word units; do not convert line units to points. */
function buildBodyParagraphSpacing(style = {}) {
  const mode = style.line_spacing_mode ?? 'multiple';
  const value = style.line_spacing_value ?? 1.2;
  const points = mode === 'exact' || mode === 'at-least';
  const multiple = mode === 'single' ? 1 : mode === 'one-and-half' ? 1.5 : mode === 'double' ? 2 : value;
  const spacing = {
    before: 0,
    after: 0,
    line: Math.max(1, Math.round(points ? value * 20 : multiple * 240)),
    lineRule: mode === 'exact' ? 'exact' : mode === 'at-least' ? 'atLeast' : 'auto',
  };
  for (const side of ['before', 'after']) {
    const inLines = (style[`spacing_${side}_unit`] ?? 'lines') === 'lines';
    spacing[inLines ? `${side}Lines` : side] = Math.max(0, Math.round((style[`spacing_${side}`] ?? 0) * (inLines ? 100 : 20)));
  }
  return spacing;
}

/** Add frame padding to existing indentation without overriding list or first-line indentation. */
function mergeFrameIndent(indent, frameIndent) {
  if (!frameIndent) return indent;
  const merged = { ...indent };
  // A null left means numbering defines this block's left indent (see getListLevelIndent);
  // adding it here would override numbering left with direct paragraph formatting, leaving only hanging and pulling the leftmost character outside the padding.
  if (frameIndent.left != null) merged.left = (indent?.left || 0) + frameIndent.left;
  if (frameIndent.right != null) merged.right = (indent?.right || 0) + frameIndent.right;
  return merged;
}

/** Create paragraphs with native line-based paragraph-spacing properties not yet provided by the docx library. */
function paragraph(children, options = {}) {
  const spacing = options.spacing || { before: options.before || 0, after: options.after ?? 160, line: options.line || 360, lineRule: 'auto' };
  const result = new Paragraph({
    children: children?.length ? children : [textRun('')],
    heading: options.heading,
    pageBreakBefore: options.pageBreakBefore,
    alignment: options.alignment,
    bullet: options.bullet,
    numbering: options.numbering,
    keepNext: options.keepNext,
    spacing,
    indent: mergeFrameIndent(options.indent, options.frameIndent),
    border: options.border,
    shading: options.shading,
  });
  if (spacing.beforeLines !== undefined || spacing.afterLines !== undefined) {
    // Preserve w:pPr child order; replace the existing spacing node instead of adding a second w:spacing.
    const properties = result.properties.root;
    const index = properties.findIndex((item) => item.rootKey === 'w:spacing');
    properties[index] = new ImportedXmlComponent('w:spacing', Object.fromEntries(
      Object.entries(spacing).map(([key, value]) => [`w:${key}`, value]),
    ));
  }
  return result;
}

function pageBreakParagraph() {
  return paragraph([new PageBreak()], { after: 0, line: 0 });
}

function isLevel1PageBreakEnabled(exportFormat) {
  return exportFormat?.heading_level1_page_break_before === true;
}

function isFooterEnabled(pageSetup) {
  return pageSetup ? pageSetup.footer_enabled !== false : true;
}

function isPageNumberEnabled(pageSetup) {
  return pageSetup ? pageSetup.page_number_enabled !== false : true;
}

/**
 * Column spacing matches C# RestrictedHtmlDocumentRenderer Columns.Space=720
 * and Renderer pageMetrics.ts COLUMN_SPACING_CM=720/567. Keep all three consistent
 * so template previews, layout budgets, and exports use the same geometry.
 */
const SECTION_COLUMN_SPACE_TWIPS = 720;

/** Two columns apply only in landscape, matching C# landscape && two_column. */
function resolveColumnCount(pageSetup) {
  return pageSetup?.two_column === true && pageSetup?.orientation === 'landscape' ? 2 : 1;
}

// Markdown export retains paragraph frames; C# handles restricted-HTML body merging centrally.
// Keep heading-border toggles, colors, and padding aligned with RestrictedHtmlDocumentRenderer.
const CHAPTER_FRAME_PADDING_TWIPS = 115;
const CHAPTER_FRAME_BORDER_SPACE_PT = 5;
const CHAPTER_FRAME_LINE_SPACE_PT = 1;

/**
 * Paragraph borders, shading, and horizontal padding inside chapter frames; return an empty object outside frames.
 *
 * Word draws vertical borders (space + 2.44pt) outside the leftmost paragraph character, including hanging numbers.
 * Every block's leftmost character must therefore sit at CHAPTER_FRAME_PADDING_TWIPS to align vertical borders.
 * list=true delegates left indentation to numbering, where left - hanging already equals this padding; do not add it again.
 */
function chapterFrameParagraphOptions(context, { topLine = false, bottomLine = false, fill, list = false, heading = false } = {}) {
  const frame = context?.chapterFrame;
  if (!frame) return {};
  const side = {
    style: BorderStyle.SINGLE, size: 6, color: frame.color, space: CHAPTER_FRAME_BORDER_SPACE_PT,
  };
  const line = {
    style: BorderStyle.SINGLE, size: 6, color: frame.color, space: CHAPTER_FRAME_LINE_SPACE_PT,
  };
  const headingTopLine = fill ? { ...line, space: frame.headingTopBorderSpacePt ?? CHAPTER_FRAME_LINE_SPACE_PT } : line;
  const headingBottomLine = fill ? { ...line, space: frame.headingBottomBorderSpacePt ?? CHAPTER_FRAME_LINE_SPACE_PT } : line;
  const options = {
    border: { left: side, right: side, ...(topLine ? { top: headingTopLine } : {}), ...(bottomLine ? { bottom: headingBottomLine } : {}) },
    frameIndent: { left: list ? null : CHAPTER_FRAME_PADDING_TWIPS, right: CHAPTER_FRAME_PADDING_TWIPS },
  };
  if (heading && frame.includeHeadings === false) delete options.border;
  if (fill) options.shading = { type: ShadingType.CLEAR, fill };
  return options;
}

/** Return paragraph border padding within chapter frames. */
function chapterFramePaddingTwips(context) {
  return context?.chapterFrame ? CHAPTER_FRAME_PADDING_TWIPS : 0;
}

/**
 * Chapter-ending paragraph: only 1 twip high and visually invisible, used to draw the bottom frame border.
 * The last block cannot draw it itself because docx blocks are immutable after construction.
 */
function chapterFrameClosingParagraph(context) {
  return paragraph([], {
    ...chapterFrameParagraphOptions(context, { topLine: true }),
    spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' },
  });
}

function getChapterFrameConfig(exportFormat) {
  const frame = exportFormat?.heading_border;
  if (!frame?.enabled) return null;
  const color = normalizeDocxColor(frame.border_color || '#2174fd', '2174FD');
  const levelCellColors = Array.isArray(frame.level_cell_colors) ? frame.level_cell_colors : [];
  return {
    color,
    includeHeadings: frame.include_headings !== false,
    headingTopBorderSpacePt: Math.max(0, Math.round(frame.heading_top_border_space_pt ?? CHAPTER_FRAME_LINE_SPACE_PT)),
    headingBottomBorderSpacePt: Math.max(0, Math.round(frame.heading_bottom_border_space_pt ?? CHAPTER_FRAME_LINE_SPACE_PT)),
    headingBottomBorderEnabled: frame.heading_bottom_border_enabled === true,
    fills: DEFAULT_HEADING_BORDER_CELL_COLORS.map((fill, index) => {
      const fallback = normalizeDocxColor(fill, 'FFFFFF');
      return normalizeDocxColor(levelCellColors[index] || fill, fallback);
    }),
  };
}

function hexLuminance(value) {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) return 0;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function darkenHex(value, amount = 0.18) {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) return '#111111';
  const channel = (start) => Math.max(0, Math.round(Number.parseInt(raw.slice(start, start + 2), 16) * (1 - amount)));
  return `#${[0, 2, 4].map((start) => channel(start).toString(16).padStart(2, '0')).join('')}`;
}

function resolveHeaderFooterStyle(pageSetup) {
  const style = pageSetup?.header_footer_style;
  if (style === 'band' || style === 'rules' || style === 'top-bar' || style === 'footer-badge' || style === 'slant' || style === 'letterhead' || style === 'frame') return style;
  if (style === 'spine') return 'letterhead';
  if (style === 'seal') return 'frame';
  return 'plain';
}

function isHtmlHeaderFooterStyle(pageSetup) {
  const style = resolveHeaderFooterStyle(pageSetup);
  return style === 'top-bar' || style === 'slant' || style === 'letterhead' || style === 'frame';
}

function isDecorativeHeaderFooterStyle(pageSetup) {
  return resolveHeaderFooterStyle(pageSetup) !== 'plain';
}

function noneBorder() {
  return { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' };
}

function chromeNilBorders() {
  const none = noneBorder();
  return { top: none, bottom: none, left: none, right: none };
}

function getPageWidthTwips(pageSetup) {
  const dims = PAPER_DIMENSIONS_MM[pageSetup?.paper_size] || PAPER_DIMENSIONS_MM.a4;
  const landscape = pageSetup?.orientation === 'landscape';
  return mmToTwips(landscape ? dims.height : dims.width);
}

function createPageNumberRuns(format, runOptions, pad = 0) {
  const parts = String(format || '第{page}页').split('{page}');
  const runs = [];
  const safePad = Math.max(0, Math.min(6, Math.floor(Number(pad) || 0)));

  if (parts[0]) {
    runs.push(new TextRun({ ...runOptions, text: cleanText(parts[0]) }));
  }
  if (safePad > 0) {
    const picture = '0'.repeat(safePad);
    runs.push(new SimpleField(`PAGE \\# "${picture}"`, { ...runOptions, text: picture }));
  } else {
    runs.push(new TextRun({ ...runOptions, children: [PageNumber.CURRENT] }));
  }
  if (parts[1]) {
    runs.push(new TextRun({ ...runOptions, text: cleanText(parts[1]) }));
  }

  return runs;
}

function emptyHeader() {
  return new Header({ children: [new Paragraph({ children: [] })] });
}

function emptyFooter() {
  return new Footer({ children: [new Paragraph({ children: [] })] });
}

function withFirstPageEmpty(collection, CtorEmpty, firstPageDifferent) {
  if (!collection) return undefined;
  if (!firstPageDifferent) return collection;
  return { ...collection, first: CtorEmpty() };
}

function headerRunOptions(pageSetup, color) {
  return {
    font: pageSetup?.header_font || '宋体',
    size: chineseSizeToHalfPt(pageSetup?.header_size || '小五'),
    color: color || normalizeDocxColor(pageSetup?.header_color || '#536176'),
  };
}

function footerRunOptions(pageSetup, color) {
  return {
    font: pageSetup?.footer_font || '宋体',
    size: chineseSizeToHalfPt(pageSetup?.footer_size || '小五'),
    color: color || normalizeDocxColor(pageSetup?.footer_color || '#536176'),
  };
}

function shouldBuildHeader(pageSetup) {
  if (!pageSetup || pageSetup.header_enabled !== true) return false;
  if (isDecorativeHeaderFooterStyle(pageSetup)) return true;
  return Boolean(cleanText(pageSetup.header_text || '').trim());
}

function shouldBuildFooter(pageSetup) {
  const footerEnabled = isFooterEnabled(pageSetup);
  const footerText = footerEnabled ? cleanText(pageSetup?.footer_text || '').trim() : '';
  return Boolean(footerText) || isPageNumberEnabled(pageSetup);
}

/**
 * Word page margins reserve room for decorative bands. Derive them through the shared geometry module
 * (electron/shared/chrome/geometry.mjs), also used by previews and thumbnails,
 * instead of calculating independently. Fall back to raw configuration if the module is not loaded.
 */
function resolveWordPageMargins(pageSetup) {
  const fallback = {
    top: Number(pageSetup?.margin_top_cm ?? 2),
    bottom: Number(pageSetup?.margin_bottom_cm ?? 2),
    left: Number(pageSetup?.margin_left_cm ?? 2),
    right: Number(pageSetup?.margin_right_cm ?? 2),
    header: 0,
    footer: 0,
  };
  const layout = resolveChromeLayoutSync(pageSetup);
  if (!layout) return fallback;
  return {
    top: layout.marginTopCm,
    bottom: layout.marginBottomCm,
    left: layout.marginLeftCm,
    right: layout.marginRightCm,
    // Text and floating decorations share edge offsets from the layout.
    header: layout.headerDistanceCm,
    footer: layout.footerDistanceCm,
  };
}

/**
 * Header/footer decorations: one implementation shared by all eight styles.
 *
 * Rasterize shared SVG output (electron/shared/chrome) to PNG and embed floating images
 * positioned relative to paper, behind text, without wrapping: Word's standard watermark/stationery method
 * supports full bleed without occupying document-flow height.
 * Text uses transparent, paper-positioned table regions; icons, backgrounds, and borders stay in the image.
 *
 * Keep text and page numbers out of images: page numbers need refreshable PAGE fields and headings must remain editable/searchable.
 * Page-number text backgrounds use run-level shading.
 */

/** Escape XML text from user input before inserting it into handwritten XML. */
function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Chinese font-size names to half-point values, matching chineseSizeToHalfPt. */
function runPropsXml(opts) {
  const font = xmlEscape(opts.font || '宋体');
  const parts = [`<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>`];
  // The schema requires w:rPr child order: rFonts -> b -> color -> sz -> szCs -> shd.
  if (opts.bold) parts.push('<w:b/>');
  if (opts.color) parts.push(`<w:color w:val="${xmlEscape(opts.color)}"/>`);
  if (opts.size) parts.push(`<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>`);
  if (opts.shadingFill) {
    parts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${xmlEscape(opts.shadingFill)}"/>`);
  }
  return `<w:rPr>${parts.join('')}</w:rPr>`;
}

/** Combine {text|field} fragments into run XML; field represents PAGE fields. */
function runsXml(pieces) {
  return pieces.map((p) => {
    const rPr = runPropsXml(p);
    if (p.field === 'begin' || p.field === 'separate' || p.field === 'end') {
      return `<w:r>${rPr}<w:fldChar w:fldCharType="${p.field}"/></w:r>`;
    }
    if (p.field === 'instr') {
      return `<w:r>${rPr}<w:instrText xml:space="preserve">${xmlEscape(p.text)}</w:instrText></w:r>`;
    }
    return `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(p.text)}</w:t></w:r>`;
  }).join('');
}

/**
 * Anchored floating text box: editable text positioned absolutely relative to paper.
 *
 * Floating tables and paragraph frames are unsuitable because docx-editor.dev ignores tblpPr/framePr positioning
 * (horizontal offsets were entirely ignored in tests), returning text to document flow and misaligning decorations.
 * wp:anchor is precise in both consumers and shares the decoration coordinate system.
 */
function chromeTextBoxXml(box, align, pieces, zIndex, name) {
  const widthEmu = Math.round(Math.max(0.1, box.endCm - box.startCm) * 360000);
  const heightEmu = Math.round(Math.max(0.1, box.heightCm) * 360000);
  const xEmu = Math.round(box.startCm * 360000);
  const yEmu = Math.round(box.topCm * 360000);
  const jc = { 左对齐: 'left', 居中对齐: 'center', 右对齐: 'right', 两端对齐: 'both' }[align] || 'center';

  const paragraph =
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>` +
    `<w:jc w:val="${jc}"/></w:pPr>${runsXml(pieces)}</w:p>`;

  return (
    `<w:r><w:drawing>` +
    `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${zIndex}"` +
    ` behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"` +
    ` xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="page"><wp:posOffset>${xEmu}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${yEmu}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${widthEmu}" cy="${heightEmu}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>` +
        `<wp:docPr id="${zIndex}" name="${xmlEscape(name)}"/>` +
    // Required schema elements; the parser rejects the entire drawing if any are missing.
    `<wp:cNvGraphicFramePr/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">` +
    `<wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">` +
    `<wps:cNvSpPr txBox="1"/>` +
    `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></wps:spPr>` +
    `<wps:txbx><w:txbxContent>${paragraph}</w:txbxContent></wps:txbx>` +
    `<wps:bodyPr rot="0" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/>` +
    `</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`
  );
}

/**
 * Build a text-box component insertable into a paragraph.
 *
 * fromXmlString returns a wrapper with undefined rootKey; inserting it directly emits
 * <undefined>…</undefined> and corrupts header/footer XML. Extract the real w:r from root[0].
 */
function chromeTextBox(box, align, pieces, zIndex, name) {
  const wrapper = ImportedXmlComponent.fromXmlString(chromeTextBoxXml(box, align, pieces, zIndex, name));
  return wrapper.root[0];
}

/** Split page-number format strings into run fragments, inserting PAGE fields at {page}. */
function pageNumberPieces(format, marks, pad) {
  const token = '{page}';
  const at = String(format || '第{page}页').indexOf(token);
  if (at < 0) return [{ ...marks, text: format }];
  const prefix = format.slice(0, at);
  const suffix = format.slice(at + token.length);
  const picture = pad > 0 ? ` \\# "${'0'.repeat(Math.max(1, Math.min(6, pad)))}"` : '';
  const pieces = [];
  if (prefix) pieces.push({ ...marks, text: prefix });
  pieces.push({ ...marks, field: 'begin' });
  pieces.push({ ...marks, field: 'instr', text: ` PAGE${picture} ` });
  pieces.push({ ...marks, field: 'separate' });
  pieces.push({ ...marks, text: pad > 0 ? '0'.repeat(Math.max(1, Math.min(6, pad))) : '1' });
  pieces.push({ ...marks, field: 'end' });
  if (suffix) pieces.push({ ...marks, text: suffix });
  return pieces;
}

/** Floating-table anchor and required trailing paragraph, without occupying a full header/footer line. */
function chromeAnchorParagraph(children = []) {
  return new Paragraph({
    spacing: { before: 0, after: 0, line: 1, lineRule: 'exact' },
    children: [...children, new TextRun({ text: '', size: 1 })],
  });
}

/** Full-page-width decorative image; yCm is relative to the paper's top edge. */
function chromeImageRun(png, yCm, zIndex, name) {
  return new ImageRun({
    type: 'png',
    data: png.buffer,
    transformation: {
      width: Math.round((png.widthCm / 2.54) * 96),
      height: Math.round((png.heightCm / 2.54) * 96),
    },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
      verticalPosition: {
        relative: VerticalPositionRelativeFrom.PAGE,
        offset: Math.round(yCm * 360000),
      },
      behindDocument: true,
      allowOverlap: true,
      lockAnchor: false,
      layoutInCell: true,
      wrap: { type: TextWrappingType.NONE },
      zIndex,
    },
    altText: { title: name, description: name, name },
  });
}

/** Lay out header text by style region; place the full-width band's short label in its separate left badge area. */
function buildChromeHeader(pageSetup, chrome) {
  const layout = chrome.textLayout.header;
  const headerText = cleanText(pageSetup?.header_text || '').trim();
  const badgeText = cleanText(pageSetup?.header_badge_text || '').trim().slice(0, 4);

  const color = normalizeDocxColor(layout.color || pageSetup?.header_color || '#536176');
  const runOptions = { ...headerRunOptions(pageSetup, color), bold: layout.bold };

  const children = [];
  if (chrome.header) {
    children.push(chromeImageRun(chrome.header, chrome.layout.headerTopCm, 10, '页眉装饰'));
  }
  // Short labels belong only to band (as does their input field); ignore them for all other styles,
  // otherwise switching away from band introduces text the user cannot edit.
  const text = headerText;
  const title = new TextRun({ ...runOptions, text });
  if (layout.box) {
    // Decorations and text boxes are floating objects attached to the same 1-twip paragraph,
    // so they do not expand the header; anchors fully determine their positions.
    const marks = { font: runOptions.font, size: runOptions.size, color, bold: layout.bold };
    if (layout.badge && badgeText) {
      children.push(chromeTextBox(
        layout.badge.box,
        layout.badge.align,
        [{
          font: runOptions.font,
          size: headerRunOptions(pageSetup).size,
          color: normalizeDocxColor(layout.badge.color),
          bold: layout.badge.bold,
          text: badgeText,
        }],
        911,
        'HeaderBadgeText',
      ));
    }
    children.push(chromeTextBox(layout.box, layout.align, [{ ...marks, text }], 912, 'HeaderText'));
    return new Header({ children: [chromeAnchorParagraph(children)] });
  }
  children.push(title);

  return new Header({
    children: [new Paragraph({
      alignment: alignmentToWordType(layout.align || pageSetup?.header_alignment || '居中对齐'),
      spacing: { before: 0, after: 0, line: 240 },
      children,
    })],
  });
}

/** Lay out body text and page numbers separately when a page-number region exists; plain styles retain a combined single line. */
function buildChromeFooter(pageSetup, chrome) {
  const layout = chrome.textLayout.footer;
  const footerEnabled = isFooterEnabled(pageSetup);
  const footerText = footerEnabled ? cleanText(pageSetup?.footer_text || '').trim() : '';
  const pageNumberEnabled = isPageNumberEnabled(pageSetup);

  const textColor = normalizeDocxColor(layout.color || pageSetup?.footer_color || '#536176');
  const runOptions = footerRunOptions(pageSetup, textColor);

  const children = [];
  if (chrome.footer) {
    children.push(chromeImageRun(chrome.footer, chrome.layout.footerTopCm, 20, '页脚装饰'));
  }
  const textRuns = footerText ? [new TextRun({ ...runOptions, text: footerText })] : [];
  const pageRuns = [];
  if (pageNumberEnabled) {
    // Use run-level shading for page-number backgrounds; width follows text without knowing the digit count in advance.
    const pageRun = {
      ...footerRunOptions(pageSetup, normalizeDocxColor(layout.pageNumber.color || textColor)),
      bold: layout.pageNumber.bold === true,
    };
    if (layout.pageNumber.shadingFill) {
      pageRun.shading = { fill: normalizeDocxColor(layout.pageNumber.shadingFill) };
    }
    pageRuns.push(...createPageNumberRuns(
      pageSetup?.page_number_format || '第{page}页',
      pageRun,
      pageSetup?.page_number_pad,
    ));
  }
  if (layout.box) {
    const textMarks = { font: runOptions.font, size: runOptions.size, color: textColor };
    const pnMarks = {
      font: runOptions.font,
      size: runOptions.size,
      color: normalizeDocxColor(layout.pageNumber.color || textColor),
      bold: layout.pageNumber.bold === true,
      shadingFill: layout.pageNumber.shadingFill
        ? normalizeDocxColor(layout.pageNumber.shadingFill)
        : undefined,
    };
    const pnPieces = pageNumberEnabled
      ? pageNumberPieces(pageSetup?.page_number_format || '第{page}页', pnMarks, pageSetup?.page_number_pad)
      : [];

    if (layout.pageNumber.box) {
      // Partitioned styles: text and page numbers occupy separate regions, with page numbers following the decorative color block.
      if (footerText) {
        children.push(chromeTextBox(layout.box, layout.align, [{ ...textMarks, text: footerText }], 921, 'FooterText'));
      }
      if (pnPieces.length) {
        children.push(chromeTextBox(layout.pageNumber.box, layout.pageNumber.align, pnPieces, 922, 'FooterPageNumber'));
      }
    } else {
      // Unpartitioned rules style: combine text and page numbers in one region, retaining the centered single line.
      const merged = [];
      if (footerText) merged.push({ ...textMarks, text: footerText });
      if (footerText && pnPieces.length) merged.push({ ...textMarks, text: '    ' });
      merged.push(...pnPieces);
      if (merged.length) {
        children.push(chromeTextBox(layout.box, layout.align, merged, 921, 'FooterText'));
      }
    }
    return new Footer({ children: [chromeAnchorParagraph(children)] });
  }
  children.push(...textRuns);
  if (textRuns.length && pageRuns.length) children.push(new TextRun({ ...runOptions, text: '    ' }));
  children.push(...pageRuns);
  if (!children.length) children.push(textRun(''));

  return new Footer({
    children: [new Paragraph({
      alignment: alignmentToWordType(layout.align),
      spacing: { before: 0, after: 0, line: 240 },
      children,
    })],
  });
}

async function buildWordHeaders(pageSetup) {
  if (!shouldBuildHeader(pageSetup)) return undefined;
  const chrome = await renderChromePngs(pageSetup);
  const header = buildChromeHeader(pageSetup, chrome);
  return withFirstPageEmpty({ default: header }, emptyHeader, pageSetup?.first_page_different === true);
}

async function buildWordFooters(pageSetup) {
  if (!shouldBuildFooter(pageSetup)) return undefined;
  const chrome = await renderChromePngs(pageSetup);
  const footer = buildChromeFooter(pageSetup, chrome);
  return withFirstPageEmpty({ default: footer }, emptyFooter, pageSetup?.first_page_different === true);
}

function getTableStyle(context) {
  return context?.exportFormat?.table || DEFAULT_TABLE_STYLE;
}

function tableCaptionRunMarks(context) {
  const table = getTableStyle(context);
  return {
    font: table.caption_font || DEFAULT_TABLE_STYLE.caption_font,
    size: chineseSizeToHalfPt(table.caption_size || DEFAULT_TABLE_STYLE.caption_size),
    bold: table.caption_bold === true,
    italics: table.caption_italic === true,
  };
}

function tableCaptionParagraphOptions(context) {
  const table = getTableStyle(context);
  return {
    ...chapterFrameParagraphOptions(context, { topLine: true, bottomLine: true }),
    alignment: alignmentToWordType(table.caption_alignment || DEFAULT_TABLE_STYLE.caption_alignment),
    after: context?.chapterFrame ? 0 : 80,
    line: 240,
    indent: { left: 0, right: 0, firstLine: 0, hanging: 0 },
    keepNext: true,
  };
}

function getTableCellStyle(context, { isHeader = false, isFirstColumn = false } = {}) {
  const table = getTableStyle(context);
  if (isHeader) return table.header_row;
  if (isFirstColumn) return table.first_column;
  return table.body_cell;
}

function tableBorderSize(context) {
  const width = Number(getTableStyle(context).border_width) || 0;
  if (width <= 0) return 0;
  return Math.max(1, Math.round(width * 6));
}

function tableBorders(context) {
  const size = tableBorderSize(context);
  if (size <= 0) {
    const none = { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' };
    return {
      top: none,
      bottom: none,
      left: none,
      right: none,
      insideHorizontal: none,
      insideVertical: none,
    };
  }

  const border = {
    style: BorderStyle.SINGLE,
    size,
    color: normalizeDocxColor(getTableStyle(context).border_color, 'DCDFF6'),
  };
  return {
    top: border,
    bottom: border,
    left: border,
    right: border,
    insideHorizontal: border,
    insideVertical: border,
  };
}

function tableCellMargins(context) {
  const padding = Math.max(0, Number(getTableStyle(context).cell_padding_pt) || 0);
  const twips = Math.round(padding * 20);
  return { top: twips, bottom: twips, left: twips, right: twips };
}

function tableCellRunMarks(style) {
  return {
    font: style?.font || DEFAULT_TABLE_STYLE.body_cell.font,
    size: chineseSizeToHalfPt(style?.size || DEFAULT_TABLE_STYLE.body_cell.size),
    color: normalizeDocxColor(style?.text_color || DEFAULT_TABLE_STYLE.body_cell.text_color, '243048'),
  };
}

function tableCellParagraphOptions(style, context) {
  const spacing = { ...context.bodySpacing, before: 0, after: 80 };
  delete spacing.beforeLines;
  delete spacing.afterLines;
  return {
    spacing,
    alignment: alignmentToWordType(style?.alignment || DEFAULT_TABLE_STYLE.body_cell.alignment),
  };
}

function tableColumnWidths(columnCount, totalTwips = DOCX_TABLE_WIDTH_TWIPS) {
  const safeCount = Math.max(1, columnCount || 1);
  const base = Math.floor(totalTwips / safeCount);
  const widths = Array.from({ length: safeCount }, () => base);
  widths[widths.length - 1] += totalTwips - (base * safeCount);
  return widths;
}

function tableCellWidth(columnSpan, totalColumns) {
  const safeTotal = Math.max(1, totalColumns || 1);
  const safeSpan = Math.max(1, columnSpan || 1);
  return Math.round((DOCX_TABLE_WIDTH_TWIPS * safeSpan) / safeTotal);
}

function createTableCell({ children, context, isHeader = false, isFirstColumn = false, columnSpan = 1, totalColumns = 1 }) {
  const safeSpan = Math.max(1, columnSpan || 1);
  const table = getTableStyle(context);
  const cellStyle = getTableCellStyle(context, { isHeader, isFirstColumn });
  const fullWidth = table.full_width !== false;
  return new TableCell({
    children,
    shading: { type: ShadingType.CLEAR, fill: normalizeDocxColor(cellStyle?.background_color, 'FFFFFF') },
    margins: tableCellMargins(context),
    columnSpan: safeSpan > 1 ? safeSpan : undefined,
    width: fullWidth ? { size: tableCellWidth(safeSpan, totalColumns), type: WidthType.DXA } : undefined,
  });
}

function createDocxTable(rows, columnCount, context, captioned = false) {
  const table = getTableStyle(context);
  const frame = context?.chapterFrame;
  // Tables inside frames must span the column and use frame-colored outer borders to continue paragraph vertical lines,
  // otherwise the frame breaks at tables; omit the table top border when its caption already has a bottom border.
  const fullWidth = frame ? true : table.full_width !== false;
  const borders = tableBorders(context);
  // Set full-width tables to the exact body-column width; percentage tblW makes Word add horizontal cell margins outside the percentage,
  // exceeding the column by two margins (0.4 cm with defaults), crossing the right page margin and misaligning frame borders.
  // Cells contain inline content only, with no nested tables, so no nesting-level distinction is needed.
  const pinnedWidth = fullWidth ? getPageContentWidthTwips(context) : 0;
  const options = {
    rows,
    width: pinnedWidth
      ? { size: pinnedWidth, type: WidthType.DXA }
      : { size: 0, type: WidthType.AUTO },
    layout: fullWidth ? TableLayoutType.FIXED : TableLayoutType.AUTOFIT,
    borders: frame
      ? {
        ...borders,
        ...(captioned ? { top: { style: BorderStyle.NIL, size: 0, color: frame.color } } : {}),
        left: { style: BorderStyle.SINGLE, size: 6, color: frame.color },
        right: { style: BorderStyle.SINGLE, size: 6, color: frame.color },
      }
      : borders,
  };
  if (fullWidth) {
    options.columnWidths = tableColumnWidths(columnCount, pinnedWidth);
  }
  return new Table(options);
}

function getImageStyle(context) {
  return context?.exportFormat?.image || DEFAULT_IMAGE_STYLE;
}

// Available body width; in multi-column layouts return one column's width, since absolute-sized images would overflow if sized against the whole page.
function getPageContentWidthTwips(context) {
  const pageSetup = context?.exportFormat?.page || {};
  const dims = PAPER_DIMENSIONS_MM[pageSetup.paper_size] || PAPER_DIMENSIONS_MM.a4;
  const pageWidthMm = pageSetup.orientation === 'landscape' ? dims.height : dims.width;
  const pageWidthTwips = mmToTwips(pageWidthMm);
  const marginLeftTwips = cmToTwips(pageSetup.margin_left_cm ?? 2);
  const marginRightTwips = cmToTwips(pageSetup.margin_right_cm ?? 2);
  const contentWidthTwips = Math.max(1, pageWidthTwips - marginLeftTwips - marginRightTwips);
  const columnCount = resolveColumnCount(pageSetup);
  const columnWidthTwips = columnCount > 1
    ? (contentWidthTwips - SECTION_COLUMN_SPACE_TWIPS * (columnCount - 1)) / columnCount
    : contentWidthTwips;
  return Math.max(1, Math.round(columnWidthTwips));
}

function getPageContentWidthPx(context) {
  return Math.max(1, Math.round(getPageContentWidthTwips(context) / 15));
}

// Compute available Word body height from current paper, orientation, and margins.
function getPageContentHeightPx(context) {
  const pageSetup = context?.exportFormat?.page || {};
  const dims = PAPER_DIMENSIONS_MM[pageSetup.paper_size] || PAPER_DIMENSIONS_MM.a4;
  const pageHeightMm = pageSetup.orientation === 'landscape' ? dims.width : dims.height;
  const pageHeightTwips = mmToTwips(pageHeightMm);
  const margins = context?.pageMargins || resolveWordPageMargins(pageSetup);
  const marginTopTwips = cmToTwips(margins.top);
  const marginBottomTwips = cmToTwips(margins.bottom);
  const contentHeightTwips = Math.max(1, pageHeightTwips - marginTopTwips - marginBottomTwips);
  return Math.round(contentHeightTwips / 15);
}

function getImageMaxWidth(context) {
  const image = getImageStyle(context);
  const percent = Math.max(1, Math.min(100, Number(image.max_width_percent) || DEFAULT_IMAGE_STYLE.max_width_percent));
  return Math.max(1, Math.round(getPageContentWidthPx(context) * percent / 100));
}

function getImageMaxHeight(context) {
  return Math.max(1, Math.round(getPageContentHeightPx(context) * MAX_IMAGE_HEIGHT_PERCENT / 100));
}

function getImageParagraphOptions(context) {
  const image = getImageStyle(context);
  return {
    ...chapterFrameParagraphOptions(context),
    alignment: alignmentToWordType(image.alignment || DEFAULT_IMAGE_STYLE.alignment),
  };
}

function getCaptionRunMarks(context) {
  const image = getImageStyle(context);
  const marks = {
    font: image.caption_font || DEFAULT_IMAGE_STYLE.caption_font,
    size: chineseSizeToHalfPt(image.caption_size || DEFAULT_IMAGE_STYLE.caption_size),
  };
  if (image.caption_bold === true) {
    marks.bold = true;
  }
  if (image.caption_italic === true) {
    marks.italics = true;
  }
  return marks;
}

function getCaptionParagraphOptions(context) {
  const image = getImageStyle(context);
  return {
    ...chapterFrameParagraphOptions(context),
    alignment: alignmentToWordType(image.caption_alignment || DEFAULT_IMAGE_STYLE.caption_alignment),
    after: 80,
    line: 240,
    indent: { left: 0, right: 0, firstLine: 0, hanging: 0 },
  };
}

function normalizeColumnSpan(value) {
  const span = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(span) && span > 1 ? span : 1;
}

function isMarkdownTableRowLine(line) {
  return /^\s*\|.*\|\s*$/.test(String(line || ''));
}

function isMarkdownTableDelimiterLine(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line || ''));
}

function splitMarkdownTableCells(line) {
  let source = String(line || '').trim();
  if (!source.includes('|')) {
    return [];
  }
  if (source.startsWith('|')) {
    source = source.slice(1);
  }
  if (source.endsWith('|')) {
    source = source.slice(0, -1);
  }

  const cells = [];
  let current = '';
  let escaped = false;
  for (const char of source) {
    if (char === '|' && !escaped) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
    escaped = char === '\\' && !escaped;
  }
  cells.push(current.trim());
  return cells;
}

function isMarkdownTableDelimiterCell(cell) {
  return /^:?-{3,}:?$/.test(String(cell || '').trim());
}

function markdownTableRowIndent(line) {
  const match = /^(\s*)\|/.exec(String(line || ''));
  return match ? match[1] : '';
}

function formatMarkdownTableRow(cells, indent = '') {
  return `${indent}| ${cells.map((cell) => String(cell || '').trim()).join(' | ')} |`;
}

function expandCompressedMarkdownTableRows(headerLine, nextLine) {
  if (!isMarkdownTableRowLine(headerLine) || !isMarkdownTableRowLine(nextLine)) {
    return null;
  }

  const headerCells = splitMarkdownTableCells(headerLine);
  const nextCells = splitMarkdownTableCells(nextLine);
  const columnCount = headerCells.length;
  if (columnCount < 2 || nextCells.length <= columnCount) {
    return null;
  }

  const delimiterCells = nextCells.slice(0, columnCount);
  if (!delimiterCells.every(isMarkdownTableDelimiterCell)) {
    return null;
  }

  // Models sometimes collapse the separator and following data rows into one line; reconstruct GFM rows using the header column count.
  const indent = markdownTableRowIndent(headerLine);
  const lines = [formatMarkdownTableRow(headerCells, indent), formatMarkdownTableRow(delimiterCells, indent)];
  const remainingCells = nextCells.slice(columnCount);
  while (remainingCells.length) {
    if (remainingCells.length > columnCount && !remainingCells[0] && remainingCells.length % columnCount !== 0) {
      remainingCells.shift();
      continue;
    }
    const rowCells = remainingCells.splice(0, columnCount);
    if (rowCells.some((cell) => String(cell || '').trim())) {
      lines.push(formatMarkdownTableRow(rowCells, indent));
    }
  }

  return lines;
}

function expandInlineMarkdownTableRows(line) {
  const source = String(line || '');
  if (!/\|\s*:?-{3,}:?\s*\|/.test(source)) {
    return [source];
  }

  const firstPipeIndex = source.indexOf('|');
  if (firstPipeIndex < 0) {
    return [source];
  }

  const prefix = source.slice(0, firstPipeIndex);
  const isIndentedTableLine = /^\s*$/.test(prefix);
  const tableText = source.slice(firstPipeIndex).trim();
  const tableRows = tableText
    .replace(/\|\s+\|/g, '|\n|')
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean);

  if (isIndentedTableLine) {
    return tableRows.map((row) => `${prefix}${row}`);
  }

  return [prefix.trimEnd(), ...tableRows];
}

function normalizeMarkdownTablesForDocx(content) {
  const expandedLines = String(content || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap(expandInlineMarkdownTableRows);
  const lines = [];

  for (let index = 0; index < expandedLines.length; index += 1) {
    const line = expandedLines[index];
    const nextLine = expandedLines[index + 1] || '';
    const compressedTableRows = expandCompressedMarkdownTableRows(line, nextLine);
    const startsCompressedTable = Boolean(compressedTableRows);
    const startsTable = isMarkdownTableRowLine(line) && isMarkdownTableDelimiterLine(nextLine);
    const previousLine = lines[lines.length - 1] || '';

    if ((startsTable || startsCompressedTable) && previousLine.trim() && !isMarkdownTableRowLine(previousLine)) {
      lines.push('');
    }
    if (compressedTableRows) {
      lines.push(...compressedTableRows);
      index += 1;
      continue;
    }
    lines.push(line);
  }

  return lines.join('\n');
}

function normalizeMarkdownListMarkersForDocx(content) {
  return String(content || '').split('\n').map((line) => {
    const match = line.match(/^(\s*)[•●○◦▪▫■□◆◇‣➢➤✓✔✧–－]\s+(.*)$/u);
    if (!match) return line;
    return `${match[1]}- ${match[2]}`;
  }).join('\n');
}

function createListReference(context, ordered) {
  const bodyStyle = context.exportFormat?.body_text || {};
  if (!ordered && bodyStyle.list_style === 'none') {
    return null;
  }
  if (!context.numberingReferences) {
    context.numberingReferences = [];
  }
  context.numberingIndex = (context.numberingIndex || 0) + 1;
  const reference = `${NUMBERING_REFERENCE_PREFIX}-${context.numberingIndex}`;
  context.numberingReferences.push({
    reference,
    ordered,
    unorderedListStyle: bodyStyle.list_style || 'disc',
    orderedListStyle: bodyStyle.ordered_list_style || 'decimal-dot',
    listIndentChars: typeof bodyStyle.list_indent_chars === 'number' ? bodyStyle.list_indent_chars : 2,
    bodyRunFont: context.bodyRunFont || '宋体',
    bodyRunSize: context.bodyRunSize || 24,
    // Numbering needs different indents inside and outside frames; each list has its own reference, so record its location at creation.
    framePadding: chapterFramePaddingTwips(context),
  });
  return reference;
}

function createOrderedListReference(context) {
  return createListReference(context, true);
}

function createUnorderedListReference(context) {
  return createListReference(context, false);
}

function headingLevel(level) {
  if (level <= 1) return HeadingLevel.HEADING_1;
  if (level === 2) return HeadingLevel.HEADING_2;
  if (level === 3) return HeadingLevel.HEADING_3;
  if (level === 4) return HeadingLevel.HEADING_4;
  if (level === 5) return HeadingLevel.HEADING_5;
  return HeadingLevel.HEADING_6;
}

// ── Export formatting helpers ────────────────────────────

const SIZE_TO_HALF_PT = {
  '初号': 84, '小初': 72, '一号': 52, '小一': 48, '二号': 44, '小二': 36,
  '三号': 32, '小三': 30, '四号': 28, '小四': 24, '五号': 21, '小五': 18,
  '六号': 15, '小六': 13,
};

function chineseSizeToHalfPt(sizeName) {
  return SIZE_TO_HALF_PT[sizeName] || 24;
}

function charsToTwips(chars, bodySizeHalfPt = 24) {
  const safeChars = Math.max(0, Number(chars) || 0);
  const safeHalfPt = Math.max(1, Number(bodySizeHalfPt) || 24);
  return Math.round(safeChars * safeHalfPt * 10);
}

function cmToTwips(cm) {
  return Math.round((cm || 0) * 567);
}

function alignmentToWordType(align) {
  const map = {
    '居中对齐': AlignmentType.CENTER,
    '两端对齐': AlignmentType.JUSTIFIED,
    '左对齐': AlignmentType.LEFT,
    '右对齐': AlignmentType.RIGHT,
  };
  return map[align] || AlignmentType.JUSTIFIED;
}

function numberToChinese(num) {
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const tens = ['', '十', '二十', '三十', '四十', '五十', '六十', '七十', '八十', '九十'];
  const n = Math.max(1, Math.min(9999, Math.floor(Number(num) || 1)));
  if (n <= 9) return digits[n];
  if (n <= 19) return `十${n === 10 ? '' : digits[n - 10]}`;
  if (n <= 99) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return `${tens[t]}${o ? digits[o] : ''}`;
  }
  if (n <= 999) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return `${digits[h]}百${r === 0 ? '' : r <= 9 ? `零${digits[r]}` : r <= 19 ? `一${numberToChinese(r)}` : numberToChinese(r)}`;
  }
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  return `${digits[th]}千${r === 0 ? '' : r < 100 ? `零${numberToChinese(r)}` : numberToChinese(r)}`;
}

function numberToCircled(num) {
  const circled = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
  return circled[num - 1] || String(num);
}

function numberToAlpha(num, upper = false) {
  let n = Math.max(1, Math.floor(Number(num) || 1));
  let value = '';
  while (n > 0) {
    n -= 1;
    value = String.fromCharCode(97 + (n % 26)) + value;
    n = Math.floor(n / 26);
  }
  return upper ? value.toUpperCase() : value;
}

function numberToRoman(num, upper = false) {
  let n = Math.max(1, Math.min(3999, Math.floor(Number(num) || 1)));
  const pairs = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
    [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let value = '';
  pairs.forEach(([amount, symbol]) => {
    while (n >= amount) {
      value += symbol;
      n -= amount;
    }
  });
  return upper ? value.toUpperCase() : value;
}

function outlineNumberParts(number) {
  return String(number || '')
    .split('.')
    .map((part) => parseInt(part, 10))
    .filter((part) => Number.isFinite(part) && part > 0);
}

function formatOutlineNumber(number, headingStyle) {
  const parts = outlineNumberParts(number);
  if (!parts.length) return '';

  if (headingStyle?.numbering_format === 'outline-decimal') {
    return parts.join('.');
  }

  if (headingStyle?.numbering_format !== 'custom') return '';

  const lastPart = parts[parts.length - 1];
  const cn = numberToChinese(lastPart);
  const tail = (parts.length >= 3 ? parts.slice(2) : [lastPart]).join('.');
  return String(headingStyle.numbering_template || '')
    .replace(/\{tail(\d+)\}/g, (_, level) => {
      const startLevel = Number(level);
      if (!Number.isFinite(startLevel) || startLevel < 1 || startLevel > 6 || startLevel > parts.length) return '';
      return parts.slice(startLevel - 1).join('.');
    })
    .replace(/\{zh\}/g, cn)
    .replace(/\{num\}/g, String(lastPart))
    .replace(/\{tail\}/g, tail)
    .replace(/\{full\}/g, parts.join('.'))
    .replace(/\{circled\}/g, numberToCircled(lastPart))
    .replace(/\{alpha\}/g, numberToAlpha(lastPart))
    .replace(/\{ALPHA\}/g, numberToAlpha(lastPart, true))
    .replace(/\{roman\}/g, numberToRoman(lastPart))
    .replace(/\{ROMAN\}/g, numberToRoman(lastPart, true))
    .trim();
}

function shouldInsertSpaceAfterNumber(prefix) {
  return !/[、，。；：）)】\]》〉]$/.test(prefix);
}

function formatOutlineTitle(number, title, headingStyle) {
  const prefix = formatOutlineNumber(number, headingStyle);
  if (!prefix) return String(title || '');
  return `${prefix}${shouldInsertSpaceAfterNumber(prefix) ? ' ' : ''}${title || ''}`;
}

function getHeadingStyle(exportFormat, level) {
  const headings = (exportFormat && Array.isArray(exportFormat.headings)) ? exportFormat.headings : [];
  const idx = Math.min(level - 1, 5);
  return headings[idx] || null;
}

function usesNativeHeadingNumbering(headingStyle) {
  return false;
}

function imageTypeFromMime(mime) {
  if (!mime) return null;
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('bmp')) return 'bmp';
  if (mime.includes('webp')) return 'webp';
  return null;
}

function imageTypeFromPath(filePath) {
  const ext = path.extname(filePath || '').toLowerCase().replace('.', '');
  if (ext === 'jpeg') return 'jpg';
  return ['png', 'jpg', 'gif', 'bmp', 'webp'].includes(ext) ? ext : null;
}

function describeImageSourceForLog(source) {
  const value = String(source || '').trim();
  if (!value) return { kind: 'empty' };
  if (/^data:/i.test(value)) return { kind: 'data-url' };
  try {
    const url = new URL(value);
    if (url.protocol === 'savia-asset:') {
      return { kind: 'asset', host: url.hostname, extension: path.extname(url.pathname || '').toLowerCase() };
    }
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return { kind: 'remote', protocol: url.protocol.replace(':', ''), host: url.hostname, extension: path.extname(url.pathname || '').toLowerCase() };
    }
    if (url.protocol === 'file:') {
      return { kind: 'local-file-url', extension: path.extname(url.pathname || '').toLowerCase() };
    }
    return { kind: 'url', protocol: url.protocol.replace(':', '') };
  } catch {
    return { kind: path.isAbsolute(value) ? 'local-path' : 'relative-path', extension: path.extname(value).toLowerCase() };
  }
}

function normalizeImageForDocx(loaded) {
  if (!loaded?.buffer || !loaded.type) {
    return loaded;
  }

  if (loaded.type !== 'webp') {
    return loaded;
  }

  const image = nativeImage?.createFromBuffer ? nativeImage.createFromBuffer(loaded.buffer) : null;
  if (!image || image.isEmpty()) {
    throw new Error(pickLocaleMessage(detectLocaleFromConfig(), 'WebP 图片转换失败', 'Error al convertir la imagen WebP', 'WebP image conversion failed'));
  }

  return { buffer: image.toPNG(), type: 'png' };
}

function resolveAssetImagePath(url) {
  if (!app?.getPath) return null;

  const assetUrl = new URL(url);
  const assetRoots = {
    'generated-images': getGeneratedImagesDir(app),
    'imported-images': getImportedImagesDir(app),
  };
  const rootDir = assetRoots[assetUrl.hostname];
  if (!rootDir) return null;

  const relativePath = decodeURIComponent(assetUrl.pathname.replace(/^\/+/, ''));
  if (!relativePath) return null;

  const baseDir = path.resolve(rootDir);
  const resolvedPath = path.resolve(baseDir, relativePath);
  if (resolvedPath !== baseDir && !resolvedPath.startsWith(`${baseDir}${path.sep}`)) {
    return null;
  }

  return resolvedPath;
}

async function loadImage(source, context = {}) {
  const url = String(source || '').trim();
  if (!url) return null;
  if (context.resolveImage) {
    const resolved = await context.resolveImage(url);
    if (resolved !== undefined) return resolved;
  }

  const dataUrlMatch = /^data:([^;,]+);base64,(.+)$/i.exec(url);
  if (dataUrlMatch) {
    return {
      buffer: Buffer.from(dataUrlMatch[2], 'base64'),
      type: imageTypeFromMime(dataUrlMatch[1]),
    };
  }

  if (new RegExp("^(?:savia|__BRAND_SLUG__)-asset:\\/\\/".replaceAll('__BRAND_SLUG__', brand.slug), "i").test(url)) {
    const assetPath = resolveAssetImagePath(url);
    if (!assetPath || !fs.existsSync(assetPath)) {
      return null;
    }

    return {
      buffer: fs.readFileSync(assetPath),
      type: imageTypeFromPath(assetPath),
    };
  }

  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(pickLocaleMessage(detectLocaleFromConfig(), `图片下载失败：${url}`, `Error al descargar la imagen: ${url}`, `Image download failed: ${url}`));
    }
    const type = imageTypeFromMime(response.headers.get('content-type')) || imageTypeFromPath(new URL(url).pathname);
    return { buffer: Buffer.from(await response.arrayBuffer()), type };
  }

  const fileUrlPrefix = 'file://';
  const rawPath = url.startsWith(fileUrlPrefix) ? fileURLToPath(url) : url;
  const resolvedPath = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(context.baseDir || process.cwd(), rawPath);

  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  return {
    buffer: fs.readFileSync(resolvedPath),
    type: imageTypeFromPath(resolvedPath),
  };
}

async function loadImageWithRetry(source, context = {}, options = {}) {
  const retryAttempts = Math.max(0, Number(options.retryAttempts) || 0);
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 0);
  let attempt = 0;

  while (attempt <= retryAttempts) {
    try {
      return await loadImage(source, context);
    } catch (error) {
      if (attempt >= retryAttempts) {
        throw error;
      }

      attempt += 1;
      if (typeof options.onRetry === 'function') {
        options.onRetry(attempt, error);
      }
      if (retryDelayMs > 0) {
        await delay(retryDelayMs);
      }
    }
  }

  return null;
}

async function imageRunFromNode(node, context, options = {}) {
  let loaded = null;
  const imageLabel = compactText(node.alt || node.url || (context.locale === 'es' ? 'imagen sin nombre' : context.locale === 'en' ? 'unnamed image' : '未知图片'));
  const imageIndex = (context.imageCount || 0) + 1;
  context.imageCount = imageIndex;
  writeExportLog(context, 'export.image.started', {
    image_index: imageIndex,
    label: imageLabel,
    source: describeImageSourceForLog(node.url),
  });
  try {
    loaded = await loadImageWithRetry(node.url, context, options.loadRetry);
  } catch (error) {
    const message = context.locale === 'es' ? `No se pudo exportar la imagen: ${imageLabel}; no se pudo cargar.` : context.locale === 'en' ? `Could not export image: ${imageLabel}; it could not be loaded.` : `图片无法导出：${imageLabel}，${compactText(error.message || '下载失败', 120)}`;
    addWarning(context, message);
    writeExportLog(context, 'export.image.error', {
      image_index: imageIndex,
      label: imageLabel,
      phase: 'load',
      error: compactLogError(error),
    });
    return textRun(`[${message}]`, { color: 'C83220' });
  }
  if (!loaded?.buffer || !loaded.type) {
    const message = context.locale === 'es' ? `No se pudo exportar la imagen: ${imageLabel}; no se encontraron datos válidos.` : context.locale === 'en' ? `Could not export image: ${imageLabel}; valid image data was not found.` : `图片无法导出：${imageLabel}，未找到可用图片数据`;
    addWarning(context, message);
    writeExportLog(context, 'export.image.error', {
      image_index: imageIndex,
      label: imageLabel,
      phase: 'load',
      reason: 'missing_image_data',
    });
    return textRun(`[${message}]`, { color: 'C83220' });
  }

  try {
    loaded = normalizeImageForDocx(loaded);
  } catch (error) {
    const message = context.locale === 'es' ? `No se pudo exportar la imagen: ${imageLabel}; falló la conversión del formato.` : context.locale === 'en' ? `Could not export image: ${imageLabel}; format conversion failed.` : `图片无法导出：${imageLabel}，${error.message || '图片格式转换失败'}`;
    addWarning(context, message);
    writeExportLog(context, 'export.image.error', {
      image_index: imageIndex,
      label: imageLabel,
      phase: 'normalize',
      source_type: loaded.type,
      error: compactLogError(error),
    });
    return textRun(`[${message}]`, { color: 'C83220' });
  }

  let size;
  try {
    size = imageSize(loaded.buffer);
  } catch (error) {
    const message = context.locale === 'es' ? `No se pudo exportar la imagen: ${imageLabel}; no se pudo leer su tamaño.` : context.locale === 'en' ? `Could not export image: ${imageLabel}; its dimensions could not be read.` : `图片无法导出：${imageLabel}，图片尺寸识别失败`;
    addWarning(context, message);
    writeExportLog(context, 'export.image.error', {
      image_index: imageIndex,
      label: imageLabel,
      phase: 'size',
      type: loaded.type,
      bytes: loaded.buffer.length,
      error: compactLogError(error),
    });
    return textRun(`[${message}]`, { color: 'C83220' });
  }
  const sourceWidth = size.width || MAX_IMAGE_WIDTH;
  const sourceHeight = size.height || Math.round(MAX_IMAGE_WIDTH * 0.62);
  const maxWidth = getImageMaxWidth(context);
  const maxHeight = getImageMaxHeight(context);
  const ratio = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * ratio));
  const height = Math.max(1, Math.round(sourceHeight * ratio));
  context.imageSuccessCount = (context.imageSuccessCount || 0) + 1;
  writeExportLog(context, 'export.image.completed', {
    image_index: imageIndex,
    label: imageLabel,
    type: loaded.type,
    bytes: loaded.buffer.length,
    source_width: sourceWidth,
    source_height: sourceHeight,
    max_width: maxWidth,
    max_height: maxHeight,
    scale_ratio: ratio,
    output_width: width,
    output_height: height,
  });

  return new ImageRun({
    type: loaded.type,
    data: loaded.buffer,
    transformation: { width, height },
    altText: {
      title: cleanText(node.alt || '图片'),
      description: cleanText(node.alt || node.url || 'Markdown 图片'),
      name: cleanText(node.alt || 'image'),
    },
  });
}

async function imageParagraphFromSource(source, alt, context, options = {}) {
  return paragraph([await imageRunFromNode({ url: source, alt }, context, options)], getImageParagraphOptions(context));
}

function isHtmlBrNode(node) {
  return node?.type === 'tag' && htmlTagName(node) === 'br';
}

function htmlInlineGroupHasContent($, nodes = []) {
  return nodes.some((node) => {
    if (!node) return false;
    if (node.type === 'text') return Boolean(String(node.data || '').trim());
    if (node.type === 'tag') return htmlTagName(node) !== 'br' || Boolean($(node).text().trim());
    return false;
  });
}

function splitHtmlInlineNodesByBreaks($, nodes = []) {
  const groups = [];
  let current = [];
  let hasBreak = false;

  for (const node of nodes) {
    if (isHtmlBrNode(node)) {
      hasBreak = true;
      groups.push(current);
      current = [];
      continue;
    }
    current.push(node);
  }
  groups.push(current);

  if (!hasBreak) return [nodes];
  return groups.filter((group) => htmlInlineGroupHasContent($, group));
}

function htmlTagName(node) {
  return String(node?.name || '').toLowerCase();
}

function hasBlockHtmlChildren($, node) {
  return $(node).contents().toArray().some((child) => ['table', 'ul', 'ol', 'blockquote', 'pre', 'div', 'section', 'article', 'img', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(htmlTagName(child)));
}

async function htmlInlineRuns($, nodes = [], context = {}, marks = {}) {
  // Use body styling as the base, overridden by explicit caller font/size.
  if (context.bodyRunFont && !('font' in marks)) {
    marks = { font: context.bodyRunFont, ...marks };
  }
  if (context.bodyRunSize && !('size' in marks)) {
    marks = { size: context.bodyRunSize, ...marks };
  }
  const runs = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      runs.push(...textRunsWithBreaks(node.data || '', marks));
      continue;
    }

    if (node.type !== 'tag') {
      continue;
    }

    const tag = htmlTagName(node);
    if (tag === 'br') {
      runs.push(lineBreakRun());
    } else if (tag === 'strong' || tag === 'b') {
      runs.push(...await htmlInlineRuns($, $(node).contents().toArray(), context, { ...marks, bold: true }));
    } else if (tag === 'em' || tag === 'i') {
      runs.push(...await htmlInlineRuns($, $(node).contents().toArray(), context, { ...marks, italics: true }));
    } else if (tag === 'del' || tag === 's' || tag === 'strike') {
      runs.push(...await htmlInlineRuns($, $(node).contents().toArray(), context, { ...marks, strike: true }));
    } else if (tag === 'code') {
      runs.push(new TextRun({ text: cleanText($(node).text()), font: 'Consolas', size: 22, color: '155BD7' }));
    } else if (tag === 'a') {
      const href = $(node).attr('href') || '';
      const children = await htmlInlineRuns($, $(node).contents().toArray(), context, { ...marks, color: '2174FD', underline: true });
      if (href) {
        runs.push(new ExternalHyperlink({ link: href, children }));
      } else {
        runs.push(...children);
      }
    } else if (tag === 'img') {
      runs.push(await imageRunFromNode({ url: $(node).attr('src'), alt: $(node).attr('alt') || 'HTML 图片' }, context));
    } else if (tag === 'input' && String($(node).attr('type') || '').toLowerCase() === 'checkbox') {
      runs.push(textRun($(node).attr('checked') == null ? '☐ ' : '☑ ', { ...marks, font: 'Segoe UI Symbol' }));
    } else {
      if (!['p', 'span', 'label', 'small', 'sub', 'sup', 'mark'].includes(tag)) {
        addUnsupportedHtmlWarning(context, tag);
      }
      runs.push(...await htmlInlineRuns($, $(node).contents().toArray(), context, marks));
    }
  }

  return runs;
}

async function htmlTableToDocx($, tableNode, context) {
  const rows = [];
  const captionNode = $(tableNode).children('caption').first();
  const rowDescriptors = $(tableNode).find('tr').toArray().map((rowNode) => {
    const cells = $(rowNode).children('th,td').toArray().map((cellNode) => ({
      node: cellNode,
      columnSpan: normalizeColumnSpan($(cellNode).attr('colspan')),
    }));
    return {
      cells,
      columnCount: cells.reduce((sum, cell) => sum + cell.columnSpan, 0),
    };
  }).filter((row) => row.cells.length);
  const maxColumns = Math.max(1, ...rowDescriptors.map((row) => row.columnCount));

  for (const [rowIndex, row] of rowDescriptors.entries()) {
    const cells = [];
    for (const [cellIndex, cell] of row.cells.entries()) {
      const cellNode = cell.node;
      const isHeader = rowIndex === 0 || htmlTagName(cellNode) === 'th';
      const isFirstColumn = !isHeader && cellIndex === 0;
      const cellStyle = getTableCellStyle(context, { isHeader, isFirstColumn });
      const remainingSpan = cellIndex === row.cells.length - 1 ? maxColumns - row.columnCount : 0;
      cells.push(createTableCell({
        children: [paragraph(
          await htmlInlineRuns($, $(cellNode).contents().toArray(), context, tableCellRunMarks(cellStyle)),
          tableCellParagraphOptions(cellStyle, context),
        )],
        context,
        isHeader,
        isFirstColumn,
        columnSpan: cell.columnSpan + Math.max(0, remainingSpan),
        totalColumns: maxColumns,
      }));
    }
    rows.push(new TableRow({ children: cells }));
  }

  if (!rows.length) {
    return [];
  }

  const blocks = [];
  const captioned = Boolean(captionNode.length && cleanText(captionNode.text()));
  if (captioned) {
    blocks.push(paragraph(
      await htmlInlineRuns($, captionNode.contents().toArray(), context, tableCaptionRunMarks(context)),
      tableCaptionParagraphOptions(context),
    ));
  }
  blocks.push(createDocxTable(rows, maxColumns, context, captioned));
  return blocks;
}

function buildListParagraphOptions(context, reference, level, options = {}) {
  // Numbering owns left indentation when defined; manually indented lists position themselves with hanging indents. Neither should add frame padding again.
  const paragraphOptions = reference
    ? { ...chapterFrameParagraphOptions(context, { list: true }), numbering: { reference, level } }
    : { ...chapterFrameParagraphOptions(context, { list: true }) };
  if (!reference && options.manualListIndent) {
    const indent = getManualUnorderedListLevelIndent(context, level);
    if (indent) paragraphOptions.indent = indent;
  } else if (!reference && options.manualIndent) {
    const indent = getTaskListLevelIndent(context, level);
    if (indent) paragraphOptions.indent = indent;
  }
  paragraphOptions.spacing = context.bodySpacing;
  if (context.bodyAlignment) paragraphOptions.alignment = context.bodyAlignment;
  return paragraphOptions;
}

function isWhitespaceHtmlTextNode(node) {
  return node?.type === 'text' && !String(node.data || '').trim();
}

function isCheckboxInputNode($, node) {
  return htmlTagName(node) === 'input' && String($(node).attr('type') || '').toLowerCase() === 'checkbox';
}

function hasClassName($, node, className) {
  return String($(node).attr('class') || '').split(/\s+/).includes(className);
}

function isTaskListItem($, itemNode, inlineNodes = []) {
  if (hasClassName($, itemNode, 'task-list-item')) return true;
  return inlineNodes.some((node) => {
    if (isCheckboxInputNode($, node)) return true;
    return htmlTagName(node) === 'p' && $(node).children('input[type="checkbox"]').length > 0;
  });
}

async function htmlListToDocx($, listNode, context, options = {}) {
  const blocks = [];
  const ordered = htmlTagName(listNode) === 'ol';
  const unorderedListWithoutMarker = !ordered && context.bodyListStyle === 'none';
  let numberingReference = null;
  const listItems = $(listNode).children('li').toArray();

  for (const itemNode of listItems) {
    const inlineNodes = $(itemNode).contents().toArray()
      .filter((child) => !['ul', 'ol'].includes(htmlTagName(child)))
      .filter((child) => !isWhitespaceHtmlTextNode(child));
    const isTaskItem = isTaskListItem($, itemNode, inlineNodes);
    if (!isTaskItem && numberingReference == null && !unorderedListWithoutMarker) {
      numberingReference = ordered ? createOrderedListReference(context) : createUnorderedListReference(context);
    }
    const listOptions = buildListParagraphOptions(
      context,
      isTaskItem ? null : numberingReference,
      Math.min(options.listLevel || 0, 2),
      { manualIndent: isTaskItem, manualListIndent: !isTaskItem && unorderedListWithoutMarker },
    );
    blocks.push(paragraph(await htmlInlineRuns($, inlineNodes, context), listOptions));

    for (const childList of $(itemNode).children('ul,ol').toArray()) {
      blocks.push(...await htmlListToDocx($, childList, context, { ...options, listLevel: (options.listLevel || 0) + 1 }));
    }
  }

  return blocks;
}

/** Extract body paragraph options from context for HTML paragraphs. */
function buildHtmlBodyParaOpts(context) {
  const opts = { ...chapterFrameParagraphOptions(context), spacing: context.bodySpacing };
  if (context.bodyAlignment) opts.alignment = context.bodyAlignment;
  if (context.bodyIndent) opts.indent = context.bodyIndent;
  return opts;
}

/** Convert in-content headings while continuing the current chapter frame. */
async function htmlHeadingToDocxBlocks($, node, context) {
  const mdLevel = Math.min(Math.max(parseInt(htmlTagName(node).slice(1), 10) || 1, 1), 6);
  const style = getHeadingStyle(context.exportFormat, mdLevel);
  const headingOpts = {
    ...chapterFrameParagraphOptions(context, {
      heading: true,
      topLine: true,
      bottomLine: context.chapterFrame?.headingBottomBorderEnabled,
      fill: context.chapterFrame?.fills[mdLevel - 1],
    }),
    heading: headingLevel(mdLevel),
    before: style ? style.spacing_before_pt * 20 : (mdLevel === 1 ? 280 : 180),
    after: style ? style.spacing_after_pt * 20 : 120,
    indent: { left: 0, right: 0, firstLine: 0, hanging: 0 },
  };
  if (style) {
    headingOpts.alignment = alignmentToWordType(style.alignment);
    if (style.line_spacing) {
      headingOpts.line = 240 * style.line_spacing;
    }
  }
  const runMarks = {};
  if (style) {
    runMarks.font = style.font || '黑体';
    runMarks.size = chineseSizeToHalfPt(style.size || '小四');
    runMarks.bold = false;
  } else {
    runMarks.bold = true;
  }
  return [paragraph(await htmlInlineRuns($, $(node).contents().toArray(), context, runMarks), headingOpts)];
}

async function htmlNodeToDocxBlocks($, node, context, options = {}) {
  if (node.type === 'text') {
    const text = String(node.data || '').trim();
    if (!text) return [];
    const runOpts = {};
    if (context.bodyRunFont) runOpts.font = context.bodyRunFont;
    if (context.bodyRunSize) runOpts.size = context.bodyRunSize;
    const paraOpts = buildHtmlBodyParaOpts(context);
    return [paragraph([textRun(text, runOpts)], paraOpts)];
  }

  if (node.type !== 'tag') {
    return [];
  }

  const tag = htmlTagName(node);
  if (/^h[1-6]$/.test(tag)) {
    return htmlHeadingToDocxBlocks($, node, context);
  }
  if (tag === 'table') {
    return htmlTableToDocx($, node, context);
  }
  if (tag === 'img') {
    return [await imageParagraphFromSource($(node).attr('src'), $(node).attr('alt') || 'HTML 图片', context)];
  }
  if (tag === 'ul' || tag === 'ol') {
    return htmlListToDocx($, node, context, options);
  }
  if (tag === 'blockquote') {
    const text = String($(node).text() || '').trim();
    if (context.feasibility && text.includes('📸') && (text.includes('【插图指引】') || text.includes('[Guía de ilustración]'))) {
      return buildDocxImageGuidanceBox($, node, context);
    }
    // Blockquotes inside frames relinquish their left indent and quote border, since either shifts the left edge away from frame padding
    // and breaks the vertical line. Shading alone sufficiently distinguishes quotes from body text.
    const framed = chapterFrameParagraphOptions(context);
    return [paragraph(await htmlInlineRuns($, $(node).contents().toArray(), context, { color: '536176' }), {
      ...framed,
      indent: framed.frameIndent ? undefined : { left: 360 },
      border: framed.border || { left: { style: BorderStyle.SINGLE, size: 12, color: '2174FD' } },
      shading: { type: ShadingType.CLEAR, fill: 'F6F9FF' },
    })];
  }
  if (tag === 'pre') {
    // Like quotes, framed code blocks use shading for distinction and delegate horizontal indentation to frame padding to keep vertical borders aligned.
    const framedPre = chapterFrameParagraphOptions(context);
    return [paragraph([new TextRun({ text: cleanText($(node).text()), font: 'Consolas', size: 21, color: '243048' })], {
      ...framedPre,
      shading: { type: ShadingType.CLEAR, fill: 'F6F9FF' },
      indent: framedPre.frameIndent ? undefined : { left: 260, right: 260 },
    })];
  }
  if (tag === 'br') {
    return [paragraph([lineBreakRun()])];
  }
  if (tag === 'hr') {
    return [paragraph([textRun('────────────────────────', { color: 'DCDFF6' })], {
      ...chapterFrameParagraphOptions(context),
      alignment: AlignmentType.CENTER,
    })];
  }
  if (['div', 'section', 'article'].includes(tag) && hasBlockHtmlChildren($, node)) {
    return htmlNodesToDocxBlocks($, $(node).contents().toArray(), context, options);
  }
  if (tag === 'p' && hasBlockHtmlChildren($, node)) {
    return htmlNodesToDocxBlocks($, $(node).contents().toArray(), context, options);
  }
  if (['p', 'div', 'section', 'article', 'span', 'strong', 'b', 'em', 'i', 'del', 's', 'strike', 'a', 'code', 'label', 'small', 'sub', 'sup', 'mark'].includes(tag)) {
    const isFigureCaption = /^图[:：]/.test($(node).text().trim());
    if (isFigureCaption) {
      return [paragraph([textRun($(node).text().trim(), getCaptionRunMarks(context))], getCaptionParagraphOptions(context))];
    }
    const htmlParaOpts = buildHtmlBodyParaOpts(context);
    const groups = splitHtmlInlineNodesByBreaks($, $(node).contents().toArray());
    const paragraphs = [];
    for (const [index, group] of groups.entries()) {
      const paraOpts = { ...htmlParaOpts };
      if (groups.length > 1 && index < groups.length - 1) {
        paraOpts.spacing = { ...paraOpts.spacing, after: 0, afterLines: 0 };
      }
      if (index > 0) {
        paraOpts.spacing = { ...paraOpts.spacing, before: 0, beforeLines: 0 };
      }
      paragraphs.push(paragraph(await htmlInlineRuns($, group, context), paraOpts));
    }
    return paragraphs;
  }

  addUnsupportedHtmlWarning(context, tag);
  return htmlNodesToDocxBlocks($, $(node).contents().toArray(), context, options);
}

async function htmlNodesToDocxBlocks($, nodes = [], context = {}, options = {}) {
  const blocks = [];
  for (const node of nodes) {
    blocks.push(...await htmlNodeToDocxBlocks($, node, context, options));
  }
  return blocks;
}

async function htmlToDocxBlocks(html, context = {}, options = {}) {
  const source = String(html || '').trim();
  if (!source) {
    return [];
  }

  const $ = cheerio.load(source, null, false);
  const blocks = await htmlNodesToDocxBlocks($, $.root().contents().toArray(), context, options);
  if (!blocks.length) {
    addWarning(context, context.locale === 'es' ? 'Una parte del HTML no pudo exportarse; revisa el documento Word.' : '部分 HTML 内容未能导出，请核对 Word 内容。');
  }
  return blocks;
}

async function markdownToDocxBlocks(content, context = {}) {
  const markdown = normalizeMarkdownTablesForDocx(normalizeMarkdownListMarkersForDocx(content));
  const html = await renderMarkdownHtml(markdown, { allowRawHtml: true, enableGfm: true });
  return htmlToDocxBlocks(html, context);
}

async function addMarkdownContent(children, content, context) {
  children.push(...await markdownToDocxBlocks(content, context));
}

const FEASIBILITY_ACCENT = '1A5F7A';
const FEASIBILITY_TABLE_WIDTH = 9000;

function readFeasibilityExportContext(payload, locale) {
  const options = payload?.feasibility_options;
  if (!options || typeof options !== 'object') return null;
  const projectInfo = options.project_info && typeof options.project_info === 'object' ? options.project_info : {};
  return {
    options,
    projectInfo,
    locale,
    includeCover: options.includeCover !== false,
    includeNotes: options.includePreparationNotes !== false,
    includeAppendix: options.includeAppendixTables !== false,
  };
}

function formatFeasibilityYearMonth(date = new Date()) {
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月`;
}

function displayFeasibilityAppendixValue(value) {
  const text = String(value || '').trim();
  return text || '—';
}

function buildFeasibilityTableCell(text, options = {}) {
  const colWidth = options.width || Math.floor(FEASIBILITY_TABLE_WIDTH / (options.columnCount || 4));
  return new TableCell({
    children: [paragraph(
      [textRun(text, {
        bold: options.header === true,
        size: options.header ? 20 : 19,
        color: options.header ? 'FFFFFF' : '333333',
      })],
      { alignment: AlignmentType.CENTER, after: 40 },
    )],
    shading: options.header ? { fill: FEASIBILITY_ACCENT, type: ShadingType.CLEAR } : undefined,
    width: { size: colWidth, type: WidthType.DXA },
  });
}

function buildFeasibilityTableRow(values, options = {}) {
  const columnCount = values.length;
  return new TableRow({
    cantSplit: true,
    tableHeader: options.header ? true : undefined,
    children: values.map((value) => buildFeasibilityTableCell(value, { ...options, columnCount })),
  });
}

function buildFeasibilityNativeTable(header, rows) {
  return new Table({
    width: { size: FEASIBILITY_TABLE_WIDTH, type: WidthType.DXA },
    rows: [buildFeasibilityTableRow(header, { header: true }), ...rows.map((row) => buildFeasibilityTableRow(row))],
  });
}

function buildDocxImageGuidanceBox($, node, context) {
  const es = context.locale === 'es';
  const fullText = String($(node).text() || '').trim();
  const titleMatch = fullText.match(/(?:📸\s*)?((?:【[^】]+】|\[Guía de ilustración\])[^\n*]*)/);
  const titleText = titleMatch ? (es ? titleMatch[1].trim().replace('【插图指引】', '[Guía de ilustración]') : titleMatch[1].trim()) : (es ? '[Guía de ilustración]' : '【插图指引】：此处建议插入工程项目图纸/照片');
  let descText = fullText
    .replace(/📸\s*/g, '')
    .replace(/(?:📸\s*)?(?:【[^】]+】|\[Guía de ilustración\])[^\n*]*/g, '')
    .replace(/^\s*[*_说明：:\s]*/g, '')
    .trim();
  if (!descText) {
    descText = es ? 'Añade aquí la ilustración o el diagrama correspondiente.' : '此处请插入相关的工程效果图、现场实景照片、总平面布置图、工艺流程示意图或实施进度甘特图。';
  }

  const cell = new TableCell({
    children: [
      paragraph([
        textRun('📸 ', { font: 'Segoe UI Emoji', size: 21 }),
        textRun(titleText, { bold: true, size: 21, color: FEASIBILITY_ACCENT }),
      ], { after: 100, alignment: AlignmentType.LEFT }),
      paragraph([
        textRun(es ? `Formato sugerido: horizontal 16:9 y centrado. Descripción: ${descText}` : `规格建议：横版 16:9 / 建议居中排版 插图说明：${descText}`, { size: 18, color: '475569', italics: true }),
      ], { after: 60, alignment: AlignmentType.LEFT }),
    ],
    shading: { fill: 'F0F6FF', type: ShadingType.CLEAR },
    margins: { top: 120, bottom: 120, left: 200, right: 200 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: 'C7DCEA' },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C7DCEA' },
      left: { style: BorderStyle.SINGLE, size: 18, color: FEASIBILITY_ACCENT },
      right: { style: BorderStyle.SINGLE, size: 6, color: 'C7DCEA' },
    },
  });

  return [
    new Table({
      width: { size: FEASIBILITY_TABLE_WIDTH, type: WidthType.DXA },
      rows: [new TableRow({ children: [cell], cantSplit: true })],
    }),
    paragraph([textRun('', { size: 12 })], { after: 150 }),
  ];
}

const FEASIBILITY_ENGLISH = {
  "Informe de viabilidad": "Feasibility report",
  "[Pendiente por completar]": "[Pending completion]",
  "Sin clasificación indicada": "Classification not specified",
  "Rol de elaboración": "Preparation role",
  "Nombre": "Name",
  "Profesión / cargo": "Profession / position",
  "Firma / estado de revisión": "Signature / review status",
  "Responsable del proyecto": "Project lead",
  "Responsable de revisión técnica": "Technical reviewer",
  "Revisor principal": "Lead reviewer",
  "Responsable del informe": "Report author",
  "1. Notas sobre la elaboración del informe": "1. Report preparation notes",
  "2. Verifica y documenta las fuentes, normas y datos aplicables al proyecto antes de presentar el informe.": "2. Verify and document the sources, standards and project data before submitting the report.",
  "2. Responsables de la elaboración": "2. Preparation team",
  "Indicador": "Indicator",
  "Valor / contenido": "Value / content",
  "Unidad": "Unit",
  "Observaciones": "Notes",
  "Nombre del proyecto": "Project name",
  "Nombre completo": "Full name",
  "Entidad responsable": "Responsible entity",
  "Entidad solicitante": "Applicant",
  "Ubicación": "Location",
  "Zona de ejecución": "Project area",
  "Alcance": "Scope",
  "Capacidad o área": "Capacity or area",
  "Plazo de ejecución": "Construction period",
  "años": "years",
  "Ejecución y puesta en marcha": "Construction and commissioning",
  "Periodo de operación": "Operating period",
  "Periodo evaluado": "Evaluation period",
  "Inversión estimada": "Estimated investment",
  "—": "—",
  "Verifica qué conceptos incluye el valor": "Verify what the amount includes",
  "Fuente de financiación": "Funding source",
  "Capital y financiación": "Capital and financing",
  "Anexos del informe de viabilidad": "Feasibility report appendices",
  "Anexo 1: datos básicos del proyecto": "Appendix 1: project overview"
};

function buildFeasibilityCoverParagraphs(payload, feasibility) {
  const { options, projectInfo } = feasibility;
  const es = feasibility.locale === 'es';
  const en = feasibility.locale === 'en';
  const t = (zh, spanish) => es ? spanish : en ? (FEASIBILITY_ENGLISH[spanish] || spanish) : zh;
  const projectName = String(payload.project_name || projectInfo.projectName || t('项目可行性研究报告', 'Informe de viabilidad')).trim();
  const constructionUnit = String(projectInfo.constructionUnit || '').trim();
  const preparationUnit = String(options.preparationUnit || constructionUnit || t('可行性研究报告编制中心', '[Pendiente por completar]')).trim();
  const documentCode = String(options.documentCode || '').trim();
  return [
    paragraph(
      [textRun(String(options.securityLevel || '').trim() || t('内部资料 / 普通', 'Sin clasificación indicada'), { bold: true, size: 20, color: '666666' })],
      { alignment: AlignmentType.RIGHT, after: 600 },
    ),
    paragraph(
      [textRun(projectName, { bold: true, size: 40, color: FEASIBILITY_ACCENT })],
      { alignment: AlignmentType.CENTER, after: 300 },
    ),
    paragraph(
      [textRun(t('可行性研究报告', 'Informe de viabilidad'), { bold: true, size: 32, color: '333333' })],
      { alignment: AlignmentType.CENTER, after: 600 },
    ),
    paragraph(
      [textRun(es ? `Sector: ${String(projectInfo.industry || '').trim() || '[Pendiente por completar]'}` : en ? `Industry: ${String(projectInfo.industry || '').trim() || '[Pending completion]'}` : `（所属行业：${String(projectInfo.industry || '').trim() || '国家标准大纲'}）`, { italics: true, size: 22, color: '666666' })],
      { alignment: AlignmentType.CENTER, after: 2000 },
    ),
    paragraph(
      [textRun(es ? `Entidad responsable: ${constructionUnit || '[Pendiente por completar]'}` : en ? `Responsible entity: ${constructionUnit || '[Pending completion]'}` : `项目建设单位：${constructionUnit}`, { size: 24, bold: true })],
      { alignment: AlignmentType.CENTER, after: 180 },
    ),
    paragraph(
      [textRun(es ? `Elaborado por: ${preparationUnit}` : en ? `Prepared by: ${preparationUnit}` : `报告编制单位：${preparationUnit}`, { size: 24 })],
      { alignment: AlignmentType.CENTER, after: 180 },
    ),
    paragraph(
      [textRun(es ? `Código del documento: ${documentCode || '[Pendiente por completar]'}` : en ? `Document code: ${documentCode || '[Pending completion]'}` : `文档识别编号：${documentCode}`, { size: 22, color: '666666' })],
      { alignment: AlignmentType.CENTER, after: 180 },
    ),
    paragraph(
      [textRun(es ? `Fecha de elaboración: ${new Intl.DateTimeFormat('es-CO', {year:'numeric',month:'long'}).format(new Date())}` : en ? `Prepared: ${new Intl.DateTimeFormat('en', {year:'numeric',month:'long'}).format(new Date())}` : `编制出版日期：${formatFeasibilityYearMonth()}`, { size: 22, color: '666666' })],
      { alignment: AlignmentType.CENTER, after: 400 },
    ),
    pageBreakParagraph(),
  ];
}

function buildFeasibilityNotesParagraphs(payload, feasibility) {
  const { projectInfo } = feasibility;
  const es = feasibility.locale === 'es';
  const en = feasibility.locale === 'en';
  const t = (zh, spanish) => es ? spanish : en ? (FEASIBILITY_ENGLISH[spanish] || spanish) : zh;
  const projectName = String(payload.project_name || projectInfo.projectName || '').trim();
  const signatureTable = buildFeasibilityNativeTable(
    [t('编制角色', 'Rol de elaboración'), t('人员姓名', 'Nombre'), t('专业职称 / 职务', 'Profesión / cargo'), t('签章 / 审核状态', 'Firma / estado de revisión')],
    [
      [t('项目总负责人', 'Responsable del proyecto'), '', '', ''],
      [t('技术审定人', 'Responsable de revisión técnica'), '', '', ''],
      [t('主要校核人', 'Revisor principal'), '', '', ''],
      [t('报告主编人', 'Responsable del informe'), '', '', ''],
    ],
  );

  return [
    paragraph([textRun(t('一、可行性研究报告编制说明', '1. Notas sobre la elaboración del informe'), { bold: true, size: 28, color: FEASIBILITY_ACCENT })], { after: 200 }),
    paragraph(
      [textRun(es ? `1. Este informe reúne la información disponible para evaluar el proyecto «${projectName}».` : en ? `1. This report brings together the available information to evaluate the project “${projectName}”.` : `1. 本可行性研究报告系针对“${projectName}”项目进行全面技术、经济、社会与生态可行性论证而编制。`, { size: 22 })],
      { after: 150 },
    ),
    paragraph(
      [textRun(t('2. 编制依据包括国家发改委《投资项目可行性研究报告编写指南》、行业技术规范、项目单位提供的原始资料以及现场调研数据。', '2. Verifica y documenta las fuentes, normas y datos aplicables al proyecto antes de presentar el informe.'), { size: 22 })],
      { after: 300 },
    ),
    paragraph([textRun(t('二、项目编制人员责任签发表', '2. Responsables de la elaboración'), { bold: true, size: 28, color: FEASIBILITY_ACCENT })], { after: 200 }),
    signatureTable,
    paragraph([textRun('', { size: 20 })], { after: 400 }),
    pageBreakParagraph(),
  ];
}

function buildFeasibilityAppendixParagraphs(feasibility) {
  const { projectInfo } = feasibility;
  const es = feasibility.locale === 'es';
  const en = feasibility.locale === 'en';
  const t = (zh, spanish) => es ? spanish : en ? (FEASIBILITY_ENGLISH[spanish] || spanish) : zh;
  const constructionPeriod = String(projectInfo.constructionPeriodYears || '').trim();
  const operationPeriod = String(projectInfo.operationPeriodYears || '').trim();
  const table = buildFeasibilityNativeTable(
    [t('指标名称', 'Indicador'), t('数值 / 内容', 'Valor / contenido'), t('单位', 'Unidad'), t('备注说明', 'Observaciones')],
    [
      [t('项目名称', 'Nombre del proyecto'), displayFeasibilityAppendixValue(projectInfo.projectName), '—', t('立项全称', 'Nombre completo')],
      [t('建设单位', 'Entidad responsable'), displayFeasibilityAppendixValue(projectInfo.constructionUnit), '—', t('申报主体', 'Entidad solicitante')],
      [t('建设地点', 'Ubicación'), displayFeasibilityAppendixValue(projectInfo.location), '—', t('建设区域', 'Zona de ejecución')],
      [t('建设规模', 'Alcance'), displayFeasibilityAppendixValue(projectInfo.constructionContent), '—', t('产能/建设面积', 'Capacidad o área')],
      [t('建设工期', 'Plazo de ejecución'), constructionPeriod ? es ? `${constructionPeriod} años` : en ? `${constructionPeriod} years` : `${constructionPeriod} 年` : '—', constructionPeriod ? t('年', 'años') : '—', t('施工与调试', 'Ejecución y puesta en marcha')],
      [t('运营期限', 'Periodo de operación'), operationPeriod ? es ? `${operationPeriod} años` : en ? `${operationPeriod} years` : `${operationPeriod} 年` : '—', operationPeriod ? t('年', 'años') : '—', t('运营评价期', 'Periodo evaluado')],
      [t('估算总投资', 'Inversión estimada'), displayFeasibilityAppendixValue(projectInfo.totalInvestment), t('万元', '—'), t('含建设投资及流动资金', 'Verifica qué conceptos incluye el valor')],
      [t('资金来源', 'Fuente de financiación'), displayFeasibilityAppendixValue(projectInfo.fundingSource), '—', t('资本金及融资结构', 'Capital y financiación')],
    ],
  );

  return [
    pageBreakParagraph(),
    paragraph([textRun(t('可研报告附表汇总', 'Anexos del informe de viabilidad'), { bold: true, size: 30, color: FEASIBILITY_ACCENT })], { after: 300 }),
    paragraph([textRun(t('附表 1：项目基本情况汇总表', 'Anexo 1: datos básicos del proyecto'), { bold: true, size: 24, color: '333333' })], { after: 150 }),
    table,
    paragraph([textRun('', { size: 18 })], { after: 300 }),
  ];
}

/** Generate outline heading paragraphs from heading styles and numbering settings. */
function buildOutlineHeadingParagraph(item, context, level) {
  const style = getHeadingStyle(context.exportFormat, level);
  const nativeHeadingNumbering = usesNativeHeadingNumbering(style);
  const title = exportGeneratedOutlineTitle(item.title, context.locale, style);
  const displayTitle = nativeHeadingNumbering ? title : formatOutlineTitle(item.number, title, style);

  const runOptions = { bold: false };
  if (style) {
    runOptions.font = style.font || '黑体';
    runOptions.size = chineseSizeToHalfPt(style.size || '小四');
    runOptions.bold = style.bold === true;
    runOptions.color = normalizeDocxColor(style.text_color || '#243048', '243048');
  } else {
    runOptions.bold = true;
  }

  const paraOptions = {
    // Framed headings draw bottom borders according to the template; body text has vertical borders only.
    ...chapterFrameParagraphOptions(context, {
      heading: true,
      topLine: true,
      bottomLine: context.chapterFrame?.headingBottomBorderEnabled,
      fill: context.chapterFrame?.fills[Math.max(0, Math.min(level - 1, 5))],
    }),
    heading: headingLevel(level),
    // Keep headings associated with following content, retaining this flag across rows inside chapter frames.
    keepNext: true,
    pageBreakBefore: level === 1 && isLevel1PageBreakEnabled(context.exportFormat) && !context.sectionStart,
    alignment: style ? alignmentToWordType(style.alignment) : undefined,
    before: style ? style.spacing_before_pt * 20 : (level === 1 ? 320 : 200),
    after: style ? style.spacing_after_pt * 20 : 120,
    line: style ? 240 * (style.line_spacing || 1) : undefined,
  };
  paraOptions.indent = { left: 0, right: 0, firstLine: 0, hanging: 0 };
  // paragraph() adds frameIndent to the indentation above.
  if (nativeHeadingNumbering) {
    context.usesHeadingNumbering = true;
    paraOptions.numbering = { reference: HEADING_NUMBERING_REFERENCE, level: Math.min(level - 1, 5) };
  }

  return paragraph([textRun(displayTitle, runOptions)], paraOptions);
}

/** Flatten the outline and compute styling scope; apply the template to parent headings only when every descendant is AI-generated. */
function collectOutlineExportEntries(items, aiOnly, level = 1, prefix = '') {
  return (items || []).flatMap((source, index) => {
    const number = prefix ? `${prefix}.${index + 1}` : String(index + 1);
    const item = { ...source, number };
    const descendants = collectOutlineExportEntries(item.children, aiOnly, level + 1, number);
    const useTemplate = !aiOnly || (descendants.length
      ? descendants.every((entry) => entry.useTemplate)
      : item.content_mode === 'ai-generate');
    return [{
      item,
      level,
      useTemplate,
      // Shared parent headings in mixed outlines keep base styling but follow the first child's page to avoid isolated heading pages.
      sectionTemplate: descendants[0]?.sectionTemplate ?? useTemplate,
    }, ...descendants];
  });
}

/** Switch body styles and clear direct indentation/alignment from the previous scope; retain shared conversion counters and numbering. */
function applyExportFormatContext(context, exportFormat) {
  const bodyStyle = exportFormat?.body_text;
  context.exportFormat = exportFormat;
  context.bodyRunFont = bodyStyle?.font || '宋体';
  context.bodyRunSize = chineseSizeToHalfPt(bodyStyle?.size || '小四');
  context.bodySpacing = buildBodyParagraphSpacing(bodyStyle || {});
  context.bodyListStyle = bodyStyle?.list_style || 'disc';
  context.bodyOrderedListStyle = bodyStyle?.ordered_list_style || 'decimal-dot';
  context.bodyListIndentChars = bodyStyle?.list_indent_chars ?? 2;
  context.bodyAlignment = bodyStyle ? alignmentToWordType(bodyStyle.alignment) : undefined;
  context.bodyIndent = bodyStyle?.first_line_indent_chars > 0
    ? { firstLine: charsToTwips(bodyStyle.first_line_indent_chars, context.bodyRunSize) }
    : undefined;
}

/** Adjacent same-scope outline nodes share a section; close chapter frames at chapter and scope boundaries, keeping body and tables top-level. */
async function addOutlineItems(ranges, items, context) {
  let range = ranges[ranges.length - 1];
  for (const entry of collectOutlineExportEntries(items, context.aiOnly)) {
    if (context.chapterFrame && (entry.level === 1 || !entry.useTemplate || range.useTemplate !== entry.sectionTemplate)) {
      range.children.push(chapterFrameClosingParagraph(context));
      context.chapterFrame = null;
    }
    if (range.useTemplate !== entry.sectionTemplate) {
      range = { useTemplate: entry.sectionTemplate, children: [] };
      ranges.push(range);
    }
    const format = entry.useTemplate ? context.templateFormat : context.basicFormat;
    if (context.exportFormat !== format) applyExportFormatContext(context, format);
    if (entry.useTemplate && !context.chapterFrame) context.chapterFrame = getChapterFrameConfig(format);
    context.sectionStart = range.children.length === 0;
    await addOutlineItem(range.children, entry.item, context, entry.level);
  }
  if (context.chapterFrame) {
    range.children.push(chapterFrameClosingParagraph(context));
    context.chapterFrame = null;
  }
}

/** Output one outline heading and leaf content; shared scope traversal handles child nodes. */
async function addOutlineItem(children, item, context, level) {
  children.push(buildOutlineHeadingParagraph(item, context, level));

  if (item.children?.length) return;

  if (String(item.content || '').trim()) {
    await addMarkdownContent(children, item.content, context);
  } else {
    const pendingParagraph = buildPendingContentModeParagraph(item, context);
    if (pendingParagraph) children.push(pendingParagraph);
  }
  context.convertedLeafCount = (context.convertedLeafCount || 0) + 1;
  reportConversionProgress(context, context.locale === 'es' ? `Se procesaron ${context.convertedLeafCount}/${context.stats?.leafCount || context.convertedLeafCount} secciones.` : `已处理 ${context.convertedLeafCount}/${context.stats?.leafCount || context.convertedLeafCount} 个正文小节。`);
}

function createHeadingNumberingConfig() {
  return {
    reference: HEADING_NUMBERING_REFERENCE,
    levels: [0, 1, 2, 3, 4, 5].map((level) => ({
      level,
      format: LevelFormat.DECIMAL,
      start: 1,
      text: Array.from({ length: level + 1 }, (_, index) => `%${index + 1}`).join('.'),
      alignment: AlignmentType.START,
      suffix: LevelSuffix.TAB,
      style: {
        paragraph: {
          indent: { left: 360 + level * 360, hanging: 360 },
        },
      },
    })),
  };
}

function getOrderedListWordStyle(style) {
  return ORDERED_LIST_WORD_STYLES[style] || ORDERED_LIST_WORD_STYLES['decimal-dot'];
}

/**
 * Indentation for manual lists without numbering definitions.
 *
 * Inside frames, match numbering rules (getListLevelIndent): fix left to frame padding and use firstLine for levels,
 * aligning left borders in Word and previews; outside frames retain plain left indentation.
 */
function buildManualListIndent(context, textIndentTwips) {
  const padding = chapterFramePaddingTwips(context);
  if (padding > 0) {
    return textIndentTwips > 0 ? { left: padding, firstLine: textIndentTwips } : { left: padding };
  }
  return textIndentTwips > 0 ? { left: textIndentTwips } : null;
}

function getTaskListLevelIndent(context, level) {
  const bodyStyle = context.exportFormat?.body_text || {};
  const safeLevel = Math.max(0, Math.min(Number(level) || 0, 2));
  const listIndentChars = typeof bodyStyle.list_indent_chars === 'number' ? bodyStyle.list_indent_chars : 2;
  return buildManualListIndent(
    context,
    Math.round(charsToTwips(listIndentChars, context.bodyRunSize || 24) * safeLevel),
  );
}

function getManualUnorderedListLevelIndent(context, level) {
  const safeLevel = Math.max(0, Math.min(Number(level) || 0, 2));
  const listIndentChars = typeof context.bodyListIndentChars === 'number' ? context.bodyListIndentChars : 2;
  return buildManualListIndent(
    context,
    Math.round(charsToTwips(listIndentChars, context.bodyRunSize || 24) * (safeLevel + 1)),
  );
}

/**
 * Numbering-level indentation, matching C# RestrictedHtmlDocumentRenderer ListLevelIndent.
 *
 * Inside frames use first-line indentation: left stays at frame padding and firstLine represents depth.
 * Every block's left border must align, but Word anchors it at the leftmost character including hanging numbering
 * (left - hanging), whereas the preview anchors it at w:ind left. Nonzero hanging inevitably misaligns one engine.
 * firstLine moves only the first line without moving either border, aligning both.
 * The tradeoff is that wrapped text returns to the frame's inner edge instead of aligning after the number.
 */
function getListLevelIndent(referenceConfig, level) {
  const baseIndent = charsToTwips(referenceConfig.listIndentChars, referenceConfig.bodyRunSize);
  const text = Math.round(baseIndent * (level + 1));
  const padding = referenceConfig.framePadding || 0;
  if (padding > 0) return { left: padding, firstLine: text };
  return { left: text, hanging: Math.min(text, charsToTwips(1, referenceConfig.bodyRunSize)) };
}

function createListNumberingLevel(referenceConfig, level) {
  const ordered = referenceConfig.ordered === true;
  const orderedStyle = getOrderedListWordStyle(referenceConfig.orderedListStyle);
  const marker = UNORDERED_LIST_MARKERS[referenceConfig.unorderedListStyle] || UNORDERED_LIST_MARKERS.disc;
  const markerSize = Math.max(1, Math.round((referenceConfig.bodyRunSize || 24) * (marker.sizeScale || 1)));
  return {
    level,
    format: ordered ? orderedStyle.format : LevelFormat.BULLET,
    text: ordered ? orderedStyle.text(level) : marker.text,
    alignment: AlignmentType.START,
    suffix: LevelSuffix.TAB,
    style: {
      run: {
        font: ordered ? (referenceConfig.bodyRunFont || '宋体') : marker.font,
        size: ordered ? (referenceConfig.bodyRunSize || 24) : markerSize,
      },
      paragraph: {
        indent: getListLevelIndent(referenceConfig, level),
      },
    },
  };
}

function createNumberingConfig(context) {
  const references = context.numberingReferences || [];
  if (!references.length && !context.usesHeadingNumbering) {
    return undefined;
  }

  const config = [];
  if (context.usesHeadingNumbering) {
    config.push(createHeadingNumberingConfig());
  }
  config.push(...references.map((referenceConfig) => ({
    reference: referenceConfig.reference,
    levels: [0, 1, 2].map((level) => createListNumberingLevel(referenceConfig, level)),
  })));

  return {
    config,
  };
}

function buildHeadingParagraphStyles(exportFormat) {
  const styles = [];
  const names = ['Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6'];
  const ids = ['Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6'];

  for (let i = 0; i < 6; i += 1) {
    const style = getHeadingStyle(exportFormat, i + 1);
    if (!style) {
      styles.push({
        id: ids[i],
        name: names[i],
        basedOn: 'Normal',
        run: { bold: false },
        paragraph: { spacing: { before: 200, after: 120 } },
      });
      continue;
    }

    const halfPt = chineseSizeToHalfPt(style.size);
    const lineSpacing = 240 * (style.line_spacing || 1);
    styles.push({
      id: ids[i],
      name: names[i],
      basedOn: 'Normal',
      run: {
        font: style.font || 'SimHei',
        size: halfPt,
        bold: false,
      },
      paragraph: {
        spacing: {
          before: (style.spacing_before_pt || 10) * 20,
          after: (style.spacing_after_pt || 10) * 20,
          line: lineSpacing,
        },
        alignment: alignmentToWordType(style.alignment),
        indent: { left: 0, right: 0, firstLine: 0, hanging: 0 },
      },
    });
  }

  return styles;
}

async function buildDocxResult(payload, options = {}) {
  if (options.locale === 'es' && payload?.feasibility_options && Array.isArray(payload.outline)) {
    const copyItems = items => items.map(item => {
      const copy = { ...item };
      for (const key of ['title', 'description', 'content']) {
        if (typeof copy[key] === 'string') copy[key] = normalizePendingMarkers(copy[key]);
      }
      if (Array.isArray(copy.children)) copy.children = copyItems(copy.children);
      return copy;
    });
    const exportFormat = localizeExportFormat(payload.export_format, options.locale);
    payload = { ...payload, outline: copyItems(payload.outline), export_format: exportFormat };
  }
  if (options.locale === 'en' && payload?.feasibility_options) payload = { ...payload, export_format: localizeExportFormat(payload.export_format, 'en') };
  // Margins and decorations share geometry; load the shared module before later synchronous access.
  await loadChromeModule();
  const exportFormat = (payload && payload.export_format) || null;
  // Technical-plan projects explicitly supply scope; other export workflows retain their complete templates.
  const aiOnly = payload.export_template_scope === 'ai-only';
  const pageSetup = exportFormat?.page || null;
  const pageMarginCm = resolveWordPageMargins(pageSetup);
  const basicFormat = {
    page: Object.fromEntries([
      'paper_size', 'orientation', 'two_column',
      'margin_top_cm', 'margin_bottom_cm', 'margin_left_cm', 'margin_right_cm',
    ].map((key) => [key, pageSetup?.[key]])),
  };
  const stats = countOutlineStats(payload.outline || []);
  const context = {
    baseDir: payload.base_dir || payload.baseDir,
    resolveImage: options.resolveImage,
    quietWarnings: options.quietWarnings === true,
    onProgress: options.onProgress,
    warnings: options.warnings || [],
    stats,
    convertedLeafCount: 0,
    imageCount: 0,
    imageSuccessCount: 0,
    numberingReferences: [],
    numberingIndex: 0,
    usesHeadingNumbering: false,
    unsupportedHtmlTags: new Set(),
    developerLogger: options.developerLogger,
    locale: options.locale,
    exportFormat,
    templateFormat: exportFormat,
    basicFormat,
    aiOnly,
    // Keep body dimensions consistent across scopes; images must not recalculate height for undecorated pages.
    pageMargins: pageMarginCm,
    feasibility: readFeasibilityExportContext(payload, options.locale),
  };
  writeExportLog(context, 'export.docx.build.started', {
    stats,
    content_metrics: countOutlineContentMetrics(payload.outline || []),
  });

  // In AI-only mode, document defaults keep base formatting and templates apply directly to selected paragraphs to prevent inheritance leakage.
  applyExportFormatContext(context, aiOnly ? basicFormat : exportFormat);
  const bodyFont = context.bodyRunFont;
  const bodySizeHalfPt = context.bodyRunSize;

  const children = [];
  const ranges = [{ useTemplate: !aiOnly, children }];
  const feasibility = context.feasibility;
  if (feasibility?.includeCover) {
    children.push(...buildFeasibilityCoverParagraphs(payload, feasibility));
  } else {
    children.push(
      paragraph([textRun(options.locale === 'es' ? 'Contenido generado con IA' : options.locale === 'en' ? 'AI-generated content' : '内容由 AI 生成', { italics: true, size: 18 })], { alignment: AlignmentType.CENTER, after: 120 }),
      paragraph([textRun(payload.project_name || (options.locale === 'es' ? (feasibility ? 'Informe de viabilidad' : 'Oferta técnica') : (feasibility ? '可行性研究报告' : '投标技术文件')), { bold: true, size: 34 })], { alignment: AlignmentType.CENTER, after: 300 }),
    );
  }
  if (feasibility?.includeNotes) {
    children.push(...buildFeasibilityNotesParagraphs(payload, feasibility));
  }

  reportProgress(context, 10, context.locale === 'es' ? 'Preparando el contenido para exportar.' : '准备导出正文。');
  await addOutlineItems(ranges, payload.outline || [], context);
  if (feasibility?.includeAppendix) {
    ranges[ranges.length - 1].children.push(...buildFeasibilityAppendixParagraphs(feasibility));
  }
  reportProgress(context, 90, context.locale === 'es' ? 'Generando encabezados, pies de página y archivo Word.' : '正在生成页眉页脚与 Word 文件。');

  // Page settings.
  const pageMargin = pageSetup ? {
    top: cmToTwips(pageMarginCm.top),
    bottom: cmToTwips(pageMarginCm.bottom),
    left: cmToTwips(pageMarginCm.left),
    right: cmToTwips(pageMarginCm.right),
    header: cmToTwips(pageMarginCm.header),
    footer: cmToTwips(pageMarginCm.footer),
  } : { top: 1440, right: 1440, bottom: 1440, left: 1440, footer: cmToTwips(1.75) };

  // Paper dimensions and orientation.
  const pageSizeConfig = {};
  if (pageSetup && pageSetup.paper_size) {
    const dims = PAPER_DIMENSIONS_MM[pageSetup.paper_size];
    if (dims) {
      const isLandscape = pageSetup.orientation === 'landscape';
      pageSizeConfig.size = {
        width: mmToTwips(dims.width),
        height: mmToTwips(dims.height),
        orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
      };
    }
  }

  // Split headers/footers by scope; set page-number start only at the document beginning and continue numbering in later sections.
  const pageNumberEnabled = isPageNumberEnabled(pageSetup);
  const pageNumberStart = Math.max(1, Math.floor(Number(pageSetup ? pageSetup.page_number_start : 1) || 1));
  const numbering = createNumberingConfig(context);
  const headingStyles = buildHeadingParagraphStyles(aiOnly ? null : exportFormat);
  const columnCount = resolveColumnCount(pageSetup);
  const firstTemplateRange = ranges.findIndex((range) => range.useTemplate);
  const sections = [];
  for (const [index, range] of ranges.entries()) {
    const firstPageDifferent = index === firstTemplateRange && pageSetup?.first_page_different === true;
    const sectionPageSetup = pageSetup ? { ...pageSetup, first_page_different: firstPageDifferent } : null;
    const headers = range.useTemplate ? await buildWordHeaders(sectionPageSetup) : undefined;
    const footers = range.useTemplate ? await buildWordFooters(sectionPageSetup) : undefined;
    sections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          margin: range.useTemplate ? pageMargin : { ...pageMargin, header: 0, footer: 0 },
          ...pageSizeConfig,
          ...(index === 0 && firstTemplateRange >= 0 && pageNumberEnabled
            ? { pageNumbers: { start: pageNumberStart } }
            : {}),
        },
        ...(columnCount > 1
          ? { column: { count: columnCount, space: SECTION_COLUMN_SPACE_TWIPS, equalWidth: true } }
          : {}),
        titlePage: firstPageDifferent,
      },
      // Do not omit empty headers/footers, or Word inherits the previous section's decorations and PAGE fields.
      headers: headers || { default: emptyHeader() },
      footers: footers || { default: emptyFooter() },
      children: range.children,
    });
  }
  const doc = new Document({
    ...(numbering ? { numbering } : {}),
    styles: {
      default: {
        document: {
          run: { font: bodyFont, size: bodySizeHalfPt },
          // Set body spacing per paragraph and keep document defaults on auto so fixed line spacing does not leak into headings or headers/footers.
          paragraph: { spacing: { line: 240, before: 0, after: 0, lineRule: 'auto' } },
        },
      },
      paragraphStyles: headingStyles,
    },
    sections,
  });

  const buffer = await Packer.toBuffer(doc);
  writeExportLog(context, 'export.docx.build.completed', {
    stats,
    warning_count: context.warnings.length,
    converted_leaf_count: context.convertedLeafCount,
    image_count: context.imageCount,
    image_success_count: context.imageSuccessCount,
    image_failure_count: Math.max(0, context.imageCount - context.imageSuccessCount),
    buffer_bytes: buffer.length,
  });
  return { buffer, warnings: context.warnings, stats };
}

async function buildDocxBuffer(payload, options = {}) {
  const result = await buildDocxResult(payload, options);
  return result.buffer;
}

/** Preserve source image extensions; if the helper cannot identify file headers, embed the original using the extension-declared type. */
function imageExtensionFromSource(source) {
  const dataUrl = /^data:([^;,]+)/i.exec(source);
  if (dataUrl) return mime.extension(dataUrl[1]) || '';
  return path.extname(source.split(/[?#]/)[0]).slice(1).toLowerCase();
}

/**
 * Non-AI nodes still read existing Markdown and reuse image parsing.
 * Replace individual image-read failures with text in place and record reasons in context.imageFailures; export other content normally.
 */
async function renderMarkdownForRestrictedHtml(content, assets, context) {
  const $ = cheerio.load(require('../utils/saviaMarkup.cjs').normalizeSaviaMarkup(await renderMarkdownHtml(content, { allowRawHtml: true, enableGfm: true })), null, false);
  for (const img of $('img').toArray()) {
    const source = $(img).attr('src') || '';
    const agentReference = $(img).attr('data-sv-asset-ref') || '';
    const alt = $(img).attr('alt') || '';
    let loaded;
    try {
      const resolved = context.resolveImage ? await context.resolveImage({ kind: agentReference ? 'agent' : 'url', reference: agentReference || source }) : undefined;
      loaded = resolved === undefined ? await loadImage(source, context) : resolved;
      loaded = loaded?.type === 'webp' && context.convertWebp
        ? { buffer: await context.convertWebp(loaded.buffer), type: 'png' }
        : normalizeImageForDocx(loaded);
      if (!loaded?.buffer?.length) throw new Error(pickLocaleMessage(detectLocaleFromConfig(), '图片文件不存在或为空', 'El archivo de imagen no existe o está vacío', 'Image file does not exist or is empty'));
    } catch (error) {
      context.imageFailures.push(error.message);
      const notice = $('<em>').text(context.locale === 'es' ? (alt ? `[No se pudo exportar la imagen: ${alt}]` : '[No se pudo exportar la imagen]') : (alt ? `[图片无法导出：${alt}]` : '[图片无法导出]'));
      if ($(img).parent().is('p') && $(img).parent().contents().length === 1) $(img).parent().replaceWith($('<p>').append(notice));
      else $(img).replaceWith(notice);
      continue;
    }
    const ref = `export-images/${assets.size}.${loaded.type || imageExtensionFromSource(source) || 'png'}`;
    assets.set(ref, loaded.buffer);
    if ($(img).closest('figure').length) { $(img).replaceWith($('<img>').attr('data-sv-asset-ref', ref)); continue; }
    const figure = $('<figure data-sv-size="wide" data-sv-fit="contain"></figure>');
    figure.append($('<img>').attr('data-sv-asset-ref', ref));
    if ($(img).attr('alt')) figure.append($('<figcaption>').text($(img).attr('alt')));
    // Block-level figures cannot sit inside Markdown images' default paragraph wrappers.
    if ($(img).parent().is('p') && $(img).parent().contents().length === 1) $(img).parent().replaceWith(figure);
    else $(img).replaceWith(figure);
  }
  return $.html();
}

function createExportService({ configStore, openXmlHelperService, getTechnicalPlanExport } = {}) {
  return {
    // Check technical-plan content before export; pass issues to the original content task and end this export attempt.
    async exportWord(payload = {}, onProgress) {
      const locale = detectLocaleFromConfig(configStore);
      const msg = (zh, es, en) => locale === 'es' ? es : locale === 'en' ? en : zh;
      const technicalExport = payload.source === 'technical-plan' ? getTechnicalPlanExport?.() : null;
      if (payload.source === 'technical-plan') {
        if (!technicalExport) throw new Error(pickLocaleMessage(detectLocaleFromConfig(configStore), '本地数据库尚未就绪', 'La base de datos local aún no está lista', 'Local database is not ready yet'));
        payload = technicalExport.prepare({ exportFormat: payload.export_format });
      }
      const stats = countOutlineStats(Array.isArray(payload.outline) ? payload.outline : []);
      const developerLogger = createDeveloperLogger({
        app,
        config: loadDeveloperConfig(configStore),
        moduleName: 'export',
        name: 'word-export',
        meta: {
          project_name: sanitizeFilename(payload.project_name || '投标技术文件'),
          stats,
        },
      });
      developerLogger.write('export.word.started', {
        project_name: sanitizeFilename(payload.project_name || '投标技术文件'),
        stats,
        content_metrics: countOutlineContentMetrics(Array.isArray(payload.outline) ? payload.outline : []),
      });
      if (!payload.template_html && (!Array.isArray(payload.outline) || !payload.outline.length)) {
        const error = new Error(msg('没有可导出的目录内容', 'No hay contenido para exportar.', 'There is no content to export.'));
        developerLogger.write('export.word.error', { error: compactLogError(error) });
        throw error;
      }

      const progressContext = { onProgress, warnings: [], stats };
      reportProgress(progressContext, 2, msg('正在准备 Word 导出。', 'Preparando la exportación a Word.', 'Preparing Word export.'));
      // Send issues to the original content task for repair; do not open the save dialog or convert Word during this attempt.
      if (technicalExport) {
        const issues = technicalExport.inspect(payload);
        if (issues.length) {
          developerLogger.write('export.word.structure_issues', {
            section_count: issues.length,
            issue_count: issues.reduce((sum, item) => sum + item.problems.length, 0),
          });
          technicalExport.repair(issues);
          return { success: false, message: msg(`发现 ${issues.length} 个问题小节，已交给正文 Agent 修复。请在正文任务结束后重新导出。`, `Se encontraron problemas en ${issues.length} secciones y se enviaron al agente para corregirlos. Vuelve a exportar cuando termine.`, `Problems in ${issues.length} sections were sent to the agent for repair. Export again when it finishes.`) };
        }
      }
      const defaultFilename = `${sanitizeFilename(payload.project_name || (payload.feasibility_options ? msg('可行性研究报告', 'Informe de viabilidad', 'Feasibility report') : msg('标书文档', 'Oferta', 'Bid')))}_${formatExportTimestamp()}.docx`;
      const defaultDir = app?.getPath ? app.getPath('downloads') : process.env.USERPROFILE || process.cwd();
      const result = await dialog.showSaveDialog({
        title: msg('导出 Word 文档', 'Exportar documento Word', 'Export Word document'),
        defaultPath: path.join(defaultDir, defaultFilename),
        filters: [{ name: msg('Word 文档', 'Documento Word', 'Word document'), extensions: ['docx'] }],
      });

      if (result.canceled || !result.filePath) {
        reportProgress(progressContext, 0, msg('已取消导出。', 'Exportación cancelada.', 'Export canceled.'), { phase: 'canceled' });
        developerLogger.write('export.word.canceled', { stats });
        return { success: false, canceled: true, message: msg('已取消导出', 'Exportación cancelada', 'Export canceled') };
      }

      try {
        const warnings = [];
        // Template samples reuse the preview generator without joining preview request coalescing; always use this export's settings.
        const buildResult = technicalExport
          ? await technicalExport.build(payload, { onProgress, stats, developerLogger, locale })
          : payload.template_html
          ? {
            buffer: Buffer.from((await openXmlHelperService.createRestrictedHtmlDocx(payload.template_html, payload.export_format)).bytes),
            warnings,
            stats,
          }
          : await buildDocxResult(payload, { onProgress, warnings, developerLogger, locale });
        reportProgress({ onProgress, warnings: buildResult.warnings, stats: buildResult.stats }, 96, msg('正在写入 Word 文件。', 'Guardando el documento Word.', 'Saving the Word document.'));
        developerLogger.write('export.word.write.started', {
          output_file_name: path.basename(result.filePath),
          output_extension: path.extname(result.filePath).toLowerCase(),
          buffer_bytes: buildResult.buffer.length,
        });
        fs.writeFileSync(result.filePath, buildResult.buffer);
        const message = buildResult.message || (buildResult.warnings.length
          ? msg(`Word 已导出，但有 ${buildResult.warnings.length} 处图片未能插入，请打开文档核对。`, `Word exportado con ${buildResult.warnings.length} advertencias; revisa el documento.`, `Word exported with ${buildResult.warnings.length} warnings; review the document.`)
          : msg('Word 已导出，请打开文档核对图片、表格和版式。', 'Word exportado. Revisa el contenido y el formato.', 'Word exported. Review the content and formatting.'));
        reportProgress({ onProgress, warnings: buildResult.warnings, stats: buildResult.stats }, 100, message, { phase: 'success' });
        developerLogger.write('export.word.completed', {
          output_file_name: path.basename(result.filePath),
          output_extension: path.extname(result.filePath).toLowerCase(),
          buffer_bytes: buildResult.buffer.length,
          warning_count: buildResult.warnings.length,
          stats: buildResult.stats,
        });
        return { success: true, path: result.filePath, message, warnings: buildResult.warnings };
      } catch (error) {
        developerLogger.write('export.word.error', {
          output_file_name: path.basename(result.filePath),
          output_extension: path.extname(result.filePath).toLowerCase(),
          error: compactLogError(error),
        });
        throw error;
      }
    },
  };
}

module.exports = {
  buildDocxBuffer,
  buildDocxResult,
  createExportService,
  collectOutlineExportEntries,
  getPendingContentModeMessage,
  renderMarkdownForRestrictedHtml,
};

// Run this file standalone to verify native spacing, chapter frames, and styling scopes without accessing user files.
if (require.main === module) {
  const assert = require('node:assert/strict');
  const AdmZip = require('adm-zip');
  for (const [mode, value, line, rule] of [
    ['single', 9, 240, 'auto'], ['one-and-half', 9, 360, 'auto'], ['double', 9, 480, 'auto'],
    ['multiple', 1.2, 288, 'auto'], ['at-least', 18, 360, 'atLeast'], ['exact', 24, 480, 'exact'],
  ]) {
    const result = buildBodyParagraphSpacing({ line_spacing_mode: mode, line_spacing_value: value });
    assert.equal(result.line, line);
    assert.equal(result.lineRule, rule);
  }
  const spacing = buildBodyParagraphSpacing({ spacing_before: 0.5, spacing_after: 6, spacing_after_unit: 'pt' });
  assert.equal(spacing.beforeLines, 50);
  assert.equal(spacing.after, 120);
  assert.equal(spacing.afterLines, undefined);
  // Chapter frames: paragraphs draw vertical borders, body indentation adds padding to existing indentation, and table side borders use frame colors.
  const frameContext = {
    chapterFrame: { color: 'CFD8EE', headingTopBorderSpacePt: 5, headingBottomBorderSpacePt: 4, headingBottomBorderEnabled: true, fills: ['EEF5FF'] },
    exportFormat: { table: { full_width: false } },
  };
  const framed = paragraph([textRun('正文')], {
    ...chapterFrameParagraphOptions(frameContext),
    indent: { left: 200, right: 0, firstLine: 480 },
  });
  const framedHeading = paragraph([textRun('标题')], chapterFrameParagraphOptions(frameContext, {
    topLine: true,
    bottomLine: frameContext.chapterFrame.headingBottomBorderEnabled,
    fill: 'EEF5FF',
  }));
  // Framed lists delegate left indentation to numbering and add only right paragraph padding. Word draws the left border outside the leftmost character;
  // numbering left - hanging must equal frame padding, or list borders protrude outward.
  const framedListIndent = getListLevelIndent({ listIndentChars: 2, bodyRunSize: 24, framePadding: CHAPTER_FRAME_PADDING_TWIPS }, 0);
  assert.equal(framedListIndent.left, CHAPTER_FRAME_PADDING_TWIPS);
  assert.equal(framedListIndent.hanging, undefined);
  assert.deepEqual(framedListIndent, { left: 115, firstLine: 480 });
  // Express levels with firstLine only, keeping left at frame padding so borders do not move inward with nesting.
  assert.deepEqual(getListLevelIndent({ listIndentChars: 2, bodyRunSize: 24, framePadding: CHAPTER_FRAME_PADDING_TWIPS }, 1), { left: 115, firstLine: 960 });
  // Outside frames retain plain left indentation and one-character hanging indentation.
  assert.deepEqual(getListLevelIndent({ listIndentChars: 2, bodyRunSize: 24, framePadding: 0 }, 0), { left: 480, hanging: 240 });
  // Manually indented lists use the same rules.
  assert.deepEqual(buildManualListIndent(frameContext, 480), { left: 115, firstLine: 480 });
  assert.deepEqual(buildManualListIndent(frameContext, 0), { left: CHAPTER_FRAME_PADDING_TWIPS });
  assert.deepEqual(buildManualListIndent({}, 480), { left: 480 });
  const framedList = paragraph([textRun('列表')], buildListParagraphOptions(frameContext, 'ref-1', 0));
  const framedCaption = paragraph([textRun('表题')], tableCaptionParagraphOptions(frameContext));
  const framedTable = createDocxTable(
    [new TableRow({ children: ['格一', '格二', '格三'].map((text) => createTableCell({
      children: [paragraph([textRun(text)])], context: frameContext, totalColumns: 3,
    })) })],
    3,
    frameContext,
    true,
  );
  void Packer.toBuffer(new Document({
    sections: [{
      children: [
        paragraph([textRun('spacing')], { spacing }),
        framed,
        framedHeading,
        framedList,
        framedCaption,
        framedTable,
        chapterFrameClosingParagraph(frameContext),
      ],
    }],
  })).then(async (buffer) => {
    const xml = new AdmZip(buffer).readAsText('word/document.xml');
    assert.match(xml, /w:beforeLines="50"/);
    assert.match(xml, /w:after="120"/);
    // Body has vertical borders only; indentation = existing 200 + frame padding 115.
    const body = xml.slice(Math.max(0, xml.indexOf('正文') - 900), xml.indexOf('正文'));
    assert.match(body, /<w:left w:val="single" w:color="CFD8EE" w:sz="6" w:space="5"/);
    assert.match(body, /w:left="315"/);
    assert.match(body, /w:right="115"/);
    assert.match(body, /w:firstLine="480"/);
    // Headings draw top/bottom borders and shading according to template settings.
    const heading = xml.slice(Math.max(0, xml.indexOf('标题') - 900), xml.indexOf('标题'));
    assert.match(heading, /<w:top w:val="single" w:color="CFD8EE" w:sz="6" w:space="5"/);
    assert.match(heading, /<w:bottom w:val="single" w:color="CFD8EE" w:sz="6" w:space="4"/);
    assert.match(heading, /w:fill="EEF5FF"/);
    const caption = xml.slice(xml.lastIndexOf('<w:p>', xml.indexOf('表题')), xml.indexOf('表题'));
    assert.match(caption, /<w:top w:val="single" w:color="CFD8EE" w:sz="6" w:space="1"/);
    assert.match(caption, /<w:bottom w:val="single" w:color="CFD8EE" w:sz="6" w:space="1"/);
    assert.match(caption, /w:after="0"/);
    // List paragraphs set right padding only: writing w:left overrides numbering left with direct paragraph formatting,
    // leaving hanging alone to pull the leftmost character and border outside the padding.
    const listAt = xml.indexOf('列表');
    const list = xml.slice(xml.lastIndexOf('<w:p>', listAt), listAt);
    assert.match(list, /<w:ind w:right="115"\s*\/>/);
    assert.doesNotMatch(list, /<w:ind[^>]*w:left=/);
    // Tables continue vertical borders; omit their top border when the caption already draws a bottom border.
    const table = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tblPr>'));
    assert.match(table, /<w:left w:val="single" w:color="CFD8EE"/);
    assert.match(table, /<w:right w:val="single" w:color="CFD8EE"/);
    assert.match(table, /<w:top w:val="nil"/);
    // Disabling full-width tables must not narrow framed tables; previews use the same fixed column-width rules.
    const $table = cheerio.load(xml, { xmlMode: true })('w\\:tbl').first();
    const tableProperties = $table.children('w\\:tblPr');
    const frameWidth = getPageContentWidthTwips(frameContext);
    assert.equal(tableProperties.children('w\\:tblW').attr('w:type'), 'dxa');
    assert.equal(Number(tableProperties.children('w\\:tblW').attr('w:w')), frameWidth);
    assert.equal(tableProperties.children('w\\:tblLayout').attr('w:type'), 'fixed');
    assert.deepEqual($table.children('w\\:tblGrid').children('w\\:gridCol').toArray()
      .map((node) => Number(node.attribs['w:w'])), tableColumnWidths(3, frameWidth));
    // Closing paragraphs draw only a top border with 1-twip line height.
    assert.match(xml, /w:line="20" w:lineRule="exact"/);
    // One mixed outline covers scope transitions, parent-heading assignment, placeholders, and header/footer isolation.
    const outline = [
      { id: '1', title: '混合父标题', children: [
        { id: '1.1', title: '人工节点', content_mode: 'manual-fill' },
        { id: '1.2', title: 'AI节点', content_mode: 'ai-generate', content: 'AI正文\n\n## 正文内子标题\n\n正文续段\n\n---' },
        { id: '1.3', title: '其他节点', content_mode: 'other' },
        { id: '1.4', title: '手工正文节点', content_mode: 'manual-fill', content: '## 框外子标题\n\n人工正文\n\n---' },
      ] },
      { id: '2', title: '纯AI父标题', children: [
        { id: '2.1', title: 'AI节点二', content_mode: 'ai-generate', content: 'AI正文二' },
      ] },
    ];
    const format = require('./exportFormatDefaults.cjs').cloneDefaultExportFormat();
    Object.assign(format.page, {
      paper_size: 'a3', orientation: 'landscape', two_column: true,
      header_footer_style: 'plain', header_enabled: true, header_text: '范围页眉',
      footer_enabled: true, footer_text: '范围页脚', page_number_enabled: true,
      page_number_start: 7, first_page_different: true,
    });
    format.heading_border.enabled = true;
    Object.assign(format.body_text, { font: '楷体', size: '三号', first_line_indent_chars: 3 });
    for (const scope of ['ai-only', 'document']) {
      const zip = new AdmZip(await buildDocxBuffer({ outline, export_format: format, export_template_scope: scope }));
      const $ = cheerio.load(zip.readAsText('word/document.xml'), { xmlMode: true });
      const rels = cheerio.load(zip.readAsText('word/_rels/document.xml.rels'), { xmlMode: true });
      const isWhole = scope === 'document';
      for (const text of ['混合父标题', '待人工填写', '待处理', '框外子标题']) {
        const p = $('w\\:p').filter((_, node) => $(node).text().includes(text)).first();
        assert.equal(p.find('w\\:pBdr').length, isWhole ? 1 : 0);
      }
      for (const text of ['纯AI父标题', 'AI正文']) {
        assert.equal($('w\\:p').filter((_, node) => $(node).text().includes(text)).first().find('w\\:pBdr').length, 1);
      }
      const bodyHeading = $('w\\:p').filter((_, node) => $(node).text() === '正文内子标题').first();
      assert.equal(bodyHeading.find('w\\:pBdr > w\\:top').length, 1);
      assert.equal(bodyHeading.find('w\\:pBdr > w\\:left').length, 1);
      assert.equal(bodyHeading.find('w\\:pBdr > w\\:right').length, 1);
      assert.equal(bodyHeading.find('w\\:shd').attr('w:fill'), normalizeDocxColor(format.heading_border.level_cell_colors[1]));
      assert.equal(bodyHeading.find('w\\:ind').attr('w:left'), String(CHAPTER_FRAME_PADDING_TWIPS));
      assert.equal(bodyHeading.find('w\\:ind').attr('w:right'), String(CHAPTER_FRAME_PADDING_TWIPS));
      const separators = $('w\\:p').filter((_, node) => $(node).text().startsWith('────')).toArray();
      assert.equal(separators.length, 2);
      for (const [index, node] of separators.entries()) {
        const separator = $(node);
        const framedSeparator = index === 0 || isWhole;
        assert.equal(separator.find('w\\:pBdr > w\\:left').length, framedSeparator ? 1 : 0);
        assert.equal(separator.find('w\\:pBdr > w\\:right').length, framedSeparator ? 1 : 0);
        assert.equal(separator.find('w\\:pBdr > w\\:top').length, 0);
        assert.equal(separator.find('w\\:ind').attr('w:left'), framedSeparator ? String(CHAPTER_FRAME_PADDING_TWIPS) : undefined);
        assert.equal(separator.find('w\\:ind').attr('w:right'), framedSeparator ? String(CHAPTER_FRAME_PADDING_TWIPS) : undefined);
        assert.equal(separator.find('w\\:jc').attr('w:val'), 'center');
      }
      const sectionScopes = isWhole ? [true] : [false, true, false, true];
      const sectionNodes = $('w\\:sectPr').toArray();
      assert.equal(sectionNodes.length, sectionScopes.length);
      assert.deepEqual($('w\\:pgNumType').toArray().map((node) => $(node).attr('w:start')).filter(Boolean), ['7']);
      for (const [index, node] of sectionNodes.entries()) {
        const section = $(node);
        assert.equal(section.children('w\\:type').attr('w:val'), 'nextPage');
        assert.equal(section.children('w\\:pgSz').attr('w:orient'), 'landscape');
        assert.equal(section.children('w\\:cols').attr('w:num'), '2');
        const titlePage = section.children('w\\:titlePg').attr('w:val');
        assert.equal(titlePage !== 'false' && titlePage !== '0', index === (isWhole ? 0 : 1));
        for (const [part, text] of [['header', '范围页眉'], ['footer', '范围页脚']]) {
          const id = section.children(`w\\:${part}Reference`).filter((_, ref) => $(ref).attr('w:type') === 'default').attr('r:id');
          const target = rels('Relationship').filter((_, rel) => rels(rel).attr('Id') === id).attr('Target');
          assert.equal(zip.readAsText(`word/${target}`).includes(text), sectionScopes[index]);
        }
      }
      if (!isWhole) assert.doesNotMatch(zip.readAsText('word/styles.xml'), /楷体/);
    }
    // The new toggle applies to outline and in-content headings; remove borders only, retaining shading, indentation, and body frames.
    assert.equal(getChapterFrameConfig({ heading_border: { enabled: true } }).includeHeadings, true);
    format.heading_border.include_headings = false;
    const unframedHeadingZip = new AdmZip(await buildDocxBuffer({ outline, export_format: format, export_template_scope: 'document' }));
    const $unframed = cheerio.load(unframedHeadingZip.readAsText('word/document.xml'), { xmlMode: true });
    for (const text of ['混合父标题', '正文内子标题', '纯AI父标题']) {
      const p = $unframed('w\\:p').filter((_, node) => $unframed(node).text().includes(text)).first();
      assert.equal(p.find('w\\:pBdr').length, 0, text);
      assert.equal(p.find('w\\:shd').length, 1, text);
      assert.equal(p.find('w\\:ind').attr('w:left'), String(CHAPTER_FRAME_PADDING_TWIPS));
      assert.match(p.find('w\\:pStyle').attr('w:val'), /^Heading[1-6]$/);
    }
    assert.equal($unframed('w\\:p').filter((_, node) => $unframed(node).text() === 'AI正文').find('w\\:pBdr').length, 1);
    console.log('导出自检通过：原生间距 + 章节页框 + 样式范围。');
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}
