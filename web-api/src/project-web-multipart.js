import {cleanupDesktopUploads,uploadLeaseMs} from './desktop-file-cleanup.js';
const partSize=10*1024*1024,maxSize=1024*1024*1024,enc=new TextEncoder();
const bad=()=>Response.json({error:'invalid_file'},{status:400}),missing=()=>Response.json({error:'not_found'},{status:404}),conflict=()=>Response.json({error:'idempotency_conflict'},{status:409});
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=text=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
async function signingKey(env){return crypto.subtle.importKey('raw',enc.encode(env.BETTER_AUTH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function sign(env,value){const payload=b64(enc.encode(JSON.stringify(value))),sig=await crypto.subtle.sign('HMAC',await signingKey(env),enc.encode(`savia-web-upload-v1.${payload}`));return `${payload}.${b64(new Uint8Array(sig))}`;}
async function decode(env,token,owner,projectId){try{if(typeof token!=='string'||token.length>4096)return null;const parts=token.split('.');if(parts.length!==2||!await crypto.subtle.verify('HMAC',await signingKey(env),unb64(parts[1]),enc.encode(`savia-web-upload-v1.${parts[0]}`)))return null;const value=JSON.parse(new TextDecoder().decode(unb64(parts[0])));return value.owner===owner&&value.projectId===projectId&&value.expires>Date.now()?value:null;}catch{return null;}}
async function release(env,owner,id){try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(id,owner).run();await cleanupDesktopUploads(env,owner);}catch{/* A later cleanup can retry. */}}
export async function projectWebMultipart(request,env,owner,projectId,action,indexText){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 const project=await env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(projectId,owner).first();if(!project)return missing();
 if(action==='start'){
  let m;try{m=await request.json();}catch{return bad();}
  if(!m||typeof m.name!=='string'||!m.name.trim()||m.name.length>255||/[\x00-\x1f\x7f]/.test(m.name)||typeof m.contentType!=='string'||!m.contentType||m.contentType.length>200||/[\x00-\x1f\x7f]/.test(m.contentType)||!Number.isSafeInteger(m.size)||m.size<=50*1024*1024||m.size>maxSize||!/^[A-Za-z0-9._:-]{1,128}$/.test(m.requestKey||''))return bad();
  try{await cleanupDesktopUploads(env,owner);}catch{/* Retry later. */}
  const id=crypto.randomUUID(),key=`projects/${projectId}/${crypto.randomUUID()}`,now=Date.now(),expires=now+uploadLeaseMs;
  await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(id,owner,key,expires,now).run();
  let upload;try{upload=await env.FILES.createMultipartUpload(key);const handle=await sign(env,{owner,projectId,id,key,uploadId:upload.uploadId,expires,metadata:{name:m.name.trim(),contentType:m.contentType,size:m.size,requestKey:m.requestKey}});return Response.json({handle,partSize});}catch(error){if(upload)await upload.abort().catch(()=>{});await release(env,owner,id);throw error;}
 }
 let token,input;if(action==='part')token=request.headers.get('x-savia-multipart');else{try{input=await request.json();token=input.handle;}catch{return bad();}}
 const handle=await decode(env,token,owner,projectId);if(!handle)return bad();
 const active=await env.DB.prepare("SELECT 1 AS ok FROM desktop_file_staging WHERE id=? AND owner_id=? AND object_key=? AND state='writing' AND lease_until>?").bind(handle.id,owner,handle.key,Date.now()).first();if(!active)return conflict();
 const upload=env.FILES.resumeMultipartUpload(handle.key,handle.uploadId),count=Math.ceil(handle.metadata.size/partSize);
 if(action==='abort'){try{await upload.abort();}catch{/* Already finished or expired. */}await release(env,owner,handle.id);return Response.json({aborted:true});}
 if(action==='part'){const n=Number(indexText);if(!/^[1-9]\d*$/.test(indexText)||!Number.isSafeInteger(n)||n>count||!request.body)return bad();const length=n===count?handle.metadata.size-partSize*(count-1):partSize;try{return Response.json(await upload.uploadPart(n,request.body.pipeThrough(new FixedLengthStream(length))));}catch{return Response.json({error:'part_unavailable'},{status:503});}}
 if(action!=='complete'||!Array.isArray(input.parts)||input.parts.length!==count||input.parts.some((p,i)=>p?.partNumber!==i+1||typeof p.etag!=='string'||!p.etag||p.etag.length>200))return bad();
 let published=false;try{
  const object=await upload.complete(input.parts);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(handle.id,owner).run();if(object.size!==handle.metadata.size)return bad();
  const stored=await env.FILES.get(handle.key);if(!stored?.body||stored.size!==handle.metadata.size)return bad();const hashStream=new crypto.DigestStream('SHA-256');await stored.body.pipeTo(hashStream);const hash=hex(await hashStream.digest),m=handle.metadata,file={id:crypto.randomUUID(),name:m.name,contentType:m.contentType,size:m.size,createdAt:new Date().toISOString()};
  const results=await env.DB.batch([
   env.DB.prepare("INSERT INTO project_web_upload_receipts(owner_id,project_id,request_key,file_id,name,content_type,size,content_hash,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND owner_id=?) AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?) ON CONFLICT(owner_id,project_id,request_key) DO NOTHING").bind(owner,projectId,m.requestKey,file.id,file.name,file.contentType,file.size,hash,file.createdAt,projectId,owner,handle.id,owner,Date.now()),
   env.DB.prepare('INSERT INTO project_files(id,project_id,name,content_type,object_key,size,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM project_web_upload_receipts WHERE owner_id=? AND project_id=? AND request_key=? AND file_id=?)').bind(file.id,projectId,file.name,file.contentType,handle.key,file.size,file.createdAt,owner,projectId,m.requestKey,file.id),
   env.DB.prepare("DELETE FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND EXISTS (SELECT 1 FROM project_files WHERE id=? AND project_id=? AND object_key=?)").bind(handle.id,owner,file.id,projectId,handle.key),
  ]);if(results[0].meta.changes){published=true;return Response.json({file},{status:201});}
  const receipt=await env.DB.prepare('SELECT file_id AS id,name,content_type AS contentType,size,content_hash AS hash,created_at AS createdAt FROM project_web_upload_receipts WHERE owner_id=? AND project_id=? AND request_key=?').bind(owner,projectId,m.requestKey).first();if(!receipt||receipt.name!==file.name||receipt.contentType!==file.contentType||receipt.size!==file.size||receipt.hash!==hash)return conflict();const current=await env.DB.prepare('SELECT id FROM project_files WHERE id=? AND project_id=?').bind(receipt.id,projectId).first();if(!current)return Response.json({error:'file_removed'},{status:410});const {hash:ignored,...original}=receipt;return Response.json({file:original});
 }finally{if(!published){try{await upload.abort();}catch{/* Complete or expired. */}await release(env,owner,handle.id);}}
}
