import { digest } from './runners.js';

export class LibrarySnapshotError extends Error {}
const changed=()=>{throw new LibrarySnapshotError('La imagen del plan cambió o no está disponible.');};
const version=(row,etag)=>digest(JSON.stringify([row,etag]));

export async function preparePlanLibraryImages(env,owner,planRows) {
  const ids=new Set();
  for(const row of planRows) for(const match of (row.content || '').matchAll(/\/api\/image-library\/([a-f0-9-]{36})\/file/gi)) ids.add(match[1]);
  if(ids.size>1000)changed();
  const references=[...ids].sort(), sql="SELECT id,name,content_type,object_key,size,created_at FROM image_library_web WHERE owner_id=? AND deleting=0 AND missing_reason IS NULL AND id IN (SELECT value FROM json_each(?)) ORDER BY id";
  const read=async()=> (await env.DB.prepare(sql).bind(owner,JSON.stringify(references)).all()).results;
  const rows=await read(), objects=[], images=[];
  for(const row of rows){
    const object=await env.FILES.head(row.object_key),observed=object?{size:object.size,etag:object.etag}:null,valid=object && object.size===row.size;
    objects.push({id:row.id,key:row.object_key,observed});
    const {object_key,...metadata}=row;images.push({...metadata,etag:valid?object.etag:null,version:valid?await version(row,object.etag):null});
  }
  const original=JSON.stringify(rows);
  return {images,revisionData:{rows,objects},async assertUnchanged(){
    if(JSON.stringify(await read())!==original)changed();
    for(const item of objects){const object=await env.FILES.head(item.key),observed=object?{size:object.size,etag:object.etag}:null;if(JSON.stringify(observed)!==JSON.stringify(item.observed))changed();}
  }};
}

export async function openPlanLibraryImage(env,owner,projectId,id,etag,expectedVersion) {
  const row=await env.DB.prepare("SELECT l.id,l.name,l.content_type,l.object_key,l.size,l.created_at FROM image_library_web l WHERE l.id=? AND l.owner_id=? AND l.deleting=0 AND l.missing_reason IS NULL AND EXISTS (SELECT 1 FROM project_technical_plan_nodes n JOIN projects p ON p.id=n.project_id WHERE p.id=? AND p.owner_id=? AND instr(n.content,'/api/image-library/' || l.id || '/file')>0)").bind(id,owner,projectId,owner).first();
  if(!row)return null;
  if(typeof etag!=='string' || !etag || await version(row,etag)!==expectedVersion)changed();
  const object=await env.FILES.get(row.object_key,{onlyIf:{etagMatches:etag}});
  if(!object?.body || object.size!==row.size || object.etag!==etag)changed();
  return object.body;
}
