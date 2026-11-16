import type { ExportFormatConfig } from '../../shared/types/exportFormat';

/** Only use for new defaults or read-only built-ins, never existing user templates. */
export function localizeTemplateDefaults(config: ExportFormatConfig, language: string): ExportFormatConfig {
  const spanish = language === 'es';
  const numbering: Record<string, string> = {
    '第{zh}章': spanish ? 'Capítulo {num}' : 'Chapter {num}',
    '第{zh}节': spanish ? 'Sección {num}' : 'Section {num}',
  };
  return {
    ...config,
    page: { ...config.page, page_number_format: config.page.page_number_format === '第{page}页' ? (spanish ? 'Página {page}' : 'Page {page}') : config.page.page_number_format },
    headings: config.headings.map(heading => heading.numbering_format === 'custom'
      ? { ...heading, numbering_template: numbering[heading.numbering_template] || heading.numbering_template }
      : heading),
  };
}
