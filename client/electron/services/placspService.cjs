'use strict';

/**
 * Read-only adapter for Spain's PLACSP (Plataforma de Contratación del Sector Público)
 * official Atom/CODICE XML syndication feeds.
 *
 * Public keyless GET requests only:
 * - https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom
 * - https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores.atom
 */

const REQUEST_TIMEOUT_MS = 30_000;
const SOFT_DEADLINE_MS = 18_000;
const MAX_FEED_BYTES = 2_000_000;
const USER_AGENT = 'savia-licitaciones';
const DEFAULT_FEED_URL = 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom';
const AGGREGATED_FEED_URL = 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores.atom';
const PSCP_SOCRATA_URL = 'https://analisi.transparenciacatalunya.cat/resource/ybgg-dgi6.json';

const STATUS_LABELS = {
  PRE: 'Anuncio previo',
  PUB: 'Publicado',
  EV: 'Evaluación',
  ADJ: 'Adjudicado',
  RES: 'Resuelto',
  ANUL: 'Anulado',
};

const PROCEDURE_LABELS = {
  '1': 'Abierto',
  '2': 'Restringido',
  '3': 'Negociado con publicidad',
  '4': 'Negociado sin publicidad',
  '5': 'Diálogo competitivo',
  '6': 'Contrato menor',
  '7': 'Asociación para la innovación',
  '9': 'Abierto simplificado',
  '10': 'Abierto simplificado abreviado',
};

const CONTRACT_TYPE_LABELS = {
  '1': 'Suministros',
  '2': 'Servicios',
  '3': 'Obras',
  '21': 'Gestión de servicios públicos',
  '31': 'Concesión de obras públicas',
  '40': 'Colaboración entre el sector público y el sector privado',
  '7': 'Administrativo especial',
  '8': 'Privado',
  '50': 'Patrimonial',
};

function decodeXmlEntities(text) {
  if (!text) return '';
  return String(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function findAllBlocks(xml, localName) {
  const regex = new RegExp(`<(?:[\\w-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${localName}>`, 'gi');
  const results = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push({ full: match[0], inner: match[1] });
  }
  return results;
}

function findFirstText(xml, localName) {
  if (!xml) return '';
  const regex = new RegExp(`<(?:[\\w-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${localName}>`, 'i');
  const match = regex.exec(xml);
  return match ? decodeXmlEntities(match[1]) : '';
}

function findFirstBlock(xml, localName) {
  if (!xml) return '';
  const regex = new RegExp(`<(?:[\\w-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${localName}>`, 'i');
  const match = regex.exec(xml);
  return match ? match[1] : '';
}

function findLinkHref(xml, rel) {
  const regex = /<link\b([^>]*?)\/?>(?:<\/link>)?/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const attrs = match[1];
    const relMatch = /\brel\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (hrefMatch && (!rel || (relMatch && relMatch[1].toLowerCase() === rel.toLowerCase()))) {
      return decodeXmlEntities(hrefMatch[1]);
    }
  }
  return '';
}

function parseBudgetAmount(projectXml) {
  const budgetXml = findFirstBlock(projectXml, 'BudgetAmount');
  if (!budgetXml) return { value: null, currency: 'EUR' };
  const tagNames = ['TaxExclusiveAmount', 'TotalAmount', 'EstimatedOverallContractAmount'];
  for (const tag of tagNames) {
    const regex = new RegExp(`<(?:[\\w-]+:)?${tag}([^>]*)>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'i');
    const match = regex.exec(budgetXml);
    if (match) {
      const num = Number(decodeXmlEntities(match[2]).replace(',', '.'));
      if (Number.isFinite(num)) {
        const currencyMatch = /\bcurrencyID\s*=\s*["']([^"']+)["']/i.exec(match[1]);
        return { value: num, currency: (currencyMatch?.[1] || 'EUR').toUpperCase() };
      }
    }
  }
  return { value: null, currency: 'EUR' };
}

function parseDocuments(folderXml) {
  const docs = [];
  const seen = new Set();
  const docSpecs = [
    { tag: 'LegalDocumentReference', docType: 'PCAP', fallbackName: 'Pliego de Cláusulas Administrativas (PCAP)' },
    { tag: 'TechnicalDocumentReference', docType: 'PPT', fallbackName: 'Pliego de Prescripciones Técnicas (PPT)' },
    { tag: 'AdditionalDocumentReference', docType: 'DOC', fallbackName: 'Documento adicional' },
  ];
  for (const spec of docSpecs) {
    for (const block of findAllBlocks(folderXml, spec.tag)) {
      const uri = findFirstText(block.inner, 'URI');
      if (!uri || !/^https?:\/\//i.test(uri) || seen.has(uri)) continue;
      seen.add(uri);
      const rawId = findFirstText(block.inner, 'ID');
      const name = findFirstText(block.inner, 'FileName') || rawId || spec.fallbackName;
      const extMatch = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(uri) || /\.([a-z0-9]{2,5})$/i.exec(name);
      const extension = (extMatch ? extMatch[1] : 'pdf').toLowerCase();
      const id = `${spec.docType}-${docs.length + 1}`;
      docs.push({ id, name, extension, docType: spec.docType, url: uri, size: null });
    }
  }
  return docs;
}

function validatePlacspUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return '';
    if (
      url.hostname === 'contrataciondelestado.es' ||
      url.hostname.endsWith('.contrataciondelestado.es') ||
      url.hostname === 'contrataciondelsectorpublico.gob.es' ||
      url.hostname.endsWith('.contrataciondelsectorpublico.gob.es') ||
      url.hostname === 'contractaciopublica.cat' ||
      url.hostname.endsWith('.contractaciopublica.cat')
    ) {
      return url.toString();
    }
  } catch {
    return '';
  }
  return '';
}

function parseEntry(entryXml) {
  const rawId = findFirstText(entryXml, 'id');
  const atomTitle = findFirstText(entryXml, 'title');
  const updated = findFirstText(entryXml, 'updated');
  const alternateUrl = validatePlacspUrl(findLinkHref(entryXml, 'alternate'));
  const folderXml = findFirstBlock(entryXml, 'ContractFolderStatus');
  const reference = findFirstText(folderXml, 'ContractFolderID');
  const statusCode = findFirstText(folderXml, 'ContractFolderStatusCode').toUpperCase();
  const status = STATUS_LABELS[statusCode] || statusCode || 'Publicado';

  const partyXml = findFirstBlock(folderXml, 'LocatedContractingParty');
  const entity = findFirstText(partyXml, 'Name');
  const entityId = findFirstText(partyXml, 'ID');

  const projectXml = findFirstBlock(folderXml, 'ProcurementProject');
  const title = findFirstText(projectXml, 'Name') || atomTitle;
  const contractTypeCode = findFirstText(projectXml, 'TypeCode');
  const { value, currency } = parseBudgetAmount(projectXml);

  const cpvCodes = [];
  for (const clsBlock of findAllBlocks(projectXml, 'RequiredCommodityClassification')) {
    const code = findFirstText(clsBlock.inner, 'ItemClassificationCode');
    if (/^\d{8}(?:-\d)?$/.test(code) && !cpvCodes.includes(code)) {
      cpvCodes.push(code);
    }
  }

  const locationXml = findFirstBlock(projectXml, 'RealizedLocation');
  const territory = findFirstText(locationXml, 'CountrySubentity');
  const city = findFirstText(locationXml, 'CityName');

  const tenderingXml = findFirstBlock(folderXml, 'TenderingProcess');
  const procedureCode = findFirstText(tenderingXml, 'ProcedureCode');
  const modalityParts = [PROCEDURE_LABELS[procedureCode] || procedureCode, CONTRACT_TYPE_LABELS[contractTypeCode] || contractTypeCode].filter(Boolean);
  const modality = modalityParts.join(' · ') || undefined;

  const deadlineBlock = findFirstBlock(tenderingXml, 'TenderSubmissionDeadlinePeriod');
  const endDate = findFirstText(deadlineBlock, 'EndDate');
  const endTime = findFirstText(deadlineBlock, 'EndTime');
  let deadline;
  let deadlineVerified = false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    const cleanTime = /^\d{2}:\d{2}(?::\d{2})?/.exec(endTime)?.[0];
    deadline = cleanTime ? `${endDate}T${cleanTime.length === 5 ? `${cleanTime}:00` : cleanTime}` : endDate;
    deadlineVerified = true;
  }

  const documents = parseDocuments(folderXml);
  const idSource = rawId || reference || alternateUrl;
  const id = idSource.replace(/^https?:\/\/[^/]+\//i, '').slice(0, 200);
  if (!id || !title) return null;

  return {
    id,
    reference: reference || undefined,
    classificationCode: cpvCodes[0] || undefined,
    cpvCodes,
    entity,
    entityId: entityId || undefined,
    title,
    modality,
    status,
    statusCode: statusCode || undefined,
    value,
    currency: currency || 'EUR',
    currencyVerified: value !== null,
    publicationDate: updated ? updated.slice(0, 10) : undefined,
    updatedAt: updated || undefined,
    deadline,
    deadlineVerified,
    department: territory || undefined,
    territory: territory || undefined,
    city: city || undefined,
    url: alternateUrl || undefined,
    source: 'placsp',
    country: 'ES',
    documents,
  };
}

function parseAtomFeed(xmlText) {
  const xml = String(xmlText || '');
  const updated = findFirstText(xml, 'updated');
  const nextUrl = findLinkHref(xml, 'next');
  const entries = [];
  for (const block of findAllBlocks(xml, 'entry')) {
    const parsed = parseEntry(block.inner);
    if (parsed) entries.push(parsed);
  }
  return { updated, nextUrl, entries };
}

function truncatePartialAtomFeed(xml) {
  const closeTag = '</entry>';
  const lastIdx = xml.lastIndexOf(closeTag);
  if (lastIdx === -1) return null;
  return `${xml.slice(0, lastIdx + closeTag.length)}\n</feed>`;
}

async function readStreamWithLimits(response, { softDeadlineMs = SOFT_DEADLINE_MS, maxBytes = MAX_FEED_BYTES } = {}) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    return response.text();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let text = '';
  let totalBytes = 0;
  let softTimedOut = false;
  let softTimer;

  const deadlinePromise = new Promise(resolve => {
    softTimer = setTimeout(() => {
      softTimedOut = true;
      resolve({ timedOut: true });
    }, softDeadlineMs);
  });

  try {
    while (true) {
      const result = await Promise.race([reader.read(), deadlinePromise]);
      if (result?.timedOut || softTimedOut) {
        text += decoder.decode();
        const partial = truncatePartialAtomFeed(text);
        await reader.cancel().catch(() => {});
        if (partial) return partial;
        throw Object.assign(new Error('PLACSP feed request timed out'), { name: 'TimeoutError' });
      }
      const { done, value } = result;
      if (done) {
        text += decoder.decode();
        return text;
      }
      if (value) {
        totalBytes += value.byteLength;
        text += decoder.decode(value, { stream: true });
        if (totalBytes >= maxBytes) {
          text += decoder.decode();
          const partial = truncatePartialAtomFeed(text);
          await reader.cancel().catch(() => {});
          if (partial) return partial;
          throw new Error(`PLACSP feed exceeded ${maxBytes} bytes before completing any entry`);
        }
      }
    }
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      text += decoder.decode();
      const partial = truncatePartialAtomFeed(text);
      if (partial) return partial;
    }
    throw error;
  } finally {
    clearTimeout(softTimer);
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

function escapeSoql(value) {
  return String(value).replace(/'/g, "''");
}

function mapPscpSocrataRows(rows) {
  const byId = new Map();
  for (const row of rows) {
    const id = String(row.id_intern || row.codi_expedient || '').trim();
    const title = String(row.denominacio || row.objecte_contracte || '').trim();
    if (!id || !title || byId.has(id)) continue;
    const cpvRaw = String(row.codi_cpv || '').trim();
    const cpvClean = cpvRaw.replace(/[^0-9]/g, '').slice(0, 8);
    const cpvCodes = cpvClean.length >= 4 ? [cpvClean] : [];
    const rawValue = Number(row.valor_estimat_contracte ?? row.pressupost_licitacio_amb ?? row.pressupost_licitacio_sense);
    const value = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : null;
    const url = typeof row.enllac_publicacio === 'string'
      ? row.enllac_publicacio
      : (row.enllac_publicacio?.url || '');
    const statusText = String(row.fase_publicacio || 'Anunci de licitació');
    const territory = String(row.lloc_execucio || 'Cataluña');
    const deadline = String(row.termini_presentacio_ofertes || '').slice(0, 19);
    byId.set(id, {
      id: `pscp:${id}`,
      reference: String(row.codi_expedient || id),
      title,
      entity: String(row.nom_organ || ''),
      entityId: String(row.codi_dir3 || row.codi_organ || ''),
      modality: String(row.procediment || row.tipus_contracte || ''),
      status: statusText,
      statusCode: 'PUB',
      value,
      currency: 'EUR',
      currencyVerified: value != null,
      publicationDate: String(row.data_publicacio_anunci || row.data_publicacio_contracte || '').slice(0, 10),
      deadline,
      deadlineVerified: Boolean(deadline),
      department: territory,
      territory,
      city: String(row.lloc_execucio || ''),
      classificationCode: cpvClean,
      cpvCodes,
      url,
      documents: [],
      updatedAt: String(row.data_publicacio_anunci || row.data_publicacio_contracte || ''),
      source: 'placsp',
      country: 'ES',
    });
  }
  return [...byId.values()];
}

function extractPscpDocumentsFromPublicationJson(data) {
  const pub = data?.publicacio?.dadesPublicacio;
  if (!pub || typeof pub !== 'object') return [];
  const groups = [
    { key: 'plecsDeClausulesAdministratives', prefix: 'PCAP' },
    { key: 'plecsDePrescripcionsTecniques', prefix: 'PPT' },
    { key: 'memoriaJustificativaContracte', prefix: 'MEM' },
    { key: 'documentsAprovacio', prefix: 'APR' },
    { key: 'resolucioAprovacioExpedient', prefix: 'RES' },
    { key: 'informeInsuficienciaMitjans', prefix: 'INF' },
    { key: 'altresDocuments', prefix: 'DOC' },
  ];
  const docs = [];
  const seenIds = new Set();
  for (const { key, prefix } of groups) {
    const section = pub[key];
    if (!section || typeof section !== 'object') continue;
    const lists = Array.isArray(section)
      ? [section]
      : ['ca', 'es', 'en', 'oc'].map(lang => section[lang]).filter(Array.isArray);
    for (const list of lists) {
      for (const item of list) {
        const docId = item?.id;
        const hash = typeof item?.hash === 'string' ? item.hash.trim() : '';
        if (!docId || !hash || seenIds.has(String(docId))) continue;
        seenIds.add(String(docId));
        const name = String(item.titol || item.nomFitxer || `documento_${docId}.pdf`).trim();
        const extMatch = /\.([a-z0-9]{2,5})$/i.exec(name);
        const extension = (extMatch ? extMatch[1] : 'pdf').toLowerCase();
        const size = Number.isFinite(Number(item.mida)) ? Number(item.mida) : null;
        docs.push({
          id: `${prefix}-${docId}`,
          name,
          extension,
          docType: prefix,
          size,
          url: `https://contractaciopublica.cat/portal-api/descarrega-document/${encodeURIComponent(String(docId))}/${encodeURIComponent(hash)}`,
        });
      }
    }
  }
  return docs;
}

function createPlacspService({ fetchImpl = globalThis.fetch } = {}) {
  async function fetchFeedPage(url = DEFAULT_FEED_URL, timeoutOrOptions = REQUEST_TIMEOUT_MS, extraOptions = {}) {
    const opts = typeof timeoutOrOptions === 'object' && timeoutOrOptions !== null
      ? timeoutOrOptions
      : { timeoutMs: timeoutOrOptions, ...extraOptions };
    const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
    const softDeadlineMs = opts.softDeadlineMs ?? Math.min(SOFT_DEADLINE_MS, timeoutMs);
    const maxBytes = opts.maxBytes ?? MAX_FEED_BYTES;

    const controller = new AbortController();
    const hardTimer = setTimeout(() => {
      controller.abort(Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' }));
    }, timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/atom+xml, application/xml, text/xml' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw Object.assign(new Error(`PLACSP feed request failed: HTTP ${response.status}`), {
          status: response.status,
          transient: [502, 503, 504].includes(response.status),
        });
      }
      const xml = await readStreamWithLimits(response, { softDeadlineMs, maxBytes });
      return parseAtomFeed(xml);
    } finally {
      clearTimeout(hardTimer);
    }
  }

  async function fetchPscpSocrataEntries({ limit = 100, timeoutMs = 15_000 } = {}) {
    const query = `${PSCP_SOCRATA_URL}?${new URLSearchParams({
      $where: "fase_publicacio like '%licitaci%'",
      $order: 'data_publicacio_anunci DESC',
      $limit: String(limit),
    }).toString()}`;
    const response = await fetchImpl(query, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`PSCP Socrata request failed: HTTP ${response.status}`);
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) return { updated: '', entries: [] };
    return { updated: new Date().toISOString(), entries: mapPscpSocrataRows(rows) };
  }

  async function searchPscpSocrata(params = {}) {
    const limit = Math.min(Math.max(Math.floor(Number(params.limit) || 20), 1), 100);
    const offset = Math.max(Math.floor(Number(params.offset) || 0), 0);
    const timeoutMs = params.timeoutMs ?? 15_000;
    const where = [];

    const addLikeFilter = (col, val) => {
      if (!val) return false;
      if (Array.isArray(val) && val.length) {
        const clauses = val
          .map(v => String(v || '').trim())
          .filter(Boolean)
          .map(v => `upper(${col}) like '%${escapeSoql(v.toUpperCase())}%'`);
        if (clauses.length) {
          where.push(`(${clauses.join(' OR ')})`);
          return true;
        }
      } else if (typeof val === 'string' && val.trim()) {
        where.push(`upper(${col}) like '%${escapeSoql(val.trim().toUpperCase())}%'`);
        return true;
      }
      return false;
    };

    if (!addLikeFilter('fase_publicacio', params.status)) {
      where.push("fase_publicacio like '%licitaci%'");
    }
    if (typeof params.keyword === 'string' && params.keyword.trim()) {
      const kw = escapeSoql(params.keyword.trim().toUpperCase());
      where.push(
        `(upper(denominacio) like '%${kw}%' OR upper(objecte_contracte) like '%${kw}%' OR upper(nom_organ) like '%${kw}%' OR upper(codi_expedient) like '%${kw}%')`
      );
    }
    if (params.classificationClass) {
      const cpv = String(params.classificationClass).replace(/[^0-9]/g, '').slice(0, 8);
      if (cpv) where.push(`codi_cpv like '${cpv}%'`);
    }
    addLikeFilter('lloc_execucio', params.department);
    addLikeFilter('procediment', params.modality);
    if (params.fromDate && /^\d{4}-\d{2}-\d{2}/.test(String(params.fromDate).trim())) {
      where.push(`data_publicacio_anunci >= '${String(params.fromDate).trim().slice(0, 10)}T00:00:00'`);
    }
    if (params.minValue !== null && params.minValue !== undefined && params.minValue !== '' && Number.isFinite(Number(params.minValue))) {
      where.push(`valor_estimat_contracte >= ${Number(params.minValue)}`);
    }
    if (params.maxValue !== null && params.maxValue !== undefined && params.maxValue !== '' && Number.isFinite(Number(params.maxValue))) {
      where.push(`valor_estimat_contracte <= ${Number(params.maxValue)}`);
    }

    const socrataSortMap = {
      title: 'denominacio',
      entity: 'nom_organ',
      modality: 'procediment',
      status: 'fase_publicacio',
      value: 'valor_estimat_contracte',
      publicationDate: 'data_publicacio_anunci',
      deadline: 'termini_presentacio_ofertes',
      department: 'lloc_execucio',
    };
    for (const [key, value] of Object.entries(params.columnFilters || {})) {
      const column = socrataSortMap[key];
      const filter = String(value).trim();
      if (!column || !filter) continue;
      if (key === 'value' && Number.isFinite(Number(filter))) {
        where.push(`valor_estimat_contracte = ${Number(filter)}`);
      } else if (key === 'publicationDate' || key === 'deadline') {
        const day = filter.slice(0, 10);
        const start = Date.parse(`${day}T00:00:00Z`);
        if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== day) return { items: [], truncated: false };
        const end = new Date(start + 86_400_000).toISOString().slice(0, 10);
        where.push(`${column} >= '${day}T00:00:00' AND ${column} < '${end}T00:00:00'`);
      } else if (key === 'value') {
        return { items: [], truncated: false };
      } else {
        addLikeFilter(column, filter);
      }
    }

    const orderCol = socrataSortMap[params.sortBy] || 'data_publicacio_anunci';
    const orderDir = params.sortDirection === 'asc' ? 'ASC' : 'DESC';

    const searchParams = new URLSearchParams({
      $where: where.join(' AND '),
      $order: `${orderCol} ${orderDir}`,
      $limit: String(limit + 1),
    });
    if (offset > 0) searchParams.set('$offset', String(offset));

    const query = `${PSCP_SOCRATA_URL}?${searchParams.toString()}`;
    const response = await fetchImpl(query, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`PSCP Socrata search failed: HTTP ${response.status}`);
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) return { items: [], truncated: false };
    const truncated = rows.length > limit;
    return {
      items: mapPscpSocrataRows(rows.slice(0, limit)),
      truncated,
    };
  }

  async function fetchLatestEntries({
    feedUrl = DEFAULT_FEED_URL,
    maxPages = 2,
    timeoutMs = REQUEST_TIMEOUT_MS,
    softDeadlineMs,
    maxBytes,
    fallbackToSocrata = true,
  } = {}) {
    const byId = new Map();
    let currentUrl = feedUrl;
    let feedUpdated = '';
    for (let page = 0; page < maxPages && currentUrl; page++) {
      try {
        const parsed = await fetchFeedPage(currentUrl, { timeoutMs: Math.min(timeoutMs, 10_000), softDeadlineMs, maxBytes });
        if (page === 0) feedUpdated = parsed.updated;
        for (const entry of parsed.entries) {
          if (!byId.has(entry.id)) byId.set(entry.id, entry);
        }
        currentUrl = parsed.nextUrl && parsed.nextUrl !== currentUrl ? parsed.nextUrl : '';
      } catch (error) {
        if (page === 0 && fallbackToSocrata && feedUrl === DEFAULT_FEED_URL) {
          return fetchPscpSocrataEntries({ timeoutMs: Math.min(timeoutMs, 15_000) });
        }
        throw error;
      }
    }
    if (!byId.size && fallbackToSocrata && feedUrl === DEFAULT_FEED_URL) {
      return fetchPscpSocrataEntries({ timeoutMs: Math.min(timeoutMs, 15_000) });
    }
    return { updated: feedUpdated, entries: [...byId.values()] };
  }

  async function fetchPscpProcessDocuments(processId, { reference = '', timeoutMs = 15_000 } = {}) {
    const rawId = String(processId || '').replace(/^pscp:/, '').trim();
    if (!rawId && !reference) return [];
    const whereClause = rawId
      ? `id_intern='${escapeSoql(rawId)}'`
      : `codi_expedient='${escapeSoql(String(reference || '').trim())}'`;
    const query = `${PSCP_SOCRATA_URL}?${new URLSearchParams({
      $where: whereClause,
      $order: 'data_publicacio_anunci DESC',
      $limit: '1',
    }).toString()}`;
    const res = await fetchImpl(query, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    const jsonUrl = row?.url_json_licitacio?.url || row?.url_json_agregada?.url || '';
    if (!jsonUrl || !validatePlacspUrl(jsonUrl)) return [];
    const pubRes = await fetchImpl(jsonUrl, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!pubRes.ok) return [];
    const pubData = await pubRes.json();
    return extractPscpDocumentsFromPublicationJson(pubData);
  }

  return {
    DEFAULT_FEED_URL,
    AGGREGATED_FEED_URL,
    PSCP_SOCRATA_URL,
    parseAtomFeed,
    fetchFeedPage,
    fetchPscpSocrataEntries,
    searchPscpSocrata,
    fetchPscpProcessDocuments,
    fetchLatestEntries,
  };
}

module.exports = {
  DEFAULT_FEED_URL,
  AGGREGATED_FEED_URL,
  STATUS_LABELS,
  parseAtomFeed,
  validatePlacspUrl,
  extractPscpDocumentsFromPublicationJson,
  createPlacspService,
};
