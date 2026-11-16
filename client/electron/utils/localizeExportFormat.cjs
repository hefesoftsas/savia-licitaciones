'use strict';
/** Translate known built-in legacy formats in a copy; preserve custom templates. */
function localizeExportFormat(format, locale) {
  if (!['es', 'en'].includes(locale) || !format) return format;
  const replacements = new Map([['第{zh}章', locale === 'es' ? 'Capítulo {num}' : 'Chapter {num}'], ['第{zh}节', locale === 'es' ? 'Sección {num}' : 'Section {num}']]);
  const page = format.page?.page_number_format === '第{page}页'
    ? { ...format.page, page_number_format: locale === 'es' ? 'Página {page}' : 'Page {page}' }
    : format.page;
  const headings = Array.isArray(format.headings) ? format.headings.map(heading => {
    if (heading?.numbering_format !== 'custom') return heading;
    const template = replacements.get(heading.numbering_template);
    return template ? { ...heading, numbering_template: template } : heading;
  }) : format.headings;
  return { ...format, ...(format.page ? { page } : {}), ...(Array.isArray(format.headings) ? { headings } : {}) };
}
module.exports = { localizeExportFormat };
