import {readBidDocumentRules,technicalLeaves} from './bid-document-rules.js';
import { technicalAnalysis } from './technical-analysis.js';
import { technicalOutline } from './technical-outline.js';
import { technicalPlan } from './technical-plan.js';
import { globalFacts } from './global-facts.js';
import { handleUserJobs } from './jobs.js';
import { detectTechnicalScore } from '../../client/src/features/web/technical-score-detection.mjs';
import { hasPendingFacts } from '../../client/src/features/web/preparation-readiness.mjs';

const categories = ['project-overview', 'technical-score', 'response-requirements'];
const stages = [...categories, 'chapters', 'outline', 'facts', 'draft', 'word', 'economic'];
const publicState = (row, activeJob = null) => row ? { status:row.status, stage:row.status==='ready'?'word':stages[row.stage] || 'word', reason:row.reason, runId:row.run_id, wordId:row.word_id, ...(row.economic_word_id ? {economicId:row.economic_word_id} : {}), activeJob } : null;
const error = (code, status) => Response.json({error:code},{status});
const readState = (env, owner, project) => env.DB.prepare('SELECT * FROM project_automatic_preparation WHERE owner_id=? AND project_id=?').bind(owner,project).first();

async function readPublicState(env, owner, project) {
  const row = await readState(env, owner, project);
  if (!row) return null;
  const key = `prepare:${row.run_id}:${row.stage}:${row.attempt}`;
  const job = row.status!=='ready' && row.stage < stages.length
    ? await env.DB.prepare('SELECT id,kind,state,progress FROM jobs WHERE owner_id=? AND project_id=? AND client_request_id=?').bind(owner, project, key).first()
    : null;
  const activeJob = job ? { id: job.id, kind: job.kind, state: job.state, progress: job.state === 'running' ? job.progress ?? null : null } : null;
  return publicState(row, activeJob);
}

export async function automaticPreparation(request, env, owner, project) {
  const owned = await env.DB.prepare('SELECT id FROM projects WHERE owner_id=? AND id=?').bind(owner,project).first();
  if (!owned) return error('not_found',404);
  if (request.method === 'GET') return Response.json({preparation:await readPublicState(env,owner,project)});
  if (request.method !== 'POST') return error('method_not_allowed',405);
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return error('invalid_origin',403);
  const input = await request.json().catch(() => null);
  const now = Date.now();
  if (input?.action === 'start') {
    const {fileIds, language, allowPendingFacts, skipExistingDraft, localRunner} = input;
    if (localRunner !== undefined && typeof localRunner !== 'boolean') return error('invalid_input',400);
    if (allowPendingFacts !== undefined && typeof allowPendingFacts !== 'boolean') return error('invalid_input',400);
    if (skipExistingDraft !== undefined && typeof skipExistingDraft !== 'boolean') return error('invalid_input',400);
    const credentialId = localRunner === true && (input.credentialId === undefined || input.credentialId === null) ? 'local-runner' : input.credentialId;
    if (!Array.isArray(fileIds) || !fileIds.length || fileIds.length > 50 || fileIds.some(id=>typeof id!=='string'||!id) ||
        new Set(fileIds).size!==fileIds.length || typeof credentialId!=='string' || !credentialId || !['es','en'].includes(language) || input.consent!==true) return error('invalid_input',400);
    const files = await env.DB.prepare('SELECT COUNT(*) AS count FROM project_files WHERE project_id=? AND id IN (SELECT value FROM json_each(?))').bind(project,JSON.stringify(fileIds)).first();
    if (files.count!==fileIds.length) return error('not_found',404);
    const settings = {fileIds,credentialId,language,...(allowPendingFacts===true?{allowPendingFacts:true}:{}),...(skipExistingDraft===true?{skipExistingDraft:true}:{})};
    await env.DB.prepare(`INSERT INTO project_automatic_preparation(project_id,owner_id,run_id,settings_json,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(project_id) DO NOTHING`).bind(project,owner,crypto.randomUUID(),JSON.stringify(settings),now).run();
  } else if (input?.action === 'pause') {
    await env.DB.prepare("UPDATE project_automatic_preparation SET status='paused',updated_at=? WHERE project_id=? AND owner_id=? AND status='running'").bind(now,project,owner).run();
  } else if (input?.action === 'resume') {
    if (input.technicalScore!==undefined && !['present','none'].includes(input.technicalScore)) return error('invalid_input',400);
    if (input.allowPendingFacts!==undefined && typeof input.allowPendingFacts!=='boolean') return error('invalid_input',400);
    if (input.skipExistingDraft!==undefined && typeof input.skipExistingDraft!=='boolean') return error('invalid_input',400);
    let settingsExpr = 'settings_json';
    const binds = [];
    if (input.technicalScore !== undefined) {
      settingsExpr = `CASE WHEN reason='technical_score_unknown' THEN json_set(${settingsExpr},'$.technicalScore',?) ELSE ${settingsExpr} END`;
      binds.push(input.technicalScore);
    }
    if (typeof input.allowPendingFacts === 'boolean') {
      settingsExpr = `json_set(${settingsExpr},'$.allowPendingFacts',json(?))`;
      binds.push(input.allowPendingFacts ? 'true' : 'false');
    }
    if (typeof input.skipExistingDraft === 'boolean') {
      settingsExpr = `json_set(${settingsExpr},'$.skipExistingDraft',json(?))`;
      binds.push(input.skipExistingDraft ? 'true' : 'false');
    }
    await env.DB.prepare(`UPDATE project_automatic_preparation SET status='running',
      attempt=attempt+CASE WHEN status='blocked' THEN 1 ELSE 0 END,
      settings_json=${settingsExpr},
      reason=NULL,updated_at=? WHERE project_id=? AND owner_id=? AND status IN ('paused','blocked')`)
      .bind(...binds,now,project,owner).run();
  } else return error('invalid_input',400);
  return Response.json({preparation:await readPublicState(env,owner,project)});
}

export async function advanceOwnerPreparation(env, owner) {
  const now = Date.now();
  const candidate = await env.DB.prepare(`SELECT p.project_id FROM project_automatic_preparation p WHERE p.owner_id=? AND p.status='running' AND p.lock_until<=?
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.owner_id=p.owner_id AND j.project_id=p.project_id
      AND j.client_request_id='prepare:'||p.run_id||':'||p.stage||':'||p.attempt AND (j.state='queued' OR (j.state='running' AND j.lease_expires_at>?)))
    ORDER BY p.updated_at LIMIT 1`).bind(owner,now,now).first();
  if (candidate) await advancePreparation(env,owner,candidate.project_id);
}

async function advancePreparation(env, owner, project) {
  const lock = crypto.randomUUID(), now = Date.now();
  const row = await env.DB.prepare(`UPDATE project_automatic_preparation SET lock_id=?,lock_until=? WHERE project_id=? AND owner_id=?
    AND status='running' AND lock_until<=? RETURNING *`).bind(lock,now+60000,project,owner,now).first();
  if (!row) return;
  const run = async (method, path, data, handler, ...args) => {
    const origin = new URL(env.BETTER_AUTH_URL).origin;
    const request = new Request(`${origin}/api/projects/${project}/${path}`,{method,headers:{
      origin,'content-type':'application/json','idempotency-key': key,
    },...(data ? {body:JSON.stringify(data)} : {})});
    const response = await handler(request,env,owner,...args);
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.error || 'step_failed'),{workflowReason:value.error || 'step_failed'});
    return value;
  };
  const key = `prepare:${row.run_id}:${row.stage}:${row.attempt}`;
  const {fileIds,credentialId,language,technicalScore,allowPendingFacts=false,skipExistingDraft=false} = JSON.parse(row.settings_json);
  const common = {fileIds,language,dataProcessingConsent:true};
  const stillRunning = async () => Boolean(await env.DB.prepare("SELECT 1 FROM project_automatic_preparation WHERE project_id=? AND lock_id=? AND status='running'").bind(project,lock).first());
  const queue = async (kind,payload,credential=credentialId) => await stillRunning() && run('POST','jobs',{kind,credentialId:credential,payload},handleUserJobs);
  const get = (path,handler) => run('GET',path,null,handler,project);
  const post = async (path,handler,data,...args) => await stillRunning() && run('POST',path,data,handler,project,...args);
  const next = async ({batchId=null,wordId=null,economicId=null,ready=false}={}) => env.DB.prepare(`UPDATE project_automatic_preparation SET stage=stage+1,attempt=0,batch_id=COALESCE(?,batch_id),word_id=COALESCE(?,word_id),
    economic_word_id=COALESCE(?,economic_word_id), status=CASE WHEN ? THEN 'ready' ELSE status END WHERE project_id=? AND lock_id=? AND status='running'`).bind(batchId,wordId,economicId,Number(ready),project,lock).run();
  const block = async reason => env.DB.prepare("UPDATE project_automatic_preparation SET status='blocked',reason=? WHERE project_id=? AND lock_id=? AND status='running'").bind(reason,project,lock).run();
  try {
    const job = await env.DB.prepare('SELECT id,state FROM jobs WHERE owner_id=? AND project_id=? AND client_request_id=?').bind(owner,project,key).first();
    if (job && ['running','queued'].includes(job.state)) return;
    const stage = row.stage;
    if (stage<3) {
      const category=categories[stage], data=await get('technical-analyses',technicalAnalysis);
      const saved=data.analyses.find(item=>item.category===category);
      if (saved?.current) return await next();
      if (!job) return await queue('technical-plan.analyze',{...common,category,...(category==='response-requirements'?{bidDocumentRules:true}:{})});
      if (job.state!=='succeeded') return await block('task_failed');
      await post('technical-analyses',technicalAnalysis,{jobId:job.id,revision:saved?.revision||0},category);
      return await next();
    }
    const plan = await get('technical-plan',technicalPlan);
    if (stage===3 || stage===4) {
      if (plan.outline.length) return await next();
      const {selection,jobs} = await get('technical-outline',technicalOutline);
      if (stage===3) {
        if (selection?.current) return await next();
        if (!job) return await queue('technical-plan.generate-roots',{...common,planVersion:plan.version});
        const proposal=jobs.find(item=>item.id===job.id);
        if (job.state!=='succeeded' || !proposal?.result?.outline?.length) return await block('task_failed');
        const items=proposal.result.outline.map(({id,attr,content_mode,content_mode_note})=>({id,attr,content_mode,content_mode_note}));
        await post('technical-outline',technicalOutline,{jobId:job.id,revision:selection?.revision||0,items},'selection');
        return await next();
      }
      if (!selection?.current) return await block('selection_changed');
      if (!job) {
        const {analyses}=await get('technical-analyses',technicalAnalysis);
        const score=technicalScore||detectTechnicalScore(analyses.find(item=>item.category==='technical-score'&&item.current)?.content);
        if (score==='unknown') return await block('technical_score_unknown');
        return await queue('technical-plan.expand-outline',{language,dataProcessingConsent:true,selectionRevision:selection.revision,noTechnicalScore:score==='none'});
      }
      if (job.state!=='succeeded') return await block('task_failed');
      await post('technical-outline',technicalOutline,{jobId:job.id},'apply');
      return await next();
    }
    if (stage===5) {
      const facts=await get('technical-facts',globalFacts);
      if (facts.current && facts.revision>0) {
        if (!allowPendingFacts && (facts.importReviewPending || facts.groups.some(group=>hasPendingFacts(group.title+' '+group.content)))) return await block('facts_need_input');
        return await next();
      }
      if (facts.affectedChapterCount>0) return skipExistingDraft ? await next() : await block('existing_draft');
      if (!job) return await queue('technical-plan.generate-facts',{...common,planVersion:plan.version,mode:'omit'});
      if (job.state!=='succeeded') return await block('task_failed');
      await post('technical-facts',globalFacts,{jobId:job.id,revision:facts.revision},'apply');
      return;
    }
    const {analyses}=await get('technical-analyses',technicalAnalysis);
    const rules=readBidDocumentRules(analyses.find(item=>item.category==='response-requirements'&&item.current)?.content);
    if (rules?.incomplete || (stage===8 && !rules)) return await block('bid_document_rules_incomplete');
    if (stage===6) {
      if (!job) {
        const hasEmptyLeaf=nodes=>nodes.some(node=>node.children?.length?hasEmptyLeaf(node.children):!node.content?.trim());
        const leaves=rules ? technicalLeaves(plan.outline) : null;
        if (leaves && !leaves.length) return await block('technical_chapters_missing');
        if (leaves ? !leaves.some(node=>!node.content?.trim()) : !hasEmptyLeaf(plan.outline)) return await next();
        const budget=rules?.pageLimit ? Math.max(80,Math.floor(rules.pageLimit*210/leaves.length)) : null;
        const instructions=rules && (language==='en'
          ? `Write only the technical response. Exclude offer prices, budgets, and details that reveal automatic scoring in other envelopes. ${budget ? `Use at most ${budget} words, including tables. Prioritize required details and avoid repeating material across sections.` : ''}`
          : `Redacta solo la respuesta técnica. Excluye precios ofertados, presupuestos y datos que revelen criterios automáticos de otros sobres. ${budget ? `Usa como máximo ${budget} palabras, incluidas las tablas. Prioriza los detalles exigidos y evita repetir contenido entre apartados.` : ''}`);
        return await queue('technical-plan.generate-batch',{...common,planVersion:plan.version,mode:'missing',...(rules?{technicalOnly:true,instructions}:{}),...(allowPendingFacts?{allowPendingFacts:true}:{})});
      }
      if (job.state!=='succeeded') return await block('task_failed');
      return await next({batchId:job.id});
    }
    if (!job && stage===8 && rules) return await queue('technical-plan.export-word',{planVersion:plan.version,language,bidDocument:'economic',economicAnnex:rules.economicAnnex,fileIds},null);
    if (!job) return await queue('technical-plan.export-word',{planVersion:plan.version,language,
      ...(rules ? {bidDocument:'technical',pageLimit:rules.pageLimit,format:rules.format} : {}),
      ...(row.batch_id ? {draftBatchId:row.batch_id} : {})},null);
    if (job.state!=='succeeded') return await block('task_failed');
    const artifact=await env.DB.prepare('SELECT id FROM job_artifacts WHERE job_id=? AND deleted_at IS NULL').bind(job.id).first();
    if (!artifact) return await block('draft_unavailable');
    await next(stage===8 ? {economicId:job.id,ready:true} : {wordId:job.id,ready:!rules});
  } catch (cause) {
    if (cause?.workflowReason) {
      await block(cause.workflowReason);
    } else {
      console.warn('Transient automatic preparation error; will retry on next runner poll:', cause?.message || cause);
    }
  } finally {
    await env.DB.prepare('UPDATE project_automatic_preparation SET lock_id=NULL,lock_until=0,updated_at=? WHERE project_id=? AND lock_id=?').bind(Date.now(),project,lock).run();
  }
}
