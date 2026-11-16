import { digest } from './runners.js';

const conflict = () => Response.json({ error: 'question_conflict' }, { status: 409 });
const invalid = () => Response.json({ error: 'invalid_question' }, { status: 400 });
const currentBatch = "(j.kind != 'technical-plan.generate-batch' OR EXISTS (SELECT 1 FROM project_technical_plans p WHERE p.project_id=j.project_id AND p.version=json_extract(j.payload_json,'$.planVersion') AND COALESCE((SELECT revision FROM project_global_facts WHERE project_id=j.project_id),0)=json_extract(j.payload_json,'$.factsRevision')))";
export const visible = row => ({ id: row.id, jobId: row.job_id, state: row.state, ...JSON.parse(row.question_json), ...(row.response_json ? { response: JSON.parse(row.response_json) } : {}) });
async function body(request) { try { return await request.json(); } catch { return null; } }
export function validQuestion(input) {
  return typeof input.toolCallId === 'string' && input.toolCallId.length > 0 && input.toolCallId.length <= 200 && typeof input.question === 'string' && !!input.question.trim() && input.question.length <= 12000 && Array.isArray(input.options) && input.options.length >= 2 && input.options.length <= 5 && input.options.every(o => o && typeof o.label === 'string' && !!o.label.trim() && o.label.length <= 500 && typeof o.custom === 'boolean' && (o.description === undefined || (typeof o.description === 'string' && o.description.length <= 2000))) && !input.options[0].custom && input.options.filter(o => o.custom).length <= 1;
}
export async function handleRunnerQuestions(request, env, runner, jobId, questionId) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const input = await body(request);
  if (!input || typeof input.lease !== 'string' || !/^[a-f0-9]{64}$/.test(input.lease)) return invalid();
  const hash = await digest(input.lease), now = Date.now(), stamp = new Date(now).toISOString();
  const active = await env.DB.prepare(`SELECT j.id FROM jobs j WHERE j.id = ? AND j.owner_id = ? AND j.runner_id = ? AND j.lease_hash = ? AND j.state = 'running' AND j.lease_expires_at > ? AND ${currentBatch}`).bind(jobId, runner.ownerId, runner.id, hash, now).first();
  if (!active) return conflict();
  if (questionId) {
    const row = await env.DB.prepare(`SELECT q.* FROM job_questions q JOIN jobs j ON j.id = q.job_id WHERE q.id = ? AND q.job_id = ? AND q.owner_id = ? AND q.lease_hash = ? AND j.runner_id = ? AND j.lease_hash = q.lease_hash AND j.state = 'running' AND j.lease_expires_at > ? AND ${currentBatch}`).bind(questionId, jobId, runner.ownerId, hash, runner.id, Date.now()).first();
    return row ? Response.json({ question: visible(row) }) : conflict();
  }
  if (!validQuestion(input)) return invalid();
  const question = JSON.stringify({ question: input.question, options: input.options.map(o => ({ label: o.label, ...(o.description !== undefined ? { description: o.description } : {}), custom: o.custom })) });
  const id = crypto.randomUUID();
  const row = await env.DB.prepare(`INSERT INTO job_questions (id, job_id, owner_id, lease_hash, tool_call_id, question_json, state, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, 'pending', ?, ? WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = ? AND j.owner_id = ? AND j.runner_id = ? AND j.lease_hash = ? AND j.state = 'running' AND j.lease_expires_at > ? AND ${currentBatch}) ON CONFLICT DO NOTHING RETURNING *`)
    .bind(id, jobId, runner.ownerId, hash, input.toolCallId, question, stamp, stamp, jobId, runner.ownerId, runner.id, hash, now).first();
  if (row) return Response.json({ question: visible(row) }, { status: 201 });
  const existing = await env.DB.prepare(`SELECT q.* FROM job_questions q JOIN jobs j ON j.id=q.job_id WHERE q.job_id = ? AND q.owner_id = ? AND q.lease_hash = ? AND q.tool_call_id = ? AND ${currentBatch}`).bind(jobId, runner.ownerId, hash, input.toolCallId).first();
  return existing && existing.question_json === question ? Response.json({ question: visible(existing) }) : conflict();
}
export async function handleUserQuestions(request, env, userId, projectId, questionId) {
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, userId).first();
  if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
  if (request.method === 'GET' && !questionId) {
    const rows = await env.DB.prepare(`SELECT q.* FROM job_questions q JOIN jobs j ON j.id = q.job_id WHERE j.project_id = ? AND j.owner_id = ? AND j.state = 'running' AND j.lease_expires_at > ? AND j.lease_hash = q.lease_hash AND q.state = 'pending' AND ${currentBatch} ORDER BY q.created_at, q.id`).bind(projectId, userId, Date.now()).all();
    return Response.json({ questions: rows.results.map(visible) });
  }
  if (request.method !== 'POST' || !questionId) return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  const input = await body(request);
  const row = await env.DB.prepare('SELECT q.* FROM job_questions q JOIN jobs j ON j.id = q.job_id WHERE q.id = ? AND j.project_id = ? AND j.owner_id = ?').bind(questionId, projectId, userId).first();
  if (!row) return Response.json({ error: 'not_found' }, { status: 404 });
  const options = JSON.parse(row.question_json).options;
  if (!input || !Number.isInteger(input.option) || input.option < 0 || input.option >= options.length || (options[input.option].custom && (typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 5000)) || (!options[input.option].custom && input.answer !== undefined)) return invalid();
  const option = options[input.option];
  const response = JSON.stringify({ answer: option.custom ? input.answer.trim() : option.label, selected_option: option.label, is_custom: option.custom });
  const now = Date.now();
  const updated = await env.DB.prepare(`UPDATE job_questions SET state = 'answered', response_json = ?, updated_at = ? WHERE id = ? AND state = 'pending' AND EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_questions.job_id AND j.project_id = ? AND j.owner_id = ? AND j.state = 'running' AND j.lease_hash = job_questions.lease_hash AND j.lease_expires_at > ? AND ${currentBatch}) RETURNING id`).bind(response, new Date(now).toISOString(), questionId, projectId, userId, now).first();
  if (updated) return Response.json({ ok: true });
  const existing = await env.DB.prepare("SELECT id FROM job_questions WHERE id = ? AND state = 'answered' AND response_json = ?").bind(questionId, response).first();
  return existing ? Response.json({ ok: true }) : conflict();
}
