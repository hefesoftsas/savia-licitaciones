import placsp from '../../client/electron/services/placspService.cjs';

export const decodePlacspMarkup = value => value.replace(/&#(\d+);/g, (match, digits) => {
  const point = Number(digits);
  return point <= 0x10ffff ? String.fromCodePoint(point) : match;
}).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();

export async function fetchPlacspDetail(url, request) {
  let current = new URL(url);
  const origin = current.origin;
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
    const next = new URL(location, current);
    if (next.origin !== origin || !next.pathname.startsWith('/wps/')) return '';
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const name = pair.split('=', 1)[0];
      if (name) cookies.set(name, pair);
    }
    current = next;
  }
  return '';
}

export function placspDocumentHeaders(accept) {
  return {
    Accept:accept,
    'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };
}

const portalHosts = new Set(['contrataciondelestado.es', 'contrataciondelsectorpublico.gob.es']);

function officialUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (url.protocol === 'https:' && portalHosts.has(url.hostname) && !url.port && !url.username && !url.password) return url;
  } catch { /* Invalid portal link. */ }
  return null;
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

export async function fetchPlacspPortalDocuments(url) {
  const page = officialUrl(url);
  if (!page?.pathname.startsWith('/wps/')) return [];
  const signal = AbortSignal.timeout(12000);
  const html = await fetchPlacspDetail(page.href, (href, options) => fetch(href, {...options, signal}));
  const documents = new Map();
  const publications = [];
  for (const [, row] of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
    const label = decodePlacspMarkup((cells[1]?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
    if (!label) continue;
    for (const [, href, content] of row.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const link = officialDocumentUrl(decodePlacspMarkup(href), page.href);
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
    const response = await fetch(publicationXml.href, {
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
