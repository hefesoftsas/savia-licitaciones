import { digest } from './runners.js';
import { filterRejectionReport } from './rejection-findings.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
function toHex(bytes) { return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); }
function fromHex(value) { return Uint8Array.from(value.match(/../g), part => parseInt(part, 16)); }
function aad(ownerId, id, provider) { return encoder.encode(JSON.stringify([ownerId, id, provider])); }
async function keyFor(env, id = env.CREDENTIAL_KEY_ID) {
  if (!/^[a-fA-F0-9]{64}$/.test(env.CREDENTIAL_KEY_HEX || '') || !/^[A-Za-z0-9._-]{1,64}$/.test(env.CREDENTIAL_KEY_ID || '')) return null;
  let previous = {};
  if (env.CREDENTIAL_PREVIOUS_KEYS_JSON !== undefined) {
    try { previous = JSON.parse(env.CREDENTIAL_PREVIOUS_KEYS_JSON); } catch { return null; }
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) return null;
    for (const [keyId, value] of Object.entries(previous)) if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId) || keyId === env.CREDENTIAL_KEY_ID || typeof value !== 'string' || !/^[a-fA-F0-9]{64}$/.test(value)) return null;
  }
  const secret = id === env.CREDENTIAL_KEY_ID ? env.CREDENTIAL_KEY_HEX : Object.hasOwn(previous, id) ? previous[id] : null;
  return secret ? crypto.subtle.importKey('raw', fromHex(secret), 'AES-GCM', false, ['encrypt', 'decrypt']) : null;
}
const unavailable = () => Response.json({ error: 'credential_unavailable' }, { status: 503 });
async function rotateRow(env, row, ownerId, plain, active) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(ownerId, row.id, row.provider) }, active, plain);
  return env.DB.prepare('UPDATE provider_credentials SET key_id = ?, iv = ?, ciphertext = ? WHERE id = ? AND owner_id = ? AND revoked_at IS NULL AND key_id = ? AND iv = ? AND ciphertext = ? RETURNING id')
    .bind(env.CREDENTIAL_KEY_ID, toHex(iv), toHex(new Uint8Array(ciphertext)), row.id, ownerId, row.keyId, row.iv, row.ciphertext).first();
}

export async function handleUserCredentials(request, env, ownerId) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  if (path === '/api/provider-credentials/local-model') {
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT model,active FROM local_model_selection WHERE owner_id=?').bind(ownerId).first();
      return Response.json({model:row?.model || null,active:!!row?.active});
    }
    if (request.method === 'PUT') {
      let input; try { input=await request.json(); } catch { return Response.json({error:'invalid_json'},{status:400}); }
      if(typeof input?.model!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(input.model)) return Response.json({error:'invalid_model'},{status:400});
      await env.DB.batch([
        env.DB.prepare('INSERT INTO local_model_selection(owner_id,model,active,updated_at) VALUES(?,?,1,?) ON CONFLICT(owner_id) DO UPDATE SET model=excluded.model,active=1,updated_at=excluded.updated_at').bind(ownerId,input.model,new Date().toISOString()),
        env.DB.prepare('UPDATE opportunity_suggestion_settings SET credential_id=NULL,local_runner=1,version=version+1 WHERE owner_id=?').bind(ownerId)
      ]);
      return Response.json({model:input.model,active:true});
    }
    return new Response('Method not allowed',{status:405});
  }
  if (request.method === 'GET' && path === '/api/provider-credentials') {
    const result = await env.DB.prepare('SELECT id, provider, model, resource, context_tokens AS contextTokens, output_tokens AS outputTokens, created_at AS createdAt FROM provider_credentials WHERE owner_id = ? AND revoked_at IS NULL ORDER BY created_at DESC, id').bind(ownerId).all();
    const selection = await env.DB.prepare('SELECT credential_id FROM account_model_selection WHERE owner_id=?').bind(ownerId).first();
    const local = await env.DB.prepare('SELECT active FROM local_model_selection WHERE owner_id=?').bind(ownerId).first();
    const defaultCredentialId = local?.active ? null : result.results.some(item=>item.id===selection?.credential_id)?selection.credential_id:result.results.length===1?result.results[0].id:null;
    return Response.json({ defaultCredentialId, credentials: result.results.map(({resource, ...credential}) => resource === null ? credential : {...credential, resource}) });
  }
  if (request.method === 'PUT' && path === '/api/provider-credentials/default') {
    let input; try { input=await request.json(); } catch { return Response.json({error:'invalid_json'},{status:400}); }
    if(typeof input?.credentialId!=='string')return Response.json({error:'invalid_credential'},{status:400});
    const credential=await env.DB.prepare('SELECT id FROM provider_credentials WHERE id=? AND owner_id=? AND revoked_at IS NULL').bind(input.credentialId,ownerId).first();
    if(!credential)return Response.json({error:'not_found'},{status:404});
    await env.DB.batch([
      env.DB.prepare('INSERT INTO account_model_selection(owner_id,credential_id) VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET credential_id=excluded.credential_id').bind(ownerId,credential.id),
      env.DB.prepare('UPDATE local_model_selection SET active=0 WHERE owner_id=?').bind(ownerId),
      env.DB.prepare('UPDATE opportunity_suggestion_settings SET credential_id=?,local_runner=0,version=version+1 WHERE owner_id=?').bind(credential.id,ownerId)
    ]);
    return Response.json({defaultCredentialId:credential.id});
  }
  if (request.method === 'POST' && path === '/api/provider-credentials/rotate') {
    let input;
    try { const body = await request.text(); input = body ? JSON.parse(body) : {}; } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
    if (!input || typeof input !== 'object' || Array.isArray(input) || (input.cursor !== undefined && (typeof input.cursor !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.cursor)))) return Response.json({ error: 'invalid_cursor' }, { status: 400 });
    if (input.ownerId !== undefined && input.ownerId !== ownerId) return Response.json({ error: 'session_changed' }, { status: 403 });
    const active = await keyFor(env);
    if (!active) return unavailable();
    const rows = await env.DB.prepare('SELECT id, provider, key_id AS keyId, iv, ciphertext FROM provider_credentials WHERE owner_id = ? AND revoked_at IS NULL AND key_id != ? AND id > ? ORDER BY id LIMIT 51').bind(ownerId, env.CREDENTIAL_KEY_ID, input.cursor || '').all();
    const batch = rows.results.slice(0, 50);
    let rotated = 0, failed = 0;
    for (const row of batch) {
      const previous = await keyFor(env, row.keyId);
      if (!previous) { failed++; continue; }
      let changed;
      try {
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(row.iv), additionalData: aad(ownerId, row.id, row.provider) }, previous, fromHex(row.ciphertext));
        changed = await rotateRow(env, row, ownerId, plain, active);
      } catch { failed++; continue; }
      if (changed) rotated++; else failed++;
    }
    return Response.json({ rotated, failed, ...(rows.results.length > batch.length ? { nextCursor: batch[batch.length - 1].id } : {}) });
  }
  if (request.method === 'POST' && path === '/api/provider-credentials') {
    let input;
    try { input = await request.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
    if (!['opencode-go', 'openai-api', 'anthropic-api', 'google-api','google-vertex-api', 'groq-api', 'xai-api', 'deepseek-api', 'mistral-api', 'cerebras-api', 'together-api', 'nvidia-api', 'fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen'].includes(input?.provider) || typeof input.model !== 'string' || !input.model.trim() || input.model.length > 200 || typeof input.secret !== 'string' || !input.secret || input.secret.length > 8192 || (input.provider === 'anthropic-api' && !input.secret.startsWith('sk-ant-api')) || (input.provider === 'xiaomi-api' && /^\s*t?tp-/.test(input.secret)) || (input.provider === 'google-vertex-api' && (!/^[A-Za-z0-9_-]+$/.test(input.secret) || input.secret === 'gcp-vertex-credentials')) || (['google-api','google-vertex-api'].includes(input.provider) && !/^[A-Za-z0-9._-]+$/.test(input.model.trim()))) return Response.json({ error: 'invalid_credential' }, { status: 400 });
    const contextTokens = input.contextTokens === undefined ? 400000 : input.contextTokens;
    const outputTokens = input.outputTokens === undefined ? 16384 : input.outputTokens;
    if (input.provider === 'azure-openai-api' && (typeof input.resource !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(input.resource) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.model))) return Response.json({ error: 'invalid_credential' }, { status: 400 });
    if (!Number.isSafeInteger(contextTokens) || contextTokens < 1024 || contextTokens > 2000000 || !Number.isSafeInteger(outputTokens) || outputTokens < (['xai-api', 'azure-openai-api'].includes(input.provider) ? 16 : 1) || outputTokens > contextTokens) return Response.json({ error: 'invalid_credential' }, { status: 400 });
    const key = await keyFor(env);
    if (!key) return unavailable();
    const id = crypto.randomUUID();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(ownerId, id, input.provider) }, key, encoder.encode(input.secret));
    const credential = { id, provider: input.provider, model: input.model.trim(), ...(input.provider === 'azure-openai-api' ? {resource: input.resource} : {}), contextTokens, outputTokens, createdAt: new Date().toISOString() };
    await env.DB.prepare('INSERT INTO provider_credentials (id, owner_id, provider, model, key_id, iv, ciphertext, created_at, context_tokens, output_tokens, resource) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, ownerId, credential.provider, credential.model, env.CREDENTIAL_KEY_ID, toHex(iv), toHex(new Uint8Array(ciphertext)), credential.createdAt, contextTokens, outputTokens, credential.resource ?? null).run();
    return Response.json({ credential }, { status: 201 });
  }
  const match = /^\/api\/provider-credentials\/([^/]+)$/.exec(path);
  if (request.method === 'DELETE' && match) {
    const row = await env.DB.prepare('UPDATE provider_credentials SET revoked_at = ? WHERE id = ? AND owner_id = ? AND revoked_at IS NULL RETURNING id')
      .bind(new Date().toISOString(), match[1], ownerId).first();
    return row ? new Response(null, { status: 204 }) : Response.json({ error: 'not_found' }, { status: 404 });
  }
  return new Response('Not found', { status: 404 });
}

export async function handleRunnerCredential(request, env, runner, jobId) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let input;
  try { input = await request.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  if (typeof input?.lease !== 'string' || !/^[a-f0-9]{64}$/.test(input.lease)) return Response.json({ error: 'invalid_lease' }, { status: 400 });
  const row = await env.DB.prepare("SELECT c.id, c.owner_id AS ownerId, c.provider, c.model, c.resource, c.context_tokens AS contextTokens, c.output_tokens AS outputTokens, c.key_id AS keyId, c.iv, c.ciphertext FROM (SELECT id, owner_id, runner_id, lease_hash, state, lease_expires_at, credential_id FROM jobs UNION ALL SELECT id, owner_id, runner_id, lease_hash, state, lease_expires_at, credential_id FROM account_jobs) j JOIN provider_credentials c ON c.id = j.credential_id AND c.owner_id = j.owner_id WHERE j.id = ? AND j.owner_id = ? AND j.runner_id = ? AND j.lease_hash = ? AND j.state = 'running' AND j.lease_expires_at > ? AND c.revoked_at IS NULL")
    .bind(jobId, runner.ownerId, runner.id, await digest(input.lease), Date.now()).first();
  if (!row) return Response.json({ error: 'lease_conflict' }, { status: 409 });
  const key = await keyFor(env, row.keyId);
  if (!key) return unavailable();
  try {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(row.iv), additionalData: aad(row.ownerId, row.id, row.provider) }, key, fromHex(row.ciphertext));
    if (row.keyId !== env.CREDENTIAL_KEY_ID) {
      try { const active = await keyFor(env); if (active) await rotateRow(env, row, row.ownerId, decrypted, active); } catch { /* Keep the credential usable; rotation can be retried. */ }
    }
    return Response.json({ credential: { id: row.id, provider: row.provider, model: row.model, ...(row.provider === 'azure-openai-api' ? {resource: row.resource} : {}), secret: decoder.decode(decrypted), contextTokens: row.contextTokens, outputTokens: row.outputTokens } });
  } catch { return unavailable(); }
}

export async function handleRunnerFile(request, env, runner, jobId, rawFileId) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let fileId;
  try { fileId = decodeURIComponent(rawFileId); } catch { return Response.json({ error: 'invalid_file' }, { status: 400 }); }
  let input;
  try { input = await request.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  if (typeof input?.lease !== 'string' || !/^[a-f0-9]{64}$/.test(input.lease)) return Response.json({ error: 'invalid_lease' }, { status: 400 });
  const job = await env.DB.prepare("SELECT project_id AS projectId, payload_json AS payload FROM jobs WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = 'running' AND lease_expires_at > ?")
    .bind(jobId, runner.ownerId, runner.id, await digest(input.lease), Date.now()).first();
  if (!job) return Response.json({ error: 'lease_conflict' }, { status: 409 });
  const payload = JSON.parse(job.payload);
  if (!Array.isArray(payload.fileIds) || !payload.fileIds.includes(fileId)) return Response.json({ error: 'lease_conflict' }, { status: 409 });
  let file = null;
  if (fileId.startsWith('word-draft:')) {
    const draftJobId = fileId.slice('word-draft:'.length);
    const row = draftJobId ? await env.DB.prepare("SELECT a.object_key AS objectKey FROM jobs j JOIN job_artifacts a ON a.job_id = j.id WHERE j.id = ? AND j.project_id = ? AND j.owner_id = ? AND j.kind = 'technical-plan.export-word' AND j.state = 'succeeded' AND COALESCE(json_extract(j.payload_json, '$.bidDocument'), '') != 'economic' AND a.deleted_at IS NULL")
      .bind(draftJobId, job.projectId, runner.ownerId).first() : null;
    if (row) file = { objectKey: row.objectKey, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'Borrador-propuesta-generada.docx' };
  } else if (fileId.startsWith('review-artifact:')) {
    const reviewJobId = fileId.slice('review-artifact:'.length);
    const row = reviewJobId ? await env.DB.prepare("SELECT a.object_key AS objectKey, j.kind AS kind FROM jobs j JOIN job_artifacts a ON a.job_id = j.id WHERE j.id = ? AND j.project_id = ? AND j.owner_id = ? AND j.state = 'succeeded' AND a.deleted_at IS NULL AND j.kind IN ('blind-check.inspect','rejection-check.analyze','bid-evaluation.analyze','duplicate-check.analyze')")
      .bind(reviewJobId, job.projectId, runner.ownerId).first() : null;
    if (!row) return Response.json({ error: 'lease_conflict' }, { status: 409 });
    const object = await env.FILES.get(row.objectKey);
    if (!object) return Response.json({ error: 'not_found' }, { status: 404 });
    const headers = { 'content-disposition': 'attachment', 'x-content-type-options': 'nosniff', 'x-savia-file-name': encodeURIComponent(`${reviewJobId}.json`) };
    if (row.kind === 'rejection-check.analyze') {
      let report;
      try { report = await object.json(); } catch { return Response.json({ error: 'stored_data_invalid' }, { status: 503 }); }
      return Response.json(await filterRejectionReport(env, runner.ownerId, reviewJobId, report), { headers });
    }
    return new Response(object.body, { headers: { ...headers, 'content-type': 'application/json' } });
  } else {
    file = await env.DB.prepare('SELECT object_key AS objectKey, content_type AS contentType, name AS name FROM project_files WHERE project_id = ? AND id = ?').bind(job.projectId, fileId).first();
  }
  if (!file) return Response.json({ error: 'lease_conflict' }, { status: 409 });
  const object = await env.FILES.get(file.objectKey);
  if (!object) return Response.json({ error: 'not_found' }, { status: 404 });
  return new Response(object.body, { headers: { 'content-type': file.contentType, 'content-disposition': 'attachment', 'x-content-type-options': 'nosniff', 'x-savia-file-name': encodeURIComponent(file.name) } });
}
