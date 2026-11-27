import { outlineGuard, outlineSnapshotCurrent, expandedOutlineGuard } from './outline-sources.js';
const attributes = ['通用', '商务/资信', '技术', '其他', '目录', '报价', '业绩'];
const modes = ['ai-generate', 'template-fill', 'directory-generate', 'manual-fill', 'other'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const missing = () => Response.json({ error: 'not_found' }, { status: 404 });
const bad = () => Response.json({ error: 'invalid_input' }, { status: 400 });
const conflict = () => Response.json({ error: 'sources_or_version_conflict' }, { status: 409 });
function validRoots(items) {
  return Array.isArray(items) && items.length > 0 && items.length <= 50 && new Set(items.map(item => item?.id)).size === items.length && items.every(item => item && uuid.test(item.id) && typeof item.title === 'string' && !!item.title.trim() && item.title.length <= 300 && typeof item.description === 'string' && !!item.description.trim() && item.description.length <= 2000 && attributes.includes(item.attr) && modes.includes(item.content_mode) && !item.children && (item.content_mode_note === undefined || (typeof item.content_mode_note === 'string' && item.content_mode_note.length <= 2000)));
}
function reconcileRootNodes(items, roots) {
  if (!Array.isArray(items) || !Array.isArray(roots) || items.length !== roots.length) return null;
  const byId = new Map();
  for (const item of items) {
    if (typeof item?.id !== 'string' || byId.has(item.id)) return null;
    byId.set(item.id, item);
  }
  const confirmedIds = new Set(roots.map(root => root?.id));
  const direct = roots.map(root => byId.get(root?.id));
  if (direct.every((node, index) => {
    const root = roots[index];
    return node && root && node.title === root.title && node.description === root.description && node.attr === root.attr;
  })) {
    return direct;
  }
  // Recover transposed confirmed IDs on any root, or regenerated IDs only on locked non-AI leaf roots whose title, description, and attr match verbatim.
  const used = new Set();
  const recovered = [];
  for (const root of roots) {
    if (!root) return null;
    const matchIndex = items.findIndex((item, index) => (
      !used.has(index) &&
      item?.title === root.title &&
      item?.description === root.description &&
      item?.attr === root.attr &&
      (confirmedIds.has(item.id) || (root.content_mode !== 'ai-generate' && !item.children?.length))
    ));
    if (matchIndex === -1) return null;
    used.add(matchIndex);
    recovered.push({ ...items[matchIndex], id: root.id });
  }
  return recovered;
}

export function flattenExpanded(items, roots) {
  const ordered = reconcileRootNodes(items, roots);
  if (!ordered) return null;
  const flattened = [], seen = new Set();
  function visit(nodes, parentId, depth) {
    if (!Array.isArray(nodes) || !nodes.length || depth > 6) return false;
    for (const [index, node] of nodes.entries()) {
      if (!node || !uuid.test(node.id) || seen.has(node.id) || typeof node.title !== 'string' || !node.title.trim() || node.title.length > 300 || typeof node.description !== 'string' || !node.description.trim() || node.description.length > 2000 || (node.content_mode_note !== undefined && (typeof node.content_mode_note !== 'string' || node.content_mode_note.length > 2000))) return false;
      seen.add(node.id);
      const branch = Array.isArray(node.children) && node.children.length > 0;
      if (node.children !== undefined && !branch) return false;
      if (branch && node.children.length < 2 || !branch && !modes.includes(node.content_mode)) return false;
      if (depth === 1) { const root = roots[index]; if (!root || node.id !== root.id || node.title !== root.title || node.description !== root.description || node.attr !== root.attr || (branch && root.content_mode !== 'ai-generate')) return false; }
      flattened.push({ id: node.id, parent: parentId, order: index, title: node.title.trim(), description: node.description.trim(), attr: depth === 1 ? node.attr : null, mode: branch ? 'manual-fill' : depth === 1 ? roots[index].content_mode : node.content_mode, note: (depth === 1 ? roots[index].content_mode_note : node.content_mode_note) || null });
      if (flattened.length > 500 || (branch && !visit(node.children, node.id, depth + 1))) return false;
    }
    return true;
  }
  return visit(ordered, null, 1) ? flattened : null;
}
async function applyExpanded(request, env, ownerId, projectId) {
  let input; try { input = await request.json(); } catch { return bad(); }
  if (typeof input?.jobId !== 'string') return bad();
  const previous = await env.DB.prepare('SELECT plan_version FROM project_outline_applications WHERE project_id = ? AND job_id = ?').bind(projectId, input.jobId).first();
  if (previous) return Response.json({ version: previous.plan_version });
  const job = await env.DB.prepare("SELECT payload_json, result_json FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ? AND kind = 'technical-plan.expand-outline' AND state = 'succeeded'").bind(input.jobId, projectId, ownerId).first();
  if (!job) return missing();
  const payload = JSON.parse(job.payload_json), result = JSON.parse(job.result_json);
  if (!await outlineSnapshotCurrent(env, ownerId, projectId, payload.outlineSnapshot)) return conflict();
  const selected = await env.DB.prepare('SELECT items_json FROM project_outline_root_selections WHERE project_id = ? AND revision = ? AND job_id = ?').bind(projectId, payload.selectionRevision, payload.selectionJobId).first();
  if (!selected) return conflict();
  const nodes = flattenExpanded(result?.outline, JSON.parse(selected.items_json));
  if (!nodes) return bad();
  if (input.edits !== undefined) {
    if (!Array.isArray(input.edits) || input.edits.length > nodes.length || new Set(input.edits.map(item => item?.id)).size !== input.edits.length || input.edits.some(item => !item || !nodes.some(node => node.id === item.id) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 300 || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 2000)) return bad();
    const changes = new Map(input.edits.map(item => [item.id, item]));
    for (const node of nodes) { const edit = changes.get(node.id); if (edit) { node.title = edit.title.trim(); node.description = edit.description.trim(); } }
  }
  const guard = expandedOutlineGuard(payload.outlineSnapshot, projectId, ownerId, payload.selectionRevision, payload.selectionJobId), now = new Date().toISOString(), token = crypto.randomUUID(), version = payload.outlineSnapshot.planVersion + 1;
  const own = 'EXISTS (SELECT 1 FROM project_technical_plans WHERE project_id = ? AND mutation_token = ?)';
  const batch = await env.DB.batch([
    env.DB.prepare(`UPDATE project_technical_plans SET version = version + 1, mutation_token = ?, updated_at = ? WHERE project_id = ? AND version = ? AND ${guard.sql}`).bind(token, now, projectId, payload.outlineSnapshot.planVersion, ...guard.args),
    env.DB.prepare(`DELETE FROM project_technical_plan_nodes WHERE project_id = ? AND ${own}`).bind(projectId, projectId, token),
    env.DB.prepare(`INSERT INTO project_technical_plan_nodes (project_id, node_id, parent_node_id, sort_order, title, description, attr, content_mode, content_mode_note, created_at, updated_at) SELECT ?, json_extract(value,'$.id'), json_extract(value,'$.parent'), json_extract(value,'$.order'), json_extract(value,'$.title'), json_extract(value,'$.description'), json_extract(value,'$.attr'), json_extract(value,'$.mode'), json_extract(value,'$.note'), ?, ? FROM json_each(?) WHERE ${own}`).bind(projectId, now, now, JSON.stringify(nodes), projectId, token),
    env.DB.prepare(`INSERT INTO project_outline_applications (project_id, job_id, plan_version, created_at) SELECT ?, ?, ?, ? WHERE ${own} ON CONFLICT DO NOTHING`).bind(projectId, input.jobId, version, now, projectId, token),
  ]);
  if (batch[0].meta.changes === 1) return Response.json({ version });
  const retried = await env.DB.prepare('SELECT plan_version FROM project_outline_applications WHERE project_id = ? AND job_id = ?').bind(projectId, input.jobId).first();
  return retried ? Response.json({ version: retried.plan_version }) : conflict();
}
export async function technicalOutline(request, env, ownerId, projectId, action) {
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  if (!project) return missing();
  if (request.method === 'GET' && !action) {
    const [selection, jobs, expansions] = await env.DB.batch([env.DB.prepare('SELECT * FROM project_outline_root_selections WHERE project_id = ?').bind(projectId), env.DB.prepare("SELECT id, state, progress, updated_at, (SELECT name FROM runners WHERE runners.id=jobs.runner_id) AS runner_name, payload_json, result_json FROM jobs WHERE project_id = ? AND owner_id = ? AND kind = 'technical-plan.generate-roots' ORDER BY created_at DESC, id").bind(projectId, ownerId), env.DB.prepare("SELECT j.id, j.state, j.progress, j.updated_at, (SELECT name FROM runners WHERE runners.id=j.runner_id) AS runner_name, j.payload_json, j.result_json, a.plan_version AS applied_version FROM jobs j LEFT JOIN project_outline_applications a ON a.project_id = j.project_id AND a.job_id = j.id WHERE j.project_id = ? AND j.owner_id = ? AND j.kind = 'technical-plan.expand-outline' ORDER BY j.created_at DESC, j.id").bind(projectId, ownerId)]);
    const selected = selection.results[0];
    const selectedJob = selected && jobs.results.find(row=>row.id===selected.job_id);
    const selectedView = selected ? { jobId: selected.job_id, revision: selected.revision, items: JSON.parse(selected.items_json), current: !JSON.parse(selectedJob?.result_json || '{}').outlineDiscarded && await outlineSnapshotCurrent(env, ownerId, projectId, JSON.parse(selected.snapshot_json)) } : null;
    const views = await Promise.all(jobs.results.map(async row => { const payload = JSON.parse(row.payload_json), result=row.result_json ? JSON.parse(row.result_json) : null; return { id: row.id, state: row.state, progress:row.state==='running'?row.progress:null, runnerName:row.runner_name, updatedAt:row.updated_at, fileIds: payload.fileIds, discarded:result?.outlineDiscarded===true, stale: !await outlineSnapshotCurrent(env, ownerId, projectId, payload.outlineSnapshot), result }; }));
    const expanded = await Promise.all(expansions.results.map(async row => { const payload = JSON.parse(row.payload_json); let current = false; if (await outlineSnapshotCurrent(env, ownerId, projectId, payload.outlineSnapshot)) { const guard = expandedOutlineGuard(payload.outlineSnapshot, projectId, ownerId, payload.selectionRevision, payload.selectionJobId); current = Boolean(await env.DB.prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.args).first()); } return { id: row.id, selectionJobId:payload.selectionJobId, state: row.state, progress:row.state==='running'?row.progress:null, runnerName:row.runner_name, updatedAt:row.updated_at, stale: !current, appliedVersion: row.applied_version, result: row.result_json ? JSON.parse(row.result_json) : null }; }));
    return Response.json({ selection: selectedView, jobs: views, expansions: expanded });
  }
  if (request.method !== 'POST' || !['selection', 'apply', 'discard'].includes(action)) return missing();
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  if (action === 'apply') return applyExpanded(request, env, ownerId, projectId);
  if (action === 'discard') {
    let input; try { input=await request.json(); } catch { return bad(); }
    if (typeof input?.jobId!=='string') return bad();
    const updated=await env.DB.prepare(`UPDATE jobs SET result_json=json_set(result_json,'$.outlineDiscarded',json('true')) WHERE id=? AND project_id=? AND owner_id=? AND kind='technical-plan.generate-roots' AND state='succeeded' AND NOT EXISTS (SELECT 1 FROM jobs e LEFT JOIN project_outline_applications a ON a.project_id=e.project_id AND a.job_id=e.id WHERE e.project_id=jobs.project_id AND e.owner_id=jobs.owner_id AND e.kind='technical-plan.expand-outline' AND json_extract(e.payload_json,'$.selectionJobId')=jobs.id AND (e.state IN ('queued','running') OR a.job_id IS NOT NULL))`).bind(input.jobId,projectId,ownerId).run();
    return updated.meta.changes ? Response.json({discarded:true}) : conflict();
  }
  let input; try { input = await request.json(); } catch { return bad(); }
  if (!input || typeof input.jobId !== 'string' || !Number.isSafeInteger(input.revision) || input.revision < 0 || !Array.isArray(input.items) || !input.items.length || input.items.length > 50 || new Set(input.items.map(item => item?.id)).size !== input.items.length || input.items.some(item => !item || !uuid.test(item.id) || !attributes.includes(item.attr) || !modes.includes(item.content_mode) || (item.content_mode_note !== undefined && (typeof item.content_mode_note !== 'string' || item.content_mode_note.length > 2000)))) return bad();
  const job = await env.DB.prepare("SELECT payload_json, result_json FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ? AND kind = 'technical-plan.generate-roots' AND state = 'succeeded'").bind(input.jobId, projectId, ownerId).first();
  if (!job) return missing();
  const payload = JSON.parse(job.payload_json), roots = JSON.parse(job.result_json)?.outline;
  if (JSON.parse(job.result_json)?.outlineDiscarded) return conflict();
  if (!validRoots(roots) || input.items.some(item => !roots.some(root => root.id === item.id))) return bad();
  if (!await outlineSnapshotCurrent(env, ownerId, projectId, payload.outlineSnapshot)) return conflict();
  const choices = new Map(input.items.map(item => [item.id, item]));
  const items = roots.filter(root => choices.has(root.id)).map(root => { const choice = choices.get(root.id); return { id: root.id, title: root.title, description: root.description, attr: choice.attr, content_mode: choice.content_mode, ...(choice.content_mode === 'other' && choice.content_mode_note?.trim() ? { content_mode_note: choice.content_mode_note.trim() } : {}) }; });
  const snapshot = payload.outlineSnapshot, guard = outlineGuard(snapshot, projectId, ownerId), serialized = JSON.stringify(items);
  const row = await env.DB.prepare(`INSERT INTO project_outline_root_selections (project_id, revision, job_id, items_json, snapshot_json, updated_at) SELECT ?, 1, ?, ?, ?, ? WHERE ${guard.sql} AND COALESCE((SELECT revision FROM project_outline_root_selections WHERE project_id = ?), 0) = ? ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1, job_id = excluded.job_id, items_json = excluded.items_json, snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at RETURNING revision`)
    .bind(projectId, input.jobId, serialized, JSON.stringify(snapshot), new Date().toISOString(), ...guard.args, projectId, input.revision).first();
  if (row) return Response.json({ revision: row.revision });
  const prior = await env.DB.prepare(`SELECT revision FROM project_outline_root_selections WHERE project_id = ? AND job_id = ? AND items_json = ? AND revision = ? AND ${guard.sql}`).bind(projectId, input.jobId, serialized, input.revision + 1, ...guard.args).first();
  return prior ? Response.json({ revision: prior.revision }) : conflict();
}
