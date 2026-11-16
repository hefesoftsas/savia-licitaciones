/**
 * SVG drawing primitives; see geometry.mjs for coordinates: 100 units = 1cm.
 *
 * Provide string-building helpers only, without dependencies, so generators run in both
 * Renderer (Vite) and Electron Main (dynamic import).
 */
import { cmToSvg } from './geometry.mjs';

/** Keep one decimal place to avoid long floating-point tails in coordinates. */
export const n = (v) => Math.round(v * 10) / 10;

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wrap in <svg>, using cm dimensions and SVG-unit viewBox coordinates. */
export function svgDoc(widthCm, heightCm, inner, defs = '') {
  const w = n(cmToSvg(widthCm));
  const h = n(cmToSvg(heightCm));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    (defs ? `<defs>${defs}</defs>` : '') +
    inner +
    '</svg>'
  );
}

/**
 * Clamp dimensions to nonnegative values: configurable heights can make H minus fixed insets negative.
 * Negative SVG width/height silently discard the entire rect and leave missing decoration.
 * Clamping to zero makes an omitted stroke easier to diagnose than silently invalid drawing.
 */
export function rect(x, y, w, h, fill, extra = '') {
  const width = n(Math.max(0, w));
  const height = n(Math.max(0, h));
  return `<rect x="${n(x)}" y="${n(y)}" width="${width}" height="${height}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
}

export function polygon(points, fill, extra = '') {
  const p = points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');
  return `<polygon points="${p}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
}

/** Draw horizontal rules with rect instead of line to avoid half-pixel stroke alignment. */
export function hLine(x, y, w, thickness, color, opacity) {
  return rect(x, y, w, thickness, color, opacity != null ? `fill-opacity="${opacity}"` : '');
}

export function vLine(x, y, h, thickness, color) {
  return rect(x, y, thickness, h, color);
}

/** Outlined rectangle without fill. */
export function strokeRect(x, y, w, h, color, thickness) {
  // Inset outlines by half their stroke width; short dimensions can become negative, so clamp as with rect.
  return (
    `<rect x="${n(x + thickness / 2)}" y="${n(y + thickness / 2)}" ` +
    `width="${n(Math.max(0, w - thickness))}" height="${n(Math.max(0, h - thickness))}" ` +
    `fill="none" stroke="${color}" stroke-width="${n(thickness)}"/>`
  );
}

export function linearGradient(id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) {
  const body = stops
    .map(([offset, color, opacity]) =>
      `<stop offset="${offset}" stop-color="${color}"` +
      (opacity != null ? ` stop-opacity="${opacity}"` : '') + '/>')
    .join('');
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${body}</linearGradient>`;
}

export function dropShadow(id, dx, dy, blur, opacity) {
  return (
    `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">` +
    `<feDropShadow dx="${n(dx)}" dy="${n(dy)}" stdDeviation="${n(blur / 2)}" ` +
    `flood-color="#000000" flood-opacity="${opacity}"/></filter>`
  );
}

export function clipRect(id, w, h) {
  return `<clipPath id="${id}"><rect x="0" y="0" width="${n(w)}" height="${n(h)}"/></clipPath>`;
}

/**
 * CSS transforms originate at element centers, SVG transforms at coordinate origins.
 * Compensate when reproducing original HTML skewX or the entire block shifts.
 */
export function skewAboutCenter(x, y, w, h, deg) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return `translate(${n(cx)} ${n(cy)}) skewX(${deg}) translate(${n(-cx)} ${n(-cy)})`;
}

/**
 * Inline a 24×24 SVG icon and scale it to the requested edge length.
 * Footer icon assets use 24×24 viewBoxes and one {{mark}} placeholder.
 */
export function placeIcon(iconSource, markColor, x, y, sizeSvgUnits) {
  const filled = String(iconSource).replace(/\{\{mark\}\}/g, markColor);
  const inner = filled
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();
  const scale = sizeSvgUnits / 24;
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(scale * 1000) / 1000})" fill="none">${inner}</g>`;
}
