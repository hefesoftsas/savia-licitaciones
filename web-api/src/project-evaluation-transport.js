import {digest} from './runners.js';

export class EvaluationSnapshotError extends Error {}
const fail=()=>{throw new EvaluationSnapshotError('Las evaluaciones o sus informes cambiaron o no están disponibles.');};
const version=(row,etag)=>digest(JSON.stringify([row,etag]));
const columns="j.id,j.state,j.created_at,j.updated_at,j.result_json,a.object_key,a.size,a.sha256,a.deleted_at,a.storage_deleted_at";
const from=" FROM jobs j JOIN projects p ON p.id=j.project_id AND p.owner_id=j.owner_id LEFT JOIN job_artifacts a ON a.job_id=j.id WHERE j.project_id=? AND j.owner_id=? AND j.kind='bid-evaluation.analyze'";
async function read(env,owner,project){
 const [projects,jobs,reviews]=await env.DB.batch([
  env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(project,owner),
  env.DB.prepare(`SELECT ${columns}${from} ORDER BY j.id`).bind(project,owner),
  env.DB.prepare("SELECT r.job_id,r.criterion_id,r.status,r.score,r.note,r.version,r.updated_at FROM bid_evaluation_web_reviews r JOIN jobs j ON j.id=r.job_id JOIN projects p ON p.id=j.project_id AND p.owner_id=j.owner_id WHERE j.project_id=? AND j.owner_id=? AND j.kind='bid-evaluation.analyze' ORDER BY r.job_id,r.criterion_id").bind(project,owner),
 ]);
 return projects.results.length?{jobs:jobs.results,reviews:reviews.results}:null;
}
export async function prepareEvaluationTransport(env,owner,project){
 const original=await read(env,owner,project);if(!original)return null;
 const objects=[],evaluations=[];
 for(const row of original.jobs){
  if(row.deleted_at&&!row.storage_deleted_at)fail();
  if(row.deleted_at)continue;
  const status=row.state==='succeeded'?'completed':row.state==='failed'?'error':'interrupted';
  let error=null;try{const result=row.result_json?JSON.parse(row.result_json):null;if(status==='error')error=typeof result?.message==='string'?result.message:typeof result?.error==='string'?result.error:'';}catch{fail();}
  let source=null;
  if(status==='completed'){
   if(!row.object_key||!Number.isSafeInteger(row.size)||row.size<0||!/^[a-f0-9]{64}$/.test(row.sha256||''))fail();
   const object=await env.FILES.head(row.object_key);if(!object||object.size!==row.size)fail();
   objects.push({id:row.id,key:row.object_key,size:row.size,etag:object.etag});source={size:row.size,sha256:row.sha256,etag:object.etag,version:await version(row,object.etag)};
  }
  const reviews=status==='completed'?original.reviews.filter(item=>item.job_id===row.id).map(item=>({criterionId:item.criterion_id,status:item.status,score:item.score,note:item.note,updatedAt:item.updated_at})):[];
  evaluations.push({id:row.id,status,createdAt:row.created_at,updatedAt:row.updated_at,error,reviews,source});
 }
 return {evaluations,revisionData:{rows:original,objects},async assertUnchanged(){if(JSON.stringify(await read(env,owner,project))!==JSON.stringify(original))fail();for(const item of objects){const object=await env.FILES.head(item.key);if(!object||object.size!==item.size||object.etag!==item.etag)fail();}}};
}
export async function openEvaluationSource(env,owner,project,id,etag,expectedVersion){
 const row=await env.DB.prepare(`SELECT ${columns}${from} AND j.id=? AND j.state='succeeded' AND a.deleted_at IS NULL`).bind(project,owner,id).first();if(!row?.object_key)return null;
 if(typeof etag!=='string'||!etag||!/^[a-f0-9]{64}$/.test(expectedVersion||'')||await version(row,etag)!==expectedVersion)fail();
 const object=await env.FILES.get(row.object_key,{onlyIf:{etagMatches:etag}});if(!object?.body||object.etag!==etag||object.size!==row.size)fail();return object.body;
}
