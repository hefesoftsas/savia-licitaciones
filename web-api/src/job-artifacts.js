import { deleteRepairReport } from './repair-reports.js';
import { digest } from './runners.js';
import { cleanupDesktopUploads, uploadLeaseMs } from './desktop-file-cleanup.js';
import { filterRejectionReport } from './rejection-findings.js';
import { discardRecoveryForDeletedArtifact } from './word-recovery.js';

const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const maxSize = 25 * 1024 * 1024;
const conflict = () => Response.json({ error: 'lease_conflict' }, { status: 409 });

async function active(env, runner, jobId, leaseHash) {
  return env.DB.prepare("SELECT id,project_id,kind,json_extract(payload_json,'$.bidDocument') AS bid_document,json_extract(payload_json,'$.targetExportJobId') AS target_export_job_id FROM jobs WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = 'running' AND lease_expires_at > ? AND kind IN ('technical-plan.export-word', 'technical-plan.extract-template', 'duplicate-check.analyze', 'rejection-check.analyze', 'blind-check.inspect', 'blind-check.fix', 'blind-check.fix-report', 'blind-check.fix-ai', 'bid-evaluation.analyze', 'proposal-review.apply-suggestions')").bind(jobId, runner.ownerId, runner.id, leaseHash, Date.now()).first();
}
export async function uploadJobArtifact(request, env, runner, jobId) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const lease = request.headers.get('x-savia-lease') || '';
  if (!/^[a-f0-9]{64}$/.test(lease)) return Response.json({ error: 'invalid_lease' }, { status: 400 });
  const leaseHash = await digest(lease);
  const job = await active(env,runner,jobId,leaseHash);
  if (!job) return conflict();
  if (Number(request.headers.get('content-length')) > maxSize) return Response.json({ error: 'artifact_too_large' }, { status: 413 });
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > maxSize) return Response.json({ error: 'artifact_too_large' }, { status: 413 });
  if (job.bid_document==='economic' && (request.headers.get('content-type')!=='application/pdf' || new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')) {
    return Response.json({error:'invalid_artifact'},{status:400});
  }
  const magic = new Uint8Array(bytes.slice(0, 4));
  if (job.kind === 'proposal-review.apply-suggestions' && (magic.length < 4 || magic[0] !== 80 || magic[1] !== 75 || magic[2] !== 3 || magic[3] !== 4)) {
    return Response.json({ error: 'invalid_docx' }, { status: 400 });
  }
  const hashBytes = await crypto.subtle.digest('SHA-256', bytes);
  const sha = Array.from(new Uint8Array(hashBytes), byte => byte.toString(16).padStart(2, '0')).join('');
  const id = crypto.randomUUID(), key = `job-artifacts/${jobId}/${id}`, created = new Date().toISOString();
  const mutation=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO desktop_file_staging (id,owner_id,object_key,state,lease_until,created_at) VALUES (?,?,?,'writing',?,?)").bind(mutation,runner.ownerId,key,Date.now()+uploadLeaseMs,Date.now()).run();
  try {
    await env.FILES.put(key, bytes);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(mutation,runner.ownerId).run();
    const row = await env.DB.prepare("INSERT INTO job_artifacts (id, job_id, object_key, sha256, size, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM jobs WHERE id = ? AND owner_id = ? AND runner_id = ? AND lease_hash = ? AND state = 'running' AND lease_expires_at > ? AND kind IN ('technical-plan.export-word', 'technical-plan.extract-template', 'duplicate-check.analyze', 'rejection-check.analyze', 'blind-check.inspect', 'blind-check.fix', 'blind-check.fix-report', 'blind-check.fix-ai', 'bid-evaluation.analyze', 'proposal-review.apply-suggestions')) AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?) ON CONFLICT(job_id) DO NOTHING RETURNING id, sha256, size")
      .bind(id, jobId, key, sha, bytes.byteLength, created, jobId, runner.ownerId, runner.id, leaseHash, Date.now(),mutation,runner.ownerId,Date.now()).first();
    if (row) {
      let updatedProposal = false;
      let wordRevision = null;
      if (job.kind === 'proposal-review.apply-suggestions' && typeof job.target_export_job_id === 'string' && job.target_export_job_id) {
        const exportRow = await env.DB.prepare("SELECT a.object_key,a.edit_revision FROM job_artifacts a JOIN jobs j ON j.id=a.job_id WHERE j.id=? AND j.project_id=? AND j.owner_id=? AND j.kind='technical-plan.export-word' AND COALESCE(json_extract(j.payload_json,'$.bidDocument'),'')!='economic' AND j.state='succeeded' AND a.deleted_at IS NULL").bind(job.target_export_job_id, job.project_id, runner.ownerId).first();
        if (exportRow) {
          const exportKey = `job-artifacts/${job.target_export_job_id}/${crypto.randomUUID()}`;
          const exportMutation = crypto.randomUUID();
          await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(exportMutation, runner.ownerId, exportKey, Date.now() + uploadLeaseMs, Date.now()).run();
          try {
            await env.FILES.put(exportKey, bytes);
            await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(exportMutation, runner.ownerId).run();
            const savedWord = await env.DB.prepare('UPDATE job_artifacts SET object_key=?,sha256=?,size=?,edit_revision=edit_revision+1,edited_at=? WHERE job_id=? AND edit_revision=? AND deleted_at IS NULL RETURNING edit_revision').bind(exportKey, sha, bytes.byteLength, created, job.target_export_job_id, exportRow.edit_revision).first();
            if (savedWord) {
              updatedProposal = true;
              wordRevision = savedWord.edit_revision;
              await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at,writer_done) VALUES(?,?,?,'cleanup',0,?,1)").bind(crypto.randomUUID(), runner.ownerId, exportRow.object_key, Date.now()).run();
            }
          } finally {
            try { await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=?").bind(exportMutation, runner.ownerId).run(); } catch {}
          }
        }
      }
      return Response.json({ artifact: { id: row.id, size: row.size, ...(job.kind === 'proposal-review.apply-suggestions' ? { updatedProposal, wordRevision } : {}) } });
    }
    if (!await active(env, runner, jobId, leaseHash)) return conflict();
    const previous = await env.DB.prepare('SELECT id, sha256, size FROM job_artifacts WHERE job_id = ?').bind(jobId).first();
    return previous?.sha256 === sha ? Response.json({ artifact: { id: previous.id, size: previous.size } }) : conflict();
  } finally {try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(mutation,runner.ownerId).run();await cleanupDesktopUploads(env,runner.ownerId);}catch{/* Retry through cleanup-imports. */}}
}
export async function downloadJobArtifact(request, env, ownerId, projectId, jobId) {
  if(request.method==='PUT')return saveWordEdits(request,env,ownerId,projectId,jobId);
  if (request.method === 'DELETE') {
    if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
    const job = await env.DB.prepare("SELECT state,kind FROM jobs WHERE id = ? AND project_id = ? AND owner_id = ? AND kind IN ('technical-plan.export-word', 'technical-plan.extract-template', 'duplicate-check.analyze', 'rejection-check.analyze', 'blind-check.inspect', 'blind-check.fix', 'blind-check.fix-report', 'blind-check.fix-ai', 'bid-evaluation.analyze', 'proposal-review.apply-suggestions')").bind(jobId, projectId, ownerId).first();
    if (!job) return Response.json({ error: 'not_found' }, { status: 404 });
    if (!['succeeded', 'failed', 'cancelled', 'interrupted'].includes(job.state)) return conflict();
    const artifact = await env.DB.prepare('UPDATE job_artifacts SET deleted_at = COALESCE(deleted_at, ?) WHERE job_id = ? RETURNING object_key, storage_deleted_at').bind(new Date().toISOString(), jobId).first();
    if (!artifact) return Response.json({ error: 'not_found' }, { status: 404 });
    if (!artifact.storage_deleted_at) {
      try { await env.FILES.delete(artifact.object_key); }
      catch { return Response.json({ error: 'artifact_cleanup_pending' }, { status: 503 }); }
    }
    if(['blind-check.fix','blind-check.fix-report','blind-check.fix-ai'].includes(job.kind) && !await deleteRepairReport(env,jobId)) return Response.json({error:'artifact_cleanup_pending'},{status:503});
    if(job.kind==='bid-evaluation.analyze') await env.DB.prepare('DELETE FROM bid_evaluation_web_reviews WHERE job_id=?').bind(jobId).run();
    if (!artifact.storage_deleted_at) await env.DB.prepare('UPDATE job_artifacts SET storage_deleted_at = COALESCE(storage_deleted_at, ?) WHERE job_id = ?').bind(new Date().toISOString(), jobId).run();
    if(job.kind==='technical-plan.export-word')try{await discardRecoveryForDeletedArtifact(env,ownerId,jobId);}catch{return Response.json({error:'artifact_cleanup_pending'},{status:503});}
    return new Response(null, { status: 204 });
  }
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const row = await env.DB.prepare("SELECT a.object_key,a.edit_revision,j.kind,json_extract(j.payload_json,'$.bidDocument') AS bid_document FROM job_artifacts a JOIN jobs j ON j.id = a.job_id WHERE j.id = ? AND j.project_id = ? AND j.owner_id = ? AND j.kind IN ('technical-plan.export-word', 'technical-plan.extract-template', 'duplicate-check.analyze', 'rejection-check.analyze', 'blind-check.inspect', 'blind-check.fix', 'blind-check.fix-report', 'blind-check.fix-ai', 'bid-evaluation.analyze', 'proposal-review.apply-suggestions') AND j.state = 'succeeded' AND a.deleted_at IS NULL").bind(jobId, projectId, ownerId).first();
  if (!row) return Response.json({ error: 'not_found' }, { status: 404 });
  const object = await env.FILES.get(row.object_key);
  if (!object) return Response.json({ error: 'not_found' }, { status: 404 });
  if(row.kind==='rejection-check.analyze'){
    let report;try{report=await object.json();}catch{return Response.json({error:'stored_data_invalid'},{status:503});}
    return Response.json(await filterRejectionReport(env,ownerId,jobId,report),{headers:{'content-disposition':'attachment; filename="revision.json"','x-content-type-options':'nosniff'}});
  }
  if (row.bid_document==='economic') return new Response(object.body,{headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="oferta-economica.pdf"','x-content-type-options':'nosniff'}});
  return new Response(object.body, { headers: { 'content-type': ['duplicate-check.analyze','rejection-check.analyze','blind-check.inspect','bid-evaluation.analyze'].includes(row.kind)?'application/json':mime, 'content-disposition': ['duplicate-check.analyze','rejection-check.analyze','blind-check.inspect','bid-evaluation.analyze'].includes(row.kind)?'attachment; filename="revision.json"':row.kind==='proposal-review.apply-suggestions'?'attachment; filename="propuesta-actualizada.docx"':(row.bid_document==='technical'?'attachment; filename="memoria-tecnica.docx"':'attachment; filename="documento.docx"'), 'x-content-type-options': 'nosniff', 'etag': `"${row.edit_revision || 0}"` } });
}

async function saveWordEdits(request,env,ownerId,projectId,jobId){
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 const row=await env.DB.prepare("SELECT a.object_key,a.edit_revision FROM job_artifacts a JOIN jobs j ON j.id=a.job_id WHERE j.id=? AND j.project_id=? AND j.owner_id=? AND j.kind='technical-plan.export-word' AND json_extract(j.payload_json,'$.bidDocument') IS NOT 'economic' AND j.state='succeeded' AND a.deleted_at IS NULL").bind(jobId,projectId,ownerId).first();
 if(!row)return Response.json({error:'not_found'},{status:404});
 if(request.headers.get('if-match')!==`"${row.edit_revision}"`)return Response.json({error:'document_changed'},{status:409});
 if(Number(request.headers.get('content-length'))>maxSize)return Response.json({error:'artifact_too_large'},{status:413});
 const bytes=await request.arrayBuffer(),data=new Uint8Array(bytes);
 if(bytes.byteLength>maxSize)return Response.json({error:'artifact_too_large'},{status:413});
 if(data.length<4||data[0]!==80||data[1]!==75||data[2]!==3||data[3]!==4)return Response.json({error:'invalid_docx'},{status:400});
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const key=`job-artifacts/${jobId}/${crypto.randomUUID()}`,mutation=crypto.randomUUID(),now=new Date().toISOString();
 await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(mutation,ownerId,key,Date.now()+uploadLeaseMs,Date.now()).run();
 try{
  await env.FILES.put(key,bytes);
  await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=?').bind(mutation).run();
  const saved=await env.DB.prepare('UPDATE job_artifacts SET object_key=?,sha256=?,size=?,edit_revision=edit_revision+1,edited_at=? WHERE job_id=? AND edit_revision=? AND deleted_at IS NULL RETURNING edit_revision').bind(key,sha,bytes.byteLength,now,jobId,row.edit_revision).first();
  if(!saved)return Response.json({error:'document_changed'},{status:409});
  // The old object is collected only once no live record references it.
  await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at,writer_done) VALUES(?,?,?,'cleanup',0,?,1)").bind(crypto.randomUUID(),ownerId,row.object_key,Date.now()).run();
  return Response.json({revision:saved.edit_revision,savedAt:now},{headers:{etag:`"${saved.edit_revision}"`}});
 }finally{
  try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=?").bind(mutation).run();await cleanupDesktopUploads(env,ownerId);}catch{/* Cleanup is retried by the existing staging collector. */}
 }
}
