import { imageType } from './certificate-images.js';
import { cleanupDesktopUploads,uploadLeaseMs } from './desktop-file-cleanup.js';
const bad=()=>Response.json({error:'invalid_image_import'},{status:400});
const conflict=()=>Response.json({error:'image_import_conflict'},{status:409});
const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
const hashText=text=>hash(new TextEncoder().encode(text));
export async function importLibraryImage(request,env,runner,requestId,sourceKey){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)||!/^[a-f0-9]{64}$/.test(sourceKey)||Number(request.headers.get('content-length')||0)>26*1024*1024)return bad();
 let form,input;try{form=await request.formData();input=JSON.parse(form.get('metadata'));}catch{return bad();}const file=form.get('file'),noFile=!file;
 if(!input||typeof input.sourceId!=='string'||!input.sourceId||input.sourceId.length>256||await hashText(input.sourceId)!==sourceKey||typeof input.name!=='string'||!input.name.trim()||input.name.length>255||/[\x00-\x1f\x7f]/.test(input.name)||typeof input.createdAt!=='string'||input.createdAt.length>100||(noFile?!['not_found','unsafe_path','empty','too_large','unsupported'].includes(input.missingReason):typeof file==='string'||!file.size||file.size>25*1024*1024))return bad();
 const data=noFile?null:await file.arrayBuffer(),type=data?imageType(new Uint8Array(data)):'';if(data&&!type)return Response.json({error:'unsupported_image'},{status:415});
 const details={sourceId:input.sourceId,name:input.name,createdAt:input.createdAt,missingReason:noFile?input.missingReason:null,fileHash:data?await hash(data):null},contentHash=await hashText(JSON.stringify(details));
 const lookup=()=>env.DB.prepare('SELECT i.image_id,i.content_hash,l.id AS present,l.deleting FROM desktop_image_library_imports i LEFT JOIN image_library_web l ON l.id = i.image_id AND l.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ? AND i.source_key = ?').bind(runner.ownerId,requestId,sourceKey).first();
 const responseFor=row=>!row||row.content_hash!==contentHash?conflict():row.present&&!row.deleting?Response.json({imageId:row.image_id}):Response.json({error:'removed'},{status:410});
 const previous=await lookup();if(previous)return responseFor(previous);
 const id=crypto.randomUUID(),mutation=crypto.randomUUID(),key=data?`image-library/${crypto.randomUUID()}`:null,now=new Date().toISOString();
 if(data)await env.DB.prepare("INSERT INTO desktop_file_staging (id,owner_id,object_key,state,lease_until,created_at) VALUES (?,?,?,'writing',?,?)").bind(mutation,runner.ownerId,key,Date.now()+uploadLeaseMs,Date.now()).run();
 const release=async()=>{if(!data)return;try{await env.DB.prepare("UPDATE desktop_file_staging SET state = 'cleanup', lease_until = 0 WHERE id = ? AND owner_id = ? AND state IN ('writing','watching')").bind(mutation,runner.ownerId).run();await cleanupDesktopUploads(env,runner.ownerId);}catch{/* staging remains eligible */}};
 try{
  if(data){await env.FILES.put(key,data);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done = 1 WHERE id = ? AND owner_id = ?').bind(mutation,runner.ownerId).run();}
  const own='EXISTS (SELECT 1 FROM desktop_image_library_imports WHERE owner_id = ? AND request_id = ? AND source_key = ? AND mutation_id = ?)';
  const result=await env.DB.batch([
   env.DB.prepare("INSERT INTO image_library_web (id,owner_id,name,content_type,object_key,size,created_at,sequence,missing_reason) SELECT ?,?,?,?,?,?,?,(SELECT COALESCE(MAX(sequence)+1,0) FROM image_library_web WHERE owner_id = ?),? WHERE (? = 1 OR EXISTS (SELECT 1 FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND lease_until > ?)) AND NOT EXISTS (SELECT 1 FROM desktop_image_library_imports WHERE owner_id = ? AND request_id = ? AND source_key = ?)").bind(id,runner.ownerId,input.name,type||'application/octet-stream',key,data?.byteLength||0,input.createdAt,runner.ownerId,noFile?input.missingReason:null,noFile?1:0,mutation,runner.ownerId,Date.now(),runner.ownerId,requestId,sourceKey),
   env.DB.prepare('INSERT INTO desktop_image_library_imports (owner_id,request_id,source_key,image_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM image_library_web WHERE id = ? AND owner_id = ?) ON CONFLICT(owner_id,request_id,source_key) DO NOTHING').bind(runner.ownerId,requestId,sourceKey,id,contentHash,mutation,now,id,runner.ownerId),
   env.DB.prepare(`DELETE FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND ${own}`).bind(mutation,runner.ownerId,runner.ownerId,requestId,sourceKey,mutation),
   env.DB.prepare(`DELETE FROM image_library_web WHERE id = ? AND owner_id = ? AND NOT ${own}`).bind(id,runner.ownerId,runner.ownerId,requestId,sourceKey,mutation),
  ]);
  if(result[1].meta.changes)return Response.json({imageId:id},{status:201});
 }catch(error){await release();throw error;}
 await release();return responseFor(await lookup());
}
