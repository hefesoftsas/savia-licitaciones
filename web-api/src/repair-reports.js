import {digest} from './runners.js';
import {cleanupDesktopUploads,uploadLeaseMs} from './desktop-file-cleanup.js';
const maxSize=25*1024*1024;
const conflict=()=>Response.json({error:'lease_conflict'},{status:409});
const missing=()=>Response.json({error:'not_found'},{status:404});
async function active(env,runner,jobId,hash){return env.DB.prepare("SELECT id FROM jobs WHERE id=? AND owner_id=? AND runner_id=? AND lease_hash=? AND state='running' AND lease_expires_at>? AND kind IN ('blind-check.fix-report','blind-check.fix-ai') AND EXISTS (SELECT 1 FROM job_artifacts a WHERE a.job_id=jobs.id AND a.deleted_at IS NULL)").bind(jobId,runner.ownerId,runner.id,hash,Date.now()).first();}
export async function uploadRepairReport(request,env,runner,jobId){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 const lease=request.headers.get('x-savia-lease')||'';if(!/^[a-f0-9]{64}$/.test(lease))return Response.json({error:'invalid_lease'},{status:400});const hash=await digest(lease);
 if(!await active(env,runner,jobId,hash))return conflict();
 if(Number(request.headers.get('content-length'))>maxSize)return Response.json({error:'artifact_too_large'},{status:413});const bytes=await request.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>maxSize)return Response.json({error:'artifact_too_large'},{status:413});
 try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||!Array.isArray(value.after?.groups))throw new Error();}catch{return Response.json({error:'invalid_report'},{status:400});}
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join(''),id=crypto.randomUUID(),key=`repair-reports/${jobId}/${id}`,mutation=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO desktop_file_staging (id,owner_id,object_key,state,lease_until,created_at) VALUES (?,?,?,'writing',?,?)").bind(mutation,runner.ownerId,key,Date.now()+uploadLeaseMs,Date.now()).run();
 try{
  await env.FILES.put(key,bytes);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(mutation,runner.ownerId).run();
  const row=await env.DB.prepare("INSERT INTO job_repair_reports (id,job_id,object_key,sha256,size,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM jobs WHERE id=? AND owner_id=? AND runner_id=? AND lease_hash=? AND state='running' AND lease_expires_at>? AND kind IN ('blind-check.fix-report','blind-check.fix-ai') AND EXISTS (SELECT 1 FROM job_artifacts a WHERE a.job_id=jobs.id AND a.deleted_at IS NULL)) AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?) ON CONFLICT(job_id) DO NOTHING RETURNING id,sha256,size").bind(id,jobId,key,sha,bytes.byteLength,new Date().toISOString(),jobId,runner.ownerId,runner.id,hash,Date.now(),mutation,runner.ownerId,Date.now()).first();
  if(row)return Response.json({report:{id:row.id,size:row.size}});
  if(!await active(env,runner,jobId,hash))return conflict();const previous=await env.DB.prepare('SELECT id,sha256,size FROM job_repair_reports WHERE job_id=? AND deleted_at IS NULL').bind(jobId).first();return previous?.sha256===sha?Response.json({report:{id:previous.id,size:previous.size}}):conflict();
 }finally{try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(mutation,runner.ownerId).run();await cleanupDesktopUploads(env,runner.ownerId);}catch{/* Cleanup is retried later. */}}
}
export async function downloadRepairReport(request,env,owner,projectId,jobId){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 const row=await env.DB.prepare("SELECT r.object_key FROM job_repair_reports r JOIN jobs j ON j.id=r.job_id JOIN job_artifacts a ON a.job_id=j.id WHERE j.id=? AND j.project_id=? AND j.owner_id=? AND j.kind IN ('blind-check.fix-report','blind-check.fix-ai') AND j.state='succeeded' AND r.deleted_at IS NULL AND a.deleted_at IS NULL").bind(jobId,projectId,owner).first();if(!row)return missing();
 const object=await env.FILES.get(row.object_key);if(!object)return missing();return new Response(object.body,{headers:{'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'}});
}
export async function deleteRepairReport(env,jobId){
 const row=await env.DB.prepare('UPDATE job_repair_reports SET deleted_at=COALESCE(deleted_at,?) WHERE job_id=? RETURNING object_key,storage_deleted_at').bind(new Date().toISOString(),jobId).first();
 if(!row||row.storage_deleted_at)return true;
 try{await env.FILES.delete(row.object_key);}catch{return false;}
 await env.DB.prepare('UPDATE job_repair_reports SET storage_deleted_at=COALESCE(storage_deleted_at,?) WHERE job_id=?').bind(new Date().toISOString(),jobId).run();return true;
}
