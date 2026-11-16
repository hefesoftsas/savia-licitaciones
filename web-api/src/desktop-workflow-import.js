const stages = ['evaluating', 'preparing', 'submitted', 'awarded', 'not_awarded', 'discarded'];
const statuses = ['pending', 'meets', 'does_not_meet', 'unknown'];
const categories = ['general', 'legal', 'financial', 'technical', 'experience'];
const text = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || !!value.trim());
const date = value => value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
const bad = () => Response.json({ error: 'invalid_workflow' }, { status: 400 });

export async function importDesktopWorkflow(request, env, runner, requestId) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 let input; try { input = await request.json(); } catch { return bad(); }
 if (!input || !(input.stage === null || stages.includes(input.stage)) || !(input.stageUpdatedAt === null || text(input.stageUpdatedAt, 100)) || !Array.isArray(input.tasks) || !Array.isArray(input.requirements) || input.tasks.length > 500 || input.requirements.length > 500) return bad();
 const taskIds = new Set(), requirementIds = new Set();
 for (const item of input.tasks) {
  if (!item || !text(item.id, 256, true) || taskIds.has(item.id) || !text(item.title, 300, true) || !date(item.dueDate) || typeof item.completed !== 'boolean' || !text(item.createdAt, 100, true) || !text(item.updatedAt, 100, true)) return bad();
  taskIds.add(item.id);
 }
 for (const item of input.requirements) {
  if (!item || !text(item.id, 256, true) || requirementIds.has(item.id) || !text(item.title, 300, true) || !text(item.source, 20000) || !text(item.evidence, 300) || !statuses.includes(item.status) || !categories.includes(item.category) || !text(item.createdAt, 100, true) || !text(item.updatedAt, 100, true)) return bad();
  requirementIds.add(item.id);
 }
 const body = JSON.stringify({ stage: input.stage, stageUpdatedAt: input.stageUpdatedAt, tasks: input.tasks.map(({ id, title, dueDate, completed, createdAt, updatedAt }) => ({ id, title, dueDate, completed, createdAt, updatedAt })), requirements: input.requirements.map(({ id, title, source, evidence, status, category, createdAt, updatedAt }) => ({ id, title, source, evidence, status, category, createdAt, updatedAt })) });
 if (body.length > 3_000_000) return Response.json({ error: 'too_large' }, { status: 413 });
 const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))), byte => byte.toString(16).padStart(2, '0')).join('');
 const project = await env.DB.prepare('SELECT i.project_id FROM desktop_plan_imports i JOIN projects p ON p.id = i.project_id AND p.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ?').bind(runner.ownerId, requestId).first();
 if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
 const token = crypto.randomUUID(), now = new Date().toISOString();
 const tasks = JSON.stringify(input.tasks.map(item => ({ ...item, newId: crypto.randomUUID() })));
 const requirements = JSON.stringify(input.requirements.map(item => ({ ...item, newId: crypto.randomUUID() })));
 const own = 'EXISTS (SELECT 1 FROM desktop_workflow_imports WHERE owner_id = ? AND request_id = ? AND mutation_id = ?)';
 const result = await env.DB.batch([
  env.DB.prepare('INSERT INTO desktop_workflow_imports (owner_id, request_id, project_id, content_hash, mutation_id, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM project_workflow WHERE project_id = ?) AND NOT EXISTS (SELECT 1 FROM project_tasks WHERE project_id = ?) AND NOT EXISTS (SELECT 1 FROM project_requirements WHERE project_id = ?) ON CONFLICT(owner_id, request_id) DO NOTHING').bind(runner.ownerId, requestId, project.project_id, hash, token, now, project.project_id, project.project_id, project.project_id),
  env.DB.prepare(`INSERT INTO project_workflow (project_id, stage, version, updated_at) SELECT ?, ?, 1, ? WHERE ? IS NOT NULL AND ${own}`).bind(project.project_id, input.stage, input.stageUpdatedAt || now, input.stage, runner.ownerId, requestId, token),
  env.DB.prepare(`INSERT INTO project_tasks (id, project_id, title, due_date, completed, version, created_at, updated_at) SELECT json_extract(value, '$.newId'), ?, json_extract(value, '$.title'), json_extract(value, '$.dueDate'), json_extract(value, '$.completed'), 1, json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt') FROM json_each(?) WHERE ${own}`).bind(project.project_id, tasks, runner.ownerId, requestId, token),
  env.DB.prepare(`INSERT INTO desktop_task_id_map (owner_id, request_id, project_id, source_id, task_id) SELECT ?, ?, ?, json_extract(value, '$.id'), json_extract(value, '$.newId') FROM json_each(?) WHERE ${own}`).bind(runner.ownerId, requestId, project.project_id, tasks, runner.ownerId, requestId, token),
  env.DB.prepare(`INSERT INTO project_requirements (id, project_id, title, source, evidence, status, category, version, created_at, updated_at) SELECT json_extract(value, '$.newId'), ?, json_extract(value, '$.title'), json_extract(value, '$.source'), json_extract(value, '$.evidence'), json_extract(value, '$.status'), json_extract(value, '$.category'), 1, json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt') FROM json_each(?) WHERE ${own}`).bind(project.project_id, requirements, runner.ownerId, requestId, token),
  env.DB.prepare(`INSERT INTO desktop_requirement_id_map (owner_id, request_id, project_id, source_id, requirement_id) SELECT ?, ?, ?, json_extract(value, '$.id'), json_extract(value, '$.newId') FROM json_each(?) WHERE ${own}`).bind(runner.ownerId, requestId, project.project_id, requirements, runner.ownerId, requestId, token),
  env.DB.prepare(`UPDATE project_technical_plans SET version = version + 1, updated_at = ? WHERE project_id = ? AND EXISTS (SELECT 1 FROM project_technical_plan_nodes n JOIN json_each(?) r ON n.source_requirement_id = json_extract(r.value, '$.id') WHERE n.project_id = ?) AND ${own}`).bind(now, project.project_id, requirements, project.project_id, runner.ownerId, requestId, token),
  env.DB.prepare(`UPDATE project_technical_plan_nodes SET source_requirement_id = (SELECT json_extract(r.value, '$.newId') FROM json_each(?) r WHERE json_extract(r.value, '$.id') = source_requirement_id) WHERE project_id = ? AND source_requirement_id IN (SELECT json_extract(value, '$.id') FROM json_each(?)) AND ${own}`).bind(requirements, project.project_id, requirements, runner.ownerId, requestId, token),
 ]);
 const counts = { importedTasks: input.tasks.length, importedRequirements: input.requirements.length };
 if (result[0].meta.changes) return Response.json(counts, { status: 201 });
 const previous = await env.DB.prepare('SELECT content_hash FROM desktop_workflow_imports WHERE owner_id = ? AND request_id = ?').bind(runner.ownerId, requestId).first();
 return previous?.content_hash === hash ? Response.json(counts) : Response.json({ error: 'workflow_conflict' }, { status: 409 });
}
