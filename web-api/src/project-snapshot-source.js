// Internal source for a partial capture; it is not a complete or atomic backup.
import { digest } from './runners.js';
import { prepareKnowledgeTransport } from './project-knowledge-transport.js';
import { preparePlanLibraryImages } from './project-library-images.js';
import { prepareEvaluationTransport } from './project-evaluation-transport.js';
import { prepareComparisonTransport } from './project-comparison-transport.js';
import {validProjectRejectionDraft} from '../../runner/project-rejection-draft-restore.mjs';
export class ProjectSnapshotError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const changed = () => new ProjectSnapshotError('changed','El proyecto o sus archivos cambiaron durante la captura.');
const missing = () => new ProjectSnapshotError('missing','Falta un objeto o su tamaño no coincide con el proyecto.');
const fileVersion = (file, etag) => digest(JSON.stringify([file, etag]));

async function readRows(DB, owner, projectId) {
  const [projects, files, deleting, workflow, tasks, requirements, plan, assets, facts, analyses, imported, importedChat, chatJobs, secop, baseline, alerts, secopLinks, zipLinks, offer, blindProfile, opportunityTracking, requirementSupports, rejectionDraft, addenda] = await DB.batch([
    DB.prepare('SELECT id,title,created_at FROM projects WHERE id=? AND owner_id=?').bind(projectId, owner),
    DB.prepare('SELECT f.id,f.name,f.content_type,f.object_key,f.size,f.created_at FROM project_files f JOIN projects p ON p.id=f.project_id WHERE p.id=? AND p.owner_id=? ORDER BY f.id').bind(projectId, owner),
    DB.prepare('SELECT d.id FROM project_file_deletions d JOIN projects p ON p.id=d.project_id WHERE p.id=? AND p.owner_id=? AND d.storage_deleted_at IS NULL LIMIT 1').bind(projectId, owner),
    DB.prepare('SELECT w.stage,w.updated_at FROM project_workflow w JOIN projects p ON p.id=w.project_id WHERE p.id=? AND p.owner_id=?').bind(projectId,owner),
    DB.prepare('SELECT t.id,t.title,t.due_date,t.completed,t.created_at,t.updated_at FROM project_tasks t JOIN projects p ON p.id=t.project_id WHERE p.id=? AND p.owner_id=? ORDER BY t.id').bind(projectId,owner),
    DB.prepare('SELECT r.id,r.title,r.source,r.evidence,r.status,r.category,r.created_at,r.updated_at FROM project_requirements r JOIN projects p ON p.id=r.project_id WHERE p.id=? AND p.owner_id=? ORDER BY r.id').bind(projectId,owner),
    DB.prepare('SELECT n.node_id,n.parent_node_id,n.sort_order,n.title,n.description,n.content_mode,n.content_mode_note,n.source_requirement_id,n.source_requirement_title,n.knowledge_item_ids_json,n.content,n.status,n.plan_json,n.attr FROM project_technical_plan_nodes n JOIN projects p ON p.id=n.project_id WHERE p.id=? AND p.owner_id=? ORDER BY n.node_id').bind(projectId,owner),
    DB.prepare('SELECT a.id,a.reference,a.kind,a.content_hash,a.content_type,a.size,a.object_key FROM project_plan_assets a JOIN projects p ON p.id=a.project_id AND p.owner_id=a.owner_id WHERE p.id=? AND p.owner_id=? ORDER BY a.id').bind(projectId,owner),
    DB.prepare('SELECT f.groups_json,f.snapshot_json,f.revision,f.mode FROM project_global_facts f JOIN projects p ON p.id=f.project_id WHERE p.id=? AND p.owner_id=?').bind(projectId,owner),
    DB.prepare('SELECT a.category,a.content,a.revision,a.source_snapshot_json FROM project_technical_analyses a JOIN projects p ON p.id=a.project_id WHERE p.id=? AND p.owner_id=? ORDER BY a.category').bind(projectId,owner),
    DB.prepare('SELECT i.analyses_json,i.content_hash FROM desktop_analysis_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE p.id=? AND p.owner_id=?').bind(projectId,owner),
    DB.prepare('SELECT i.messages_json,i.content_hash FROM desktop_chat_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE p.id=? AND p.owner_id=?').bind(projectId,owner),
    DB.prepare("SELECT j.id,j.payload_json,j.result_json,j.state,j.created_at,j.updated_at FROM jobs j JOIN projects p ON p.id=j.project_id AND p.owner_id=j.owner_id WHERE p.id=? AND p.owner_id=? AND j.kind='tender-chat.send' AND json_extract(j.payload_json, '$.wordAssistance') IS NULL ORDER BY j.created_at,j.id").bind(projectId,owner),
    DB.prepare('SELECT s.source,s.external_id,s.process_json FROM project_secop s JOIN projects p ON p.id=s.project_id AND p.owner_id=s.owner_id WHERE p.id=? AND p.owner_id=?').bind(projectId,owner),
    DB.prepare('SELECT b.process_json,b.documents_json,b.checked_at,b.error,b.revision FROM secop_watch_baselines_web b JOIN projects p ON p.id=b.project_id AND p.owner_id=b.owner_id WHERE p.id=? AND p.owner_id=?').bind(projectId,owner),
    DB.prepare('SELECT a.id,a.title,a.kind,a.previous_json,a.current_json,a.created_at,a.reviewed FROM secop_watch_alerts_web a JOIN projects p ON p.id=a.project_id AND p.owner_id=a.owner_id WHERE p.id=? AND p.owner_id=? ORDER BY a.created_at,a.id').bind(projectId,owner),
    DB.prepare('SELECT s.document_id,s.file_id FROM project_secop_files s JOIN projects p ON p.id=s.project_id WHERE p.id=? AND p.owner_id=? ORDER BY s.document_id,s.file_id').bind(projectId,owner),
    DB.prepare('SELECT s.document_id,s.file_id FROM secop_zip_files s JOIN projects p ON p.id=s.project_id WHERE p.id=? AND p.owner_id=? ORDER BY s.document_id,s.file_id').bind(projectId,owner),
    DB.prepare('SELECT o.draft_json,o.version,o.updated_at FROM economic_offer_drafts o JOIN projects p ON p.id=o.project_id WHERE p.id=? AND p.owner_id=?').bind(projectId,owner),
    DB.prepare('SELECT b.profile_json,b.version,b.updated_at FROM project_blind_profiles b JOIN projects p ON p.id=b.project_id WHERE p.id=? AND p.owner_id=?').bind(projectId,owner),
    DB.prepare('SELECT t.decision,t.owner,t.notes,t.version FROM project_opportunity_tracking t JOIN projects p ON p.id=t.project_id WHERE p.id=? AND p.owner_id=?').bind(projectId,owner),
    DB.prepare('SELECT s.id,s.requirement_id,s.title,s.status,s.link_type,s.link_id,s.version,s.created_at FROM project_requirement_supports s JOIN projects p ON p.id=s.project_id WHERE p.id=? AND p.owner_id=? ORDER BY s.created_at,s.id').bind(projectId,owner),
    DB.prepare('SELECT d.criteria,d.custom,d.options_json,d.version,d.updated_at FROM rejection_drafts d JOIN projects p ON p.id=d.project_id WHERE p.id=? AND p.owner_id=?').bind(projectId,owner),
    DB.prepare('SELECT source_run_id,record_json,created_at FROM project_addendum_history WHERE project_id=? AND EXISTS (SELECT 1 FROM projects WHERE id=? AND owner_id=?) ORDER BY source_run_id').bind(projectId,projectId,owner),
  ]);
  if (!projects.results.length) return null;
  if (deleting.results.length) throw changed();
  return { addenda:addenda.results, project:projects.results[0], files:files.results, workflow:workflow.results[0] || null, tasks:tasks.results, requirements:requirements.results, plan:plan.results, assets:assets.results, facts:facts.results[0] || null, analyses:analyses.results, imported:imported.results[0] || null, importedChat:importedChat.results[0] || null, chatJobs:chatJobs.results, secop:secop.results[0] || null, baseline:baseline.results[0] || null, alerts:alerts.results, secopLinks:secopLinks.results, zipLinks:zipLinks.results, offer:offer.results[0] || null, blindProfile:blindProfile.results[0] || null, opportunityTracking:opportunityTracking.results[0] || null, requirementSupports:requirementSupports.results, rejectionDraft:rejectionDraft.results[0] || null };
}

export async function openProjectSnapshotSource(env, owner, projectId) {
  const rows = await readRows(env.DB, owner, projectId);
  if (!rows) return null;
  const knowledge = await prepareKnowledgeTransport(env,owner,rows.plan);
  const library = await preparePlanLibraryImages(env,owner,rows.plan);
  const comparisons = await prepareComparisonTransport(env,owner,projectId);
  const evaluations = await prepareEvaluationTransport(env,owner,projectId);
  if (!evaluations) throw changed();
  const original = JSON.stringify(rows), objects = new Map(), files = [], assets = [];
  for (const file of rows.files) {
    const object = await env.FILES.head(file.object_key);
    if (!object || object.size !== file.size) throw missing();
    objects.set(file.id, { key: file.object_key, etag: object.etag, size: file.size });
    const { object_key, ...metadata } = file;
    files.push({ ...metadata, etag:object.etag, version:await fileVersion(file,object.etag) });
  }
  for (const asset of rows.assets) {
    const object = await env.FILES.head(asset.object_key);
    if (!object || object.size !== asset.size) throw missing();
    objects.set(`asset:${asset.id}`, {key:asset.object_key,etag:object.etag,size:asset.size});
    const {object_key,...metadata} = asset;
    assets.push({...metadata,etag:object.etag,version:await fileVersion(asset,object.etag)});
  }
  const revision = await digest(JSON.stringify([rows, [...objects.entries()],knowledge.revisionData,library.revisionData,comparisons.revisionData,evaluations.revisionData]));
  let context,chat,secop,offer,blindProfile,rejectionDraft; try {
    offer=rows.offer?{draft:JSON.parse(rows.offer.draft_json),updatedAt:rows.offer.updated_at}:null;
    blindProfile=rows.blindProfile?{profile:JSON.parse(rows.blindProfile.profile_json),updatedAt:rows.blindProfile.updated_at}:null;
    rejectionDraft=rows.rejectionDraft?{criteria:rows.rejectionDraft.criteria,custom:rows.rejectionDraft.custom,options:JSON.parse(rows.rejectionDraft.options_json),updatedAt:rows.rejectionDraft.updated_at}:null;
    if(!validProjectRejectionDraft(rejectionDraft))throw changed();
    context={facts:rows.facts?{groups:JSON.parse(rows.facts.groups_json)}:null,analyses:rows.analyses.map(row=>({category:row.category,content:row.content})),importedAnalyses:rows.imported?JSON.parse(rows.imported.analyses_json):[]};
    chat=rows.importedChat?JSON.parse(rows.importedChat.messages_json):[];if(!Array.isArray(chat))throw changed();
    for(const job of rows.chatJobs){
      const payload=JSON.parse(job.payload_json),result=job.result_json?JSON.parse(job.result_json):null;
      if(typeof payload.question!=='string' || (job.state==='succeeded' && typeof result?.answer!=='string'))throw changed();
      chat.push({id:`${job.id}:question`,role:'user',content:payload.question,status:'complete',createdAt:job.created_at,followupsJson:null});
      const answer=typeof result?.answer==='string'?result.answer:typeof result?.message==='string'?result.message:typeof result?.error==='string'?result.error:'';
      const followups=Array.isArray(result?.followUps)?result.followUps.filter(item=>typeof item==='string'):[];
      chat.push({id:`${job.id}:answer`,role:'assistant',content:answer,status:job.state==='succeeded'?'complete':job.state==='failed'?'error':'interrupted',createdAt:job.updated_at,followupsJson:followups.length?JSON.stringify({questions:followups}):null});
    }
    if(!rows.secop && (rows.baseline || rows.alerts.length || rows.secopLinks.length || rows.zipLinks.length))throw changed();
    secop=rows.secop?{sourceId:rows.secop.external_id,process:JSON.parse(rows.secop.process_json),baseline:rows.baseline?{process:JSON.parse(rows.baseline.process_json),documents:rows.baseline.documents_json===null?null:JSON.parse(rows.baseline.documents_json),checkedAt:rows.baseline.checked_at,error:rows.baseline.error}:null,alerts:rows.alerts.map(a=>({id:a.id,title:a.title,kind:a.kind,previous:JSON.parse(a.previous_json || 'null'),current:JSON.parse(a.current_json || 'null'),createdAt:a.created_at,reviewed:!!a.reviewed})),links:[...rows.secopLinks.map(item=>({kind:'document',documentId:item.document_id,fileId:item.file_id})),...rows.zipLinks.map(item=>({kind:'zip',documentId:item.document_id,fileId:item.file_id}))]}:null;
  } catch { throw changed(); }
  return {
    revision,
    project: { ...rows.project },
    files,
    assets,
    knowledge:knowledge.knowledge,
    libraryImages:library.images,
    context,
    chat,
    secop,
    offer,
    opportunityTracking:rows.opportunityTracking?{decision:rows.opportunityTracking.decision,owner:rows.opportunityTracking.owner,notes:rows.opportunityTracking.notes}:null,
    requirementSupports:rows.requirementSupports.map(s=>({id:s.id,requirementId:s.requirement_id,title:s.title,status:s.status,linkType:s.link_type,linkId:s.link_id,createdAt:s.created_at})),
    blindProfile,
    rejectionDraft,
    addenda:rows.addenda.map(row=>JSON.parse(row.record_json)),
    comparisons:comparisons.comparisons,
    evaluations:evaluations.evaluations,
    workflow:{stage:rows.workflow?.stage || null,stageUpdatedAt:rows.workflow?.updated_at || null,tasks:rows.tasks.map(item=>({id:item.id,title:item.title,dueDate:item.due_date,completed:!!item.completed,createdAt:item.created_at,updatedAt:item.updated_at})),requirements:rows.requirements.map(item=>({id:item.id,title:item.title,source:item.source,evidence:item.evidence,status:item.status,category:item.category,createdAt:item.created_at,updatedAt:item.updated_at}))},
    technicalPlan:{nodes:rows.plan.map(n=>({id:n.node_id,parentId:n.parent_node_id,sortOrder:n.sort_order,title:n.title,description:n.description,contentMode:n.content_mode,contentModeNote:n.content_mode_note || '',sourceRequirementId:n.source_requirement_id || '',sourceRequirementTitle:n.source_requirement_title || '',knowledgeIdsJson:n.knowledge_item_ids_json,content:n.content,status:n.status,planJson:n.plan_json,attr:n.attr}))},
    async open(id) {
      const entry = objects.get(id);
      if (!entry) throw new Error('Objeto fuera de la captura.');
      const object = await env.FILES.get(entry.key, { onlyIf: { etagMatches: entry.etag } });
      if (!object?.body || object.size !== entry.size || object.etag !== entry.etag) throw changed();
      return object.body;
    },
    async assertUnchanged() {
      const current = await readRows(env.DB, owner, projectId);
      if (!current || JSON.stringify(current) !== original) throw changed();
      await knowledge.assertUnchanged();
      await library.assertUnchanged();
      await comparisons.assertUnchanged();
      await evaluations.assertUnchanged();
      for (const entry of objects.values()) {
        const object = await env.FILES.head(entry.key);
        if (!object || object.etag !== entry.etag || object.size !== entry.size) throw changed();
      }
    },
  };
}

export async function openProjectSnapshotFile(env, owner, projectId, fileId, etag, version) {
  const file = await env.DB.prepare('SELECT f.id,f.name,f.content_type,f.object_key,f.size,f.created_at FROM project_files f JOIN projects p ON p.id=f.project_id WHERE p.id=? AND p.owner_id=? AND f.id=?').bind(projectId,owner,fileId).first();
  if (!file) return null;
  if (typeof etag !== 'string' || !etag || await fileVersion(file,etag) !== version) throw changed();
  const object = await env.FILES.get(file.object_key, {onlyIf:{etagMatches:etag}});
  if (!object?.body || object.size !== file.size || object.etag !== etag) throw changed();
  return object.body;
}

export async function openProjectSnapshotAsset(env, owner, projectId, assetId, etag, version) {
  const asset = await env.DB.prepare('SELECT a.id,a.reference,a.kind,a.content_hash,a.content_type,a.size,a.object_key FROM project_plan_assets a JOIN projects p ON p.id=a.project_id AND p.owner_id=a.owner_id WHERE p.id=? AND p.owner_id=? AND a.id=?').bind(projectId,owner,assetId).first();
  if (!asset) return null;
  if (typeof etag !== 'string' || !etag || await fileVersion(asset,etag) !== version) throw changed();
  const object = await env.FILES.get(asset.object_key, {onlyIf:{etagMatches:etag}});
  if (!object?.body || object.size !== asset.size || object.etag !== etag) throw changed();
  return object.body;
}
