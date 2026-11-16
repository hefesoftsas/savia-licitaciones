const missing=()=>Response.json({error:'not_found'},{status:404});
export async function wordFieldReview(request,env,owner,projectId,jobId){
 const artifact=await env.DB.prepare("SELECT a.edit_revision FROM job_artifacts a JOIN jobs j ON j.id=a.job_id WHERE j.id=? AND j.project_id=? AND j.owner_id=? AND j.kind='technical-plan.export-word' AND j.state='succeeded' AND a.deleted_at IS NULL").bind(jobId,projectId,owner).first();
 if(!artifact)return missing();
 if(request.method==='GET'){
  const row=await env.DB.prepare('SELECT state_json FROM word_field_reviews WHERE job_id=? AND owner_id=?').bind(jobId,owner).first();
  return Response.json({review:row?JSON.parse(row.state_json):null});
 }
 if(!['PUT','DELETE'].includes(request.method))return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM word_field_reviews WHERE job_id=? AND owner_id=?').bind(jobId,owner).run();return new Response(null,{status:204});}
 let review;try{review=await request.json();}catch{return Response.json({error:'invalid_json'},{status:400});}
 const json=JSON.stringify(review);
 if(!Array.isArray(review?.contexts)||!Array.isArray(review?.rows)||review.contexts.length>2000||review.rows.length>review.contexts.length||new TextEncoder().encode(json).length>2_000_000)return Response.json({error:'invalid_review'},{status:400});
 await env.DB.prepare('INSERT INTO word_field_reviews(job_id,owner_id,state_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at WHERE word_field_reviews.owner_id=excluded.owner_id').bind(jobId,owner,json,new Date().toISOString()).run();
 return Response.json({saved:true});
}
