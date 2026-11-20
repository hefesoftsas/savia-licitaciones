import {decodePlacspMarkup as decode, fetchPlacspDetail, parsePlacspDetailHtml} from './placsp-portal.js';
import placsp from '../../client/electron/services/placspService.cjs';

const boeOrigin = 'https://www.boe.es';
const indexDays = 10;
const maxDetails = 6;
const hour = 60 * 60 * 1000;
const list = value => Array.isArray(value) ? value : value ? [value] : [];
const fold = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
async function loadBoeIndex(day, request) {
  const response = await request(`${boeOrigin}/datosabiertos/api/boe/sumario/${day}`, {
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`BOE HTTP ${response.status}`);
  const { data } = await response.json();
  return list(data?.sumario?.diario)
    .flatMap(issue => list(issue.seccion))
    .filter(section => section.codigo === '5A')
    .flatMap(section => list(section.departamento))
    .flatMap(department => list(department.item))
    .filter(item => /^BOE-B-\d{4}-\d+$/.test(item.identificador) && /^Anuncio de licitaci[oó]n de:/i.test(item.titulo))
    .map(item => ({ id: item.identificador, title: item.titulo, day }));
}

function publishedBoeTender(notice, xml) {
  const metadata = /Anuncio de licitaci[oó]n de:\s*(.+?)\.\s*Objeto:\s*(.+?)\.\s*Expediente:\s*(.+?)\.$/i.exec(notice.title);
  const deadlineText = /<dt>19\.\s*Plazo para la recepci[oó]n de ofertas[^<]*<\/dt>\s*<dd>([^<]*)<\/dd>/i.exec(xml)?.[1] || '';
  const match = /Hasta las (\d{2}:\d{2}) horas del (\d{1,2}) de ([a-z]+) de (\d{4})/i.exec(deadlineText);
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const month = match ? months.indexOf(match[3].toLowerCase()) + 1 : 0;
  if (!metadata || !month) return null;
  const deadline = `${match[4]}-${String(month).padStart(2,'0')}-${match[2].padStart(2,'0')}T${match[1]}:00`;
  return { entity: metadata[1], title: metadata[2], reference: metadata[3], deadline,
    status: 'Anuncio BOE', statusCode: placsp.PLACSP_OPEN_STATUS, verifiedOnPlacsp: false };
}

async function verifyNotice(notice, request) {
  const response = await request(`${boeOrigin}/diario_boe/xml.php?id=${notice.id}`);
  if (!response.ok) return null;
  const xml = decode(await response.text());
  const url = /https:\/\/(?:contrataciondelestado\.es|contrataciondelsectorpublico\.gob\.es)\/wps\/poc\?[^\s<"']*\bidEvl=[^\s<"']*/i.exec(xml)?.[0];
  if (!url) return null;
  const base = {
    id: `boe:${notice.id}`,
    publicationDate: `${notice.day.slice(0, 4)}-${notice.day.slice(4, 6)}-${notice.day.slice(6)}`,
    currency: 'EUR', url, documents: [],
  };
  const html = await fetchPlacspDetail(url, request).catch(() => '');
  const published = () => {
    const tender = publishedBoeTender(notice, xml);
    return tender ? { ...base, ...tender } : null;
  };
  if (!html) return published();
  const parsed = parsePlacspDetailHtml(html, url);
  if (!parsed) return published();
  return {
    ...base,
    reference: parsed.reference,
    title: parsed.title,
    entity: parsed.entity,
    entityId: parsed.entityId,
    status: parsed.status,
    verifiedOnPlacsp: true,
    statusCode: parsed.statusCode,
    deadline: parsed.deadline,
    value: parsed.value,
    currency: 'EUR',
    modality: parsed.modality,
    territory: parsed.territory,
    cpvCodes: parsed.cpvCodes,
  };
}

export async function findRecentBoeTenders(keywords, cutoff, { cached, fresh = false, fetchImpl = fetch }) {
  const signal = AbortSignal.timeout(18000);
  const request = (url, options) => fetchImpl(url, { signal, ...options });
  const date = Date.parse(`${cutoff.slice(0, 10)}T00:00:00Z`);
  const days = Array.from({ length: indexDays }, (_, index) =>
    new Date(date - index * 86400000).toISOString().slice(0, 10).replaceAll('-', '')
  );
  const indexes = await Promise.allSettled(days.map(day => cached(`index:${day}`, hour, () => loadBoeIndex(day, request))));
  const terms = keywords.map(fold);
  const matching = new Map();
  for (const result of indexes) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) {
      if (!matching.has(item.id) && terms.some(term => fold(item.title).includes(term))) matching.set(item.id, item);
    }
  }
  const notices = [...matching.values()].slice(0, maxDetails);
  const details = await Promise.allSettled(notices.map(notice => cached(
    `detail:${notice.id}`, 5 * 60000, () => verifyNotice(notice, request), fresh
  )));
  return details.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
}
