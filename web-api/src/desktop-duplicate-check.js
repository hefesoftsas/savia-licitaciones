import {cleanupDesktopUploads,uploadLeaseMs} from './desktop-file-cleanup.js';
const missing=()=>Response.json({error:'not_found'},{status:404});
const conflict=()=>Response.json({error:'import_conflict'},{status:409});
const bad=()=>Response.json({error:'invalid_import'},{status:400});
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('');
const hashText=value=>digest(new TextEncoder().encode(value));
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);

async function staged(env,owner,key,mutate){
 const id=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO desktop_file_staging (id,owner_id,object_key,state,lease_until,created_at) VALUES (?,?,?,'writing',?,?)").bind(id,owner,key,Date.now()+uploadLeaseMs,Date.now()).run();
 try {
  const response=await mutate(id);
  return response;
 } finally {
  try {await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(id,owner).run();await cleanupDesktopUploads(env,owner);}catch{/* Later cleanup retries the staging record. */}
 }
}
async function store(env,owner,key,id,bytes){await env.FILES.put(key,bytes);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(id,owner).run();}
const validStage="EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?)";

export async function importDuplicateReview(request,env,runner,requestId,reviewType='duplicate'){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId))return bad();
 if(Number(request.headers.get('content-length')||0)>25*1024*1024)return Response.json({error:'too_large'},{status:413});
 const text=await request.text();if(new TextEncoder().encode(text).byteLength>25*1024*1024)return Response.json({error:'too_large'},{status:413});
 let data;try{data=JSON.parse(text);}catch{return bad();}
 const asset=value=>isObject(value)&&typeof value.expected==='boolean'&&(value.expected||typeof value.reason==='string'&&value.reason.length<=100);
 if(!isObject(data)||!isObject(data.tables)||Object.values(data.tables).some(rows=>!Array.isArray(rows)||rows.some(row=>!isObject(row)))||!Array.isArray(data.files)||data.files.length>5000||data.files.some(file=>!isObject(file)||typeof file.id!=='string'||!file.id||file.id.length>256||!asset(file.original)||!asset(file.content)))return bad();
 const ids=new Set(data.files.map(file=>file.id));if(ids.size!==data.files.length)return bad();
 const contentHash=await hashText(text),lookup=()=>env.DB.prepare('SELECT id,content_hash,deleting,deleted FROM imported_duplicate_checks WHERE owner_id=? AND request_id=? AND review_type=?').bind(runner.ownerId,requestId,reviewType).first();
 const responseFor=row=>!row?conflict():row.deleting||row.deleted?Response.json({error:'removed'},{status:410}):row.content_hash===contentHash?Response.json({id:row.id}):conflict();
 const existing=await lookup();if(existing)return responseFor(existing);
 const reviewId=crypto.randomUUID(),key=`duplicate-check/${crypto.randomUUID()}`,now=new Date().toISOString();
 return staged(env,runner.ownerId,key,async mutation=>{
  await store(env,runner.ownerId,key,mutation,text);
  const inserted=await env.DB.prepare(`INSERT INTO imported_duplicate_checks (id,owner_id,request_id,object_key,content_hash,mutation_id,created_at,review_type) SELECT ?,?,?,?,?,?,?,? WHERE ${validStage} ON CONFLICT(owner_id,request_id) DO NOTHING`).bind(reviewId,runner.ownerId,requestId,key,contentHash,mutation,now,reviewType,mutation,runner.ownerId,Date.now()).run();
  if(inserted.meta.changes)return Response.json({id:reviewId},{status:201});
  return responseFor(await lookup());
 });
}

export async function importedDuplicateReview(request,env,owner,id,reviewType='duplicate'){
 if(request.method==='DELETE'&&id){
  if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
  const row=await env.DB.prepare('UPDATE imported_duplicate_checks SET deleting=1 WHERE id=? AND owner_id=? AND review_type=? AND deleted=0 RETURNING object_key').bind(id,owner,reviewType).first();if(!row)return missing();
  const {results}=await env.DB.prepare('SELECT object_key FROM imported_duplicate_check_files WHERE review_id=? AND owner_id=?').bind(id,owner).all();
  try{for(const file of results)await env.FILES.delete(file.object_key);await env.FILES.delete(row.object_key);}catch{return Response.json({error:'file_cleanup_pending'},{status:503});}
  await env.DB.batch([env.DB.prepare('DELETE FROM imported_duplicate_check_files WHERE review_id=? AND owner_id=?').bind(id,owner),env.DB.prepare('UPDATE imported_duplicate_checks SET deleted=1,deleting=0 WHERE id=? AND owner_id=? AND deleting=1').bind(id,owner)]);
  return new Response(null,{status:204});
 }
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 if(!id){const {results}=await env.DB.prepare('SELECT id,created_at,deleting FROM imported_duplicate_checks WHERE owner_id=? AND review_type=? AND deleted=0 ORDER BY created_at DESC,id').bind(owner,reviewType).all();return Response.json({reviews:results.map(row=>({id:row.id,createdAt:row.created_at,deleting:!!row.deleting}))});}
 const row=await env.DB.prepare('SELECT object_key FROM imported_duplicate_checks WHERE id=? AND owner_id=? AND review_type=? AND deleting=0 AND deleted=0').bind(id,owner,reviewType).first();if(!row)return missing();
 const object=await env.FILES.get(row.object_key);if(!object)return Response.json({error:'stored_data_missing'},{status:503});
 const data=await object.json(),{results}=await env.DB.prepare('SELECT source_key,kind FROM imported_duplicate_check_files WHERE review_id=? AND owner_id=?').bind(id,owner).all();
 const uploaded=new Set(results.map(row=>`${row.source_key}:${row.kind}`));
 for(const file of data.files){const key=await hashText(file.id);file.sourceKey=key;for(const kind of ['original','content'])file[kind].available=uploaded.has(`${key}:${kind}`);}
 return Response.json(data);
}

export async function importDuplicateFile(request,env,runner,reviewId,sourceKey,kind,restore=false,reviewType='duplicate'){
 if(request.method!==(restore?'PUT':'POST'))return new Response('Method not allowed',{status:405});
 if(restore&&request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 if(!/^[a-f0-9]{64}$/.test(sourceKey)||!['original','content'].includes(kind))return bad();
 const row=await env.DB.prepare('SELECT object_key FROM imported_duplicate_checks WHERE id=? AND owner_id=? AND review_type=? AND deleting=0 AND deleted=0').bind(reviewId,runner.ownerId,reviewType).first();if(!row)return missing();
 const snapshot=await env.FILES.get(row.object_key);if(!snapshot)return Response.json({error:'stored_data_missing'},{status:503});
 const data=await snapshot.json();let selected;for(const file of data.files)if(await hashText(file.id)===sourceKey){selected=file;break;}
 if(!selected||(restore?(kind!=='original'||selected[kind]?.expected):!selected[kind]?.expected))return missing();
 if(Number(request.headers.get('content-length')||0)>25*1024*1024)return Response.json({error:'too_large'},{status:413});
 const bytes=await request.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>25*1024*1024)return bad();
 const hash=await digest(bytes),lookup=()=>env.DB.prepare('SELECT content_hash FROM imported_duplicate_check_files WHERE review_id=? AND owner_id=? AND source_key=? AND kind=?').bind(reviewId,runner.ownerId,sourceKey,kind).first();
 const previous=await lookup();if(previous)return previous.content_hash===hash?Response.json({uploaded:true}):conflict();
 const key=`duplicate-check-files/${crypto.randomUUID()}`;
 return staged(env,runner.ownerId,key,async mutation=>{
  await store(env,runner.ownerId,key,mutation,bytes);
  const result=await env.DB.prepare(`INSERT INTO imported_duplicate_check_files (review_id,owner_id,source_key,kind,object_key,content_hash,mutation_id) SELECT ?,?,?,?,?,?,? WHERE ${validStage} AND EXISTS (SELECT 1 FROM imported_duplicate_checks WHERE id=? AND owner_id=? AND deleting=0 AND deleted=0) ON CONFLICT(review_id,source_key,kind) DO NOTHING`).bind(reviewId,runner.ownerId,sourceKey,kind,key,hash,mutation,mutation,runner.ownerId,Date.now(),reviewId,runner.ownerId).run();
  if(result.meta.changes)return Response.json({uploaded:true},{status:restore?200:201});
  const active=await env.DB.prepare('SELECT id FROM imported_duplicate_checks WHERE id=? AND owner_id=? AND deleting=0 AND deleted=0').bind(reviewId,runner.ownerId).first();if(!active)return missing();const other=await lookup();return other?.content_hash===hash?Response.json({uploaded:true}):conflict();
 });
}

export async function duplicateFile(request,env,owner,reviewId,sourceKey,kind,reviewType='duplicate'){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 const row=await env.DB.prepare('SELECT f.object_key FROM imported_duplicate_check_files f JOIN imported_duplicate_checks r ON r.id=f.review_id AND r.owner_id=f.owner_id WHERE f.review_id=? AND f.owner_id=? AND f.source_key=? AND f.kind=? AND r.review_type=? AND r.deleting=0 AND r.deleted=0').bind(reviewId,owner,sourceKey,kind,reviewType).first();if(!row)return missing();
 const object=await env.FILES.get(row.object_key);if(!object)return missing();return new Response(object.body,{headers:{'content-type':'application/octet-stream','content-disposition':'attachment'}});
}
