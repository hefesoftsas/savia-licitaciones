import {validFeasibilityState} from '../../runner/feasibility-state-contract.mjs';
export {validFeasibilityState} from '../../runner/feasibility-state-contract.mjs';
const view=row=>({state:JSON.parse(row.state_json),version:row.version,updatedAt:row.updated_at});
export async function feasibilityReport(request,env,ownerId){
 if(request.method==='GET'){
  const row=await env.DB.prepare('SELECT state_json,version,updated_at FROM feasibility_reports WHERE owner_id=?').bind(ownerId).first();
  if(!row)return Response.json({report:null});
  const {results}=await env.DB.prepare('SELECT source_key,object_key,deleting,deleted FROM desktop_feasibility_sources WHERE owner_id=?').bind(ownerId).all();
  const uploads=await env.DB.prepare("SELECT s.source_key,EXISTS (SELECT 1 FROM feasibility_extracted_texts t JOIN account_jobs j ON j.id=t.job_id AND j.owner_id=t.owner_id WHERE t.owner_id=s.owner_id AND t.source_key=s.source_key AND j.state='succeeded') AS text_available FROM feasibility_web_sources s WHERE s.owner_id=? AND s.deleting=0 AND s.deleted=0").bind(ownerId).all();
  return Response.json({report:view(row),sources:[...results.map(item=>({sourceKey:item.source_key,available:!!item.object_key&&!item.deleting&&!item.deleted,deleted:!!item.deleted})),...uploads.results.map(item=>({sourceKey:item.source_key,available:true,textAvailable:!!item.text_available}))]});
 }
 if(request.method!=='PUT')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_json'},{status:400});}
 if(!Number.isSafeInteger(input?.version)||input.version<0||!validFeasibilityState(input.report))return Response.json({error:'invalid_report'},{status:400});
 const state=JSON.stringify(input.report);if(new TextEncoder().encode(state).byteLength>1_500_000)return Response.json({error:'report_too_large'},{status:413});
 const now=new Date().toISOString();
 const row=input.version===0?await env.DB.prepare('INSERT INTO feasibility_reports(owner_id,state_json,version,updated_at) VALUES(?,?,1,?) ON CONFLICT(owner_id) DO NOTHING RETURNING state_json,version,updated_at').bind(ownerId,state,now).first():await env.DB.prepare('UPDATE feasibility_reports SET state_json=?,version=version+1,updated_at=? WHERE owner_id=? AND version=? RETURNING state_json,version,updated_at').bind(state,now,ownerId,input.version).first();
 return row?Response.json({report:view(row)}):Response.json({error:'version_conflict'},{status:409});
}
