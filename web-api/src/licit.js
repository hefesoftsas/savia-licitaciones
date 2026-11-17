import placsp from '../../client/electron/services/placspService.cjs';

const origin = 'https://api.licit.es';
const states = {
  'EN PLAZO': ['PUB', 'Publicado'],
  'PENDIENTE DE ADJUDICACION': ['EV', 'Evaluación'],
  'ADJUDICADA': ['ADJ', 'Adjudicado'],
  'RESUELTA': ['RES', 'Resuelto'],
  'ANULADA': ['ANUL', 'Anulado'],
  'ANUNCIO PREVIO': ['PRE', 'Anuncio previo'],
};
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const hourPattern = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const idPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

async function json(path, signal, input) {
  const response = await fetch(origin + path, {
    signal,
    ...(input && {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(input)}),
  });
  if (!response.ok) throw Object.assign(new Error('licit.es HTTP ' + response.status), {status:response.status});
  return response.json();
}

function mapTender(row) {
  const [statusCode, status] = states[row.estado?.toUpperCase()] || [row.status_code || '', row.estado || ''];
  const date = datePattern.test(row.fecha_limite) ? row.fecha_limite : '';
  const time = hourPattern.test(row.hora_limite) ? (row.hora_limite.length === 5 ? row.hora_limite + ':00' : row.hora_limite) : '';
  return {
    id: 'licit:' + row.id, reference: row.expediente, title: row.titulo,
    entity: row.organo, entityId: row.organo_id, modality: [row.procedimiento, row.tipo_contrato].filter(Boolean).join(' · '),
    status, statusCode, value: row.presupuesto_sin_iva, currency: 'EUR',
    publicationDate: row.fecha_publicacion, updatedAt: row.fecha_actualizacion,
    deadline: date && (time ? date + 'T' + time : date),
    territory: row.lugar_subentidad || row.lugar, cpvCodes: row.cpv_principal ? [row.cpv_principal] : [],
    url: placsp.validatePlacspUrl(row.url_place), documents: [],
  };
}

export async function searchLicit(params, cutoff, target) {
  const signal = AbortSignal.timeout(12000);
  const filters = {
    estado: cutoff ? ['EN PLAZO'] : undefined,
    cpv_prefijo: params.classificationClass || undefined,
    ccaa: typeof params.department === 'string' ? params.department : undefined,
    importe_min: params.minValue, importe_max: params.maxValue,
    fecha_publicacion_desde: params.fromDate,
  };
  const items = [];
  let cursor;
  let searched = 0;
  do {
    const request = {
      q: params.keyword?.trim() || undefined, filtros: filters,
      ordenar: params.sortBy === 'value' ? 'importe' : 'fecha',
      limit: Math.min(100, Math.max(40, target)), cursor,
    };
    const result = await json('/v1/buscar', signal, request).catch(error => {
      // A cursor is tied to its filters. Retry only before starting pagination.
      if (cursor || !filters.estado || !(error.status >= 500)) throw error;
      delete filters.estado;
      return json('/v1/buscar', signal, request);
    });
    if (!Array.isArray(result.resultados)) throw new Error('Respuesta inválida de licit.es');
    const candidates = result.resultados.filter(row => idPattern.test(row.id) && row.titulo);
    for (let i = 0; i < candidates.length; i += 5) {
      const chunk = await Promise.all(candidates.slice(i, i + 5).map(async row => {
        if (cutoff && row.fecha_limite === cutoff.slice(0, 10)) {
          const detail = await json('/v1/licitacion/' + row.id, signal).catch(() => null);
          if (!detail || !hourPattern.test(detail.hora_limite)) return null;
          row = {...row, ...detail};
        }
        const tender = mapTender(row);
        return !cutoff || (tender.statusCode === 'PUB' && tender.deadline > cutoff) ? tender : null;
      }));
      items.push(...chunk.filter(Boolean));
    }
    if (result.cursor_siguiente && result.cursor_siguiente === cursor) throw new Error('Paginación repetida de licit.es');
    cursor = result.cursor_siguiente;
    searched++;
  } while (cursor && items.length <= target && searched < 12);
  return {items, truncated:Boolean(cursor)};
}

export function isLicitTenderId(id) {
  return typeof id === 'string' && id.startsWith('licit:') && idPattern.test(id.slice(6));
}

export async function getLicitTender(id) {
  if (!isLicitTenderId(id)) throw new Error('Identificador de licit.es inválido');
  const row = await json('/v1/licitacion/' + id.slice(6), AbortSignal.timeout(12000));
  if (row.id !== id.slice(6) || !row.titulo) throw new Error('Respuesta inválida de licit.es');
  return mapTender(row);
}
