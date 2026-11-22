export function isSpainMarket(source, country, market) {
  if (country === 'ES' || source === 'placsp' || source === 'ted') return true;
  if (country === 'CO' || source === 'secop-i' || source === 'secop-ii' || source === 'contratos') return false;
  return market === 'ES';
}

export function numberLocaleFor(language, { currency, country, source, market } = {}) {
  if (language === 'en') return 'en-US';
  if (currency === 'EUR' || isSpainMarket(source, country, market)) return 'es-ES';
  if (currency === 'COP' || country === 'CO' || source === 'secop-i' || source === 'secop-ii' || source === 'contratos' || market === 'CO') return 'es-CO';
  return 'es-ES';
}

export function dateLocaleFor(language, { country, source, market } = {}) {
  if (language === 'en') return 'en-GB';
  if (isSpainMarket(source, country, market)) return 'es-ES';
  if (country === 'CO' || source === 'secop-i' || source === 'secop-ii' || source === 'contratos' || market === 'CO') return 'es-CO';
  return 'es-ES';
}

export function formatSecopValue(process, language, empty = '—') {
  if (typeof process?.value !== 'number' || !Number.isFinite(process.value)) return empty;
  const locale = numberLocaleFor(language, {
    currency: process.currency,
    country: process.country,
    source: process.source,
  });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(process.value);
  const verifiedCurrency =
    (process.currencyVerified === true || process.source === 'placsp' || process.source === 'ted') && process.currency
      ? process.currency
      : null;
  const unit = verifiedCurrency || (language === 'en' ? 'currency unverified' : 'moneda sin verificar');
  return `${number} · ${unit}`;
}

export function formatNumberValue(value, language, options = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return options.empty ?? '—';
  const locale = numberLocaleFor(language, options);
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

export function formatDateValue(value, language, options = {}) {
  if (!value) return options.empty ?? '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const locale = dateLocaleFor(language, options);
  const fmtOptions = {
    dateStyle: options.dateStyle ?? 'medium',
    ...(options.timeStyle ? { timeStyle: options.timeStyle } : {}),
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  };
  return new Intl.DateTimeFormat(locale, fmtOptions).format(parsed);
}

export function formatDeadline(process, language) {
  const value = process.deadline || '';
  if (process.source !== 'ted') return formatDateValue(value, language, {...process, timeZone:'UTC'});
  const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  const day = formatDateValue(local?.[1] || value, language, { ...process, timeZone: 'UTC' });
  if (!local) return day;
  const offset = local[3] || process.deadlineUtcOffset;
  const zone = offset === 'Z' ? ' UTC' : offset ? ` UTC${offset}` : '';
  return `${day} · ${local[2]}${zone}`;
}

export function officialTenderUrl(process) {
  try {
    const url = new URL(process?.url || '');
    if (url.protocol !== 'https:') return undefined;
    if (process?.source === 'ted') {
      return url.hostname.toLowerCase() === 'ted.europa.eu' ? url.href : undefined;
    }
    if (process?.source === 'placsp' || process?.country === 'ES') {
      const host = url.hostname.toLowerCase();
      if (
        host === 'contrataciondelestado.es' ||
        host.endsWith('.contrataciondelestado.es') ||
        host === 'contrataciondelsectorpublico.gob.es' ||
        host.endsWith('.contrataciondelsectorpublico.gob.es')
      ) {
        return url.href;
      }
      return undefined;
    }
    if (
      url.hostname === 'community.secop.gov.co' &&
      url.pathname === '/Public/Tendering/OpportunityDetail/Index' &&
      /^CO1\.NTC\.\d+$/.test(url.searchParams.get('noticeUID') || '')
    ) {
      return url.href;
    }
  } catch {
    /* No verified link available. */
  }
  return undefined;
}

export function sourceDisplayName(source, language = 'es') {
  if (source === 'placsp') return 'PLACSP';
  if (source === 'ted') return 'TED Europa';
  if (source === 'secop-ii') return 'SECOP II';
  if (source === 'secop-i') return 'SECOP I';
  if (source === 'contratos') return language === 'en' ? 'Contracts (SECOP II)' : 'Contratos (SECOP II)';
  return language === 'en' ? 'Procurement portal' : 'Plataforma de contratación';
}
