/**
 * Header/footer decorations: the sole entry point for three paths.
 *
 *   Frontend style picker: render vector thumbnails directly with headerSvg/footerSvg.
 *   C# template preview: rasterize to workspace PNG and embed anchored floating images.
 *   Production Word export: rasterize to PNG and use docx floating ImageRun.
 *
 * Shared SVG, geometry, and colors keep all three visually consistent.
 */
import { resolveChromeColors } from './colors.mjs';
import { resolveChromeLayout, expandMarginsForText } from './geometry.mjs';
import { buildHeaderSvg } from './headerSvg.mjs';
import { buildFooterSvg } from './footerSvg.mjs';
import { buildTextLayout } from './textLayout.mjs';

export * from './colors.mjs';
export * from './geometry.mjs';
export { buildHeaderSvg } from './headerSvg.mjs';
export { buildFooterSvg } from './footerSvg.mjs';
export { buildTextLayout, formatPageNumber, resolveChromeGeometryDefaults } from './textLayout.mjs';

/**
 * Produce a complete decoration description from page configuration.
 *
 * @param {object} page PageSetupConfig (export_format.page)
 * @returns {{
 *   style: string,
 *   layout: object,
 *   colors: object,
 *   headerSvg: string|null,
 *   footerSvg: string|null,
 *   textLayout: object,
 * }}
 *   null headerSvg/footerSvg means no decoration (plain or disabled header/footer);
 *   callers must not create an image part.
 */
/**
 * Derive geometry and text in two passes.
 *
 * First establish geometry from intrinsic band heights, then lay out text. Font size/wrapping can expand
 * text boxes beyond bands; feed those extents back into body margins so floating, nonwrapping text
 * cannot overlap content. Horizontal text bounds depend only on horizontal margins, not vertical ones,
 * so two passes converge without iteration.
 *
 * Margin consumers (exports and C# samples) must use this function to keep decoration positions
 * and body margins on the same calculation path.
 */
export function resolveChromeLayoutWithText(page = {}, colors = resolveChromeColors(page)) {
  const base = resolveChromeLayout(page);
  const textLayout = buildTextLayout(page, colors, base);
  return { layout: expandMarginsForText(base, textLayout), textLayout };
}

export function buildChrome(page = {}) {
  const colors = resolveChromeColors(page);
  const { layout, textLayout } = resolveChromeLayoutWithText(page, colors);

  const headerSvg = layout.headerVisible
    ? buildHeaderSvg(layout.style, colors, layout.widthCm, layout.headerHeightCm)
    : null;

  const footerSvg = layout.footerVisible
    ? buildFooterSvg(layout.style, colors, layout.widthCm, layout.footerHeightCm)
    : null;

  return {
    style: layout.style,
    layout,
    colors,
    headerSvg,
    footerSvg,
    textLayout,
  };
}
