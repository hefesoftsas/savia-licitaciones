import {digest} from './runners.js';

export class BlindSnapshotError extends Error {}
const fail=()=>{throw new BlindSnapshotError('Las revisiones anónimas o sus archivos cambiaron o no están disponibles.');};
const version=(row,kind,etag)=>digest(JSON.stringify([row,kind,etag]));
const columns=`j.id,j.kind,j.state,j.payload_json,j.result_json,j.created_at,j.updated_at,
 a.object_key AS artifact_key,a.size AS artifact_size,a.sha256 AS artifact_sha,a.deleted_at AS artifact_deleted,a.storage_deleted_at AS artifact_storage_deleted,
 r.object_key AS report_key,r.size AS report_size,r.sha256 AS report_sha,r.deleted_at AS report_deleted,r.storage_deleted_at AS report_storage_deleted`;
const from=` FROM jobs j JOIN projects p ON p.id=j.project_id AND p.owner_id=j.owner_id
 LEFT JOIN job_artifacts a ON a.job_id=j.id LEFT JOIN job_repair_reports r ON r.job_id=j.id
 WHERE j.project_id=? AND j.owner_id=? AND j.kind IN ('blind-check.inspect','blind-check.fix','blind-check.fix-report','blind-check.fix-ai')`;

async function read(env,owner,project){
 const [projects,jobs]=await env.DB.batch([
  env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(project,owner),
  env.DB.prepare(`SELECT ${columns}${from} ORDER BY j.id`).bind(project,owner),
 ]);
 return projects.results.length?jobs.results:null;
}

async function source(env,row,kind,objects){
 const key=row[`${kind}_key`],size=row[`${kind}_size`],sha256=row[`${kind}_sha`];
 if(!key||!Number.isSafeInteger(size)||size<=0||!/^[a-f0-9]{64}$/.test(sha256||''))fail();
 const object=await env.FILES.head(key);if(!object||object.size!==size)fail();
 objects.push({id:row.id,kind,key,size,etag:object.etag});
 return {size,sha256,etag:object.etag,version:await version(row,kind,object.etag)};
}

export async function prepareBlindTransport(env,owner,project){
 const rows=await read(env,owner,project);if(!rows)return null;
 const tasks=[],objects=[];
 for(const row of rows){
  if((row.artifact_deleted&&!row.artifact_storage_deleted)||(row.report_deleted&&!row.report_storage_deleted))fail();
  if(row.artifact_deleted){if(row.report_key&&!row.report_storage_deleted)fail();continue;}
  if(row.report_deleted)fail();
  let payload,result;try{payload=JSON.parse(row.payload_json);result=row.result_json?JSON.parse(row.result_json):null;}catch{fail();}
  if(!payload||typeof payload!=='object'||Array.isArray(payload))fail();
  const state=row.state==='succeeded'?'succeeded':row.state==='failed'?'failed':'interrupted';
  let artifact=null,report=null;
  if(state==='succeeded'){
   artifact=await source(env,row,'artifact',objects);
   if(['blind-check.fix-report','blind-check.fix-ai'].includes(row.kind)&&payload.reportVersion===1)report=await source(env,row,'report',objects);
   else if(row.report_key)fail();
  }
  tasks.push({id:row.id,kind:row.kind,state,payload,result,createdAt:row.created_at,updatedAt:row.updated_at,artifact,report});
 }
 return {tasks,revisionData:{rows,objects},async assertUnchanged(){
  if(JSON.stringify(await read(env,owner,project))!==JSON.stringify(rows))fail();
  for(const item of objects){const object=await env.FILES.head(item.key);if(!object||object.size!==item.size||object.etag!==item.etag)fail();}
 }};
}

export async function openBlindSource(env,owner,project,id,kind,etag,expectedVersion){
 if(!['artifact','report'].includes(kind))return null;
 const row=await env.DB.prepare(`SELECT ${columns}${from} AND j.id=? AND j.state='succeeded' AND a.deleted_at IS NULL`).bind(project,owner,id).first();
 if(!row||!row[`${kind}_key`]||row[`${kind}_deleted`])return null;
 if(typeof etag!=='string'||!etag||!/^[a-f0-9]{64}$/.test(expectedVersion||'')||await version(row,kind,etag)!==expectedVersion)fail();
 const object=await env.FILES.get(row[`${kind}_key`],{onlyIf:{etagMatches:etag}});
 if(!object?.body||object.etag!==etag||object.size!==row[`${kind}_size`])fail();
 return object.body;
}
