/**
 * Layout metrics convert export configuration into deterministic page capacity: words per line, lines per
 * page, and image height. AI receives only block structure and word counts, never centimeters or page
 * numbers. Keep geometry synchronized with C# RestrictedHtmlWordInserter/RestrictedHtmlDocumentRenderer:
 * width follows content width and height follows aspect ratio; update both implementations together.
 */
import { resolveChromeLayout } from '../../../electron/shared/chrome/index.mjs';
import type { ExportFormatConfig, PageSetupConfig } from '../types/exportFormat';
import { SIZE_TO_PT } from '../types/exportFormat';

const PT_PER_CM = 72 / 2.54;

export const ptToCm = (pt: number) => pt / PT_PER_CM;
export const cmToPt = (cm: number) => cm * PT_PER_CM;

export const sizeToPt = (name: string) => SIZE_TO_PT[name] ?? 12;

/**
 * Word single line spacing derives from font ascent + descent + lineGap, not font size alone. Common Chinese
 * fonts measure 1.28-1.32 times font size; use 1.30 as the baseline. The test page compares predicted and
 * actual engine pagination to calibrate this coefficient.
 */
export const SINGLE_LINE_FACTOR = 1.3;

/** Image geometry corresponds item-for-item to C# RestrictedHtmlWordInserter.FigureSizes. */
export const FIGURE_GEOMETRY = {
  square: { widthRatio: 0.65, aspectWidth: 1, aspectHeight: 1 },
  wide: { widthRatio: 0.8, aspectWidth: 3, aspectHeight: 2 },
  tall: { widthRatio: 0.5, aspectWidth: 3, aspectHeight: 4 },
  panorama: { widthRatio: 0.9, aspectWidth: 16, aspectHeight: 9 },
} as const;

export type FigureSize = keyof typeof FIGURE_GEOMETRY;
export type FigureGeneration = 'aiImage' | 'mermaid' | 'htmlImage';

/**
 * Frame fitting corresponds to C# data-sv-fit. contain treats the frame as an upper bound and preserves the
 * real aspect ratio without cropping; cover crops to the frame ratio. Flowcharts and infographics require
 * contain; cover suits photographs.
 */
export type FigureFit = 'contain' | 'cover';

/** Default fit by generation method; only photographs tolerate cropping. */
export const DEFAULT_FIGURE_FIT: Record<FigureGeneration, FigureFit> = {
  mermaid: 'contain',
  htmlImage: 'contain',
  aiImage: 'cover',
};

/**
 * Maximum page-height fraction per image. Tight limits exclude portrait and square frames, leaving
 * monotonous landscape layouts. A 0.55 limit admits all four frames; packing and advice handle infeasible
 * results.
 */
export const MAX_FIGURE_PAGE_RATIO = 0.55;

/** Table presets match C# RestrictedHtmlDocumentRenderer and restricted HTML validation. */
export type TablePreset =
  | 'plain' | 'headerRow' | 'headerColumn' | 'headerRowAndColumn'
  | 'imageText' | 'threeImages' | 'fourImages';

/**
 * Table cell width fractions and padding correspond to C# ResolveTableCellPlacement. Image groups and mixed
 * image/text derive widths here; keep both implementations synchronized.
 */
export const CELL_PLACEMENT = {
  imageTextImage: { widthRatio: 0.44, paddingPt: 0 },
  imageTextBody: { widthRatio: 0.56, paddingPt: 12 },
  threeImages: { widthRatio: 1 / 3, paddingPt: 12 },
  fourImages: { widthRatio: 0.5, paddingPt: 12 },
} as const;

export const FIGURE_SIZES = Object.keys(FIGURE_GEOMETRY) as FigureSize[];

export interface PageMetrics {
  /** Usable body width in cm after left/right margins. */
  contentWidthCm: number;
  /** Usable body height in cm after top/bottom margins and header/footer decoration space. */
  contentHeightCm: number;
  bodySizePt: number;
  /** Width of one full-width Chinese character in cm, equal to font size. */
  charWidthCm: number;
  /** Body line height in cm, including line spacing. */
  lineHeightCm: number;
  /** Body paragraph spacing before and after, in cm. */
  paragraphSpaceBeforeCm: number;
  paragraphSpaceAfterCm: number;
  firstLineIndentChars: number;
  /** Chinese characters per line. */
  charsPerLine: number;
  /** Body lines per page. */
  linesPerPage: number;
  /** Words fitting a text-only page, for approximate scale display only. */
  charsPerPage: number;
  /** Height of each of six heading levels in cm, including paragraph spacing; index zero is level one. */
  headingHeightCm: number[];
  /** Frame heights for four image sizes in cm, excluding captions. */
  figureImageHeightCm: Record<FigureSize, number>;
  /** Whole-block heights for four image sizes in cm, including captions and paragraph spacing. */
  figureBlockHeightCm: Record<FigureSize, number>;
  /** Image block fraction of page height, used to detect sizes too large for the current template. */
  figurePageRatio: Record<FigureSize, number>;
  /** Whether level-one headings force new pages; when enabled, errors do not accumulate across chapters. */
  pageBreakBeforeLevel1: boolean;
  /** Body column count; for two columns, all widths above already refer to one column. */
  columnCount: number;
}

/**
 * One standard line equals 240 twips or 12pt. Word beforeLines/afterLines use standard grid lines rather
 * than paragraph line height, matching patches/@docx-editor.dev+core+2.15.0.patch. Converting with actual
 * body line height systematically inflates spacing: by 56% for small-four size at 1.2 line spacing.
 */
const STANDARD_LINE_PT = 12;

/** Convert paragraph spacing to cm from points or standard lines. */
function spacingToCm(value: number, unit: string) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return ptToCm(unit === 'lines' ? value * STANDARD_LINE_PT : value);
}

/** Body line-spacing multiplier; at-least/exact use fixed values, others use multipliers. */
function resolveLineSpacingCm(config: ExportFormatConfig, sizePt: number) {
  const body = config.body_text;
  const single = ptToCm(sizePt) * SINGLE_LINE_FACTOR;
  const value = Number(body.line_spacing_value) || 1;
  switch (body.line_spacing_mode) {
    case 'single':
      return single;
    case 'one-and-half':
      return single * 1.5;
    case 'double':
      return single * 2;
    case 'exact':
      return ptToCm(value);
    case 'at-least':
      return Math.max(single, ptToCm(value));
    case 'multiple':
    default:
      return single * value;
  }
}

/** Column spacing matches the 720 twips fixed in C# CreateSectionProperties. */
const COLUMN_SPACING_CM = 720 / 567;

/**
 * Usable page dimensions. Chrome geometry already includes decoration margins; divide content width by
 * column count to match C# ResolvePageContentWidth. Omitting that step doubles every width-dependent value
 * in two-column layouts.
 */
function resolveContentBox(page: PageSetupConfig) {
  const layout = resolveChromeLayout(page as unknown as Record<string, unknown>) as {
    widthCm: number;
    heightCm: number;
    marginTopCm: number;
    marginBottomCm: number;
    marginLeftCm: number;
    marginRightCm: number;
  };
  const rawWidthCm = layout.widthCm - layout.marginLeftCm - layout.marginRightCm;
  // Two columns apply only in landscape, matching C# landscape && two_column.
  const columnCount = page.two_column && page.orientation === 'landscape' ? 2 : 1;
  const widthCm = columnCount > 1
    ? Math.max(1, rawWidthCm - COLUMN_SPACING_CM * (columnCount - 1)) / columnCount
    : rawWidthCm;
  return {
    widthCm,
    heightCm: layout.heightCm - layout.marginTopCm - layout.marginBottomCm,
    columnCount,
  };
}

export function resolvePageMetrics(config: ExportFormatConfig): PageMetrics {
  const box = resolveContentBox(config.page);
  const bodySizePt = sizeToPt(config.body_text.size);
  const charWidthCm = ptToCm(bodySizePt);
  const lineHeightCm = resolveLineSpacingCm(config, bodySizePt);

  const paragraphSpaceBeforeCm = spacingToCm(
    config.body_text.spacing_before,
    config.body_text.spacing_before_unit,
  );
  const paragraphSpaceAfterCm = spacingToCm(
    config.body_text.spacing_after,
    config.body_text.spacing_after_unit,
  );

  const charsPerLine = Math.max(1, Math.floor(box.widthCm / charWidthCm));
  const linesPerPage = Math.max(1, Math.floor(box.heightCm / lineHeightCm));

  const headingHeightCm = config.headings.map((heading) => {
    const size = sizeToPt(heading.size);
    const spacing = Number(heading.line_spacing) || 1;
    return ptToCm(size) * SINGLE_LINE_FACTOR * spacing
      + ptToCm(heading.spacing_before_pt || 0)
      + ptToCm(heading.spacing_after_pt || 0);
  });

  // Image width is constrained by both size preset and maximum-image-width configuration, matching C# Math.Min.
  const maxWidthRatio = Math.max(0.1, Math.min(1, (config.image.max_width_percent || 100) / 100));
  const captionHeightCm = ptToCm(sizeToPt(config.image.caption_size)) * SINGLE_LINE_FACTOR;

  const figureImageHeightCm = {} as Record<FigureSize, number>;
  const figureBlockHeightCm = {} as Record<FigureSize, number>;
  const figurePageRatio = {} as Record<FigureSize, number>;
  for (const size of FIGURE_SIZES) {
    const spec = FIGURE_GEOMETRY[size];
    const widthCm = box.widthCm * Math.min(spec.widthRatio, maxWidthRatio);
    const imageHeightCm = widthCm * (spec.aspectHeight / spec.aspectWidth);
    const blockHeightCm = imageHeightCm + captionHeightCm + paragraphSpaceBeforeCm + paragraphSpaceAfterCm;
    figureImageHeightCm[size] = imageHeightCm;
    figureBlockHeightCm[size] = blockHeightCm;
    figurePageRatio[size] = blockHeightCm / box.heightCm;
  }

  return {
    contentWidthCm: box.widthCm,
    contentHeightCm: box.heightCm,
    bodySizePt,
    charWidthCm,
    lineHeightCm,
    paragraphSpaceBeforeCm,
    paragraphSpaceAfterCm,
    firstLineIndentChars: config.body_text.first_line_indent_chars || 0,
    charsPerLine,
    linesPerPage,
    charsPerPage: charsPerLine * linesPerPage,
    headingHeightCm,
    figureImageHeightCm,
    figureBlockHeightCm,
    figurePageRatio,
    pageBreakBeforeLevel1: config.heading_level1_page_break_before === true,
    columnCount: box.columnCount,
  };
}

/** Height in cm of a paragraph with the specified word count, including paragraph spacing. First-line indent reduces first-line capacity. */
export function paragraphHeightCm(metrics: PageMetrics, chars: number) {
  const effective = Math.max(1, chars + metrics.firstLineIndentChars);
  const lines = Math.max(1, Math.ceil(effective / metrics.charsPerLine));
  return lines * metrics.lineHeightCm + metrics.paragraphSpaceBeforeCm + metrics.paragraphSpaceAfterCm;
}

/** Inverse calculation: words fitting a given available height. */
export function charsForHeightCm(metrics: PageMetrics, heightCm: number) {
  const usable = heightCm - metrics.paragraphSpaceBeforeCm - metrics.paragraphSpaceAfterCm;
  const lines = Math.floor(usable / metrics.lineHeightCm);
  if (lines <= 0) return 0;
  return Math.max(0, lines * metrics.charsPerLine - metrics.firstLineIndentChars);
}

/**
 * List height treats each item as its own paragraph and accounts for list indentation. Include paragraph
 * spacing for every item: Word renders each li as an independent paragraph with body spacing, as documented
 * in the client development guide. Adding spacing only once underestimates height.
 */
export function listHeightCm(metrics: PageMetrics, items: number, charsPerItem: number) {
  const indent = metrics.firstLineIndentChars + 2;
  const perItemLines = Math.max(1, Math.ceil((charsPerItem + indent) / metrics.charsPerLine));
  const perItemCm = perItemLines * metrics.lineHeightCm
    + metrics.paragraphSpaceBeforeCm
    + metrics.paragraphSpaceAfterCm;
  return items * perItemCm;
}

/** Image frame width in a table cell, in cm: cell width minus padding. */
export function cellImageWidthCm(
  metrics: PageMetrics,
  placement: { widthRatio: number; paddingPt: number },
) {
  return Math.max(0.5, metrics.contentWidthCm * placement.widthRatio - ptToCm(placement.paddingPt));
}

/** Frame height at a given width. */
export function figureHeightAtWidthCm(widthCm: number, size: FigureSize) {
  const spec = FIGURE_GEOMETRY[size];
  return widthCm * (spec.aspectHeight / spec.aspectWidth);
}

/** Caption plus spacing before/after images; this is the extra height beyond the frame. */
export function figureChromeHeightCm(metrics: PageMetrics, captionSizePt: number) {
  return ptToCm(captionSizePt) * SINGLE_LINE_FACTOR
    + metrics.paragraphSpaceBeforeCm
    + metrics.paragraphSpaceAfterCm;
}

/**
 * Full height of a three-column or four-image group. Three images use one row, four use two; cell fractions
 * determine image width and frame ratios determine height.
 */
export function figureGroupHeightCm(
  metrics: PageMetrics,
  count: 3 | 4,
  size: FigureSize,
  captionSizePt: number,
) {
  const placement = count === 3 ? CELL_PLACEMENT.threeImages : CELL_PLACEMENT.fourImages;
  const widthCm = cellImageWidthCm(metrics, placement);
  const rows = count === 3 ? 1 : 2;
  const perRow = figureHeightAtWidthCm(widthCm, size) + ptToCm(captionSizePt) * SINGLE_LINE_FACTOR;
  // The group title takes one line, with small gaps above and below the table.
  return rows * perRow
    + ptToCm(captionSizePt) * SINGLE_LINE_FACTOR
    + metrics.paragraphSpaceBeforeCm
    + metrics.paragraphSpaceAfterCm;
}

/**
 * Full mixed image/text height uses the greater of image and text height. Text occupies a 0.56-width cell
 * with much lower line capacity than body text; account for it.
 */
export function imageTextHeightCm(
  metrics: PageMetrics,
  size: FigureSize,
  textChars: number,
  captionSizePt: number,
) {
  const imageWidthCm = cellImageWidthCm(metrics, CELL_PLACEMENT.imageTextImage);
  const imageHeightCm = figureHeightAtWidthCm(imageWidthCm, size)
    + ptToCm(captionSizePt) * SINGLE_LINE_FACTOR;

  const textWidthCm = cellImageWidthCm(metrics, CELL_PLACEMENT.imageTextBody);
  const charsPerLine = Math.max(1, Math.floor(textWidthCm / metrics.charWidthCm));
  const textHeightCm = Math.ceil(textChars / charsPerLine) * metrics.lineHeightCm;

  return Math.max(imageHeightCm, textHeightCm)
    + ptToCm(captionSizePt) * SINGLE_LINE_FACTOR
    + metrics.paragraphSpaceBeforeCm
    + metrics.paragraphSpaceAfterCm;
}

/** Words per line in the right image/text cell, used to convert word quotas into height. */
export function imageTextCharsPerLine(metrics: PageMetrics) {
  const widthCm = cellImageWidthCm(metrics, CELL_PLACEMENT.imageTextBody);
  return Math.max(1, Math.floor(widthCm / metrics.charWidthCm));
}

/**
 * Full data-table height. Estimate cell height from body line height plus padding, assuming one line per
 * cell. Multiline cells are taller, so this is optimistic; table growth pushes later text down without
 * creating artificial gaps.
 */
export function tableHeightCm(metrics: PageMetrics, rows: number, hasHeader: boolean, captionSizePt: number) {
  const rowHeightCm = metrics.lineHeightCm * 1.35;
  return (rows + (hasHeader ? 1 : 0)) * rowHeightCm
    + ptToCm(captionSizePt) * SINGLE_LINE_FACTOR
    + metrics.paragraphSpaceBeforeCm
    + metrics.paragraphSpaceAfterCm;
}
