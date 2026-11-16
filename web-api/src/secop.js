import {uploadSecopStream} from './secop-stream.js';
import {cleanupDesktopUploads,uploadLeaseMs} from './desktop-file-cleanup.js';
import secop from '../../client/electron/services/secopService.cjs';

const sources = ['secop-ii', 'secop-i', 'contratos'];
function sameOrigin(request, env) { return request.headers.get('origin') === new URL(env.BETTER_AUTH_URL).origin; }
async function body(request) { try { return await request.json(); } catch { return null; } }
const maxFileBytes = 50 * 1024 * 1024;
const fileTypes = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel' };
function service(language) { return secop.createSecopService({ configStore: { load: () => ({ ui_language: language === 'en' ? 'en' : 'es' }) } }); }
async function projectProcess(env, ownerId, projectId) {
  const row = await env.DB.prepare('SELECT process_json FROM project_secop WHERE project_id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  return row ? JSON.parse(row.process_json) : null;
}
async function existingFile(env, projectId, documentId) {
  return env.DB.prepare('SELECT f.id, f.name, f.content_type AS contentType, f.size, f.created_at AS createdAt FROM project_secop_files s JOIN project_files f ON f.id = s.file_id WHERE s.project_id = ? AND s.document_id = ?').bind(projectId, documentId).first();
}
async function hasOnlineRunner(env, ownerId) {
  const row = await env.DB.prepare("SELECT 1 AS ok FROM runners WHERE owner_id = ? AND revoked_at IS NULL AND execution_mode = 'local' AND last_seen_at >= ? LIMIT 1").bind(ownerId, Date.now() - 120_000).first();
  return !!row;
}
async function enqueueSecopRunnerJob(env, ownerId, projectId, portfolioId, doc, includeMeta = false) {
  const documentId = doc.id;
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE jobs SET state='interrupted',updated_at=? WHERE owner_id=? AND project_id=? AND kind='secop.import-zip' AND state='running' AND lease_expires_at<=?").bind(now, ownerId, projectId, Date.now()).run();
  if (await env.DB.prepare('SELECT 1 AS present FROM secop_zip_files WHERE project_id=? AND document_id=? LIMIT 1').bind(projectId, documentId).first()) return { imported: true };
  if (await existingFile(env, projectId, documentId)) return { imported: true };
  const id = crypto.randomUUID();
  const payload = JSON.stringify(includeMeta ? { documentId, portfolioId, name: doc.name, extension: doc.extension } : { documentId, portfolioId });
  const inserted = await env.DB.prepare("INSERT INTO jobs(id,project_id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at) SELECT ?,?,?,'secop.import-zip',?,?,'queued',?,? WHERE EXISTS (SELECT 1 FROM project_secop WHERE project_id=? AND owner_id=? AND source='secop-ii' AND json_extract(process_json,'$.portfolioId')=?) AND NOT EXISTS (SELECT 1 FROM project_secop_files WHERE project_id=? AND document_id=?) AND NOT EXISTS (SELECT 1 FROM secop_zip_files WHERE project_id=? AND document_id=?) AND NOT EXISTS (SELECT 1 FROM jobs WHERE owner_id=? AND project_id=? AND kind='secop.import-zip' AND json_extract(payload_json,'$.documentId')=? AND state IN ('queued','running')) RETURNING id,state").bind(id, projectId, ownerId, `secop-zip:${id}`, payload, now, now, projectId, ownerId, portfolioId, projectId, documentId, projectId, documentId, ownerId, projectId, documentId).first();
  if (inserted) return { job: inserted, status: 201 };
  const existingJob = await env.DB.prepare("SELECT id,state FROM jobs WHERE owner_id=? AND project_id=? AND kind='secop.import-zip' AND json_extract(payload_json,'$.documentId')=? AND state IN ('queued','running') ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(ownerId, projectId, documentId).first();
  if (existingJob) return { job: existingJob, status: 200 };
  if (await env.DB.prepare('SELECT 1 AS present FROM secop_zip_files WHERE project_id=? AND document_id=? LIMIT 1').bind(projectId, documentId).first()) return { imported: true };
  return { conflict: true };
}
export async function secopDocuments(request, env, ownerId, projectId, documentId) {
  const process = await projectProcess(env, ownerId, projectId);
  if (!process) return Response.json({ error: 'not_found' }, { status: 404 });
  if (process.source !== 'secop-ii' || !/^CO1\.BDOS\.\d+$/.test(process.portfolioId || '')) return Response.json({ error: 'portfolio_unavailable' }, { status: 400 });
  const api = service(new URL(request.url).searchParams.get('language'));
  if (!documentId && request.method === 'GET') {
    const rawOffset=new URL(request.url).searchParams.get('offset') || '0';
    if (!/^\d+$/.test(rawOffset) || Number(rawOffset)>5000) return Response.json({error:'invalid_offset'},{status:400});
    const listing = await api.getProcessDocuments(process.portfolioId,{offset:Number(rawOffset)});
    if (!listing.success) return Response.json({ error: 'secop_unavailable' }, { status: 502 });
    const saved = await env.DB.prepare('SELECT document_id AS id FROM project_secop_files WHERE project_id = ? UNION SELECT document_id AS id FROM secop_zip_files WHERE project_id = ?').bind(projectId,projectId).all();
    const jobs = await env.DB.prepare("SELECT id,state,result_json,json_extract(payload_json,'$.documentId') AS document_id FROM jobs WHERE project_id=? AND owner_id=? AND kind='secop.import-zip' ORDER BY created_at DESC,rowid DESC").bind(projectId,ownerId).all();
    const latest=new Map();for(const job of jobs.results)if(!latest.has(job.document_id))latest.set(job.document_id,{id:job.id,state:job.state,result:job.result_json?JSON.parse(job.result_json):null});
    const imported = new Set(saved.results.map(item => item.id));
    return Response.json({ ...listing.data, items: listing.data.items.map(({ url: _url, ...item }) => ({ ...item, imported: imported.has(item.id),...(latest.has(item.id)?{zipJob:latest.get(item.id)}:{}) })) });
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
    if (doc.size > maxFileBytes) return Response.json({error:'file_too_large'},{status:413});
    const queued = await enqueueSecopRunnerJob(env, ownerId, projectId, process.portfolioId, doc, false);
    if (queued.imported) return Response.json({ imported: true });
    if (queued.job) return Response.json({ job: queued.job }, { status: queued.status });
    return Response.json({ error: 'project_conflict' }, { status: 409 });
  }
  if (!fileTypes[doc.extension]) return Response.json({ error: 'unsupported_document' }, { status: 400 });
  if (doc.size > maxFileBytes) return Response.json({ error: 'file_too_large' }, { status: 413 });
  const url = new URL('https://community.secop.gov.co/Public/Archive/RetrieveFile/Index');
  url.searchParams.set('DocumentId', documentId); url.searchParams.set('InCommunity', 'False'); url.searchParams.set('InPaymentGateway', 'False'); url.searchParams.set('DocUniqueIdentifier', '');
  const fallbackToRunner = async () => {
    if (!await hasOnlineRunner(env, ownerId)) return Response.json({ error: 'secop_captcha_required', officialUrl: url.toString() }, { status: 502 });
    const queued = await enqueueSecopRunnerJob(env, ownerId, projectId, process.portfolioId, doc, true);
    if (queued.imported) return Response.json({ imported: true });
    if (queued.job) return Response.json({ job: queued.job, fallback: 'runner' }, { status: queued.status });
    return Response.json({ error: 'project_conflict' }, { status: 409 });
  };
  let response;
  try { response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(60_000) }); } catch { return fallbackToRunner(); }
  if (!response.ok || response.status >= 300 || !response.body || /text\/html/i.test(response.headers.get('content-type') || '')) return fallbackToRunner();
  if (Number(response.headers.get('content-length')) > maxFileBytes) return Response.json({ error: 'file_too_large' }, { status: 413 });
  const name = (doc.name || `documento.${doc.extension}`).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 240) || `documento.${doc.extension}`;
  const file = { id: crypto.randomUUID(), name, contentType: fileTypes[doc.extension], size: 0, createdAt: new Date().toISOString() },key=`projects/${projectId}/${file.id}`,staging=crypto.randomUUID(),now=Date.now();
  await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(staging,ownerId,key,now+uploadLeaseMs,now).run();let published=false;
  try {
    try{file.size=(await uploadSecopStream({body:response.body,bucket:env.FILES,key,extension:doc.extension,maxBytes:maxFileBytes})).size;}
    catch(error){if(error?.code==='file_too_large')return Response.json({error:'file_too_large'},{status:413});if(error?.code==='invalid_file')return Response.json({error:'invalid_file'},{status:400});return Response.json({error:'download_failed'},{status:502});}
    await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(staging,ownerId).run();
    try {const results=await env.DB.batch([
      env.DB.prepare("INSERT INTO project_files (id,project_id,name,content_type,object_key,size,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND owner_id=?) AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?)").bind(file.id,projectId,name,file.contentType,key,file.size,file.createdAt,projectId,ownerId,staging,ownerId,Date.now()),
      env.DB.prepare('INSERT INTO project_secop_files (project_id,document_id,file_id) SELECT ?,?,id FROM project_files WHERE id=? AND project_id=?').bind(projectId,documentId,file.id,projectId),
      env.DB.prepare("DELETE FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND EXISTS (SELECT 1 FROM project_files WHERE id=? AND project_id=? AND object_key=?)").bind(staging,ownerId,file.id,projectId,key),
    ]);if(!results[0].meta.changes)return Response.json({error:'project_conflict'},{status:409});published=true;return Response.json({file},{status:201});
    }catch(error){const saved=await existingFile(env,projectId,documentId);if(saved)return Response.json({file:saved});throw error;}
  } finally {if(!published){try{await env.DB.prepare("UPDATE desktop_file_staging SET writer_done=1,state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(staging,ownerId).run();await cleanupDesktopUploads(env,ownerId);}catch{/* La limpieza se reintenta después. */}}}

}
const categoryNames = ['department', 'modality', 'status'];
const columnNames = ['title', 'entity', 'modality', 'status', 'value', 'publicationDate', 'deadline', 'department'];
async function cached(env, key, ttl, load, fresh = false) {
  const now = Date.now();
  if (!fresh) {
    const row = await env.DB.prepare('SELECT response_json FROM secop_search_cache WHERE cache_key=? AND expires_at>?').bind(key, now).first();
    if (row) return JSON.parse(row.response_json);
  }
  const result = await load();
  if (result.success) {
    await env.DB.prepare('DELETE FROM secop_search_cache WHERE expires_at<=?').bind(now).run();
    await env.DB.prepare('INSERT INTO secop_search_cache(cache_key,response_json,expires_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET response_json=excluded.response_json,expires_at=excluded.expires_at').bind(key, JSON.stringify(result), now + ttl).run();
  }
  return result;
}
export async function secopPreferences(request, env, ownerId) {
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT preferences_json FROM secop_search_preferences WHERE owner_id=?').bind(ownerId).first();
    return Response.json(row ? JSON.parse(row.preferences_json) : {dataset:'secop-ii',department:[],modality:[],status:[]});
  }
  if (request.method !== 'PUT') return new Response('Method not allowed', {status:405});
  if (!sameOrigin(request, env)) return Response.json({error:'invalid_origin'}, {status:403});
  const input = await body(request);
  if (!input || !sources.includes(input.dataset) || categoryNames.some(key => !Array.isArray(input[key]) || input[key].length > 100 || input[key].some(x => typeof x !== 'string' || x.length > 300))) return Response.json({error:'invalid_preferences'}, {status:400});
  const preferences = Object.fromEntries(['dataset', ...categoryNames].map(key => [key,input[key]]));
  await env.DB.prepare('INSERT INTO secop_search_preferences(owner_id,preferences_json) VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET preferences_json=excluded.preferences_json').bind(ownerId,JSON.stringify(preferences)).run();
  return Response.json(preferences);
}
export async function secopCategories(request, env) {
  if (request.method !== 'GET') return new Response('Method not allowed',{status:405});
  const url = new URL(request.url), dataset = url.searchParams.get('dataset'), category = url.searchParams.get('category');
  if (!sources.includes(dataset) || !categoryNames.includes(category)) return Response.json({error:'invalid_category'},{status:400});
  const result = await cached(env, `category:${dataset}:${category}`, 7*24*60*60*1000, () => service('es').getFilterOptions(dataset,category));
  return Response.json(result,{status:result.success?200:502});
}
export async function searchSecop(request, env, ownerId) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!sameOrigin(request, env)) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  const input = await body(request);
  const badCategory = key => input[key] !== undefined && !(typeof input[key] === 'string' && input[key].length <= 300) && !(Array.isArray(input[key]) && input[key].length <= 100 && input[key].every(x => typeof x === 'string' && x.length <= 300));
  if (!input || !sources.includes(input.dataset) || categoryNames.some(badCategory) || ['keyword','fromDate'].some(key => input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > 300)) || (input.fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.fromDate)) || ['minValue','maxValue'].some(key => input[key] !== undefined && (!Number.isFinite(input[key]) || input[key] < 0)) || !Number.isInteger(input.offset ?? 0) || (input.offset ?? 0) < 0 || (input.offset ?? 0) > 100000 || (input.sortBy && !columnNames.includes(input.sortBy)) || (input.sortDirection && !['asc','desc'].includes(input.sortDirection)) || (input.columnFilters && (typeof input.columnFilters !== 'object' || Array.isArray(input.columnFilters) || Object.entries(input.columnFilters).some(([k,v]) => !columnNames.includes(k) || typeof v !== 'string' || v.length > 300)))) return Response.json({ error: 'invalid_search' }, { status: 400 });
  const params = { dataset: input.dataset, limit: 20, offset: input.offset ?? 0 };
  for (const key of ['keyword', ...categoryNames, 'fromDate', 'minValue', 'maxValue', 'sortBy', 'sortDirection', 'columnFilters']) if (input[key] !== undefined) params[key] = input[key];
  const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([ownerId,params])));
  const key = 'search:' + Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('');
  const result = await cached(env,key,60*60*1000,() => service(input.language).searchProcesses(params),input.fresh === true);
  return Response.json(result, { status: result.success ? 200 : 502 });
}
export async function secopDetail(request, env) {
  if (request.method !== 'GET') return new Response('Method not allowed',{status:405});
  const url = new URL(request.url), id = url.searchParams.get('id') || '', source = url.searchParams.get('source');
  if (!['secop-i','secop-ii'].includes(source) || !id.trim() || id.length > 200) return Response.json({error:'invalid_process'},{status:400});
  const key = `detail:${source}:${id}`;
  const result = await cached(env,key,5*60*1000,()=>service(url.searchParams.get('language')).getProcessDetail(id,source));
  return Response.json(result,{status:result.success?200:502});
}
export async function secopDocumentCatalog(request, env) {
  if (request.method !== 'GET') return new Response('Method not allowed',{status:405});
  const url = new URL(request.url), portfolioId = url.searchParams.get('portfolioId') || '', rawOffset = url.searchParams.get('offset') || '0';
  if (!/^CO1\.BDOS\.\d+$/.test(portfolioId) || !/^\d+$/.test(rawOffset) || Number(rawOffset)>5000) return Response.json({error:'invalid_portfolio'},{status:400});
  const offset=Number(rawOffset);
  const result=await cached(env,`documents:${portfolioId}:${offset}`,5*60*1000,()=>service(url.searchParams.get('language')).getProcessDocuments(portfolioId,{offset}));
  if (!result.success) return Response.json(result,{status:502});
  return Response.json({...result,data:{...result.data,items:result.data.items.map(({url: _url,...item})=>item)}});
}
export async function createSecopProject(request, env, ownerId) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!sameOrigin(request, env)) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  const input = await body(request);
  const process = input?.process;
  if (!process || !['secop-i', 'secop-ii'].includes(process.source) || typeof process.id !== 'string' || !process.id.trim() || process.id.length > 200 || typeof process.title !== 'string' || !process.title.trim() || process.title.length > 5000 || JSON.stringify(process).length > 20_000) return Response.json({ error: 'invalid_process' }, { status: 400 });
  const ids = input.documentIds ?? [];
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || !/^\d+$/.test(id)) || new Set(ids).size !== ids.length || (ids.length && (process.source !== 'secop-ii' || !/^CO1\.BDOS\.\d+$/.test(process.portfolioId || '')))) return Response.json({error:'invalid_documents'},{status:400});
  const project = { id: crypto.randomUUID(), title: process.title.trim().slice(0, 300), createdAt: new Date().toISOString() };
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO projects (id, owner_id, title, created_at) VALUES (?, ?, ?, ?)').bind(project.id, ownerId, project.title, project.createdAt),
      env.DB.prepare('INSERT INTO project_secop (project_id, owner_id, source, external_id, process_json) VALUES (?, ?, ?, ?, ?)').bind(project.id, ownerId, process.source, process.id, JSON.stringify(process)),
      ...ids.map((id,index)=>env.DB.prepare('INSERT INTO secop_import_selection(project_id,document_id,sort_order,updated_at) VALUES(?,?,?,?)').bind(project.id,id,index,project.createdAt)),
    ]);
  } catch (error) {
    const existing = await env.DB.prepare('SELECT project_id AS projectId FROM project_secop WHERE owner_id = ? AND source = ? AND external_id = ?').bind(ownerId, process.source, process.id).first();
    if (existing) return Response.json({ error: 'already_saved', projectId: existing.projectId }, { status: 409 });
    throw error;
  }
  return Response.json({ project }, { status: 201 });
}
export async function secopSelectedImports(request,env,ownerId,projectId,documentId) {
  const owned=await env.DB.prepare('SELECT 1 FROM project_secop WHERE project_id=? AND owner_id=?').bind(projectId,ownerId).first();
  if (!owned) return Response.json({error:'not_found'},{status:404});
  if (!documentId && request.method==='GET') {
    const rows=await env.DB.prepare("SELECT s.document_id AS id,s.state, (SELECT j.state FROM jobs j WHERE j.project_id=s.project_id AND j.owner_id=? AND j.kind='secop.import-zip' AND json_extract(j.payload_json,'$.documentId')=s.document_id ORDER BY j.created_at DESC,j.rowid DESC LIMIT 1) AS job_state, EXISTS(SELECT 1 FROM secop_zip_files f WHERE f.project_id=s.project_id AND f.document_id=s.document_id) AS imported_zip FROM secop_import_selection s WHERE s.project_id=? ORDER BY s.sort_order").bind(ownerId,projectId).all();
    return Response.json({items:rows.results.map(row=>({id:row.id,state:row.state!=='queued'?row.state:row.imported_zip || row.job_state==='succeeded'?'imported':['queued','running'].includes(row.job_state)?'queued':'failed'}))});
  }
  if (!documentId || request.method!=='POST') return new Response('Method not allowed',{status:405});
  if (!sameOrigin(request,env)) return Response.json({error:'invalid_origin'},{status:403});
  const row=await env.DB.prepare('SELECT state FROM secop_import_selection WHERE project_id=? AND document_id=?').bind(projectId,documentId).first();
  if (!row) return Response.json({error:'not_found'},{status:404});
  if (row.state==='imported') return Response.json({state:'imported'});
  if (row.state==='queued') {
    const job=await env.DB.prepare("SELECT state FROM jobs WHERE project_id=? AND owner_id=? AND kind='secop.import-zip' AND json_extract(payload_json,'$.documentId')=? ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(projectId,ownerId,documentId).first();
    const imported=await env.DB.prepare('SELECT 1 FROM secop_zip_files WHERE project_id=? AND document_id=?').bind(projectId,documentId).first();
    if (imported || job?.state==='succeeded') return Response.json({state:'imported'});
    if (['queued','running'].includes(job?.state)) return Response.json({state:'queued'});
    await env.DB.prepare("UPDATE secop_import_selection SET state='pending' WHERE project_id=? AND document_id=? AND state='queued'").bind(projectId,documentId).run();
  }
  const response=await secopDocuments(request,env,ownerId,projectId,documentId);
  const data=await response.clone().json().catch(()=>({}));
  const state=response.ok ? (data.job?'queued':'imported') : 'failed';
  await env.DB.prepare("UPDATE secop_import_selection SET state=?,updated_at=? WHERE project_id=? AND document_id=? AND state IN ('pending','failed')").bind(state,new Date().toISOString(),projectId,documentId).run();
  return response;
}
export async function getProjectSecop(request, env, ownerId, projectId) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const row = await env.DB.prepare('SELECT process_json FROM project_secop WHERE project_id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  return row ? Response.json({ process: JSON.parse(row.process_json) }) : Response.json({ error: 'not_found' }, { status: 404 });
}

export async function marketSearch(request, env, summary = false) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!sameOrigin(request, env)) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  const input = await body(request);
  if (!input || (!summary && !['paa', 'history', 'tvec'].includes(input.mode)) || ['entity', 'keyword', 'supplier'].some(key => input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > 300)) || (input.language !== undefined && !['es','en'].includes(input.language)) || (!summary && (!Number.isInteger(input.offset ?? 0) || (input.offset ?? 0) < 0 || (input.offset ?? 0) > 100000)) || (input.year !== undefined && (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100))) return Response.json({error:'invalid_search'}, {status:400});
  const params = { entity: input.entity || '', keyword: input.keyword || '', supplier: input.supplier || '', ...(input.year === undefined ? {} : {year:input.year}), offset:input.offset ?? 0, limit:20 };
  const api = service(input.language);
  const result = summary ? await api.getContractAggregates(params) : input.mode === 'paa' ? await api.searchProcurementPlans(params) : await api.searchContractHistory({...params, ...(input.mode === 'tvec' ? {source:'tvec'} : {})});
  return Response.json(result, {status:result.success ? 200 : 502});
}
