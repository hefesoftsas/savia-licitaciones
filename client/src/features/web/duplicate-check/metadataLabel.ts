import spanishLabels from '../../../../electron/utils/metadataLabels.es.json';

export function metadataLabel(key: string, fallback: string, language: string): string {
  if (language === 'en') {
    if (key.startsWith('converted_docx:')) return `Converted DOCX: ${metadataLabel(key.slice(15), fallback, language)}`;
    if (key.startsWith('custom:')) return `Custom: ${key.slice(7).replace(/:base64_decoded$/, ' (decoded Base64)')}`;
    if (key.endsWith(':base64_decoded')) return `${metadataLabel(key.slice(0, -15), fallback, language)} (decoded Base64)`;
    if (Object.hasOwn(spanishLabels, key) || /^(pdf_info|pdf_xmp|pdf_raw|ole_signal):/.test(key)) {
      const label = key.replace(/[_:]+/g, ' ').replace(/\b(pdf|docx|ole|xmp|sha256|rsid|xfa|id)\b/g, value => value.toUpperCase());
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    return fallback;
  }
  if (language !== 'es') return fallback;
  const labels: Record<string, string> = spanishLabels;
  if (labels[key]) return labels[key];
  if (key.startsWith('converted_docx:')) return `DOCX convertido: ${metadataLabel(key.slice(15), fallback, language)}`;
  if (key.startsWith('custom:')) return `Personalizado: ${key.slice(7).replace(/:base64_decoded$/, ' (Base64 decodificado)')}`;
  if (key.endsWith(':base64_decoded')) return `${metadataLabel(key.slice(0, -15), fallback, language)} (Base64 decodificado)`;
  for (const [prefix, title] of [['pdf_info:', 'Información PDF'], ['pdf_xmp:', 'XMP PDF'], ['pdf_raw:', 'Registro PDF'], ['ole_signal:', 'Indicio OLE']]) {
    if (key.startsWith(prefix)) return `${title}: ${key.slice(prefix.length).replace(/[_:]+/g, ' ')}`;
  }
  return fallback;
}
