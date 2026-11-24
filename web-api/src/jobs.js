import {validTechnicalFormat} from './bid-document-rules.js';
import {projectFeasibilityAnalysisSourcesGuard} from './project-feasibility-analysis.js';
import {loadBatchWordPreview} from './batch-word-preview.js';
import {validActivity} from '../../runner/job-activity.mjs';
import {saveJobActivity} from './job-activity.js';
import pendingMarkers from '../../client/electron/utils/pendingMarkers.cjs';
import wordCount from '../../client/electron/utils/wordCount.cjs';
import {validateTechnicalPlanningOptions} from '../../runner/technical-content-planning.mjs';
import {completeTechnicalBatch} from './technical-batch.js';
import {completeOpportunity} from './opportunity-completion.js';
import {feasibilityKnowledgeGuard,readFeasibilityKnowledge} from './feasibility-knowledge.js';
import {validGeneratedFeasibilityOutline} from './feasibility-outline.js';
import blindPresets from '../../client/electron/services/blindCheckPresets.cjs';
import { getBlindProfile } from './blind-profile.js';
import { selectionFingerprint, readKnowledgeSources, validKnowledgeSelections, knowledgeSnapshotGuard, knowledgeSnapshotCurrent } from './knowledge-sources.js';
import { digest } from './runners.js';
import { captureGlobalFactSources, globalFactGuard, globalFactSourcesCurrent } from './global-fact-sources.js';
import { planAssetFingerprint, planAssetFingerprintSql } from './plan-asset-sources.js';
import { chapterFingerprint, templateValuesGuard } from './template-sources.js';
import { analysisCategories } from './technical-analysis.js';
import { captureOutlineSources, outlineGuard, outlineSnapshotCurrent, expandedOutlineGuard } from './outline-sources.js';
import { accountView, expireAccountJobs } from './account-jobs.js';
import { cleanupCompanyDossierFiles } from './company-dossier.js';
import { captureRequirementSources, sourceGuard } from './requirement-sources.js';
import exportDefaults from '../../client/electron/services/exportFormatDefaults.cjs';

const leaseDurationMs = 60_000;
function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
}
function view(row) {
  return { id: row.id, projectId: row.project_id, kind: row.kind, credentialId: row.credential_id, payload: JSON.parse(row.payload_json), state: row.state,
    result: row.result_json === null ? null : JSON.parse(row.result_json), progress: row.state === 'running' ? row.progress ?? null : null, createdAt: row.created_at, updatedAt: row.updated_at,
    ...(row.kind === 'technical-plan.generate-batch' && row.batch_draft_count !== undefined ? { draftCount: row.batch_draft_count, appliedVersion: row.batch_applied_version ?? null } : {}),
    ...(['technical-plan.export-word', 'technical-plan.extract-template', 'duplicate-check.analyze', 'rejection-check.analyze', 'blind-check.inspect', 'blind-check.fix', 'blind-check.fix-report', 'blind-check.fix-ai', 'bid-evaluation.analyze', 'proposal-review.apply-suggestions'].includes(row.kind) ? { wordRevision: row.edit_revision || 0, artifactState: !row.artifact_id ? 'none' : !row.artifact_deleted_at ? 'stored' : row.artifact_storage_deleted_at ? 'deleted' : 'deletion_pending' } : {}) };
}
async function expire(env, ownerId) {
  await env.DB.prepare("UPDATE jobs SET state = 'interrupted', updated_at = ? WHERE owner_id = ? AND state = 'running' AND lease_expires_at <= ?")
    .bind(new Date().toISOString(), ownerId, Date.now()).run();
}
async function json(request) {
  try { return await request.json(); } catch { return null; }
}
async function previousChat(env, projectId, ownerId, id) {
  if (typeof id !== 'string' || !id) return null;
  return env.DB.prepare("SELECT payload_json, result_json FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ? AND kind = 'tender-chat.send' AND state = 'succeeded'")
    .bind(id, projectId, ownerId).first();
}
async function chatHistory(env, row) {
  const history = [];
  let previousId = JSON.parse(row.payload_json).previousJobId;
  let size = 0;
  while (previousId && history.length < 10) {
    const previous = await previousChat(env, row.project_id, row.owner_id, previousId);
    if (!previous) break;
    const payload = JSON.parse(previous.payload_json);
    const result = JSON.parse(previous.result_json);
    if (typeof payload.question !== 'string' || typeof result?.answer !== 'string') break;
    size += payload.question.length + result.answer.length;
    if (size > 60_000) break;
    history.unshift({ question: payload.question, answer: result.answer });
    previousId = payload.previousJobId;
  }
  return history;
}
export async function clearChatHistory(request, env, userId, projectId) {
  if (request.method !== 'DELETE') return new Response('Method not allowed', { status: 405 });
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, userId).first();
  if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  await expire(env, userId);
  const [, active] = await env.DB.batch([
    env.DB.prepare("DELETE FROM jobs WHERE project_id = ? AND owner_id = ? AND kind = 'tender-chat.send' AND json_extract(payload_json, '$.analysisDiscussion') IS NULL AND json_extract(payload_json, '$.wordAssistance') IS NULL AND NOT EXISTS (SELECT 1 FROM jobs WHERE project_id = ? AND owner_id = ? AND kind = 'tender-chat.send' AND json_extract(payload_json, '$.analysisDiscussion') IS NULL AND json_extract(payload_json, '$.wordAssistance') IS NULL AND state IN ('queued','running'))").bind(projectId, userId, projectId, userId),
    env.DB.prepare("SELECT id FROM jobs WHERE project_id = ? AND owner_id = ? AND kind = 'tender-chat.send' AND json_extract(payload_json, '$.analysisDiscussion') IS NULL AND json_extract(payload_json, '$.wordAssistance') IS NULL AND state IN ('queued','running') LIMIT 1").bind(projectId, userId),
  ]);
  return active.results.length ? Response.json({ error: 'chat_active' }, { status: 409 }) : new Response(null, { status: 204 });
}
export async function handleUserJobs(request, env, userId) {
  const match = /^\/api\/projects\/([^/]+)\/jobs(?:\/([^/]+)\/cancel)?$/.exec(new URL(request.url).pathname);
  if (!match) return null;
  const [, projectId, jobId] = match;
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, userId).first();
  if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  await expire(env, userId);
  if (request.method === 'POST' && !jobId) {
    const input = await json(request);
    if (!input || typeof input.kind !== 'string' || !/^[a-z][a-z0-9.-]{0,79}$/.test(input.kind) || !input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) return Response.json({ error: 'invalid_job' }, { status: 400 });
    if (input.kind === 'secop.import-zip') return Response.json({error:'invalid_job'},{status:400});
    const localKinds = ['proposal-review.apply-suggestions','rejection-check.extract','rejection-check.analyze','blind-check.fix-ai','blind-check.inspect','bid-evaluation.analyze','requirements.suggest','tender-chat.send','technical-plan.analyze','technical-plan.generate-roots','technical-plan.expand-outline','technical-plan.extract-template','technical-plan.generate-facts','technical-plan.generate-section','technical-plan.generate-batch'];
    const localModel = input.credentialId === 'local-runner' && localKinds.includes(input.kind);
    let canonicalPayload = input.payload, sourcesGuard;
    const WORD_DRAFT_PREFIX = 'word-draft:';
    const isReviewFileId = (id, allowDraft = false) => typeof id === 'string' && (/^[A-Za-z0-9_-]{1,128}$/.test(id) || (allowDraft && id.startsWith(WORD_DRAFT_PREFIX) && /^[A-Za-z0-9_-]{1,128}$/.test(id.slice(WORD_DRAFT_PREFIX.length))));
    const hasValidWordDrafts = async draftFileIds => {
      if (!draftFileIds.length) return true;
      const draftJobIds = draftFileIds.map(id => id.slice(WORD_DRAFT_PREFIX.length));
      const placeholders = draftJobIds.map(() => '?').join(',');
      const foundDrafts = await env.DB.prepare(`SELECT COUNT(*) AS count FROM jobs j JOIN job_artifacts a ON a.job_id=j.id WHERE j.project_id=? AND j.owner_id=? AND j.kind='technical-plan.export-word' AND j.state='succeeded' AND COALESCE(json_extract(j.payload_json,'$.bidDocument'),'')!='economic' AND a.deleted_at IS NULL AND j.id IN (${placeholders})`).bind(projectId, userId, ...draftJobIds).first();
      return foundDrafts.count === draftJobIds.length;
    };
    const hasAllReviewSources = async fileIds => {
      const draftFileIds = fileIds.filter(id => id.startsWith(WORD_DRAFT_PREFIX));
      const projectFileIds = fileIds.filter(id => !id.startsWith(WORD_DRAFT_PREFIX));
      if (projectFileIds.length) {
        const placeholders = projectFileIds.map(() => '?').join(',');
        const found = await env.DB.prepare(`SELECT COUNT(*) AS count FROM project_files WHERE project_id=? AND id IN (${placeholders})`).bind(projectId, ...projectFileIds).first();
        if (found.count !== projectFileIds.length) return false;
      }
      return hasValidWordDrafts(draftFileIds);
    };
    if (['rejection-check.extract','rejection-check.analyze'].includes(input.kind)) {
      const {fileIds,language,dataProcessingConsent}=input.payload,isExtract=input.kind==='rejection-check.extract';
      const tenderFileIds=isExtract?fileIds:input.payload.tenderFileIds,bidFileIds=isExtract?[]:input.payload.bidFileIds,options=input.payload.options,criteria=input.payload.criteria??'',customCheckItems=input.payload.customCheckItems??'';
      if(dataProcessingConsent!==true||!['es','en'].includes(language)||typeof input.credentialId!=='string'||!input.credentialId||!Array.isArray(fileIds)||!fileIds.length||fileIds.length>50||fileIds.some(id=>typeof id!=='string'||!id)||!Array.isArray(tenderFileIds)||!Array.isArray(bidFileIds)||(!isExtract&&!bidFileIds.length)||tenderFileIds.length+bidFileIds.length!==fileIds.length||new Set(fileIds).size!==fileIds.length||new Set([...tenderFileIds,...bidFileIds]).size!==fileIds.length||[...tenderFileIds,...bidFileIds].some(id=>!fileIds.includes(id)))return Response.json({error:'invalid_job'},{status:400});
      const draftFileIds=fileIds.filter(id=>id.startsWith(WORD_DRAFT_PREFIX));
      if(draftFileIds.length&&(isExtract||draftFileIds.some(id=>id.length<=WORD_DRAFT_PREFIX.length||!bidFileIds.includes(id)||tenderFileIds.includes(id))))return Response.json({error:'invalid_job'},{status:400});
      if(!isExtract&&(!options||['rejectionCheck','typoCheck','logicCheck'].some(key=>typeof options[key]!=='boolean')||!['rejectionCheck','typoCheck','logicCheck'].some(key=>options[key])||typeof criteria!=='string'||criteria.length>200000||(options.rejectionCheck&&!criteria.trim())||typeof customCheckItems!=='string'||customCheckItems.length>20000))return Response.json({error:'invalid_job'},{status:400});
      if(!await hasAllReviewSources(fileIds))return Response.json({error:'not_found'},{status:404});
      canonicalPayload=isExtract?{mode:'extract',fileIds,tenderFileIds,bidFileIds,language,dataProcessingConsent:true}:{mode:'analyze',fileIds,tenderFileIds,bidFileIds,language,dataProcessingConsent:true,criteria,customCheckItems,options:{rejectionCheck:options.rejectionCheck,typoCheck:options.typoCheck,logicCheck:options.logicCheck}};
    }
    if (['blind-check.fix','blind-check.fix-report','blind-check.fix-ai'].includes(input.kind)) {
      const {inspectionJobId,fixRules,language,tenderFileId}=input.payload, aiFix=input.kind==='blind-check.fix-ai';
      if((aiFix?(typeof input.credentialId!=='string'||!input.credentialId||input.payload.dataProcessingConsent!==true):input.credentialId!=null)||typeof inspectionJobId!=='string'||!inspectionJobId||!['es','en'].includes(language)||!Array.isArray(fixRules)||(!fixRules.length&&!aiFix)||new Set(fixRules).size!==fixRules.length||fixRules.some(rule=>!blindPresets.FIX_RULE_IDS.includes(rule)))return Response.json({error:'invalid_job'},{status:400});
      const inspected=await env.DB.prepare("SELECT j.payload_json FROM jobs j JOIN job_artifacts a ON a.job_id=j.id WHERE j.id=? AND j.project_id=? AND j.owner_id=? AND j.kind='blind-check.inspect' AND j.state='succeeded' AND a.deleted_at IS NULL").bind(inspectionJobId,projectId,userId).first();
      if(!inspected)return Response.json({error:'not_found'},{status:404});
      const previous=JSON.parse(inspected.payload_json),fileId=previous.bidFileId||previous.fileIds?.[0];
      if(!await env.DB.prepare('SELECT id FROM project_files WHERE id=? AND project_id=?').bind(fileId,projectId).first())return Response.json({error:'not_found'},{status:404});
      const profile=previous.preset==='project'?previous.profile:blindPresets.findBuiltinPreset('builtin-general').profile;
      if(!profile)return Response.json({error:'invalid_job'},{status:400});
      if(tenderFileId!==undefined&&(!aiFix||typeof tenderFileId!=='string'||tenderFileId===fileId))return Response.json({error:'invalid_job'},{status:400});
      if(tenderFileId){const tender=await env.DB.prepare('SELECT name FROM project_files WHERE id=? AND project_id=?').bind(tenderFileId,projectId).first();if(!tender)return Response.json({error:'not_found'},{status:404});if(!/\.(txt|md|markdown|docx|pdf)$/i.test(tender.name))return Response.json({error:'invalid_job'},{status:400});}
      canonicalPayload={inspectionJobId,fileIds:[fileId,...(tenderFileId?[tenderFileId]:[])],fixRules,language,profile,sensitiveWords:previous.sensitiveWords||[],...(['blind-check.fix-report','blind-check.fix-ai'].includes(input.kind)?{reportVersion:1}:{}),...(aiFix?{aiRepair:true,dataProcessingConsent:true,...(tenderFileId?{tenderFileId}:{})}:{})};
      sourcesGuard={sql:"EXISTS (SELECT 1 FROM jobs j JOIN job_artifacts a ON a.job_id=j.id WHERE j.id=? AND j.project_id=? AND j.owner_id=? AND j.kind='blind-check.inspect' AND j.state='succeeded' AND a.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM project_files WHERE id=? AND project_id=?)",args:[inspectionJobId,projectId,userId,fileId,projectId]};
      if(tenderFileId){sourcesGuard.sql+=' AND EXISTS (SELECT 1 FROM project_files WHERE id=? AND project_id=?)';sourcesGuard.args.push(tenderFileId,projectId);}
    }
    if (input.kind === 'blind-check.inspect') {
      const { fileIds, language, preset, sensitiveWords, tenderFileId } = input.payload, aiReview=input.payload.aiReview===true;
      const bidFileId=input.payload.bidFileId||(Array.isArray(fileIds)?fileIds[0]:undefined);
      if (!Array.isArray(fileIds) || !fileIds.length || fileIds.length > 2 || !isReviewFileId(bidFileId, true) || (tenderFileId!==undefined && (!isReviewFileId(tenderFileId, false) || tenderFileId===bidFileId || !fileIds.includes(tenderFileId))) || new Set(fileIds).size!==fileIds.length || !fileIds.includes(bidFileId) || fileIds.length !== 1+(tenderFileId?1:0) || (!aiReview && (input.credentialId!=null || tenderFileId)) || (aiReview && (input.payload.dataProcessingConsent!==true || typeof input.credentialId!=='string' || !input.credentialId)) || (input.payload.aiReview!==undefined && typeof input.payload.aiReview!=='boolean') || !['es','en'].includes(language) || !['builtin-general','project'].includes(preset) || (preset==='project' && (!Number.isSafeInteger(input.payload.profileVersion) || input.payload.profileVersion < 0)) || !Array.isArray(sensitiveWords) || sensitiveWords.length > 100 || sensitiveWords.some(word => typeof word !== 'string' || !word.trim() || word.length > 200)) return Response.json({error:'invalid_job'}, {status:400});
      if (bidFileId.startsWith(WORD_DRAFT_PREFIX)) {
        if (!await hasValidWordDrafts([bidFileId])) return Response.json({error:'not_found'}, {status:404});
      } else {
        const file = await env.DB.prepare('SELECT name FROM project_files WHERE id = ? AND project_id = ?').bind(bidFileId,projectId).first();
        if (!file) return Response.json({error:'not_found'}, {status:404});
        if (!/\.docx$/i.test(file.name)) return Response.json({error:'invalid_job'}, {status:400});
      }
      if(tenderFileId){const tender=await env.DB.prepare('SELECT name FROM project_files WHERE id=? AND project_id=?').bind(tenderFileId,projectId).first();if(!tender)return Response.json({error:'not_found'},{status:404});if(!/\.(txt|md|markdown|docx|pdf)$/i.test(tender.name))return Response.json({error:'invalid_job'},{status:400});}
      canonicalPayload = {fileIds,language,preset,sensitiveWords:sensitiveWords.map(word=>word.trim()),...(aiReview?{aiReview:true,bidFileId,dataProcessingConsent:true,...(tenderFileId?{tenderFileId}:{})}:{})};
      if (preset==='project') { const saved=await getBlindProfile(env,projectId); if(saved.version!==input.payload.profileVersion)return Response.json({error:'version_conflict'},{status:409}); canonicalPayload={...canonicalPayload,profileVersion:saved.version,profile:saved.profile}; }
    }
    if(input.kind==='bid-evaluation.analyze'){
      const {fileIds,tenderFileIds,bidFileIds,language,dataProcessingConsent}=input.payload;
      if(dataProcessingConsent!==true||typeof input.credentialId!=='string'||!input.credentialId||!['es','en'].includes(language)||!Array.isArray(fileIds)||!Array.isArray(tenderFileIds)||!Array.isArray(bidFileIds)||!tenderFileIds.length||!bidFileIds.length||fileIds.length>50||tenderFileIds.length+bidFileIds.length!==fileIds.length||new Set(fileIds).size!==fileIds.length||new Set([...tenderFileIds,...bidFileIds]).size!==fileIds.length||tenderFileIds.some(id=>!isReviewFileId(id,false))||bidFileIds.some(id=>!isReviewFileId(id,true))||[...tenderFileIds,...bidFileIds].some(id=>!fileIds.includes(id)))return Response.json({error:'invalid_job'},{status:400});
      if(!await hasAllReviewSources(fileIds))return Response.json({error:'not_found'},{status:404});
      canonicalPayload={fileIds,tenderFileIds,bidFileIds,language,dataProcessingConsent:true};
    }
    if (input.kind === 'duplicate-check.analyze') {
      const {fileIds,tenderFileIds,bidFileIds,language}=input.payload;
      if(input.credentialId!=null||!['es','en'].includes(language)||!Array.isArray(fileIds)||!Array.isArray(tenderFileIds)||!Array.isArray(bidFileIds)||!bidFileIds.length||fileIds.length>50||tenderFileIds.length+bidFileIds.length!==fileIds.length||new Set(fileIds).size!==fileIds.length||new Set([...tenderFileIds,...bidFileIds]).size!==fileIds.length||tenderFileIds.some(id=>!isReviewFileId(id,false))||bidFileIds.some(id=>!isReviewFileId(id,true))||[...tenderFileIds,...bidFileIds].some(id=>!fileIds.includes(id)))return Response.json({error:'invalid_job'},{status:400});
      if(!await hasAllReviewSources(fileIds))return Response.json({error:'not_found'},{status:404});
      canonicalPayload={fileIds,tenderFileIds,bidFileIds,language};
    }
    if (input.kind === 'proposal-review.apply-suggestions') {
      const { proposalId, reviewJobIds, language, dataProcessingConsent } = input.payload;
      if (!['es', 'en'].includes(language) || !isReviewFileId(proposalId, true) || !Array.isArray(reviewJobIds) || !reviewJobIds.length || reviewJobIds.length > 4 || new Set(reviewJobIds).size !== reviewJobIds.length || reviewJobIds.some(id => !isReviewFileId(id, false))) return Response.json({ error: 'invalid_job' }, { status: 400 });
      if (proposalId.startsWith(WORD_DRAFT_PREFIX)) {
        if (!await hasValidWordDrafts([proposalId])) return Response.json({ error: 'not_found' }, { status: 404 });
      } else {
        const file = await env.DB.prepare('SELECT name FROM project_files WHERE id = ? AND project_id = ?').bind(proposalId, projectId).first();
        if (!file) return Response.json({ error: 'not_found' }, { status: 404 });
        if (!/\.docx$/i.test(file.name)) return Response.json({ error: 'invalid_job' }, { status: 400 });
      }
      const reviewPlaceholders = reviewJobIds.map(() => '?').join(',');
      const reviewRows = (await env.DB.prepare(`SELECT j.id, j.kind FROM jobs j JOIN job_artifacts a ON a.job_id = j.id WHERE j.project_id = ? AND j.owner_id = ? AND j.state = 'succeeded' AND a.deleted_at IS NULL AND j.kind IN ('blind-check.inspect','rejection-check.analyze','bid-evaluation.analyze','duplicate-check.analyze') AND j.id IN (${reviewPlaceholders})`).bind(projectId, userId, ...reviewJobIds).all()).results;
      if (reviewRows.length !== reviewJobIds.length) return Response.json({ error: 'not_found' }, { status: 404 });
      if (input.credentialId != null) {
        if (typeof input.credentialId !== 'string' || !input.credentialId || dataProcessingConsent !== true) return Response.json({ error: 'invalid_job' }, { status: 400 });
      } else if (!reviewRows.some(row => row.kind === 'blind-check.inspect')) {
        return Response.json({ error: 'invalid_job' }, { status: 400 });
      }
      canonicalPayload = {
        fileIds: [proposalId, ...reviewJobIds.map(id => `review-artifact:${id}`)],
        proposalId,
        targetExportJobId: proposalId.startsWith(WORD_DRAFT_PREFIX) ? proposalId.slice(WORD_DRAFT_PREFIX.length) : null,
        reviewJobs: reviewRows.map(row => ({ id: row.id, kind: row.kind })),
        language,
        ...(input.credentialId != null ? { dataProcessingConsent: true } : {}),
      };
    }
    if (input.kind === 'requirements.suggest') {
      const { fileIds, language, dataProcessingConsent, includeRup } = input.payload;
      if (dataProcessingConsent !== true || !['es', 'en'].includes(language) || typeof includeRup !== 'boolean' || !Array.isArray(fileIds) || !fileIds.length || fileIds.length > 50 || fileIds.some(id => typeof id !== 'string' || !id) || new Set(fileIds).size !== fileIds.length || typeof input.credentialId !== 'string' || !input.credentialId) return Response.json({ error: 'invalid_job' }, { status: 400 });
      const placeholders = fileIds.map(() => '?').join(',');
      const files = await env.DB.prepare(`SELECT COUNT(*) AS count FROM project_files WHERE project_id = ? AND id IN (${placeholders})`).bind(projectId, ...fileIds).first();
      if (files.count !== fileIds.length) return Response.json({ error: 'not_found' }, { status: 404 });
      const snapshot = await captureRequirementSources(env, userId, projectId, includeRup);
      if (!snapshot) return Response.json({ error: 'invalid_job' }, { status: 400 });
      const { facts, ...sourceSnapshot } = snapshot;
      canonicalPayload = { fileIds, language, dataProcessingConsent: true, includeRup, sourceSnapshot };
      sourcesGuard = sourceGuard(sourceSnapshot, projectId, userId);
    }
    if (input.kind === 'tender-chat.send') {
      const { question, fileIds, language, history } = input.payload;
      if (input.payload.wordAssistance !== undefined && input.payload.wordAssistance !== true) return Response.json({error:'invalid_job'},{status:400});
      if (input.payload.fictionalTest !== undefined && (input.payload.fictionalTest !== true || input.payload.wordAssistance !== true)) return Response.json({error:'invalid_job'},{status:400});
      if (input.payload.dataProcessingConsent !== true || typeof question !== 'string' || !question.trim() || question.length > 10_000 || !Array.isArray(fileIds) || !fileIds.length || fileIds.length > 50 || fileIds.some(id => typeof id !== 'string' || !id) || new Set(fileIds).size !== fileIds.length || (language !== undefined && !['es', 'en'].includes(language)) || history !== undefined || (input.payload.localRunner === true ? input.credentialId != null : typeof input.credentialId !== 'string' || !input.credentialId)) return Response.json({ error: 'invalid_job' }, { status: 400 });
      const placeholders = fileIds.map(() => '?').join(',');
      const files = await env.DB.prepare(`SELECT COUNT(*) AS count FROM project_files WHERE project_id = ? AND id IN (${placeholders})`).bind(projectId, ...fileIds).first();
      if (files.count !== fileIds.length) return Response.json({ error: 'not_found' }, { status: 404 });
      if (input.payload.analysisDiscussion) {
        const d = input.payload.analysisDiscussion;
        if (!analysisCategories.includes(d.category) || !['question','proposal'].includes(d.mode) || !Number.isSafeInteger(d.revision) || d.revision < 0 || typeof d.baseJobId !== 'string') return Response.json({ error:'invalid_job' }, { status:400 });
        const accepted = await env.DB.prepare('SELECT revision, content, job_id, source_snapshot_json FROM project_technical_analyses WHERE project_id = ? AND category = ?').bind(projectId,d.category).first();
        const base = await env.DB.prepare("SELECT result_json, payload_json FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ? AND kind = 'technical-plan.analyze' AND state = 'succeeded'").bind(d.baseJobId,projectId,userId).first();
        if ((accepted?.revision || 0) !== d.revision || (!base && accepted?.job_id !== d.baseJobId)) return Response.json({error:'analysis_conflict'},{status:409});
        const basePayload = base ? JSON.parse(base.payload_json) : {category:d.category,sourceSnapshot:JSON.parse(accepted.source_snapshot_json)}, baseResult = base ? JSON.parse(base.result_json) : {content:accepted.content};
        if (basePayload.category !== d.category || !baseResult.content) return Response.json({error:'analysis_conflict'},{status:409});
        const content = accepted?.job_id === d.baseJobId ? accepted.content : baseResult.content;
        const task = d.mode === 'proposal' ? 'Genera el análisis completo actualizado incorporando la solicitud. Conserva los datos pertinentes y sus fuentes. Distingue la información aportada por el usuario de la verificada en documentos. Devuelve solo el análisis completo.' : 'Responde la pregunta sobre este análisis y sus documentos; no modifiques el análisis.';
        canonicalPayload = {...input.payload, question: `${task}\n\nANÁLISIS:\n${content}\n\nSOLICITUD DEL USUARIO:\n${question}`, analysisDiscussion:{...d, question, sourceSnapshot:basePayload.sourceSnapshot}};
      }
      if (input.payload.previousJobId !== undefined) {
        const previous = await previousChat(env, projectId, userId, input.payload.previousJobId);
        if (!previous) return Response.json({ error: 'invalid_previous_job' }, { status: 400 });
        const previousPayload = JSON.parse(previous.payload_json);
        const previousResult = JSON.parse(previous.result_json);
        if (typeof previousResult?.answer !== 'string' || !Array.isArray(previousPayload.fileIds) || JSON.stringify([...previousPayload.fileIds].sort()) !== JSON.stringify([...fileIds].sort())) return Response.json({ error: 'invalid_previous_job' }, { status: 400 });
        sourcesGuard = { sql: "EXISTS (SELECT 1 FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ? AND kind = 'tender-chat.send' AND state = 'succeeded' AND payload_json = ? AND result_json = ?)", args: [input.payload.previousJobId, projectId, userId, previous.payload_json, previous.result_json] };
      }
    }
    if (input.kind === 'technical-plan.analyze') {
      const { category, fileIds, language, dataProcessingConsent } = input.payload;
      if (!analysisCategories.includes(category) || dataProcessingConsent !== true || !['es', 'en'].includes(language) || !Array.isArray(fileIds) || !fileIds.length || fileIds.length > 50 || fileIds.some(id => typeof id !== 'string' || !id) || new Set(fileIds).size !== fileIds.length || typeof input.credentialId !== 'string' || !input.credentialId) return Response.json({ error: 'invalid_job' }, { status: 400 });
      const placeholders = fileIds.map(() => '?').join(',');
      const files = await env.DB.prepare(`SELECT COUNT(*) AS count FROM project_files WHERE project_id = ? AND id IN (${placeholders})`).bind(projectId, ...fileIds).first();
      if (files.count !== fileIds.length) return Response.json({ error: 'not_found' }, { status: 404 });
      const { facts, ...sourceSnapshot } = await captureRequirementSources(env, userId, projectId, false);
      canonicalPayload = { category, fileIds, language, dataProcessingConsent: true, sourceSnapshot, ...(category === "response-requirements" && input.payload.bidDocumentRules === true ? {bidDocumentRules:true} : {}) };
      sourcesGuard = sourceGuard(sourceSnapshot, projectId, userId);
    }
    if (input.kind === 'technical-plan.generate-roots') {
      const { fileIds, language, dataProcessingConsent, planVersion } = input.payload;
      if (dataProcessingConsent !== true || !['es', 'en'].includes(language) || !Number.isSafeInteger(planVersion) || planVersion < 0 || !Array.isArray(fileIds) || !fileIds.length || fileIds.length > 50 || fileIds.some(id => typeof id !== 'string' || !id) || new Set(fileIds).size !== fileIds.length || typeof input.credentialId !== 'string' || !input.credentialId) return Response.json({ error: 'invalid_job' }, { status: 400 });
      const plan = await env.DB.prepare('SELECT version FROM project_technical_plans WHERE project_id = ?').bind(projectId).first();
      if (!plan || plan.version !== planVersion) return Response.json({ error: 'version_conflict' }, { status: 409 });
      const snapshot = await captureOutlineSources(env, userId, projectId, fileIds, planVersion);
      if (!snapshot) return Response.json({ error: 'analysis_or_sources_conflict' }, { status: 409 });
      canonicalPayload = { fileIds, language, dataProcessingConsent: true, planVersion, outlineSnapshot: snapshot };
      sourcesGuard = outlineGuard(snapshot, projectId, userId);
    }
    if (input.kind === 'technical-plan.expand-outline') {
      const { language, dataProcessingConsent, noTechnicalScore, selectionRevision } = input.payload;
      if (dataProcessingConsent !== true || typeof noTechnicalScore !== 'boolean' || !['es', 'en'].includes(language) || !Number.isSafeInteger(selectionRevision) || selectionRevision < 1 || typeof input.credentialId !== 'string' || !input.credentialId) return Response.json({ error: 'invalid_job' }, { status: 400 });
      const selection = await env.DB.prepare('SELECT * FROM project_outline_root_selections WHERE project_id = ? AND revision = ?').bind(projectId, selectionRevision).first();
      if (!selection) return Response.json({ error: 'selection_conflict' }, { status: 409 });
      const snapshot = JSON.parse(selection.snapshot_json);
      if (!await outlineSnapshotCurrent(env, userId, projectId, snapshot)) return Response.json({ error: 'analysis_or_sources_conflict' }, { status: 409 });
      canonicalPayload = { language, dataProcessingConsent: true, noTechnicalScore, selectionRevision, selectionJobId: selection.job_id, outlineSnapshot: snapshot, planVersion: snapshot.planVersion };
      sourcesGuard = expandedOutlineGuard(snapshot, projectId, userId, selectionRevision, selection.job_id);
    }
    if (input.kind === 'technical-plan.extract-template') {
      const { fileIds, language, dataProcessingConsent, planVersion } = input.payload;
      if (dataProcessingConsent !== true || !['es', 'en'].includes(language) || !Number.isSafeInteger(planVersion) || planVersion < 0 || !Array.isArray(fileIds) || !fileIds.length || fileIds.length > 50 || fileIds.some(id => typeof id !== 'string' || !id) || new Set(fileIds).size !== fileIds.length || typeof input.credentialId !== 'string' || !input.credentialId) return Response.json({ error: 'invalid_job' }, { status: 400 });
      const plan = await env.DB.prepare('SELECT version FROM project_technical_plans WHERE project_id = ?').bind(projectId).first();
      if (!plan || plan.version !== planVersion) return Response.json({ error: 'version_conflict' }, { status: 409 });
      const nodes = await env.DB.prepare("SELECT COUNT(*) AS count FROM project_technical_plan_nodes n WHERE n.project_id = ? AND n.parent_node_id IS NULL AND n.content_mode = 'template-fill' AND NOT EXISTS (SELECT 1 FROM project_technical_plan_nodes c WHERE c.project_id = n.project_id AND c.parent_node_id = n.node_id)").bind(projectId).first();
      if (!nodes.count) return Response.json({ error: 'no_template_chapters' }, { status: 400 });
      const placeholders = fileIds.map(() => '?').join(',');
      const files = await env.DB.prepare(`SELECT COUNT(*) AS count FROM project_files WHERE project_id = ? AND id IN (${placeholders}) AND LOWER(name) LIKE '%.docx'`).bind(projectId, ...fileIds).first();
      if (files.count !== fileIds.length) return Response.json({ error: 'invalid_sources' }, { status: 400 });
      const { facts, ...sourceSnapshot } = await captureRequirementSources(env, userId, projectId, false);
      const chapters = await chapterFingerprint(env, projectId);
      canonicalPayload = { fileIds, language, dataProcessingConsent: true, planVersion, sourceSnapshot, chapterFingerprint: chapters };
      const guard = sourceGuard(sourceSnapshot, projectId, userId);
      sourcesGuard = { sql: `${guard.sql} AND EXISTS (SELECT 1 FROM project_technical_plans WHERE project_id = ? AND version = ?)`, args: [...guard.args, projectId, planVersion] };
    }
    if (input.kind === 'technical-plan.generate-facts') {
      const { fileIds, language, dataProcessingConsent, planVersion, mode, includeRup = false, rupConsent, rupConsentSnapshot, knowledgeSelections = [], knowledgeConsent } = input.payload;
      if (dataProcessingConsent !== true || typeof includeRup !== 'boolean' || (includeRup && rupConsent !== true) || !['es', 'en'].includes(language) || !['placeholder', 'omit', 'fabricate'].includes(mode) || !Number.isSafeInteger(planVersion) || planVersion < 0 || !Array.isArray(fileIds) || !fileIds.length || fileIds.length > 50 || fileIds.some(id => typeof id !== 'string' || !id) || new Set(fileIds).size !== fileIds.length || typeof input.credentialId !== 'string' || !input.credentialId) return Response.json({ error: 'invalid_job' }, { status: 400 });
      const plan = await env.DB.prepare('SELECT version FROM project_technical_plans WHERE project_id = ?').bind(projectId).first();
      if (!plan || plan.version !== planVersion) return Response.json({ error: 'version_conflict' }, { status: 409 });
      const nodes = await env.DB.prepare('SELECT node_id FROM project_technical_plan_nodes WHERE project_id = ? LIMIT 1').bind(projectId).first();
      if (!nodes) return Response.json({ error: 'invalid_job' }, { status: 400 });
      const placeholders = fileIds.map(() => '?').join(',');
      const files = await env.DB.prepare(`SELECT COUNT(*) AS count FROM project_files WHERE project_id = ? AND id IN (${placeholders})`).bind(projectId, ...fileIds).first();
      if (files.count !== fileIds.length) return Response.json({ error: 'not_found' }, { status: 404 });
      if (!Array.isArray(knowledgeSelections) || knowledgeSelections.length > 30 || knowledgeSelections.some(item => !item || typeof item.id !== 'string' || !item.id || item.id.length > 128 || !Number.isSafeInteger(item.revision) || item.revision < 1) || new Set(knowledgeSelections.map(item => item.id)).size !== knowledgeSelections.length || (knowledgeSelections.length && knowledgeConsent !== true)) return Response.json({ error: 'invalid_knowledge_selection' }, { status: 400 });
      const knowledgeIds = knowledgeSelections.map(item => item.id).sort();
      const factsSnapshot = await captureGlobalFactSources(env, userId, projectId, includeRup, knowledgeIds);
      if (knowledgeIds.length && factsSnapshot?.knowledgeFingerprint !== selectionFingerprint(knowledgeSelections)) return Response.json({ error: 'knowledge_changed' }, { status: 409 });
      if (knowledgeIds.length && JSON.stringify(await readKnowledgeSources(env, userId, knowledgeIds)).length > 250000) return Response.json({ error: 'knowledge_too_large' }, { status: 413 });
      if (!factsSnapshot) return Response.json({ error: 'missing_rup' }, { status: 400 });
      if (includeRup) {
        if (!rupConsentSnapshot || typeof rupConsentSnapshot.certificateId !== 'string' || !Number.isSafeInteger(rupConsentSnapshot.certificateVersion) || typeof rupConsentSnapshot.factsFingerprint !== 'string') return Response.json({ error: 'rup_consent_snapshot_required' }, { status: 400 });
        const source = factsSnapshot.sources;
        if (rupConsentSnapshot.certificateId !== source.rupCertificateId || rupConsentSnapshot.certificateVersion !== source.rupCertificateVersion || rupConsentSnapshot.factsFingerprint !== source.rupFactsFingerprint) return Response.json({ error: 'rup_changed' }, { status: 409 });
      }
      const guard = globalFactGuard(factsSnapshot, projectId, userId);
      canonicalPayload = { fileIds, language, dataProcessingConsent: true, planVersion, mode, ...(includeRup ? { includeRup: true, rupConsent: true } : {}), ...(knowledgeIds.length ? { knowledgeConsent: true } : {}), factsSnapshot };
      sourcesGuard = { sql: `${guard.sql} AND EXISTS (SELECT 1 FROM project_technical_plans WHERE project_id = ? AND version = ?)`, args: [...guard.args, projectId, planVersion] };
    }
    if (['technical-plan.generate-section', 'technical-plan.generate-batch'].includes(input.kind)) {
      const batch = input.kind === 'technical-plan.generate-batch';
      const { nodeId, planVersion, fileIds, language, instructions, dataProcessingConsent, knowledgeSelections = [], knowledgeConsent, includeKnowledgeDocuments = false, knowledgeDocumentConsent, allowPendingFacts = false } = input.payload;
      if ((!batch && (typeof nodeId !== 'string' || !nodeId)) || (batch && (!['all', 'missing'].includes(input.payload.mode) || (input.payload.planning !== undefined && typeof input.payload.planning !== 'boolean'))) || typeof allowPendingFacts !== 'boolean' || !Number.isSafeInteger(planVersion) || planVersion < 0 || dataProcessingConsent !== true || !Array.isArray(fileIds) || !fileIds.length || fileIds.length > 50 || fileIds.some(id => typeof id !== 'string' || !id) || new Set(fileIds).size !== fileIds.length || (language !== undefined && !['es', 'en'].includes(language)) || (instructions !== undefined && (typeof instructions !== 'string' || instructions.length > 2000)) || typeof input.credentialId !== 'string' || !input.credentialId) return Response.json({ error: 'invalid_job' }, { status: 400 });
      let planningOptions; if(batch && input.payload.planningOptions !== undefined) { if(input.payload.planning !== true) return Response.json({error:'invalid_job'},{status:400}); try { planningOptions=validateTechnicalPlanningOptions(input.payload.planningOptions); } catch { return Response.json({error:'invalid_job'},{status:400}); } }
      if(batch&&((input.payload.wordAdjustment!==undefined&&typeof input.payload.wordAdjustment!=='boolean')||(input.payload.wordAdjustment===true&&(input.payload.wordAdjustmentConsent!==true||input.payload.planning!==true||!planningOptions||!(planningOptions.minimumWords||planningOptions.maximumWords)))))return Response.json({error:'invalid_job'},{status:400});
      if(batch&&((input.payload.consistency!==undefined&&typeof input.payload.consistency!=='boolean')||(input.payload.consistency===true&&input.payload.consistencyConsent!==true)))return Response.json({error:'invalid_job'},{status:400});
      if(batch&&((input.payload.consistencyLedger!==undefined&&typeof input.payload.consistencyLedger!=='boolean')||(input.payload.consistencyLedger===true&&(input.payload.consistency!==true||input.payload.ledgerConsent!==true))))return Response.json({error:'invalid_job'},{status:400});
      const plan = await env.DB.prepare('SELECT version FROM project_technical_plans WHERE project_id = ?').bind(projectId).first();
      if (!plan || plan.version !== planVersion) return Response.json({ error: 'version_conflict' }, { status: 409 });
      const technicalOnly = batch && input.payload.technicalOnly === true;
      let targets;
      if (batch) { const rows = await env.DB.prepare("WITH RECURSIVE tree(node_id,project_id,content,sort_path) AS (SELECT node_id,project_id,content,printf('%010d:%s',sort_order,node_id) FROM project_technical_plan_nodes WHERE project_id=? AND parent_node_id IS NULL AND (?=0 OR attr='技术') UNION ALL SELECT n.node_id,n.project_id,n.content,tree.sort_path||'/'||printf('%010d:%s',n.sort_order,n.node_id) FROM project_technical_plan_nodes n JOIN tree ON n.project_id=tree.project_id AND n.parent_node_id=tree.node_id) SELECT tree.node_id FROM tree WHERE NOT EXISTS (SELECT 1 FROM project_technical_plan_nodes c WHERE c.project_id=tree.project_id AND c.parent_node_id=tree.node_id) AND (?='all' OR length(trim(tree.content))=0) ORDER BY tree.sort_path").bind(projectId,Number(technicalOnly),input.payload.mode).all(); targets=rows.results.map(row=>row.node_id); if (!targets.length || targets.length>500) return Response.json({error:'invalid_node'}, {status:400}); }
      else { const node = await env.DB.prepare('SELECT node_id FROM project_technical_plan_nodes WHERE project_id = ? AND node_id = ? AND NOT EXISTS (SELECT 1 FROM project_technical_plan_nodes c WHERE c.project_id = ? AND c.parent_node_id = ?)').bind(projectId, nodeId, projectId, nodeId).first(); if (!node) return Response.json({ error: 'invalid_node' }, { status: 400 }); }
      let totalSections,existingWords; if (batch && planningOptions && (planningOptions.minimumWords || planningOptions.maximumWords)) { const count=await env.DB.prepare('SELECT COUNT(*) AS count FROM project_technical_plan_nodes n WHERE n.project_id=? AND NOT EXISTS (SELECT 1 FROM project_technical_plan_nodes c WHERE c.project_id=n.project_id AND c.parent_node_id=n.node_id)').bind(projectId).first(); totalSections=count.count; if(input.payload.mode==='missing'){existingWords=0;let after='';while(true){const page=await env.DB.prepare("SELECT n.node_id,n.content FROM project_technical_plan_nodes n WHERE n.project_id=? AND n.node_id>? AND length(trim(n.content))>0 AND NOT EXISTS (SELECT 1 FROM project_technical_plan_nodes c WHERE c.project_id=n.project_id AND c.parent_node_id=n.node_id) ORDER BY n.node_id LIMIT 10").bind(projectId,after).all();for(const row of page.results)existingWords+=wordCount.countReadableWords(row.content);if(page.results.length<10)break;after=page.results.at(-1).node_id;}} const min=planningOptions.minimumWords||0,max=planningOptions.maximumWords||0,total=min&&max?Math.round((min+max)/2):Math.round(min?min*1.2:max*.8),budget=existingWords===undefined?Math.round(total*targets.length/totalSections):Math.max(targets.length,total-existingWords); if(existingWords!==undefined&&max&&budget>max-existingWords) return Response.json({error:'word_budget_exhausted'},{status:400}); if(budget<targets.length||budget>100000) return Response.json({error:'invalid_job'},{status:400}); }
      const placeholders = fileIds.map(() => '?').join(',');
      const files = await env.DB.prepare(`SELECT COUNT(*) AS count FROM project_files WHERE project_id = ? AND id IN (${placeholders})`).bind(projectId, ...fileIds).first();
      if (files.count !== fileIds.length) return Response.json({ error: 'not_found' }, { status: 404 });
      if (!validKnowledgeSelections(knowledgeSelections, knowledgeConsent)) return Response.json({ error: 'invalid_knowledge_selection' }, { status: 400 });
      if (typeof includeKnowledgeDocuments !== 'boolean' || (includeKnowledgeDocuments && (!knowledgeSelections.length || knowledgeDocumentConsent !== true))) return Response.json({ error: 'invalid_knowledge_document_consent' }, { status: 400 });
      const knowledgeIds = knowledgeSelections.map(item => item.id).sort();
      const knowledgeRows = knowledgeIds.length ? await readKnowledgeSources(env, userId, knowledgeIds) : [];
      const knowledgeSnapshot = knowledgeIds.length ? { ids: knowledgeIds, fingerprint: JSON.stringify(knowledgeRows.map(({ id, revision }) => [id, revision])) } : null;
      if (knowledgeSnapshot && knowledgeSnapshot.fingerprint !== selectionFingerprint(knowledgeSelections)) return Response.json({ error: 'knowledge_changed' }, { status: 409 });
      if (JSON.stringify(knowledgeRows).length > 250000) return Response.json({ error: 'knowledge_too_large' }, { status: 413 });
      const facts = await env.DB.prepare('SELECT revision, snapshot_json, groups_json FROM project_global_facts WHERE project_id = ?').bind(projectId).first();
      if (facts && !allowPendingFacts && pendingMarkers.hasPendingMarkers(facts.groups_json)) return Response.json({ error: 'facts_pending_replacements' }, { status: 409 });
      const factsSnapshot = facts ? JSON.parse(facts.snapshot_json) : await captureGlobalFactSources(env, userId, projectId);
      if (!await globalFactSourcesCurrent(env, userId, projectId, factsSnapshot)) return Response.json({ error: 'facts_or_sources_conflict' }, { status: 409 });
      if (facts && factsSnapshot.sources.includeRup === true && input.payload.rupConsent !== true) return Response.json({ error: 'rup_consent_required' }, { status: 400 });
      const factsRevision = facts?.revision || 0, guard = globalFactGuard(factsSnapshot, projectId, userId), knowledgeGuard = knowledgeSnapshotGuard(knowledgeSnapshot, userId);
      canonicalPayload = { ...(batch ? { mode: input.payload.mode, targets, ...(technicalOnly ? {technicalOnly:true} : {}), ...(input.payload.planning === true ? {planning:true} : {}), ...(input.payload.wordAdjustment === true ? {wordAdjustment:true,wordAdjustmentConsent:true} : {}), ...(input.payload.consistency === true ? {consistency:true,consistencyConsent:true} : {}), ...(input.payload.consistencyLedger === true ? {consistencyLedger:true,ledgerConsent:true} : {}), ...(planningOptions ? {planningOptions} : {}), ...(totalSections ? {totalSections} : {}), ...(existingWords !== undefined ? {existingWords} : {}) } : { nodeId }), planVersion, fileIds, ...(language !== undefined ? { language } : {}), ...(instructions !== undefined ? { instructions } : {}), dataProcessingConsent: true, ...(allowPendingFacts ? { allowPendingFacts: true } : {}), ...(facts && factsSnapshot.sources.includeRup === true ? { rupConsent: true } : {}), ...(knowledgeSnapshot ? { knowledgeConsent: true, knowledgeSnapshot } : {}), ...(includeKnowledgeDocuments ? { includeKnowledgeDocuments: true, knowledgeDocumentConsent: true } : {}), factsRevision, factsSnapshot };
      sourcesGuard = { sql: `${guard.sql} AND ${knowledgeGuard.sql} AND EXISTS (SELECT 1 FROM project_technical_plans WHERE project_id = ? AND version = ?) AND COALESCE((SELECT revision FROM project_global_facts WHERE project_id = ?), 0) = ?`, args: [...guard.args, ...knowledgeGuard.args, projectId, planVersion, projectId, factsRevision] };
      if (batch) sourcesGuard = {sql: `${sourcesGuard.sql} AND NOT EXISTS (SELECT 1 FROM jobs active WHERE active.owner_id=? AND active.project_id=? AND active.kind='technical-plan.generate-batch' AND active.state IN ('queued','running') AND json_extract(active.payload_json,'$.planVersion')=?)`,args:[...sourcesGuard.args,userId,projectId,planVersion]};
    }
    if (input.kind === 'technical-plan.export-word') {
      const {planVersion,language,bidDocument,pageLimit,format,economicAnnex,fileIds} = input.payload;
      if (bidDocument!==undefined && !['technical','economic'].includes(bidDocument)) return Response.json({error:'invalid_job'},{status:400});
      if (bidDocument==='technical') {
        if (pageLimit!==undefined && (!Number.isSafeInteger(pageLimit) || pageLimit<1 || pageLimit>500) || format!==undefined && !validTechnicalFormat(format)) return Response.json({error:'invalid_job'},{status:400});
        canonicalPayload={planVersion,language,bidDocument,...(pageLimit ? {pageLimit} : {}),...(format ? {format} : {})};
      }
      if (bidDocument==='economic') {
        if (!Number.isSafeInteger(economicAnnex) || economicAnnex<1 || economicAnnex>999 || !Array.isArray(fileIds) || !fileIds.length || fileIds.length>50 || new Set(fileIds).size!==fileIds.length || fileIds.some(id=>typeof id!=='string'||!id)) return Response.json({error:'invalid_job'},{status:400});
        const files=await env.DB.prepare('SELECT COUNT(*) AS count FROM project_files WHERE project_id=? AND id IN (SELECT value FROM json_each(?))').bind(projectId,JSON.stringify(fileIds)).first();
        if (files.count!==fileIds.length) return Response.json({error:'not_found'},{status:404});
        canonicalPayload={planVersion,language,bidDocument,economicAnnex,fileIds};
      }
      if (bidDocument && (input.payload.templateJobId!==undefined || (bidDocument==='economic' && input.payload.draftBatchId!==undefined))) return Response.json({error:'invalid_job'},{status:400});
      if (!Number.isSafeInteger(planVersion) || planVersion < 0 || !['es', 'en'].includes(language) || input.credentialId != null) return Response.json({ error: 'invalid_job' }, { status: 400 });
      if (input.payload.exportFormat !== undefined && (!input.payload.exportFormat || typeof input.payload.exportFormat !== 'object' || Array.isArray(input.payload.exportFormat) || JSON.stringify(input.payload.exportFormat).length > 100000)) return Response.json({ error: 'invalid_job' }, { status: 400 });
      if (input.payload.exportFormat !== undefined) canonicalPayload = { ...canonicalPayload, exportFormat: exportDefaults.normalizeExportFormat(input.payload.exportFormat) };
      const plan = await env.DB.prepare('SELECT version FROM project_technical_plans WHERE project_id = ?').bind(projectId).first();
      if (!plan || plan.version !== planVersion) return Response.json({ error: 'version_conflict' }, { status: 409 });
      const node = await env.DB.prepare('SELECT node_id FROM project_technical_plan_nodes WHERE project_id = ? LIMIT 1').bind(projectId).first();
      if (!node) return Response.json({ error: 'invalid_job' }, { status: 400 });
      if (input.payload.templateJobId !== undefined) {
        if (typeof input.payload.templateJobId !== 'string' || !input.payload.templateJobId) return Response.json({ error: 'invalid_job' }, { status: 400 });
        const selected = await env.DB.prepare('SELECT * FROM project_selected_templates WHERE project_id = ? AND job_id = ?').bind(projectId, input.payload.templateJobId).first();
        if (!selected) return Response.json({ error: 'template_conflict' }, { status: 409 });
        const values = await env.DB.prepare('SELECT revision FROM project_template_values WHERE project_id = ? AND job_id = ?').bind(projectId, selected.job_id).first();
        const valuesRevision = values?.revision || 0, snapshot = JSON.parse(selected.source_snapshot_json), guard = templateValuesGuard(snapshot, selected.chapter_fingerprint, projectId, userId, selected.job_id, selected.revision, valuesRevision);
        if (!await env.DB.prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.args).first()) return Response.json({ error: 'template_conflict' }, { status: 409 });
        canonicalPayload = { planVersion, language, ...(canonicalPayload.exportFormat ? { exportFormat: canonicalPayload.exportFormat } : {}), templateJobId: selected.job_id, templateRevision: selected.revision, templateValuesRevision: valuesRevision, templateSourceSnapshot: snapshot, templateFingerprint: selected.chapter_fingerprint };
        sourcesGuard = { sql: `${guard.sql} AND EXISTS (SELECT 1 FROM project_technical_plans WHERE project_id = ? AND version = ?)`, args: [...guard.args, projectId, planVersion] };
      } else if (bidDocument) {
        sourcesGuard = {sql:'EXISTS (SELECT 1 FROM project_technical_plans WHERE project_id = ? AND version = ?)',args:[projectId,planVersion]};
      } else {
        if (await env.DB.prepare('SELECT 1 AS found FROM project_selected_templates WHERE project_id = ?').bind(projectId).first()) return Response.json({ error: 'template_selection_required' }, { status: 409 });
        sourcesGuard = { sql: 'NOT EXISTS (SELECT 1 FROM project_selected_templates WHERE project_id = ?) AND EXISTS (SELECT 1 FROM project_technical_plans WHERE project_id = ? AND version = ?)', args: [projectId, projectId, planVersion] };
      }
      if(input.payload.draftBatchId!==undefined){
        const preview=await loadBatchWordPreview(env,userId,projectId,input.payload.draftBatchId,planVersion);
        if(!preview)return Response.json({error:'draft_preview_unavailable'},{status:409});
        canonicalPayload={...canonicalPayload,draftBatchId:input.payload.draftBatchId,draftBatchFingerprint:preview.fingerprint,draftBatchCount:preview.drafts.length};
      }else{const {draftBatchFingerprint,draftBatchCount,...clean}=canonicalPayload;canonicalPayload=clean;}
      const assetFingerprint = await planAssetFingerprint(env, projectId);
      canonicalPayload = { ...canonicalPayload, assetFingerprint };
      sourcesGuard = { sql: `${sourcesGuard.sql} AND (${planAssetFingerprintSql}) = ?`, args: [...sourcesGuard.args, projectId, assetFingerprint] };
    }
    const requestId = request.headers.get('idempotency-key') || '';
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) return Response.json({ error: 'invalid_idempotency_key' }, { status: 400 });
    const credentialId = localModel ? null : input.credentialId ?? null;
    if (localModel) canonicalPayload = {...canonicalPayload,localRunner:true};
    if (credentialId !== null) {
      if (typeof credentialId !== 'string') return Response.json({ error: 'invalid_credential' }, { status: 400 });
      const credential = await env.DB.prepare('SELECT id FROM provider_credentials WHERE id = ? AND owner_id = ? AND revoked_at IS NULL').bind(credentialId, userId).first();
      if (!credential) return Response.json({ error: 'not_found' }, { status: 404 });
    }
    const payload = JSON.stringify(canonicalPayload);
    if (payload.length > (['technical-plan.export-word','rejection-check.analyze','tender-chat.send'].includes(input.kind) ? 256_000 : 100_000)) return Response.json({ error: 'payload_too_large' }, { status: 413 });
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const inserted = sourcesGuard
      ? await env.DB.prepare(`INSERT INTO jobs (id, project_id, owner_id, kind, client_request_id, payload_json, state, created_at, updated_at, credential_id, export_format_json) SELECT ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, CASE WHEN ?='technical-plan.export-word' THEN COALESCE(?, (SELECT format_json FROM export_format_settings WHERE owner_id=?)) ELSE NULL END WHERE ${sourcesGuard.sql} AND (? != 'requirements.suggest' OR NOT EXISTS (SELECT 1 FROM jobs WHERE project_id = ? AND owner_id = ? AND kind = 'requirements.suggest' AND state IN ('queued', 'running'))) ON CONFLICT (owner_id, project_id, client_request_id) DO NOTHING RETURNING *`).bind(id, projectId, userId, input.kind, requestId, payload, now, now, credentialId, input.kind, canonicalPayload.exportFormat ? JSON.stringify(canonicalPayload.exportFormat) : null, userId, ...sourcesGuard.args, input.kind, projectId, userId).first()
      : await env.DB.prepare("INSERT INTO jobs (id, project_id, owner_id, kind, client_request_id, payload_json, state, created_at, updated_at, credential_id) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?) ON CONFLICT (owner_id, project_id, client_request_id) DO NOTHING RETURNING *").bind(id, projectId, userId, input.kind, requestId, payload, now, now, credentialId).first();
    if (inserted) return Response.json({ job: view(inserted) }, { status: 201 });
    const existing = await env.DB.prepare('SELECT * FROM jobs WHERE owner_id = ? AND project_id = ? AND client_request_id = ?').bind(userId, projectId, requestId).first();
    const legacyPreviewPayload = input.kind==='technical-plan.export-word' && canonicalPayload.draftBatchCount!==undefined
      ? JSON.stringify({...canonicalPayload,draftBatchCount:undefined})
      : undefined;
    if (!existing || existing.kind !== input.kind || (existing.payload_json !== payload && existing.payload_json !== legacyPreviewPayload) || existing.credential_id !== credentialId) return Response.json({ error: 'idempotency_conflict' }, { status: 409 });
    return Response.json({ job: view(existing) });
  }
  if (request.method === 'GET' && !jobId) {
    const result = await env.DB.prepare('SELECT j.*, p.version AS current_plan_version, a.edit_revision, a.id AS artifact_id, a.deleted_at AS artifact_deleted_at, a.storage_deleted_at AS artifact_storage_deleted_at, (SELECT COUNT(*) FROM technical_batch_drafts d WHERE d.job_id=j.id AND d.owner_id=j.owner_id) AS batch_draft_count, (SELECT applied_version FROM technical_batch_applications b WHERE b.job_id=j.id AND b.owner_id=j.owner_id) AS batch_applied_version FROM jobs j LEFT JOIN job_artifacts a ON a.job_id = j.id LEFT JOIN project_technical_plans p ON p.project_id=j.project_id WHERE j.owner_id = ? AND j.project_id = ? ORDER BY j.created_at DESC, j.id').bind(userId, projectId).all();
    const drafts = new Map(result.results.filter(row=>row.kind==='technical-plan.generate-batch').map(row=>[row.id,view(row)]));
    const legacyPreviews = new Map();
    const jobs = await Promise.all(result.results.map(async row => {
      const job = view(row);
      if (['technical-plan.generate-section','technical-plan.generate-batch'].includes(job.kind) && job.payload.knowledgeSnapshot?.ids?.length) {
        return {...job,sourcesStale:!await knowledgeSnapshotCurrent(env,userId,job.payload.knowledgeSnapshot)};
      }
      if (job.kind!=='technical-plan.export-word' || job.state!=='succeeded' || job.artifactState!=='stored' || !job.wordRevision || !job.payload.draftBatchId) return job;
      const {draftBatchId,draftBatchCount,draftBatchFingerprint,planVersion} = job.payload;
      const batch = drafts.get(draftBatchId);
      if (!batch || row.current_plan_version!==planVersion || batch.payload.planVersion!==planVersion || ['queued','running'].includes(batch.state)) return {...job,sourcesStale:true};
      // Drafts are immutable and appended until the batch is complete.
      if (Number.isInteger(draftBatchCount)) return {...job,sourcesStale:batch.draftCount!==draftBatchCount};
      if (!legacyPreviews.has(draftBatchId)) legacyPreviews.set(draftBatchId,loadBatchWordPreview(env,userId,projectId,draftBatchId,planVersion));
      const snapshot = await legacyPreviews.get(draftBatchId);
      return {...job,sourcesStale:!snapshot||snapshot.fingerprint!==draftBatchFingerprint};
    }));
    return Response.json({ jobs });
  }
  if (request.method === 'POST' && jobId) {
    const row = await env.DB.prepare("UPDATE jobs SET state = 'cancelled', updated_at = ? WHERE id = ? AND project_id = ? AND owner_id = ? AND state IN ('queued','running') RETURNING id")
      .bind(new Date().toISOString(), jobId, projectId, userId).first();
    return row ? Response.json({ ok: true }) : Response.json({ error: 'not_found' }, { status: 404 });
  }
  return new Response('Method not allowed', { status: 405 });
}

export async function handleAgentJobs(request, env, runner) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const input = await json(request);
  if (!input) return Response.json({ error: 'invalid_json' }, { status: 400 });
  await expire(env, runner.ownerId);
  if (path === '/api/runner/jobs/claim') {
    if (!Array.isArray(input.kinds) || input.kinds.length > 50 || input.kinds.some(kind => typeof kind !== 'string' || !/^[a-z][a-z0-9.-]{0,79}$/.test(kind))) return Response.json({ error: 'invalid_kinds' }, { status: 400 });
    await env.DB.prepare('UPDATE runners SET supports_concurrency=? WHERE id=? AND owner_id=?').bind(input.supportsConcurrency===true?1:0,runner.id,runner.ownerId).run();
    const lease = token();
    const now = Date.now();
    const selectedLocalModel = (await env.DB.prepare('SELECT model FROM local_model_selection WHERE owner_id=? AND active=1').bind(runner.ownerId).first())?.model || null;
    const localReady = input.localModel===true && (!selectedLocalModel || input.localModelSelection===true);
    const bidDocumentsReady = input.supportsBidDocuments === true ? 1 : 0;
    const requiresBidDocuments = "COALESCE(json_extract(payload_json,'$.bidDocumentRules'),0)=1 OR COALESCE(json_extract(payload_json,'$.technicalOnly'),0)=1 OR json_extract(payload_json,'$.bidDocument') IS NOT NULL";
    if (input.kinds.some(kind => ['word-format.preview', 'opportunity.analyze', 'rup.analyze', 'knowledge.analyze', 'company-dossier.extract', 'feasibility.export-word', 'feasibility.extract-sources', 'feasibility.analyze', 'feasibility.generate-outline', 'feasibility.generate-parameters', 'feasibility.generate-content'].includes(kind))) {
      await expireAccountJobs(env, runner.ownerId);
      const account = await env.DB.prepare(`UPDATE account_jobs SET state = 'running', runner_id = ?, lease_hash = ?, lease_expires_at = ?, updated_at = ?
        WHERE id = (SELECT a.id FROM account_jobs a WHERE a.owner_id = ? AND a.state = 'queued' AND a.kind IN (SELECT value FROM json_each(?))
          AND ((a.kind!='opportunity.analyze' OR a.credential_id IS NOT NULL) AND COALESCE(json_extract(a.payload_json,'$.localRunner'),0)!=1 OR ?=1)
          AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.owner_id = a.owner_id AND j.state = 'queued' AND j.kind IN (SELECT value FROM json_each(?)) AND (COALESCE(json_extract(j.payload_json,'$.localRunner'),0)!=1 OR ?=1) AND (?=1 OR NOT (${requiresBidDocuments.replaceAll('payload_json','j.payload_json')})) AND (j.created_at < a.created_at OR (j.created_at = a.created_at AND j.id < a.id)))
          ORDER BY a.created_at, a.id LIMIT 1) AND state = 'queued' RETURNING *`)
        .bind(runner.id, await digest(lease), now + leaseDurationMs, new Date(now).toISOString(), runner.ownerId, JSON.stringify(input.kinds), localReady?1:0, JSON.stringify(input.kinds), localReady?1:0, bidDocumentsReady).first();
      if (account) return Response.json({ job: accountView(account), lease, leaseDurationMs, localModel: selectedLocalModel });
    }
    const row = await env.DB.prepare(`UPDATE jobs SET state = 'running', runner_id = ?, lease_hash = ?, lease_expires_at = ?, updated_at = ? WHERE id = (SELECT id FROM jobs WHERE owner_id = ? AND state = 'queued' AND kind IN (SELECT value FROM json_each(?)) AND (COALESCE(json_extract(payload_json,'$.localRunner'),0)!=1 OR ?=1) AND (?=1 OR NOT (${requiresBidDocuments})) ORDER BY created_at, id LIMIT 1) AND state = 'queued' RETURNING *`)
      .bind(runner.id, await digest(lease), now + leaseDurationMs, new Date(now).toISOString(), runner.ownerId, JSON.stringify(input.kinds),localReady?1:0,bidDocumentsReady).first();
    if (!row) {
      const preference = await env.DB.prepare('SELECT interval_seconds FROM runner_poll_preferences WHERE owner_id=?').bind(runner.ownerId).first();
      const pollAfterMs = (preference?.interval_seconds ?? 10) * 1000;
      if (!input.kinds.some(kind => ['word-format.preview', 'opportunity.analyze', 'rup.analyze', 'knowledge.analyze', 'company-dossier.extract', 'feasibility.export-word', 'feasibility.extract-sources', 'feasibility.analyze', 'feasibility.generate-outline', 'feasibility.generate-parameters', 'feasibility.generate-content'].includes(kind))) return Response.json({ job: null, pollAfterMs });
      const account = await env.DB.prepare("UPDATE account_jobs SET state = 'running', runner_id = ?, lease_hash = ?, lease_expires_at = ?, updated_at = ? WHERE id = (SELECT id FROM account_jobs WHERE owner_id = ? AND state = 'queued' AND kind IN (SELECT value FROM json_each(?)) AND ((kind!='opportunity.analyze' OR credential_id IS NOT NULL) AND COALESCE(json_extract(payload_json,'$.localRunner'),0)!=1 OR ?=1) ORDER BY created_at, id LIMIT 1) AND state = 'queued' RETURNING *").bind(runner.id, await digest(lease), now + leaseDurationMs, new Date(now).toISOString(), runner.ownerId, JSON.stringify(input.kinds), localReady?1:0).first();
      return account ? Response.json({ job: accountView(account), lease, leaseDurationMs, localModel: selectedLocalModel }) : Response.json({ job: null, pollAfterMs });
    }
    const job = view(row);
    if (job.kind === 'tender-chat.send') job.payload.history = await chatHistory(env, row);
    return Response.json({ job, lease, leaseDurationMs, localModel: selectedLocalModel });
  }
  const match = /^\/api\/runner\/jobs\/([^/]+)\/(renew|complete)$/.exec(path);
  if (!match) return Response.json({ error: 'not_found' }, { status: 404 });
  if (typeof input.lease !== 'string' || !/^[a-f0-9]{64}$/.test(input.lease)) return Response.json({ error: 'invalid_lease' }, { status: 400 });
  if (input.events !== undefined && !validActivity(input.events)) return Response.json({error:'invalid_activity'},{status:400});
  if (match[2] === 'renew' && input.progress !== undefined && !['preparing', 'reading', 'ocr', 'generating'].includes(input.progress)) return Response.json({ error: 'invalid_progress' }, { status: 400 });
  const hash = await digest(input.lease);
  const now = Date.now();
  const account = await env.DB.prepare('SELECT id,kind,payload_json FROM account_jobs WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ?').bind(match[1], runner.ownerId, runner.id, hash).first();
  if (account) {
    if (match[2] === 'renew') {
      const row = await env.DB.prepare("UPDATE account_jobs SET lease_expires_at = ?, updated_at = ?, progress = COALESCE(?, progress) WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = 'running' AND lease_expires_at > ? RETURNING id").bind(now + leaseDurationMs, new Date(now).toISOString(), input.progress ?? null, match[1], runner.ownerId, runner.id, hash, now).first();
      return row ? Response.json({ ok: true }) : Response.json({ error: 'lease_conflict' }, { status: 409 });
    }
    if (!['succeeded', 'failed'].includes(input.status) || !Object.hasOwn(input, 'result')) return Response.json({ error: 'invalid_result' }, { status: 400 });
    if (account.kind === 'opportunity.analyze' && input.status === 'succeeded') return completeOpportunity(env,runner,match[1],hash,input.result);
    if(input.status==='succeeded'&&account.kind==='feasibility.generate-outline'){const items=await readFeasibilityKnowledge(env,runner.ownerId,JSON.parse(account.payload_json).knowledgeSnapshot||[]);if(!items)return Response.json({error:'version_conflict'},{status:409});if(!validGeneratedFeasibilityOutline(input.result?.outline,new Set(items.map(item=>item.id))))return Response.json({error:'invalid_result'},{status:400});}
    if(account.kind==='word-format.preview'&&input.status==='succeeded'&&(typeof input.result?.docx!=='string'||input.result.docx.length>900000||!/^UEs[A-Za-z0-9+/]*={0,2}$/.test(input.result.docx)))return Response.json({error:'invalid_result'},{status:400});
    const result = JSON.stringify(input.result);
    if (result.length > 1_000_000) return Response.json({ error: 'result_too_large' }, { status: 413 });
    const updated = await env.DB.prepare(`UPDATE account_jobs SET state = ?, result_json = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = 'running' AND lease_expires_at > ? AND (? != 'succeeded' OR kind != 'feasibility.export-word' OR (((account_jobs.project_id IS NULL AND EXISTS (SELECT 1 FROM feasibility_reports f WHERE f.owner_id=account_jobs.owner_id AND f.version=json_extract(account_jobs.payload_json,'$.version'))) OR (account_jobs.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM project_feasibility_reports f WHERE f.project_id=account_jobs.project_id AND f.owner_id=account_jobs.owner_id AND f.version=json_extract(account_jobs.payload_json,'$.version')))) AND EXISTS (SELECT 1 FROM account_job_artifacts a WHERE a.job_id=account_jobs.id AND a.id=json_extract(?, '$.artifactId') AND a.deleted_at IS NULL))) AND (? != 'succeeded' OR kind != 'feasibility.extract-sources' OR ((account_jobs.project_id IS NULL AND (EXISTS (SELECT 1 FROM feasibility_reports f WHERE f.owner_id=account_jobs.owner_id AND f.version=json_extract(account_jobs.payload_json,'$.version')) AND (SELECT COUNT(*) FROM feasibility_extracted_texts t WHERE t.job_id=account_jobs.id AND t.owner_id=account_jobs.owner_id)=json_array_length(account_jobs.payload_json,'$.sourceKeys') AND json_extract(?,'$.extractedCount')=json_array_length(account_jobs.payload_json,'$.sourceKeys') AND (COALESCE(json_extract(account_jobs.payload_json,'$.preserveImages'),0)!=1 OR ((SELECT COALESCE(SUM(image_count),0) FROM feasibility_extracted_texts t WHERE t.job_id=account_jobs.id AND t.owner_id=account_jobs.owner_id)=(SELECT COUNT(*) FROM feasibility_extracted_images i WHERE i.job_id=account_jobs.id AND i.owner_id=account_jobs.owner_id) AND json_extract(?,'$.imageCount')=(SELECT COUNT(*) FROM feasibility_extracted_images i WHERE i.job_id=account_jobs.id AND i.owner_id=account_jobs.owner_id)))))) OR (account_jobs.project_id IS NOT NULL AND (EXISTS (SELECT 1 FROM project_feasibility_reports f WHERE f.project_id=account_jobs.project_id AND f.owner_id=account_jobs.owner_id AND f.version=json_extract(account_jobs.payload_json,'$.version')) AND (SELECT COUNT(*) FROM project_feasibility_extracted_texts t WHERE t.job_id=account_jobs.id AND t.owner_id=account_jobs.owner_id)=json_array_length(account_jobs.payload_json,'$.sourceKeys') AND json_extract(?,'$.extractedCount')=json_array_length(account_jobs.payload_json,'$.sourceKeys') AND (COALESCE(json_extract(account_jobs.payload_json,'$.preserveImages'),0)!=1 OR ((SELECT COALESCE(SUM(image_count),0) FROM project_feasibility_extracted_texts t WHERE t.job_id=account_jobs.id AND t.owner_id=account_jobs.owner_id)=(SELECT COUNT(*) FROM project_feasibility_extracted_images i WHERE i.job_id=account_jobs.id AND i.owner_id=account_jobs.owner_id) AND json_extract(?,'$.imageCount')=(SELECT COUNT(*) FROM project_feasibility_extracted_images i WHERE i.job_id=account_jobs.id AND i.owner_id=account_jobs.owner_id)))))) AND (? != 'succeeded' OR kind != 'feasibility.analyze' OR (((account_jobs.project_id IS NULL AND EXISTS (SELECT 1 FROM feasibility_reports f WHERE f.owner_id=account_jobs.owner_id AND f.version=json_extract(account_jobs.payload_json,'$.version'))) OR (account_jobs.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM project_feasibility_reports f WHERE f.project_id=account_jobs.project_id AND f.owner_id=account_jobs.owner_id AND f.version=json_extract(account_jobs.payload_json,'$.version')))) AND (account_jobs.project_id IS NULL OR ${projectFeasibilityAnalysisSourcesGuard}) AND json_type(?,'$.content')='text' AND length(json_extract(?,'$.content')) BETWEEN 1 AND 200000)) AND (? != 'succeeded' OR kind != 'feasibility.generate-outline' OR (((account_jobs.project_id IS NULL AND EXISTS (SELECT 1 FROM feasibility_reports f WHERE f.owner_id=account_jobs.owner_id AND f.version=json_extract(account_jobs.payload_json,'$.version'))) OR (account_jobs.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM project_feasibility_reports f WHERE f.project_id=account_jobs.project_id AND f.owner_id=account_jobs.owner_id AND f.version=json_extract(account_jobs.payload_json,'$.version')))) AND ${feasibilityKnowledgeGuard})) AND (? != 'succeeded' OR kind != 'feasibility.generate-parameters' OR (((account_jobs.project_id IS NULL AND EXISTS (SELECT 1 FROM feasibility_reports f WHERE f.owner_id=account_jobs.owner_id AND f.version=json_extract(account_jobs.payload_json,'$.version'))) OR (account_jobs.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM project_feasibility_reports f WHERE f.project_id=account_jobs.project_id AND f.owner_id=account_jobs.owner_id AND f.version=json_extract(account_jobs.payload_json,'$.version')))) AND ${feasibilityKnowledgeGuard} AND json_type(?,'$.content')='text' AND length(json_extract(?,'$.content')) BETWEEN 1 AND 200000)) AND (? != 'succeeded' OR kind != 'feasibility.generate-content' OR (((account_jobs.project_id IS NULL AND EXISTS (SELECT 1 FROM feasibility_reports f WHERE f.owner_id=account_jobs.owner_id AND f.version=json_extract(account_jobs.payload_json,'$.version'))) OR (account_jobs.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM project_feasibility_reports f WHERE f.project_id=account_jobs.project_id AND f.owner_id=account_jobs.owner_id AND f.version=json_extract(account_jobs.payload_json,'$.version')))) AND ${feasibilityKnowledgeGuard} AND (SELECT COUNT(*) FROM feasibility_content_drafts d WHERE d.job_id=account_jobs.id AND d.owner_id=account_jobs.owner_id)=json_array_length(account_jobs.payload_json,'$.targets') AND json_extract(?,'$.generatedCount')=json_array_length(account_jobs.payload_json,'$.targets') AND (COALESCE(json_extract(account_jobs.payload_json,'$.autoReview'),0) != 1 OR ((SELECT COUNT(*) FROM feasibility_content_reviews r WHERE r.job_id=account_jobs.id AND r.owner_id=account_jobs.owner_id)=json_array_length(account_jobs.payload_json,'$.reviewTargets') AND json_extract(?,'$.reviewedCount')=json_array_length(account_jobs.payload_json,'$.reviewTargets') AND json_extract(?,'$.reviewFallbackCount')=(SELECT COALESCE(SUM(fallback),0) FROM feasibility_content_reviews r WHERE r.job_id=account_jobs.id AND r.owner_id=account_jobs.owner_id))))) RETURNING id`).bind(input.status, result, new Date(now).toISOString(), match[1], runner.ownerId, runner.id, hash, now, input.status, result, input.status, result, result, result, result, input.status, result, result, input.status, input.status, result, result, input.status, result, result, result).first();
    if (updated) {
      if (account.kind === 'company-dossier.extract' && ['succeeded', 'failed'].includes(input.status)) {
        await cleanupCompanyDossierFiles(env, runner.ownerId, account.payload_json);
      }
      return Response.json({ ok: true });
    }
    const existing = await env.DB.prepare('SELECT id FROM account_jobs WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = ? AND result_json = ?').bind(match[1], runner.ownerId, runner.id, hash, input.status, result).first();
    return existing ? Response.json({ ok: true }) : Response.json({ error: 'lease_conflict' }, { status: 409 });
  }
  if (match[2] === 'renew') {
    const row = await env.DB.prepare("UPDATE jobs SET lease_expires_at = ?, updated_at = ?, progress = COALESCE(?, progress) WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = 'running' AND lease_expires_at > ? RETURNING id")
      .bind(now + leaseDurationMs, new Date(now).toISOString(), input.progress ?? null, match[1], runner.ownerId, runner.id, hash, now).first();
    if(row) await saveJobActivity(env,runner,match[1],hash,input.events);
    return row ? Response.json({ ok: true }) : Response.json({ error: 'lease_conflict' }, { status: 409 });
  }
  if (!['succeeded', 'failed'].includes(input.status) || !Object.hasOwn(input, 'result')) return Response.json({ error: 'invalid_result' }, { status: 400 });
  if (input.status === 'succeeded') {
    const job = await env.DB.prepare('SELECT kind,payload_json FROM jobs WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ?').bind(match[1], runner.ownerId, runner.id, hash).first();
    if (job?.kind === 'technical-plan.generate-batch') return completeTechnicalBatch(env,runner,match[1],hash,input.result);
    if (job?.kind === 'secop.import-zip') {
      const committed = await env.DB.prepare('SELECT part_count,skipped FROM secop_zip_commits WHERE job_id=? AND owner_id=?').bind(match[1],runner.ownerId).first();
      if (!committed || input.result?.imported !== committed.part_count || input.result?.skipped !== committed.skipped) return Response.json({error:'invalid_result'},{status:400});
    }
    if (['technical-plan.export-word', 'technical-plan.extract-template', 'duplicate-check.analyze', 'rejection-check.analyze', 'blind-check.inspect', 'blind-check.fix', 'blind-check.fix-report', 'blind-check.fix-ai', 'bid-evaluation.analyze', 'proposal-review.apply-suggestions'].includes(job?.kind)) {
      const artifact = await env.DB.prepare('SELECT id FROM job_artifacts WHERE job_id = ?').bind(match[1]).first();
      const payload=JSON.parse(job.payload_json);
      if (payload.bidDocument && input.result?.bidDocument!==payload.bidDocument) return Response.json({error:'invalid_result'},{status:400});
      if (payload.bidDocument==='technical' && payload.pageLimit && (!Number.isSafeInteger(input.result?.pageCount) || input.result.pageCount<1 || input.result.pageCount>payload.pageLimit)) return Response.json({error:'invalid_result'},{status:400});
      if (!artifact || input.result?.artifactId !== artifact.id) return Response.json({ error: 'invalid_artifact' }, { status: 400 });
      if(['blind-check.fix-report','blind-check.fix-ai'].includes(job?.kind) && JSON.parse(job.payload_json).reportVersion===1){const report=await env.DB.prepare('SELECT id FROM job_repair_reports WHERE job_id=? AND deleted_at IS NULL').bind(match[1]).first();if(!report||input.result?.reportId!==report.id)return Response.json({error:'invalid_artifact'},{status:400});}

    }
  }
  const result = JSON.stringify(input.result);
  if (result.length > 1_000_000) return Response.json({ error: 'result_too_large' }, { status: 413 });
  const assetFingerprintForJob = planAssetFingerprintSql.replace('project_id = ?', 'project_id = jobs.project_id');
  const updated = await env.DB.prepare(`UPDATE jobs SET state = ?, result_json = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = 'running' AND lease_expires_at > ? AND (? != 'succeeded' OR kind != 'technical-plan.export-word' OR json_type(payload_json, '$.assetFingerprint') IS NULL OR (EXISTS (SELECT 1 FROM project_technical_plans WHERE project_id = jobs.project_id AND version = json_extract(jobs.payload_json, '$.planVersion')) AND (${assetFingerprintForJob}) = json_extract(jobs.payload_json, '$.assetFingerprint'))) RETURNING id`)
    .bind(input.status, result, new Date(now).toISOString(), match[1], runner.ownerId, runner.id, hash, now, input.status).first();
  if (updated) return Response.json({ ok: true });
  const existing = await env.DB.prepare('SELECT id FROM jobs WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = ? AND result_json = ?')
    .bind(match[1], runner.ownerId, runner.id, hash, input.status, result).first();
  return existing ? Response.json({ ok: true }) : Response.json({ error: 'lease_conflict' }, { status: 409 });
}
