/**
 * Export format configuration types, numbering options, and font/size mappings.
 */

/** Project-level template scope; paper, orientation, columns, and margins always apply to the entire document. */
export type ExportTemplateScope = 'ai-only' | 'document';

// ── Numbering formats ─────────────────────────────────────
export const HEADING_NUMBERING_FORMAT_OPTIONS = [
  { value: 'outline-decimal', label: '数字连续多级编号（1.1.1）' },
  { value: 'custom', label: '自定义' },
] as const;

export type HeadingNumberingFormat = (typeof HEADING_NUMBERING_FORMAT_OPTIONS)[number]['value'];

export const HEADING_BORDER_STRUCTURE_OPTIONS = [
  { value: '上下结构', label: '上下结构' },
  { value: '左右结构', label: '左右结构' },
] as const;

export type HeadingBorderStructure = (typeof HEADING_BORDER_STRUCTURE_OPTIONS)[number]['value'];

// ── Heading-level styles ──────────────────────────────────
export interface HeadingStyleConfig {
  font: string;
  size: string;                 // Chinese font-size name, such as small-two or size-four.
  alignment: string;            // Chinese alignment values: centered, justified, left, or right.
  bold: boolean;
  text_color: string;
  spacing_before_pt: number;
  spacing_after_pt: number;
  first_line_indent_chars: number;
  line_spacing: number;         // Multiplier, such as 1, 1.2, or 1.5.
  numbering_format: HeadingNumberingFormat;
  numbering_template: string;   // Custom numbering template supporting {zh}, {num}, {tail}, {tail1} through {tail6}, {full}, {circled}, etc.
}

export interface HeadingBorderConfig {
  enabled: boolean;
  include_headings: boolean;
  border_color: string;
  heading_top_border_space_pt: number;
  heading_bottom_border_space_pt: number;
  heading_bottom_border_enabled: boolean;
  level_cell_colors: string[];
  structure: HeadingBorderStructure;
}

// ── Body styles ──────────────────────────────────────
export const BODY_LINE_SPACING_OPTIONS = [
  { value: 'single', label: '单倍行距' },
  { value: 'one-and-half', label: '1.5 倍行距' },
  { value: 'double', label: '2 倍行距' },
  { value: 'at-least', label: '最小值' },
  { value: 'exact', label: '固定值' },
  { value: 'multiple', label: '多倍行距' },
] as const;

export type BodyLineSpacingMode = (typeof BODY_LINE_SPACING_OPTIONS)[number]['value'];
export type ParagraphSpacingUnit = 'lines' | 'pt';

export interface BodyTextStyleConfig {
  font: string;
  size: string;
  alignment: string;
  spacing_before: number;
  spacing_before_unit: ParagraphSpacingUnit;
  spacing_after: number;
  spacing_after_unit: ParagraphSpacingUnit;
  first_line_indent_chars: number;
  line_spacing_mode: BodyLineSpacingMode;
  line_spacing_value: number;
  list_style: ListStyle;
  ordered_list_style: OrderedListStyle;
  list_indent_chars: number;
}

export interface TableCellStyleConfig {
  font: string;
  size: string;
  alignment: string;
  text_color: string;
  background_color: string;
}

export interface TableStyleConfig {
  border_width: number;
  border_color: string;
  cell_padding_pt: number;
  full_width: boolean;
  caption_font: string;
  caption_size: string;
  caption_alignment: string;
  caption_bold: boolean;
  caption_italic: boolean;
  header_row: TableCellStyleConfig;
  first_column: TableCellStyleConfig;
  body_cell: TableCellStyleConfig;
}

export interface ImageStyleConfig {
  max_width_percent: number;
  alignment: string;
  caption_font: string;
  caption_size: string;
  caption_alignment: string;
  caption_bold: boolean;
  caption_italic: boolean;
}

// ── Paper types ──────────────────────────────────────
export const PAPER_SIZES = [
  { value: 'a4', label: 'A4', detail: '210×297mm 国际标准公文纸' },
  { value: 'a3', label: 'A3', detail: '297×420mm 国际标准大页' },
  { value: 'a5', label: 'A5', detail: '148×210mm 国际标准小册' },
  { value: 'b4', label: 'B4', detail: '250×353mm JIS 标准' },
  { value: 'b5', label: 'B5', detail: '176×250mm JIS 标准' },
  { value: 'letter', label: 'Letter', detail: '215.9×279.4mm 美标信纸' },
  { value: 'legal', label: 'Legal', detail: '215.9×355.6mm 美标法律文书' },
  { value: '16k', label: '16开', detail: '184×260mm 中国常用开本' },
] as const;

export type PaperSize = (typeof PAPER_SIZES)[number]['value'];

export const HEADER_FOOTER_STYLE_OPTIONS = [
  { value: 'plain', label: '经典文字', description: '单行页眉页脚，适合正式公文。' },
  { value: 'band', label: '通栏色带', description: '顶底通栏色条，页脚右侧页码方块。' },
  { value: 'rules', label: '公文双线', description: '页眉下、页脚上各一条文武线。' },
  { value: 'top-bar', label: '开槽色带', description: '通栏色带叠层，中间白槽标题，页脚活页码。' },
  { value: 'footer-badge', label: '底栏页码', description: '页眉保持细线，页脚色条加页码徽章。' },
  { value: 'slant', label: '斜切色块', description: '斜切叠层色块，封面感页眉。' },
  { value: 'letterhead', label: '品牌信头', description: '左侧色块信头，底边强调条，页码旁竖线。' },
  { value: 'frame', label: '图框角码', description: '双线圈框、四角实心角码，页脚图签页码。' },
] as const;

export type HeaderFooterStyle = (typeof HEADER_FOOTER_STYLE_OPTIONS)[number]['value'];

export const HTML_HEADER_FOOTER_STYLES: HeaderFooterStyle[] = ['top-bar', 'slant', 'letterhead', 'frame'];

export const PAGE_NUMBER_PAD_OPTIONS = [
  { value: 0, label: '不补零' },
  { value: 2, label: '2 位（01）' },
  { value: 3, label: '3 位（001）' },
] as const;

export type PageNumberPad = (typeof PAGE_NUMBER_PAD_OPTIONS)[number]['value'];

export function resolveHeaderFooterStyle(style: string | undefined): HeaderFooterStyle {
  if (style === 'spine') return 'letterhead';
  if (style === 'seal') return 'frame';
  if (HEADER_FOOTER_STYLE_OPTIONS.some((item) => item.value === style)) return style as HeaderFooterStyle;
  return 'plain';
}

export function isDecorativeHeaderFooterStyle(style: string | undefined): boolean {
  return resolveHeaderFooterStyle(style) !== 'plain';
}

export function isHtmlHeaderFooterStyle(style: string | undefined): boolean {
  return HTML_HEADER_FOOTER_STYLES.includes(resolveHeaderFooterStyle(style));
}

export function usesHeaderTextColor(style: string | undefined): boolean {
  const resolved = resolveHeaderFooterStyle(style);
  return resolved === 'plain' || resolved === 'rules' || resolved === 'footer-badge';
}

/** Paper dimensions in mm, width x height in portrait orientation. */
export const PAPER_DIMENSIONS: Record<PaperSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  a3: { width: 297, height: 420 },
  a5: { width: 148, height: 210 },
  b4: { width: 250, height: 353 },
  b5: { width: 176, height: 250 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
  '16k': { width: 184, height: 260 },
};

// ── Page settings ──────────────────────────────────────
export interface PageSetupConfig {
  paper_size: PaperSize;
  orientation: 'portrait' | 'landscape';
  two_column: boolean;
  first_page_different: boolean;
  margin_top_cm: number;
  margin_bottom_cm: number;
  margin_left_cm: number;
  margin_right_cm: number;
  header_enabled: boolean;
  header_text: string;
  header_font: string;
  header_size: string;
  header_alignment: string;
  header_color: string;
  header_footer_style: HeaderFooterStyle;
  header_badge_text: string;
  /** Decoration height: null uses the selected style's intrinsic height; explicit values are clamped to a safe range. */
  header_chrome_height_cm: number | null;
  /** Header text position: left is relative to the paper's left edge; top is relative to the decoration's top. null uses style defaults. */
  header_text_top_cm: number | null;
  header_text_left_cm: number | null;
  chrome_bar_color: string;
  chrome_accent_color: string;
  footer_enabled: boolean;
  footer_text: string;
  footer_distance_cm: number;
  /** Decoration height: null uses the selected style's intrinsic height; explicit values are clamped to a safe range. */
  footer_chrome_height_cm: number | null;
  /** Footer text position: left is relative to the paper's left edge; top is relative to the decoration's top. null uses style defaults. */
  footer_text_top_cm: number | null;
  footer_text_left_cm: number | null;
  footer_font: string;
  footer_size: string;
  footer_alignment: string;
  footer_color: string;
  page_number_enabled: boolean;
  page_number_format: string;   // Chinese page label surrounding the {page} placeholder.
  page_number_start: number;
  page_number_pad: PageNumberPad;
}

// ── Complete export format configuration ──────────────────────────────
export interface ExportFormatConfig {
  template_name: string;
  page: PageSetupConfig;
  heading_level1_page_break_before: boolean;
  heading_border: HeadingBorderConfig;
  headings: HeadingStyleConfig[];  // Index 0 = L1 (chapter), 5 = L6.
  body_text: BodyTextStyleConfig;
  table: TableStyleConfig;
  image: ImageStyleConfig;
}

export interface ExportTemplateRecord {
  template_id: string;
  template_name: string;
  config: ExportFormatConfig;
  /** System preset: cannot be edited or deleted, only copied into a user template. */
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

// ── Option constants ──────────────────────────────────────

export const FONT_OPTIONS = [
  '宋体',
  '新宋体',
  '黑体',
  '楷体',
  '仿宋',
  '微软雅黑',
  '微软雅黑 Light',
  '等线',
  '等线 Light',
  '隶书',
  '幼圆',
  '华文宋体',
  '华文黑体',
  '华文楷体',
  '华文仿宋',
  '华文中宋',
  '华文细黑',
  '苹方',
  'PingFang SC',
  '宋体-简',
  '黑体-简',
  '楷体-简',
  '冬青黑体简体中文',
  'Hiragino Sans GB',
  '思源宋体',
  '思源黑体',
  'Source Han Serif SC',
  'Source Han Sans SC',
] as const;

export type FontOption = (typeof FONT_OPTIONS)[number];

export const SIZE_OPTIONS = [
  '初号',
  '小初',
  '一号',
  '小一',
  '二号',
  '小二',
  '三号',
  '小三',
  '四号',
  '小四',
  '五号',
  '小五',
  '六号',
  '小六',
] as const;

export type SizeOption = (typeof SIZE_OPTIONS)[number];

export const ALIGNMENT_OPTIONS = [
  '居中对齐',
  '两端对齐',
  '左对齐',
  '右对齐',
] as const;

export type AlignmentOption = (typeof ALIGNMENT_OPTIONS)[number];

export const LIST_STYLE_OPTIONS = [
  { value: 'none', label: '无', icon: '无', font_family: 'inherit' },
  { value: 'disc', label: '实心圆点', icon: '•', font_family: 'Arial, sans-serif' },
  { value: 'circle', label: '空心圆点', icon: '○', font_family: 'Arial, sans-serif' },
  { value: 'square', label: '实心方块', icon: '■', font_family: 'Arial, sans-serif' },
  { value: 'diamond', label: '实心菱形', icon: '◆', font_family: 'Arial, sans-serif' },
  { value: 'dash', label: '短横线', icon: '–', font_family: 'Arial, sans-serif' },
  { value: 'check', label: '对勾', icon: '✓', font_family: 'Segoe UI Symbol, Arial, sans-serif' },
  { value: 'arrow', label: '箭头', icon: '➢', font_family: 'Segoe UI Symbol, Arial, sans-serif' },
  { value: 'sparkle', label: '四角星', icon: '✧', font_family: 'Segoe UI Symbol, Arial, sans-serif' },
] as const;

export type ListStyle = (typeof LIST_STYLE_OPTIONS)[number]['value'];

export const ORDERED_LIST_STYLE_OPTIONS = [
  { value: 'decimal-dot', label: '数字编号（1.）' },
  { value: 'decimal-paren', label: '数字括号（1）' },
  { value: 'decimal-full-paren', label: '数字全括号（（1））' },
  { value: 'chinese-dot', label: '中文编号（一、）' },
  { value: 'chinese-paren', label: '中文括号（（一））' },
  { value: 'lower-alpha', label: '小写字母（a.）' },
  { value: 'upper-alpha', label: '大写字母（A.）' },
  { value: 'lower-roman', label: '小写罗马（i.）' },
  { value: 'upper-roman', label: '大写罗马（I.）' },
] as const;

export type OrderedListStyle = (typeof ORDERED_LIST_STYLE_OPTIONS)[number]['value'];

// ── Chinese font-size to pt mapping ────────────────────────────
export const SIZE_TO_PT: Record<string, number> = {
  '初号': 42,
  '小初': 36,
  '一号': 26,
  '小一': 24,
  '二号': 22,
  '小二': 18,
  '三号': 16,
  '小三': 15,
  '四号': 14,
  '小四': 12,
  '五号': 10.5,
  '小五': 9,
  '六号': 7.5,
  '小六': 6.5,
};

// ── Chinese font to CSS font-family mapping ───────────────
export const FONT_TO_CSS: Record<string, string> = {
  '宋体': "'SimSun', 'STSong', serif",
  '新宋体': "'NSimSun', 'SimSun', serif",
  '黑体': "'SimHei', 'STHeiti', sans-serif",
  '楷体': "'KaiTi', 'STKaiti', 'Kai', serif",
  '仿宋': "'FangSong', 'STFangsong', serif",
  '微软雅黑': "'Microsoft YaHei', sans-serif",
  '微软雅黑 Light': "'Microsoft YaHei UI Light', 'Microsoft YaHei Light', 'Microsoft YaHei', sans-serif",
  '等线': "'DengXian', 'Microsoft YaHei', sans-serif",
  '等线 Light': "'DengXian Light', 'DengXian', sans-serif",
  '隶书': "'LiSu', 'STLiti', serif",
  '幼圆': "'YouYuan', sans-serif",
  '华文宋体': "'华文宋体', 'STSong', serif",
  '华文黑体': "'华文黑体', 'STHeiti', sans-serif",
  '华文楷体': "'华文楷体', 'STKaiti', serif",
  '华文仿宋': "'华文仿宋', 'STFangsong', serif",
  '华文中宋': "'华文中宋', 'STZhongsong', serif",
  '华文细黑': "'华文细黑', 'STXihei', sans-serif",
  '苹方': "'PingFang SC', 'PingFang', sans-serif",
  'PingFang SC': "'PingFang SC', 'PingFang', sans-serif",
  '宋体-简': "'Songti SC', 'STSong', serif",
  '黑体-简': "'Heiti SC', 'STHeiti', sans-serif",
  '楷体-简': "'Kaiti SC', 'STKaiti', serif",
  '冬青黑体简体中文': "'Hiragino Sans GB', '冬青黑体简体中文', sans-serif",
  'Hiragino Sans GB': "'Hiragino Sans GB', sans-serif",
  '思源宋体': "'Source Han Serif SC', 'Noto Serif CJK SC', serif",
  '思源黑体': "'Source Han Sans SC', 'Noto Sans CJK SC', sans-serif",
  'Source Han Serif SC': "'Source Han Serif SC', 'Noto Serif CJK SC', serif",
  'Source Han Sans SC': "'Source Han Sans SC', 'Noto Sans CJK SC', sans-serif",
};

// ── Alignment to CSS text-align mapping ────────────────
export const ALIGNMENT_TO_CSS: Record<string, string> = {
  '居中对齐': 'center',
  '两端对齐': 'justify',
  '左对齐': 'left',
  '右对齐': 'right',
};

// ── Defaults ────────────────────────────────────────

const DEFAULT_PAGE_SETUP: PageSetupConfig = {
  paper_size: 'a4',
  orientation: 'portrait',
  two_column: false,
  first_page_different: false,
  margin_top_cm: 2,
  margin_bottom_cm: 2,
  margin_left_cm: 2,
  margin_right_cm: 2,
  header_enabled: false,
  header_text: '',
  header_font: '宋体',
  header_size: '小五',
  header_alignment: '居中对齐',
  header_color: '#536176',
  header_footer_style: 'plain',
  header_badge_text: '',
  header_chrome_height_cm: null,
  header_text_top_cm: null,
  header_text_left_cm: null,
  chrome_bar_color: '#e8eef5',
  chrome_accent_color: '#536176',
  footer_enabled: false,
  footer_text: '',
  footer_distance_cm: 0,
  footer_chrome_height_cm: null,
  footer_text_top_cm: null,
  footer_text_left_cm: null,
  footer_font: '宋体',
  footer_size: '小五',
  footer_alignment: '居中对齐',
  footer_color: '#536176',
  page_number_enabled: false,
  page_number_format: '第{page}页',
  page_number_start: 1,
  page_number_pad: 0,
};

const DEFAULT_BODY_TEXT: BodyTextStyleConfig = {
  font: '宋体',
  size: '小四',
  alignment: '左对齐',
  spacing_before: 0,
  spacing_before_unit: 'lines',
  spacing_after: 0,
  spacing_after_unit: 'lines',
  first_line_indent_chars: 2,
  line_spacing_mode: 'multiple',
  line_spacing_value: 1.2,
  list_style: 'disc',
  ordered_list_style: 'decimal-dot',
  list_indent_chars: 2,
};

const DEFAULT_TABLE_CELL: TableCellStyleConfig = {
  font: '宋体',
  size: '小四',
  alignment: '左对齐',
  text_color: '#243048',
  background_color: '#ffffff',
};

const DEFAULT_TABLE_STYLE: TableStyleConfig = {
  border_width: 1,
  border_color: '#dcdff6',
  cell_padding_pt: 6,
  full_width: true,
  caption_font: '宋体',
  caption_size: '小四',
  caption_alignment: '居中对齐',
  caption_bold: true,
  caption_italic: false,
  header_row: {
    font: '黑体',
    size: '小四',
    alignment: '居中对齐',
    text_color: '#243048',
    background_color: '#eef5ff',
  },
  first_column: {
    font: '宋体',
    size: '小四',
    alignment: '左对齐',
    text_color: '#243048',
    background_color: '#ffffff',
  },
  body_cell: { ...DEFAULT_TABLE_CELL },
};

const DEFAULT_IMAGE_STYLE: ImageStyleConfig = {
  max_width_percent: 90,
  alignment: '居中对齐',
  caption_font: '宋体',
  caption_size: '小五',
  caption_alignment: '居中对齐',
  caption_bold: false,
  caption_italic: false,
};

export const DEFAULT_HEADING_BORDER_CELL_COLORS = ['#eef5ff', '#f3f7ff', '#f8fbff', '#fbfdff', '#ffffff', '#ffffff'] as const;

const DEFAULT_HEADING_BORDER: HeadingBorderConfig = {
  enabled: false,
  include_headings: true,
  border_color: '#cfd8ee',
  heading_top_border_space_pt: 1,
  heading_bottom_border_space_pt: 1,
  heading_bottom_border_enabled: false,
  level_cell_colors: [...DEFAULT_HEADING_BORDER_CELL_COLORS],
  structure: '上下结构',
};

/** Default export format: chapter/section numbering, then local sequential numbering from level three. */
export const DEFAULT_EXPORT_FORMAT: ExportFormatConfig = {
  template_name: '默认模版',
  page: { ...DEFAULT_PAGE_SETUP },
  heading_level1_page_break_before: false,
  heading_border: { ...DEFAULT_HEADING_BORDER },
  headings: [
    // L1: Chapter One - SimHei, small-two, centered.
    { font: '黑体', size: '小二', alignment: '居中对齐', bold: false, text_color: '#243048', spacing_before_pt: 10, spacing_after_pt: 10, first_line_indent_chars: 0, line_spacing: 1, numbering_format: 'custom', numbering_template: '第{zh}章' },
    // L2: Section One - SimHei, size-four, justified.
    { font: '黑体', size: '四号', alignment: '两端对齐', bold: false, text_color: '#243048', spacing_before_pt: 10, spacing_after_pt: 10, first_line_indent_chars: 0, line_spacing: 1, numbering_format: 'custom', numbering_template: '第{zh}节' },
    // L3: 1 - SimHei, small-four, justified.
    { font: '黑体', size: '小四', alignment: '两端对齐', bold: false, text_color: '#243048', spacing_before_pt: 10, spacing_after_pt: 10, first_line_indent_chars: 0, line_spacing: 1, numbering_format: 'custom', numbering_template: '{tail}' },
    // L4: 1.1 - KaiTi, small-four.
    { font: '楷体', size: '小四', alignment: '两端对齐', bold: false, text_color: '#243048', spacing_before_pt: 5, spacing_after_pt: 5, first_line_indent_chars: 0, line_spacing: 1, numbering_format: 'custom', numbering_template: '{tail}' },
    // L5: 1.1.1 - SimHei, small-four.
    { font: '黑体', size: '小四', alignment: '两端对齐', bold: false, text_color: '#243048', spacing_before_pt: 5, spacing_after_pt: 5, first_line_indent_chars: 0, line_spacing: 1, numbering_format: 'custom', numbering_template: '{tail}' },
    // L6: 1.1.1.1 - SimSun, small-four.
    { font: '宋体', size: '小四', alignment: '两端对齐', bold: false, text_color: '#243048', spacing_before_pt: 0, spacing_after_pt: 0, first_line_indent_chars: 0, line_spacing: 1, numbering_format: 'custom', numbering_template: '{tail}' },
  ],
  body_text: { ...DEFAULT_BODY_TEXT },
  table: {
    border_width: DEFAULT_TABLE_STYLE.border_width,
    border_color: DEFAULT_TABLE_STYLE.border_color,
    cell_padding_pt: DEFAULT_TABLE_STYLE.cell_padding_pt,
    full_width: DEFAULT_TABLE_STYLE.full_width,
    caption_font: DEFAULT_TABLE_STYLE.caption_font,
    caption_size: DEFAULT_TABLE_STYLE.caption_size,
    caption_alignment: DEFAULT_TABLE_STYLE.caption_alignment,
    caption_bold: DEFAULT_TABLE_STYLE.caption_bold,
    caption_italic: DEFAULT_TABLE_STYLE.caption_italic,
    header_row: { ...DEFAULT_TABLE_STYLE.header_row },
    first_column: { ...DEFAULT_TABLE_STYLE.first_column },
    body_cell: { ...DEFAULT_TABLE_STYLE.body_cell },
  },
  image: { ...DEFAULT_IMAGE_STYLE },
};

/** Chinese heading-level labels. */
export const HEADING_LEVEL_LABELS = [
  '一级标题',
  '二级标题',
  '三级标题',
  '四级标题',
  '五级标题',
  '六级标题',
];

// ── ES/EN mappings for Chinese option labels ──────────────────────
// Translate display text only; value/config entries (fonts, sizes, templates, alignment, etc.) retain their original Chinese values because they define Word output.
// Central getters: getExportOptionLabel / getExportOptionDescription, without feature imports.

/** Language parameter structurally compatible with AppLocale; shared/types avoids importing i18n to prevent feature dependencies. */
export type ExportOptionLocale = 'zh' | 'es' | 'en';

export type ExportOptionGroup =
  | 'heading-numbering'
  | 'heading-border-structure'
  | 'body-line-spacing'
  | 'paper'
  | 'header-footer-style'
  | 'page-pad'
  | 'alignment'
  | 'list-style'
  | 'ordered-list'
  | 'heading-level';

interface ExportOptionText {
  es: string;
  en: string;
}

const HEADING_NUMBERING_I18N: Record<string, ExportOptionText> = {
  '数字连续多级编号（1.1.1）': { es: 'Numeración multinivel continua (1.1.1)', en: 'Continuous multilevel numbering (1.1.1)' },
  '自定义': { es: 'Personalizada', en: 'Custom' },
};

const HEADING_BORDER_STRUCTURE_I18N: Record<string, ExportOptionText> = {
  '上下结构': { es: 'Estructura vertical', en: 'Top-bottom layout' },
  '左右结构': { es: 'Estructura lateral', en: 'Side-by-side layout' },
};

const BODY_LINE_SPACING_I18N: Record<string, ExportOptionText> = {
  '单倍行距': { es: 'Interlineado sencillo', en: 'Single spacing' },
  '1.5 倍行距': { es: 'Interlineado 1,5', en: '1.5 line spacing' },
  '2 倍行距': { es: 'Interlineado doble', en: 'Double spacing' },
  '最小值': { es: 'Valor mínimo', en: 'At least' },
  '固定值': { es: 'Valor fijo', en: 'Exactly' },
  '多倍行距': { es: 'Múltiple', en: 'Multiple' },
};

const PAPER_LABEL_I18N: Record<string, ExportOptionText> = {
  '16开': { es: '16K', en: '16K' },
};

const PAPER_DETAIL_I18N: Record<string, ExportOptionText> = {
  '210×297mm 国际标准公文纸': { es: '210×297 mm, papel estándar internacional', en: '210×297mm international standard document paper' },
  '297×420mm 国际标准大页': { es: '297×420 mm, formato grande estándar', en: '297×420mm international standard large format' },
  '148×210mm 国际标准小册': { es: '148×210 mm, folleto estándar', en: '148×210mm international standard booklet' },
  '250×353mm JIS 标准': { es: '250×353 mm, estándar JIS', en: '250×353mm JIS standard' },
  '176×250mm JIS 标准': { es: '176×250 mm, estándar JIS', en: '176×250mm JIS standard' },
  '215.9×279.4mm 美标信纸': { es: '215,9×279,4 mm, carta EE. UU.', en: '215.9×279.4mm US Letter' },
  '215.9×355.6mm 美标法律文书': { es: '215,9×355,6 mm, oficio EE. UU.', en: '215.9×355.6mm US Legal' },
  '184×260mm 中国常用开本': { es: '184×260 mm, formato chino habitual', en: '184×260mm common Chinese format' },
};

const HEADER_FOOTER_STYLE_I18N: Record<string, ExportOptionText & { descEs: string; descEn: string }> = {
  '经典文字': { es: 'Texto clásico', en: 'Classic text', descEs: 'Encabezado y pie de una línea; para documentos formales.', descEn: 'Single-line header and footer; for formal documents.' },
  '通栏色带': { es: 'Cinta a ancho completo', en: 'Full-width band', descEs: 'Bandas superior e inferior; página en bloque a la derecha.', descEn: 'Top and bottom bands; page block on the right.' },
  '公文双线': { es: 'Doble línea oficial', en: 'Official double rule', descEs: 'Línea bajo el encabezado y sobre el pie.', descEn: 'One rule under the header and one above the footer.' },
  '开槽色带': { es: 'Cinta con ranura', en: 'Slotted band', descEs: 'Bandas superpuestas con título central y página viva.', descEn: 'Layered bands with centered title slot and live page number.' },
  '底栏页码': { es: 'Página en barra inferior', en: 'Footer page badge', descEs: 'Encabezado fino; pie con cinta e insignia de página.', descEn: 'Thin header rule; footer band with page badge.' },
  '斜切色块': { es: 'Bloques en diagonal', en: 'Slanted blocks', descEs: 'Bloques superpuestos en diagonal; aire de portada.', descEn: 'Layered slanted blocks; cover-style header.' },
  '品牌信头': { es: 'Membrete de marca', en: 'Brand letterhead', descEs: 'Membrete lateral, franja inferior y línea junto a la página.', descEn: 'Side letterhead block, bottom accent bar, rule by the page number.' },
  '图框角码': { es: 'Marco con esquinas', en: 'Framed corners', descEs: 'Doble marco con esquinas sólidas y página en etiqueta.', descEn: 'Double frame with solid corners and tag-style page number.' },
};

const PAGE_PAD_I18N: Record<string, ExportOptionText> = {
  '不补零': { es: 'Sin relleno', en: 'No padding' },
  '2 位（01）': { es: '2 dígitos (01)', en: '2 digits (01)' },
  '3 位（001）': { es: '3 dígitos (001)', en: '3 digits (001)' },
};

const ALIGNMENT_I18N: Record<string, ExportOptionText> = {
  '居中对齐': { es: 'Centrado', en: 'Center' },
  '两端对齐': { es: 'Justificado', en: 'Justify' },
  '左对齐': { es: 'Izquierda', en: 'Left' },
  '右对齐': { es: 'Derecha', en: 'Right' },
};

const LIST_STYLE_I18N: Record<string, ExportOptionText> = {
  '无': { es: 'Ninguno', en: 'None' },
  '实心圆点': { es: 'Punto sólido', en: 'Solid dot' },
  '空心圆点': { es: 'Punto hueco', en: 'Hollow dot' },
  '实心方块': { es: 'Cuadrado sólido', en: 'Solid square' },
  '实心菱形': { es: 'Rombo sólido', en: 'Solid diamond' },
  '短横线': { es: 'Guion corto', en: 'Short dash' },
  '对勾': { es: 'Marca de verificación', en: 'Check mark' },
  '箭头': { es: 'Flecha', en: 'Arrow' },
  '四角星': { es: 'Estrella de cuatro puntas', en: 'Four-point star' },
};

const ORDERED_LIST_STYLE_I18N: Record<string, ExportOptionText> = {
  '数字编号（1.）': { es: 'Números (1.)', en: 'Numbers (1.)' },
  '数字括号（1）': { es: 'Números con paréntesis (1)', en: 'Numbers with paren (1)' },
  '数字全括号（（1））': { es: 'Números con doble paréntesis ((1))', en: 'Numbers with double paren ((1))' },
  '中文编号（一、）': { es: 'Numeración china', en: 'Chinese numerals' },
  '中文括号（（一））': { es: 'Numeración china entre paréntesis', en: 'Chinese numerals in parentheses' },
  '小写字母（a.）': { es: 'Minúsculas (a.)', en: 'Lowercase (a.)' },
  '大写字母（A.）': { es: 'Mayúsculas (A.)', en: 'Uppercase (A.)' },
  '小写罗马（i.）': { es: 'Romanos en minúsculas (i.)', en: 'Lower roman (i.)' },
  '大写罗马（I.）': { es: 'Romanos en mayúsculas (I.)', en: 'Upper roman (I.)' },
};

const HEADING_LEVEL_I18N: Record<string, ExportOptionText> = {
  '一级标题': { es: 'Título de nivel 1', en: 'Level 1 heading' },
  '二级标题': { es: 'Título de nivel 2', en: 'Level 2 heading' },
  '三级标题': { es: 'Título de nivel 3', en: 'Level 3 heading' },
  '四级标题': { es: 'Título de nivel 4', en: 'Level 4 heading' },
  '五级标题': { es: 'Título de nivel 5', en: 'Level 5 heading' },
  '六级标题': { es: 'Título de nivel 6', en: 'Level 6 heading' },
};

const LABEL_MAPS: Record<ExportOptionGroup, Record<string, ExportOptionText>> = {
  'heading-numbering': HEADING_NUMBERING_I18N,
  'heading-border-structure': HEADING_BORDER_STRUCTURE_I18N,
  'body-line-spacing': BODY_LINE_SPACING_I18N,
  'paper': { ...PAPER_LABEL_I18N, ...PAPER_DETAIL_I18N },
  'header-footer-style': HEADER_FOOTER_STYLE_I18N,
  'page-pad': PAGE_PAD_I18N,
  'alignment': ALIGNMENT_I18N,
  'list-style': LIST_STYLE_I18N,
  'ordered-list': ORDERED_LIST_STYLE_I18N,
  'heading-level': HEADING_LEVEL_I18N,
};

/**
 * Get option display text by group. zh or missing translations use fallback (original zh label). value is
 * the display key: usually zh label; paper accepts label/detail and page-pad accepts zh label.
 */
export function getExportOptionLabel(
  group: ExportOptionGroup,
  key: string | number,
  lang: ExportOptionLocale | string,
  fallback?: string,
): string {
  const textFallback = fallback ?? String(key);
  if (lang === 'zh') return textFallback;
  const entry = LABEL_MAPS[group]?.[String(key)];
  if (!entry) return textFallback;
  return lang === 'es' ? entry.es : entry.en;
}

/**
 * Additional option descriptions: paper uses detail, header-footer-style uses description, and other groups
 * use fallback.
 */
export function getExportOptionDescription(
  group: ExportOptionGroup,
  key: string | number,
  lang: ExportOptionLocale | string,
  fallback?: string,
): string {
  const textFallback = fallback ?? String(key);
  if (lang === 'zh') return textFallback;
  if (group === 'paper') {
    const entry = PAPER_DETAIL_I18N[String(key)];
    if (!entry) return textFallback;
    return lang === 'es' ? entry.es : entry.en;
  }
  if (group === 'header-footer-style') {
    const entry = HEADER_FOOTER_STYLE_I18N[String(key)];
    if (!entry) return textFallback;
    return lang === 'es' ? entry.descEs : entry.descEn;
  }
  return textFallback;
}

/** Localized heading-level label by index, falling back to original text when out of range. */
export function getHeadingLevelLabel(index: number, lang: ExportOptionLocale | string, fallback?: string): string {
  const zh = HEADING_LEVEL_LABELS[index] ?? fallback ?? String(index + 1);
  return getExportOptionLabel('heading-level', zh, lang, fallback ?? zh);
}
