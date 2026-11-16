import { cleanupDesktopUploads, uploadLeaseMs } from './desktop-file-cleanup.js';
const missing=()=>Response.json({error:'not_found'},{status:404});
const bad=()=>Response.json({error:'invalid_image'},{status:400});
const view=row=>({id:row.id,name:row.name,contentType:row.content_type,size:row.size,createdAt:row.created_at,customName:row.custom_name||'',fieldKey:row.field_key||'certificateImages',deleting:!!row.deleting});
export function imageType(bytes) {
 const starts = values => values.every((value,index)=>bytes[index]===value);
 if (starts([137,80,78,71,13,10,26,10])) return 'image/png';
 if (starts([255,216,255])) return 'image/jpeg';
 if (starts([71,73,70,56]) && (bytes[4]===55 || bytes[4]===57) && bytes[5]===97) return 'image/gif';
 if (starts([66,77])) return 'image/bmp';
 if (starts([82,73,70,70]) && bytes[8]===87 && bytes[9]===69 && bytes[10]===66 && bytes[11]===80) return 'image/webp';
 return '';
}
export async function cleanCertificateImageDeletions(env, ownerId, certificateId) {
 const rows=await env.DB.prepare('SELECT id, object_key FROM company_certificate_image_deletions WHERE owner_id = ? AND certificate_id = ? AND storage_deleted_at IS NULL').bind(ownerId,certificateId).all();
 for (const row of rows.results) {
  try { await env.FILES.delete(row.object_key); } catch { return false; }
  await env.DB.prepare('UPDATE company_certificate_image_deletions SET storage_deleted_at = COALESCE(storage_deleted_at, ?) WHERE id = ? AND owner_id = ?').bind(new Date().toISOString(),row.id,ownerId).run();
 }
 return true;
}
export async function certificateImages(request,env,ownerId,certificateId,imageId) {
 if (request.method !== 'GET' && request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({error:'invalid_origin'},{status:403});
 const cert=await env.DB.prepare('SELECT id FROM company_certificates WHERE id = ? AND owner_id = ? AND deleting = 0').bind(certificateId,ownerId).first();if(!cert)return missing();
 if(request.method==='GET' && !imageId) {const rows=await env.DB.prepare(`SELECT id, name, content_type, size, sort_order, created_at, custom_name, field_key, 0 AS deleting FROM company_certificate_images WHERE certificate_id = ? AND owner_id = ? UNION ALL SELECT id, name, content_type, size, sort_order, created_at, '' AS custom_name, 'certificateImages' AS field_key, 1 AS deleting FROM company_certificate_image_deletions WHERE certificate_id = ? AND owner_id = ? AND storage_deleted_at IS NULL ORDER BY sort_order, created_at, id`).bind(certificateId,ownerId,certificateId,ownerId).all();return Response.json({images:rows.results.map(view)});}
 if(request.method==='GET' && imageId) {
  const row=await env.DB.prepare('SELECT * FROM company_certificate_images WHERE id = ? AND certificate_id = ? AND owner_id = ?').bind(imageId,certificateId,ownerId).first();if(!row)return missing();const object=await env.FILES.get(row.object_key);if(!object)return missing();
  return new Response(object.body,{headers:{'content-type':row.content_type,'content-disposition':`inline; filename*=UTF-8''${encodeURIComponent(row.name).replace(/['()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,'x-content-type-options':'nosniff'}});
 }
 if(request.method==='DELETE' && imageId) {
  await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO company_certificate_image_deletions (id, certificate_id, owner_id, object_key, name, content_type, size, sort_order, created_at) SELECT id, certificate_id, owner_id, object_key, name, content_type, size, sort_order, created_at FROM company_certificate_images WHERE id = ? AND certificate_id = ? AND owner_id = ?').bind(imageId,certificateId,ownerId),
   env.DB.prepare('DELETE FROM company_certificate_images WHERE id = ? AND certificate_id = ? AND owner_id = ? AND EXISTS (SELECT 1 FROM company_certificate_image_deletions WHERE id = ? AND certificate_id = ? AND owner_id = ?)').bind(imageId,certificateId,ownerId,imageId,certificateId,ownerId),
  ]);
  const row=await env.DB.prepare('SELECT id FROM company_certificate_image_deletions WHERE id = ? AND certificate_id = ? AND owner_id = ?').bind(imageId,certificateId,ownerId).first();if(!row)return missing();
  if(!await cleanCertificateImageDeletions(env,ownerId,certificateId))return Response.json({error:'file_cleanup_pending'},{status:503});
  return new Response(null,{status:204});
 }
 if(request.method!=='POST' || imageId)return new Response('Method not allowed',{status:405});
 let name;try{name=decodeURIComponent(request.headers.get('x-file-name')||'').trim();}catch{return bad();}
 if(!name || name.length>255 || /[\x00-\x1f\x7f]/.test(name) || Number(request.headers.get('content-length')||0)>25*1024*1024)return bad();
 const data=await request.arrayBuffer();if(!data.byteLength || data.byteLength>25*1024*1024)return bad();const type=imageType(new Uint8Array(data));if(!type)return bad();
 const id=crypto.randomUUID(),mutation=crypto.randomUUID(),key=`certificate-images/${crypto.randomUUID()}`,now=new Date().toISOString();
 await env.DB.prepare("INSERT INTO desktop_file_staging (id,owner_id,object_key,state,lease_until,created_at) VALUES (?,?,?,'writing',?,?)").bind(mutation,ownerId,key,Date.now()+uploadLeaseMs,Date.now()).run();
 const release=async()=>{try{await env.DB.prepare("UPDATE desktop_file_staging SET state = 'cleanup', lease_until = 0 WHERE id = ? AND owner_id = ? AND state IN ('writing','watching')").bind(mutation,ownerId).run();await cleanupDesktopUploads(env,ownerId);}catch{/* durable staging remains for retry */}};
 try {
  await env.FILES.put(key,data);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done = 1 WHERE id = ? AND owner_id = ?').bind(mutation,ownerId).run();
  const result=await env.DB.batch([
   env.DB.prepare("INSERT INTO company_certificate_images (id,certificate_id,owner_id,name,content_type,object_key,size,sort_order,created_at) SELECT ?,id,owner_id,?,?,?,?,(SELECT COALESCE(MAX(sort_order)+1,0) FROM company_certificate_images WHERE certificate_id = ? AND owner_id = ?),? FROM company_certificates WHERE id = ? AND owner_id = ? AND deleting = 0 AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND lease_until > ?)").bind(id,name,type,key,data.byteLength,certificateId,ownerId,now,certificateId,ownerId,mutation,ownerId,Date.now()),
   env.DB.prepare("DELETE FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND EXISTS (SELECT 1 FROM company_certificate_images WHERE id = ? AND owner_id = ? AND object_key = ?)").bind(mutation,ownerId,id,ownerId,key),
  ]);
  if(result[0].meta.changes)return Response.json({image:{id,name,contentType:type,size:data.byteLength,createdAt:now}},{status:201});
 } catch(error){await release();throw error;}
 await release();return missing();
}
