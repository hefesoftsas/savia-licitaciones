import { cleanupDesktopUploads, uploadLeaseMs } from './desktop-file-cleanup.js';
import { imageType } from './certificate-images.js';
const bad=()=>Response.json({error:'invalid_image_import'},{status:400});
const conflict=()=>Response.json({error:'image_import_conflict'},{status:409});
const missing=()=>Response.json({error:'not_found'},{status:404});
const removed=()=>Response.json({error:'removed'},{status:410});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('');
const hashText=value=>hash(new TextEncoder().encode(value));
export async function importCertificateImage(request,env,runner,requestId,sourceKey) {
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)||!/^[a-f0-9]{64}$/.test(sourceKey)||Number(request.headers.get('content-length')||0)>26*1024*1024)return bad();
 let form,input;try{form=await request.formData();input=JSON.parse(form.get('metadata'));}catch{return bad();}
 const file=form.get('file'), fields=['sourceId','certificateSourceId','name','customName','fieldKey','createdAt'];
 if(!input || fields.some(key=>typeof input[key]!=='string'||input[key].length>20000) || !input.sourceId || !input.certificateSourceId || !input.name || input.name.length>255 || /[\x00-\x1f\x7f]/.test(input.name) || await hashText(input.sourceId)!==sourceKey || !file || typeof file==='string' || !file.size || file.size>25*1024*1024)return bad();
 const data=await file.arrayBuffer(),type=imageType(new Uint8Array(data));if(!type)return Response.json({error:'unsupported_image'},{status:415});
 const details={sourceId:input.sourceId,certificateSourceId:input.certificateSourceId,name:input.name,customName:input.customName,fieldKey:input.fieldKey,createdAt:input.createdAt,fileHash:await hash(data)},contentHash=await hashText(JSON.stringify(details));
 const lookup=()=>env.DB.prepare('SELECT i.image_id, i.content_hash, c.id AS certificate_present, m.id AS image_present FROM desktop_certificate_image_imports i LEFT JOIN company_certificates c ON c.id = i.certificate_id AND c.owner_id = i.owner_id AND c.deleting = 0 LEFT JOIN company_certificate_images m ON m.id = i.image_id AND m.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ? AND i.source_key = ?').bind(runner.ownerId,requestId,sourceKey).first();
 const responseFor=row=>!row||row.content_hash!==contentHash?conflict():row.certificate_present&&row.image_present?Response.json({imageId:row.image_id}):removed();
 const previous=await lookup();if(previous)return responseFor(previous);
 const certKey=await hashText(input.certificateSourceId),parent=await env.DB.prepare('SELECT i.certificate_id, c.id AS present FROM desktop_certificate_imports i LEFT JOIN company_certificates c ON c.id = i.certificate_id AND c.owner_id = i.owner_id AND c.deleting = 0 WHERE i.owner_id = ? AND i.request_id = ? AND i.source_key = ?').bind(runner.ownerId,requestId,certKey).first();
 if(!parent)return missing();if(!parent.present)return removed();
 const id=crypto.randomUUID(),mutation=crypto.randomUUID(),key=`certificate-images/${crypto.randomUUID()}`,now=new Date().toISOString();
 await env.DB.prepare("INSERT INTO desktop_file_staging (id,owner_id,object_key,state,lease_until,created_at) VALUES (?,?,?,'writing',?,?)").bind(mutation,runner.ownerId,key,Date.now()+uploadLeaseMs,Date.now()).run();
 const release=async()=>{try{await env.DB.prepare("UPDATE desktop_file_staging SET state = 'cleanup', lease_until = 0 WHERE id = ? AND owner_id = ? AND state IN ('writing','watching')").bind(mutation,runner.ownerId).run();await cleanupDesktopUploads(env,runner.ownerId);}catch{/* staging is retained */}};
 try {
  await env.FILES.put(key,data);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done = 1 WHERE id = ? AND owner_id = ?').bind(mutation,runner.ownerId).run();
  const result=await env.DB.batch([
   env.DB.prepare("INSERT INTO company_certificate_images (id,certificate_id,owner_id,name,content_type,object_key,size,sort_order,created_at,custom_name,field_key) SELECT ?,id,owner_id,?,?,?,?,(SELECT COALESCE(MAX(sort_order)+1,0) FROM company_certificate_images WHERE certificate_id = ? AND owner_id = ?),?,?,? FROM company_certificates WHERE id = ? AND owner_id = ? AND deleting = 0 AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND lease_until > ?) AND NOT EXISTS (SELECT 1 FROM desktop_certificate_image_imports WHERE owner_id = ? AND request_id = ? AND source_key = ?)").bind(id,input.name,type,key,data.byteLength,parent.certificate_id,runner.ownerId,input.createdAt,input.customName,input.fieldKey,parent.certificate_id,runner.ownerId,mutation,runner.ownerId,Date.now(),runner.ownerId,requestId,sourceKey),
   env.DB.prepare('INSERT INTO desktop_certificate_image_imports (owner_id,request_id,source_key,certificate_id,image_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM company_certificate_images WHERE id = ? AND owner_id = ?) ON CONFLICT(owner_id,request_id,source_key) DO NOTHING').bind(runner.ownerId,requestId,sourceKey,parent.certificate_id,id,contentHash,mutation,now,id,runner.ownerId),
   env.DB.prepare("DELETE FROM desktop_file_staging WHERE id = ? AND owner_id = ? AND state = 'writing' AND EXISTS (SELECT 1 FROM desktop_certificate_image_imports WHERE owner_id = ? AND request_id = ? AND source_key = ? AND mutation_id = ?)").bind(mutation,runner.ownerId,runner.ownerId,requestId,sourceKey,mutation),
   env.DB.prepare('DELETE FROM company_certificate_images WHERE id = ? AND owner_id = ? AND NOT EXISTS (SELECT 1 FROM desktop_certificate_image_imports WHERE owner_id = ? AND request_id = ? AND source_key = ? AND mutation_id = ?)').bind(id,runner.ownerId,runner.ownerId,requestId,sourceKey,mutation),
  ]);
  if(result[1].meta.changes)return Response.json({imageId:id},{status:201});
 }catch(error){await release();throw error;}
 await release();const previousAfter=await lookup();if(previousAfter)return responseFor(previousAfter);
 const current=await env.DB.prepare('SELECT id FROM company_certificates WHERE id = ? AND owner_id = ? AND deleting = 0').bind(parent.certificate_id,runner.ownerId).first();return current?conflict():removed();
}
