const sections={rejection:'rejectionCheckResult',typo:'typoCheckResult',logic:'logicCheckResult'};
const missing=()=>Response.json({error:'not_found'},{status:404});

export async function removeRejectionFinding(request,env,owner,projectId,jobId){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_input'},{status:400});}
 if(!Object.hasOwn(sections,input?.section)||typeof input.findingId!=='string'||!input.findingId||input.findingId.length>256)return Response.json({error:'invalid_input'},{status:400});
 const row=await env.DB.prepare("SELECT a.object_key FROM jobs j JOIN job_artifacts a ON a.job_id=j.id WHERE j.id=? AND j.project_id=? AND j.owner_id=? AND j.kind='rejection-check.analyze' AND j.state='succeeded' AND a.deleted_at IS NULL").bind(jobId,projectId,owner).first();if(!row)return missing();
 const object=await env.FILES.get(row.object_key);if(!object)return Response.json({error:'stored_data_missing'},{status:503});let data;try{data=await object.json();}catch{return Response.json({error:'stored_data_invalid'},{status:503});}
 const items=data?.[sections[input.section]]?.findings;
 if(!Array.isArray(items))return missing();const count=items.filter(item=>item?.id===input.findingId).length;if(count===0)return missing();if(count!==1)return Response.json({error:'ambiguous_finding'},{status:409});
 const result=await env.DB.prepare("INSERT INTO rejection_finding_removals (job_id,owner_id,section,finding_id,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM jobs j JOIN job_artifacts a ON a.job_id=j.id WHERE j.id=? AND j.project_id=? AND j.owner_id=? AND j.kind='rejection-check.analyze' AND j.state='succeeded' AND a.deleted_at IS NULL) ON CONFLICT(job_id,section,finding_id) DO NOTHING RETURNING job_id").bind(jobId,owner,input.section,input.findingId,new Date().toISOString(),jobId,projectId,owner).first();
 if(result)return Response.json({removed:true});
 const existing=await env.DB.prepare("SELECT r.job_id FROM rejection_finding_removals r JOIN jobs j ON j.id=r.job_id JOIN job_artifacts a ON a.job_id=j.id WHERE r.job_id=? AND r.owner_id=? AND r.section=? AND r.finding_id=? AND j.project_id=? AND j.kind='rejection-check.analyze' AND j.state='succeeded' AND a.deleted_at IS NULL").bind(jobId,owner,input.section,input.findingId,projectId).first();
 return existing?Response.json({removed:true}):missing();
}

export async function filterRejectionReport(env,owner,jobId,report){
 const {results}=await env.DB.prepare('SELECT section,finding_id FROM rejection_finding_removals WHERE job_id=? AND owner_id=?').bind(jobId,owner).all();
 const removed=new Set(results.map(row=>`${row.section}\0${row.finding_id}`));
 for(const [section,key] of Object.entries(sections))if(Array.isArray(report?.[key]?.findings)){const original=report[key].findings;report[key].findings=original.filter(item=>!removed.has(`${section}\0${item?.id}`));report[key].removedCount=original.length-report[key].findings.length;}
 return report;
}
