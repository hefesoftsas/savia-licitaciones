import { canonicalPlacspDetailUrl } from './placsp-portal.js';
import placsp from '../../client/electron/services/placspService.cjs';

export const TED_SEARCH_URL = 'https://api.ted.europa.eu/v3/notices/search';
const TED_REQUEST_TIMEOUT_MS = 15_000;

export const TED_FIELDS = [
  'publication-number',
  'internal-identifier-proc',
  'notice-title',
  'title-proc',
  'description-proc',
  'selection-criterion-description-lot',
  'award-criterion-description-lot',
  'buyer-name',
  'buyer-country',
  'buyer-city',
  'classification-cpv',
  'contract-nature',
  'procedure-type',
  'notice-type',
  'estimated-value-proc',
  'estimated-value-cur-proc',
  'estimated-value-glo',
  'estimated-value-cur-glo',
  'estimated-value-lot',
  'estimated-value-cur-lot',
  'publication-date',
  'deadline-receipt-tender-date-lot',
  'deadline-receipt-tender-time-lot',
  'deadline-receipt-request-date-lot',
  'deadline-receipt-request-time-lot',
  'place-of-performance-country-lot',
  'place-of-performance-country-proc',
  'place-of-performance-subdiv-lot',
  'place-of-performance-city-lot',
  'document-url-lot',
  'document-url-part',
  'submission-url-lot',
  'buyer-profile',
  'eu-fund-lot',
  'eu-funds-programme-lot',
];

export const TED_COUNTRIES = [
  { iso3: 'ESP', iso2: 'ES', es: 'España', en: 'Spain' },
  { iso3: 'FRA', iso2: 'FR', es: 'Francia', en: 'France' },
  { iso3: 'PRT', iso2: 'PT', es: 'Portugal', en: 'Portugal' },
  { iso3: 'DEU', iso2: 'DE', es: 'Alemania', en: 'Germany' },
  { iso3: 'ITA', iso2: 'IT', es: 'Italia', en: 'Italy' },
  { iso3: 'NLD', iso2: 'NL', es: 'Países Bajos', en: 'Netherlands' },
  { iso3: 'BEL', iso2: 'BE', es: 'Bélgica', en: 'Belgium' },
  { iso3: 'POL', iso2: 'PL', es: 'Polonia', en: 'Poland' },
  { iso3: 'SWE', iso2: 'SE', es: 'Suecia', en: 'Sweden' },
  { iso3: 'AUT', iso2: 'AT', es: 'Austria', en: 'Austria' },
  { iso3: 'IRL', iso2: 'IE', es: 'Irlanda', en: 'Ireland' },
  { iso3: 'GRC', iso2: 'GR', es: 'Grecia', en: 'Greece' },
  { iso3: 'ROU', iso2: 'RO', es: 'Rumanía', en: 'Romania' },
  { iso3: 'CZE', iso2: 'CZ', es: 'Chequia', en: 'Czechia' },
  { iso3: 'DNK', iso2: 'DK', es: 'Dinamarca', en: 'Denmark' },
  { iso3: 'FIN', iso2: 'FI', es: 'Finlandia', en: 'Finland' },
  { iso3: 'HUN', iso2: 'HU', es: 'Hungría', en: 'Hungary' },
  { iso3: 'BGR', iso2: 'BG', es: 'Bulgaria', en: 'Bulgaria' },
  { iso3: 'HRV', iso2: 'HR', es: 'Croacia', en: 'Croatia' },
  { iso3: 'SVK', iso2: 'SK', es: 'Eslovaquia', en: 'Slovakia' },
  { iso3: 'SVN', iso2: 'SI', es: 'Eslovenia', en: 'Slovenia' },
  { iso3: 'LTU', iso2: 'LT', es: 'Lituania', en: 'Lithuania' },
  { iso3: 'LVA', iso2: 'LV', es: 'Letonia', en: 'Latvia' },
  { iso3: 'EST', iso2: 'EE', es: 'Estonia', en: 'Estonia' },
  { iso3: 'LUX', iso2: 'LU', es: 'Luxemburgo', en: 'Luxembourg' },
  { iso3: 'CYP', iso2: 'CY', es: 'Chipre', en: 'Cyprus' },
  { iso3: 'MLT', iso2: 'MT', es: 'Malta', en: 'Malta' },
  { iso3: 'NOR', iso2: 'NO', es: 'Noruega', en: 'Norway' },
  { iso3: 'ISL', iso2: 'IS', es: 'Islandia', en: 'Iceland' },
  { iso3: 'LIE', iso2: 'LI', es: 'Liechtenstein', en: 'Liechtenstein' },
  { iso3: 'CHE', iso2: 'CH', es: 'Suiza', en: 'Switzerland' },
].map(country => ({ ...country, label: `${country.es} (${country.iso3})` }));

export const TED_COUNTRY_DEFAULTS = TED_COUNTRIES.map(c => c.label);
export const TED_DEFAULT_COUNTRY_LABEL = 'España (ESP)';

export const TED_MODALITY_DEFAULTS = [
  'Abierto',
  'Restringido',
  'Negociado con publicidad',
  'Negociado sin publicidad',
  'Diálogo competitivo',
  'Asociación para la innovación',
  'Procedimiento de fase única',
  'Procedimiento en varias fases',
];

export const TED_STATUS_DEFAULTS = [
  'Publicado',
  'Anuncio previo',
  'Adjudicado',
  'Modificación',
];

export const TED_CONTRACT_TYPE_TO_NATURE = {
  '1': 'supplies',
  '2': 'services',
  '21': 'services',
  '22': 'services',
  '3': 'works',
  '31': 'works',
  '32': 'works',
};

const NATURE_LABELS = {
  es: { services: 'Servicios', supplies: 'Suministros', works: 'Obras' },
  en: { services: 'Services', supplies: 'Supplies', works: 'Works' },
};

const PROCEDURE_LABELS = {
  es: {
    open: 'Abierto',
    restricted: 'Restringido',
    'neg-w-call': 'Negociado con publicidad',
    'neg-wo-call': 'Negociado sin publicidad',
    'comp-dial': 'Diálogo competitivo',
    innovation: 'Asociación para la innovación',
    'oth-single': 'Procedimiento de fase única',
    'oth-mult': 'Procedimiento en varias fases',
  },
  en: {
    open: 'Open',
    restricted: 'Restricted',
    'neg-w-call': 'Negotiated with prior call',
    'neg-wo-call': 'Negotiated without prior call',
    'comp-dial': 'Competitive dialogue',
    innovation: 'Innovation partnership',
    'oth-single': 'Single stage procedure',
    'oth-mult': 'Multi-stage procedure',
  },
};

const PROCEDURE_INPUT_MAP = new Map([
  ['abierto', 'open'],
  ['open', 'open'],
  ['restringido', 'restricted'],
  ['restricted', 'restricted'],
  ['negociado con publicidad', 'neg-w-call'],
  ['licitacion con negociacion', 'neg-w-call'],
  ['negotiated with prior call', 'neg-w-call'],
  ['negociado sin publicidad', 'neg-wo-call'],
  ['negotiated without prior call', 'neg-wo-call'],
  ['dialogo competitivo', 'comp-dial'],
  ['competitive dialogue', 'comp-dial'],
  ['asociacion para la innovacion', 'innovation'],
  ['innovation partnership', 'innovation'],
  ['procedimiento de fase unica', 'oth-single'],
  ['single stage procedure', 'oth-single'],
  ['procedimiento en varias fases', 'oth-mult'],
  ['multi-stage procedure', 'oth-mult'],
]);

const COMPETITION_NOTICE_TYPES = [
  'cn-standard',
  'cn-social',
  'cn-desg',
  'subco',
  'pin-cfc-standard',
  'pin-cfc-social',
  'qu-sy',
];
const PIN_NOTICE_TYPES = ['pin-only', 'pin-buyer', 'pin-rtl', 'pin-tran'];
const AWARD_NOTICE_TYPES = ['can-standard', 'can-social', 'can-desg', 'can-tran', 'veat'];
const MODIF_NOTICE_TYPES = ['can-modif'];

const STATUS_INPUT_MAP = new Map([
  ['publicado', COMPETITION_NOTICE_TYPES],
  ['publicada', COMPETITION_NOTICE_TYPES],
  ['pub', COMPETITION_NOTICE_TYPES],
  ['en plazo', COMPETITION_NOTICE_TYPES],
  ['anuncio previo', PIN_NOTICE_TYPES],
  ['pre', PIN_NOTICE_TYPES],
  ['adjudicado', AWARD_NOTICE_TYPES],
  ['adjudicada', AWARD_NOTICE_TYPES],
  ['adj', AWARD_NOTICE_TYPES],
  ['modificacion', MODIF_NOTICE_TYPES],
  ['res', MODIF_NOTICE_TYPES],
]);

export const SPANISH_NUTS_TO_TERRITORY = {
  ES11: 'Galicia',
  ES12: 'Asturias',
  ES13: 'Cantabria',
  ES21: 'País Vasco',
  ES22: 'Navarra',
  ES23: 'La Rioja',
  ES24: 'Aragón',
  ES30: 'Comunidad de Madrid',
  ES41: 'Castilla y León',
  ES42: 'Castilla-La Mancha',
  ES43: 'Extremadura',
  ES51: 'Cataluña',
  ES52: 'Comunitat Valenciana',
  ES53: 'Illes Balears',
  ES61: 'Andalucía',
  ES62: 'Región de Murcia',
  ES63: 'Ceuta',
  ES64: 'Melilla',
  ES70: 'Canarias',
};

const foldText = value =>
  String(value || '')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

export const TERRITORY_TO_SPANISH_NUTS = new Map(
  Object.entries(SPANISH_NUTS_TO_TERRITORY).map(([nuts, name]) => [foldText(name), nuts])
);

const COUNTRY_BY_ISO3 = new Map(TED_COUNTRIES.map(c => [c.iso3, c]));
const COUNTRY_LOOKUP = new Map();
for (const country of TED_COUNTRIES) {
  COUNTRY_LOOKUP.set(foldText(country.iso3), country.iso3);
  COUNTRY_LOOKUP.set(foldText(country.iso2), country.iso3);
  COUNTRY_LOOKUP.set(foldText(country.es), country.iso3);
  COUNTRY_LOOKUP.set(foldText(country.en), country.iso3);
  COUNTRY_LOOKUP.set(foldText(country.label), country.iso3);
}

export function isTedTenderId(id) {
  return typeof id === 'string' && /^ted:\d{1,8}-\d{4}$/.test(id);
}

export function tedPublicationNumber(id) {
  return isTedTenderId(id) ? id.slice(4) : '';
}

export function parseTedCountryCodes(input) {
  const list = Array.isArray(input) ? input : typeof input === 'string' ? [input] : [];
  const codes = [];
  for (const raw of list) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const paren = /\(([A-Z]{3})\)\s*$/.exec(text)?.[1];
    const code = paren && COUNTRY_BY_ISO3.has(paren)
      ? paren
      : COUNTRY_LOOKUP.get(foldText(text)) || (/^[A-Za-z]{3}$/.test(text) ? text.toUpperCase() : '');
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

export function parseSpanishNutsPrefixes(input) {
  const list = Array.isArray(input) ? input : typeof input === 'string' ? [input] : [];
  const codes = [];
  for (const raw of list) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const folded = foldText(text);
    const direct = TERRITORY_TO_SPANISH_NUTS.get(folded);
    if (direct && !codes.includes(direct)) {
      codes.push(direct);
      continue;
    }
    if (/^ES\d{2,3}$/i.test(text)) {
      const code = text.slice(0, 4).toUpperCase();
      if (SPANISH_NUTS_TO_TERRITORY[code] && !codes.includes(code)) codes.push(code);
      continue;
    }
    for (const [name, nuts] of TERRITORY_TO_SPANISH_NUTS.entries()) {
      if ((name.includes(folded) || folded.includes(name)) && !codes.includes(nuts)) {
        codes.push(nuts);
      }
    }
  }
  return codes;
}

export function escapeTedPhrase(value) {
  return String(value || '')
    .replace(/[\x00-\x1f\x7f"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildTedExpertQuery(
  params = {},
  { defaultCountries = null, spanishTerritories = null, openOnly = false } = {}
) {
  const clauses = [];

  const keywordRaw = escapeTedPhrase(params.keyword);
  const titleFilterRaw = escapeTedPhrase(params.columnFilters?.title);
  const fullTextTerms = [keywordRaw, titleFilterRaw].filter(Boolean).join(' ').split(' ').filter(Boolean).slice(0, 6);
  if (fullTextTerms.length === 1) {
    clauses.push(`FT ~ "${fullTextTerms[0]}"`);
  } else if (fullTextTerms.length > 1) {
    clauses.push(`(${fullTextTerms.map(term => `FT ~ "${term}"`).join(' AND ')})`);
  }

  const nutsPrefixes = spanishTerritories !== null && spanishTerritories !== undefined
    ? parseSpanishNutsPrefixes(spanishTerritories)
    : [];
  if (nutsPrefixes.length) {
    clauses.push(`(${nutsPrefixes.map(code => `place-of-performance-subdiv-lot = ${code}*`).join(' OR ')})`);
  }

  const countryCodes = spanishTerritories !== null && spanishTerritories !== undefined
    ? (defaultCountries?.length ? defaultCountries : ['ESP'])
    : parseTedCountryCodes(params.department);
  const hasExplicitDeptArray = Array.isArray(params.department);
  const effectiveCountries = countryCodes.length
    ? countryCodes
    : (hasExplicitDeptArray && (spanishTerritories === null || spanishTerritories === undefined))
      ? []
      : (defaultCountries || []);
  if (effectiveCountries.length) {
    const joined = effectiveCountries.join(' ');
    clauses.push(`(place-of-performance-country-lot IN (${joined}) OR buyer-country IN (${joined}))`);
  }

  const cpvDigits = String(params.classificationClass || params.cpvCode || '').replace(/[^0-9]/g, '').slice(0, 8);
  if (cpvDigits.length >= 4) {
    clauses.push(cpvDigits.length === 8 ? `classification-cpv = ${cpvDigits}` : `classification-cpv = ${cpvDigits}*`);
  }

  const contractType = String(params.contractType || '').trim();
  if (contractType && TED_CONTRACT_TYPE_TO_NATURE[contractType]) {
    clauses.push(`contract-nature IN (${TED_CONTRACT_TYPE_TO_NATURE[contractType]})`);
  }

  const entity = escapeTedPhrase(params.entity || params.columnFilters?.entity);
  if (entity) {
    clauses.push(`buyer-name ~ "${entity}"`);
  }

  const reference = escapeTedPhrase(params.reference);
  if (reference) {
    if (/^\d{1,8}-\d{4}$/.test(reference)) {
      clauses.push(`publication-number = ${reference}`);
    } else if (/^[A-Za-z0-9._/-]+$/.test(reference)) {
      clauses.push(`(internal-identifier-proc = *${reference}* OR FT ~ "${reference}")`);
    } else {
      clauses.push(`(internal-identifier-proc = "${reference}" OR FT ~ "${reference}")`);
    }
  }

  if (params.euFunded === 'EU') {
    clauses.push('eu-fund-lot = eu-funds');
  } else if (params.euFunded === 'NO-EU') {
    clauses.push('eu-fund-lot = no-eu-funds');
  }

  const modalities = Array.isArray(params.modality) ? params.modality : params.modality ? [params.modality] : [];
  const procCodes = [...new Set(modalities.map(item => PROCEDURE_INPUT_MAP.get(foldText(item))).filter(Boolean))];
  if (procCodes.length) {
    clauses.push(`procedure-type IN (${procCodes.join(' ')})`);
  }

  const statuses = Array.isArray(params.status) ? params.status : params.status ? [params.status] : [];
  const noticeTypes = [...new Set(statuses.flatMap(item => STATUS_INPUT_MAP.get(foldText(item)) || []))];
  if (noticeTypes.length) {
    clauses.push(`notice-type IN (${noticeTypes.join(' ')})`);
  } else if (openOnly) {
    clauses.push(`notice-type IN (${COMPETITION_NOTICE_TYPES.join(' ')})`);
  }

  if (Number.isFinite(params.minValue)) {
    clauses.push(`estimated-value-proc >= ${Number(params.minValue)}`);
  }
  if (Number.isFinite(params.maxValue)) {
    clauses.push(`estimated-value-proc <= ${Number(params.maxValue)}`);
  }

  const fromDate = String(params.fromDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    clauses.push(`publication-date >= ${fromDate.replace(/-/g, '')}`);
  }

  if (/^\d{4}$/.test(params.publicationYear || '')) {
    clauses.push(`publication-date >= ${params.publicationYear}0101`, `publication-date <= ${params.publicationYear}1231`);
  }

  if (!clauses.length) {
    clauses.push('publication-date >= 20200101');
  }

  const sortFieldMap = {
    publicationDate: 'publication-date',
    deadline: 'deadline-receipt-tender-date-lot',
    value: 'estimated-value-proc',
  };
  const sortField = sortFieldMap[params.sortBy] || 'publication-date';
  const sortClause = params.sortDirection === 'asc' ? `SORT BY ${sortField}` : `SORT BY ${sortField} DESC`;
  return `${clauses.join(' AND ')} ${sortClause}`;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function pickLocalized(field, preferredLang = 'spa') {
  if (!field) return '';
  if (typeof field === 'string') return field.replace(/\s+/g, ' ').trim();
  if (Array.isArray(field)) {
    const first = field.find(item => typeof item === 'string' && item.trim());
    return first ? first.replace(/\s+/g, ' ').trim() : '';
  }
  if (typeof field === 'object') {
    const keys = [preferredLang, 'spa', 'eng', 'mul', ...Object.keys(field)];
    for (const key of keys) {
      if (!key || !Object.hasOwn(field, key)) continue;
      const candidate = pickLocalized(field[key], preferredLang);
      if (candidate) return candidate;
    }
  }
  return '';
}

function criterionDescriptions(field, language) {
  const translations = typeof field === 'object' && field !== null && !Array.isArray(field);
  const values = translations ? field[language] || field.spa || field.eng || Object.values(field)[0] : field;
  return asArray(values).filter(value => typeof value === 'string').join(' · ').slice(0, 4000);
}

function firstString(value) {
  for (const entry of asArray(value)) {
    if (typeof entry === 'string' && entry.trim()) return entry.trim();
  }
  return '';
}

function extractValueAndCurrency(notice) {
  const procVal = Number(notice['estimated-value-proc']);
  if (Number.isFinite(procVal)) {
    return {
      value: procVal,
      currency: firstString(notice['estimated-value-cur-proc']) || 'EUR',
    };
  }
  const gloVal = Number(notice['estimated-value-glo']);
  if (Number.isFinite(gloVal)) {
    return {
      value: gloVal,
      currency: firstString(notice['estimated-value-cur-glo']) || 'EUR',
    };
  }
  const lotNumbers = asArray(notice['estimated-value-lot'])
    .map(v => Number(v))
    .filter(v => Number.isFinite(v));
  if (lotNumbers.length) {
    const total = Math.round(lotNumbers.reduce((acc, v) => acc + v, 0) * 100) / 100;
    return {
      value: total,
      currency: firstString(notice['estimated-value-cur-lot']) || 'EUR',
    };
  }
  return { value: null, currency: 'EUR' };
}

function extractDeadline(notice, cutoff) {
  const dates = asArray(notice['deadline-receipt-tender-date-lot']).length
    ? asArray(notice['deadline-receipt-tender-date-lot'])
    : asArray(notice['deadline-receipt-request-date-lot']);
  const times = asArray(notice['deadline-receipt-tender-date-lot']).length
    ? asArray(notice['deadline-receipt-tender-time-lot'])
    : asArray(notice['deadline-receipt-request-time-lot']);

  const offsets = new Map();
  const combined = [];
  for (let i = 0; i < dates.length; i++) {
    const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(String(dates[i] || ''));
    if (!dateMatch) continue;
    const rawTime = String(times[i] ?? times[0] ?? '');
    const timeMatch = /^(\d{2}:\d{2}:\d{2})/.exec(rawTime);
    const iso = timeMatch ? `${dateMatch[1]}T${timeMatch[1]}` : dateMatch[1];
    if (!combined.includes(iso)) combined.push(iso);
    const offset = timeMatch && /(Z|[+-]\d{2}:\d{2})$/.exec(rawTime)?.[1];
    if (offset) offsets.set(iso, offset);
  }
  if (!combined.length) return { deadline: '' };
  combined.sort();
  const future = combined.filter(d => (d.length === 10 ? `${d}T23:59:59` : d) > cutoff);
  const deadline = (future.length ? future : combined).at(-1);
  return { deadline, deadlineUtcOffset: offsets.get(deadline) };
}

function extractPortalUrl(notice) {
  const candidates = [
    ...asArray(notice['document-url-lot']),
    ...asArray(notice['document-url-part']),
    ...asArray(notice['submission-url-lot']),
    ...asArray(notice['buyer-profile']),
  ];
  for (const raw of candidates) {
    const text = String(raw || '').trim();
    if (!text || /\s/.test(text)) continue;
    const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    const validated = placsp.validatePlacspUrl(withScheme);
    if (!validated) continue;
    if (/^https:\/\/contractaciopublica\.cat\/[^/]+\/detall-publicacio\/[a-f0-9-]+\/\d+/i.test(validated)) {
      return validated;
    }
    const parsed = new URL(validated);
    if (
      ['contrataciondelestado.es', 'contrataciondelsectorpublico.gob.es'].includes(parsed.hostname) &&
      parsed.pathname === '/wps/poc' &&
      parsed.searchParams.has('idEvl')
    ) {
      return canonicalPlacspDetailUrl(validated) || validated;
    }
  }
  return '';
}

function deriveStatus(noticeType, deadline, cutoff, en) {
  if (PIN_NOTICE_TYPES.includes(noticeType)) {
    return { status: en ? 'Prior information notice' : 'Anuncio previo', statusCode: 'PRE' };
  }
  if (AWARD_NOTICE_TYPES.includes(noticeType)) {
    return { status: en ? 'Awarded' : 'Adjudicado', statusCode: 'ADJ' };
  }
  if (MODIF_NOTICE_TYPES.includes(noticeType)) {
    return { status: en ? 'Modified' : 'Modificación', statusCode: 'RES' };
  }
  if (deadline) {
    const comparable = deadline.length === 10 ? `${deadline}T23:59:59` : deadline;
    if (comparable <= cutoff) {
      return { status: en ? 'Closed' : 'Cerrado', statusCode: 'RES' };
    }
  }
  return { status: en ? 'Published' : 'Publicado', statusCode: 'PUB' };
}

export function mapTedNoticeToProcess(notice, { language = 'es', now = new Date(), preferredNuts = [] } = {}) {
  const en = language === 'en';
  const langKey = en ? 'eng' : 'spa';
  const linkLang = en ? 'ENG' : 'SPA';
  const pathLang = en ? 'en' : 'es';
  const pubNum = firstString(notice?.['publication-number']);
  if (!pubNum) return null;

  const cutoff = placsp.placspDeadlineCutoff(now);
  const title = pickLocalized(notice['title-proc'], langKey) || pickLocalized(notice['notice-title'], langKey) || pubNum;
  const description = pickLocalized(notice['description-proc'], langKey).slice(0, 2000);
  const entity = pickLocalized(notice['buyer-name'], langKey);
  const internalRef = firstString(notice['internal-identifier-proc']);

  const cpvCodes = [];
  for (const raw of asArray(notice['classification-cpv'])) {
    const digits = String(raw || '').replace(/[^0-9]/g, '');
    if (digits.length >= 8 && !cpvCodes.includes(digits.slice(0, 8))) {
      cpvCodes.push(digits.slice(0, 8));
    }
  }

  const procKey = firstString(notice['procedure-type']).toLowerCase();
  const natureKey = firstString(notice['contract-nature']).toLowerCase();
  const procLabel = PROCEDURE_LABELS[en ? 'en' : 'es'][procKey] || procKey;
  const natureLabel = NATURE_LABELS[en ? 'en' : 'es'][natureKey] || natureKey;
  const modality = [procLabel, natureLabel].filter(Boolean).join(' · ');

  const { value, currency } = extractValueAndCurrency(notice);
  const pubDateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(firstString(notice['publication-date']));
  const publicationDate = pubDateMatch ? pubDateMatch[1] : '';
  const { deadline, deadlineUtcOffset } = extractDeadline(notice, cutoff);
  const noticeType = firstString(notice['notice-type']).toLowerCase();
  const { status, statusCode } = deriveStatus(noticeType, deadline, cutoff, en);

  const countryIso3 = (
    firstString(notice['place-of-performance-country-lot']) ||
    firstString(notice['place-of-performance-country-proc']) ||
    firstString(notice['buyer-country']) ||
    'ESP'
  ).toUpperCase();
  const countryInfo = COUNTRY_BY_ISO3.get(countryIso3);
  const country = countryInfo?.iso2 || countryIso3;

  let territory = '';
  if (countryIso3 === 'ESP') {
    const subdivs = asArray(notice['place-of-performance-subdiv-lot']).map(s => String(s || '').slice(0, 4).toUpperCase());
    const preferred = (preferredNuts || []).find(code => subdivs.includes(code) && SPANISH_NUTS_TO_TERRITORY[code]);
    if (preferred) {
      territory = SPANISH_NUTS_TO_TERRITORY[preferred];
    } else {
      for (const code of subdivs) {
        if (SPANISH_NUTS_TO_TERRITORY[code]) {
          territory = SPANISH_NUTS_TO_TERRITORY[code];
          break;
        }
      }
    }
    if (!territory) territory = 'España';
  } else {
    territory = (en ? countryInfo?.en : countryInfo?.es) || countryIso3;
  }

  const city = pickLocalized(notice['place-of-performance-city-lot'], langKey) || pickLocalized(notice['buyer-city'], langKey);
  const rawHtml = notice.links?.html?.[linkLang] || notice.links?.html?.ENG;
  const url = placsp.validatePlacspUrl(rawHtml) || `https://ted.europa.eu/${pathLang}/notice/-/detail/${pubNum}`;
  const rawPdf = notice.links?.pdf?.[linkLang] || notice.links?.pdf?.ENG;
  const pdfUrl = placsp.validatePlacspUrl(rawPdf) || `https://ted.europa.eu/${pathLang}/notice/${pubNum}/pdf`;
  const portalUrl = extractPortalUrl(notice);

  return {
    id: `ted:${pubNum}`,
    reference: internalRef || pubNum,
    selectionCriteria: criterionDescriptions(notice['selection-criterion-description-lot'], langKey),
    awardCriteria: criterionDescriptions(notice['award-criterion-description-lot'], langKey),
    classificationCode: cpvCodes[0] || '',
    cpvCodes,
    entity,
    entityId: '',
    title,
    description,
    modality,
    status,
    statusCode,
    value,
    currency,
    currencyVerified: value != null,
    publicationDate,
    deadline,
    deadlineVerified: Boolean(deadline),
    ...(deadlineUtcOffset ? { deadlineUtcOffset } : {}),
    territory,
    department: territory,
    city,
    url,
    ...(portalUrl ? { portalUrl } : {}),
    source: 'ted',
    country,
    documents: [
      {
        id: `TED-${pubNum}`,
        name: `Anuncio oficial TED ${pubNum}.pdf`,
        extension: 'pdf',
        docType: 'TED',
        url: pdfUrl,
        size: null,
      },
    ],
    updatedAt: publicationDate ? `${publicationDate}T00:00:00Z` : new Date(now).toISOString(),
  };
}

function matchesColumnFilters(item, filters = {}) {
  const matchText = (field, needle) =>
    !needle || foldText(field).includes(foldText(needle));
  if (filters.modality && !matchText(item.modality, filters.modality)) return false;
  if (filters.status && !matchText(item.status, filters.status)) return false;
  if (filters.department && !matchText(item.territory || item.department, filters.department)) return false;
  if (filters.publicationDate && !String(item.publicationDate || '').startsWith(String(filters.publicationDate).slice(0, 10))) return false;
  if (filters.deadline && !String(item.deadline || '').startsWith(String(filters.deadline).slice(0, 10))) return false;
  if (filters.value !== undefined && String(filters.value).trim() !== '' && Number.isFinite(Number(filters.value))) {
    if (item.value !== Number(filters.value)) return false;
  }
  return true;
}

export async function searchTedNotices(
  params = {},
  {
    defaultCountries = null,
    spanishTerritories = null,
    openOnly = params.openOnly !== false,
    limit = params.limit ?? 20,
    offset = params.offset ?? 0,
    language = 'es',
    fetchImpl = fetch,
    now = new Date(),
  } = {}
) {
  const safeLimit = Math.min(Math.max(Math.floor(Number(limit) || 20), 1), 100);
  const safeOffset = Math.max(Math.floor(Number(offset) || 0), 0);
  const page = Math.floor(safeOffset / safeLimit) + 1;
  const query = buildTedExpertQuery(params, { defaultCountries, spanishTerritories, openOnly });

  const response = await fetchImpl(TED_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query,
      fields: TED_FIELDS,
      scope: openOnly ? 'ACTIVE' : 'ALL',
      onlyLatestVersions: Boolean(openOnly),
      page,
      limit: safeLimit,
    }),
    signal: AbortSignal.timeout(TED_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`TED API returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  const rawNotices = Array.isArray(payload?.notices) ? payload.notices : [];
  const totalNoticeCount = Number(payload?.totalNoticeCount) || 0;
  const preferredNuts = spanishTerritories ? parseSpanishNutsPrefixes(spanishTerritories) : [];

  let items = rawNotices
    .map(notice => mapTedNoticeToProcess(notice, { language, now, preferredNuts }))
    .filter(Boolean);

  if (params.columnFilters && Object.keys(params.columnFilters).length) {
    items = items.filter(item => matchesColumnFilters(item, params.columnFilters));
  }

  const remainder = safeOffset % safeLimit;
  if (remainder > 0 && items.length > remainder) {
    items = items.slice(remainder);
  }

  return {
    items,
    truncated: page * safeLimit < totalNoticeCount,
    totalNoticeCount,
  };
}

export async function fetchTedNoticeById(
  id,
  { language = 'es', fetchImpl = fetch, now = new Date() } = {}
) {
  const pubNum = isTedTenderId(id) ? tedPublicationNumber(id) : String(id || '').trim();
  if (!/^\d{1,8}-\d{4}$/.test(pubNum)) return null;

  const response = await fetchImpl(TED_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: `publication-number = ${pubNum}`,
      fields: TED_FIELDS,
      scope: 'ALL',
      onlyLatestVersions: false,
      page: 1,
      limit: 1,
    }),
    signal: AbortSignal.timeout(TED_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`TED API returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  const notice = Array.isArray(payload?.notices) ? payload.notices[0] : null;
  return notice ? mapTedNoticeToProcess(notice, { language, now }) : null;
}
