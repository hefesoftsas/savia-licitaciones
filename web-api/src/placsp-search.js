import {
  canonicalPlacspDetailUrl,
  decodePlacspMarkup,
  fetchPlacspPortalTender,
  officialUrl,
  parsePlacspSpanishNumber,
  parsePlacspStatusCode,
  placspDocumentHeaders,
  portalTenderId,
} from './placsp-portal.js';

export const PLACSP_BUSQUEDA_URL = 'https://contrataciondelestado.es/wps/portal/plataforma/buscadores/busqueda';
export const PLACSP_DOCUMENTOS_URL = 'https://contrataciondelestado.es/wps/portal/plataforma/buscador/';

export const PLACSP_CONTRACT_TYPE_LABELS = {
  '1': 'Suministros',
  '2': 'Servicios',
  '3': 'Obras',
  '7': 'Administrativo especial',
  '8': 'Privado',
  '21': 'Gestión de Servicios Públicos',
  '22': 'Concesión de Servicios',
  '31': 'Concesión de Obras Públicas',
  '32': 'Concesión de Obras',
  '40': 'Colaboración entre el sector público y sector privado',
  '50': 'Patrimonial',
};

export const PLACSP_CONTRACT_TYPE_CODES = Object.keys(PLACSP_CONTRACT_TYPE_LABELS);

export const PLACSP_STATUS_DEFAULTS = [
  'Publicado',
  'Anuncio previo',
  'Evaluación',
  'Adjudicado',
  'Resuelto',
  'Anulado',
];

export const PLACSP_MODALITY_DEFAULTS = [
  'Abierto',
  'Abierto simplificado',
  'Abierto simplificado abreviado',
  'Restringido',
  'Negociado con publicidad',
  'Negociado sin publicidad',
  'Diálogo competitivo',
  'Asociación para la innovación',
];

export const PLACSP_TERRITORY_DEFAULTS = [
  'Andalucía',
  'Aragón',
  'Asturias',
  'Illes Balears',
  'Canarias',
  'Cantabria',
  'Castilla-La Mancha',
  'Castilla y León',
  'Cataluña',
  'Comunitat Valenciana',
  'Extremadura',
  'Galicia',
  'Comunidad de Madrid',
  'Región de Murcia',
  'Navarra',
  'País Vasco',
  'La Rioja',
  'Ceuta',
  'Melilla',
];

const PROCEDURES_BY_LABEL = new Map([
  ['abierto', ['1', 'Abierto']],
  ['restringido', ['2', 'Restringido']],
  ['negociado sin publicidad', ['3', 'Negociado sin publicidad']],
  ['negociado con publicidad', ['4', 'Negociado con publicidad']],
  ['dialogo competitivo', ['5', 'Diálogo competitivo']],
  ['basado en acuerdo marco', ['7', 'Basado en Acuerdo Marco']],
  ['concurso de proyectos', ['8', 'Concurso de proyectos']],
  ['abierto simplificado', ['9', 'Abierto simplificado']],
  ['asociacion para la innovacion', ['10', 'Asociación para la innovación']],
  ['derivado de asociacion para la innovacion', ['11', 'Derivado de asociación para la innovación']],
  ['basado en sistema dinamico de adquisicion', ['12', 'Basado en sistema dinámico de adquisición']],
  ['licitacion con negociacion', ['13', 'Licitación con negociación']],
  ['abierto simplificado abreviado', ['14', 'Abierto simplificado abreviado']],
  ['normas internas', ['100', 'Normas Internas']],
]);

const CONTRACT_TYPES_BY_LABEL = new Map(
  Object.entries(PLACSP_CONTRACT_TYPE_LABELS).map(([code, label]) => [foldLabel(label), [code, label]])
);

const STATUS_CODE_BY_INPUT = new Map([
  ['crea', 'CREA'],
  ['creada', 'CREA'],
  ['pre', 'PRE'],
  ['anuncio previo', 'PRE'],
  ['pub', 'PUB'],
  ['publicada', 'PUB'],
  ['publicado', 'PUB'],
  ['en plazo', 'PUB'],
  ['ev_pre', 'EV_PRE'],
  ['evaluacion previa', 'EV_PRE'],
  ['ev', 'EV'],
  ['evaluacion', 'EV'],
  ['adj', 'ADJ'],
  ['adjudicada', 'ADJ'],
  ['adjudicado', 'ADJ'],
  ['adj_par', 'ADJ_PAR'],
  ['parcialmente adjudicada', 'ADJ_PAR'],
  ['par_res', 'PAR_RES'],
  ['adjudicacion provisional', 'PAR_RES'],
  ['res', 'RES'],
  ['resuelta', 'RES'],
  ['resuelto', 'RES'],
  ['res_par', 'RES_PAR'],
  ['parcialmente resuelta', 'RES_PAR'],
  ['des', 'DES'],
  ['desistida', 'DES'],
  ['cerr', 'CERR'],
  ['cerrada', 'CERR'],
  ['anul', 'ANUL'],
  ['anulada', 'ANUL'],
  ['anulado', 'ANUL'],
]);

function foldLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function stripMarkup(html) {
  return decodePlacspMarkup(String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).replace(/\s+/g, ' ').trim();
}

function isoToPlacspDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '').trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function placspDateToIso(dmy) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dmy || '').trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function mergeCookies(jar, response) {
  const raw = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
  for (const header of raw) {
    const pair = header.split(';', 1)[0];
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.trim());
  }
}

async function fetchPortalPage(url, { method = 'GET', body, referer, cookies, signal, fetchImpl = fetch }) {
  let current = officialUrl(url);
  if (!current || !current.pathname.startsWith('/wps/')) {
    throw new Error('URL oficial de PLACSP inválida');
  }
  let currentMethod = method;
  let currentBody = body;
  let currentReferer = referer;

  for (let hop = 0; hop < 6; hop++) {
    const headers = {
      ...placspDocumentHeaders('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
      'Accept-Language': 'es-ES,es;q=0.9',
      ...(currentReferer ? { Referer: currentReferer } : {}),
      ...(currentBody !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(cookies.size ? { Cookie: [...cookies.values()].join('; ') } : {}),
    };
    const response = await fetchImpl(current.href, {
      method: currentMethod,
      body: currentBody,
      redirect: 'manual',
      headers,
      signal,
    });
    mergeCookies(cookies, response);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirección PLACSP incompleta (${response.status})`);
      const next = officialUrl(location, current);
      if (!next || !next.pathname.startsWith('/wps/')) {
        throw new Error('Redirección fuera del portal oficial de PLACSP');
      }
      currentReferer = current.href;
      current = next;
      currentMethod = 'GET';
      currentBody = undefined;
      continue;
    }
    if (!response.ok) {
      throw new Error(`PLACSP portal HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html/i.test(contentType)) {
      throw new Error('Respuesta no HTML del portal PLACSP');
    }
    return { html: await response.text(), url: current.href };
  }
  throw new Error('Demasiadas redirecciones en PLACSP');
}

export function serializeJsfForm(html, formSuffix) {
  const suffixEscaped = formSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const idPattern = new RegExp(`\\bid=["']([^"']*${suffixEscaped})["']`, 'i');
  const actionPattern = /\baction=["']([^"']+)["']/i;
  let formId = '';
  let action = '';
  let inner = '';

  for (const match of String(html || '').matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const idMatch = idPattern.exec(match[1]);
    if (!idMatch) continue;
    const actionMatch = actionPattern.exec(match[1]);
    if (!actionMatch) continue;
    formId = idMatch[1];
    action = decodePlacspMarkup(actionMatch[1]);
    inner = match[2];
    break;
  }

  if (!formId || !action) {
    throw new Error(`Formulario PLACSP no encontrado (${formSuffix})`);
  }

  const params = new URLSearchParams();
  for (const input of inner.matchAll(/<input\b([^>]+)>/gi)) {
    const attrs = input[1];
    const type = (/\btype=["']([^"']+)["']/i.exec(attrs)?.[1] || 'text').toLowerCase();
    if (['submit', 'button', 'image', 'reset', 'file'].includes(type)) continue;
    if ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/i.test(attrs)) continue;
    const name = /\bname=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!name) continue;
    const value = /\bvalue=["']([^"']*)["']/i.exec(attrs)?.[1] || '';
    params.set(decodePlacspMarkup(name), decodePlacspMarkup(value));
  }

  for (const select of inner.matchAll(/<select\b([^>]+)>([\s\S]*?)<\/select>/gi)) {
    const name = /\bname=["']([^"']+)["']/i.exec(select[1])?.[1];
    if (!name) continue;
    const selected = /<option\b[^>]*\bselected\b[^>]*\bvalue=["']([^"']*)["']|<option\b[^>]*\bvalue=["']([^"']*)["'][^>]*\bselected\b/i.exec(select[2]);
    const first = /<option\b[^>]*\bvalue=["']([^"']*)["']/i.exec(select[2]);
    const value = selected ? (selected[1] ?? selected[2] ?? '') : (first ? first[1] : '');
    params.set(decodePlacspMarkup(name), decodePlacspMarkup(value));
  }

  if (!params.has('javax.faces.ViewState')) {
    throw new Error('Falta javax.faces.ViewState en formulario PLACSP');
  }
  return { formId, action, params };
}

function extractTitleAfterCellOrder(cellHtml) {
  const openMatch = /<div\b[^>]*class=["'][^"']*cell-order[^"']*["'][^>]*>/i.exec(cellHtml);
  if (openMatch) {
    const start = openMatch.index + openMatch[0].length;
    let depth = 1;
    const tagRegex = /<\/?div\b[^>]*>/gi;
    tagRegex.lastIndex = start;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(cellHtml)) !== null) {
      if (tagMatch[0].startsWith('</')) depth--;
      else depth++;
      if (depth === 0) {
        const rest = cellHtml.slice(tagRegex.lastIndex);
        const titleDiv = /<div\b[^>]*>([\s\S]*?)<\/div>/i.exec(rest);
        return titleDiv ? stripMarkup(titleDiv[1]) : stripMarkup(rest);
      }
    }
  }
  const divs = [...cellHtml.matchAll(/<div\b[^>]*>([\s\S]*?)<\/div>/gi)];
  return divs.length ? stripMarkup(divs.at(-1)[1]) : '';
}

async function parseLicitacionesTable(html, { appliedProcedure = '', appliedCpv = '', baseNow = Date.now(), indexOffset = 0 } = {}) {
  const tableMatch = /<table\b[^>]*id=["'][^"']*myTablaBusquedaCustom[^"']*["'][^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!tableMatch) {
    if (/No se han encontrado|No existen resultados/i.test(html)) {
      return { items: [], total: 0, nextBtnName: '' };
    }
    throw new Error('Respuesta inválida del buscador de PLACSP');
  }

  const totalRaw = /id=["'][^"']*textfooterTotalTotalMAQ["'][^>]*>([^<]+)</i.exec(html)?.[1] || '';
  const totalParsed = Number.parseInt(totalRaw.replace(/\D/g, ''), 10);
  const total = Number.isFinite(totalParsed) ? totalParsed : null;

  const nextMatch = /<input\b([^>]*\bvalue=["']Siguiente[^"']*["'][^>]*)>/i.exec(html);
  const nextBtnName = nextMatch ? (/\bname=["']([^"']+)["']/i.exec(nextMatch[1])?.[1] || '') : '';

  const items = [];
  let rowIndex = indexOffset;
  for (const [, rowHtml] of tableMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const refMatch = /id=["'][^"']*:textoEnlace_\d+["'][^>]*>([\s\S]*?)<\/span>/i.exec(rowHtml);
    if (!refMatch) continue;
    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => cell[1]);
    if (cells.length < 6) continue;

    const reference = stripMarkup(refMatch[1]);
    const idLicitacion = /\['idLicitacion'\s*,\s*'(\d+)'\]/i.exec(cells[0])?.[1] || '';
    const hrefRaw = /href=["']([^"']*\/wps\/poc\?[^"']*idEvl=[^"']+)["']/i.exec(cells[0])?.[1] || '';
    const url = canonicalPlacspDetailUrl(decodePlacspMarkup(hrefRaw));
    const title = extractTitleAfterCellOrder(cells[0]);
    const id = await portalTenderId(url, idLicitacion);
    if (!id || !title) continue;

    const typeDivs = [...cells[1].matchAll(/<div\b[^>]*>([\s\S]*?)<\/div>/gi)]
      .map(div => stripMarkup(div[1]))
      .filter(Boolean);
    const typeParts = [];
    for (const part of typeDivs.length ? typeDivs : [stripMarkup(cells[1])].filter(Boolean)) {
      if (!typeParts.includes(part)) typeParts.push(part);
    }
    const modality = [appliedProcedure, ...typeParts].filter(Boolean).join(' · ');

    const status = stripMarkup(cells[2]);
    const statusCode = parsePlacspStatusCode(status);
    const value = parsePlacspSpanishNumber(stripMarkup(cells[3]));
    const deadline = placspDateToIso(stripMarkup(cells[4]));
    const entity = stripMarkup(cells[5]);

    items.push({
      id,
      reference,
      title,
      entity,
      entityId: '',
      modality,
      status,
      statusCode,
      value,
      currency: 'EUR',
      currencyVerified: value !== null,
      publicationDate: '',
      deadline,
      deadlineVerified: Boolean(deadline),
      territory: '',
      department: '',
      city: '',
      classificationCode: appliedCpv,
      cpvCodes: appliedCpv ? [appliedCpv] : [],
      url,
      documents: [],
      updatedAt: new Date(baseNow - rowIndex * 1000).toISOString(),
      source: 'placsp',
      country: 'ES',
    });
    rowIndex++;
  }

  return { items, total, nextBtnName: decodePlacspMarkup(nextBtnName) };
}

function resolveSingleTextParam(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') return value[0].trim();
  return '';
}

function resolveModalityFilters(modalityParam) {
  const single = resolveSingleTextParam(modalityParam);
  if (!single) return { procCode: '', procLabel: '', ctCode: '', ctLabel: '' };
  const parts = single.split('·').map(part => foldLabel(part)).filter(Boolean);
  let procCode = '';
  let procLabel = '';
  let ctCode = '';
  let ctLabel = '';
  for (const part of parts) {
    if (!procCode && PROCEDURES_BY_LABEL.has(part)) {
      [procCode, procLabel] = PROCEDURES_BY_LABEL.get(part);
    } else if (!ctCode && CONTRACT_TYPES_BY_LABEL.has(part)) {
      [ctCode, ctLabel] = CONTRACT_TYPES_BY_LABEL.get(part);
    }
  }
  return { procCode, procLabel, ctCode, ctLabel };
}

function resolveStatusCode(statusParam) {
  const single = resolveSingleTextParam(statusParam);
  if (!single) return '';
  return STATUS_CODE_BY_INPUT.get(foldLabel(single)) || '';
}

export async function searchPlacspPortalLicitaciones(
  params = {},
  deadlineCutoff = null,
  target = 20,
  { fetchImpl = fetch, timeoutMs = 20_000, enrichDetail } = {}
) {
  const cookies = new Map();
  const signal = AbortSignal.timeout(timeoutMs);
  const baseNow = Date.now();

  const landing = await fetchPortalPage(PLACSP_BUSQUEDA_URL, { cookies, signal, fetchImpl });
  const landingForm = serializeJsfForm(landing.html, ':form1');
  landingForm.params.set(`${landingForm.formId}:_idcl`, `${landingForm.formId}:linkFormularioBusqueda`);

  let currentPage = await fetchPortalPage(new URL(landingForm.action, landing.url).href, {
    method: 'POST',
    body: landingForm.params.toString(),
    referer: landing.url,
    cookies,
    signal,
    fetchImpl,
  });

  const applied = {
    fromDate: false,
    cpv: '',
    contractType: '',
    procedure: '',
    euFunded: false,
  };

  const rawCpv = String(params.classificationClass || '').replace(/[^0-9]/g, '').slice(0, 8);
  if (rawCpv.length >= 2) {
    const paddedCpv = rawCpv.padEnd(8, '0');
    const cpvForm = serializeJsfForm(currentPage.html, ':form1');
    cpvForm.params.set(`${cpvForm.formId}:cpvMultiple:codigoCpv`, paddedCpv);
    cpvForm.params.set('parametroAnyadir', 'cpvMultiple');
    cpvForm.params.set(`${cpvForm.formId}:_idcl`, `${cpvForm.formId}:cpvMultiplebuttonAnyadirMultiple`);
    currentPage = await fetchPortalPage(new URL(cpvForm.action, currentPage.url).href, {
      method: 'POST',
      body: cpvForm.params.toString(),
      referer: currentPage.url,
      cookies,
      signal,
      fetchImpl,
    });
    const comboHtml = /<select\b[^>]*id=["']comboCPVnoPrincipal["'][^>]*>([\s\S]*?)<\/select>/i.exec(currentPage.html)?.[1] || '';
    const accepted = new RegExp(`<option\\b[^>]*\\bvalue=["']${paddedCpv}["']`, 'i').test(comboHtml);
    if (!accepted) {
      return { items: [], truncated: false, total: 0, applied };
    }
    applied.cpv = paddedCpv;
  }

  const searchForm = serializeJsfForm(currentPage.html, ':form1');
  const formId = searchForm.formId;
  let criteriaCount = 0;

  if (applied.cpv) criteriaCount++;

  if (deadlineCutoff) {
    searchForm.params.set(`${formId}:estadoLici`, 'PUB');
    criteriaCount++;
    const minDeadline = isoToPlacspDate(deadlineCutoff.slice(0, 10));
    if (minDeadline) {
      searchForm.params.set(`${formId}:textMinFecLimite`, minDeadline);
      criteriaCount++;
    }
  } else {
    const statusCode = resolveStatusCode(params.status);
    if (statusCode) {
      searchForm.params.set(`${formId}:estadoLici`, statusCode);
      criteriaCount++;
    }
  }

  const entity = typeof params.entity === 'string' ? params.entity.trim() : '';
  if (entity) {
    searchForm.params.set(`${formId}:texoorganoMAQ`, entity);
    criteriaCount++;
  }

  const reference = typeof params.reference === 'string' ? params.reference.trim() : '';
  if (reference) {
    searchForm.params.set(`${formId}:text71ExpMAQ`, reference);
    criteriaCount++;
  }

  const contractTypeCode = typeof params.contractType === 'string' ? params.contractType.trim() : '';
  if (contractTypeCode && Object.hasOwn(PLACSP_CONTRACT_TYPE_LABELS, contractTypeCode)) {
    searchForm.params.set(`${formId}:combo1MAQ`, contractTypeCode);
    applied.contractType = PLACSP_CONTRACT_TYPE_LABELS[contractTypeCode];
    criteriaCount++;
  }

  const { procCode, procLabel, ctCode, ctLabel } = resolveModalityFilters(params.modality);
  if (procCode) {
    searchForm.params.set(`${formId}:menu111MAQ`, procCode);
    applied.procedure = procLabel;
    criteriaCount++;
  }
  if (!applied.contractType && ctCode) {
    searchForm.params.set(`${formId}:combo1MAQ`, ctCode);
    applied.contractType = ctLabel;
    criteriaCount++;
  }

  const euFunded = typeof params.euFunded === 'string' ? params.euFunded.trim() : '';
  if (euFunded === 'EU' || euFunded === 'NO-EU') {
    searchForm.params.set(`${formId}:Financiacion`, euFunded);
    applied.euFunded = true;
    criteriaCount++;
  }

  if (params.minValue !== null && params.minValue !== undefined && params.minValue !== '' && Number.isFinite(Number(params.minValue))) {
    searchForm.params.set(`${formId}:textEstimadoDesde18MAQ`, String(Number(params.minValue)));
    criteriaCount++;
  }

  if (params.maxValue !== null && params.maxValue !== undefined && params.maxValue !== '' && Number.isFinite(Number(params.maxValue))) {
    searchForm.params.set(`${formId}:textEstimado19MAQ`, String(Number(params.maxValue)));
    criteriaCount++;
  }

  const fromDate = isoToPlacspDate(params.fromDate);
  if (fromDate) {
    searchForm.params.set(`${formId}:textMinFecAnuncioMAQ2`, fromDate);
    applied.fromDate = true;
    criteriaCount++;
  }

  if (criteriaCount === 0) {
    searchForm.params.set(`${formId}:menu1MAQ1`, 'ES');
  }

  searchForm.params.set(`${formId}:button1`, 'Buscar');
  currentPage = await fetchPortalPage(new URL(searchForm.action, currentPage.url).href, {
    method: 'POST',
    body: searchForm.params.toString(),
    referer: currentPage.url,
    cookies,
    signal,
    fetchImpl,
  });

  const items = [];
  const seenIds = new Set();
  const cutoffDay = deadlineCutoff ? deadlineCutoff.slice(0, 10) : '';
  let pagesFetched = 0;
  let total = null;
  let nextBtnName = '';

  const filterAndAppend = async pageItems => {
    const sameDayCandidates = cutoffDay ? pageItems.filter(item => item.deadline === cutoffDay && item.url) : [];
    const sameDayDetails = new Map();
    if (sameDayCandidates.length) {
      const results = await Promise.all(sameDayCandidates.map(async item => {
        const detail = await (enrichDetail
          ? enrichDetail(item.url, item.id)
          : fetchPlacspPortalTender(item.url, { id: item.id, fetchImpl })
        ).catch(() => null);
        return [item.id, detail];
      }));
      for (const [id, detail] of results) sameDayDetails.set(id, detail);
    }

    for (const rawItem of pageItems) {
      if (seenIds.has(rawItem.id)) continue;
      seenIds.add(rawItem.id);
      let item = rawItem;
      if (cutoffDay && rawItem.deadline === cutoffDay) {
        const detail = sameDayDetails.get(rawItem.id);
        if (!detail || !detail.deadline || detail.statusCode !== 'PUB' || detail.deadline <= deadlineCutoff) {
          continue;
        }
        item = {
          ...rawItem,
          ...detail,
          id: rawItem.id,
          updatedAt: rawItem.updatedAt,
          publicationDate: detail.publicationDate || rawItem.publicationDate || '',
          classificationCode: detail.classificationCode || rawItem.classificationCode,
          cpvCodes: detail.cpvCodes?.length ? detail.cpvCodes : rawItem.cpvCodes,
        };
      } else if (deadlineCutoff && (item.statusCode !== 'PUB' || !item.deadline || item.deadline <= deadlineCutoff)) {
        continue;
      }
      items.push(item);
    }
  };

  while (true) {
    const parsed = await parseLicitacionesTable(currentPage.html, {
      appliedProcedure: applied.procedure,
      appliedCpv: applied.cpv,
      baseNow,
      indexOffset: pagesFetched * 20,
    });
    if (pagesFetched === 0) total = parsed.total;
    pagesFetched++;
    nextBtnName = parsed.nextBtnName;
    await filterAndAppend(parsed.items);

    if (!nextBtnName || items.length >= target || pagesFetched >= 6) break;
    const nextForm = serializeJsfForm(currentPage.html, ':form1');
    nextForm.params.set(nextBtnName, 'Siguiente >>');
    currentPage = await fetchPortalPage(new URL(nextForm.action, currentPage.url).href, {
      method: 'POST',
      body: nextForm.params.toString(),
      referer: currentPage.url,
      cookies,
      signal,
      fetchImpl,
    });
  }

  return {
    items,
    truncated: Boolean(nextBtnName),
    total,
    applied,
  };
}

async function parseDocumentHitsTable(html) {
  const tableMatch = /<table\b[^>]*id=["'][^"']*tableResultSearch[^"']*["'][^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!tableMatch) {
    if (/No se han encontrado|0 Resultados/i.test(html)) {
      return { hits: [], nextBtnName: '' };
    }
    throw new Error('Respuesta inválida del buscador de documentos de PLACSP');
  }

  const nextMatch = /<input\b([^>]*NextButton\.gif[^>]*)>/i.exec(html);
  const nextBtnName = nextMatch ? (/\bname=["']([^"']+)["']/i.exec(nextMatch[1])?.[1] || '') : '';
  const hits = [];

  for (const [, rowHtml] of tableMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const hrefRaw = /href=["']([^"']*\/wps\/poc\?[^"']*idEvl=[^"']+)["']/i.exec(rowHtml)?.[1] || '';
    if (!hrefRaw) continue;
    const url = canonicalPlacspDetailUrl(decodePlacspMarkup(hrefRaw));
    if (!url) continue;
    const id = await portalTenderId(url);
    if (!id) continue;
    const descMatch = /id=["'][^"']*textColumnaExpedienteResultado["'][^>]*>([\s\S]*?)<\/span>/i.exec(rowHtml);
    const dateMatch = /id=["'][^"']*textColumnaDateResultado["'][^>]*>([\s\S]*?)<\/span>/i.exec(rowHtml);
    hits.push({
      id,
      url,
      description: descMatch ? stripMarkup(descMatch[1]) : '',
      publicationDate: dateMatch ? placspDateToIso(stripMarkup(dateMatch[1])) : '',
    });
  }

  return { hits, nextBtnName: decodePlacspMarkup(nextBtnName) };
}

export async function searchPlacspPortalDocumentHits(
  keyword,
  { maxPages = 1, fetchImpl = fetch, timeoutMs = 15_000 } = {}
) {
  const query = typeof keyword === 'string' ? keyword.trim() : '';
  if (!query) return { hits: [], truncated: false };

  const cookies = new Map();
  const signal = AbortSignal.timeout(timeoutMs);

  const landing = await fetchPortalPage(PLACSP_DOCUMENTOS_URL, { cookies, signal, fetchImpl });
  const form = serializeJsfForm(landing.html, ':j_id_a');
  form.params.set(`${form.formId}:boxSearch`, query);
  form.params.set(`${form.formId}:botonSubmitSearch`, 'Buscar');

  let currentPage = await fetchPortalPage(new URL(form.action, landing.url).href, {
    method: 'POST',
    body: form.params.toString(),
    referer: landing.url,
    cookies,
    signal,
    fetchImpl,
  });

  const byUrl = new Map();
  let page = 0;
  let nextBtnName = '';

  while (true) {
    const parsed = await parseDocumentHitsTable(currentPage.html);
    page++;
    nextBtnName = parsed.nextBtnName;
    for (const hit of parsed.hits) {
      if (!byUrl.has(hit.url)) byUrl.set(hit.url, hit);
    }
    if (!nextBtnName || page >= maxPages) break;

    const nextForm = serializeJsfForm(currentPage.html, ':j_id_a');
    nextForm.params.set(`${nextBtnName}.x`, '5');
    nextForm.params.set(`${nextBtnName}.y`, '5');
    currentPage = await fetchPortalPage(new URL(nextForm.action, currentPage.url).href, {
      method: 'POST',
      body: nextForm.params.toString(),
      referer: currentPage.url,
      cookies,
      signal,
      fetchImpl,
    });
  }

  return {
    hits: [...byUrl.values()],
    truncated: Boolean(nextBtnName),
  };
}

export async function enrichPlacspPortalDocumentHits(
  hits,
  { excludePublications = new Set(), fromDate = '', deadlineCutoff = null, maxDetails = 8, fetchTender, fetchImpl = fetch } = {}
) {
  const candidates = [];
  for (const hit of hits || []) {
    if (!hit?.url) continue;
    let idEvl = '';
    try {
      idEvl = new URL(hit.url).searchParams.get('idEvl')?.replaceAll(' ', '+') || '';
    } catch { /* ignore */ }
    if (idEvl && excludePublications.has(`placsp:${idEvl}`)) continue;
    if (fromDate && hit.publicationDate && hit.publicationDate < fromDate) continue;
    candidates.push(hit);
    if (candidates.length >= maxDetails) break;
  }

  const loadTender = fetchTender || (hit => fetchPlacspPortalTender(hit.url, {
    id: hit.id,
    publicationDate: hit.publicationDate,
    fetchImpl,
  }));

  const enriched = [];
  for (let i = 0; i < candidates.length; i += 4) {
    const batch = await Promise.allSettled(candidates.slice(i, i + 4).map(hit => loadTender(hit)));
    for (let j = 0; j < batch.length; j++) {
      const result = batch[j];
      if (result.status !== 'fulfilled' || !result.value) continue;
      const tender = result.value;
      const hit = candidates[i + j];
      const item = {
        ...tender,
        publicationDate: tender.publicationDate || hit.publicationDate || '',
        description: tender.description || hit.description || '',
      };
      if (deadlineCutoff && (item.statusCode !== 'PUB' || !item.deadline || item.deadline <= deadlineCutoff)) {
        continue;
      }
      enriched.push(item);
    }
  }

  return enriched;
}
