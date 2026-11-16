import { cleanupDesktopUploads, uploadLeaseMs } from './desktop-file-cleanup.js';

const bad = () => Response.json({ error: 'invalid_comparison' }, { status: 400 });
const missing = () => Response.json({ error: 'not_found' }, { status: 404 });
const conflict = () => Response.json({ error: 'comparison_conflict' }, { status: 409 });
const sha256 = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), b => b.toString(16).padStart(2, '0')).join('');
const text = (value, max) => typeof value === 'string' && value.length <= max;

export async function importDesktopComparison(request, env, runner, requestId, sourceKey) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId) || !/^[a-f0-9]{64}$/.test(sourceKey) || Number(request.headers.get('content-length') || 0) > 26 * 1024 * 1024) return bad();
 const project = await env.DB.prepare('SELECT p.id FROM desktop_plan_imports i JOIN projects p ON p.id = i.project_id AND p.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ?').bind(runner.ownerId, requestId).first();
 if (!project) return missing();
 let form, input; try { form = await request.formData(); input = JSON.parse(form.get('metadata')); } catch { return bad(); }
 if (!input || !text(input.requirementId, 256) || !input.requirementId || !text(input.factId, 256) || !input.factId || (input.sourceId !== undefined && (!text(input.sourceId, 256) || !input.sourceId)) || await sha256(new TextEncoder().encode(input.sourceId ?? input.requirementId)) !== sourceKey || !Number.isSafeInteger(input.page) || input.page < 1 || !input.certificate || !text(input.certificate.name, 255) || !text(input.certificate.issuedOn, 100)) return bad();
 for (const field of ['label', 'value', 'title', 'source', 'operator', 'threshold', 'interpretedValue', 'documentsHash', 'updatedAt']) if (!text(input[field], field === 'source' ? 20000 : 1000)) return bad();
 const file = form.get('pdf'), noFile = !file;
 if (noFile ? !['not_found', 'too_large', 'unsafe_path'].includes(input.certificate.reason) : (typeof file === 'string' || file.size > 25 * 1024 * 1024)) return bad();
 const data = noFile ? null : await file.arrayBuffer();
 const snapshot = { factId: input.factId, label: input.label, value: input.value, page: input.page, title: input.title, source: input.source, operator: input.operator, threshold: input.threshold, interpretedValue: input.interpretedValue, documentsHash: input.documentsHash, updatedAt: input.updatedAt, certificateName: input.certificate.name, issuedOn: input.certificate.issuedOn };
 const snapshotJson = JSON.stringify(snapshot), missingReason = noFile ? input.certificate.reason : null;
 const hash = await sha256(new TextEncoder().encode(JSON.stringify({ sourceRequirementId: input.requirementId, snapshot, missingReason, pdfHash: data ? await sha256(data) : null })));
 const lookup = () => env.DB.prepare('SELECT id, content_hash FROM imported_rup_comparisons WHERE owner_id = ? AND request_id = ? AND source_key = ?').bind(runner.ownerId, requestId, sourceKey).first();
 const responseFor = row => row?.content_hash === hash ? Response.json({ imported: true }) : conflict();
 const previous = await lookup(); if (previous) return responseFor(previous);
 const id = crypto.randomUUID(), mutation = crypto.randomUUID(), key = data ? `rup-comparisons/${project.id}/${crypto.randomUUID()}` : null, now = new Date().toISOString();
 if (data) await env.DB.prepare("INSERT INTO desktop_file_staging (id, owner_id, object_key, state, lease_until, created_at) VALUES (?, ?, ?, 'writing', ?, ?)").bind(mutation, runner.ownerId, key, Date.now() + uploadLeaseMs, Date.now()).run();
 const release = async () => { if (!data) return; try { await env.DB.prepare("UPDATE desktop_file_staging SET state = 'cleanup', lease_until = 0 WHERE id = ? AND owner_id = ? AND state IN ('writing', 'watching')").bind(mutation, runner.ownerId).run(); await cleanupDesktopUploads(env, runner.ownerId); } catch { /* Staging remains eligible for retry. */ } };
 try {
  if (data) { await env.FILES.put(key, data); await env.DB.prepare('UPDATE desktop_file_staging SET writer_done = 1 WHERE id = ? AND owner_id = ?').bind(mutation, runner.ownerId).run(); }
  const rows = await env.DB.batch([
   env.DB.prepare("INSERT INTO imported_rup_comparisons (id, owner_id, project_id, request_id, source_key, source_requirement_id, snapshot_json, content_hash, object_key, missing_reason, mutation_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ? IS NULL OR EXISTS (SELECT 1 FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND lease_until > ?) ON CONFLICT(owner_id, request_id, source_key) DO NOTHING").bind(id, runner.ownerId, project.id, requestId, sourceKey, input.requirementId, snapshotJson, hash, key, missingReason, mutation, now, key, mutation, runner.ownerId, Date.now()),
   env.DB.prepare("DELETE FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND EXISTS (SELECT 1 FROM imported_rup_comparisons WHERE owner_id = ? AND request_id = ? AND source_key = ? AND mutation_id = ?)").bind(mutation, runner.ownerId, runner.ownerId, requestId, sourceKey, mutation),
  ]);
  if (rows[0].meta.changes) return Response.json({ imported: true }, { status: 201 });
 } catch (error) { await release(); throw error; }
 await release(); return responseFor(await lookup());
}

export async function importedComparisons(request, env, ownerId, projectId, comparisonId) {
 if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
 const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, ownerId).first(); if (!project) return missing();
 if (comparisonId) {
  const row = await env.DB.prepare('SELECT object_key FROM imported_rup_comparisons WHERE id = ? AND project_id = ? AND owner_id = ?').bind(comparisonId, projectId, ownerId).first();
  if (!row?.object_key) return missing(); const object = await env.FILES.get(row.object_key); if (!object) return missing();
  return new Response(object.body, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="rup-historico.pdf"', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
 }
 const rows = await env.DB.prepare('SELECT c.id, c.snapshot_json, c.object_key, c.missing_reason, r.id AS requirement_id FROM imported_rup_comparisons c LEFT JOIN desktop_requirement_id_map m ON m.owner_id = c.owner_id AND m.request_id = c.request_id AND m.source_id = c.source_requirement_id AND m.project_id = c.project_id LEFT JOIN project_requirements r ON r.id = m.requirement_id AND r.project_id = c.project_id WHERE c.project_id = ? AND c.owner_id = ? ORDER BY c.created_at, c.id').bind(projectId, ownerId).all();
 return Response.json({ comparisons: rows.results.map(row => ({ id: row.id, ...JSON.parse(row.snapshot_json), requirementId: row.requirement_id ?? null, hasSource: !!row.object_key, missingReason: row.missing_reason })) });
}
