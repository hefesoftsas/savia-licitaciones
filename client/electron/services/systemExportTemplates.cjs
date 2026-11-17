const { COLOMBIA_EXPORT_TEMPLATES } = require('./colombiaTemplates.cjs');
const { SPAIN_EXPORT_TEMPLATES } = require('./spainTemplates.cjs');
const { cloneDefaultExportFormat } = require('./exportFormatDefaults.cjs');

/**
 * Source of truth for system export presets.
 *
 * Synchronize these definitions idempotently into export_templates on every startup (templateStore.syncSystemTemplates),
 * so preset styling changes require editing this file only, without database migrations.
 *
 * Never change a released template_id: technical_plan_generation_config.export_template_id references it,
 * and changes invalidate existing selections. Array order determines the system group order in personal templates.
 *
 * Values derive from layout/theme presets in src/features/export-format/exportFormatPresets.ts;
 * those constants provide established field combinations, merged here into complete persisted templates.
 *
 * Color convention from the client development guide: band footers fill with chrome_accent_color and use footer_color for text.
 * Rendering does not adjust these, so maintain both together; frame footers use white backgrounds and accent borders with dark text.
 */

/** Shared six-level heading builder, avoiding twelve repeated fields per template. */
function heading(font, size, alignment, bold, textColor, spacingBefore, spacingAfter, numberingTemplate, lineSpacing = 1) {
  return {
    font,
    size,
    alignment,
    bold,
    text_color: textColor,
    spacing_before_pt: spacingBefore,
    spacing_after_pt: spacingAfter,
    first_line_indent_chars: 0,
    line_spacing: lineSpacing,
    numbering_format: 'custom',
    numbering_template: numberingTemplate,
  };
}

/** Conventional bid numbering: chapter labels at level one, section labels at level two, and only the final numeric segment below. */
const BID_NUMBERING = ['第{zh}章', '第{zh}节', '{tail}', '{tail}', '{tail}', '{tail}'];

/** Shallow-merge each section over default export formatting, specifying only differing fields. */
function buildConfig(overrides) {
  const base = cloneDefaultExportFormat();
  return {
    ...base,
    ...overrides,
    page: { ...base.page, ...(overrides.page || {}) },
    heading_border: { ...base.heading_border, ...(overrides.heading_border || {}) },
    headings: overrides.headings || base.headings,
    body_text: { ...base.body_text, ...(overrides.body_text || {}) },
    table: {
      ...base.table,
      ...(overrides.table || {}),
      header_row: { ...base.table.header_row, ...(overrides.table?.header_row || {}) },
      first_column: { ...base.table.first_column, ...(overrides.table?.first_column || {}) },
      body_cell: { ...base.table.body_cell, ...(overrides.table?.body_cell || {}) },
    },
    image: { ...base.image, ...(overrides.image || {}) },
  };
}

const SYSTEM_EXPORT_TEMPLATES = [
  ...COLOMBIA_EXPORT_TEMPLATES,
  ...SPAIN_EXPORT_TEMPLATES,
  {
    // Conventional undecorated black-and-white bid layout, minimizing review objections.
    template_id: 'tpl-system-standard-bid',
    config: buildConfig({
      template_name: '标准投标简版',
      page: {
        paper_size: 'a4',
        orientation: 'portrait',
        two_column: false,
        first_page_different: false,
        margin_top_cm: 2,
        margin_bottom_cm: 2,
        margin_left_cm: 2,
        margin_right_cm: 2,
        header_enabled: false,
        header_footer_style: 'plain',
        header_color: '#000000',
        footer_enabled: false,
        footer_color: '#000000',
        // Headers/footers are off, but page numbers remain because shouldBuildFooter checks page_number_enabled only,
        // leaving a single undecorated page number in the footer.
        page_number_enabled: true,
        page_number_format: '第{page}页',
      },
      // The simple layout flows continuously; new-page chapters belong to formal binding, following the distinction in exportFormatPresets.ts
      // between standard-bid and formal-binding. Enabling them would leave only two exported heading lines before content
      // and make the first page nearly blank.
      heading_level1_page_break_before: false,
      heading_border: {
        enabled: false,
        border_color: '#000000',
        level_cell_colors: ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'],
      },
      headings: [
        heading('黑体', '小二', '居中对齐', false, '#000000', 12, 12, BID_NUMBERING[0]),
        heading('黑体', '四号', '两端对齐', false, '#000000', 10, 10, BID_NUMBERING[1]),
        heading('黑体', '小四', '两端对齐', false, '#000000', 8, 8, BID_NUMBERING[2]),
        heading('楷体', '小四', '两端对齐', false, '#000000', 6, 6, BID_NUMBERING[3]),
        heading('黑体', '小四', '两端对齐', false, '#000000', 6, 6, BID_NUMBERING[4]),
        heading('宋体', '小四', '两端对齐', false, '#000000', 0, 0, BID_NUMBERING[5]),
      ],
      body_text: {
        font: '宋体',
        size: '小四',
        alignment: '两端对齐',
        first_line_indent_chars: 2,
        line_spacing_mode: 'multiple',
        line_spacing_value: 1.5,
        list_style: 'disc',
        ordered_list_style: 'decimal-dot',
        list_indent_chars: 2,
      },
      table: {
        border_width: 1,
        border_color: '#000000',
        cell_padding_pt: 6,
        full_width: true,
        caption_font: '宋体',
        caption_size: '小四',
        caption_bold: true,
        header_row: { font: '黑体', size: '小四', alignment: '居中对齐', text_color: '#000000', background_color: '#ffffff' },
        first_column: { font: '宋体', size: '小四', alignment: '左对齐', text_color: '#000000', background_color: '#ffffff' },
        body_cell: { font: '宋体', size: '小四', alignment: '左对齐', text_color: '#000000', background_color: '#ffffff' },
      },
      image: {
        max_width_percent: 90,
        caption_font: '宋体',
        caption_size: '小五',
      },
    }),
  },
  {
    // Blue theme, full-width band headers/footers, and colored heading blocks for visually polished technical plans.
    template_id: 'tpl-system-a4-visual',
    config: buildConfig({
      template_name: 'A4 图文版',
      page: {
        paper_size: 'a4',
        orientation: 'portrait',
        two_column: false,
        first_page_different: false,
        margin_top_cm: 2.2,
        margin_bottom_cm: 2,
        margin_left_cm: 2,
        margin_right_cm: 2,
        header_enabled: true,
        header_footer_style: 'band',
        header_font: '黑体',
        header_size: '小五',
        header_alignment: '左对齐',
        // Band header text color derives from decoration background (textLayout colors.onBar); this value applies only when switching
        // to plain, rules, or footer-badge.
        header_color: '#315b9f',
        chrome_bar_color: '#dbeafe',
        chrome_accent_color: '#173f82',
        footer_enabled: true,
        footer_font: '宋体',
        footer_size: '小五',
        footer_alignment: '居中对齐',
        // Band footers fill entirely with chrome_accent_color; text must contrast with it.
        // #ffffff = contrastText('#173f82'); update this together with the accent color.
        footer_color: '#ffffff',
        page_number_enabled: true,
        page_number_format: '- {page} -',
        page_number_pad: 2,
      },
      heading_level1_page_break_before: true,
      heading_border: {
        enabled: true,
        structure: '上下结构',
        border_color: '#2174fd',
        heading_top_border_space_pt: 5,
        heading_bottom_border_space_pt: 4,
        heading_bottom_border_enabled: true,
        level_cell_colors: ['#dbeafe', '#e8f1ff', '#f1f7ff', '#f6faff', '#ffffff', '#ffffff'],
      },
      headings: [
        heading('黑体', '小二', '居中对齐', true, '#173f82', 0, 0, BID_NUMBERING[0], 1.2),
        heading('黑体', '四号', '左对齐', true, '#173f82', 0, 0, BID_NUMBERING[1], 1.2),
        heading('黑体', '小四', '左对齐', true, '#173f82', 0, 0, BID_NUMBERING[2], 1.2),
        heading('楷体', '小四', '左对齐', false, '#173f82', 0, 0, BID_NUMBERING[3], 1.2),
        heading('黑体', '小四', '左对齐', false, '#243048', 0, 0, BID_NUMBERING[4], 1.2),
        heading('宋体', '小四', '左对齐', false, '#243048', 0, 0, BID_NUMBERING[5], 1.2),
      ],
      body_text: {
        font: '宋体',
        size: '小四',
        alignment: '两端对齐',
        spacing_after: 4,
        spacing_after_unit: 'pt',
        first_line_indent_chars: 2,
        line_spacing_mode: 'multiple',
        line_spacing_value: 1.3,
        list_style: 'diamond',
        ordered_list_style: 'decimal-dot',
        list_indent_chars: 2,
      },
      table: {
        border_width: 0.75,
        border_color: '#8db8ff',
        cell_padding_pt: 6,
        full_width: true,
        caption_font: '黑体',
        caption_size: '小四',
        caption_bold: true,
        header_row: { font: '黑体', size: '小四', alignment: '居中对齐', text_color: '#123a78', background_color: '#dbeafe' },
        first_column: { font: '宋体', size: '小四', alignment: '左对齐', text_color: '#173f82', background_color: '#eef5ff' },
        body_cell: { font: '宋体', size: '小四', alignment: '左对齐', text_color: '#243048', background_color: '#ffffff' },
      },
      image: {
        max_width_percent: 92,
        caption_font: '楷体',
        caption_size: '小五',
        caption_bold: true,
      },
    }),
  },
  {
    // A3 landscape with two columns and framed headers/footers; chapter frames use paragraph borders while business tables remain top-level.
    template_id: 'tpl-system-a3-landscape-visual',
    config: buildConfig({
      template_name: 'A3 横版图文',
      page: {
        paper_size: 'a3',
        orientation: 'landscape',
        two_column: true,
        first_page_different: false,
        margin_top_cm: 1.6,
        margin_bottom_cm: 1.6,
        margin_left_cm: 1.5,
        margin_right_cm: 1.5,
        header_enabled: true,
        header_footer_style: 'frame',
        header_font: '黑体',
        header_size: '小五',
        header_alignment: '居中对齐',
        // Frame header text uses colors.accent, also determined by decoration.
        header_color: '#7054aa',
        chrome_bar_color: '#f2edff',
        chrome_accent_color: '#5b3ca6',
        footer_enabled: true,
        footer_font: '宋体',
        footer_size: '小五',
        footer_alignment: '居中对齐',
        // Frame footers have white backgrounds and accent borders; dark-purple text is readable without inversion.
        footer_color: '#5b3ca6',
        page_number_enabled: true,
        page_number_format: '第{page}页',
      },
      heading_level1_page_break_before: true,
      heading_border: {
        enabled: true,
        structure: '上下结构',
        border_color: '#a78bfa',
        heading_top_border_space_pt: 5,
        heading_bottom_border_space_pt: 4,
        heading_bottom_border_enabled: true,
        level_cell_colors: ['#f2edff', '#f6f2ff', '#faf7ff', '#fdfbff', '#ffffff', '#ffffff'],
      },
      headings: [
        heading('黑体', '三号', '居中对齐', true, '#5b3ca6', 0, 0, BID_NUMBERING[0], 1.2),
        heading('黑体', '小三', '左对齐', true, '#5b3ca6', 0, 0, BID_NUMBERING[1], 1.2),
        heading('黑体', '四号', '左对齐', true, '#5b3ca6', 0, 0, BID_NUMBERING[2], 1.2),
        heading('楷体', '小四', '左对齐', false, '#5b3ca6', 0, 0, BID_NUMBERING[3], 1.2),
        heading('黑体', '小四', '居中对齐', false, '#243048', 0, 0, BID_NUMBERING[4], 1.2),
        heading('宋体', '小四', '居中对齐', false, '#243048', 0, 0, BID_NUMBERING[5], 1.2),
      ],
      body_text: {
        font: '宋体',
        size: '小四',
        alignment: '两端对齐',
        spacing_after: 3,
        spacing_after_unit: 'pt',
        first_line_indent_chars: 2,
        line_spacing_mode: 'multiple',
        line_spacing_value: 1.25,
        list_style: 'square',
        ordered_list_style: 'decimal-dot',
        list_indent_chars: 2,
      },
      table: {
        border_width: 0.75,
        border_color: '#c9b8ff',
        cell_padding_pt: 5,
        full_width: true,
        caption_font: '黑体',
        caption_size: '小四',
        caption_bold: true,
        header_row: { font: '黑体', size: '小四', alignment: '居中对齐', text_color: '#553798', background_color: '#f2edff' },
        first_column: { font: '黑体', size: '小四', alignment: '居中对齐', text_color: '#5b3ca6', background_color: '#f8f5ff' },
        body_cell: { font: '宋体', size: '五号', alignment: '左对齐', text_color: '#243048', background_color: '#ffffff' },
      },
      image: {
        max_width_percent: 88,
        caption_font: '宋体',
        caption_size: '小五',
      },
    }),
  },
];

module.exports = {
  SYSTEM_EXPORT_TEMPLATES,
};
