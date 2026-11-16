import matrixFormatter from '../../client/electron/services/requirementMatrixCsv.cjs';
import { comparisonsForProject } from './rup-comparison.js';

const stages = ['evaluating', 'preparing', 'submitted', 'awarded', 'not_awarded', 'discarded'];
const statuses = ['pending', 'meets', 'does_not_meet', 'unknown'];
const categories = ['general', 'legal', 'financial', 'technical', 'experience'];
const bad = () => Response.json({ error: 'invalid_input' }, { status: 400 });
const conflict = () => Response.json({ error: 'version_conflict' }, { status: 409 });
const missing = () => Response.json({ error: 'not_found' }, { status: 404 });
const text = (value, max = 300) => typeof value === 'string' && value.length <= max;
const validVersion = value => Number.isSafeInteger(value) && value >= 0;
function date(value) { return value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value); }
function view(row, kind) {
  const common = { id: row.id, projectId: row.project_id, title: row.title, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at };
  return kind === 'tasks' ? { ...common, dueDate: row.due_date, completed: !!row.completed } : { ...common, source: row.source, evidence: row.evidence, status: row.status, category: row.category };
}
export async function workflow(request, env, ownerId, projectId, kind, itemId) {
  const project = await env.DB.prepare('SELECT id, title FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  if (!project) return missing();
  if (kind === 'requirements' && itemId === 'export') {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    const params = new URL(request.url).searchParams;
    const format = params.get('format');
    if (!['csv', 'xlsx'].includes(format)) return bad();
    const rows = await env.DB.prepare('SELECT * FROM project_requirements WHERE project_id = ? ORDER BY created_at, id').bind(projectId).all();
    if (!rows.results.length) return Response.json({ error: 'no_requirements' }, { status: 400 });
    const secop = await env.DB.prepare('SELECT process_json FROM project_secop WHERE project_id = ? AND owner_id = ?').bind(projectId, ownerId).first();
    const source = secop ? JSON.parse(secop.process_json) : {};
    const comparisons = await comparisonsForProject(env, ownerId, projectId);
    const input = { process: { id: source.id || project.id, reference: source.reference, entity: source.entity, title: source.title || project.title }, exportedAt: new Date().toISOString(), rows: rows.results.map(row => ({ requirement: view(row, 'requirements'), comparison: comparisons.get(row.id) || null })) };
    const language = params.get('language') === 'en' ? 'en' : 'es';
    const content = format === 'csv' ? matrixFormatter.formatRequirementMatrixCsv(input, language) : matrixFormatter.formatRequirementMatrixXlsx(input, language);
    return new Response(content, { headers: { 'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="matriz-requisitos.${format}"` } });
  }
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  let input;
  if (request.method !== 'GET') { try { input = await request.json(); } catch { return bad(); } }
  const now = new Date().toISOString();
  if (!kind) {
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT stage, version, updated_at AS updatedAt FROM project_workflow WHERE project_id = ?').bind(projectId).first();
      return Response.json(row || { stage: 'evaluating', version: 0, updatedAt: null });
    }
    if (request.method !== 'PUT') return new Response('Method not allowed', { status: 405 });
    if (!stages.includes(input?.stage) || !validVersion(input?.version)) return bad();
    const row = input.version === 0
      ? await env.DB.prepare('INSERT INTO project_workflow (project_id, stage, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(project_id) DO NOTHING RETURNING stage, version, updated_at AS updatedAt').bind(projectId, input.stage, now).first()
      : await env.DB.prepare('UPDATE project_workflow SET stage = ?, version = version + 1, updated_at = ? WHERE project_id = ? AND version = ? RETURNING stage, version, updated_at AS updatedAt').bind(input.stage, now, projectId, input.version).first();
    return row ? Response.json(row) : conflict();
  }
  const table = kind === 'tasks' ? 'project_tasks' : 'project_requirements';
  if (!itemId && request.method === 'GET') {
    const result = await env.DB.prepare(`SELECT * FROM ${table} WHERE project_id = ? ORDER BY created_at, id`).bind(projectId).all();
    return Response.json({ items: result.results.map(row => view(row, kind)) });
  }
  if (!itemId && request.method === 'POST') {
    if (!text(input?.title) || !input.title.trim()) return bad();
    const id = crypto.randomUUID(); let row;
    if (kind === 'tasks') {
      const dueDate = input.dueDate ?? '';
      if (!date(dueDate)) return bad();
      row = await env.DB.prepare('INSERT INTO project_tasks (id, project_id, title, due_date, completed, version, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 1, ?, ?) RETURNING *').bind(id, projectId, input.title.trim(), dueDate, now, now).first();
    } else {
      const source = input.source ?? '', evidence = input.evidence ?? '', status = input.status ?? 'pending', category = input.category ?? 'general';
      if (!text(source, 20000) || !text(evidence) || !statuses.includes(status) || !categories.includes(category)) return bad();
      row = await env.DB.prepare('INSERT INTO project_requirements (id, project_id, title, source, evidence, status, category, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?) RETURNING *').bind(id, projectId, input.title.trim(), source.trim(), evidence.trim(), status, category, now, now).first();
    }
    return Response.json({ item: view(row, kind) }, { status: 201 });
  }
  if (itemId && ['PATCH', 'DELETE'].includes(request.method)) {
    if (!validVersion(input?.version) || input.version < 1) return bad();
    let row;
    if (request.method === 'DELETE') row = await env.DB.prepare(`DELETE FROM ${table} WHERE project_id = ? AND id = ? AND version = ? RETURNING *`).bind(projectId, itemId, input.version).first();
    else if (kind === 'tasks') {
      if (typeof input.completed !== 'boolean') return bad();
      row = await env.DB.prepare('UPDATE project_tasks SET completed = ?, version = version + 1, updated_at = ? WHERE project_id = ? AND id = ? AND version = ? RETURNING *').bind(input.completed ? 1 : 0, now, projectId, itemId, input.version).first();
    } else {
      if (!text(input.title) || !input.title.trim() || !text(input.source, 20000) || !text(input.evidence) || !statuses.includes(input.status) || !categories.includes(input.category)) return bad();
      row = await env.DB.prepare('UPDATE project_requirements SET title = ?, source = ?, evidence = ?, status = ?, category = ?, version = version + 1, updated_at = ? WHERE project_id = ? AND id = ? AND version = ? RETURNING *').bind(input.title.trim(), input.source.trim(), input.evidence.trim(), input.status, input.category, now, projectId, itemId, input.version).first();
    }
    if (row) return Response.json({ item: view(row, kind) });
    const exists = await env.DB.prepare(`SELECT id FROM ${table} WHERE project_id = ? AND id = ?`).bind(projectId, itemId).first();
    return exists ? conflict() : missing();
  }
  return new Response('Method not allowed', { status: 405 });
}
