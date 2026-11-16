import {digest} from './runners.js';
import {normalizeCompanyProfile} from './company-profile.js';

export class CompanyProfileSnapshotError extends Error {}
const fail=()=>{throw new CompanyProfileSnapshotError('El perfil de empresa o sus imágenes cambiaron o no están disponibles.');};
const version=(row,etag)=>digest(JSON.stringify([row,etag]));
const imageColumns='id,name,custom_name,field_key,content_type,object_key,size,sort_order,created_at';
async function read(env,owner){
 const [user,profile,images,deleting]=await env.DB.batch([
  env.DB.prepare('SELECT id FROM "user" WHERE id=?').bind(owner),
  env.DB.prepare('SELECT profile_json,version,updated_at FROM company_profiles WHERE owner_id=?').bind(owner),
  env.DB.prepare(`SELECT ${imageColumns} FROM company_profile_images WHERE owner_id=? ORDER BY field_key,sort_order,id`).bind(owner),
  env.DB.prepare('SELECT id FROM company_profile_image_deletions WHERE owner_id=? AND storage_deleted_at IS NULL LIMIT 1').bind(owner),
 ]);
 if(!user.results.length)return null;if(deleting.results.length)fail();return {profile:profile.results[0]||null,images:images.results};
}
export async function prepareCompanyProfileTransport(env,owner){
 const rows=await read(env,owner);if(!rows)return null;
 let profile=null;if(rows.profile){try{const parsed=JSON.parse(rows.profile.profile_json),normalized=normalizeCompanyProfile(parsed);if(!normalized||JSON.stringify(normalized)!==JSON.stringify(parsed)||typeof rows.profile.updated_at!=='string'||!rows.profile.updated_at)fail();profile={profile:normalized,updatedAt:rows.profile.updated_at};}catch{fail();}}
 const images=[],objects=[];
 for(const row of rows.images){
  if(!row.object_key||!Number.isSafeInteger(row.size)||row.size<1||row.size>25*1024*1024)fail();const object=await env.FILES.head(row.object_key);if(!object||object.size!==row.size)fail();
  objects.push({id:row.id,key:row.object_key,size:row.size,etag:object.etag});
  images.push({id:row.id,name:row.name,customName:row.custom_name,fieldKey:row.field_key,contentType:row.content_type,size:row.size,sortOrder:row.sort_order,createdAt:row.created_at,etag:object.etag,version:await version(row,object.etag)});
 }
 return {profile,images,revisionData:{rows,objects},async assertUnchanged(){if(JSON.stringify(await read(env,owner))!==JSON.stringify(rows))fail();for(const item of objects){const object=await env.FILES.head(item.key);if(!object||object.size!==item.size||object.etag!==item.etag)fail();}}};
}
export async function openCompanyProfileImage(env,owner,imageId,etag,expectedVersion){
 const row=await env.DB.prepare(`SELECT ${imageColumns} FROM company_profile_images WHERE owner_id=? AND id=?`).bind(owner,imageId).first();if(!row)return null;
 if(typeof etag!=='string'||!etag||!/^[a-f0-9]{64}$/.test(expectedVersion||'')||await version(row,etag)!==expectedVersion)fail();
 const object=await env.FILES.get(row.object_key,{onlyIf:{etagMatches:etag}});if(!object?.body||object.etag!==etag||object.size!==row.size)fail();return object.body;
}
