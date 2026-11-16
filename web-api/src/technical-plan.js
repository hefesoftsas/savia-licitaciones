import {loadBatchWordPreview,previewOutline} from './batch-word-preview.js';
import { readKnowledgeSources, knowledgeSnapshotGuard, knowledgeSnapshotCurrent } from './knowledge-sources.js';
import outlineUtils from '../../client/electron/services/technicalPlanOutline.cjs';
import { digest } from './runners.js';
import { globalFactSourcesCurrent, globalFactGuard } from './global-fact-sources.js';
import { captureRequirementSources, sameRequirementSources } from './requirement-sources.js';
import { templateValuesGuard } from './template-sources.js';
import { outlineSnapshotCurrent, expandedOutlineGuard } from './outline-sources.js';
import { planAssetFingerprint } from './plan-asset-sources.js';

const missing = () => Response.json({ error: 'not_found' }, { status: 404 });
const bad = () => Response.json({ error: 'invalid_input' }, { status: 400 });
const conflict = () => Response.json({ error: 'version_conflict' }, { status: 409 });
const guard = 'EXISTS (SELECT 1 FROM project_technical_plans p WHERE p.project_id = ? AND p.mutation_token = ?)';
const validText = (value, max) => typeof value === 'string' && value.length <= max;

async function ensurePlan(env, projectId) {
  await env.DB.prepare('INSERT INTO project_technical_plans (project_id, version, updated_at) VALUES (?, 0, ?) ON CONFLICT(project_id) DO NOTHING').bind(projectId, new Date().toISOString()).run();
}
async function loadPlan(env, projectId, {metadataOnly=false}={}) {
  const [meta, data] = await env.DB.batch([
    env.DB.prepare('SELECT version, updated_at AS updatedAt FROM project_technical_plans WHERE project_id = ?').bind(projectId),
    env.DB.prepare(metadataOnly?"SELECT node_id,parent_node_id,sort_order,title,description,content_mode,content_mode_note,source_requirement_id,source_requirement_title,knowledge_item_ids_json,status,attr,'' AS content,CASE WHEN length(trim(content))>0 THEN 1 ELSE 0 END AS has_content FROM project_technical_plan_nodes WHERE project_id = ? ORDER BY sort_order,node_id":'SELECT * FROM project_technical_plan_nodes WHERE project_id = ? ORDER BY sort_order, node_id').bind(projectId),
  ]);
  const rows = data.results, nodes = new Map();
  for (const row of rows) {
    let knowledgeIds;
    try { knowledgeIds = row.knowledge_item_ids_json ? JSON.parse(row.knowledge_item_ids_json) : undefined; } catch { knowledgeIds = undefined; }
    nodes.set(row.node_id, { id: row.node_id, title: row.title, description: row.description, content_mode: row.content_mode, content: row.content, status: row.status, ...(metadataOnly?{has_content:!!row.has_content}:{}),
      ...(row.attr ? { attr: row.attr } : {}),
      ...(row.content_mode_note ? { content_mode_note: row.content_mode_note } : {}),
      ...(row.source_requirement_id ? { source_requirement_id: row.source_requirement_id } : {}),
      ...(row.source_requirement_title ? { source_requirement_title: row.source_requirement_title } : {}),
      ...(Array.isArray(knowledgeIds) && knowledgeIds.length ? { knowledge_item_ids: knowledgeIds } : {}), children: [] });
  }
  const roots = [];
  for (const row of rows) {
    const item = nodes.get(row.node_id);
    if (row.parent_node_id && nodes.has(row.parent_node_id)) nodes.get(row.parent_node_id).children.push(item); else roots.push(item);
  }
  return { version: meta.results[0].version, updatedAt: meta.results[0].updatedAt, outline: outlineUtils.numberOutline(roots), rows };
}
function publicPlan(plan) { return { version: plan.version, updatedAt: plan.updatedAt, outline: plan.outline }; }
export async function runnerPlanContext(request, env, runner, jobId) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let input;
  try { input = await request.json(); } catch { return bad(); }
  if (typeof input?.lease !== 'string' || !/^[a-f0-9]{64}$/.test(input.lease)) return bad();
  const job = await env.DB.prepare("SELECT j.project_id, j.payload_json, j.kind, j.export_format_json, p.title AS project_title FROM jobs j JOIN projects p ON p.id = j.project_id WHERE j.id = ? AND j.owner_id = ? AND j.runner_id = ? AND j.lease_hash = ? AND j.state = 'running' AND j.lease_expires_at > ? AND j.kind IN ('technical-plan.generate-section', 'technical-plan.generate-batch', 'technical-plan.export-word', 'technical-plan.generate-roots', 'technical-plan.expand-outline', 'technical-plan.extract-template', 'technical-plan.generate-facts')").bind(jobId, runner.ownerId, runner.id, await digest(input.lease), Date.now()).first();
  if (!job) return Response.json({ error: 'lease_conflict' }, { status: 409 });
  const payload = JSON.parse(job.payload_json), plan = await loadPlan(env, job.project_id,{metadataOnly:job.kind==='technical-plan.generate-batch'&&(payload.consistencyLedger===true||(payload.wordAdjustment===true&&payload.consistency!==true))});
  if (plan.version !== payload.planVersion) return conflict();
  if (job.kind === 'technical-plan.expand-outline') {
    if (!await outlineSnapshotCurrent(env, runner.ownerId, job.project_id, payload.outlineSnapshot)) return conflict();
    const guard = expandedOutlineGuard(payload.outlineSnapshot, job.project_id, runner.ownerId, payload.selectionRevision, payload.selectionJobId);
    const selected = await env.DB.prepare(`SELECT items_json FROM project_outline_root_selections WHERE project_id = ? AND ${guard.sql}`).bind(job.project_id, ...guard.args).first();
    if (!selected) return conflict();
    const rows = await env.DB.prepare('SELECT category, content FROM project_technical_analyses WHERE project_id = ? ORDER BY category').bind(job.project_id).all();
    const checked = await env.DB.prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.args).first();
    if (!checked || rows.results.length !== 3) return conflict();
    return Response.json({ projectTitle: job.project_title, roots: JSON.parse(selected.items_json), analyses: Object.fromEntries(rows.results.map(row => [row.category, row.content])) });
  }
  if (job.kind === 'technical-plan.generate-roots') {
    if (!await outlineSnapshotCurrent(env, runner.ownerId, job.project_id, payload.outlineSnapshot)) return conflict();
    const rows = await env.DB.prepare('SELECT category, content FROM project_technical_analyses WHERE project_id = ? ORDER BY category').bind(job.project_id).all();
    if (rows.results.length !== 3 || !await outlineSnapshotCurrent(env, runner.ownerId, job.project_id, payload.outlineSnapshot)) return conflict();
    return Response.json({ projectTitle: job.project_title, analyses: Object.fromEntries(rows.results.map(row => [row.category, row.content])) });
  }
  if (job.kind === 'technical-plan.generate-facts') {
    if (!await globalFactSourcesCurrent(env, runner.ownerId, job.project_id, payload.factsSnapshot)) return conflict();
    const rows = await env.DB.prepare('SELECT category, content, source_snapshot_json FROM project_technical_analyses WHERE project_id = ?').bind(job.project_id).all();
    const current = await captureRequirementSources(env, runner.ownerId, job.project_id, false);
    const analyses = Object.fromEntries(rows.results.filter(row => sameRequirementSources(JSON.parse(row.source_snapshot_json), current)).map(row => [row.category, row.content]));
    let rupFacts;
    if (payload.includeRup === true && payload.rupConsent === true) {
      const rup = await captureRequirementSources(env, runner.ownerId, job.project_id, true);
      if (!sameRequirementSources(payload.factsSnapshot.sources, rup)) return conflict();
      rupFacts = rup.facts.map(({ id, label, value, page }) => ({ id, label, value, page }));
    }
    const knowledgeEntries = payload.knowledgeConsent === true && payload.factsSnapshot?.knowledgeIds?.length ? await readKnowledgeSources(env, runner.ownerId, payload.factsSnapshot.knowledgeIds) : undefined;
    if (!await globalFactSourcesCurrent(env, runner.ownerId, job.project_id, payload.factsSnapshot)) return conflict();
    return Response.json({ projectTitle: job.project_title, outline: plan.outline, analyses, ...(rupFacts ? { rupFacts } : {}), ...(knowledgeEntries ? { knowledgeEntries } : {}) });
  }
  if (job.kind === 'technical-plan.extract-template') {
    const current = await captureRequirementSources(env, runner.ownerId, job.project_id, false);
    if (!sameRequirementSources(payload.sourceSnapshot, current)) return conflict();
    const roots = plan.outline.filter(node => node.content_mode === 'template-fill' && !node.children?.length);
    if (!roots.length) return conflict();
    return Response.json({ projectTitle: job.project_title, roots, version: plan.version });
  }
  if (job.kind === 'technical-plan.export-word') {
    if (payload.assetFingerprint !== undefined && await planAssetFingerprint(env, job.project_id) !== payload.assetFingerprint) return conflict();
    if (payload.templateJobId) {
      const guard = templateValuesGuard(payload.templateSourceSnapshot, payload.templateFingerprint, job.project_id, runner.ownerId, payload.templateJobId, payload.templateRevision, (payload.templateValuesRevision ?? 0));
      if (!await env.DB.prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.args).first()) return conflict();
    }
    const values = payload.templateJobId ? await env.DB.prepare('SELECT values_json FROM project_template_values WHERE project_id = ? AND job_id = ? AND revision = ?').bind(job.project_id, payload.templateJobId, (payload.templateValuesRevision ?? 0)).first() : null;
    if (payload.templateJobId && (payload.templateValuesRevision ?? 0) > 0 && !values) return conflict();
    if (payload.templateJobId) { const guard = templateValuesGuard(payload.templateSourceSnapshot, payload.templateFingerprint, job.project_id, runner.ownerId, payload.templateJobId, payload.templateRevision, (payload.templateValuesRevision ?? 0)); if (!await env.DB.prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.args).first()) return conflict(); }
    const assets = payload.assetFingerprint === undefined ? [] : (await env.DB.prepare('SELECT id, reference, kind, content_type AS contentType FROM project_plan_assets WHERE project_id = ? ORDER BY id').bind(job.project_id).all()).results;
    if (payload.assetFingerprint !== undefined) {
      const library = await env.DB.prepare('SELECT id,content_type AS contentType FROM image_library_web WHERE owner_id=? AND deleting=0 AND missing_reason IS NULL ORDER BY id').bind(runner.ownerId).all();
      assets.push(...library.results.map(item=>({id:`library-${item.id}`,kind:'url',reference:`/api/image-library/${item.id}/file`,contentType:item.contentType})));
    }
    if (payload.assetFingerprint !== undefined && await planAssetFingerprint(env, job.project_id) !== payload.assetFingerprint) return conflict();
    let outline=plan.outline;
    if(payload.draftBatchId){
      const preview=await loadBatchWordPreview(env,runner.ownerId,job.project_id,payload.draftBatchId,payload.planVersion);
      if(!preview||preview.fingerprint!==payload.draftBatchFingerprint)return conflict();
      outline=previewOutline(outline,preview.drafts);
    }
    return Response.json({ projectTitle: job.project_title, outline, version: plan.version, assets, ...(job.export_format_json ? {exportFormat: JSON.parse(job.export_format_json)} : {}), hasTemplate: !!payload.templateJobId, ...(payload.templateJobId ? { templateValues: values ? JSON.parse(values.values_json) : {} } : {}) });
  }
  let globalFacts = [];
  if (payload.factsSnapshot) {
    if (!await globalFactSourcesCurrent(env, runner.ownerId, job.project_id, payload.factsSnapshot)) return conflict();
    const facts = await env.DB.prepare('SELECT revision, groups_json FROM project_global_facts WHERE project_id = ?').bind(job.project_id).first();
    if ((facts?.revision || 0) !== payload.factsRevision) return conflict();
    globalFacts = facts ? JSON.parse(facts.groups_json) : [];
  }
  let knowledgeEntries;
  if (payload.knowledgeSnapshot?.ids?.length) {
    if (payload.knowledgeConsent !== true || !await knowledgeSnapshotCurrent(env, runner.ownerId, payload.knowledgeSnapshot)) return conflict();
    knowledgeEntries = await readKnowledgeSources(env, runner.ownerId, payload.knowledgeSnapshot.ids);
    if (!await knowledgeSnapshotCurrent(env, runner.ownerId, payload.knowledgeSnapshot) || !await globalFactSourcesCurrent(env, runner.ownerId, job.project_id, payload.factsSnapshot)) return conflict();
  }
  if (job.kind === 'technical-plan.generate-batch') {
    const find = items => items.flatMap(item => item.children?.length ? find(item.children) : [{id:item.id,number:item.number,title:item.title,description:item.description}]);
    const available = new Map(find(plan.outline).map(item => [item.id,item]));
    if (!Array.isArray(payload.targets) || payload.targets.some(id => !available.has(id))) return conflict();
    const completed = await env.DB.prepare('SELECT node_id FROM technical_batch_drafts WHERE job_id=? AND owner_id=? ORDER BY created_at,node_id').bind(jobId,runner.ownerId).all();
    const savedPlan = payload.planning === true ? await env.DB.prepare('SELECT plans_json FROM technical_batch_plans WHERE job_id=? AND owner_id=?').bind(jobId,runner.ownerId).first() : null;
    const savedWordPlan=payload.wordAdjustment===true?await env.DB.prepare('SELECT plan_json FROM technical_batch_word_plans WHERE job_id=? AND owner_id=?').bind(jobId,runner.ownerId).first():null;
    const savedAdjustments=payload.wordAdjustment===true?await env.DB.prepare('SELECT node_id FROM technical_batch_word_adjustments WHERE job_id=? AND owner_id=? ORDER BY node_id').bind(jobId,runner.ownerId).all():null;
    let wordComplete=payload.wordAdjustment!==true;if(payload.wordAdjustment===true&&savedWordPlan){const plan=JSON.parse(savedWordPlan.plan_json),jobs=plan?.jobs||[],actual=new Set(savedAdjustments.results.map(item=>item.node_id));wordComplete=jobs.length===actual.size&&jobs.every(item=>actual.has(item.nodeId));}
    let consistencyInput=null,consistencyManifest=null,consistencyReview=null;
    let consistencyLedgerIds;
    if(payload.consistencyLedger===true){if(payload.ledgerConsent!==true||payload.consistency!==true)return conflict();const rows=await env.DB.prepare('SELECT node_id FROM technical_batch_consistency_ledger WHERE job_id=? AND owner_id=? ORDER BY node_id').bind(jobId,runner.ownerId).all();consistencyLedgerIds=rows.results.map(row=>row.node_id);}
    if(payload.consistency===true){if(payload.consistencyConsent!==true)return conflict();const saved=await env.DB.prepare('SELECT review_json FROM technical_batch_consistency WHERE job_id=? AND owner_id=?').bind(jobId,runner.ownerId).first();consistencyReview=saved?JSON.parse(saved.review_json):null;if(completed.results.length===payload.targets.length&&wordComplete){const leaves=items=>items.flatMap(item=>item.children?.length?leaves(item.children):[item]),targets=new Set(payload.targets);if(payload.consistencyLedger===true){const references=leaves(plan.outline).filter(item=>!targets.has(item.id)&&item.has_content).map(item=>({id:item.id,title:item.title})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);consistencyManifest={chapters:payload.targets.map(id=>({id,title:available.get(id).title})),references,globalFacts};}else{const rows=(await env.DB.prepare('SELECT d.node_id AS id,COALESCE(a.content,d.content) AS content FROM technical_batch_drafts d LEFT JOIN technical_batch_word_adjustments a ON a.job_id=d.job_id AND a.owner_id=d.owner_id AND a.node_id=d.node_id WHERE d.job_id=? AND d.owner_id=?').bind(jobId,runner.ownerId).all()).results,byId=new Map(rows.map(item=>[item.id,item.content]));const references=leaves(plan.outline).filter(item=>!targets.has(item.id)&&String(item.content||'').trim()).map(item=>({id:item.id,title:item.title,content:item.content})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);if(payload.targets.some(id=>!byId.has(id)))return conflict();consistencyInput={chapters:payload.targets.map(id=>({id,title:available.get(id).title,content:byId.get(id)})),references,globalFacts};}}}
    const active=await env.DB.prepare("SELECT 1 AS ok FROM jobs j JOIN project_technical_plans p ON p.project_id=j.project_id WHERE j.id=? AND j.owner_id=? AND j.runner_id=? AND j.lease_hash=? AND j.state='running' AND j.lease_expires_at>? AND p.version=?").bind(jobId,runner.ownerId,runner.id,await digest(input.lease),Date.now(),payload.planVersion).first();
    if (!active || !await globalFactSourcesCurrent(env,runner.ownerId,job.project_id,payload.factsSnapshot) || !await knowledgeSnapshotCurrent(env,runner.ownerId,payload.knowledgeSnapshot)) return conflict();
    const outline = items => items.map(item=>({id:item.id,number:item.number,title:item.title,description:item.description,...(item.children?.length?{children:outline(item.children)}:{})}));
    return Response.json({projectTitle:job.project_title,nodes:payload.targets.map(id=>available.get(id)),...(payload.planning===true?{outline:outline(plan.outline)}:{}),completedDrafts:completed.results.map(item=>item.node_id),...(payload.wordAdjustment===true?{wordPlanSaved:!!savedWordPlan,wordPlan:savedWordPlan?JSON.parse(savedWordPlan.plan_json):null,wordAdjustmentIds:savedAdjustments.results.map(item=>item.node_id)}:{}),...(payload.planning===true?{contentPlans:savedPlan?JSON.parse(savedPlan.plans_json):null}:{}),...(payload.consistency===true?{...(payload.consistencyLedger===true?{consistencyManifest}:{consistencyInput}),consistencyReview}:{}),...(payload.consistencyLedger===true?{consistencyLedgerIds}:{}),globalFacts,globalFactsIncludeRup:!!payload.factsSnapshot?.sources?.includeRup,...(knowledgeEntries?{knowledgeEntries}:{})});
  }
  const row = plan.rows.find(item => item.node_id === payload.nodeId);
  if (!row || plan.rows.some(item => item.parent_node_id === payload.nodeId)) return conflict();
  function find(items) { for (const item of items) { if (item.id === payload.nodeId) return item; const nested = find(item.children || []); if (nested) return nested; } return null; }
  const node = find(plan.outline);
  return Response.json({ projectTitle: job.project_title, node: { id: node.id, number: node.number, title: node.title, description: node.description }, globalFacts, globalFactsIncludeRup: !!payload.factsSnapshot?.sources?.includeRup, ...(knowledgeEntries ? { knowledgeEntries } : {}) });
}
export async function runnerKnowledgeDocument(request, env, runner, jobId, documentId) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let input; try { input = await request.json(); } catch { return bad(); }
  if (typeof input?.lease !== 'string' || !/^[a-f0-9]{64}$/.test(input.lease)) return bad();
  const hash = await digest(input.lease);
  const active = async () => env.DB.prepare("SELECT j.project_id, j.payload_json FROM jobs j JOIN project_technical_plans p ON p.project_id = j.project_id AND p.version = json_extract(j.payload_json, '$.planVersion') WHERE j.id = ? AND j.owner_id = ? AND j.runner_id = ? AND j.lease_hash = ? AND j.state = 'running' AND j.lease_expires_at > ? AND j.kind IN ('technical-plan.generate-section','technical-plan.generate-batch')").bind(jobId, runner.ownerId, runner.id, hash, Date.now()).first();
  const job = await active(); if (!job) return conflict();
  const payload = JSON.parse(job.payload_json);
  if (payload.includeKnowledgeDocuments !== true || payload.knowledgeDocumentConsent !== true || payload.knowledgeConsent !== true || !payload.knowledgeSnapshot?.ids?.length) return conflict();
  if (!await knowledgeSnapshotCurrent(env, runner.ownerId, payload.knowledgeSnapshot) || !await globalFactSourcesCurrent(env, runner.ownerId, job.project_id, payload.factsSnapshot)) return conflict();
  const entries = await readKnowledgeSources(env, runner.ownerId, payload.knowledgeSnapshot.ids);
  if (!entries.some(entry => entry.documentId === documentId)) return missing();
  const doc = await env.DB.prepare('SELECT name, content_type, object_key FROM knowledge_documents WHERE id = ? AND owner_id = ? AND deleting = 0 AND missing_reason IS NULL').bind(documentId, runner.ownerId).first();
  if (!doc) return conflict();
  const object = await env.FILES.get(doc.object_key); if (!object) return missing();
  if (!await active() || !await knowledgeSnapshotCurrent(env, runner.ownerId, payload.knowledgeSnapshot) || !await globalFactSourcesCurrent(env, runner.ownerId, job.project_id, payload.factsSnapshot)) return conflict();
  return new Response(object.body, { headers: { 'content-type': doc.content_type, 'x-savia-file-name': encodeURIComponent(doc.name), 'x-content-type-options': 'nosniff' } });
}
export async function technicalPlan(request, env, ownerId, projectId, nodeId, action) {
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  if (!project) return missing();
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  await ensurePlan(env, projectId);
  const before = await loadPlan(env, projectId);
  if (!nodeId && !action && request.method === 'GET') return Response.json(publicPlan(before));
  let input;
  try { input = await request.json(); } catch { return bad(); }
  if (!Number.isSafeInteger(input?.version) || input.version < 0) return bad();
  if (input.version !== before.version) return conflict();
  const now = new Date().toISOString(), token = crypto.randomUUID();
  const statements = [env.DB.prepare('UPDATE project_technical_plans SET version = version + 1, mutation_token = ?, updated_at = ? WHERE project_id = ? AND version = ?').bind(token, now, projectId, input.version)];
  let created = false;
  if (!nodeId && action === 'nodes' && request.method === 'POST') {
    const parentId = input.parentId ?? null;
    if (!validText(input.title, 300) || !input.title.trim() || !validText(input.description ?? '', 2000) || (parentId !== null && typeof parentId !== 'string') || before.rows.length >= 500) return bad();
    if (parentId !== null && !before.rows.some(row => row.node_id === parentId)) return missing();
    let depth = 1, ancestor = parentId;
    while (ancestor) { const parent = before.rows.find(row => row.node_id === ancestor); if (!parent || ++depth > 10) return bad(); ancestor = parent.parent_node_id; }
    const id = crypto.randomUUID();
    if (parentId && !before.rows.some(row => row.parent_node_id === parentId)) statements.push(env.DB.prepare(`UPDATE project_technical_plan_nodes SET content = '', status = 'idle', plan_json = NULL, updated_at = ? WHERE project_id = ? AND node_id = ? AND ${guard}`).bind(now, projectId, parentId, projectId, token));
    statements.push(env.DB.prepare(`INSERT INTO project_technical_plan_nodes (project_id, node_id, parent_node_id, sort_order, title, description, created_at, updated_at) SELECT ?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM project_technical_plan_nodes WHERE project_id = ? AND parent_node_id IS ?), 0), ?, ?, ?, ? WHERE ${guard}`).bind(projectId, id, parentId, projectId, parentId, input.title.trim(), (input.description ?? '').trim(), now, now, projectId, token));
    created = true;
  } else {
    const node = before.rows.find(row => row.node_id === nodeId);
    if (!node) return missing();
    if (!action && request.method === 'PATCH') {
      if (!validText(input.title, 300) || !input.title.trim() || !validText(input.description ?? '', 2000)) return bad();
      const title = input.title.trim(), description = (input.description ?? '').trim();
      if (title === node.title && description === node.description) return Response.json(publicPlan(before));
      statements.push(env.DB.prepare(`UPDATE project_technical_plan_nodes SET title = ?, description = ?, content = '', status = 'idle', plan_json = NULL, updated_at = ? WHERE project_id = ? AND node_id = ? AND ${guard}`).bind(title, description, now, projectId, nodeId, projectId, token));
    } else if (action === 'content' && request.method === 'PUT') {
      if (!validText(input.content, 1_000_000)) return bad();
      statements.push(env.DB.prepare(`UPDATE project_technical_plan_nodes SET content = ?, status = ?, plan_json = NULL, updated_at = ? WHERE project_id = ? AND node_id = ? AND ${guard}`).bind(input.content, input.content.trim() ? 'success' : 'idle', now, projectId, nodeId, projectId, token));
    } else if (action === 'apply-job' && request.method === 'POST') {
      if (typeof input.jobId !== 'string' || !input.jobId) return bad();
      const job = await env.DB.prepare("SELECT payload_json, result_json FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ? AND kind = 'technical-plan.generate-section' AND state = 'succeeded'").bind(input.jobId, projectId, ownerId).first();
      if (!job) return missing();
      const payload = JSON.parse(job.payload_json), result = JSON.parse(job.result_json);
      if (payload.nodeId !== nodeId || payload.planVersion !== before.version) return conflict();
      if (payload.factsSnapshot) {
        if (!await globalFactSourcesCurrent(env, ownerId, projectId, payload.factsSnapshot)) return conflict();
        const factsGuard = globalFactGuard(payload.factsSnapshot, projectId, ownerId), knowledgeGuard = knowledgeSnapshotGuard(payload.knowledgeSnapshot, ownerId);
        statements[0] = env.DB.prepare(`UPDATE project_technical_plans SET version = version + 1, mutation_token = ?, updated_at = ? WHERE project_id = ? AND version = ? AND COALESCE((SELECT revision FROM project_global_facts WHERE project_id = ?), 0) = ? AND ${factsGuard.sql} AND ${knowledgeGuard.sql}`).bind(token, now, projectId, input.version, projectId, payload.factsRevision, ...factsGuard.args, ...knowledgeGuard.args);
      }
      if (!validText(result?.content, 1_000_000) || !result.content.trim()) return bad();
      statements.push(env.DB.prepare(`UPDATE project_technical_plan_nodes SET content = ?, status = 'success', plan_json = NULL, updated_at = ? WHERE project_id = ? AND node_id = ? AND ${guard}`).bind(result.content, now, projectId, nodeId, projectId, token));
    } else if (!action && request.method === 'DELETE') {
      statements.push(env.DB.prepare(`DELETE FROM project_technical_plan_nodes WHERE project_id = ? AND node_id = ? AND ${guard}`).bind(projectId, nodeId, projectId, token));
      if (node.parent_node_id && before.rows.filter(row => row.parent_node_id === node.parent_node_id).length === 1) statements.push(env.DB.prepare(`UPDATE project_technical_plan_nodes SET content = '', status = 'idle', plan_json = NULL, updated_at = ? WHERE project_id = ? AND node_id = ? AND ${guard}`).bind(now, projectId, node.parent_node_id, projectId, token));
    } else if (action === 'move' && request.method === 'POST') {
      // A reorder preserves node identities and text. Keep pending drafts usable,
      // but do not change a version while a runner is still using it.
      statements[0] = env.DB.prepare(`UPDATE project_technical_plans SET version = version + 1, mutation_token = ?, updated_at = ? WHERE project_id = ? AND version = ? AND NOT EXISTS (SELECT 1 FROM jobs WHERE project_id = ? AND kind IN ('technical-plan.generate-batch','technical-plan.generate-section') AND state IN ('queued','running'))`).bind(token, now, projectId, input.version, projectId);
      statements.push(env.DB.prepare(`UPDATE jobs SET payload_json = json_set(payload_json, '$.planVersion', ?), updated_at = ? WHERE project_id = ? AND owner_id = ? AND kind IN ('technical-plan.generate-batch','technical-plan.generate-section') AND state IN ('succeeded','failed','interrupted','cancelled') AND json_extract(payload_json, '$.planVersion') = ? AND NOT EXISTS (SELECT 1 FROM technical_batch_applications a WHERE a.job_id = jobs.id) AND ${guard}`).bind(input.version + 1, now, projectId, ownerId, input.version, projectId, token));
      const oldOutlineFingerprint = (await env.DB.prepare("SELECT json_group_array(json_array(node_id, parent_node_id, sort_order, title, description, content_mode, COALESCE(attr,''))) AS fingerprint FROM (SELECT * FROM project_technical_plan_nodes WHERE project_id = ? ORDER BY node_id)").bind(projectId).first()).fingerprint;
      const siblings = before.rows.filter(row => row.parent_node_id === node.parent_node_id).sort((a, b) => a.sort_order - b.sort_order || a.node_id.localeCompare(b.node_id));
      const index = siblings.findIndex(row => row.node_id === nodeId);
      if (typeof input.targetId === 'string' && ['before','after'].includes(input.position)) {
        if (input.targetId === nodeId || !siblings.some(row => row.node_id === input.targetId)) return bad();
        const reordered = siblings.filter(row => row.node_id !== nodeId), target = reordered.findIndex(row => row.node_id === input.targetId);
        reordered.splice(target + (input.position === 'after' ? 1 : 0), 0, node);
        const orders = reordered.map((row, order) => ({id:row.node_id, order}));
        statements.push(env.DB.prepare(`UPDATE project_technical_plan_nodes SET sort_order = (SELECT json_extract(value, '$.order') FROM json_each(?) WHERE json_extract(value, '$.id') = node_id), updated_at = ? WHERE project_id = ? AND node_id IN (SELECT json_extract(value, '$.id') FROM json_each(?)) AND ${guard}`).bind(JSON.stringify(orders),now,projectId,JSON.stringify(orders),projectId,token));
      } else {
        if (!['up', 'down'].includes(input.direction)) return bad();
        const other = siblings[index + (input.direction === 'up' ? -1 : 1)];
        if (!other) return bad();
        statements.push(env.DB.prepare(`UPDATE project_technical_plan_nodes SET sort_order = CASE node_id WHEN ? THEN ? WHEN ? THEN ? END, updated_at = ? WHERE project_id = ? AND node_id IN (?, ?) AND ${guard}`).bind(nodeId, other.sort_order, other.node_id, node.sort_order, now, projectId, nodeId, other.node_id, projectId, token));
      }
      // Rebase only snapshots that matched the exact pre-move structure. A
      // previously stale snapshot must never become current through a move.
      const fingerprintSql = "SELECT json_group_array(json_array(node_id, parent_node_id, sort_order, title, description, content_mode, COALESCE(attr,''))) FROM (SELECT * FROM project_technical_plan_nodes WHERE project_id = ? ORDER BY node_id)";
      statements.push(env.DB.prepare(`UPDATE project_global_facts SET snapshot_json = json_set(snapshot_json, '$.outlineFingerprint', ((${fingerprintSql}) || '')) WHERE project_id = ? AND json_extract(snapshot_json, '$.outlineFingerprint') = ? AND ${guard}`).bind(projectId, projectId, oldOutlineFingerprint, projectId, token));
      statements.push(env.DB.prepare(`UPDATE jobs SET payload_json = json_set(payload_json, '$.factsSnapshot.outlineFingerprint', ((${fingerprintSql}) || '')) WHERE project_id = ? AND owner_id = ? AND kind IN ('technical-plan.generate-batch','technical-plan.generate-section') AND json_extract(payload_json, '$.planVersion') = ? AND json_extract(payload_json, '$.factsSnapshot.outlineFingerprint') = ? AND ${guard}`).bind(projectId, projectId, ownerId, input.version + 1, oldOutlineFingerprint, projectId, token));
    } else return new Response('Method not allowed', { status: 405 });
  }
  const result = await env.DB.batch(statements);
  if (result[0].meta.changes !== 1) return conflict();
  const after = await loadPlan(env, projectId);
  return Response.json(publicPlan(after), { status: created ? 201 : 200 });
}
