import { cleanupDesktopUploads, uploadLeaseMs } from './desktop-file-cleanup.js';
import { digest } from './runners.js';
import { planAssetFingerprint } from './plan-asset-sources.js';
const bad = () => Response.json({ error: 'invalid_asset' }, { status: 400 });
const conflict = () => Response.json({ error: 'asset_conflict' }, { status: 409 });
const sha256 = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');
const view = row => ({ id: row.id, reference: row.reference, kind: row.kind, contentType: row.content_type, size: row.size });
function imageType(bytes) {
 const starts = signature => signature.every((value, index) => bytes[index] === value);
 if (starts([137,80,78,71,13,10,26,10])) return 'image/png';
 if (starts([255,216,255])) return 'image/jpeg';
 if (starts([71,73,70,56,55,97]) || starts([71,73,70,56,57,97])) return 'image/gif';
 if (starts([82,73,70,70]) && bytes.length >= 12 && [87,69,66,80].every((value, i) => bytes[i + 8] === value)) return 'image/webp';
 return null;
}
export async function importDesktopAsset(request, env, runner, requestId, sourceKey) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId) || !/^[a-f0-9]{64}$/.test(sourceKey)) return bad();
 const project = await env.DB.prepare('SELECT p.id FROM desktop_plan_imports i JOIN projects p ON p.id = i.project_id AND p.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ?').bind(runner.ownerId, requestId).first();
 if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
 let reference; try { reference = decodeURIComponent(request.headers.get('x-asset-reference') || ''); } catch { return bad(); }
 const kind = request.headers.get('x-asset-kind'), expected = request.headers.get('x-content-sha256') || '';
 if (!['url', 'agent'].includes(kind) || !reference || reference.length > 4096 || /[\x00-\x1f\x7f]/.test(reference) || !/^[a-f0-9]{64}$/.test(expected) || await sha256(new TextEncoder().encode(JSON.stringify([kind, reference]))) !== sourceKey) return bad();
 if (Number(request.headers.get('content-length') || 0) > 25 * 1024 * 1024) return Response.json({ error: 'asset_too_large' }, { status: 413 });
 const data = await request.arrayBuffer(); if (data.byteLength > 25 * 1024 * 1024) return Response.json({ error: 'asset_too_large' }, { status: 413 });
 const bytes = new Uint8Array(data), contentType = imageType(bytes), hash = await sha256(data);
 if (!contentType || hash !== expected) return bad();
 const lookup = () => env.DB.prepare('SELECT * FROM project_plan_assets WHERE owner_id = ? AND request_id = ? AND source_key = ?').bind(runner.ownerId, requestId, sourceKey).first();
 const matches = row => row && row.kind === kind && row.reference === reference && row.content_hash === hash && row.content_type === contentType && row.size === bytes.length;
 const previous = await lookup(); if (previous) return matches(previous) ? Response.json({ asset: view(previous) }) : conflict();
 const id = crypto.randomUUID(), mutation = crypto.randomUUID(), key = `plan-assets/${project.id}/${crypto.randomUUID()}`, now = new Date().toISOString();
 await env.DB.prepare("INSERT INTO desktop_file_staging (id, owner_id, object_key, state, lease_until, created_at) VALUES (?, ?, ?, 'writing', ?, ?)").bind(mutation, runner.ownerId, key, Date.now() + uploadLeaseMs, Date.now()).run();
 const release = async () => { try { await env.DB.prepare("UPDATE desktop_file_staging SET state = 'cleanup', lease_until = 0 WHERE id = ? AND owner_id = ? AND state IN ('writing', 'watching')").bind(mutation, runner.ownerId).run(); await cleanupDesktopUploads(env, runner.ownerId); } catch { /* Durable staging remains available for a later retry. */ } };
 try {
  await env.FILES.put(key, data);
  await env.DB.prepare('UPDATE desktop_file_staging SET writer_done = 1 WHERE id = ? AND owner_id = ?').bind(mutation, runner.ownerId).run();
  const results = await env.DB.batch([
   env.DB.prepare("INSERT INTO project_plan_assets (id, owner_id, project_id, request_id, source_key, reference, kind, content_hash, content_type, size, object_key, mutation_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND lease_until > ?) ON CONFLICT(owner_id, request_id, source_key) DO NOTHING").bind(id, runner.ownerId, project.id, requestId, sourceKey, reference, kind, hash, contentType, bytes.length, key, mutation, now, mutation, runner.ownerId, Date.now()),
   env.DB.prepare("DELETE FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND EXISTS (SELECT 1 FROM project_plan_assets WHERE owner_id = ? AND request_id = ? AND source_key = ? AND mutation_id = ?)").bind(mutation, runner.ownerId, runner.ownerId, requestId, sourceKey, mutation),
  ]);
  if (results[0].meta.changes) return Response.json({ asset: { id, reference, kind, contentType, size: bytes.length } }, { status: 201 });
 } catch (error) { await release(); throw error; }
 await release(); const existing = await lookup(); return matches(existing) ? Response.json({ asset: view(existing) }) : conflict();
}
export async function downloadPlanAsset(request, env, ownerId, projectId, assetId) {
 if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
 if (!assetId) {
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
  const rows = await env.DB.prepare('SELECT id, kind, reference FROM project_plan_assets WHERE project_id = ? AND owner_id = ? ORDER BY id').bind(projectId, ownerId).all();
  return Response.json({ assets: rows.results });
 }
 const row = await env.DB.prepare('SELECT a.object_key, a.content_type FROM project_plan_assets a JOIN projects p ON p.id = a.project_id AND p.owner_id = a.owner_id WHERE a.id = ? AND a.project_id = ? AND a.owner_id = ?').bind(assetId, projectId, ownerId).first();
 if (!row) return Response.json({ error: 'not_found' }, { status: 404 });
 const object = await env.FILES.get(row.object_key); if (!object) return Response.json({ error: 'not_found' }, { status: 404 });
 return new Response(object.body, { headers: { 'content-type': row.content_type, 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
}
export async function runnerPlanAsset(request, env, runner, jobId, assetId) {
 if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
 let input; try { input = await request.json(); } catch { return bad(); }
 if (typeof input?.lease !== 'string' || !/^[a-f0-9]{64}$/.test(input.lease)) return bad();
 const leaseHash = await digest(input.lease), now = Date.now();
 const job = await env.DB.prepare("SELECT j.project_id, j.payload_json, p.version FROM jobs j JOIN project_technical_plans p ON p.project_id = j.project_id WHERE j.id = ? AND j.owner_id = ? AND j.runner_id = ? AND j.lease_hash = ? AND j.state = 'running' AND j.lease_expires_at > ? AND j.kind = 'technical-plan.export-word'").bind(jobId, runner.ownerId, runner.id, leaseHash, now).first();
 if (!job) return Response.json({ error: 'lease_conflict' }, { status: 409 });
 const payload = JSON.parse(job.payload_json);
 if (typeof payload.assetFingerprint !== 'string' || job.version !== payload.planVersion || await planAssetFingerprint(env, job.project_id) !== payload.assetFingerprint) return conflict();
 const asset = assetId.startsWith('library-')
  ? await env.DB.prepare('SELECT object_key, content_type FROM image_library_web WHERE id = ? AND owner_id = ? AND deleting = 0 AND missing_reason IS NULL').bind(assetId.slice(8), runner.ownerId).first()
  : await env.DB.prepare('SELECT object_key, content_type FROM project_plan_assets WHERE id = ? AND project_id = ? AND owner_id = ?').bind(assetId, job.project_id, runner.ownerId).first();
 if (!asset) return Response.json({ error: 'not_found' }, { status: 404 });
 const object = await env.FILES.get(asset.object_key); if (!object) return Response.json({ error: 'not_found' }, { status: 404 });
 const stillActive = await env.DB.prepare("SELECT 1 AS ok FROM jobs j JOIN project_technical_plans p ON p.project_id = j.project_id WHERE j.id = ? AND j.owner_id = ? AND j.runner_id = ? AND j.lease_hash = ? AND j.state = 'running' AND j.lease_expires_at > ? AND p.version = ?").bind(jobId, runner.ownerId, runner.id, leaseHash, Date.now(), payload.planVersion).first();
 if (!stillActive || await planAssetFingerprint(env, job.project_id) !== payload.assetFingerprint) return conflict();
 return new Response(object.body, { headers: { 'content-type': asset.content_type, 'x-content-type-options': 'nosniff' } });
}
