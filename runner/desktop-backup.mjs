import {createManagedWorkspace} from './managed-workspaces.mjs';
import {readDesktopFeasibility} from './desktop-feasibility.mjs';
import {readDesktopBidEvaluation} from './desktop-bid-evaluation.mjs';
import {readDesktopSubmission} from './desktop-submission.mjs';
import {readDesktopAddendum} from './desktop-addendum.mjs';
import {readDesktopOfferDocuments} from './desktop-offer-documents.mjs';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { deserialize } from 'node:v8';
import { createRequire } from 'node:module';
import { extractDesktopAssets } from './desktop-assets.mjs';
import { readDesktopDuplicateCheck } from './desktop-duplicate-check.mjs';
import { readDesktopRejectionCheck } from './desktop-rejection-check.mjs';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { readCompanyArchive } = require('./electron/services/companyBackupArchive.cjs');
const maxSchema = 69;
const companyProfileFields = ['companyName','unifiedSocialCreditCode','phone','email','legalRepresentative','registeredCapital','operatingPeriodStart','operatingPeriodEnd','address','businessScope','industry','companyType','insuredEmployeeCount','companyIntro','taxCertificateDate','taxCertificateNote','auditReportDate','auditReportNote','socialSecurityCertificateDate','socialSecurityCertificateNote','bankAccountName','bankAccountNumber','bankName','bankRoutingNumber','watermarkContent'];
const companyExperienceFields = ['projectName','projectNumber','customerName','projectType','projectManager','contractAmount','startDate','endDate','projectStatus','introduction'];
const text = (value, max, required = false) => { if (value == null) value = ''; if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error('El plan contiene texto no compatible.'); return value; };
function readFacts(rows) {
 if (!Array.isArray(rows)) throw new Error('Los hechos globales del respaldo no son compatibles.');
 return [...rows].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.group_id).localeCompare(String(b.group_id))).map(row => ({ id: row.group_id, title: row.title, content: row.content }));
}
function readAnalyses(rows, metadata) {
 if (!Array.isArray(rows)) throw new Error('Los análisis del respaldo no son compatibles.');
 const analyses = [...rows].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.item_id).localeCompare(String(b.item_id))).map(row => ({ id: row.item_id, label: row.label, status: row.status, content: row.content, error: row.error ?? null, sortOrder: row.sort_order }));
 if (typeof metadata?.outline_project_overview === 'string' && metadata.outline_project_overview) analyses.push({ id: 'legacy-project-overview', label: '', status: 'saved', content: metadata.outline_project_overview, error: null, sortOrder: analyses.length });
 return analyses;
}
function normalizeNodes(rows) {
 if (!Array.isArray(rows) || rows.length > 500) throw new Error('El plan contiene una cantidad de capítulos no compatible.');
 const ids = new Set();
 const nodes = rows.map(row => {
  const id = text(row?.node_id, 128, true), parentId = row.parent_node_id == null ? null : text(row.parent_node_id, 128, true);
  if (ids.has(id) || !Number.isSafeInteger(row.sort_order) || row.sort_order < 0) throw new Error('Los identificadores o el orden del plan no son válidos.');
  ids.add(id);
  return { id, parentId, sortOrder: row.sort_order, title: text(row.title, 300, true), description: text(row.description, 2000), content: text(row.content, 1_000_000), contentMode: text(row.content_mode || 'manual-fill', 100), contentModeNote: text(row.content_mode_note, 2000), sourceRequirementId: text(row.source_requirement_id, 128), sourceRequirementTitle: text(row.source_requirement_title, 300) };
 });
 const byId = new Map(nodes.map(node => [node.id, node]));
 for (const node of nodes) {
  let parent = node.parentId, depth = 1; const visited = new Set([node.id]);
  while (parent !== null) { if (!byId.has(parent) || visited.has(parent) || ++depth > 10) throw new Error('La jerarquía del plan no es válida.'); visited.add(parent); parent = byId.get(parent).parentId; }
  node.depth = depth;
 }
 if (JSON.stringify(nodes).length > 3_000_000) throw new Error('El contenido del plan supera el límite de importación.');
 return nodes.sort((a, b) => a.depth - b.depth || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
function extractDocuments(metadata, files, snapshot) {
 let sources = [];
 if (metadata?.tender_files_json) { try { sources = JSON.parse(metadata.tender_files_json); } catch { throw new Error('No se puede leer la lista de documentos del plan.'); } if (!Array.isArray(sources)) throw new Error('La lista de documentos del plan no es válida.'); }
 if (!sources.length && metadata?.tender_markdown_path) sources = [{ id: 'tender-legacy-01', fileName: metadata.tender_file_name || 'Documento', sourceOriginalPath: '' }];
 if (sources.length > 500) throw new Error('El plan contiene demasiados documentos para la importación.');
 const documents = [], missingDocuments = [], ids = new Set();
 for (const source of sources) {
  const sourceId = text(source?.id, 256, true), name = text(source?.fileName, 255, true);
  if (ids.has(sourceId)) throw new Error('El plan contiene identificadores de documentos duplicados.'); ids.add(sourceId);
  const input = source?.sourceOriginalPath || (/\.docx$/i.test(name.trim()) ? source?.sourceDocxPath : '') || '';
  if (typeof input !== 'string' || !input) { missingDocuments.push({ sourceId, name, reason: 'original_missing' }); continue; }
  const path = input.replace(/\\/g, '/'), parts = path.split('/');
  if (parts[0] !== 'technical-plan' || parts.length < 2 || parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) { missingDocuments.push({ sourceId, name, reason: 'outside_backup' }); continue; }
  const key = snapshot ? `technical-plan-projects/${snapshot}/plan/${parts.slice(1).join('/')}` : `workspace/${parts.join('/')}`;
  const bytes = files.get(key);
  if (!bytes) { missingDocuments.push({ sourceId, name, reason: 'original_missing' }); continue; }
  documents.push({ sourceId, name, bytes });
 }
 return { documents, missingDocuments };
}
export async function inspectDesktopBackup(bytes, { temporaryRoot = tmpdir() } = {}) {
 const archive = readCompanyArchive(Buffer.from(bytes), maxSchema), directory = await createManagedWorkspace(temporaryRoot,'backup-read'); let db;
 try {
  const filename = join(directory, 'savia.sqlite'); await writeFile(filename, archive.files.get('workspace/savia.sqlite'), { mode: 0o600, flag: 'wx' });
  db = new DatabaseSync(filename, { readOnly: true });
  if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || db.prepare('PRAGMA user_version').get().user_version !== archive.manifest.schemaVersion) throw new Error('La base de datos del respaldo no es válida.');
  const hasTable = name => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  if (!hasTable('technical_plan_meta') || !hasTable('technical_plan_outline_nodes')) throw new Error('La base no contiene un plan compatible de Savia.');
  const current = hasTable('technical_plan_project_active') ? db.prepare('SELECT project_id FROM technical_plan_project_active WHERE id = 1').get()?.project_id : null;
  const activeId = current || 'active', meta = db.prepare('SELECT * FROM technical_plan_meta WHERE id = 1').get() || {};
  const projectRows = hasTable('technical_plan_projects') ? db.prepare('SELECT id, snapshot FROM technical_plan_projects ORDER BY id').all() : [];
  const readWorkflow = processId => {
   if (!processId) return null;
   const stage = hasTable('secop_tender_workflow') ? db.prepare('SELECT work_stage, updated_at FROM secop_tender_workflow WHERE process_id = ?').get(processId) : null;
   const tasks = hasTable('secop_tender_tasks') ? db.prepare('SELECT * FROM secop_tender_tasks WHERE process_id = ? ORDER BY created_at, id').all(processId).map(row => ({ id: row.id, title: row.title, dueDate: row.due_date, completed: !!row.completed, createdAt: row.created_at, updatedAt: row.updated_at })) : [];
   const requirements = hasTable('secop_tender_requirements') ? db.prepare('SELECT * FROM secop_tender_requirements WHERE process_id = ? ORDER BY created_at, id').all(processId).map(row => ({ id: row.id, title: row.title, source: row.source, evidence: row.evidence, status: row.status, category: row.category ?? 'general', createdAt: row.created_at, updatedAt: row.updated_at })) : [];
   return stage || tasks.length || requirements.length ? { stage: stage?.work_stage ?? null, stageUpdatedAt: stage?.updated_at ?? null, tasks, requirements } : null;
  };
  const chatColumns = hasTable('tender_chat_messages') ? db.prepare('PRAGMA table_info(tender_chat_messages)').all().map(row => row.name) : [];
  const readChat = projectId => {
   if (!projectId || !chatColumns.length) return [];
   const followups = chatColumns.includes('followups_json') ? 'followups_json' : 'NULL AS followups_json';
   return db.prepare(`SELECT id, role, content, status, created_at, ${followups} FROM tender_chat_messages WHERE project_id = ? ORDER BY created_at, rowid`).all(projectId).map(row => ({ id: row.id, role: row.role, content: row.content, status: row.status, createdAt: row.created_at, followupsJson: row.followups_json ?? null }));
  };
  const readOffer = processId => {
   if (!processId || !hasTable('economic_offer_drafts')) return null;
   const row = db.prepare('SELECT draft_json, updated_at FROM economic_offer_drafts WHERE process_id = ?').get(processId);
   if (!row) return null;
   try { return { draft: JSON.parse(row.draft_json), updatedAt: row.updated_at }; }
   catch { throw new Error('No se puede leer la oferta económica del respaldo.'); }
  };
  const readComparisons = processId => {
   if (!processId || !hasTable('rup_requirement_comparisons')) return [];
   return db.prepare('SELECT * FROM rup_requirement_comparisons WHERE process_id = ? ORDER BY updated_at, requirement_id').all(processId).map(row => {
    const stored = row.certificate_stored_name;
    const safe = typeof stored === 'string' && !!stored && stored.length <= 255 && stored !== '.' && stored !== '..' && !/[\\/:\x00-\x1f\x7f]/.test(stored);
    const bytes = safe ? archive.files.get(`workspace/credential-library/rup/${stored}`) : null;
    const certificate = { sourceId: safe ? stored : '', name: row.certificate_name, issuedOn: row.certificate_issued_on, ...(bytes && bytes.length <= 25 * 1024 * 1024 ? { bytes } : { missing: true, reason: !safe ? 'unsafe_path' : bytes ? 'too_large' : 'not_found' }) };
    return { requirementId: row.requirement_id, factId: row.fact_id, label: row.fact_label, value: row.fact_value, page: row.fact_page, title: row.requirement_title, source: row.requirement_source, operator: row.operator, threshold: row.threshold, interpretedValue: row.interpreted_value || '', documentsHash: row.imported_hash || '', updatedAt: row.updated_at, certificate };
   });
  };
  const readSecop = (processId, portfolioId) => {
   if (!processId) return { secop:null, secopIssue:null };
   const saved=hasTable('secop_saved_processes') ? db.prepare('SELECT process_json FROM secop_saved_processes WHERE id = ?').get(processId) : null;
   const hasHistory=(hasTable('secop_watch_baselines') && db.prepare('SELECT 1 FROM secop_watch_baselines WHERE process_id = ?').get(processId)) || (hasTable('secop_watch_alerts') && db.prepare('SELECT 1 FROM secop_watch_alerts WHERE process_id = ? LIMIT 1').get(processId));
   if(!saved)return {secop:null,secopIssue:hasHistory ? 'saved_process_missing' : null};
   const parse=(value,fallback)=>{if(value==null || value==='')return fallback;try{return JSON.parse(value);}catch{throw new Error('No se puede leer el seguimiento SECOP del respaldo.');}};
   const process=parse(saved.process_json,null);
   if(!process || process.id!==processId || !['secop-i','secop-ii'].includes(process.source))return {secop:null,secopIssue:'incompatible_process'};
   if(portfolioId && process.portfolioId && portfolioId!==process.portfolioId)return {secop:null,secopIssue:'portfolio_mismatch'};
   if(portfolioId && !process.portfolioId)process.portfolioId=portfolioId;
   const row=hasTable('secop_watch_baselines') ? db.prepare('SELECT * FROM secop_watch_baselines WHERE process_id = ?').get(processId) : null;
   const baseline=row?{process:parse(row.process_json,{}),documents:parse(row.documents_json,null),checkedAt:row.checked_at||'',error:row.error||''}:null;
   const alerts=hasTable('secop_watch_alerts')?db.prepare('SELECT * FROM secop_watch_alerts WHERE process_id = ? ORDER BY created_at,rowid').all(processId).map(alert=>({id:alert.id,title:alert.title,kind:alert.kind,previous:parse(alert.previous_json,null),current:parse(alert.current_json,null),createdAt:alert.created_at||'',reviewed:!!alert.reviewed})):[];
   return {secop:{sourceId:processId,process,baseline,alerts},secopIssue:null};
  };
  const readOpportunityTracking = processId => {
   if (!processId || !hasTable('secop_opportunity_tracking') || !hasTable('secop_saved_processes') || !db.prepare('SELECT 1 FROM secop_saved_processes WHERE id = ?').get(processId)) return null;
   const row = db.prepare('SELECT decision, owner, notes FROM secop_opportunity_tracking WHERE process_id = ?').get(processId);
   return row ? { decision: row.decision, owner: row.owner, notes: row.notes } : null;
  };
  const readRequirementSupports = processId => {
   if (!processId || !hasTable('secop_requirement_supports') || !hasTable('secop_tender_requirements') || !hasTable('secop_saved_processes') || !db.prepare('SELECT 1 FROM secop_saved_processes WHERE id = ?').get(processId)) return [];
   return db.prepare('SELECT s.id,s.requirement_id,s.title,s.status,s.certificate_id,s.created_at FROM secop_requirement_supports s JOIN secop_tender_requirements r ON r.process_id=s.process_id AND r.id=s.requirement_id WHERE s.process_id=? ORDER BY s.created_at,s.id').all(processId).map(row=>({id:row.id,requirementId:row.requirement_id,title:row.title,status:row.status,certificateId:row.certificate_id,createdAt:row.created_at}));
  };
  const project = (sourceId, metadata, rows, facts, analyses, active, snapshot, context) => { const nodes = normalizeNodes(rows); const processId = context?.find(row => row.id === 1)?.process_id || (active ? current : sourceId); return { sourceId: text(sourceId, 160, true), title: text(metadata?.outline_project_name || (active ? 'Plan actual' : sourceId), 300, true), active, nodes, linkedProcessId: processId || null, addendum:readDesktopAddendum(db,hasTable,context?.find(row => row.id === 1)?.process_id || ''), submission:readDesktopSubmission(db,archive.files,hasTable,processId), opportunityTracking: readOpportunityTracking(context?.find(row => row.id === 1)?.process_id), requirementSupports: readRequirementSupports(context?.find(row => row.id === 1)?.process_id), workflow: readWorkflow(processId), economicOffer: readOffer(processId), comparisons: readComparisons(processId), ...readSecop(processId, context?.find(row => row.id === 1)?.portfolio_id || ''), chatMessages: readChat(active ? current : sourceId), bidEvaluation:readDesktopBidEvaluation(db,archive.files,hasTable,active ? current : sourceId), facts: readFacts(facts), analyses: readAnalyses(analyses, metadata), ...extractDocuments(metadata, archive.files, snapshot), ...extractDesktopAssets(nodes, archive.files, snapshot) }; };
  const projects = [project(activeId, meta, db.prepare('SELECT * FROM technical_plan_outline_nodes ORDER BY sort_order, node_id').all(), hasTable('technical_plan_global_fact_groups') ? db.prepare('SELECT * FROM technical_plan_global_fact_groups ORDER BY sort_order, group_id').all() : [], hasTable('technical_plan_bid_items') ? db.prepare('SELECT * FROM technical_plan_bid_items ORDER BY sort_order, item_id').all() : [], true, undefined, hasTable('technical_plan_secop_context') ? db.prepare('SELECT * FROM technical_plan_secop_context WHERE id = 1').all() : [])], unavailable = [];
  for (const item of projectRows) {
   if (item.id === activeId) continue;
   if (!item.snapshot || !/^[a-f0-9-]{36}$/.test(item.snapshot)) { unavailable.push({ sourceId: item.id, reason: 'snapshot_missing' }); continue; }
   const owner = archive.files.get(`technical-plan-projects/${item.snapshot}/owner.txt`);
   if (owner && owner.toString('utf8') !== item.id) throw new Error('La instantánea no pertenece al proyecto indicado en el respaldo.');
   const bytes = archive.files.get(`technical-plan-projects/${item.snapshot}/data.bin`);
   if (!bytes || bytes.length > 32 * 1024 * 1024) { unavailable.push({ sourceId: item.id, reason: 'snapshot_missing' }); continue; }
   let data; try { data = deserialize(bytes); } catch { throw new Error('No se pudo leer una instantánea del respaldo.'); }
   if (!data?.tables || !Array.isArray(data.tables.technical_plan_outline_nodes) || !Array.isArray(data.tables.technical_plan_meta)) throw new Error('La instantánea del proyecto no es compatible.');
   projects.push(project(item.id, data.tables.technical_plan_meta.find(row => row.id === 1), data.tables.technical_plan_outline_nodes, data.tables.technical_plan_global_fact_groups ?? [], data.tables.technical_plan_bid_items ?? [], false, item.snapshot, data.tables.technical_plan_secop_context ?? []));
  }
  for(const item of projects)item.offerDocuments=readDesktopOfferDocuments(db,archive.files,hasTable,item.linkedProcessId);
  const imageLibrary=hasTable('image_library')?db.prepare('SELECT * FROM image_library ORDER BY created_at,rowid').all().map(row=>{
   const stored=typeof row.stored_name==='string'?row.stored_name:'',safe=!!stored&&stored!=='.'&&stored!=='..'&&!/[\\/:\x00-\x1f\x7f]/.test(stored),bytes=safe?archive.files.get(`workspace/imported-images/library/${stored}`):null;
   return {sourceId:row.id,name:row.name,createdAt:row.created_at,...(bytes?.length&&bytes.length<=25*1024*1024?{bytes}:{missing:true,reason:!safe?'unsafe_path':!bytes?'not_found':!bytes.length?'empty':'too_large'})};
  }):[];
  const savedTenders = [];
  if(hasTable('secop_saved_processes')) {
   const linked = new Set(projects.map(item=>item.linkedProcessId).filter(Boolean));
   for(const unavailableProject of unavailable)linked.add(unavailableProject.sourceId);
   const parse=(value,fallback)=>{if(!value)return fallback;try{return JSON.parse(value);}catch{throw new Error('No se puede leer una licitación guardada del respaldo.');}};
   const savedColumns=db.prepare('PRAGMA table_info(secop_saved_processes)').all().map(column=>column.name), savedOrder=savedColumns.includes('updated_at')?'updated_at DESC,id':'id';
   for(const row of db.prepare(`SELECT * FROM secop_saved_processes ORDER BY ${savedOrder}`).all()) {
    const association=linked.has(row.id)?'linked':unavailable.length?'ambiguous':'standalone';
    try {
     const process=parse(row.process_json,null),analysis=parse(row.analysis_json,{}),importedDocuments=parse(row.imported_json,[]),officialDocuments=parse(row.official_json,[]);
     if(!process||typeof process!=='object'||Array.isArray(process)||!analysis||typeof analysis!=='object'||Array.isArray(analysis)||!Array.isArray(importedDocuments)||!Array.isArray(officialDocuments))throw new Error('invalid record');
     const supported=typeof row.id==='string'&&!!row.id&&process.id===row.id&&['local','secop-i','secop-ii'].includes(process.source);
     const title=String(process.title||process.reference||row.id).trim().slice(0,300)||'Licitación';
     const record={sourceId:row.id,title,process,summary:row.summary||'',analysis,importedDocuments,officialDocuments,createdAt:row.created_at||'',updatedAt:row.updated_at||''};
     const secop=supported&&process.source!=='local'?readSecop(row.id,'').secop:null;
     savedTenders.push({record,association,supported,secop,addendum:readDesktopAddendum(db,hasTable,row.id),offerDocuments:readDesktopOfferDocuments(db,archive.files,hasTable,row.id),submission:readDesktopSubmission(db,archive.files,hasTable,row.id),opportunityTracking:readOpportunityTracking(row.id),requirementSupports:readRequirementSupports(row.id),workflow:readWorkflow(row.id),economicOffer:readOffer(row.id),comparisons:readComparisons(row.id)});
    }catch{savedTenders.push({record:{sourceId:String(row.id||'')},association,supported:false,issue:'invalid_record'});}
   }
  }
  for(const item of savedTenders) if(item.association==='standalone' && item.supported) item.bidEvaluation=readDesktopBidEvaluation(db,archive.files,hasTable,item.record.sourceId);
  let rup = null;
  if (hasTable('rup_certificate')) {
   const certificate = db.prepare('SELECT * FROM rup_certificate WHERE id = 1').get();
   if (certificate) {
    const stored = text(certificate.stored_name, 255, true);
    if (stored === '.' || stored === '..' || /[\\/:\x00-\x1f\x7f]/.test(stored)) throw new Error('La ruta del certificado RUP no es válida.');
    const bytes = archive.files.get(`workspace/credential-library/rup/${stored}`);
    const facts = hasTable('rup_reviewed_facts') ? db.prepare('SELECT id, label, value, page FROM rup_reviewed_facts WHERE certificate_name = ? ORDER BY rowid').all(stored).map(row => ({ id: row.id, label: row.label, value: row.value, page: row.page })) : [];
    rup = { sourceId:stored, name: certificate.file_name, importedAt: certificate.imported_at, issuedOn: certificate.issued_on || '', facts, ...(bytes && bytes.length <= 25 * 1024 * 1024 ? { bytes } : { missing: true, reason: bytes ? 'too_large' : 'not_found' }) };
   }
  }
  const paaWatches = { items: [], orphanAlertCount: 0 };
  if (hasTable('paa_watched_plans')) {
   const rows = db.prepare('SELECT * FROM paa_watched_plans ORDER BY plan_id').all(), allAlerts = hasTable('paa_watch_alerts') ? db.prepare('SELECT * FROM paa_watch_alerts ORDER BY created_at, rowid').all() : [];
   const known = new Set(rows.map(row => row.plan_id)); paaWatches.orphanAlertCount = allAlerts.filter(alert => !known.has(alert.plan_id)).length;
   const parse = value => { try { const result = JSON.parse(value); if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(); return result; } catch { throw new Error('No se pudo leer el seguimiento PAA del respaldo.'); } };
   paaWatches.items = rows.map(row => ({ planId:row.plan_id, header:parse(row.header_json), checkedAt:row.checked_at || '', error:row.error || '', alerts:allAlerts.filter(alert => alert.plan_id === row.plan_id).map(alert => ({id:alert.id,previous:parse(alert.previous_json),current:parse(alert.current_json),createdAt:alert.created_at || '',reviewed:!!alert.reviewed})) }));
  }
  const companyRow=hasTable('credential_library_profile')?db.prepare('SELECT * FROM credential_library_profile WHERE id = 1').get():null;
  const companyProfile=companyRow?{...Object.fromEntries(companyProfileFields.map(field=>{const column=field.replace(/[A-Z]/g,letter=>`_${letter.toLowerCase()}`);return [field,text(companyRow[column],100000)];})),watermarkEnabled:!!companyRow.watermark_enabled}:null;
  const companyProfileImages=hasTable('credential_library_images')?db.prepare("SELECT * FROM credential_library_images WHERE owner_type='profile' AND owner_id='1' ORDER BY field_key,sort_order,created_at,image_id").all().map(image=>{
   const source=typeof image.relative_path==='string'?image.relative_path.replace(/\\/g,'/'):'',parts=source.split('/');
   const safe=parts.length===2&&parts[0]==='images'&&parts.every(part=>part&&part!=='.'&&part!=='..'&&!/[:\x00-\x1f\x7f]/.test(part));
   const bytes=safe?archive.files.get(`workspace/credential-library/${source}`):null;
   return {sourceId:image.image_id,name:image.original_name||'',customName:image.custom_name||'',fieldKey:image.field_key||'',sortOrder:Number.isSafeInteger(image.sort_order)?image.sort_order:0,createdAt:image.created_at||'',...(bytes?.length&&bytes.length<=25*1024*1024?{bytes}:{missing:true,reason:!safe?'unsafe_path':!bytes?'not_found':!bytes.length?'empty':'too_large'})};
  }):[];
  const companyExperience=hasTable('credential_library_projects')?db.prepare('SELECT * FROM credential_library_projects ORDER BY updated_at DESC,created_at DESC,project_id').all().map(row=>{
   const images=hasTable('credential_library_images')?db.prepare("SELECT * FROM credential_library_images WHERE owner_type='project' AND owner_id=? ORDER BY field_key,sort_order,created_at,image_id").all(row.project_id).map(image=>{
    const source=typeof image.relative_path==='string'?image.relative_path.replace(/\\/g,'/'):'',parts=source.split('/');
    const safe=parts.length===2&&parts[0]==='images'&&parts.every(part=>part&&part!=='.'&&part!=='..'&&!/[:\x00-\x1f\x7f]/.test(part)),bytes=safe?archive.files.get(`workspace/credential-library/${source}`):null;
    return {sourceId:image.image_id,projectSourceId:row.project_id,name:image.original_name||'',customName:image.custom_name||'',fieldKey:image.field_key||'',sortOrder:Number.isSafeInteger(image.sort_order)?image.sort_order:0,createdAt:image.created_at||'',...(bytes?.length&&bytes.length<=25*1024*1024?{bytes}:{missing:true,reason:!safe?'unsafe_path':!bytes?'not_found':!bytes.length?'empty':'too_large'})};
   }):[];
   return {sourceId:text(row.project_id,256,true),...Object.fromEntries(companyExperienceFields.map(field=>[field,text(row[field.replace(/[A-Z]/g,letter=>`_${letter.toLowerCase()}`)],20000)])),createdAt:text(row.created_at,20000),updatedAt:text(row.updated_at,20000),imageCount:images.length,images};
  }):[];
  const companyCertificates = hasTable('credential_library_certificates') ? db.prepare('SELECT * FROM credential_library_certificates ORDER BY updated_at DESC, created_at DESC, certificate_id').all().map(row => {
   const images = hasTable('credential_library_images') ? db.prepare("SELECT * FROM credential_library_images WHERE owner_type = 'certificate' AND owner_id = ? ORDER BY sort_order, created_at, image_id").all(row.certificate_id).map(image => {
    const source = typeof image.relative_path === 'string' ? image.relative_path.replace(/\\/g, '/') : '', parts = source.split('/');
    const safe = parts.length === 2 && parts[0] === 'images' && parts.every(part => part && part !== '.' && part !== '..' && !/[:\x00-\x1f\x7f]/.test(part));
    const bytes = safe ? archive.files.get(`workspace/credential-library/${source}`) : null;
    return { sourceId:image.image_id, certificateSourceId:row.certificate_id, name:image.original_name || '', customName:image.custom_name || '', fieldKey:image.field_key || '', createdAt:image.created_at || '', ...(bytes?.length && bytes.length <= 25*1024*1024 ? {bytes} : {missing:true,reason:!safe ? 'unsafe_path' : !bytes ? 'not_found' : !bytes.length ? 'empty' : 'too_large'}) };
   }) : [];
   return { sourceId:row.certificate_id, name:row.name || '', number:row.number || '', validityMode:row.validity_mode || '', validFrom:row.valid_from || '', validTo:row.valid_to || '', createdAt:row.created_at || '', updatedAt:row.updated_at || '', imageCount:images.length, images };
  }) : [];
  const knowledge = { folders: [] };
  if (hasTable('knowledge_folders') && hasTable('knowledge_documents')) {
   const folderColumns = db.prepare('PRAGMA table_info(knowledge_folders)').all().map(row => row.name), docColumns = db.prepare('PRAGMA table_info(knowledge_documents)').all().map(row => row.name);
   const folderOrder = folderColumns.includes('sort_order') ? 'sort_order, created_at, folder_id' : 'created_at, folder_id';
   const docOrder = docColumns.includes('sort_order') ? 'sort_order, created_at, document_id' : 'created_at, document_id';
   knowledge.folders = db.prepare(`SELECT * FROM knowledge_folders ORDER BY ${folderOrder}`).all().map(folder => {
    const documents = db.prepare(`SELECT * FROM knowledge_documents WHERE folder_id = ? ORDER BY ${docOrder}`).all(folder.folder_id).map(document => {
     const source = typeof document.source_path === 'string' ? document.source_path.replace(/\\/g, '/') : '', parts = source.split('/');
     const safe = !!source && parts.every(part => part && part !== '.' && part !== '..' && !/[:\x00-\x1f\x7f]/.test(part));
     const bytes = safe ? archive.files.get(`workspace/knowledge-base/${source}`) : null;
     const items = hasTable('knowledge_items') ? db.prepare('SELECT * FROM knowledge_items WHERE document_id = ? ORDER BY sort_order, item_id').all(document.document_id).map(item => ({ id: item.item_id, title: item.title, summary: item.resume, content: item.content, source: item.source_file || '' })) : [];
     return { sourceId: document.document_id, name: document.file_name, createdAt: document.created_at, items, ...(bytes?.length && bytes.length <= 25 * 1024 * 1024 ? { bytes } : { missing: true, reason: !safe ? 'unsafe_path' : !bytes ? 'not_found' : !bytes.length ? 'empty' : 'too_large' }) };
    });
    return { sourceId: folder.folder_id, name: folder.name, createdAt: folder.created_at, documents };
   });
  }
  const duplicateCheck = readDesktopDuplicateCheck(db, archive.files, hasTable), rejectionCheck = readDesktopRejectionCheck(db,archive.files,hasTable);
  const exportTemplates={items:[],invalidCount:0};
  if(hasTable('export_templates')){
   const columns=db.prepare('PRAGMA table_info(export_templates)').all().map(row=>row.name);
   if(['template_id','template_name','config_json','is_system','created_at','updated_at'].every(name=>columns.includes(name))){
    const rows=db.prepare('SELECT template_id,template_name,config_json,created_at,updated_at FROM export_templates WHERE is_system=0 ORDER BY updated_at,template_id').all();
    if(rows.length>1000)throw new Error('El respaldo contiene demasiadas plantillas de formato.');
    for(const row of rows){try{if(typeof row.template_id!=='string'||!row.template_id||row.template_id.length>256||typeof row.template_name!=='string'||!row.template_name.trim()||row.template_name.length>300||typeof row.config_json!=='string'||row.config_json.length>100000||typeof row.created_at!=='string'||row.created_at.length>100||typeof row.updated_at!=='string'||row.updated_at.length>100)throw Error('invalid');const config=JSON.parse(row.config_json);if(!config||typeof config!=='object'||Array.isArray(config))throw Error('invalid');exportTemplates.items.push({sourceId:row.template_id,name:row.template_name,config,createdAt:row.created_at,updatedAt:row.updated_at});}catch{exportTemplates.invalidCount++;}}
   }else exportTemplates.invalidCount=(db.prepare('SELECT COUNT(*) AS count FROM export_templates').get().count||0);
  }
  const opportunityTrackingOrphanCount = !hasTable('secop_opportunity_tracking') ? 0 : !hasTable('secop_saved_processes') ? db.prepare('SELECT COUNT(*) AS count FROM secop_opportunity_tracking').get().count : db.prepare('SELECT COUNT(*) AS count FROM secop_opportunity_tracking t WHERE NOT EXISTS (SELECT 1 FROM secop_saved_processes s WHERE s.id = t.process_id)').get().count;
  const requirementSupportsOrphanCount = !hasTable('secop_requirement_supports') ? 0 : !hasTable('secop_tender_requirements') ? db.prepare('SELECT COUNT(*) AS count FROM secop_requirement_supports').get().count : db.prepare('SELECT COUNT(*) AS count FROM secop_requirement_supports s WHERE NOT EXISTS (SELECT 1 FROM secop_tender_requirements r WHERE r.process_id=s.process_id AND r.id=s.requirement_id)').get().count;
  return { requirementSupportsOrphanCount, exportTemplates, companyName: archive.manifest.companyName, schemaVersion: archive.manifest.schemaVersion, projects, unavailable, rup, knowledge, companyProfile, companyProfileImages, companyExperience, companyCertificates, paaWatches, savedTenders, opportunityTrackingOrphanCount, imageLibrary, duplicateCheck, rejectionCheck, feasibility:readDesktopFeasibility(db,archive.files,hasTable), omitted: [...(hasTable('addendum_impact_runs')?['addendum-impact']:[]), 'other-documents', 'images', 'global-facts', 'tasks', 'rup-comparisons', 'sessions', 'other-data',...(archive.manifest.schemaVersion>=67?['offer-support-files']:[]),...(archive.manifest.schemaVersion>=68?['addendum-actions']:[]),...(archive.manifest.schemaVersion>=69?['submission-tracking']:[])] };
 } finally { db?.close(); await rm(directory, { recursive: true, force: true }); }
}
