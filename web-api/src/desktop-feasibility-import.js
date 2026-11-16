import {validFeasibilityState} from './feasibility-report.js';
import {cleanupDesktopUploads,uploadLeaseMs} from './desktop-file-cleanup.js';
const bad=()=>Response.json({error:'invalid_import'},{status:400}),conflict=()=>Response.json({error:'import_conflict'},{status:409}),missing=()=>Response.json({error:'not_found'},{status:404}),removed=()=>Response.json({error:'removed'},{status:410});
const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
const encode=value=>new TextEncoder().encode(value);
export async function importFeasibility(request,env,runner,requestId){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId))return bad();
 let input;try{input=await request.json();}catch{return bad();}
 if(!validFeasibilityState(input?.report)||!Array.isArray(input.tasks)||input.tasks.length>100||input.tasks.some(task=>!task||typeof task.type!=='string'||typeof task.status!=='string'))return bad();
 const sources=input.report.sourceFiles;if(sources.length>1000||sources.some(x=>!x||typeof x.id!=='string'||!x.id||! /^[a-f0-9]{64}$/.test(x.sourceKey)||typeof x.expected!=='boolean')||new Set(sources.map(x=>x.sourceKey)).size!==sources.length)return bad();
 const state=JSON.stringify({...input.report,importedTasks:input.tasks});if(encode(state).byteLength>1_500_000)return Response.json({error:'report_too_large'},{status:413});
 const hash=await digest(encode(JSON.stringify(input))),mutation=crypto.randomUUID(),now=new Date().toISOString(),owner=runner.ownerId;
 const result=await env.DB.batch([
  env.DB.prepare('INSERT INTO desktop_feasibility_imports(owner_id,request_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM feasibility_reports WHERE owner_id=?) ON CONFLICT(owner_id,request_id) DO NOTHING').bind(owner,requestId,hash,mutation,now,owner),
  env.DB.prepare('INSERT INTO feasibility_reports(owner_id,state_json,version,updated_at) SELECT ?,?,1,? WHERE EXISTS (SELECT 1 FROM desktop_feasibility_imports WHERE owner_id=? AND request_id=? AND mutation_id=?)').bind(owner,state,now,owner,requestId,mutation),
  env.DB.prepare("INSERT INTO desktop_feasibility_sources(owner_id,request_id,source_key,expected) SELECT ?,?,json_extract(value,'$.sourceKey'),json_extract(value,'$.expected') FROM json_each(?) WHERE EXISTS (SELECT 1 FROM desktop_feasibility_imports WHERE owner_id=? AND request_id=? AND mutation_id=?)").bind(owner,requestId,JSON.stringify(sources),owner,requestId,mutation),
 ]);
 if(result[0].meta.changes)return Response.json({imported:true},{status:201});
 const previous=await env.DB.prepare('SELECT content_hash FROM desktop_feasibility_imports WHERE owner_id=? AND request_id=?').bind(owner,requestId).first();return previous?.content_hash===hash?Response.json({imported:true}):conflict();
}
export async function importFeasibilitySource(request,env,runner,requestId,sourceKey){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});if(!/^[a-f0-9]{64}$/.test(sourceKey))return bad();
 const owner=runner.ownerId,lookup=()=>env.DB.prepare('SELECT expected,object_key,content_hash,deleting,deleted FROM desktop_feasibility_sources WHERE owner_id=? AND request_id=? AND source_key=?').bind(owner,requestId,sourceKey).first();
 let row=await lookup();if(!row||!row.expected)return missing();if(row.deleted||row.deleting)return removed();
 if(Number(request.headers.get('content-length')||0)>25*1024*1024)return Response.json({error:'too_large'},{status:413});const bytes=await request.arrayBuffer();if(bytes.byteLength>25*1024*1024)return Response.json({error:'too_large'},{status:413});const hash=await digest(bytes);
 if(row.object_key)return row.content_hash===hash?Response.json({uploaded:true}):conflict();
 const mutation=crypto.randomUUID(),key=`feasibility-source/${crypto.randomUUID()}`;
 await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(mutation,owner,key,Date.now()+uploadLeaseMs,Date.now()).run();
 try{
  await env.FILES.put(key,bytes);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(mutation,owner).run();
  const result=await env.DB.prepare("UPDATE desktop_feasibility_sources SET object_key=?,content_hash=? WHERE owner_id=? AND request_id=? AND source_key=? AND expected=1 AND object_key IS NULL AND deleting=0 AND deleted=0 AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?)").bind(key,hash,owner,requestId,sourceKey,mutation,owner,Date.now()).run();
  if(result.meta.changes)return Response.json({uploaded:true},{status:201});row=await lookup();return !row?missing():row.deleting||row.deleted?removed():row.content_hash===hash?Response.json({uploaded:true}):conflict();
 }finally{try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(mutation,owner).run();await cleanupDesktopUploads(env,owner);}catch{/* Retried by cleanup. */}}
}
export async function feasibilitySource(request,env,owner,sourceKey){
 if(!/^[a-f0-9]{64}$/.test(sourceKey))return missing();
 if(request.method==='GET'){
  const row=await env.DB.prepare('SELECT object_key FROM desktop_feasibility_sources WHERE owner_id=? AND source_key=? AND deleted=0 AND deleting=0').bind(owner,sourceKey).first();if(!row?.object_key)return missing();const object=await env.FILES.get(row.object_key);return object?new Response(object.body,{headers:{'content-type':'text/plain; charset=utf-8','content-disposition':'attachment'}}):Response.json({error:'stored_data_missing'},{status:503});
 }
 if(request.method!=='DELETE')return new Response('Method not allowed',{status:405});if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 const row=await env.DB.prepare('UPDATE desktop_feasibility_sources SET deleting=1 WHERE owner_id=? AND source_key=? AND deleted=0 RETURNING object_key').bind(owner,sourceKey).first();if(!row)return missing();
 try{if(row.object_key)await env.FILES.delete(row.object_key);}catch{return Response.json({error:'file_cleanup_pending'},{status:503});}
 await env.DB.batch([env.DB.prepare("UPDATE feasibility_reports SET version=version+1,updated_at=? WHERE owner_id=? AND EXISTS (SELECT 1 FROM desktop_feasibility_sources WHERE owner_id=? AND source_key=? AND deleting=1 AND deleted=0) AND EXISTS (SELECT 1 FROM json_each(feasibility_reports.state_json,'$.sourceFiles') WHERE json_extract(value,'$.sourceKey')=?)").bind(new Date().toISOString(),owner,owner,sourceKey,sourceKey),env.DB.prepare('UPDATE desktop_feasibility_sources SET object_key=NULL,deleting=0,deleted=1 WHERE owner_id=? AND source_key=? AND deleting=1').bind(owner,sourceKey)]);return new Response(null,{status:204});
}
