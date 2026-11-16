import { digest } from './runners.js';
const missing = () => Response.json({ error: 'not_found' }, { status: 404 });
const bad = () => Response.json({ error: 'invalid_job' }, { status: 400 });
const conflict = () => Response.json({ error: 'lease_conflict' }, { status: 409 });
export function accountView(row) { return { id: row.id, projectId: null, ...(row.project_id && row.kind.startsWith('feasibility.') ? { feasibilityProjectId: row.project_id } : {}), kind: row.kind, credentialId: row.credential_id, payload: JSON.parse(row.payload_json), state: row.state, progress: row.state === 'running' ? row.progress ?? null : null, result: row.result_json === null ? null : JSON.parse(row.result_json), createdAt: row.created_at, updatedAt: row.updated_at }; }
export async function expireAccountJobs(env, ownerId) {
  await env.DB.prepare("UPDATE account_jobs SET state = 'interrupted', updated_at = ? WHERE owner_id = ? AND state = 'running' AND lease_expires_at <= ?").bind(new Date().toISOString(), ownerId, Date.now()).run();
}
export async function userAccountJobs(request, env, ownerId) {
  const match = /^\/api\/rup\/analyses(?:\/([^/]+)\/cancel)?$/.exec(new URL(request.url).pathname);
  if (!match) return missing();
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  await expireAccountJobs(env, ownerId);
  if (request.method === 'GET' && !match[1]) {
    const result = await env.DB.prepare('SELECT * FROM account_jobs WHERE owner_id = ? AND kind = ? ORDER BY created_at DESC, id').bind(ownerId, 'rup.analyze').all();
    return Response.json({ jobs: result.results.map(accountView) });
  }
  if (request.method === 'POST' && match[1]) {
    const row = await env.DB.prepare("UPDATE account_jobs SET state = 'cancelled', updated_at = ? WHERE id = ? AND owner_id = ? AND state IN ('queued', 'running') RETURNING id").bind(new Date().toISOString(), match[1], ownerId).first();
    return row ? Response.json({ ok: true }) : missing();
  }
  if (request.method !== 'POST' || match[1]) return new Response('Method not allowed', { status: 405 });
  let input; try { input = await request.json(); } catch { return bad(); }
  if (!input || typeof input.certificateId !== 'string' || !input.certificateId || !Number.isSafeInteger(input.certificateVersion) || input.certificateVersion < 0 || typeof input.credentialId !== 'string' || !input.credentialId || !['es', 'en'].includes(input.language) || input.dataProcessingConsent !== true) return bad();
  const certificate = await env.DB.prepare('SELECT certificate_id, version FROM rup_current WHERE owner_id = ?').bind(ownerId).first();
  if (!certificate || certificate.certificate_id !== input.certificateId) {
    const owned = await env.DB.prepare('SELECT id FROM rup_certificates WHERE id = ? AND owner_id = ?').bind(input.certificateId, ownerId).first();
    return owned ? Response.json({ error: 'version_conflict' }, { status: 409 }) : missing();
  }
  if (certificate.version !== input.certificateVersion) return Response.json({ error: 'version_conflict' }, { status: 409 });
  const credential = await env.DB.prepare("SELECT id FROM provider_credentials WHERE id = ? AND owner_id = ? AND provider IN ('opencode-go', 'openai-api', 'anthropic-api', 'google-api','google-vertex-api', 'groq-api', 'xai-api', 'deepseek-api', 'mistral-api', 'cerebras-api', 'together-api', 'nvidia-api', 'fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen') AND revoked_at IS NULL").bind(input.credentialId, ownerId).first();
  if (!credential && input.credentialId !== 'local-runner') return missing();
  const requestId = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) return Response.json({ error: 'invalid_idempotency_key' }, { status: 400 });
  const payload = JSON.stringify({ localRunner:input.credentialId==='local-runner', certificateId: input.certificateId, certificateVersion: input.certificateVersion, language: input.language, dataProcessingConsent: true });
  const now = new Date().toISOString();
  const inserted = await env.DB.prepare("INSERT INTO account_jobs (id, owner_id, kind, client_request_id, payload_json, state, created_at, updated_at, credential_id) SELECT ?, ?, 'rup.analyze', ?, ?, 'queued', ?, ?, ? WHERE EXISTS (SELECT 1 FROM rup_current WHERE owner_id = ? AND certificate_id = ? AND version = ?) AND (?='local-runner' OR EXISTS (SELECT 1 FROM provider_credentials WHERE id = ? AND owner_id = ? AND provider IN ('opencode-go', 'openai-api', 'anthropic-api', 'google-api','google-vertex-api', 'groq-api', 'xai-api', 'deepseek-api', 'mistral-api', 'cerebras-api', 'together-api', 'nvidia-api', 'fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen') AND revoked_at IS NULL)) ON CONFLICT(owner_id, client_request_id) DO NOTHING RETURNING *")
    .bind(crypto.randomUUID(), ownerId, requestId, payload, now, now, input.credentialId==='local-runner'?null:input.credentialId, ownerId, input.certificateId, input.certificateVersion, input.credentialId, input.credentialId, ownerId).first();
  if (inserted) return Response.json({ job: accountView(inserted) }, { status: 201 });
  const existing = await env.DB.prepare('SELECT * FROM account_jobs WHERE owner_id = ? AND client_request_id = ?').bind(ownerId, requestId).first();
  if (!existing) return Response.json({ error: 'version_conflict' }, { status: 409 });
  if (existing.kind !== 'rup.analyze' || existing.payload_json !== payload || existing.credential_id !== (input.credentialId==='local-runner'?null:input.credentialId)) return Response.json({ error: 'idempotency_conflict' }, { status: 409 });
  return Response.json({ job: accountView(existing) });
}
export async function runnerRupSource(request, env, runner, jobId) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let input; try { input = await request.json(); } catch { return bad(); }
  if (typeof input?.lease !== 'string' || !/^[a-f0-9]{64}$/.test(input.lease)) return bad();
  const job = await env.DB.prepare("SELECT payload_json FROM account_jobs WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = 'running' AND lease_expires_at > ? AND kind = 'rup.analyze'").bind(jobId, runner.ownerId, runner.id, await digest(input.lease), Date.now()).first();
  if (!job) return conflict();
  const payload = JSON.parse(job.payload_json);
  const cert = await env.DB.prepare('SELECT p.object_key FROM rup_current c JOIN rup_certificates p ON p.id = c.certificate_id AND p.owner_id = c.owner_id WHERE c.owner_id = ? AND c.certificate_id = ? AND c.version = ?').bind(runner.ownerId, payload.certificateId, payload.certificateVersion).first();
  if (!cert) return conflict();
  if (new URL(request.url).searchParams.get('check') === '1') return Response.json({ ok: true });
  const object = await env.FILES.get(cert.object_key); if (!object) return missing();
  return new Response(object.body, { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment', 'x-content-type-options': 'nosniff' } });
}
