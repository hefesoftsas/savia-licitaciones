import { fetchPlacspPortalDocuments, isPortalTenderId, placspDocumentHeaders } from './placsp-portal.js';
import { fetchTedNoticeById, tedPublicationNumber } from './ted-europa.js';
import placsp from '../../client/electron/services/placspService.cjs';
import { cached, existingFile, fileTypes, maxFileBytes, sameOrigin, storeDownloadedDocument } from './secop-storage.js';

export function fetchPlacspDocuments(id, { url, reference } = {}) {
  const catalanId = /^https:\/\/contractaciopublica\.cat\/[^/]+\/detall-publicacio\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\/\d+(?:[/?#]|$)/i.exec(url || '')?.[1];
  const pscpId = id.startsWith('pscp:') ? id : catalanId && 'pscp:' + catalanId;
  if (pscpId) return placsp.createPlacspService().fetchPscpProcessDocuments(pscpId, { reference });
  if (url) return fetchPlacspPortalDocuments(url);
  return Promise.resolve([]);
}

export async function resolveTedDocuments(env, id, { process = {}, row = null, fresh = false, language = 'es' } = {}) {
  const pubNum = tedPublicationNumber(id);
  if (!pubNum) return [];
  const fetchDocs = async () => {
    const notice = await fetchTedNoticeById(id, { language }).catch(() => null);
    const portalUrl = notice?.portalUrl || process.portalUrl || '';
    const reference = notice?.reference || row?.reference || process.reference || pubNum;
    let portalDocs = [];
    if (portalUrl) {
      portalDocs = await fetchPlacspDocuments(id, { url: portalUrl, reference }).catch(() => []);
    }
    const rowSaved = JSON.parse(row?.documents_json || '[]');
    // Keep previously resolved attachments when the portal is temporarily unavailable.
    if (portalUrl && !portalDocs.length) {
      const saved = await env.DB.prepare('SELECT documents_json FROM placsp_tenders WHERE url = ? AND id <> ? AND documents_json <> ? ORDER BY synced_at DESC LIMIT 1')
        .bind(portalUrl, id, '[]').first();
      portalDocs = [...JSON.parse(saved?.documents_json || '[]'), ...rowSaved.filter(doc => doc.docType !== 'TED')];
    }
    const baseDocs = notice?.documents?.length
      ? notice.documents
      : rowSaved.length
        ? rowSaved
        : Array.isArray(process.documents) && process.documents.length
          ? process.documents
          : [{
              id: `TED-${pubNum}`,
              name: `Anuncio oficial TED ${pubNum}.pdf`,
              extension: 'pdf',
              docType: 'TED',
              url: `https://ted.europa.eu/${language === 'en' ? 'en' : 'es'}/notice/${pubNum}/pdf`,
              size: null,
            }];
    const merged = [];
    const seen = new Set();
    for (const doc of [...portalDocs, ...baseDocs]) {
      if (!doc?.id || !doc?.url || seen.has(doc.id) || seen.has(doc.url)) continue;
      seen.add(doc.id);
      seen.add(doc.url);
      merged.push(doc);
    }
    return merged;
  };
  const cachedRes = await cached(env, `ted:docs:${pubNum}`, 5 * 60 * 1000, async () => {
    const docs = await fetchDocs();
    return { success: true, data: docs };
  }, fresh);
  const docs = Array.isArray(cachedRes?.data) ? cachedRes.data : [];
  if (docs.length && row) {
    await env.DB.prepare('UPDATE placsp_tenders SET documents_json = ? WHERE id = ?')
      .bind(JSON.stringify(docs), id).run();
  }
  return docs;
}

export async function resolvePlacspDocuments(env, id, row, process = {}) {
  const saved = !id.startsWith('licit:') && !isPortalTenderId(id) && Array.isArray(process.documents) && process.documents.length
    ? process.documents : JSON.parse(row?.documents_json || '[]');
  if (saved.length) return saved;
  const docs = await fetchPlacspDocuments(id, { url: row?.url || process.url, reference: row?.reference || process.reference }).catch(() => []);
  if (docs.length && row) {
    await env.DB.prepare('UPDATE placsp_tenders SET documents_json = ? WHERE id = ?')
      .bind(JSON.stringify(docs), id).run();
  }
  return docs;
}

export async function officialSpainDocuments(env, source, id, language) {
  const row = await env.DB.prepare('SELECT documents_json, reference, url FROM placsp_tenders WHERE id = ?').bind(id).first();
  return source === 'ted'
    ? resolveTedDocuments(env, id, { row, language })
    : resolvePlacspDocuments(env, id, row);
}

export async function spainDocumentCatalog(request, env) {
  const url = new URL(request.url);
  const source = url.searchParams.get('source');
  const id = url.searchParams.get('id') || '';
  if (!id.trim() || id.length > 200) return Response.json({ error: 'invalid_process' }, { status: 400 });
  const docs = await officialSpainDocuments(env, source, id, url.searchParams.get('language') === 'en' ? 'en' : 'es');
  const items = docs.map(({ url: _url, ...item }) => item);
  return Response.json({ success: true, data: { items, truncated: false, partial: false }, message: 'ok' });
}

export async function spainProjectDocuments(request, env, ownerId, projectId, documentId, process) {
  const row = await env.DB.prepare('SELECT documents_json, reference, url FROM placsp_tenders WHERE id = ?').bind(process.id).first();
  const language = new URL(request.url).searchParams.get('language') === 'en' ? 'en' : 'es';
  const docs = process.source === 'ted'
    ? await resolveTedDocuments(env, process.id, { process, row, language })
    : await resolvePlacspDocuments(env, process.id, row, process);
  if (!documentId && request.method === 'GET') {
    const saved = await env.DB.prepare('SELECT document_id AS id FROM project_secop_files WHERE project_id = ?').bind(projectId).all();
    const imported = new Set(saved.results.map(item => item.id));
    return Response.json({ items: docs.map(({ url: _url, ...item }) => ({ ...item, imported: imported.has(item.id) })), truncated: false, partial: false });
  }
  if (!documentId || request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!sameOrigin(request, env)) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(documentId)) return Response.json({ error: 'invalid_document' }, { status: 400 });
  const existing = await existingFile(env, projectId, documentId);
  if (existing) return Response.json({ file: existing });
  const doc = docs.find(item => item.id === documentId);
  if (!doc) return Response.json({ error: 'not_found' }, { status: 404 });
  const safeUrl = placsp.validatePlacspUrl(doc.url);
  if (!safeUrl) return Response.json({ error: 'invalid_document' }, { status: 400 });
  if (!fileTypes[doc.extension]) return Response.json({ error: 'unsupported_document' }, { status: 400 });
  let response;
  let isTedPdfHost = false;
  try {
    const host = new URL(safeUrl).hostname.toLowerCase();
    isTedPdfHost = host === 'ted.europa.eu';
    const isPlacspPortalHost = host === 'contrataciondelestado.es' || host.endsWith('.contrataciondelestado.es') || host === 'contrataciondelsectorpublico.gob.es' || host.endsWith('.contrataciondelsectorpublico.gob.es');
    response = await fetch(safeUrl, {
      redirect: isPlacspPortalHost ? 'manual' : 'follow',
      headers: isTedPdfHost ? { Accept: fileTypes[doc.extension] } : isPlacspPortalHost ? placspDocumentHeaders(fileTypes[doc.extension]) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return Response.json({ error: 'download_failed' }, { status: 502 });
  }
  if (
    isTedPdfHost &&
    (response.headers.get('x-amzn-waf-action') ||
      ([403, 405].includes(response.status) && /text\/html/i.test(response.headers.get('content-type') || '')))
  ) {
    return Response.json({ error: 'portal_captcha_required', officialUrl: safeUrl }, { status: 502 });
  }
  if (!response.ok || !response.body || /text\/html/i.test(response.headers.get('content-type') || '')) return Response.json({ error: 'download_failed' }, { status: 502 });
  if (Number(response.headers.get('content-length')) > maxFileBytes) return Response.json({ error: 'file_too_large' }, { status: 413 });
  return storeDownloadedDocument({ env, ownerId, projectId, documentId, name: doc.name, extension: doc.extension, body: response.body });
}

export async function spainManualDownloadUrls(env, owned) {
  const nameById = new Map();
  const urlById = new Map();
  const recordDoc = doc => {
    if (!doc?.id) return;
    if (doc.name) nameById.set(doc.id, doc.name);
    const url = placsp.validatePlacspUrl(doc.url);
    if (url) urlById.set(doc.id, url);
  };
  const processDocs = (() => { try { return JSON.parse(owned.process_json || '{}').documents; } catch { return null; } })();
  for (const doc of Array.isArray(processDocs) ? processDocs : []) recordDoc(doc);
  const tenderRow = await env.DB.prepare('SELECT documents_json FROM placsp_tenders WHERE id = ?').bind(owned.external_id).first();
  const tenderDocs = (() => { try { return JSON.parse(tenderRow?.documents_json || '[]'); } catch { return null; } })();
  for (const doc of Array.isArray(tenderDocs) ? tenderDocs : []) recordDoc(doc);
  return { nameById, urlById };
}
