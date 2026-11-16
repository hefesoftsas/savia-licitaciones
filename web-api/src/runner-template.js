import { digest } from './runners.js';
import { templateValuesGuard } from './template-sources.js';
export async function runnerTemplate(request, env, runner, jobId) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let input; try { input = await request.json(); } catch { return Response.json({ error: 'invalid_input' }, { status: 400 }); }
  if (typeof input?.lease !== 'string' || !/^[a-f0-9]{64}$/.test(input.lease)) return Response.json({ error: 'invalid_lease' }, { status: 400 });
  const job = await env.DB.prepare("SELECT project_id, payload_json FROM jobs WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = 'running' AND lease_expires_at > ? AND kind = 'technical-plan.export-word'").bind(jobId, runner.ownerId, runner.id, await digest(input.lease), Date.now()).first();
  if (!job) return Response.json({ error: 'lease_conflict' }, { status: 409 });
  const payload = JSON.parse(job.payload_json);
  if (!payload.templateJobId || !payload.templateSourceSnapshot || !payload.templateFingerprint) return Response.json({ error: 'not_found' }, { status: 404 });
  const guard = templateValuesGuard(payload.templateSourceSnapshot, payload.templateFingerprint, job.project_id, runner.ownerId, payload.templateJobId, payload.templateRevision, (payload.templateValuesRevision ?? 0));
  const row = await env.DB.prepare(`SELECT a.object_key FROM job_artifacts a JOIN jobs e ON e.id = a.job_id WHERE e.id = ? AND e.project_id = ? AND e.owner_id = ? AND e.state = 'succeeded' AND a.deleted_at IS NULL AND ${guard.sql}`).bind(payload.templateJobId, job.project_id, runner.ownerId, ...guard.args).first();
  if (!row) return Response.json({ error: 'template_conflict' }, { status: 409 });
  const object = await env.FILES.get(row.object_key);
  return object ? new Response(object.body, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x-content-type-options': 'nosniff' } }) : Response.json({ error: 'not_found' }, { status: 404 });
}
