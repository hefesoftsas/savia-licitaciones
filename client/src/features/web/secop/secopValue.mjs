export function formatSecopValue(process, language, empty = '—') {
  if (typeof process?.value !== 'number' || !Number.isFinite(process.value)) return empty;
  const number = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 2 }).format(process.value);
  const unit = process.currencyVerified === true && process.currency ? process.currency : (language === 'en' ? 'currency unverified' : 'moneda sin verificar');
  return `${number} · ${unit}`;
}
