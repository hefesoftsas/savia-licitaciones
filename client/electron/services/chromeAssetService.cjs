/**
 * Header/footer decorative assets: rasterize shared SVG generator output to workspace PNG files for the C# helper.
 *
 * Decorations are compact vector SVGs, but delivery must use PNG: Word support for embedded SVG is uncertain,
 * EMF/WMF appear as placeholders in docx-editor.dev, and WebP is not an OOXML-supported format
 * (also handled by normalizeImageForDocx). PNG is reliable in both consumers.
 *
 * Name and reuse assets by content hash; unchanged configuration does not require another screenshot.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { getWorkspaceDir } = require('../utils/paths.cjs');

/** Decoration directory inside the workspace; pass relative paths to C#. */
const CHROME_ASSET_ROOT = 'chrome-assets';

/** Rasterization scale: convert SVG centimeter dimensions to approximately 300 dpi. */
const RASTER_DPI = 300;
const CSS_DPI = 96;
const RASTER_SCALE = RASTER_DPI / CSS_DPI;   // 3.125

let chromeModulePromise = null;
let chromeModule = null;

/** Cache rasterized results by SVG content hash. */
const pngMemo = new Map();
const PNG_MEMO_MAX = 16;

/** The shared module is ESM; Main uses dynamic import, as fileService.cjs does for convert.mjs. */
function loadChromeModule() {
  if (!chromeModulePromise) {
    const url = pathToFileURL(
      path.join(__dirname, '..', 'shared', 'chrome', 'index.mjs'),
    ).href;
    chromeModulePromise = import(url).then((m) => {
      chromeModule = m;
      return m;
    });
  }
  return chromeModulePromise;
}

/**
 * Read page geometry synchronously. Call await loadChromeModule() first.
 *
 * Export calculations such as maximum image height are synchronous, but margins must use the same
 * derivation as decorations; independently calculated frontend/backend geometry caused the mismatch.
 * Return null before module loading so callers can fall back to raw configuration.
 */
function resolveChromeLayoutSync(page) {
  if (!chromeModule) return null;
  // Use the version with the text layer: body margins must clear expanded text boxes, not just the decorative band height.
  return chromeModule.resolveChromeLayoutWithText(page || {}).layout;
}

function cmToCssPx(cm) {
  return Math.max(1, Math.round((cm * CSS_DPI) / 2.54));
}

/**
 * Rasterize SVG into a PNG buffer.
 * renderExactHtmlToPng accepts arbitrary HTML fragments, so inline the SVG as in exportService.cjs:1003.
 */
async function rasterizeSvg(svg, widthCm, heightCm) {
  const width = cmToCssPx(widthCm);
  const height = cmToCssPx(heightCm);
  const html =
    `<div style="width:${width}px;height:${height}px;overflow:hidden;line-height:0">` +
    // Make the SVG fill the container exactly so max-width rules do not change its aspect ratio.
    svg.replace('<svg ', `<svg style="display:block;width:${width}px;height:${height}px" `) +
    '</div>';
  const png = await require('./localImageRenderService.cjs').getLocalImageRenderService().renderExactHtmlToPng({
    html,
    width,
    height,
    scale: RASTER_SCALE,
  });
  return png.buffer;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Generate header/footer decorative PNGs for a page configuration.
 *
 * @param {object} app        Electron app
 * @param {object} pageConfig export_format.page
 * @returns {Promise<{assetRoot: string, header: string|null, footer: string|null, layout: object, textLayout: object}>}
 *   header / footer are filenames relative to assetRoot; plain decoration returns null.
 */
async function buildChromeAssets(app, pageConfig) {
  const { buildChrome } = await loadChromeModule();
  const chrome = buildChrome(pageConfig || {});

  const result = {
    assetRoot: CHROME_ASSET_ROOT,
    header: null,
    footer: null,
    layout: chrome.layout,
    textLayout: chrome.textLayout,
  };
  if (!chrome.headerSvg && !chrome.footerSvg) return result;

  const targetDir = ensureDir(path.join(getWorkspaceDir(app), CHROME_ASSET_ROOT));

  const emit = async (svg, heightCm, tag) => {
    if (!svg || !(heightCm > 0)) return null;
    const hash = crypto.createHash('sha256').update(svg).digest('hex').slice(0, 16);
    const name = `${tag}-${hash}.png`;
    const file = path.join(targetDir, name);
    // Capture each identical SVG only once.
    if (!fs.existsSync(file)) {
      const buffer = await rasterizeSvg(svg, chrome.layout.widthCm, heightCm);
      fs.writeFileSync(file, buffer);
    }
    return name;
  };

  result.header = await emit(chrome.headerSvg, chrome.layout.headerHeightCm, 'header');
  result.footer = await emit(chrome.footerSvg, chrome.layout.footerHeightCm, 'footer');
  return result;
}

/**
 * Get decorative PNG bytes directly without saving files, for final export.
 * The export docx library accepts buffers and needs no workspace file.
 *
 * @returns {Promise<{
 *   header: {buffer: Buffer, widthCm: number, heightCm: number}|null,
 *   footer: {buffer: Buffer, widthCm: number, heightCm: number}|null,
 *   layout: object, textLayout: object, colors: object,
 * }>}
 */
async function renderChromePngs(pageConfig) {
  const { buildChrome } = await loadChromeModule();
  const chrome = buildChrome(pageConfig || {});
  const widthCm = chrome.layout.widthCm;

  const emit = async (svg, heightCm) => {
    if (!svg || !(heightCm > 0)) return null;
    // Header and footer are built separately; do not capture the same SVG twice.
    const key = crypto.createHash('sha256').update(svg).digest('hex');
    let buffer = pngMemo.get(key);
    if (!buffer) {
      buffer = await rasterizeSvg(svg, widthCm, heightCm);
      pngMemo.set(key, buffer);
      // Retain only recent entries to bound memory use during repeated color changes.
      if (pngMemo.size > PNG_MEMO_MAX) {
        pngMemo.delete(pngMemo.keys().next().value);
      }
    }
    return { buffer, widthCm, heightCm };
  };

  return {
    header: await emit(chrome.headerSvg, chrome.layout.headerHeightCm),
    footer: await emit(chrome.footerSvg, chrome.layout.footerHeightCm),
    layout: chrome.layout,
    textLayout: chrome.textLayout,
    colors: chrome.colors,
  };
}

/** Remove unreferenced decorative images to bound workspace growth. */
function pruneChromeAssets(app, keepNames, maxKeep = 40) {
  try {
    const dir = path.join(getWorkspaceDir(app), CHROME_ASSET_ROOT);
    if (!fs.existsSync(dir)) return;
    const keep = new Set((keepNames || []).filter(Boolean));
    const entries = fs
      .readdirSync(dir)
      .filter((n) => n.endsWith('.png'))
      .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const [i, e] of entries.entries()) {
      if (keep.has(e.n) || i < maxKeep) continue;
      fs.rmSync(path.join(dir, e.n), { force: true });
    }
  } catch {
    // Cleanup failure must not affect the main workflow.
  }
}

module.exports = {
  CHROME_ASSET_ROOT,
  buildChromeAssets,
  renderChromePngs,
  resolveChromeLayoutSync,
  pruneChromeAssets,
  loadChromeModule,
};
