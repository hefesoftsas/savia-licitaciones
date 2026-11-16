import reportModule from '../../client/electron/services/bidEvaluationReport.cjs';
const missing=()=>Response.json({error:'not_found'},{status:404}),bad=()=>Response.json({error:'invalid_input'},{status:400}),conflict=()=>Response.json({error:'version_conflict'},{status:409});
export async function bidEvaluation(request,env,owner,projectId,jobId){
 const row=await env.DB.prepare("SELECT j.created_at,a.object_key FROM jobs j JOIN job_artifacts a ON a.job_id=j.id WHERE j.id=? AND j.project_id=? AND j.owner_id=? AND j.kind='bid-evaluation.analyze' AND j.state='succeeded' AND a.deleted_at IS NULL").bind(jobId,projectId,owner).first();if(!row)return missing();
 const object=await env.FILES.get(row.object_key);if(!object)return Response.json({error:'stored_data_missing'},{status:503});let data;try{data=await object.json();if(!Array.isArray(data?.result?.criteria)||!Array.isArray(data.tenderSources)||!Array.isArray(data.bidSources))throw Error();}catch{return Response.json({error:'stored_data_invalid'},{status:503});}
 const list=async()=>{const rows=await env.DB.prepare('SELECT criterion_id AS criterionId,status,score,note,version,updated_at AS updatedAt FROM bid_evaluation_web_reviews WHERE job_id=? ORDER BY criterion_id').bind(jobId).all();return rows.results;};
 if(request.method==='GET'){
  const reviews=await list(),format=new URL(request.url).searchParams.get('format');if(format&&format!=='md')return bad();
  if(format==='md'){const content=reportModule.formatBidEvaluationReport({status:'completed',createdAt:row.created_at,...data,reviews},new URL(request.url).searchParams.get('language')==='en'?'en':'es');return new Response(content,{headers:{'content-type':'text/markdown; charset=utf-8','content-disposition':'attachment; filename="evaluacion.md"','x-content-type-options':'nosniff'}});}
  return Response.json({...data,reviews});
 }
 if(request.method!=='PUT')return new Response('Method not allowed',{status:405});if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return bad();}
 const criterion=data.result.criteria.find(item=>item.id===input?.criterionId);if(!criterion)return missing();
 if(!['accepted','adjusted','unresolved'].includes(input.status)||!Number.isSafeInteger(input.version)||input.version<0||typeof input.note!=='string'||input.note.length>20000||!(input.score===null||(typeof input.score==='number'&&Number.isFinite(input.score)&&input.score>=0&&typeof criterion.maxPoints==='number'&&input.score<=criterion.maxPoints)))return bad();
 const score=input.status==='unresolved'?null:input.score,now=new Date().toISOString(),guard="EXISTS (SELECT 1 FROM jobs j JOIN job_artifacts a ON a.job_id=j.id WHERE j.id=? AND j.project_id=? AND j.owner_id=? AND j.kind='bid-evaluation.analyze' AND j.state='succeeded' AND a.deleted_at IS NULL)";
 const saved=input.version===0?await env.DB.prepare(`INSERT INTO bid_evaluation_web_reviews(job_id,criterion_id,status,score,note,version,updated_at) SELECT ?,?,?,?,?,1,? WHERE ${guard} ON CONFLICT(job_id,criterion_id) DO NOTHING RETURNING version`).bind(jobId,input.criterionId,input.status,score,input.note,now,jobId,projectId,owner).first():await env.DB.prepare(`UPDATE bid_evaluation_web_reviews SET status=?,score=?,note=?,version=version+1,updated_at=? WHERE job_id=? AND criterion_id=? AND version=? AND ${guard} RETURNING version`).bind(input.status,score,input.note,now,jobId,input.criterionId,input.version,jobId,projectId,owner).first();
 if(!saved){const current=await env.DB.prepare(`SELECT 1 AS present WHERE ${guard}`).bind(jobId,projectId,owner).first();return current?conflict():missing();}return Response.json({reviews:await list()});
}
