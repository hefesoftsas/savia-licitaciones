import { deduplicateSecopDocuments, secopDocumentHeaders, secopFileUrl } from './secop-document-dedup.js';
import { existingFile, fileTypes, maxFileBytes, sameOrigin, storeDownloadedDocument } from './secop-storage.js';
import secop from '../../client/electron/services/secopService.cjs';

export function secopService(language) {
  return secop.createSecopService({ configStore: { load: () => ({ ui_language: language === 'en' ? 'en' : 'es' }) } });
}

export function safeColombiaSecopUrl(value) {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'community.secop.gov.co' ? url.href : '';
  } catch {
    return '';
  }
}

export function colombiaSecopManualDownloadUrl(source, id) {
  return source === 'secop-ii' && /^\d+$/.test(id)
    ? `https://community.secop.gov.co/Public/Archive/RetrieveFile/Index?DocumentId=${encodeURIComponent(id)}&InCommunity=False&InPaymentGateway=False&DocUniqueIdentifier=`
    : null;
}

async function hasOnlineRunner(env, ownerId) {
  const row = await env.DB.prepare("SELECT 1 AS ok FROM runners WHERE owner_id = ? AND revoked_at IS NULL AND execution_mode = 'local' AND last_seen_at >= ? LIMIT 1")
    .bind(ownerId, Date.now() - 120_000).first();
  return !!row;
}

async function enqueueSecopRunnerJob(env, ownerId, projectId, portfolioId, doc, includeMeta = false) {
  const documentId = doc.id;
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE jobs SET state='interrupted',updated_at=? WHERE owner_id=? AND project_id=? AND kind='secop.import-zip' AND state='running' AND lease_expires_at<=?")
    .bind(now, ownerId, projectId, Date.now()).run();
  if (await env.DB.prepare('SELECT 1 AS present FROM secop_zip_files WHERE project_id=? AND document_id=? LIMIT 1').bind(projectId, documentId).first()) {
    return { imported: true };
  }
  if (await existingFile(env, projectId, documentId)) return { imported: true };
  const id = crypto.randomUUID();
  const payload = JSON.stringify(includeMeta ? { documentId, portfolioId, name: doc.name, extension: doc.extension } : { documentId, portfolioId });
  const inserted = await env.DB.prepare("INSERT INTO jobs(id,project_id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at) SELECT ?,?,?,'secop.import-zip',?,?,'queued',?,? WHERE EXISTS (SELECT 1 FROM project_secop WHERE project_id=? AND owner_id=? AND source='secop-ii' AND json_extract(process_json,'$.portfolioId')=?) AND NOT EXISTS (SELECT 1 FROM project_secop_files WHERE project_id=? AND document_id=?) AND NOT EXISTS (SELECT 1 FROM secop_zip_files WHERE project_id=? AND document_id=?) AND NOT EXISTS (SELECT 1 FROM jobs WHERE owner_id=? AND project_id=? AND kind='secop.import-zip' AND json_extract(payload_json,'$.documentId')=? AND state IN ('queued','running')) RETURNING id,state")
    .bind(id, projectId, ownerId, `secop-zip:${id}`, payload, now, now, projectId, ownerId, portfolioId, projectId, documentId, projectId, documentId, ownerId, projectId, documentId).first();
  if (inserted) return { job: inserted, status: 201 };
  const existingJob = await env.DB.prepare("SELECT id,state FROM jobs WHERE owner_id=? AND project_id=? AND kind='secop.import-zip' AND json_extract(payload_json,'$.documentId')=? AND state IN ('queued','running') ORDER BY created_at DESC,rowid DESC LIMIT 1")
    .bind(ownerId, projectId, documentId).first();
  if (existingJob) return { job: existingJob, status: 200 };
  if (await env.DB.prepare('SELECT 1 AS present FROM secop_zip_files WHERE project_id=? AND document_id=? LIMIT 1').bind(projectId, documentId).first()) {
    return { imported: true };
  }
  return { conflict: true };
}

async function secopDocumentPage(env, api, portfolioId, offset) {
  // Build the order once, so a slow annual feed cannot shift offsets between pages.
  const load = async () => {
    const result = await api.getProcessDocuments(portfolioId, { catalog: true });
    if (!result.success) return result;
    const items = await deduplicateSecopDocuments(result.data.items);
    return { ...result, data: { items: items.slice(0, 5100), partial: result.data.partial } };
  };
  const key = `secop-document-snapshot:v1:${portfolioId}`;
  const now = Date.now();
  const row = await env.DB.prepare('SELECT response_json FROM secop_search_cache WHERE cache_key=? AND expires_at>?').bind(key, now).first();
  let result = row ? JSON.parse(row.response_json) : await load();
  if (!row && result.success) {
    const json = JSON.stringify(result);
    if (new TextEncoder().encode(json).byteLength < 900000) {
      const saved = await env.DB.prepare(`INSERT INTO secop_search_cache(cache_key,response_json,expires_at) VALUES(?,?,?)
        ON CONFLICT(cache_key) DO UPDATE SET response_json=excluded.response_json,expires_at=excluded.expires_at WHERE expires_at<=?
        RETURNING response_json`).bind(key, json, now + 5 * 60 * 1000, now).first();
      if (!saved) {
        const concurrent = await env.DB.prepare('SELECT response_json FROM secop_search_cache WHERE cache_key=?').bind(key).first();
        if (concurrent) result = JSON.parse(concurrent.response_json);
      }
    }
  }
  if (!result.success) return result;
  return { ...result, data: { ...result.data, items: result.data.items.slice(offset, offset + 100), truncated: result.data.items.length > offset + 100 } };
}

export async function colombiaSecopDocumentCatalog(request, env) {
  const url = new URL(request.url);
  const portfolioId = url.searchParams.get('portfolioId') || '';
  const rawOffset = url.searchParams.get('offset') || '0';
  if (!/^CO1\.BDOS\.\d+$/.test(portfolioId) || !/^\d+$/.test(rawOffset) || Number(rawOffset) > 5000) {
    return Response.json({ error: 'invalid_portfolio' }, { status: 400 });
  }
  const offset = Number(rawOffset);
  const result = await secopDocumentPage(env, secopService(url.searchParams.get('language')), portfolioId, offset);
  if (!result.success) return Response.json(result, { status: 502 });
  return Response.json({ ...result, data: { ...result.data, items: result.data.items.map(({ url: _url, ...item }) => item) } });
}

export async function colombiaSecopProjectDocuments(request, env, ownerId, projectId, documentId, process) {
  if (process.source !== 'secop-ii' || !/^CO1\.BDOS\.\d+$/.test(process.portfolioId || '')) {
    return Response.json({ error: 'portfolio_unavailable' }, { status: 400 });
  }
  const api = secopService(new URL(request.url).searchParams.get('language'));
  if (!documentId && request.method === 'GET') {
    const rawOffset = new URL(request.url).searchParams.get('offset') || '0';
    if (!/^\d+$/.test(rawOffset) || Number(rawOffset) > 5000) return Response.json({ error: 'invalid_offset' }, { status: 400 });
    const listing = await secopDocumentPage(env, api, process.portfolioId, Number(rawOffset));
    if (!listing.success) return Response.json({ error: 'secop_unavailable' }, { status: 502 });
    const saved = await env.DB.prepare('SELECT document_id AS id FROM project_secop_files WHERE project_id = ? UNION SELECT document_id AS id FROM secop_zip_files WHERE project_id = ?')
      .bind(projectId, projectId).all();
    const jobs = await env.DB.prepare("SELECT id,state,result_json,json_extract(payload_json,'$.documentId') AS document_id FROM jobs WHERE project_id=? AND owner_id=? AND kind='secop.import-zip' ORDER BY created_at DESC,rowid DESC")
      .bind(projectId, ownerId).all();
    const latest = new Map();
    for (const job of jobs.results) {
      if (!latest.has(job.document_id)) latest.set(job.document_id, { id: job.id, state: job.state, result: job.result_json ? JSON.parse(job.result_json) : null });
    }
    const imported = new Set(saved.results.map(item => item.id));
    return Response.json({
      ...listing.data,
      items: listing.data.items.map(({ url: _url, ...item }) => ({
        ...item,
        imported: imported.has(item.id),
        ...(latest.has(item.id) ? { zipJob: latest.get(item.id) } : {}),
      })),
    });
  }
  if (!documentId || request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!sameOrigin(request, env)) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  if (!/^\d+$/.test(documentId)) return Response.json({ error: 'invalid_document' }, { status: 400 });
  const existing = await existingFile(env, projectId, documentId);
  if (existing) return Response.json({ file: existing });
  const listing = await api.getProcessDocuments(process.portfolioId, { ids: [documentId] });
  if (!listing.success) return Response.json({ error: 'secop_unavailable' }, { status: 502 });
  const doc = listing.data.items.find(item => item.id === documentId);
  if (!doc) return Response.json({ error: 'not_found' }, { status: 404 });
  if (doc.extension === 'zip') {
    if (doc.size > maxFileBytes) return Response.json({ error: 'file_too_large' }, { status: 413 });
    const queued = await enqueueSecopRunnerJob(env, ownerId, projectId, process.portfolioId, doc, false);
    if (queued.imported) return Response.json({ imported: true });
    if (queued.job) return Response.json({ job: queued.job }, { status: queued.status });
    return Response.json({ error: 'project_conflict' }, { status: 409 });
  }
  if (!fileTypes[doc.extension]) return Response.json({ error: 'unsupported_document' }, { status: 400 });
  if (doc.size > maxFileBytes) return Response.json({ error: 'file_too_large' }, { status: 413 });
  const url = secopFileUrl(documentId);
  const fallbackToRunner = async () => {
    if (!await hasOnlineRunner(env, ownerId)) return Response.json({ error: 'secop_captcha_required', officialUrl: url.toString() }, { status: 502 });
    const queued = await enqueueSecopRunnerJob(env, ownerId, projectId, process.portfolioId, doc, true);
    if (queued.imported) return Response.json({ imported: true });
    if (queued.job) return Response.json({ job: queued.job, fallback: 'runner' }, { status: queued.status });
    return Response.json({ error: 'project_conflict' }, { status: 409 });
  };
  let response;
  try {
    response = await fetch(url, {
      redirect: 'manual',
      headers: secopDocumentHeaders(fileTypes[doc.extension]),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return fallbackToRunner();
  }
  if (!response.ok || response.status >= 300 || !response.body || /text\/html/i.test(response.headers.get('content-type') || '')) {
    return fallbackToRunner();
  }
  if (Number(response.headers.get('content-length')) > maxFileBytes) return Response.json({ error: 'file_too_large' }, { status: 413 });
  return storeDownloadedDocument({ env, ownerId, projectId, documentId, name: doc.name, extension: doc.extension, body: response.body });
}
