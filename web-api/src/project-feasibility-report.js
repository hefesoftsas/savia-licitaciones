import {validFeasibilityState} from '../../runner/feasibility-state-contract.mjs';

const missing=()=>Response.json({error:'not_found'},{status:404});
const view=row=>({state:JSON.parse(row.state_json),version:row.version,updatedAt:row.updated_at});

export async function projectFeasibilityReport(request,env,owner,projectId){
 const project=await env.DB.prepare('SELECT id,title FROM projects WHERE id=? AND owner_id=?').bind(projectId,owner).first();
 if(!project)return missing();
 if(request.method==='GET'){
  const row=await env.DB.prepare('SELECT state_json,version,updated_at FROM project_feasibility_reports WHERE project_id=? AND owner_id=?').bind(projectId,owner).first();
  const sources=await env.DB.prepare("SELECT s.source_key AS sourceKey,s.deleting,s.deleted,EXISTS (SELECT 1 FROM project_feasibility_extracted_texts t JOIN account_jobs j ON j.id=t.job_id AND j.owner_id=t.owner_id AND j.project_id=t.project_id WHERE t.project_id=s.project_id AND t.owner_id=s.owner_id AND t.source_key=s.source_key AND j.state='succeeded') AS text_available FROM project_feasibility_sources s WHERE s.project_id=? AND s.owner_id=?").bind(projectId,owner).all();
  let projectDefaults;
  {
   const secop=await env.DB.prepare('SELECT process_json FROM project_secop WHERE project_id=? AND owner_id=?').bind(projectId,owner).first();
   let process={};try{process=secop?JSON.parse(secop.process_json):{};}catch{/* Historical metadata may be unavailable. */}
   const parts=[process?.city,process?.department].filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim());
   projectDefaults={projectName:project.title,...(parts.length?{location:[...new Set(parts)].join(', ')}:{}),...(typeof process?.title==='string'&&process.title.trim()?{constructionContent:process.title.trim()}:{}),...(typeof process?.entity==='string'&&process.entity.trim()?{contractingEntity:process.entity.trim()}:{})};
  }
  return Response.json({report:row?view(row):null,...(projectDefaults?{projectDefaults}:{}),sources:sources.results.map(item=>({sourceKey:item.sourceKey,available:!item.deleting&&!item.deleted,deleted:!!item.deleted,textAvailable:!!item.text_available}))});
 }
 if(request.method!=='PUT')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_json'},{status:400});}
 if(!Number.isSafeInteger(input?.version)||input.version<0||!validFeasibilityState(input.report))return Response.json({error:'invalid_report'},{status:400});
 const state=JSON.stringify(input.report);if(new TextEncoder().encode(state).byteLength>1_500_000)return Response.json({error:'report_too_large'},{status:413});
 const now=new Date().toISOString();
 const sourceGuard="NOT EXISTS (SELECT 1 FROM json_each(?,'$.sourceFiles') x WHERE json_extract(x.value,'$.sourceKey') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM project_feasibility_sources s WHERE s.project_id=? AND s.owner_id=? AND s.source_key=json_extract(x.value,'$.sourceKey') AND s.deleting=0 AND s.deleted=0))";
 const row=input.version===0?await env.DB.prepare(`INSERT INTO project_feasibility_reports(project_id,owner_id,state_json,version,updated_at) SELECT id,owner_id,?,1,? FROM projects WHERE id=? AND owner_id=? AND ${sourceGuard} ON CONFLICT(project_id) DO NOTHING RETURNING state_json,version,updated_at`).bind(state,now,projectId,owner,state,projectId,owner).first():await env.DB.prepare(`UPDATE project_feasibility_reports SET state_json=?,version=version+1,updated_at=? WHERE project_id=? AND owner_id=? AND version=? AND ${sourceGuard} RETURNING state_json,version,updated_at`).bind(state,now,projectId,owner,input.version,state,projectId,owner).first();
 return row?Response.json({report:view(row)}):Response.json({error:'version_conflict'},{status:409});
}
