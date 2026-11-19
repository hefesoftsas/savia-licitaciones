'use strict';

/**
 * Read-only backend for SECOP Opportunities.
 * Query public datos.gov.co datasets (Socrata, without API keys):
 * - SECOP II Procurement Processes … https://www.datos.gov.co/resource/p6dx-8zbt.json
 * - SECOP II Electronic Contracts … https://www.datos.gov.co/resource/jbjy-vk9h.json
 * - SECOP I Public Procurement Processes … https://www.datos.gov.co/resource/f789-7hwg.json
 *   (official Colombia Compra Eficiente dataset, verified at
 *   https://www.datos.gov.co/Estad-sticas-Nacionales/SECOP-I-Procesos-de-Compra-P-blica/f789-7hwg)
 *
 * Public GET requests only; category options may be cached locally.
 */

const fs = require('node:fs');
const path = require('node:path');
const { pickLocaleMessage, detectLocaleFromConfig } = require('../utils/localeMessages.cjs');

const REQUEST_TIMEOUT_MS = 30_000;
const RESPONSE_CACHE_TTL_MS = 5 * 60 * 1000;
const CATEGORY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;
const RESPONSE_CACHE_MAX_ENTRIES = 200;
const USER_AGENT = 'savia-licitaciones';
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const SECOP_II_PROCESOS_URL = 'https://www.datos.gov.co/resource/p6dx-8zbt.json';
// Official yearly file datasets; process documents may be
// published years after the procedure starts.
const SECOP_II_DOCUMENTS_URLS = ['dmgg-8hin', 'h4m3-b4e2', 'nbae-kzan', '3skv-9na7', 'kgcd-kt7i', 'f8va-cf4m']
  .map(id => `https://www.datos.gov.co/resource/${id}.json`);
const SECOP_II_CONTRATOS_URL = 'https://www.datos.gov.co/resource/jbjy-vk9h.json';
/**
 * To add another SECOP I process dataset if this one becomes obsolete:
 * 1. Search for SECOP I at https://www.datos.gov.co under Colombia Compra Eficiente.
 * 2. Open the dataset and copy its nine-character URL ID, such as f789-7hwg.
 * 3. Verify column names at https://www.datos.gov.co/api/views/<id>.json
 *    and update DATASETS below. Never invent IDs: the URL must return valid JSON.
 */
const SECOP_I_PROCESOS_URL = 'https://www.datos.gov.co/resource/f789-7hwg.json';

/**
 * Per-dataset configuration. Column names are exact datos.gov.co fieldName values
 * verified against /api/views/<id>.json.
 * *_CANDIDATES lists are used only when mapping rows; missing response fields
 * are ignored without failing.
 */
const DATASETS = {
  'secop-ii': {
    baseUrl: SECOP_II_PROCESOS_URL,
    source: 'secop-ii',
    idField: 'id_del_proceso',
    orderField: 'fecha_de_publicacion_del',
    departmentFields: ['departamento_entidad'],
    modalityFields: ['modalidad_de_contratacion'],
    statusFields: ['estado_del_procedimiento', 'estado_resumen'],
    phaseFields: ['fase'],
    valueFields: ['precio_base', 'valor_total_adjudicacion'],
    publicationDateFields: ['fecha_de_publicacion_del', 'fecha_de_ultima_publicaci'],
    // Opening responses is not the deadline for receiving them.
    deadlineFields: ['fecha_de_recepcion_de'],
    entityFields: ['entidad'],
    titleFields: ['nombre_del_procedimiento', 'descripci_n_del_procedimiento'],
    referenceFields: ['referencia_del_proceso'],
    classificationFields: ['codigo_principal_de_categoria'],
    cityFields: ['ciudad_entidad'],
    // Return only links to public details containing a valid noticeUID.
    urlFields: ['urlproceso'],
  },
  contratos: {
    baseUrl: SECOP_II_CONTRATOS_URL,
    source: 'secop-ii',
    idField: 'id_contrato',
    orderField: 'fecha_de_firma',
    departmentFields: ['departamento'],
    modalityFields: ['modalidad_de_contratacion'],
    statusFields: ['estado_contrato'],
    phaseFields: [],
    valueFields: ['valor_del_contrato'],
    publicationDateFields: ['fecha_de_firma', 'fecha_de_inicio_del_contrato'],
    deadlineFields: [],
    entityFields: ['nombre_entidad'],
    titleFields: ['descripcion_del_proceso', 'objeto_del_contrato'],
    referenceFields: ['referencia_del_contrato', 'proceso_de_compra'],
    classificationFields: ['codigo_de_categoria_principal'],
    cityFields: ['ciudad'],
    // As with processes, validate before displaying public links.
    urlFields: ['urlproceso'],
  },
  'secop-i': {
    baseUrl: SECOP_I_PROCESOS_URL,
    source: 'secop-i',
    idField: 'uid',
    orderField: 'fecha_de_cargue_en_el_secop',
    departmentFields: ['departamento_entidad'],
    modalityFields: ['modalidad_de_contratacion'],
    statusFields: ['estado_del_proceso'],
    phaseFields: [],
    valueFields: ['cuantia_proceso', 'cuantia_contrato', 'valor_contrato_con_adiciones'],
    publicationDateFields: ['fecha_de_cargue_en_el_secop', 'ultima_actualizacion'],
    deadlineFields: [],
    entityFields: ['nombre_entidad'],
    titleFields: ['detalle_del_objeto_a_contratar', 'objeto_a_contratar', 'objeto_del_contrato_a_la'],
    referenceFields: ['numero_de_proceso', 'numero_de_constancia', 'numero_de_contrato'],
    classificationFields: ['id_clase'],
    cityFields: ['municipio_entidad', 'municipio_de_entrega', 'municipios_ejecucion'],
    urlFields: ['ruta_proceso_en_secop_i'],
  },
};

function firstText(row, candidates) {
  for (const field of candidates) {
    const value = row?.[field];
    if (value == null) continue;
    if (typeof value === 'object') {
      const nested = value.url || value.description || value.value;
      if (nested != null && String(nested).trim()) return String(nested).trim();
      continue;
    }
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function firstNumberOrNull(row, candidates) {
  for (const field of candidates) {
    const value = row?.[field];
    if (value == null || value === '') continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

/** Escape single quotes in SoQL literals using the official doubled-quote escape. */
function escapeSoqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function likeClause(field, value) {
  return `${field} like '%${escapeSoqlLiteral(value)}%'`;
}

function orLikeClause(fields, value) {
  const parts = fields.map((field) => likeClause(field, value));
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `(${parts.join(' or ')})`;
}

function categoryClause(fields, value) {
  if (!Array.isArray(value)) return value ? orLikeClause(fields, value) : '';
  const parts = value.map(item => `${fields[0]} = '${escapeSoqlLiteral(item)}'`);
  return parts.length ? `(${parts.join(' or ')})` : '';
}

function mapRowToProcess(row, config) {
  const id = firstText(row, [config.idField]);
  const portfolioId = firstText(row, ['id_del_portafolio', 'proceso_de_compra']);
  const deadline = firstText(row, config.deadlineFields) || undefined;
  const reportedCurrency = config === DATASETS['secop-i'] ? firstText(row, ['moneda']) : '';
  const currency = reportedCurrency && !/^no definido$/i.test(reportedCurrency) ? reportedCurrency : undefined;
  let officialUrl = firstText(row, config.urlFields);
  if (config.source === 'secop-ii') {
    try {
      const url = new URL(officialUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'community.secop.gov.co' || url.pathname !== '/Public/Tendering/OpportunityDetail/Index' || !/^CO1\.NTC\.\d+$/.test(url.searchParams.get('noticeUID') || '')) officialUrl = '';
    } catch { officialUrl = ''; }
  }
  return {
    id,
    portfolioId: /^CO1\.BDOS\.\d+$/.test(portfolioId) ? portfolioId : undefined,
    reference: firstText(row, config.referenceFields) || undefined,
    classificationCode: firstText(row, config.classificationFields) || undefined,
    entity: firstText(row, config.entityFields),
    title: firstText(row, config.titleFields),
    modality: firstText(row, config.modalityFields) || undefined,
    status: firstText(row, config.statusFields) || undefined,
    phase: firstText(row, config.phaseFields) || undefined,
    value: firstNumberOrNull(row, config.valueFields),
    currency,
    currencyVerified: Boolean(currency),
    publicationDate: firstText(row, config.publicationDateFields) || undefined,
    deadline,
    deadlineVerified: config === DATASETS['secop-ii'] && deadline ? true : undefined,
    department: firstText(row, config.departmentFields) || undefined,
    city: firstText(row, config.cityFields) || undefined,
    // URLs come from the official dataset itself; omit them when absent.
    url: officialUrl || undefined,
    source: config.source,
  };
}

/** Provide SECOP process search/details through Socrata open data. */
function createSecopService({ configStore, cacheDirectory } = {}) {
  const categoryCacheFile = cacheDirectory && path.join(cacheDirectory, 'secop-filter-options.json');
  let categoryCache = {};
  if (categoryCacheFile) {
    try { categoryCache = JSON.parse(fs.readFileSync(categoryCacheFile, 'utf8')); } catch { /* Empty or unavailable cache. */ }
  }
  const persistCategoryCache = () => {
    if (!categoryCacheFile) return;
    try {
      fs.mkdirSync(cacheDirectory, { recursive: true });
      const temp = `${categoryCacheFile}.${process.pid}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(categoryCache), 'utf8');
      fs.renameSync(temp, categoryCacheFile);
    } catch { /* A cache write must never prevent a search. */ }
  };
  const getSearchPreferences = () => configStore?.load?.().secop_search_preferences || null;
  const saveSearchPreferences = preferences => configStore?.save?.({ secop_search_preferences: preferences });
  const locale = () => detectLocaleFromConfig(configStore);

  const networkErrorMessage = () => pickLocaleMessage(
    locale(),
    '无法连接 SECOP 公开数据，请检查网络后重试',
    'No se pudo conectar con los datos abiertos de SECOP; revise su conexión y reintente',
    'Could not reach SECOP open data; check your connection and retry',
  );

  const emptyResultMessage = () => pickLocaleMessage(
    locale(),
    '未找到符合条件的过程',
    'No se encontraron procesos con esos criterios',
    'No processes found matching those criteria',
  );

  // In-memory GET response cache with TTL protects datos.gov.co request limits
  // during repeated searches/pagination. Cache successful responses only.
  const responseCache = new Map();
  function readCachedRows(url) {
    const entry = responseCache.get(url);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      responseCache.delete(url);
      return null;
    }
    return entry.data;
  }
  function writeCachedRows(url, data, ttlMs) {
    if (responseCache.size >= RESPONSE_CACHE_MAX_ENTRIES) {
      const oldest = responseCache.keys().next();
      if (!oldest.done) responseCache.delete(oldest.value);
    }
    responseCache.set(url, { expiresAt: Date.now() + ttlMs, data });
  }

  function readAppToken() {
    try {
      const token = configStore?.load?.()?.secop_app_token;
      if (typeof token === 'string' && token.trim()) return token.trim();
    } catch {
      // No configuration available: continue anonymously.
    }
    return '';
  }

  async function fetchRows(baseUrl, params, timeoutMs = REQUEST_TIMEOUT_MS, ttlMs = RESPONSE_CACHE_TTL_MS) {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
    const cached = ttlMs > 0 ? readCachedRows(url.toString()) : null;
    if (cached) return cached;
    const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
    const appToken = readAppToken();
    if (appToken) headers['X-App-Token'] = appToken;
    let response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const timedOut = cause?.name === 'TimeoutError' || cause?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';
      const message = timedOut ? (locale() === 'en' ? 'The data source took too long to respond. Retry the request.' : 'La fuente de datos tardó demasiado en responder. Reintenta la consulta.') : networkErrorMessage();
      throw Object.assign(new Error(message, { cause }), { transient: true, timedOut });
    }
    if (!response.ok) {
      throw Object.assign(new Error(pickLocaleMessage(
        locale(),
        `SECOP 数据请求失败：HTTP ${response.status}`,
        `Error al consultar datos SECOP: HTTP ${response.status}`,
        `SECOP data request failed: HTTP ${response.status}`,
      )), { status: response.status, timedOut: response.status === 504, transient: [502, 503, 504].includes(response.status) });
    }
    try {
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid SECOP response');
      const rows = data;
      if (ttlMs > 0) writeCachedRows(url.toString(), rows, ttlMs);
      return rows;
    } catch {
      throw new Error(pickLocaleMessage(
        locale(),
        'SECOP 返回的数据格式不正确',
        'SECOP devolvió datos con formato inválido',
        'SECOP returned data in an invalid format',
      ));
    }
  }

  function buildSearchParams(config, searchParams, limit, offset) {
    const whereParts = [];
    if (/^\d{6}$/.test(String(searchParams.classificationClass || ''))) {
      whereParts.push(orLikeClause(config.classificationFields, String(searchParams.classificationClass)));
    }
    if (searchParams.department) {
      whereParts.push(categoryClause(config.departmentFields, searchParams.department));
    }
    if (searchParams.modality) {
      whereParts.push(categoryClause(config.modalityFields, searchParams.modality));
    }
    if (searchParams.status) {
      const statusFields = [...config.statusFields, ...config.phaseFields];
      whereParts.push(categoryClause(statusFields, searchParams.status));
    }
    if (Number.isFinite(searchParams.minValue)) {
      whereParts.push(`${config.valueFields[0]} >= ${Number(searchParams.minValue)}`);
    }
    if (Number.isFinite(searchParams.maxValue)) {
      whereParts.push(`${config.valueFields[0]} <= ${Number(searchParams.maxValue)}`);
    }
    if (searchParams.fromDate) {
      whereParts.push(`${config.publicationDateFields[0]} >= '${escapeSoqlLiteral(searchParams.fromDate)}'`);
    }
    const columns = { title: config.titleFields[0], entity: config.entityFields[0], modality: config.modalityFields[0], status: config.statusFields[0], value: config.valueFields[0], publicationDate: config.publicationDateFields[0], deadline: config.deadlineFields[0], department: config.departmentFields[0] };
    for (const [key, value] of Object.entries(searchParams.columnFilters || {})) {
      if (!columns[key] || !String(value).trim()) continue;
      if (key === 'value') {
        if (Number.isFinite(Number(value))) whereParts.push(columns[key] + ' = ' + Number(value));
      } else if (key === 'publicationDate' || key === 'deadline') {
        const date = String(value).slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          const next = new Date(date + 'T00:00:00Z');
          next.setUTCDate(next.getUTCDate() + 1);
          whereParts.push(columns[key] + " >= '" + date + "' and " + columns[key] + " < '" + next.toISOString().slice(0, 10) + "'");
        }
      } else whereParts.push(orLikeClause([columns[key]], String(value).trim()));
    }
    const sortField = columns[searchParams.sortBy] || config.orderField;
    const sortDirection = searchParams.sortDirection === 'asc' ? 'ASC' : 'DESC';
    // Socrata's compound signing-date sort can time out on the contracts dataset.
    const sortBySigningDate = config === DATASETS.contratos && sortField === config.orderField;
    const full = {
      $limit: limit + 1,
      $offset: offset,
      $order: sortBySigningDate ? `${sortField} ${sortDirection}` : `${sortField} ${sortDirection}, ${config.idField} ASC`,
    };
    if (searchParams.keyword) full.$q = searchParams.keyword;
    const where = whereParts.filter(Boolean).join(' and ');
    if (where) full.$where = where;
    return full;
  }

  async function searchDataset(datasetKey, searchParams, limit, offset) {
    const config = DATASETS[datasetKey];
    if (!config?.baseUrl) {
      throw new Error(pickLocaleMessage(
        locale(),
        '该 SECOP 数据集尚未配置',
        'Ese conjunto de datos SECOP aún no está configurado',
        'That SECOP dataset is not configured yet',
      ));
    }
    const full = buildSearchParams(config, searchParams, limit, offset);
    const rows = await fetchRows(config.baseUrl, full, REQUEST_TIMEOUT_MS, searchParams.fresh ? 0 : SEARCH_CACHE_TTL_MS);
    return rows.map((row) => mapRowToProcess(row, config));
  }

  function normalizeSearchParams(params = {}) {
    const limit = Math.min(Math.max(Math.floor(Number(params.limit) || DEFAULT_LIMIT), 1), MAX_LIMIT);
    const offset = Math.max(Math.floor(Number(params.offset) || 0), 0);
    return { limit, offset };
  }

  function resolveDatasetKeys(dataset) {
    if (dataset === 'secop-ii') return ['secop-ii'];
    if (dataset === 'secop-i') return ['secop-i'];
    if (dataset === 'contratos') return ['contratos'];
    return ['secop-ii', 'contratos', 'secop-i'];
  }

  async function searchProcesses(params = {}) {
    try {
      const { limit, offset } = normalizeSearchParams(params);
      const datasetKeys = resolveDatasetKeys(params.dataset);
      let items = [];
      if (datasetKeys.length === 1) {
        const rows = await searchDataset(datasetKeys[0], params, limit, offset);
        const truncated = rows.length > limit;
        items = rows.slice(0, limit);
        return {
          success: true,
          data: { items, truncated },
          message: items.length === 0 ? emptyResultMessage() : 'ok',
        };
      }
      // Without a dataset selection, divide the limit among all three sources and preserve source order.
      const perSource = Math.max(1, Math.ceil(limit / datasetKeys.length));
      for (const key of datasetKeys) {
        const rows = await searchDataset(key, params, perSource, offset);
        items.push(...rows.slice(0, perSource));
        if (items.length >= limit) break;
      }
      items = items.slice(0, limit);
      return {
        success: true,
        data: { items, truncated: items.length >= limit },
        message: items.length === 0 ? emptyResultMessage() : 'ok',
      };
    } catch (error) {
      if (error?.timedOut) return {
        success: false,
        error: 'secop_source_timeout',
        message: locale() === 'en' ? 'SECOP took too long to respond. Retry the search.' : 'SECOP tardó demasiado en responder. Vuelve a intentar la búsqueda.',
      };
      return { success: false, message: error?.message || networkErrorMessage() };
    }
  }

  const pendingCategories = new Map();
  async function getFilterOptions(dataset, category) {
    const key = `${dataset}:${category}`;
    const cached = categoryCache[key];
    if (Array.isArray(cached?.data) && Date.now() - cached.savedAt < CATEGORY_CACHE_TTL_MS) return { success: true, data: cached.data, message: 'ok' };
    if (pendingCategories.has(key)) return pendingCategories.get(key);
    const request = (async () => { try {
      const config = DATASETS[dataset];
      const field = config[`${category}Fields`][0];
      const params = { $select: field, $group: field, $order: field, $where: `${field} is not null`, $limit: 1000 };
      let rows;
      try { rows = await fetchRows(config.baseUrl, params, 60_000, SEARCH_CACHE_TTL_MS); }
      catch (error) {
        if (!error.transient) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
        rows = await fetchRows(config.baseUrl, params, 60_000, SEARCH_CACHE_TTL_MS);
      }
      const options = [...new Set(rows.map(row => row[field]).filter(value => typeof value === 'string' && value.trim()))];
      options.sort((a, b) => a.localeCompare(b, 'es'));
      if (options.length && categoryCacheFile) { categoryCache[key] = { savedAt: Date.now(), data: options }; persistCategoryCache(); }
      return { success: true, data: options, message: 'ok' };
    } catch (error) {
      const message = error?.status ? (locale() === 'en' ? `The data source returned HTTP ${error.status}. Retry the request.` : `La fuente de datos respondió HTTP ${error.status}. Reintenta la consulta.`) : error?.message || networkErrorMessage();
      return { success: false, message };
    } })();
    pendingCategories.set(key, request);
    try { return await request; } finally { pendingCategories.delete(key); }
  }

  async function findRelatedProcesses(process) {
    if(process?.source !== 'secop-ii' || (!String(process?.reference||'').trim() && !String(process?.portfolioId||'').trim()) || !String(process?.entity||'').trim())
      return { success:false, message:locale()==='en'?'An entity and a SECOP II reference or portfolio are needed.':'Se necesitan la entidad y la referencia o portafolio del proceso SECOP II.' };
    try {
      const config=DATASETS['secop-ii'];
      const entity=escapeSoqlLiteral(String(process.entity).trim()), matches=[];
      if(process.reference?.trim()) matches.push(`referencia_del_proceso = '${escapeSoqlLiteral(process.reference.trim())}'`);
      if(process.portfolioId?.trim()) matches.push(`id_del_portafolio = '${escapeSoqlLiteral(process.portfolioId.trim())}'`);
      // A new phase can appear after the previous manual search.
      const rows=await fetchRows(config.baseUrl,{$where:`(${matches.join(' OR ')}) AND entidad = '${entity}'`,$order:'fecha_de_ultima_publicaci DESC',$limit:51},REQUEST_TIMEOUT_MS,0);
      const candidates=rows.slice(0,50).map(row=>mapRowToProcess(row,config)).filter(item=>item.id&&item.id!==process.id);
      const items=[...new Map(candidates.map(item=>[item.id,item])).values()];
      return {success:true,data:{items,truncated:rows.length>50},message:'ok'};
    } catch(error){return {success:false,message:error?.message||networkErrorMessage()};}
  }

  async function searchProcurementPlans(input = {}) {
    try {
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(input.limit) || DEFAULT_LIMIT));
      const offset = Math.max(0, Number(input.offset) || 0);
      const where = [];
      if (input.keyword?.trim()) where.push(`upper(descripcion) like '%${escapeSoqlLiteral(input.keyword.trim().toUpperCase())}%'`);
      if (input.entity?.trim()) where.push(`upper(nombre_entidad) like '%${escapeSoqlLiteral(input.entity.trim().toUpperCase())}%'`);
      if (Number.isInteger(input.year)) where.push(`annio = ${input.year}`);
      const rows = await fetchRows('https://www.datos.gov.co/resource/9sue-ezhx.json', { $where: where.join(' AND '), $order: ':id DESC', $limit: limit + 1, $offset: offset }, REQUEST_TIMEOUT_MS, SEARCH_CACHE_TTL_MS);
      const items = rows.slice(0,limit).map(row => ({ id: firstText(row,['id']), planId: firstText(row,['id_plan_anual_de_adquisiciones']), description: firstText(row,['descripcion']), entity: firstText(row,['nombre_entidad']), year: firstNumberOrNull(row,['annio']), startDate: firstText(row,['fecha_esperada_de_inicio']), offerDate: firstText(row,['fecha_esperada_de_recepcion']), value: firstNumberOrNull(row,['valor_total_esperado']), classifications: firstText(row,['categorias_unspsc']), modality: firstText(row,['modalidad']), version: firstText(row,['version_del_paa']), versionDate: firstText(row,['fecha_version']) }));
      return { success:true, data:{ items, hasMore: rows.length > limit }, message:'ok' };
    } catch (error) { return { success:false, message:error?.message || networkErrorMessage() }; }
  }
  function contractHistoryWhere(input = {}) {
    const where = ['fecha_de_firma is not null'];
    if (input.entity?.trim()) where.push(`upper(nombre_entidad) like '%${escapeSoqlLiteral(input.entity.trim().toUpperCase())}%'`);
    if (input.supplier?.trim()) where.push(`upper(proveedor_adjudicado) like '%${escapeSoqlLiteral(input.supplier.trim().toUpperCase())}%'`);
    if (input.keyword?.trim()) where.push(`upper(descripcion_del_proceso) like '%${escapeSoqlLiteral(input.keyword.trim().toUpperCase())}%'`);
    return where.join(' AND ');
  }
  async function searchContractHistory(input = {}) {
    try {
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(input.limit) || DEFAULT_LIMIT));
      const offset = Math.max(0, Number(input.offset) || 0);
      if (input.source === 'tvec') {
        const where=[];
        if(input.entity?.trim())where.push(`upper(entidad) like '%${escapeSoqlLiteral(input.entity.trim().toUpperCase())}%'`);
        if(input.supplier?.trim())where.push(`upper(proveedor) like '%${escapeSoqlLiteral(input.supplier.trim().toUpperCase())}%'`);
        if(input.keyword?.trim())where.push(`upper(items) like '%${escapeSoqlLiteral(input.keyword.trim().toUpperCase())}%'`);
        const rows=await fetchRows('https://www.datos.gov.co/resource/rgxm-mmea.json',{$where:where.join(' AND '),$order:'fecha DESC, identificador_de_la_orden, :id',$limit:limit+1,$offset:offset},REQUEST_TIMEOUT_MS,SEARCH_CACHE_TTL_MS);
        const items=rows.slice(0,limit).map(row=>({id:firstText(row,['identificador_de_la_orden']),entity:firstText(row,['entidad']),supplier:firstText(row,['proveedor']),supplierId:firstText(row,['nit_proveedor']),description:firstText(row,['items']),date:firstText(row,['fecha']),value:firstNumberOrNull(row,['total']),status:firstText(row,['estado'])}));
        return {success:true,data:{items,hasMore:rows.length>limit},message:'ok'};
      }
      const rows = await fetchRows(SECOP_II_CONTRATOS_URL, { $where: contractHistoryWhere(input), $order:'fecha_de_firma DESC, id_contrato, :id', $limit:limit + 1, $offset:offset }, REQUEST_TIMEOUT_MS, SEARCH_CACHE_TTL_MS);
      const items = rows.slice(0,limit).map(row => ({ id:firstText(row,['id_contrato']), entity:firstText(row,['nombre_entidad']), supplier:firstText(row,['proveedor_adjudicado']), supplierId:firstText(row,['documento_proveedor']), description:firstText(row,['descripcion_del_proceso','objeto_del_contrato']), date:firstText(row,['fecha_de_firma']), value:firstNumberOrNull(row,['valor_del_contrato']) }));
      return { success:true, data:{ items, hasMore: rows.length > limit }, message:'ok' };
    } catch (error) { return { success:false, message:error?.message || networkErrorMessage() }; }
  }

  async function getContractAggregates(input = {}) {
    try {
      const params = {
        $where:contractHistoryWhere(input),
        $select:'count(*) as registros,count(distinct id_contrato) as contratos,count(valor_del_contrato) as con_valor,min(fecha_de_firma) as desde,max(fecha_de_firma) as hasta,min(valor_del_contrato) as minimo,max(valor_del_contrato) as maximo,avg(valor_del_contrato) as promedio',
      };
      const rows = await fetchRows(SECOP_II_CONTRATOS_URL, params, 60000, 0);
      if (rows.length !== 1) throw Error(locale()==='en'?'The data source returned an invalid summary.':'La fuente devolvió un resumen no válido.');
      const row=rows[0],records=firstNumberOrNull(row,['registros']),contracts=firstNumberOrNull(row,['contratos']),values=firstNumberOrNull(row,['con_valor']);
      if ([records,contracts,values].some(value=>value===null||!Number.isSafeInteger(value)||value<0)) throw Error(locale()==='en'?'The data source returned invalid counts.':'La fuente devolvió conteos no válidos.');
      if (contracts > records || values > records) throw Error(locale()==='en'?'The data source returned inconsistent counts.':'La fuente devolvió conteos inconsistentes.');
      const sourceUrl = new URL(SECOP_II_CONTRATOS_URL);for(const [key,value] of Object.entries(params))sourceUrl.searchParams.set(key,value);
      return {success:true,data:{records,contracts,values,from:firstText(row,['desde']),to:firstText(row,['hasta']),minimum:values?firstNumberOrNull(row,['minimo']):null,maximum:values?firstNumberOrNull(row,['maximo']):null,average:values?firstNumberOrNull(row,['promedio']):null,checkedAt:new Date().toISOString(),sourceUrl:sourceUrl.toString()},message:'ok'};
    } catch(error) {return {success:false,message:error?.message||networkErrorMessage()};}
  }

  async function getProcurementPlanHeader(planId) {
    const id = String(planId || '').trim();
    if (!id) return { success:false, message:locale()==='en'?'The plan identifier is missing.':'Falta el identificador del plan.' };
    try {
      const rows = await fetchRows('https://www.datos.gov.co/resource/b6m4-qgqv.json', {
        $where:`id_plan_anual_de_adquisiciones='${escapeSoqlLiteral(id)}'`,
        $select:'id_plan_anual_de_adquisiciones,identificador_unico,nombre_entidad,anno,version,fecha_de_ultima_modificacion,estado',
        $order:'fecha_de_ultima_modificacion DESC', $limit:2,
      }, REQUEST_TIMEOUT_MS, 0);
      if (rows.length !== 1 || !firstText(rows[0],['version'])) return {success:false,message:locale()==='en'?'The published plan version could not be identified uniquely.':'No se pudo identificar una versión única del plan publicado.'};
      const row=rows[0];
      return {success:true,data:{planId:id,entity:firstText(row,['nombre_entidad']),year:firstNumberOrNull(row,['anno']),version:firstText(row,['version']),modifiedAt:firstText(row,['fecha_de_ultima_modificacion']),status:firstText(row,['estado']),headerId:firstText(row,['identificador_unico'])},message:'ok'};
    } catch(error) {return {success:false,message:error?.message||networkErrorMessage()};}
  }

  async function getProcessDetail(id, source, options = {}) {
    try {
      const recordId = String(id || '').trim();
      if (!recordId) {
        return {
          success: false,
          data: null,
          message: pickLocaleMessage(
            locale(),
            '过程 ID 不能为空',
            'El ID del proceso no puede estar vacío',
            'Process ID cannot be empty',
          ),
        };
      }
      const datasetKeys = source === 'secop-i' ? ['secop-i'] : source === 'secop-ii' ? (/^CO1\.PCCNTR\.\d+$/.test(recordId) ? ['contratos'] : ['secop-ii', 'contratos']) : ['secop-ii', 'contratos', 'secop-i'];
      for (const key of datasetKeys) {
        const config = DATASETS[key];
        const rows = await fetchRows(config.baseUrl, {
          $where: `${config.idField}='${escapeSoqlLiteral(recordId)}'`,
          $limit: 1,
        }, REQUEST_TIMEOUT_MS, options.fresh ? 0 : RESPONSE_CACHE_TTL_MS);
        if (rows.length > 0) {
          return { success: true, data: mapRowToProcess(rows[0], config), message: 'ok' };
        }
      }
      return { success: false, data: null, message: emptyResultMessage() };
    } catch (error) {
      return { success: false, data: null, message: error?.message || networkErrorMessage() };
    }
  }

  async function getProcessDocuments(portfolioId, options = {}) {
    const id = String(portfolioId || '').trim();
    if (!/^CO1\.BDOS\.\d+$/.test(id)) return { success: false, message: 'Identificador SECOP II de portafolio no disponible' };
    const ids = Array.isArray(options.ids) ? [...new Set(options.ids.map(String))] : null;
    if (ids && (!ids.length || ids.length > 20 || ids.some(value => !/^\d+$/.test(value)))) return { success: false, message: 'Identificadores de documentos no válidos' };
    const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
    const catalog = options.catalog === true && !ids;
    if (offset > 5000) return { success: false, message: 'Se alcanzó el límite de consulta; verifica el expediente completo en SECOP.' };
    try {
      const where = `proceso='${id}'${ids ? ` AND id_documento IN (${ids.join(',')})` : ''}`;
      const settled = await Promise.allSettled(SECOP_II_DOCUMENTS_URLS.map(url => fetchRows(url, { $where: where, $limit: ids ? ids.length : catalog ? 5101 : offset + 101, $order: 'fecha_carga DESC, id_documento DESC' }, REQUEST_TIMEOUT_MS, options.fresh ? 0 : RESPONSE_CACHE_TTL_MS)));
      const available = settled.filter(result => result.status === 'fulfilled');
      if (!available.length) throw new Error(networkErrorMessage());
      const rows = available.flatMap(result => result.value);
      const unique = [...new Map(rows.map(row => [firstText(row, ['id_documento']), row])).values()]
        .sort((a, b) => firstText(b, ['fecha_carga']).localeCompare(firstText(a, ['fecha_carga'])) || firstText(b, ['id_documento']).localeCompare(firstText(a, ['id_documento']), undefined, { numeric: true }));
      const page = ids || catalog ? unique : unique.slice(offset, offset + 100);
      const items = page.map(row => ({
        id: firstText(row, ['id_documento']),
        name: firstText(row, ['nombre_archivo']) || 'Documento',
        extension: firstText(row, ['extensi_n']).toLowerCase(),
        size: firstNumberOrNull(row, ['tamanno_archivo']),
        date: firstText(row, ['fecha_carga']) || undefined,
        description: firstText(row, ['descripci_n']) || undefined,
        url: firstText(row, ['url_descarga_documento']) || undefined,
      })).filter(item => /^\d+$/.test(item.id));
      return { success: true, data: { items, truncated: !ids && unique.length > offset + 100, partial: available.length !== settled.length }, message: 'ok' };
    } catch (error) { return { success: false, message: error?.message || networkErrorMessage() }; }
  }

  return { searchProcesses, findRelatedProcesses, searchProcurementPlans, getProcurementPlanHeader, searchContractHistory, getContractAggregates, getFilterOptions, getSearchPreferences, saveSearchPreferences, getProcessDetail, getProcessDocuments, clearSecopCache: () => responseCache.clear() };
}

module.exports = {
  createSecopService,
};
