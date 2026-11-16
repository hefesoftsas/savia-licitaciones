import { Button } from './primitives/button';
import { useMemo } from 'react';
import { buildChrome } from '../../../electron/shared/chrome/index.mjs';
import type { HeaderFooterStyle, PageSetupConfig } from '../types/exportFormat';
import { HEADER_FOOTER_STYLE_OPTIONS, getExportOptionDescription, getExportOptionLabel, resolveHeaderFooterStyle } from '../types/exportFormat';
import { useLanguage } from '../i18n';

function hexLuminance(hex: string): number {
  const raw = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) return 0;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function contrastText(background: string): string {
  return hexLuminance(background) < 160 ? '#ffffff' : '#111111';
}

function darkenHex(hex: string, amount = 0.18): string {
  const raw = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) return '#111111';
  const channel = (start: number) => Math.max(0, Math.round(Number.parseInt(raw.slice(start, start + 2), 16) * (1 - amount)));
  return `#${[0, 2, 4].map((start) => channel(start).toString(16).padStart(2, '0')).join('')}`;
}

interface ChromeColors {
  bar: string;
  accent: string;
  onBar: string;
  onAccent: string;
  badge: string;
  slot: string;
}

export function resolveChromeColors(page: PageSetupConfig): ChromeColors {
  const bar = page.chrome_bar_color || '#e8eef5';
  const accent = page.chrome_accent_color || '#536176';
  const onAccent = contrastText(accent);
  return {
    bar,
    accent,
    onBar: contrastText(bar) === '#ffffff' ? '#ffffff' : accent,
    onAccent,
    badge: darkenHex(accent, 0.12),
    slot: onAccent,
  };
}

/**
 * Style thumbnails use the same SVG generator as template previews and exports.
 *
 * Rendering the decorative SVG directly keeps the selector consistent with output.
 * The vector artwork requires no rasterization.
 */
export function HeaderFooterStyleThumb({ style, bar, accent }: {
  style: HeaderFooterStyle;
  bar: string;
  accent: string;
}) {
  const { headerSvg, footerSvg, layout } = useMemo(() => buildChrome({
    header_footer_style: style,
    header_enabled: true,
    header_text: ' ',
    footer_enabled: true,
    footer_text: ' ',
    page_number_enabled: true,
    chrome_bar_color: bar || '#e8eef5',
    chrome_accent_color: accent || '#536176',
  }), [style, bar, accent]);

  const dataUrl = (svg: string | null) => (svg
    ? `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
    : undefined);

  // Preserve paper proportions and decoration height so thumbnails reflect their actual footprint.
  const pct = (cm: number) => `${(cm / layout.heightCm) * 100}%`;

  return (
    <span className="header-footer-style-thumb" aria-hidden="true">
      {headerSvg ? (
        <span
          className="header-footer-style-thumb-chrome is-header"
          style={{ height: pct(layout.headerHeightCm), backgroundImage: dataUrl(headerSvg) }}
        />
      ) : null}
      <span className="header-footer-style-thumb-body">
        <i /><i /><i /><i />
      </span>
      {footerSvg ? (
        <span
          className="header-footer-style-thumb-chrome is-footer"
          style={{ height: pct(layout.footerHeightCm), backgroundImage: dataUrl(footerSvg) }}
        />
      ) : null}
    </span>
  );
}


interface StylePickerProps {
  value: HeaderFooterStyle;
  bar: string;
  accent: string;
  onChange: (style: HeaderFooterStyle) => void;
}

export function HeaderFooterStylePicker({ value, bar, accent, onChange }: StylePickerProps) {
  const { language } = useLanguage();
  const pick = (zh: string, es: string, en: string) => language === 'es' ? es : language === 'en' ? en : zh;
  return (
    <div className="header-footer-style-picker" role="radiogroup" aria-label={pick('页眉页脚样式', 'Estilo de encabezado y pie', 'Header and footer style')}>
      {HEADER_FOOTER_STYLE_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <Button size="content" variant="ghost"
            key={option.value}
            type="button"
            className={`header-footer-style-card${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(option.value)}
            role="radio"
            aria-checked={selected}
            title={getExportOptionDescription('header-footer-style', option.label, language, option.description)}
          >
            <HeaderFooterStyleThumb style={option.value} bar={bar} accent={accent} />
            <strong>{getExportOptionLabel('header-footer-style', option.label, language, option.label)}</strong>
          </Button>
        );
      })}
    </div>
  );
}
