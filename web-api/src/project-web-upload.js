import {cleanupDesktopUploads, uploadLeaseMs} from './desktop-file-cleanup.js';

// Each attempt is staged independently. The receipt and published file are committed together.
export async function uploadProjectFile(request, env, owner, projectId, name, requestKey) {
  try { await cleanupDesktopUploads(env, owner); } catch { /* A later operation can retry. */ }
  const file = {id: crypto.randomUUID(), name, contentType: request.headers.get('content-type') || 'application/octet-stream', size: 0, createdAt: new Date().toISOString()};
  const key = `projects/${projectId}/${file.id}`, stagingId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO desktop_file_staging (id,owner_id,object_key,state,lease_until,created_at) VALUES (?,?,?,'writing',?,?)").bind(stagingId,owner,key,Date.now()+uploadLeaseMs,Date.now()).run();
  let published = false;
  try {
    const stored = await env.FILES.put(key, request.body);
    if (!stored || !Number.isSafeInteger(stored.size) || stored.size < 0) throw new Error('R2 did not return the stored object size.');
    file.size = stored.size;
    await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(stagingId,owner).run();
    const object = await env.FILES.get(key);
    if (!object?.body || object.size !== file.size) throw new Error('Staged project upload is unavailable.');
    const digest = new crypto.DigestStream('SHA-256');
    await object.body.pipeTo(digest);
    const hash = Array.from(new Uint8Array(await digest.digest), byte => byte.toString(16).padStart(2,'0')).join('');
    const now = Date.now();
    const results = await env.DB.batch([
      env.DB.prepare("INSERT INTO project_web_upload_receipts(owner_id,project_id,request_key,file_id,name,content_type,size,content_hash,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND owner_id=?) AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?) ON CONFLICT(owner_id,project_id,request_key) DO NOTHING").bind(owner,projectId,requestKey,file.id,file.name,file.contentType,file.size,hash,file.createdAt,projectId,owner,stagingId,owner,now),
      env.DB.prepare('INSERT INTO project_files(id,project_id,name,content_type,object_key,size,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM project_web_upload_receipts WHERE owner_id=? AND project_id=? AND request_key=? AND file_id=?)').bind(file.id,projectId,file.name,file.contentType,key,file.size,file.createdAt,owner,projectId,requestKey,file.id),
      env.DB.prepare("DELETE FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND EXISTS (SELECT 1 FROM project_files WHERE id=? AND project_id=? AND object_key=?)").bind(stagingId,owner,file.id,projectId,key),
    ]);
    if (results[0].meta.changes) { published = true; return Response.json({file},{status:201}); }
    const receipt = await env.DB.prepare('SELECT file_id AS id,name,content_type AS contentType,size,content_hash AS hash,created_at AS createdAt FROM project_web_upload_receipts WHERE owner_id=? AND project_id=? AND request_key=?').bind(owner,projectId,requestKey).first();
    if (!receipt) throw new Error('Project upload expired or the project is no longer available.');
    if (receipt.name !== file.name || receipt.contentType !== file.contentType || receipt.size !== file.size || receipt.hash !== hash) return Response.json({error:'idempotency_conflict'},{status:409});
    const current = await env.DB.prepare('SELECT id FROM project_files WHERE id=? AND project_id=?').bind(receipt.id,projectId).first();
    if (!current) return Response.json({error:'file_removed'},{status:410});
    const {hash: ignored, ...original} = receipt;
    return Response.json({file:original});
  } finally {
    if (!published) {
      try { await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(stagingId,owner).run(); await cleanupDesktopUploads(env,owner); } catch { /* The staging record remains for later cleanup. */ }
    }
  }
}
