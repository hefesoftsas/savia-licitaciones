import {digest} from './runners.js';
class SnapshotError extends Error {}
const fail=()=>{throw new SnapshotError('Los certificados cambiaron o no están disponibles.');};
const imageColumns='id,certificate_id,name,content_type,object_key,size,sort_order,created_at,custom_name,field_key';
const version=(row,etag)=>digest(JSON.stringify([row,etag]));
async function rowsFor(env,owner){
 const [certificates,images,deleting]=await env.DB.batch([
  env.DB.prepare('SELECT id,name,number,validity_mode,valid_from,valid_to,version,created_at,updated_at,deleting FROM company_certificates WHERE owner_id=? ORDER BY id').bind(owner),
  env.DB.prepare(`SELECT ${imageColumns} FROM company_certificate_images WHERE owner_id=? ORDER BY certificate_id,sort_order,created_at,id`).bind(owner),
  env.DB.prepare('SELECT id FROM company_certificate_image_deletions WHERE owner_id=? AND storage_deleted_at IS NULL LIMIT 1').bind(owner),
 ]);if(deleting.results.length||certificates.results.length>10000||images.results.length>10000||certificates.results.some(c=>c.deleting))fail();return {certificates:certificates.results,images:images.results};
}
export async function runnerCertificatesCapture(request,env,runner,imageId){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 try{
  if(imageId){const row=await env.DB.prepare(`SELECT ${imageColumns} FROM company_certificate_images WHERE owner_id=? AND id=? AND EXISTS(SELECT 1 FROM company_certificates c WHERE c.id=company_certificate_images.certificate_id AND c.owner_id=? AND c.deleting=0)`).bind(runner.ownerId,imageId,runner.ownerId).first();if(!row)return Response.json({error:'not_found'},{status:404});const params=new URL(request.url).searchParams,etag=params.get('etag'),expected=params.get('version');if(!etag||!/^[a-f0-9]{64}$/.test(expected||'')||await version(row,etag)!==expected)fail();const object=await env.FILES.get(row.object_key,{onlyIf:{etagMatches:etag}});if(!object?.body||object.etag!==etag||object.size!==row.size)fail();return new Response(object.body,{headers:{'content-type':'application/octet-stream','x-content-type-options':'nosniff'}});}
  const rows=await rowsFor(env,runner.ownerId),ids=new Set(rows.certificates.map(x=>x.id)),images=[],objects=[];
  for(const row of rows.images){if(!ids.has(row.certificate_id)||!row.object_key||!Number.isSafeInteger(row.size)||row.size<1||row.size>25*1024*1024)fail();const object=await env.FILES.head(row.object_key);if(!object||object.size!==row.size)fail();objects.push({key:row.object_key,size:row.size,etag:object.etag});images.push({id:row.id,certificateId:row.certificate_id,name:row.name,contentType:row.content_type,size:row.size,sortOrder:row.sort_order,createdAt:row.created_at,customName:row.custom_name,fieldKey:row.field_key,etag:object.etag,version:await version(row,object.etag)});}
  if(JSON.stringify(await rowsFor(env,runner.ownerId))!==JSON.stringify(rows))fail();for(const item of objects){const object=await env.FILES.head(item.key);if(!object||object.size!==item.size||object.etag!==item.etag)fail();}
  return Response.json({revision:await digest(JSON.stringify({rows,objects})),certificates:rows.certificates.map(c=>({id:c.id,name:c.name,number:c.number,validityMode:c.validity_mode,validFrom:c.valid_from,validTo:c.valid_to,createdAt:c.created_at,updatedAt:c.updated_at})),images});
 }catch(error){if(error instanceof SnapshotError)return Response.json({error:'source_unavailable'},{status:409});throw error;}
}
