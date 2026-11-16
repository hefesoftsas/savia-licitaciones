import { accountView, expireAccountJobs } from './account-jobs.js';
import { digest } from './runners.js';
const missing = () => Response.json({ error: 'not_found' }, { status: 404 });
const bad = () => Response.json({ error: 'invalid_input' }, { status: 400 });
const conflict = () => Response.json({ error: 'version_conflict' }, { status: 409 });
const allowed = entries => Array.isArray(entries) && entries.length > 0 && entries.length <= 100 && entries.every(e => e && typeof e.title === 'string' && e.title.trim() && e.title.length <= 300 && typeof e.summary === 'string' && e.summary.trim() && e.summary.length <= 2000 && typeof e.quote === 'string' && e.quote.trim() && e.quote.length <= 10000);
export async function knowledgeAnalysis(request, env, ownerId) {
 const path = new URL(request.url).pathname;
 if (request.method !== 'GET' && request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
 if (path === '/api/knowledge/entries' && request.method === 'GET') {
  const query = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 255);
  const rows = await env.DB.prepare(`SELECT e.id, e.document_id AS documentId, d.name AS documentName, d.folder_id AS folderId, i.revision, e.title, e.summary, e.quote FROM knowledge_entries e JOIN knowledge_documents d ON d.id = e.document_id AND d.owner_id = e.owner_id JOIN knowledge_indices i ON i.document_id = e.document_id AND i.owner_id = e.owner_id WHERE e.owner_id = ? AND d.deleting = 0 AND d.missing_reason IS NULL AND (instr(lower(e.title), lower(?)) > 0 OR instr(lower(e.summary), lower(?)) > 0 OR instr(lower(e.quote), lower(?)) > 0 OR instr(lower(d.name), lower(?)) > 0) ORDER BY d.created_at DESC, e.sort_order LIMIT 200`).bind(ownerId, query, query, query, query).all();
  return Response.json({ entries: rows.results });
 }
 const match = /^\/api\/knowledge\/documents\/([^/]+)\/analyses(?:\/([^/]+)\/(apply|cancel))?$/.exec(path);
 if (!match) return missing();
 const doc = await env.DB.prepare('SELECT id, missing_reason FROM knowledge_documents WHERE id = ? AND owner_id = ? AND deleting = 0').bind(match[1], ownerId).first();
 if (!doc) return missing();
 await expireAccountJobs(env, ownerId);
 if (request.method === 'GET' && !match[2]) {
  const jobs = await env.DB.prepare("SELECT * FROM account_jobs WHERE owner_id = ? AND kind = 'knowledge.analyze' AND json_extract(payload_json, '$.documentId') = ? ORDER BY created_at DESC, id").bind(ownerId, doc.id).all();
  const index = await env.DB.prepare('SELECT revision, job_id FROM knowledge_indices WHERE document_id = ? AND owner_id = ?').bind(doc.id, ownerId).first();
  const entries = await env.DB.prepare('SELECT id, title, summary, quote FROM knowledge_entries WHERE document_id = ? AND owner_id = ? ORDER BY sort_order').bind(doc.id, ownerId).all();
  return Response.json({ jobs: jobs.results.map(accountView), revision: index?.revision || 0, sourceJobId: index?.job_id || null, entries: entries.results });
 }
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 if (match[3] === 'cancel') {
  const row = await env.DB.prepare("UPDATE account_jobs SET state = 'cancelled', updated_at = ? WHERE id = ? AND owner_id = ? AND kind = 'knowledge.analyze' AND json_extract(payload_json, '$.documentId') = ? AND state IN ('queued', 'running') RETURNING id").bind(new Date().toISOString(), match[2], ownerId, doc.id).first();
  return row ? Response.json({ ok: true }) : missing();
 }
 if (doc.missing_reason) return Response.json({ error: 'source_unavailable' }, { status: 409 });
 let input; try { input = await request.json(); } catch { return bad(); }
 if (match[3] === 'apply') {
  if (!Number.isSafeInteger(input?.revision) || input.revision < 0) return bad();
  const job = await env.DB.prepare("SELECT result_json FROM account_jobs WHERE id = ? AND owner_id = ? AND kind = 'knowledge.analyze' AND state = 'succeeded' AND json_extract(payload_json, '$.documentId') = ?").bind(match[2], ownerId, doc.id).first();
  if (!job) return missing();
  let entries; try { entries = JSON.parse(job.result_json).entries; } catch { return bad(); }
  if (!allowed(entries)) return bad();
  const mutation = crypto.randomUUID(), rows = entries.map((entry, index) => ({ id: crypto.randomUUID(), title: entry.title.trim(), summary: entry.summary.trim(), quote: entry.quote, sort: index }));
  const result = await env.DB.batch([
   env.DB.prepare(`INSERT INTO knowledge_indices (document_id, owner_id, revision, job_id, mutation_id) SELECT ?, ?, 1, ?, ? WHERE (? = 0 OR EXISTS (SELECT 1 FROM knowledge_indices WHERE document_id = ? AND owner_id = ? AND revision = ?)) AND EXISTS (SELECT 1 FROM knowledge_documents WHERE id = ? AND owner_id = ? AND deleting = 0 AND missing_reason IS NULL) ON CONFLICT(document_id) DO UPDATE SET revision = revision + 1, job_id = excluded.job_id, mutation_id = excluded.mutation_id WHERE knowledge_indices.owner_id = ? AND knowledge_indices.revision = ? AND EXISTS (SELECT 1 FROM knowledge_documents WHERE id = ? AND owner_id = ? AND deleting = 0 AND missing_reason IS NULL)`).bind(doc.id, ownerId, match[2], mutation, input.revision, doc.id, ownerId, input.revision, doc.id, ownerId, ownerId, input.revision, doc.id, ownerId),
   env.DB.prepare('DELETE FROM knowledge_entries WHERE document_id = ? AND owner_id = ? AND EXISTS (SELECT 1 FROM knowledge_indices WHERE document_id = ? AND owner_id = ? AND mutation_id = ?)').bind(doc.id, ownerId, doc.id, ownerId, mutation),
   env.DB.prepare("INSERT INTO knowledge_entries (id, document_id, owner_id, title, summary, quote, sort_order) SELECT json_extract(value, '$.id'), ?, ?, json_extract(value, '$.title'), json_extract(value, '$.summary'), json_extract(value, '$.quote'), json_extract(value, '$.sort') FROM json_each(?) WHERE EXISTS (SELECT 1 FROM knowledge_indices WHERE document_id = ? AND owner_id = ? AND mutation_id = ?)").bind(doc.id, ownerId, JSON.stringify(rows), doc.id, ownerId, mutation),
  ]);
  return result[0].meta.changes ? Response.json({ revision: input.revision + 1 }) : conflict();
 }
 if (match[2]) return missing();
 if (input?.dataProcessingConsent !== true || typeof input.credentialId !== 'string' || !['es', 'en'].includes(input.language)) return bad();
 const requestId = request.headers.get('idempotency-key') || ''; if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) return bad();
 const payload = JSON.stringify({ localRunner:input.credentialId==='local-runner', documentId: doc.id, language: input.language, dataProcessingConsent: true }), now = new Date().toISOString();
 const inserted = await env.DB.prepare("INSERT INTO account_jobs (id, owner_id, kind, client_request_id, payload_json, state, created_at, updated_at, credential_id) SELECT ?, ?, 'knowledge.analyze', ?, ?, 'queued', ?, ?, ? WHERE EXISTS (SELECT 1 FROM knowledge_documents WHERE id = ? AND owner_id = ? AND deleting = 0 AND missing_reason IS NULL) AND (?='local-runner' OR EXISTS (SELECT 1 FROM provider_credentials WHERE id = ? AND owner_id = ? AND provider IN ('opencode-go','openai-api','anthropic-api','google-api','google-vertex-api','groq-api','xai-api','deepseek-api','mistral-api','cerebras-api','together-api','nvidia-api','fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen') AND revoked_at IS NULL)) ON CONFLICT(owner_id, client_request_id) DO NOTHING RETURNING *").bind(crypto.randomUUID(), ownerId, requestId, payload, now, now, input.credentialId==='local-runner'?null:input.credentialId, doc.id, ownerId, input.credentialId, input.credentialId, ownerId).first();
 if (inserted) return Response.json({ job: accountView(inserted) }, { status: 201 });
 const existing = await env.DB.prepare('SELECT * FROM account_jobs WHERE owner_id = ? AND client_request_id = ?').bind(ownerId, requestId).first();
 if (!existing) return missing();
 return existing.kind === 'knowledge.analyze' && existing.payload_json === payload && existing.credential_id === (input.credentialId==='local-runner'?null:input.credentialId) ? Response.json({ job: accountView(existing) }) : conflict();
}
export async function runnerKnowledgeSource(request, env, runner, jobId) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 let input; try { input = await request.json(); } catch { return bad(); }
 if (typeof input?.lease !== 'string' || !/^[a-f0-9]{64}$/.test(input.lease)) return bad();
 const job = await env.DB.prepare("SELECT payload_json FROM account_jobs WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = 'running' AND lease_expires_at > ? AND kind = 'knowledge.analyze'").bind(jobId, runner.ownerId, runner.id, await digest(input.lease), Date.now()).first();
 if (!job) return conflict();
 const doc = await env.DB.prepare('SELECT name, content_type, object_key FROM knowledge_documents WHERE id = ? AND owner_id = ? AND deleting = 0 AND missing_reason IS NULL').bind(JSON.parse(job.payload_json).documentId, runner.ownerId).first();
 if (!doc) return conflict();
 if (new URL(request.url).searchParams.get('check') === '1') return Response.json({ ok: true });
 const object = await env.FILES.get(doc.object_key); if (!object) return missing();
 return new Response(object.body, { headers: { 'content-type': doc.content_type, 'x-savia-file-name': encodeURIComponent(doc.name), 'x-content-type-options': 'nosniff' } });
}
