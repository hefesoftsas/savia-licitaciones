import {cleanupDesktopUploads,uploadLeaseMs} from './desktop-file-cleanup.js';
const missing=()=>Response.json({error:'not_found'},{status:404});
const bad=()=>Response.json({error:'invalid_request'},{status:400});
const conflict=()=>Response.json({error:'source_conflict'},{status:409});
const types={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',txt:'text/plain',md:'text/markdown',markdown:'text/markdown',wps:'application/octet-stream'};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const view=row=>({sourceKey:row.source_key,fileName:row.name,size:row.size,contentType:row.content_type,deleting:!!row.deleting});
const owned=(env,owner,project)=>env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(project,owner).first();
const origin=(request,env)=>request.headers.get('origin')===new URL(env.BETTER_AUTH_URL).origin;
export async function projectFeasibilityUploads(request,env,owner,project){
 if(!await owned(env,owner,project))return missing();
 if(request.method==='GET'){const rows=await env.DB.prepare('SELECT * FROM project_feasibility_sources WHERE owner_id=? AND project_id=? AND deleted=0 ORDER BY created_at DESC,source_key').bind(owner,project).all();return Response.json({sources:rows.results.map(view)});}
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!origin(request,env))return Response.json({error:'invalid_origin'},{status:403});
 const uploadKey=request.headers.get('idempotency-key')||'';let name;try{name=decodeURIComponent(request.headers.get('x-file-name')||'').trim();}catch{return bad();}
 const type=types[name.split('.').pop()?.toLowerCase()];if(!/^[A-Za-z0-9._:-]{1,128}$/.test(uploadKey)||!name||name.length>255||/[\x00-\x1f\x7f\\/]/.test(name)||!type)return bad();
 if(Number(request.headers.get('content-length')||0)>25*1024*1024)return Response.json({error:'file_too_large'},{status:413});
 const bytes=await request.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>25*1024*1024)return Response.json({error:'file_too_large'},{status:413});
 const digest=await hash(bytes),lookup=()=>env.DB.prepare('SELECT * FROM project_feasibility_sources WHERE project_id=? AND owner_id=? AND upload_key=?').bind(project,owner,uploadKey).first(),same=row=>row?.name===name&&row.content_hash===digest&&row.content_type===type;
 const prior=await lookup();if(prior)return prior.deleted||prior.deleting?Response.json({error:'removed'},{status:410}):same(prior)?Response.json({source:view(prior)}):conflict();
 const source=await hash(new TextEncoder().encode(crypto.randomUUID())),key=`project-feasibility/${project}/${crypto.randomUUID()}`,mutation=crypto.randomUUID(),now=new Date().toISOString();
 await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(mutation,owner,key,Date.now()+uploadLeaseMs,Date.now()).run();
 try{await env.FILES.put(key,bytes);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(mutation,owner).run();
  const row=await env.DB.prepare("INSERT INTO project_feasibility_sources(project_id,owner_id,source_key,upload_key,name,content_type,content_hash,size,object_key,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND owner_id=?) AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?) ON CONFLICT(project_id,upload_key) DO NOTHING RETURNING *").bind(project,owner,source,uploadKey,name,type,digest,bytes.byteLength,key,now,project,owner,mutation,owner,Date.now()).first();
  if(row)return Response.json({source:view(row)},{status:201});const winner=await lookup();return winner&&!winner.deleting&&!winner.deleted&&same(winner)?Response.json({source:view(winner)}):conflict();
 }finally{try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(mutation,owner).run();await cleanupDesktopUploads(env,owner);}catch{}}
}
export async function projectFeasibilitySource(request,env,owner,project,source){
 if(!await owned(env,owner,project))return missing();
 const lookup=()=>env.DB.prepare('SELECT * FROM project_feasibility_sources WHERE project_id=? AND owner_id=? AND source_key=?').bind(project,owner,source).first();let row=await lookup();if(!row)return missing();
 if(request.method==='GET'){if(row.deleted||row.deleting)return missing();const object=await env.FILES.get(row.object_key);return object?new Response(object.body,{headers:{'content-type':row.content_type,'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.name).replace(/['()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,'x-content-type-options':'nosniff'}}):missing();}
 if(request.method!=='DELETE')return new Response('Method not allowed',{status:405});if(!origin(request,env))return Response.json({error:'invalid_origin'},{status:403});if(row.deleted)return new Response(null,{status:204});
 if(!row.deleting){const changed=await env.DB.prepare("UPDATE project_feasibility_sources SET deleting=1 WHERE project_id=? AND owner_id=? AND source_key=? AND deleting=0 AND deleted=0 AND NOT EXISTS (SELECT 1 FROM project_feasibility_reports r, json_each(r.state_json,'$.sourceFiles') f WHERE r.project_id=? AND r.owner_id=? AND json_extract(f.value,'$.sourceKey')=?) RETURNING source_key").bind(project,owner,source,project,owner,source).first();if(!changed){row=await lookup();if(!row)return missing();if(row.deleted)return new Response(null,{status:204});if(!row.deleting)return conflict();}}
 const texts=await env.DB.prepare('SELECT object_key FROM project_feasibility_extracted_texts WHERE project_id=? AND owner_id=? AND source_key=?').bind(project,owner,source).all();
 const images=await env.DB.prepare('SELECT object_key FROM project_feasibility_extracted_images WHERE project_id=? AND owner_id=? AND source_key=?').bind(project,owner,source).all();
 const keys=[row.object_key,...texts.results.map(item=>item.object_key),...images.results.map(item=>item.object_key)];
 try{for(let index=0;index<keys.length;index+=100)await env.FILES.delete(keys.slice(index,index+100));}catch{return Response.json({error:'file_cleanup_pending'},{status:503});}
 await env.DB.batch([
  env.DB.prepare('DELETE FROM project_feasibility_extracted_images WHERE project_id=? AND owner_id=? AND source_key=?').bind(project,owner,source),
  env.DB.prepare('DELETE FROM project_feasibility_extracted_texts WHERE project_id=? AND owner_id=? AND source_key=?').bind(project,owner,source),
  env.DB.prepare("UPDATE project_feasibility_sources SET deleting=0,deleted=1,name='' WHERE project_id=? AND owner_id=? AND source_key=? AND deleting=1").bind(project,owner,source),
 ]);return new Response(null,{status:204});
}
