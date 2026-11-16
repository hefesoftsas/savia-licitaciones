export async function readJobActivity(request,env,ownerId,projectId,jobId){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 const job=await env.DB.prepare('SELECT j.state,j.result_json,j.created_at,j.updated_at,r.name AS runner_name FROM jobs j LEFT JOIN runners r ON r.id=j.runner_id WHERE j.id=? AND j.project_id=? AND j.owner_id=?').bind(jobId,projectId,ownerId).first();
 if(!job)return Response.json({error:'not_found'},{status:404});
 const {results}=await env.DB.prepare('SELECT sequence,code,occurred_at AS at,details_json FROM job_activity WHERE job_id=? ORDER BY sequence').bind(jobId).all();
 return Response.json({state:job.state,errorMessage:job.state==='failed' ? JSON.parse(job.result_json||'null')?.message||null : null,createdAt:job.created_at,updatedAt:job.updated_at,runnerName:job.runner_name,events:results.map(({details_json,...event})=>({...event,details:details_json?JSON.parse(details_json):{}})),limitReached:results.length>=10000});
}
export async function saveJobActivity(env,runner,jobId,hash,events){
 if(!events?.length)return;
 await env.DB.batch(events.map(event=>env.DB.prepare(`INSERT OR IGNORE INTO job_activity(job_id,sequence,code,occurred_at,details_json)
 SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM jobs WHERE id=? AND owner_id=? AND runner_id=? AND lease_hash=? AND state='running' AND lease_expires_at>?)`).bind(jobId,event.sequence,event.code,event.at,JSON.stringify(event.details||{}),jobId,runner.ownerId,runner.id,hash,Date.now())));
}
