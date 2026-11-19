import { technicalAnalysis } from './technical-analysis.js';
import { technicalOutline } from './technical-outline.js';
import { technicalPlan } from './technical-plan.js';
import { globalFacts } from './global-facts.js';
import { handleUserJobs } from './jobs.js';
import { detectTechnicalScore } from '../../client/src/features/web/technical-score-detection.mjs';
import { hasPendingFacts } from '../../client/src/features/web/preparation-readiness.mjs';

const categories = ['project-overview', 'technical-score', 'response-requirements'];
const stages = [...categories, 'chapters', 'outline', 'facts', 'draft', 'word'];
const publicState = row => row ? { status:row.status, stage:stages[row.stage] || 'word', reason:row.reason, runId:row.run_id, wordId:row.word_id } : null;
const error = (code, status) => Response.json({error:code},{status});
const readState = (env, owner, project) => env.DB.prepare('SELECT * FROM project_automatic_preparation WHERE owner_id=? AND project_id=?').bind(owner,project).first();

export async function automaticPreparation(request, env, owner, project) {
  const owned = await env.DB.prepare('SELECT id FROM projects WHERE owner_id=? AND id=?').bind(owner,project).first();
  if (!owned) return error('not_found',404);
  if (request.method === 'GET') return Response.json({preparation:publicState(await readState(env,owner,project))});
  if (request.method !== 'POST') return error('method_not_allowed',405);
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return error('invalid_origin',403);
  const input = await request.json().catch(() => null);
  const now = Date.now();
  if (input?.action === 'start') {
    const {fileIds, credentialId, language} = input;
    if (!Array.isArray(fileIds) || !fileIds.length || fileIds.length > 50 || fileIds.some(id=>typeof id!=='string'||!id) ||
        new Set(fileIds).size!==fileIds.length || typeof credentialId!=='string' || !credentialId || !['es','en'].includes(language) || input.consent!==true) return error('invalid_input',400);
    const files = await env.DB.prepare('SELECT COUNT(*) AS count FROM project_files WHERE project_id=? AND id IN (SELECT value FROM json_each(?))').bind(project,JSON.stringify(fileIds)).first();
    if (files.count!==fileIds.length) return error('not_found',404);
    await env.DB.prepare(`INSERT INTO project_automatic_preparation(project_id,owner_id,run_id,settings_json,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(project_id) DO NOTHING`).bind(project,owner,crypto.randomUUID(),JSON.stringify({fileIds,credentialId,language}),now).run();
  } else if (input?.action === 'pause') {
    await env.DB.prepare("UPDATE project_automatic_preparation SET status='paused',updated_at=? WHERE project_id=? AND owner_id=? AND status='running'").bind(now,project,owner).run();
  } else if (input?.action === 'resume') {
    if (input.technicalScore!==undefined && !['present','none'].includes(input.technicalScore)) return error('invalid_input',400);
    await env.DB.prepare(`UPDATE project_automatic_preparation SET status=CASE WHEN stage>=8 THEN 'ready' ELSE 'running' END,
      attempt=attempt+CASE WHEN status='blocked' THEN 1 ELSE 0 END,
      settings_json=CASE WHEN reason='technical_score_unknown' AND ? IS NOT NULL THEN json_set(settings_json,'$.technicalScore',?) ELSE settings_json END,
      reason=NULL,updated_at=? WHERE project_id=? AND owner_id=? AND status IN ('paused','blocked')`)
      .bind(input.technicalScore??null,input.technicalScore??null,now,project,owner).run();
  } else return error('invalid_input',400);
  return Response.json({preparation:publicState(await readState(env,owner,project))});
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
  const {fileIds,credentialId,language,technicalScore} = JSON.parse(row.settings_json);
  const common = {fileIds,language,dataProcessingConsent:true};
  const stillRunning = async () => Boolean(await env.DB.prepare("SELECT 1 FROM project_automatic_preparation WHERE project_id=? AND lock_id=? AND status='running'").bind(project,lock).first());
  const queue = async (kind,payload,credential=credentialId) => await stillRunning() && run('POST','jobs',{kind,credentialId:credential,payload},handleUserJobs);
  const get = (path,handler) => run('GET',path,null,handler,project);
  const post = async (path,handler,data,...args) => await stillRunning() && run('POST',path,data,handler,project,...args);
  const next = async (batchId=null,wordId=null) => env.DB.prepare(`UPDATE project_automatic_preparation SET stage=stage+1,attempt=0,batch_id=COALESCE(?,batch_id),word_id=COALESCE(?,word_id),
    status=CASE WHEN stage=7 AND status='running' THEN 'ready' ELSE status END WHERE project_id=? AND lock_id=? AND status='running'`).bind(batchId,wordId,project,lock).run();
  const block = async reason => env.DB.prepare("UPDATE project_automatic_preparation SET status='blocked',reason=? WHERE project_id=? AND lock_id=? AND status='running'").bind(reason,project,lock).run();
  try {
    const job = await env.DB.prepare('SELECT id,state FROM jobs WHERE owner_id=? AND project_id=? AND client_request_id=?').bind(owner,project,key).first();
    if (job && ['running','queued'].includes(job.state)) return;
    const stage = row.stage;
    if (stage<3) {
      const category=categories[stage], data=await get('technical-analyses',technicalAnalysis);
      const saved=data.analyses.find(item=>item.category===category);
      if (saved?.current) return await next();
      if (!job) return await queue('technical-plan.analyze',{...common,category});
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
        if (facts.importReviewPending || facts.groups.some(group=>hasPendingFacts(group.title+' '+group.content))) return await block('facts_need_input');
        return await next();
      }
      if (facts.affectedChapterCount>0) return await block('existing_draft');
      if (!job) return await queue('technical-plan.generate-facts',{...common,planVersion:plan.version,mode:'omit'});
      if (job.state!=='succeeded') return await block('task_failed');
      await post('technical-facts',globalFacts,{jobId:job.id,revision:facts.revision},'apply');
      return;
    }
    if (stage===6) {
      if (!job) {
        const hasEmptyLeaf=nodes=>nodes.some(node=>node.children?.length?hasEmptyLeaf(node.children):!node.content?.trim());
        if (!hasEmptyLeaf(plan.outline)) return await next();
        return await queue('technical-plan.generate-batch',{...common,planVersion:plan.version,mode:'missing'});
      }
      if (job.state!=='succeeded') return await block('task_failed');
      return await next(job.id);
    }
    if (!job) return await queue('technical-plan.export-word',{planVersion:plan.version,language,...(row.batch_id?{draftBatchId:row.batch_id}:{})},null);
    if (job.state!=='succeeded') return await block('task_failed');
    const artifact=await env.DB.prepare('SELECT id FROM job_artifacts WHERE job_id=? AND deleted_at IS NULL').bind(job.id).first();
    if (!artifact) return await block('draft_unavailable');
    await next(null,job.id);
  } catch (cause) {
    await block(cause.workflowReason || 'step_failed');
  } finally {
    await env.DB.prepare('UPDATE project_automatic_preparation SET lock_id=NULL,lock_until=0,updated_at=? WHERE project_id=? AND lock_id=?').bind(Date.now(),project,lock).run();
  }
}
