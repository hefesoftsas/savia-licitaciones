import {digest} from './runners.js';
export class ComparisonSnapshotError extends Error {}
const fail=()=>{throw new ComparisonSnapshotError('Las comparaciones o sus fuentes cambiaron o no están disponibles.');};
const sql=`SELECT c.id,c.source_requirement_id,c.snapshot_json,c.object_key,c.missing_reason,c.content_hash,c.created_at,r.id AS requirement_id FROM imported_rup_comparisons c JOIN projects p ON p.id=c.project_id AND p.owner_id=c.owner_id LEFT JOIN desktop_requirement_id_map m ON m.owner_id=c.owner_id AND m.request_id=c.request_id AND m.source_id=c.source_requirement_id AND m.project_id=c.project_id LEFT JOIN project_requirements r ON r.id=m.requirement_id AND r.project_id=c.project_id WHERE c.project_id=? AND c.owner_id=?`;
const version=(row,etag,size)=>digest(JSON.stringify([row,etag,size]));
async function rows(env,owner,project){return (await env.DB.prepare(`${sql} ORDER BY c.id`).bind(project,owner).all()).results;}
export async function prepareComparisonTransport(env,owner,project){
 const original=await rows(env,owner,project), objects=[],comparisons=[];
 for(const row of original){
  let snapshot;try{snapshot=JSON.parse(row.snapshot_json);}catch{fail();}
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))fail();
  let source=null;
  if(row.object_key){const object=await env.FILES.head(row.object_key);if(!object)fail();const item={id:row.id,key:row.object_key,size:object.size,etag:object.etag};objects.push(item);source={size:object.size,etag:object.etag,version:await version(row,object.etag,object.size)};}
  else if(!['not_found','too_large','unsafe_path'].includes(row.missing_reason))fail();
  comparisons.push({id:row.id,requirementId:row.requirement_id,snapshot,missingReason:row.missing_reason,source});
 }
 return {comparisons,revisionData:{rows:original,objects},async assertUnchanged(){if(JSON.stringify(await rows(env,owner,project))!==JSON.stringify(original))fail();for(const item of objects){const object=await env.FILES.head(item.key);if(!object||object.size!==item.size||object.etag!==item.etag)fail();}}};
}
export async function openComparisonSource(env,owner,project,id,etag,expectedVersion){
 const row=await env.DB.prepare(`${sql} AND c.id=?`).bind(project,owner,id).first();if(!row||!row.object_key)return null;
 if(typeof etag!=='string'||!etag||!/^[a-f0-9]{64}$/.test(expectedVersion||''))fail();
 const object=await env.FILES.get(row.object_key,{onlyIf:{etagMatches:etag}});if(!object?.body||object.etag!==etag||await version(row,etag,object.size)!==expectedVersion)fail();return object.body;
}
