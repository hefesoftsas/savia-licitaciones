import {cleanupDesktopUploads,uploadLeaseMs} from './desktop-file-cleanup.js';

const maxBytes=256*1024*1024;
const missing=()=>Response.json({error:'not_found'},{status:404});
const bad=()=>Response.json({error:'invalid_input'},{status:400});
const view=row=>({id:row.id,name:row.name,contentType:row.content_type,size:row.size,sha256:row.sha256,createdAt:row.created_at});
async function checksum(body){const digest=new crypto.DigestStream('SHA-256');await body.pipeTo(digest);return Array.from(new Uint8Array(await digest.digest),byte=>byte.toString(16).padStart(2,'0')).join('');}
export async function submissionAttachments(request,env,owner,projectId,requestId,fileId){
 const exists=await env.DB.prepare('SELECT r.id FROM project_submission_requests r JOIN projects p ON p.id=r.project_id WHERE p.id=? AND p.owner_id=? AND r.id=?').bind(projectId,owner,requestId).first();if(!exists)return missing();
 if(request.method==='GET'&&fileId){
  const row=await env.DB.prepare('SELECT * FROM project_submission_attachments WHERE id=? AND project_id=? AND request_id=?').bind(fileId,projectId,requestId).first();if(!row)return missing();
  const first=await env.FILES.get(row.object_key);if(!first?.body||first.size!==row.size||await checksum(first.body)!==row.sha256)return Response.json({error:'file_integrity'},{status:409});
  const verified=await env.FILES.get(row.object_key,{onlyIf:{etagMatches:first.etag}});if(!verified?.body||verified.size!==row.size)return Response.json({error:'file_changed'},{status:409});
  const filename=encodeURIComponent(row.name).replace(/['()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`);return new Response(verified.body,{headers:{'content-type':row.content_type,'content-disposition':`attachment; filename*=UTF-8''${filename}`,'x-content-type-options':'nosniff'}});
 }
 if(request.method!=='POST'||fileId)return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let name;try{name=decodeURIComponent(request.headers.get('x-file-name')||'').trim();}catch{return bad();}
 const requestKey=request.headers.get('idempotency-key'),contentType=request.headers.get('content-type')||'application/octet-stream';
 if(!name||name.length>255||/[\x00-\x1f\x7f/\\]/.test(name)||!requestKey||!/^[A-Za-z0-9._:-]{1,128}$/.test(requestKey)||contentType.length>200||/[\x00-\x1f\x7f]/.test(contentType))return bad();
 const declared=request.headers.get('x-savia-size');if(declared===null||!/^(0|[1-9]\d*)$/.test(declared)||!Number.isSafeInteger(Number(declared)))return bad();const size=Number(declared);if(size>maxBytes)return Response.json({error:'file_too_large'},{status:413});
 try{await cleanupDesktopUploads(env,owner);}catch{/* Retry cleanup on a later operation. */}
 const id=crypto.randomUUID(),stagingId=crypto.randomUUID(),key=`submission/${projectId}/${id}`,createdAt=new Date().toISOString();
 await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(stagingId,owner,key,Date.now()+uploadLeaseMs,Date.now()).run();
 let published=false,invalidSize=false,total=0;
 try{
  const limiter=new TransformStream({transform(chunk,controller){total+=chunk.byteLength;if(total>size){invalidSize=true;throw new Error('size mismatch');}controller.enqueue(chunk);},flush(){if(total!==size){invalidSize=true;throw new Error('size mismatch');}}});
  const source=request.body||new ReadableStream({start(controller){controller.close();}}),fixed=new FixedLengthStream(size);const [stored]=await Promise.all([env.FILES.put(key,fixed.readable),source.pipeThrough(limiter).pipeTo(fixed.writable)]);
  if(!stored||stored.size!==total)throw new Error('Staged attachment size mismatch.');
  await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(stagingId,owner).run();
  const object=await env.FILES.get(key);if(!object?.body||object.size!==total)throw new Error('Staged attachment unavailable.');const sha256=await checksum(object.body);
  const batch=await env.DB.batch([
   env.DB.prepare("INSERT INTO project_submission_attachments(id,project_id,request_id,request_key,name,content_type,size,sha256,object_key,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM project_submission_requests r JOIN projects p ON p.id=r.project_id WHERE r.id=? AND p.id=? AND p.owner_id=?) AND EXISTS(SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?) ON CONFLICT(project_id,request_id,request_key) DO NOTHING").bind(id,projectId,requestId,requestKey,name,contentType,total,sha256,key,createdAt,requestId,projectId,owner,stagingId,owner,Date.now()),
   env.DB.prepare("DELETE FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND EXISTS(SELECT 1 FROM project_submission_attachments WHERE id=? AND object_key=?)").bind(stagingId,owner,id,key),
  ]);
  if(batch[0].meta.changes){published=true;return Response.json({file:{id,name,contentType,size:total,sha256,createdAt}},{status:201});}
  const row=await env.DB.prepare('SELECT * FROM project_submission_attachments WHERE project_id=? AND request_id=? AND request_key=?').bind(projectId,requestId,requestKey).first();if(!row)throw new Error('Attachment upload expired or request unavailable.');
  if(row.name!==name||row.content_type!==contentType||row.size!==total||row.sha256!==sha256)return Response.json({error:'idempotency_conflict'},{status:409});
  const existing=await env.FILES.get(row.object_key);if(!existing?.body||existing.size!==row.size||await checksum(existing.body)!==row.sha256)return Response.json({error:'file_integrity'},{status:409});return Response.json({file:view(row)});
 }catch(error){if(invalidSize)return Response.json({error:'size_mismatch'},{status:400});throw error;}
 finally{if(!published){try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(stagingId,owner).run();await cleanupDesktopUploads(env,owner);}catch{/* Preserve staging for later cleanup. */}}}
}
