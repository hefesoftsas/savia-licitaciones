import {digest} from './runners.js';

class SnapshotError extends Error {}
const fail=()=>{throw new SnapshotError('La biblioteca de imágenes cambió o no está disponible.');};
const columns='id,name,content_type,object_key,size,created_at,sequence,missing_reason,deleting';
const version=(row,etag)=>digest(JSON.stringify([row,etag]));
async function rowsFor(env,owner){return (await env.DB.prepare(`SELECT ${columns} FROM image_library_web WHERE owner_id=? ORDER BY sequence,id`).bind(owner).all()).results;}
export async function runnerImageLibraryCapture(request,env,runner,imageId){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 try{
  if(imageId){
   const row=await env.DB.prepare(`SELECT ${columns} FROM image_library_web WHERE owner_id=? AND id=?`).bind(runner.ownerId,imageId).first();if(!row)return Response.json({error:'not_found'},{status:404});
   const params=new URL(request.url).searchParams,etag=params.get('etag'),expected=params.get('version');
   if(row.deleting||row.missing_reason||!row.object_key||!etag||!/^[a-f0-9]{64}$/.test(expected||'')||await version(row,etag)!==expected)fail();
   const object=await env.FILES.get(row.object_key,{onlyIf:{etagMatches:etag}});if(!object?.body||object.size!==row.size||object.etag!==etag)fail();
   return new Response(object.body,{headers:{'content-type':'application/octet-stream','x-content-type-options':'nosniff'}});
  }
  const rows=await rowsFor(env,runner.ownerId);if(rows.length>10000)fail();const images=[],objects=[];
  for(const row of rows){
   if(row.deleting)fail();let etag=null;
   if(row.missing_reason){if(row.object_key||row.size!==0||!['not_found','unsafe_path','empty','too_large','unsupported'].includes(row.missing_reason))fail();}
   else{if(!row.object_key||!Number.isSafeInteger(row.size)||row.size<1||row.size>25*1024*1024)fail();const object=await env.FILES.head(row.object_key);if(!object||object.size!==row.size)fail();etag=object.etag;objects.push({key:row.object_key,size:row.size,etag});}
   images.push({id:row.id,name:row.name,contentType:row.content_type,size:row.size,createdAt:row.created_at,missingReason:row.missing_reason,etag,version:await version(row,etag)});
  }
  if(JSON.stringify(await rowsFor(env,runner.ownerId))!==JSON.stringify(rows))fail();for(const item of objects){const object=await env.FILES.head(item.key);if(!object||object.size!==item.size||object.etag!==item.etag)fail();}
  return Response.json({revision:await digest(JSON.stringify({rows,objects})),images});
 }catch(error){if(error instanceof SnapshotError)return Response.json({error:'source_unavailable'},{status:409});throw error;}
}
