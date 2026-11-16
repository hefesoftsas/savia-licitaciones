import {digest} from './runners.js';

export class ReviewSnapshotError extends Error {}
const fail=()=>{throw new ReviewSnapshotError('Los informes de revisión o sus hallazgos cambiaron o no están disponibles.');};
const columns='j.id,j.kind,j.state,j.payload_json,j.result_json,j.created_at,j.updated_at,a.object_key,a.size,a.sha256,a.deleted_at,a.storage_deleted_at';
const from=" FROM jobs j JOIN projects p ON p.id=j.project_id AND p.owner_id=j.owner_id LEFT JOIN job_artifacts a ON a.job_id=j.id WHERE j.project_id=? AND j.owner_id=? AND j.kind IN ('duplicate-check.analyze','rejection-check.analyze','rejection-check.extract')";
const version=(row,removals,etag)=>digest(JSON.stringify([row,removals,etag]));
async function read(env,owner,project){
 const [projects,jobs,removals]=await env.DB.batch([
  env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(project,owner),
  env.DB.prepare(`SELECT ${columns}${from} ORDER BY j.id`).bind(project,owner),
  env.DB.prepare("SELECT r.job_id,r.section,r.finding_id,r.created_at FROM rejection_finding_removals r JOIN jobs j ON j.id=r.job_id AND j.owner_id=r.owner_id JOIN projects p ON p.id=j.project_id AND p.owner_id=j.owner_id WHERE j.project_id=? AND j.owner_id=? AND j.kind='rejection-check.analyze' ORDER BY r.job_id,r.section,r.finding_id").bind(project,owner),
 ]);
 return projects.results.length?{jobs:jobs.results,removals:removals.results}:null;
}
export async function prepareReviewTransport(env,owner,project){
 const original=await read(env,owner,project);if(!original)return null;
 const tasks=[],objects=[],removalsByJob=new Map();
 for(const item of original.removals){const list=removalsByJob.get(item.job_id)||[];list.push({section:item.section,findingId:item.finding_id,createdAt:item.created_at});removalsByJob.set(item.job_id,list);}
 for(const row of original.jobs){
  if(row.deleted_at&&!row.storage_deleted_at)fail();if(row.deleted_at)continue;
  let payload,result;try{payload=JSON.parse(row.payload_json);result=row.result_json?JSON.parse(row.result_json):null;}catch{fail();}
  if(!payload||typeof payload!=='object'||Array.isArray(payload))fail();
  const state=row.state==='succeeded'?'succeeded':row.state==='failed'?'failed':'interrupted';
  const removals=removalsByJob.get(row.id)||[];
  let artifact=null;
  if(state==='succeeded'&&row.kind!=='rejection-check.extract'){
   if(!row.object_key||!Number.isSafeInteger(row.size)||row.size<1||!/^[a-f0-9]{64}$/.test(row.sha256||''))fail();
   const object=await env.FILES.head(row.object_key);if(!object||object.size!==row.size)fail();
   objects.push({id:row.id,key:row.object_key,size:row.size,etag:object.etag});artifact={size:row.size,sha256:row.sha256,etag:object.etag,version:await version(row,removals,object.etag)};
  }else if(state==='succeeded'&&row.kind==='rejection-check.extract'&&(!result||typeof result.criteria!=='string'))fail();
  tasks.push({id:row.id,kind:row.kind,state,payload,result,createdAt:row.created_at,updatedAt:row.updated_at,artifact,removals});
 }
 return {tasks,revisionData:{rows:original,objects},async assertUnchanged(){if(JSON.stringify(await read(env,owner,project))!==JSON.stringify(original))fail();for(const item of objects){const object=await env.FILES.head(item.key);if(!object||object.size!==item.size||object.etag!==item.etag)fail();}}};
}
export async function openReviewSource(env,owner,project,id,etag,expectedVersion){
 const [jobs,removed]=await env.DB.batch([
  env.DB.prepare(`SELECT ${columns}${from} AND j.id=? AND j.state='succeeded' AND j.kind!='rejection-check.extract' AND a.deleted_at IS NULL`).bind(project,owner,id),
  env.DB.prepare("SELECT r.section,r.finding_id,r.created_at FROM rejection_finding_removals r JOIN jobs j ON j.id=r.job_id AND j.owner_id=r.owner_id JOIN projects p ON p.id=j.project_id AND p.owner_id=j.owner_id WHERE j.project_id=? AND j.owner_id=? AND j.id=? AND j.kind='rejection-check.analyze' ORDER BY r.section,r.finding_id").bind(project,owner,id),
 ]);
 const row=jobs.results[0];if(!row?.object_key)return null;
 const removals=removed.results.map(item=>({section:item.section,findingId:item.finding_id,createdAt:item.created_at}));
 if(typeof etag!=='string'||!etag||!/^[a-f0-9]{64}$/.test(expectedVersion||'')||await version(row,removals,etag)!==expectedVersion)fail();
 const object=await env.FILES.get(row.object_key,{onlyIf:{etagMatches:etag}});if(!object?.body||object.etag!==etag||object.size!==row.size)fail();return object.body;
}
