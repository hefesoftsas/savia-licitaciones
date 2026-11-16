import {cleanupDesktopUploads, uploadLeaseMs} from './desktop-file-cleanup.js';

const missing=()=>Response.json({error:'not_found'},{status:404});
const conflict=()=>Response.json({error:'document_changed'},{status:409});
const mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const maxSize=25*1024*1024;
function scheduleRecoveryCleanup(env,owner,jobId,revision) {
 return env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at,writer_done) SELECT ?,owner_id,object_key,'cleanup',0,?,1 FROM word_recoveries WHERE job_id=? AND owner_id=? AND revision=? ON CONFLICT(object_key) DO NOTHING").bind(crypto.randomUUID(),Date.now(),jobId,owner,revision);
}
export async function discardRecoveryForDeletedArtifact(env,owner,jobId){
 const current=await env.DB.prepare('SELECT object_key,revision FROM word_recoveries WHERE job_id=? AND owner_id=?').bind(jobId,owner).first();
 if(!current)return;
 await env.DB.batch([scheduleRecoveryCleanup(env,owner,jobId,current.revision),env.DB.prepare('DELETE FROM word_recoveries WHERE job_id=? AND owner_id=? AND revision=?').bind(jobId,owner,current.revision)]);
 await cleanupDesktopUploads(env,owner);
}
export async function wordRecovery(request,env,owner,projectId,jobId){
 const artifact=await env.DB.prepare("SELECT a.edit_revision FROM job_artifacts a JOIN jobs j ON j.id=a.job_id WHERE j.id=? AND j.project_id=? AND j.owner_id=? AND j.kind='technical-plan.export-word' AND j.state='succeeded' AND a.deleted_at IS NULL").bind(jobId,projectId,owner).first();
 if(!artifact)return missing();
 const current=await env.DB.prepare('SELECT object_key,base_revision,revision FROM word_recoveries WHERE job_id=? AND owner_id=?').bind(jobId,owner).first();
 if(request.method==='GET'){
  if(!current)return missing();
  const object=await env.FILES.get(current.object_key);if(!object)return missing();
  return new Response(object.body,{headers:{'content-type':mime,etag:`"${current.revision}"`,'x-base-revision':`"${current.base_revision}"`,'x-content-type-options':'nosniff'}});
 }
 if(!['PUT','DELETE'].includes(request.method))return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 if(request.method==='DELETE'){
  if(!current)return missing();
  if(request.headers.get('if-match')!==`"${current.revision}"`)return conflict();
  const [,result]=await env.DB.batch([scheduleRecoveryCleanup(env,owner,jobId,current.revision),env.DB.prepare('DELETE FROM word_recoveries WHERE job_id=? AND owner_id=? AND revision=? RETURNING object_key').bind(jobId,owner,current.revision)]);
  const deleted=result.results?.[0];
  if(!deleted)return conflict();
  try{await cleanupDesktopUploads(env,owner);}catch{}
  return new Response(null,{status:204});
 }
 if(request.headers.get('if-match')!==`"${artifact.edit_revision}"`)return conflict();
 const expected=request.headers.get('x-recovery-version')||'';
 if(!/^(?:0|[1-9]\d*|[a-f0-9-]{36})$/.test(expected)||expected!==String(current?.revision??'0'))return conflict();
 if(Number(request.headers.get('content-length'))>maxSize)return Response.json({error:'artifact_too_large'},{status:413});
 const bytes=await request.arrayBuffer(),data=new Uint8Array(bytes);
 if(data.length>maxSize)return Response.json({error:'artifact_too_large'},{status:413});
 if(data.length<4||data[0]!==80||data[1]!==75||data[2]!==3||data[3]!==4)return Response.json({error:'invalid_docx'},{status:400});
 const key=`word-recovery/${jobId}/${crypto.randomUUID()}`,mutation=crypto.randomUUID(),now=Date.now();
 await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(mutation,owner,key,now+uploadLeaseMs,now).run();
 try{
  await env.FILES.put(key,bytes);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=?').bind(mutation).run();
  const [,result]=await env.DB.batch([scheduleRecoveryCleanup(env,owner,jobId,expected),env.DB.prepare("INSERT INTO word_recoveries(job_id,owner_id,object_key,base_revision,revision,updated_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM job_artifacts a JOIN jobs j ON j.id=a.job_id WHERE j.id=? AND j.project_id=? AND j.owner_id=? AND a.deleted_at IS NULL AND a.edit_revision=?) ON CONFLICT(job_id) DO UPDATE SET object_key=excluded.object_key,base_revision=excluded.base_revision,revision=excluded.revision,updated_at=excluded.updated_at WHERE word_recoveries.owner_id=excluded.owner_id AND CAST(word_recoveries.revision AS TEXT)=? RETURNING revision").bind(jobId,owner,key,artifact.edit_revision,crypto.randomUUID(),new Date(now).toISOString(),jobId,projectId,owner,artifact.edit_revision,expected)]);
  const saved=result.results?.[0];
  if(!saved)return conflict();
  return Response.json({revision:saved.revision},{headers:{etag:`"${saved.revision}"`}});
 }finally{try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=?").bind(mutation).run();await cleanupDesktopUploads(env,owner);}catch{}}
}
