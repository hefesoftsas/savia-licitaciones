import { cleanupDesktopUploads, uploadLeaseMs } from './desktop-file-cleanup.js';

const partSize=10*1024*1024, maxSize=1024*1024*1024;
const bad=()=>Response.json({error:'invalid_file'},{status:400});
const conflict=()=>Response.json({error:'source_conflict'},{status:409});
const missing=()=>Response.json({error:'not_found'},{status:404});
const enc=new TextEncoder(), hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=text=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
async function signingKey(env){return crypto.subtle.importKey('raw',enc.encode(env.BETTER_AUTH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function sign(env,data){const payload=b64(enc.encode(JSON.stringify(data))),sig=await crypto.subtle.sign('HMAC',await signingKey(env),enc.encode(`savia-multipart-v1.${payload}`));return `${payload}.${b64(new Uint8Array(sig))}`;}
async function openHandle(env,token,owner,requestId,sourceKey){
 try{if(typeof token!=='string'||token.length>4096)return null;const parts=token.split('.');if(parts.length!==2||!await crypto.subtle.verify('HMAC',await signingKey(env),unb64(parts[1]),enc.encode(`savia-multipart-v1.${parts[0]}`)))return null;const value=JSON.parse(new TextDecoder().decode(unb64(parts[0])));if(value.owner!==owner||value.requestId!==requestId||value.sourceKey!==sourceKey||value.expires<=Date.now())return null;return value;}catch{return null;}
}
const matches=(row,m)=>row&&row.content_hash===m.hash&&row.name===m.name&&row.content_type===m.contentType&&row.size===m.size;
const view=row=>({id:row.file_id,name:row.name,contentType:row.content_type,size:row.size,createdAt:row.created_at});
async function prior(env,owner,requestId,sourceKey,metadata){
 const row=await env.DB.prepare('SELECT * FROM desktop_plan_file_imports WHERE owner_id=? AND request_id=? AND source_key=?').bind(owner,requestId,sourceKey).first();
 if(!row)return null;if(!matches(row,metadata))return conflict();
 const removed=await env.DB.prepare('SELECT 1 AS present FROM project_file_deletions WHERE id=? AND project_id=?').bind(row.file_id,row.project_id).first();
 return removed?Response.json({error:'file_removed'},{status:410}):Response.json({file:view(row)});
}
async function release(env,owner,id){try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(id,owner).run();await cleanupDesktopUploads(env,owner);}catch{/* staging remains eligible for cleanup */}}
export async function desktopMultipart(request,env,runner,requestId,sourceKey,action,indexText){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)||!/^[a-f0-9]{64}$/.test(sourceKey))return bad();
 const owner=runner.ownerId;
 if(action==='start'){
  let m;try{m=await request.json();}catch{return bad();}
  if(!m||typeof m.name!=='string'||!m.name.trim()||m.name.length>255||/[\x00-\x1f\x7f]/.test(m.name)||typeof m.contentType!=='string'||!m.contentType||m.contentType.length>200||!Number.isSafeInteger(m.size)||m.size<=50*1024*1024||m.size>maxSize||!/^[a-f0-9]{64}$/.test(m.hash||''))return bad();
  const project=await env.DB.prepare('SELECT p.id FROM desktop_plan_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=?').bind(owner,requestId).first();if(!project)return missing();
  const previous=await prior(env,owner,requestId,sourceKey,m);if(previous)return previous;
  const id=crypto.randomUUID(),key=`desktop-multipart/${project.id}/${crypto.randomUUID()}`,now=Date.now(),expires=now+uploadLeaseMs;
  await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(id,owner,key,expires,now).run();
  let upload;try{upload=await env.FILES.createMultipartUpload(key);const handle=await sign(env,{owner,requestId,sourceKey,id,key,projectId:project.id,uploadId:upload.uploadId,expires,metadata:m});return Response.json({handle,partSize});}catch(error){if(upload)await upload.abort().catch(()=>{});await release(env,owner,id);throw error;}
 }
 let token,input;
 if(action==='part')token=request.headers.get('x-savia-multipart');
 else {try{input=await request.json();token=input.handle;}catch{return bad();}}
 const handle=await openHandle(env,token,owner,requestId,sourceKey);if(!handle)return bad();
 const active=await env.DB.prepare("SELECT 1 AS ok FROM desktop_file_staging WHERE id=? AND owner_id=? AND object_key=? AND state='writing' AND lease_until>?").bind(handle.id,owner,handle.key,Date.now()).first();if(!active)return conflict();
 const upload=env.FILES.resumeMultipartUpload(handle.key,handle.uploadId), count=Math.ceil(handle.metadata.size/partSize);
 if(action==='abort'){
  try{await upload.abort();}catch{/* An already completed or expired upload has nothing left to abort. */}
  await release(env,owner,handle.id);return Response.json({aborted:true});
 }
 if(action==='part'){
  const n=Number(indexText);if(!/^[1-9]\d*$/.test(indexText)||!Number.isSafeInteger(n)||n>count||!request.body)return bad();
  const length=n===count?handle.metadata.size-partSize*(count-1):partSize;
  try{const part=await upload.uploadPart(n,request.body.pipeThrough(new FixedLengthStream(length)));return Response.json(part);}catch{return Response.json({error:'part_unavailable'},{status:503});}
 }
 if(action==='complete'){
  if(!Array.isArray(input.parts)||input.parts.length!==count||input.parts.some((p,i)=>p?.partNumber!==i+1||typeof p.etag!=='string'||!p.etag||p.etag.length>200))return bad();
  let published=false;
  try{
   const object=await upload.complete(input.parts);
   await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(handle.id,owner).run();
   if(object.size!==handle.metadata.size)return bad();
   const stored=await env.FILES.get(handle.key);if(!stored?.body||stored.size!==handle.metadata.size)return bad();
   const checksum=new crypto.DigestStream('SHA-256');await stored.body.pipeTo(checksum);
   if(hex(await checksum.digest)!==handle.metadata.hash)return bad();
   const m=handle.metadata,id=crypto.randomUUID(),now=new Date().toISOString(),mutation=handle.id;
   const outcome=await env.DB.batch([
    env.DB.prepare("INSERT INTO desktop_plan_file_imports(owner_id,request_id,source_key,file_id,project_id,content_hash,name,content_type,size,object_key,mutation_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?) AND EXISTS (SELECT 1 FROM projects WHERE id=? AND owner_id=?) ON CONFLICT(owner_id,request_id,source_key) DO NOTHING").bind(owner,requestId,sourceKey,id,handle.projectId,m.hash,m.name,m.contentType,m.size,handle.key,mutation,now,mutation,owner,Date.now(),handle.projectId,owner),
    env.DB.prepare('INSERT INTO project_files(id,project_id,name,content_type,object_key,size,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM desktop_plan_file_imports WHERE owner_id=? AND request_id=? AND source_key=? AND mutation_id=?)').bind(id,handle.projectId,m.name,m.contentType,handle.key,m.size,now,owner,requestId,sourceKey,mutation),
    env.DB.prepare("DELETE FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND EXISTS (SELECT 1 FROM desktop_plan_file_imports WHERE owner_id=? AND request_id=? AND source_key=? AND mutation_id=?)").bind(mutation,owner,owner,requestId,sourceKey,mutation),
   ]);
   if(outcome[0].meta.changes){published=true;return Response.json({file:{id,name:m.name,contentType:m.contentType,size:m.size,createdAt:now}},{status:201});}
   return await prior(env,owner,requestId,sourceKey,m) || conflict();
  }finally{if(!published){try{await upload.abort();}catch{/* Already completed or expired. */}await release(env,owner,handle.id);}}
 }
 return bad();
}
