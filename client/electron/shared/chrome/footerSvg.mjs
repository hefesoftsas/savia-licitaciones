/**
 * SVG rendering for eight footer decorations.
 *
 * Column widths and text regions share geometry.mjs FOOTER_COLUMNS, in cm:
 *   top-bar      left 1.15  right 1.6
 *   slant        left 1.35  right 1.6
 *   frame        left 1.0   right 1.7   (plus a surrounding border)
 *   letterhead   vertical bar 0.22  right 1.7
 *   band         left 1.15  right 2.1
 *   footer-badge right 2.1
 *
 * Draw regional backgrounds/borders only; Word still draws native text shading to text width.
 */
import { cmToSvg, ptToSvg, FOOTER_HEIGHT_CM, FOOTER_COLUMNS, FOOTER_FRAME_INSET_CM } from './geometry.mjs';
import { contrastText } from './colors.mjs';
import { svgDoc, rect, hLine, strokeRect, placeIcon } from './svgUtil.mjs';

/**
 * Footer icons use a 24×24 viewBox; {{mark}} is the stroke-color placeholder.
 *
 * Inline instead of reading resources/header-footer/footer-*.svg, which would require Vite ?raw
 * in Renderer and fs in Main. Inlining removes environment dependencies so both can run this module.
 * Contents are byte-identical to original assets.
 */
const ICONS = {
  'top-bar':
    '<rect x="5.5" y="5.5" width="15" height="15" stroke="{{mark}}" stroke-width="1.2" opacity="0.4"/>' +
    '<rect x="2.5" y="2.5" width="15" height="15" stroke="{{mark}}" stroke-width="1.75"/>' +
    '<line x1="6.4" y1="10" x2="13.6" y2="10" stroke="{{mark}}" stroke-width="1.35"/>' +
    '<line x1="10" y1="6.4" x2="10" y2="13.6" stroke="{{mark}}" stroke-width="1.35"/>',
  slant:
    '<line x1="7" y1="20" x2="15" y2="4" stroke="{{mark}}" stroke-width="2.2"/>' +
    '<line x1="11" y1="20" x2="19" y2="4" stroke="{{mark}}" stroke-width="1.4" opacity="0.45"/>',
  letterhead:
    '<rect x="10" y="2" width="4" height="20" fill="{{mark}}"/>',
  frame:
    '<rect x="3" y="3" width="18" height="18" stroke="{{mark}}" stroke-width="1.5"/>' +
    '<rect x="6" y="6" width="12" height="12" stroke="{{mark}}" stroke-width="0.9" opacity="0.5"/>' +
    '<rect x="3" y="3" width="4" height="4" fill="{{mark}}"/>' +
    '<rect x="17" y="17" width="4" height="4" fill="{{mark}}"/>',
};

const ICON_SIZE_PT = 18;   // Icon design size; footers may be shorter, see footerIconSize.

/**
 * Icon edge length. Configurable footer height H can fall below 18pt, making (H - icon) / 2 negative
 * and overflowing the band. Shrink only: icons are markers, not backgrounds,
 * so taller footers should retain the original icon size instead of enlarging it into oversized decoration.
 */
const footerIconSize = (H) => Math.min(ptToSvg(ICON_SIZE_PT), H * 0.75);

function plainFooter() {
  return null;
}

/** rules: thick/thin rules above footer text, in reverse order from the header. */
function rulesFooter({ accent }, W, H) {
  const thick = ptToSvg(12 / 8);
  const thin = ptToSvg(6 / 8);
  const gap = ptToSvg(2);
  return svgDoc(W / 100, H / 100,
    hLine(0, 0, W, thick, accent) + hLine(0, thick + gap, W, thin, accent));
}

/** band: [1.15cm accent][1fr accent][2.1cm badge], all accent-colored with a darker right page-number cell. */
function bandFooter({ accent, badge }, W, H) {
  const badgeW = cmToSvg(FOOTER_COLUMNS.band.right);
  return svgDoc(W / 100, H / 100,
    rect(0, 0, W, H, accent) + rect(W - badgeW, 0, badgeW, H, badge));
}

/** footer-badge: [1fr bar][2.1cm accent]. */
function footerBadgeFooter({ accent, bar }, W, H) {
  const badgeW = cmToSvg(FOOTER_COLUMNS['footer-badge'].right);
  return svgDoc(W / 100, H / 100,
    rect(0, 0, W, H, bar) + rect(W - badgeW, 0, badgeW, H, accent));
}

/** top-bar: [1.15cm accent+icon][1fr white][1.6cm badge]. */
function topBarFooter({ accent, badge, onAccent }, W, H) {
  const leftW = cmToSvg(FOOTER_COLUMNS['top-bar'].left);
  const rightW = cmToSvg(FOOTER_COLUMNS['top-bar'].right);
  const icon = footerIconSize(H);
  return svgDoc(W / 100, H / 100,
    rect(0, 0, W, H, '#ffffff') +
    rect(0, 0, leftW, H, accent) +
    rect(W - rightW, 0, rightW, H, badge) +
    placeIcon(ICONS['top-bar'] || '', onAccent, (leftW - icon) / 2, (H - icon) / 2, icon));
}

/** slant: [1.35cm accent+icon][1fr bar][1.6cm badge]. */
function slantFooter({ accent, bar, badge, onAccent }, W, H) {
  const leftW = cmToSvg(FOOTER_COLUMNS.slant.left);
  const rightW = cmToSvg(FOOTER_COLUMNS.slant.right);
  const icon = footerIconSize(H);
  return svgDoc(W / 100, H / 100,
    rect(0, 0, W, H, bar) +
    rect(0, 0, leftW, H, accent) +
    rect(W - rightW, 0, rightW, H, badge) +
    placeIcon(ICONS.slant || '', onAccent, (leftW - icon) / 2, (H - icon) / 2, icon));
}

/** letterhead: white background with a 0.22cm accent bar left of the page-number cell. */
function letterheadFooter({ accent }, W, H) {
  const barW = cmToSvg(FOOTER_COLUMNS.letterhead.barCm);
  const pageBoxW = cmToSvg(FOOTER_COLUMNS.letterhead.right);
  const topLine = ptToSvg(0.75);
  return svgDoc(W / 100, H / 100,
    rect(0, 0, W, H, '#ffffff') +
    hLine(0, 0, W, topLine, accent, 0.38) +
    rect(W - pageBoxW - barW, 0, barW, H, accent));
}

/** frame: white background, surrounding double border, left icon, and page-number divider. */
function frameFooter({ accent }, W, H) {
  const leftW = cmToSvg(FOOTER_COLUMNS.frame.left);
  const rightW = cmToSvg(FOOTER_COLUMNS.frame.right);
  const icon = footerIconSize(H);
  const outer = ptToSvg(2.2);
  const innerInset = cmToSvg(FOOTER_FRAME_INSET_CM);
  return svgDoc(W / 100, H / 100,
    rect(0, 0, W, H, '#ffffff') +
    strokeRect(0, 0, W, H, accent, outer) +
    strokeRect(innerInset, innerInset, W - innerInset * 2, H - innerInset * 2, accent, ptToSvg(0.75)) +
    rect(leftW, outer, ptToSvg(0.75), H - outer * 2, accent) +
    rect(W - rightW, outer, ptToSvg(0.75), H - outer * 2, accent) +
    placeIcon(ICONS.frame || '', accent, (leftW - icon) / 2, (H - icon) / 2, icon));
}

const FOOTERS = {
  plain: plainFooter,
  band: bandFooter,
  rules: rulesFooter,
  'top-bar': topBarFooter,
  'footer-badge': footerBadgeFooter,
  slant: slantFooter,
  letterhead: letterheadFooter,
  frame: frameFooter,
};

/**
 * Generate footer decoration SVG.
 * @returns {string|null} null for undecorated plain style.
 */
export function buildFooterSvg(style, colors, widthCm, heightCm) {
  const draw = FOOTERS[style] || FOOTERS.plain;
  const h = heightCm ?? FOOTER_HEIGHT_CM[style] ?? 0;
  if (!(h > 0)) return null;
  return draw({ ...colors, onAccent: colors.onAccent ?? contrastText(colors.accent) },
    cmToSvg(widthCm), cmToSvg(h));
}
