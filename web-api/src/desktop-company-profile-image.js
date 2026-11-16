import {cleanupDesktopUploads,uploadLeaseMs} from './desktop-file-cleanup.js';
import {imageType} from './certificate-images.js';
import {profileImageFields} from './company-profile-images.js';
const bad=()=>Response.json({error:'invalid_image_import'},{status:400}),conflict=()=>Response.json({error:'image_import_conflict'},{status:409}),missing=()=>Response.json({error:'not_found'},{status:404}),removed=()=>Response.json({error:'removed'},{status:410});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),v=>v.toString(16).padStart(2,'0')).join(''),hashText=value=>hash(new TextEncoder().encode(value));
export async function importDesktopCompanyProfileImage(request,env,runner,requestId,sourceKey,snapshot=false){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)||!/^[a-f0-9]{64}$/.test(sourceKey)||Number(request.headers.get('content-length')||0)>26*1024*1024)return bad();
 let form,input;try{form=await request.formData();input=JSON.parse(form.get('metadata'));}catch{return bad();}
 const file=form.get('file'),fields=['sourceId','name','customName','fieldKey','createdAt'];
 if(!input||fields.some(field=>typeof input[field]!=='string'||input[field].length>20000)||!input.sourceId||!input.name||input.name.length>255||/[\x00-\x1f\x7f]/.test(input.name)||!Number.isSafeInteger(input.sortOrder)||input.sortOrder<0||input.sortOrder>1000000||await hashText(input.sourceId)!==sourceKey||!file||typeof file==='string'||!file.size||file.size>25*1024*1024)return bad();
 if(!profileImageFields.includes(input.fieldKey))return Response.json({error:'unsupported_category'},{status:422});
 const data=await file.arrayBuffer(),type=imageType(new Uint8Array(data));if(!type)return Response.json({error:'unsupported_image'},{status:415});
 const details={sourceId:input.sourceId,name:input.name,customName:input.customName,fieldKey:input.fieldKey,sortOrder:input.sortOrder,createdAt:input.createdAt,fileHash:await hash(data)},contentHash=await hashText(JSON.stringify(details));
 const receipts=snapshot?'account_company_profile_snapshot_image_imports':'desktop_company_profile_image_imports';
 const parentTable=snapshot?'account_company_profile_snapshot_imports i':'desktop_company_profile_imports i JOIN company_profiles p ON p.owner_id=i.owner_id';
 const lookup=()=>env.DB.prepare(`SELECT i.image_id,i.content_hash,m.id AS present FROM ${receipts} i LEFT JOIN company_profile_images m ON m.id=i.image_id AND m.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=? AND i.source_key=?`).bind(runner.ownerId,requestId,sourceKey).first();
 const responseFor=row=>!row||row.content_hash!==contentHash?conflict():row.present?Response.json({imageId:row.image_id}):removed();
 const previous=await lookup();if(previous)return responseFor(previous);
 const parent=await env.DB.prepare(`SELECT 1 AS present FROM ${parentTable} WHERE i.owner_id=? AND i.request_id=?`).bind(runner.ownerId,requestId).first();if(!parent)return missing();
 const id=crypto.randomUUID(),mutation=crypto.randomUUID(),key=`company-profile-images/${crypto.randomUUID()}`,now=new Date().toISOString();
 await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(mutation,runner.ownerId,key,Date.now()+uploadLeaseMs,Date.now()).run();
 const release=async()=>{try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(mutation,runner.ownerId).run();await cleanupDesktopUploads(env,runner.ownerId);}catch{/* eligible for retry */}};
 try{await env.FILES.put(key,data);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(mutation,runner.ownerId).run();const own=`EXISTS (SELECT 1 FROM ${receipts} WHERE owner_id=? AND request_id=? AND source_key=? AND mutation_id=?)`;
  const result=await env.DB.batch([
   env.DB.prepare(`INSERT INTO company_profile_images(id,owner_id,name,custom_name,field_key,content_type,object_key,size,sort_order,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM ${parentTable} WHERE i.owner_id=? AND i.request_id=?) AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?) AND NOT EXISTS (SELECT 1 FROM ${receipts} WHERE owner_id=? AND request_id=? AND source_key=?)`).bind(id,runner.ownerId,input.name,input.customName,input.fieldKey,type,key,data.byteLength,input.sortOrder,input.createdAt,runner.ownerId,requestId,mutation,runner.ownerId,Date.now(),runner.ownerId,requestId,sourceKey),
   env.DB.prepare(`INSERT INTO ${receipts}(owner_id,request_id,source_key,image_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM company_profile_images WHERE id=? AND owner_id=?) ON CONFLICT(owner_id,request_id,source_key) DO NOTHING`).bind(runner.ownerId,requestId,sourceKey,id,contentHash,mutation,now,id,runner.ownerId),
   env.DB.prepare(`DELETE FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND ${own}`).bind(mutation,runner.ownerId,runner.ownerId,requestId,sourceKey,mutation),
   env.DB.prepare(`DELETE FROM company_profile_images WHERE id=? AND owner_id=? AND NOT ${own}`).bind(id,runner.ownerId,runner.ownerId,requestId,sourceKey,mutation),
  ]);if(result[1].meta.changes)return Response.json({imageId:id},{status:201});
 }catch(error){await release();throw error;}
 await release();const after=await lookup();return after?responseFor(after):conflict();
}
