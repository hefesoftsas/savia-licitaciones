/**
 * Header/footer color derivation: the repository's single implementation.
 *
 * Migrated from hexLuminance/contrastText/darkenHex/resolveChromeColors in
 * client/src/shared/ui/HeaderFooterChrome.tsx with byte-identical behavior, including invalid-input fallbacks.
 * Previously duplicated in HeaderFooterChrome.tsx, headerFooterChromeTemplates.ts, and C# ContrastColor,
 * allowing all three implementations to drift.
 */

const HEX6 = /^[0-9a-f]{6}$/i;

/** Remove # and validate; return null unless there are six hexadecimal digits. */
function rawHex(hex) {
  const raw = String(hex || '').replace('#', '');
  return HEX6.test(raw) ? raw : null;
}

/** YIQ perceived luminance, 0–255; invalid input becomes zero (darkest). */
export function hexLuminance(hex) {
  const raw = rawHex(hex);
  if (raw === null) return 0;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/** Choose readable text for a background, retaining the original threshold of 160. */
export function contrastText(background) {
  return hexLuminance(background) < 160 ? '#ffffff' : '#111111';
}

/** Darken each channel proportionally; return #111111 for invalid input. */
export function darkenHex(hex, amount = 0.18) {
  const raw = rawHex(hex);
  if (raw === null) return '#111111';
  const channel = (start) =>
    Math.max(0, Math.round(Number.parseInt(raw.slice(start, start + 2), 16) * (1 - amount)));
  return `#${[0, 2, 4].map((start) => channel(start).toString(16).padStart(2, '0')).join('')}`;
}

/** Get [r,g,b], treating invalid input as black. */
function channels(hex) {
  const raw = rawHex(hex);
  if (raw === null) return [0, 0, 0];
  return [0, 2, 4].map((i) => Number.parseInt(raw.slice(i, i + 2), 16));
}

function toHex(rgb) {
  return `#${rgb
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Equivalent to CSS color-mix(in srgb, a <ratio>%, b).
 * SVG lacks color-mix, so resolve each original HTML-template use into a concrete color during generation.
 * @param {number} ratioA Proportion of color a, from 0 to 1.
 */
export function mix(a, b, ratioA) {
  const A = channels(a);
  const B = channels(b);
  return toHex(A.map((v, i) => v * ratioA + B[i] * (1 - ratioA)));
}

/** Normalize to #rrggbb, using fallback for invalid input. */
export function normalizeHex(value, fallback) {
  const raw = rawHex(value);
  return raw === null ? fallback : `#${raw}`;
}

export const DEFAULT_BAR = '#e8eef5';
export const DEFAULT_ACCENT = '#536176';

/**
 * Derive the complete decorative color palette from page configuration.
 * @param {{chrome_bar_color?: string, chrome_accent_color?: string}} page
 */
export function resolveChromeColors(page) {
  const bar = page?.chrome_bar_color || DEFAULT_BAR;
  const accent = page?.chrome_accent_color || DEFAULT_ACCENT;
  const onAccent = contrastText(accent);
  return {
    bar,
    accent,
    onAccent,
    // Use accent color instead of white on light backgrounds to avoid white-on-white text.
    onBar: contrastText(bar) === '#ffffff' ? '#ffffff' : accent,
    badge: darkenHex(accent, 0.12),
    slot: onAccent,
  };
}
