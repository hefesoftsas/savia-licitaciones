import { accountView, expireAccountJobs } from './account-jobs.js';
import { digest } from './runners.js';

const SUPPORTED_PROVIDERS = "'opencode-go','openai-api','anthropic-api','google-api','google-vertex-api','groq-api','xai-api','deepseek-api','mistral-api','cerebras-api','together-api','nvidia-api','fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen'";
const MAX_DOSSIER_FILE_BYTES = 25 * 1024 * 1024;
const MAX_DOSSIER_FILES = 15;
const ALLOWED_EXT_RE = /\.(pdf|docx?|xlsx?|txt|md|markdown)$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEASE_RE = /^[a-f0-9]{64}$/;

const missing = () => Response.json({ error: 'not_found' }, { status: 404 });
const bad = (error = 'invalid_input') => Response.json({ error }, { status: 400 });
const conflict = (error = 'version_conflict') => Response.json({ error }, { status: 409 });

export function dossierObjectKey(ownerId, sourceId) {
  return `company-dossier/${ownerId}/${sourceId}`;
}

export async function cleanupCompanyDossierFiles(env, ownerId, payloadJson) {
  let sources = [];
  try {
    sources = JSON.parse(payloadJson)?.sources || [];
  } catch {
    return;
  }
  const keys = sources
    .map(item => (typeof item?.id === 'string' && UUID_RE.test(item.id) ? dossierObjectKey(ownerId, item.id) : null))
    .filter(Boolean);
  if (keys.length) {
    await Promise.allSettled(keys.map(key => env.FILES.delete(key)));
  }
}

export async function companyDossier(request, env, ownerId, session = null) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) {
    return Response.json({ error: 'invalid_origin' }, { status: 403 });
  }

  const uploadMatch = /^\/api\/company-dossier\/uploads(?:\/([^/]+))?$/.exec(path);
  if (uploadMatch) {
    const sourceId = uploadMatch[1];
    if (!sourceId && request.method === 'POST') {
      let fileName;
      try {
        fileName = decodeURIComponent(request.headers.get('x-file-name') || '').trim();
      } catch {
        return bad('invalid_name');
      }
      if (!fileName || fileName.length > 255 || /[\\/\0\r\n]/.test(fileName) || !ALLOWED_EXT_RE.test(fileName)) {
        return bad('invalid_name');
      }
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_DOSSIER_FILE_BYTES) {
        return bad('invalid_size');
      }
      const id = crypto.randomUUID();
      const contentType = (request.headers.get('content-type') || 'application/octet-stream').slice(0, 200);
      await env.FILES.put(dossierObjectKey(ownerId, id), bytes, {
        httpMetadata: { contentType },
        customMetadata: {
          ownerId,
          fileName: fileName.slice(0, 255),
          contentType,
          uploadedAt: new Date().toISOString(),
        },
      });
      return Response.json({ source: { id, fileName, contentType, size: bytes.byteLength } }, { status: 201 });
    }
    if (sourceId && request.method === 'DELETE') {
      if (!UUID_RE.test(sourceId)) return bad();
      await env.FILES.delete(dossierObjectKey(ownerId, sourceId));
      return new Response(null, { status: 204 });
    }
    return new Response('Method not allowed', { status: 405 });
  }

  const analysisMatch = /^\/api\/company-dossier\/analyses(?:\/([^/]+)\/(cancel))?$/.exec(path);
  if (!analysisMatch) return missing();
  await expireAccountJobs(env, ownerId);

  if (request.method === 'GET' && !analysisMatch[1]) {
    const rows = await env.DB.prepare(
      "SELECT * FROM account_jobs WHERE owner_id = ? AND kind = 'company-dossier.extract' ORDER BY created_at DESC, id LIMIT 10",
    )
      .bind(ownerId)
      .all();
    return Response.json({ jobs: rows.results.map(accountView) });
  }

  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  if (analysisMatch[2] === 'cancel') {
    const row = await env.DB.prepare(
      "UPDATE account_jobs SET state = 'cancelled', updated_at = ? WHERE id = ? AND owner_id = ? AND kind = 'company-dossier.extract' AND state IN ('queued', 'running') RETURNING id, payload_json",
    )
      .bind(new Date().toISOString(), analysisMatch[1], ownerId)
      .first();
    if (!row) return missing();
    await cleanupCompanyDossierFiles(env, ownerId, row.payload_json);
    return Response.json({ ok: true });
  }

  if (analysisMatch[1]) return missing();

  const requestId = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) return bad('invalid_idempotency_key');

  let input;
  try {
    input = await request.json();
  } catch {
    return bad();
  }

  const sourceIds = input?.sourceIds;
  if (
    !input ||
    input.dataProcessingConsent !== true ||
    !['es', 'en'].includes(input.language) ||
    typeof input.credentialId !== 'string' ||
    !input.credentialId ||
    !Array.isArray(sourceIds) ||
    sourceIds.length < 1 ||
    sourceIds.length > MAX_DOSSIER_FILES ||
    new Set(sourceIds).size !== sourceIds.length ||
    sourceIds.some(id => typeof id !== 'string' || !UUID_RE.test(id))
  ) {
    return bad();
  }

  if (input.credentialId !== 'local-runner') {
    const credential = await env.DB.prepare(
      `SELECT id FROM provider_credentials WHERE id = ? AND owner_id = ? AND provider IN (${SUPPORTED_PROVIDERS}) AND revoked_at IS NULL`,
    )
      .bind(input.credentialId, ownerId)
      .first();
    if (!credential) return missing();
  }

  const sources = [];
  for (const id of sourceIds) {
    const head = await env.FILES.head(dossierObjectKey(ownerId, id));
    if (!head || (head.customMetadata?.ownerId && head.customMetadata.ownerId !== ownerId)) {
      return Response.json({ error: 'source_not_found' }, { status: 404 });
    }
    const providedName =
      input.sourceNames && typeof input.sourceNames[id] === 'string' ? input.sourceNames[id].trim().slice(0, 255) : '';
    const fileName = head.customMetadata?.fileName || providedName || `${id}.pdf`;
    const contentType = head.customMetadata?.contentType || head.httpMetadata?.contentType || 'application/octet-stream';
    sources.push({ id, fileName, contentType, size: head.size });
  }

  const market = ['CO', 'ES', 'ALL'].includes(input.market)
    ? input.market
    : ['CO', 'ES', 'ALL'].includes(session?.tenant?.country)
      ? session.tenant.country
      : 'ALL';

  const credentialId = input.credentialId === 'local-runner' ? null : input.credentialId;
  const payload = JSON.stringify({
    localRunner: input.credentialId === 'local-runner',
    sources,
    language: input.language,
    market,
    dataProcessingConsent: true,
  });
  const now = new Date().toISOString();

  const inserted = await env.DB.prepare(
    `INSERT INTO account_jobs (id, owner_id, kind, client_request_id, payload_json, state, created_at, updated_at, credential_id)
     SELECT ?, ?, 'company-dossier.extract', ?, ?, 'queued', ?, ?, ?
     WHERE (? = 'local-runner' OR EXISTS (SELECT 1 FROM provider_credentials WHERE id = ? AND owner_id = ? AND provider IN (${SUPPORTED_PROVIDERS}) AND revoked_at IS NULL))
     ON CONFLICT(owner_id, client_request_id) DO NOTHING RETURNING *`,
  )
    .bind(
      crypto.randomUUID(),
      ownerId,
      requestId,
      payload,
      now,
      now,
      credentialId,
      input.credentialId,
      input.credentialId,
      ownerId,
    )
    .first();

  if (inserted) return Response.json({ job: accountView(inserted) }, { status: 201 });

  const existing = await env.DB.prepare('SELECT * FROM account_jobs WHERE owner_id = ? AND client_request_id = ?')
    .bind(ownerId, requestId)
    .first();
  if (!existing) return missing();
  return existing.kind === 'company-dossier.extract' &&
    existing.payload_json === payload &&
    existing.credential_id === credentialId
    ? Response.json({ job: accountView(existing) })
    : conflict();
}

export async function runnerCompanyDossierFile(request, env, runner, jobId, sourceId) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!UUID_RE.test(sourceId)) return bad();
  let input;
  try {
    input = await request.json();
  } catch {
    return bad();
  }
  if (typeof input?.lease !== 'string' || !LEASE_RE.test(input.lease)) return bad();

  const job = await env.DB.prepare(
    "SELECT payload_json FROM account_jobs WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = 'running' AND lease_expires_at > ? AND kind = 'company-dossier.extract'",
  )
    .bind(jobId, runner.ownerId, runner.id, await digest(input.lease), Date.now())
    .first();
  if (!job) return conflict();

  let payload;
  try {
    payload = JSON.parse(job.payload_json);
  } catch {
    return conflict();
  }
  const source = Array.isArray(payload?.sources) ? payload.sources.find(item => item.id === sourceId) : null;
  if (!source) return missing();

  const object = await env.FILES.get(dossierObjectKey(runner.ownerId, sourceId));
  if (!object) return missing();

  return new Response(object.body, {
    headers: {
      'content-type': source.contentType || object.httpMetadata?.contentType || 'application/octet-stream',
      'x-savia-file-name': encodeURIComponent(source.fileName || sourceId),
      'x-content-type-options': 'nosniff',
    },
  });
}
