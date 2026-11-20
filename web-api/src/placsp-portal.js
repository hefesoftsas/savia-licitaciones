import placsp from '../../client/electron/services/placspService.cjs';

const NAMED_ENTITIES = {
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
  ordm: 'º', ordf: 'ª', euro: '€', nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&',
};

export const decodePlacspMarkup = value => String(value || '').replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (match, entity) => {
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const point = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : match;
  }
  if (entity.startsWith('#')) {
    const point = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : match;
  }
  return Object.hasOwn(NAMED_ENTITIES, entity) ? NAMED_ENTITIES[entity] : match;
}).trim();

export const portalHosts = new Set(['contrataciondelestado.es', 'contrataciondelsectorpublico.gob.es']);

export function officialUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (url.protocol === 'https:' && portalHosts.has(url.hostname) && !url.port && !url.username && !url.password) return url;
  } catch { /* Invalid portal link. */ }
  return null;
}

export function canonicalPlacspDetailUrl(value, base) {
  const url = officialUrl(value, base);
  if (!url) return '';
  if (url.pathname === '/wps/poc' && url.searchParams.has('idEvl')) {
    const idEvl = url.searchParams.get('idEvl')?.replaceAll(' ', '+') || '';
    if (idEvl) {
      return `https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=${encodeURIComponent(idEvl)}`;
    }
  }
  return url.href;
}

export function isPortalTenderId(id) {
  return typeof id === 'string' && /^portal:(?:[a-f0-9]{24}|lic-\d+)$/.test(id);
}

export async function portalTenderId(url, idLicitacion) {
  const parsed = url instanceof URL ? url : officialUrl(url);
  const idEvl = parsed?.pathname === '/wps/poc' ? (parsed.searchParams.get('idEvl')?.replaceAll(' ', '+') || '') : '';
  if (idEvl) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(idEvl));
    return 'portal:' + Array.from(new Uint8Array(hash).subarray(0, 12), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  if (idLicitacion !== undefined && idLicitacion !== null && /^\d+$/.test(String(idLicitacion))) {
    return 'portal:lic-' + String(idLicitacion);
  }
  return '';
}

export function parsePlacspSpanishNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = String(raw || '').replace(/[^\d.,-]/g, '').trim();
  if (!text) return null;
  let normalized = text;
  if (text.includes(',') && text.includes('.')) {
    normalized = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (text.includes(',')) {
    normalized = text.replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, '');
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function parsePlacspStatusCode(status) {
  const text = String(status || '').trim();
  if (!text) return '';
  if (/^Publicad[ao]$/i.test(text)) return 'PUB';
  if (/^Anuncio\s+Previo$/i.test(text)) return 'PRE';
  if (/^Evaluaci[oó]n/i.test(text)) return 'EV';
  if (/^(?:Parcialmente\s+)?Adjudicad[ao]|^Adjudicaci[oó]n\s+Provisional$/i.test(text)) return 'ADJ';
  if (/^(?:Parcialmente\s+)?Resuelt[ao]|^Desistid[ao]|^Cerrad[ao]$/i.test(text)) return 'RES';
  if (/^Anulad[ao]$/i.test(text)) return 'ANUL';
  return '';
}

function stripMarkup(html) {
  return decodePlacspMarkup(String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function parsePlacspDetailHtml(html, fallbackUrl = '') {
  if (!html) return null;
  const field = name => {
    const match = new RegExp(`<span\\b[^>]*id="[^"]*:form1:text_${name}"[^>]*>([\\s\\S]*?)<\\/span>`, 'i').exec(html);
    return match ? stripMarkup(match[1]) : '';
  };
  const reference = field('Expediente');
  const title = field('ObjetoContrato');
  const status = field('Estado');
  const entity = field('OC_con');
  if (!reference || !title || !status || !entity) return null;

  const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2})(?::(\d{2}))?)?$/.exec(field('FechaPresentacionOfertaConHora'));
  const deadline = dateMatch
    ? (dateMatch[4]
      ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T${dateMatch[4]}:${dateMatch[5] || '00'}`
      : `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`)
    : '';
  const value = parsePlacspSpanishNumber(field('Presupuesto') || field('ValorContrato'));
  const rawLocation = field('LugarEjecucion');
  const territory = rawLocation.includes(' - ')
    ? rawLocation.split(' - ').slice(1).join(' - ').trim()
    : (rawLocation && !/^Espa[nñ]a$/i.test(rawLocation) ? rawLocation : '');
  const cpvCodes = [];
  for (const match of field('CPV').matchAll(/\b(\d{8})-/g)) {
    if (!cpvCodes.includes(match[1])) cpvCodes.push(match[1]);
  }

  let publicationDate = '';
  const docTable = /<table\b[^>]*id="[^"]*myTablaDetalleVISUOE[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(html)?.[1] || '';
  if (docTable) {
    let fallbackDate = '';
    for (const [, rowHtml] of docTable.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => stripMarkup(cell[1]));
      const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[0] || '');
      if (!dm) continue;
      const iso = `${dm[3]}-${dm[2]}-${dm[1]}`;
      const label = cells[1] || '';
      if (/Anuncio de Licitaci[oó]n/i.test(label)) {
        publicationDate = iso;
        break;
      }
      if (!fallbackDate && /Pliego/i.test(label)) fallbackDate = iso;
    }
    if (!publicationDate) publicationDate = fallbackDate;
  }

  const url = canonicalPlacspDetailUrl(field('EnlaceLicPLACE'))
    || canonicalPlacspDetailUrl(fallbackUrl)
    || officialUrl(fallbackUrl)?.href
    || '';

  return {
    reference,
    title,
    entity,
    entityId: field('IdOrganoContratacion'),
    status,
    statusCode: parsePlacspStatusCode(status),
    deadline,
    deadlineVerified: Boolean(deadline),
    value,
    currency: 'EUR',
    currencyVerified: value !== null,
    modality: [field('Procedimiento'), field('TipoContrato')].filter(Boolean).join(' · '),
    territory,
    department: territory,
    classificationCode: cpvCodes[0] || '',
    cpvCodes,
    publicationDate,
    url,
  };
}

export async function fetchPlacspDetail(url, request) {
  let current = new URL(url);
  const cookies = new Map();
  for (let hop = 0; hop < 5; hop++) {
    const response = await request(current.href, {
      redirect: 'manual',
      headers: cookies.size ? { Cookie: [...cookies.values()].join('; ') } : {},
    });
    if (response.ok) return response.text();
    if (response.status < 300 || response.status >= 400) return '';
    const location = response.headers.get('location');
    if (!location) return '';
    const next = officialUrl(location, current);
    if (!next || !next.pathname.startsWith('/wps/')) return '';
    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
    for (const cookie of setCookies) {
      const pair = cookie.split(';', 1)[0];
      const eq = pair.indexOf('=');
      const name = eq > 0 ? pair.slice(0, eq).trim() : '';
      if (name) cookies.set(name, pair.trim());
    }
    current = next;
  }
  return '';
}

export async function fetchPlacspPortalTender(url, { id, publicationDate = '', includeDocuments = false, fetchImpl = fetch, timeoutMs = 12_000 } = {}) {
  const page = officialUrl(url);
  if (!page?.pathname.startsWith('/wps/')) return null;
  const signal = AbortSignal.timeout(timeoutMs);
  const html = await fetchPlacspDetail(page.href, (href, options) => fetchImpl(href, {
    ...options,
    headers: {
      ...placspDocumentHeaders('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
      'Accept-Language': 'es-ES,es;q=0.9',
      ...(options.headers || {}),
    },
    signal,
  }));
  const parsed = parsePlacspDetailHtml(html, page.href);
  if (!parsed) return null;
  const resolvedId = id || await portalTenderId(parsed.url || page.href);
  if (!resolvedId) return null;
  const documents = includeDocuments
    ? await extractPortalDocumentsFromHtml(html, page.href, { fetchImpl, signal }).catch(() => [])
    : [];
  return {
    id: resolvedId,
    ...parsed,
    publicationDate: parsed.publicationDate || publicationDate || '',
    updatedAt: new Date().toISOString(),
    documents,
    source: 'placsp',
    country: 'ES',
  };
}

export function placspDocumentHeaders(accept) {
  return {
    Accept:accept,
    'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };
}

function officialDocumentUrl(value, base) {
  const url = officialUrl(value, base);
  return url?.pathname === '/FileSystem/servlet/GetDocumentByIdServlet' && url.searchParams.has('DocumentIdParam') ? url : null;
}

async function addDocument(documents, document, url) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url.href));
  const id = 'PLACSP-' + Array.from(new Uint8Array(hash).subarray(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
  documents.set(id, {...document, id, url:url.href});
}

async function extractPortalDocumentsFromHtml(html, pageHref, { fetchImpl = fetch, signal } = {}) {
  const documents = new Map();
  const publications = [];
  for (const [, row] of String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
    const label = decodePlacspMarkup((cells[1]?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
    if (!label) continue;
    for (const [, href, content] of row.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const link = officialDocumentUrl(decodePlacspMarkup(href), pageHref);
      if (!link) continue;
      if (/pliego/i.test(label) && /\b(?:alt|title)="Documento xml"/i.test(content)) publications.push(link);
      const extension = /\b(?:alt|title)="Documento pdf"/i.test(content) ? 'pdf'
        : /\.(pdf|docx?|xlsx?)$/i.exec(label)?.[1].toLowerCase();
      if (!extension) continue;
      const name = label.toLowerCase().endsWith('.' + extension) ? label : label + '.' + extension;
      await addDocument(documents, {name, extension, docType:/pliego/i.test(label) ? 'PLIEGO' : 'DOC', size:null}, link);
    }
  }
  for (const publicationXml of publications.slice(0, 4)) {
    const response = await fetchImpl(publicationXml.href, {
      headers:placspDocumentHeaders('application/xml,text/xml'), redirect:'manual', signal,
    }).catch(() => null);
    if (response?.ok && !/text\/html/i.test(response.headers.get('content-type') || '')) {
      const attachments = placsp.parseDocuments(await response.text().catch(() => ''));
      let foundAttachments = false;
      for (const document of attachments) {
        const url = officialDocumentUrl(document.url);
        if (url) {
          await addDocument(documents, document, url);
          foundAttachments = true;
        }
      }
      if (foundAttachments) break;
    }
  }
  return [...documents.values()];
}

export async function fetchPlacspPortalDocuments(url) {
  const page = officialUrl(url);
  if (!page?.pathname.startsWith('/wps/')) return [];
  const signal = AbortSignal.timeout(12000);
  const html = await fetchPlacspDetail(page.href, (href, options) => fetch(href, {...options, signal}));
  return extractPortalDocumentsFromHtml(html, page.href, { signal });
}
