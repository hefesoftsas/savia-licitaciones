/**
 * Map ExportFormatConfig to CSS custom properties on the body preview container
 * (.markdown-viewer.export-format-preview; see shared-markdown.css). Covers only body layout: paper width,
 * body margins, font/size/spacing, lists, and headings. Header/footer, chapter frame, and simulated-paper
 * variables were removed because template settings now render real docx through docx-editor.dev
 * (ExportFormatPage DocxEditor), using shared geometry and C# layout rather than these variables.
 */

import { resolveChromeLayoutWithText } from '../../../electron/shared/chrome/index.mjs';
import type { ExportFormatConfig, HeadingStyleConfig, ListStyle, OrderedListStyle } from '../types/exportFormat';
import { SIZE_TO_PT, FONT_TO_CSS, ALIGNMENT_TO_CSS } from '../types/exportFormat';

/**
 * Chinese font-size name -> points.
 */
export function chineseSizeToPt(sizeName: string): number {
  return SIZE_TO_PT[sizeName] ?? 12;
}

/**
 * Chinese font name -> CSS font-family.
 */
export function chineseFontToCss(fontName: string): string {
  return FONT_TO_CSS[fontName] ?? `'${fontName}', sans-serif`;
}

/**
 * Chinese alignment name -> CSS text-align.
 */
export function alignmentToCss(align: string): string {
  return ALIGNMENT_TO_CSS[align] ?? 'left';
}

/**
 * Build CSS variables for a heading level.
 */
function buildHeadingVars(level: number, config: HeadingStyleConfig): Record<string, string> {
  const n = level + 1; // CSS variables use h1-h6.
  const sizePt = chineseSizeToPt(config.size);

  return {
    [`--ef-h${n}-font`]: chineseFontToCss(config.font),
    [`--ef-h${n}-size`]: `${sizePt}pt`,
    [`--ef-h${n}-align`]: alignmentToCss(config.alignment),
    [`--ef-h${n}-weight`]: config.bold ? '700' : '400',
    [`--ef-h${n}-color`]: config.text_color || '#243048',
    [`--ef-h${n}-spacing-before`]: `${config.spacing_before_pt}pt`,
    [`--ef-h${n}-spacing-after`]: `${config.spacing_after_pt}pt`,
    [`--ef-h${n}-indent`]: '0',
    [`--ef-h${n}-line-height`]: String(config.line_spacing),
  };
}

function unorderedListStyleToCss(style: ListStyle | string | undefined, listIndent: string) {
  switch (style) {
    case 'none':
      return { marker: '""', font: 'inherit', size: '1em', display: 'none', indent: listIndent };
    case 'circle':
      return { marker: '"○"', font: 'Arial, sans-serif', size: '0.82em', display: 'inline-block', indent: listIndent };
    case 'square':
      return { marker: '"■"', font: 'Arial, sans-serif', size: '0.72em', display: 'inline-block', indent: listIndent };
    case 'diamond':
      return { marker: '"◆"', font: 'Arial, sans-serif', size: '0.72em', display: 'inline-block', indent: listIndent };
    case 'dash':
      return { marker: '"–"', font: 'Arial, sans-serif', size: '0.9em', display: 'inline-block', indent: listIndent };
    case 'check':
      return { marker: '"✓"', font: 'Segoe UI Symbol, Arial, sans-serif', size: '0.85em', display: 'inline-block', indent: listIndent };
    case 'arrow':
      return { marker: '"➢"', font: 'Segoe UI Symbol, Arial, sans-serif', size: '0.88em', display: 'inline-block', indent: listIndent };
    case 'sparkle':
      return { marker: '"✧"', font: 'Segoe UI Symbol, Arial, sans-serif', size: '0.9em', display: 'inline-block', indent: listIndent };
    default:
      return { marker: '"•"', font: 'Arial, sans-serif', size: '0.75em', display: 'inline-block', indent: listIndent };
  }
}

function orderedListStyleToCss(style: OrderedListStyle | string | undefined) {
  switch (style) {
    case 'decimal-paren':
      return { counterStyle: 'decimal', prefix: '""', suffix: '"） "' };
    case 'decimal-full-paren':
      return { counterStyle: 'decimal', prefix: '"（"', suffix: '"） "' };
    case 'chinese-dot':
      return { counterStyle: 'cjk-ideographic', prefix: '""', suffix: '"、 "' };
    case 'chinese-paren':
      return { counterStyle: 'cjk-ideographic', prefix: '"（"', suffix: '"） "' };
    case 'lower-alpha':
      return { counterStyle: 'lower-alpha', prefix: '""', suffix: '". "' };
    case 'upper-alpha':
      return { counterStyle: 'upper-alpha', prefix: '""', suffix: '". "' };
    case 'lower-roman':
      return { counterStyle: 'lower-roman', prefix: '""', suffix: '". "' };
    case 'upper-roman':
      return { counterStyle: 'upper-roman', prefix: '""', suffix: '". "' };
    default:
      return { counterStyle: 'decimal', prefix: '""', suffix: '". "' };
  }
}

/**
 * Convert complete ExportFormatConfig into CSS custom-property pairs that can be spread directly onto a
 * React style prop.
 */
export function buildExportFormatCssVars(config: ExportFormatConfig): Record<string, string> {
  const vars: Record<string, string> = {};

  // ── Page settings ──
  // Paper and margins come from shared geometry, matching production export and C# samples; body margins must accommodate
  // header/footer decorations, so use resolveChromeLayoutWithText rather than raw configuration values.
  const { layout } = resolveChromeLayoutWithText(config.page as unknown as Record<string, unknown>);

  vars['--ef-page-width'] = `${layout.widthCm}cm`;
  vars['--ef-page-padding-top'] = `${layout.marginTopCm}cm`;
  vars['--ef-page-padding-bottom'] = `${layout.marginBottomCm}cm`;
  vars['--ef-page-padding-left'] = `${layout.marginLeftCm}cm`;
  vars['--ef-page-padding-right'] = `${layout.marginRightCm}cm`;

  // ── Body ──
  const bodySizePt = chineseSizeToPt(config.body_text.size);
  vars['--ef-body-font'] = chineseFontToCss(config.body_text.font);
  vars['--ef-body-size'] = `${bodySizePt}pt`;
  vars['--ef-body-align'] = alignmentToCss(config.body_text.alignment);
  // Match grid-free Word preview: a standard line is 12pt, not the current CSS line height.
  vars['--ef-body-spacing-before'] = `${(config.body_text.spacing_before ?? 0) * (config.body_text.spacing_before_unit === 'pt' ? 1 : 12)}pt`;
  vars['--ef-body-spacing-after'] = `${(config.body_text.spacing_after ?? 0) * (config.body_text.spacing_after_unit === 'pt' ? 1 : 12)}pt`;
  vars['--ef-body-indent'] = config.body_text.first_line_indent_chars > 0
    ? `${config.body_text.first_line_indent_chars}em`
    : '0';
  const lineMode = config.body_text.line_spacing_mode ?? 'multiple';
  const lineValue = config.body_text.line_spacing_value ?? 1.2;
  // HTML body display uses CSS; template preview reads native Word spacing without CSS conversion.
  vars['--ef-body-line-height'] = lineMode === 'exact' ? `${lineValue}pt`
    : lineMode === 'at-least' ? `max(1em, ${lineValue}pt)`
      : String(lineMode === 'single' ? 1 : lineMode === 'one-and-half' ? 1.5 : lineMode === 'double' ? 2 : lineValue);
  const listIndent = `${config.body_text.list_indent_chars ?? 2}em`;
  vars['--ef-list-indent'] = listIndent;
  const unorderedListStyle = unorderedListStyleToCss(config.body_text.list_style, listIndent);
  vars['--ef-unordered-list-marker'] = unorderedListStyle.marker;
  vars['--ef-unordered-list-marker-font'] = unorderedListStyle.font;
  vars['--ef-unordered-list-marker-size'] = unorderedListStyle.size;
  vars['--ef-unordered-list-marker-display'] = unorderedListStyle.display;
  vars['--ef-unordered-list-indent'] = unorderedListStyle.indent;
  const orderedListStyle = orderedListStyleToCss(config.body_text.ordered_list_style);
  vars['--ef-ordered-list-counter-style'] = orderedListStyle.counterStyle;
  vars['--ef-ordered-list-prefix'] = orderedListStyle.prefix;
  vars['--ef-ordered-list-suffix'] = orderedListStyle.suffix;

  // ── Heading levels h1-h6 ──
  for (let i = 0; i < 6; i++) {
    const heading = config.headings[i];
    if (heading) {
      Object.assign(vars, buildHeadingVars(i, heading));
    }
  }

  // ── Tables ──
  const table = config.table;
  if (table) {
    vars['--ef-table-border-width'] = `${table.border_width ?? 1}px`;
    vars['--ef-table-border-color'] = table.border_color || '#dcdff6';
    vars['--ef-table-cell-padding'] = `${table.cell_padding_pt ?? 6}pt`;
    vars['--ef-table-caption-font'] = chineseFontToCss(table.caption_font || '宋体');
    vars['--ef-table-caption-size'] = `${chineseSizeToPt(table.caption_size || '小四')}pt`;
    vars['--ef-table-caption-align'] = alignmentToCss(table.caption_alignment || '居中对齐');
    vars['--ef-table-caption-weight'] = table.caption_bold ? '700' : '400';
    vars['--ef-table-caption-style'] = table.caption_italic ? 'italic' : 'normal';
    const tableAreas = [
      ['header', table.header_row],
      ['first-column', table.first_column],
      ['body-cell', table.body_cell],
    ] as const;
    tableAreas.forEach(([key, cell]) => {
      if (!cell) return;
      vars[`--ef-table-${key}-font`] = chineseFontToCss(cell.font);
      vars[`--ef-table-${key}-size`] = `${chineseSizeToPt(cell.size)}pt`;
      vars[`--ef-table-${key}-align`] = alignmentToCss(cell.alignment);
      vars[`--ef-table-${key}-color`] = cell.text_color || '#243048';
      vars[`--ef-table-${key}-background`] = cell.background_color || '#ffffff';
    });
  }

  // ── Images ──
  const image = config.image;
  if (image) {
    const imageAlignment = alignmentToCss(image.alignment || '居中对齐');
    vars['--ef-image-max-width'] = `${image.max_width_percent ?? 90}%`;
    vars['--ef-image-align'] = imageAlignment;
    vars['--ef-image-margin-left'] = imageAlignment === 'right' || imageAlignment === 'center' ? 'auto' : '0';
    vars['--ef-image-margin-right'] = imageAlignment === 'left' || imageAlignment === 'center' ? 'auto' : '0';
    vars['--ef-image-caption-font'] = chineseFontToCss(image.caption_font || '宋体');
    vars['--ef-image-caption-size'] = `${chineseSizeToPt(image.caption_size || '小五')}pt`;
    vars['--ef-image-caption-align'] = alignmentToCss(image.caption_alignment || '居中对齐');
    vars['--ef-image-caption-weight'] = image.caption_bold ? '700' : '400';
    vars['--ef-image-caption-style'] = image.caption_italic ? 'italic' : 'normal';
  }

  return vars;
}

/**
 * Chinese font size -> Word half-points for exportService.
 */
export function chineseSizeToHalfPoints(sizeName: string): number {
  const pt = chineseSizeToPt(sizeName);
  return Math.round(pt * 2);
}

/**
 * Centimeters -> twips for exportService page settings; 1cm = 567 twips.
 */
export function cmToTwips(cm: number): number {
  return Math.round(cm * 567);
}

/**
 * Points -> twips for exportService spacing; 1pt = 20 twips.
 */
export function ptToTwips(pt: number): number {
  return Math.round(pt * 20);
}
