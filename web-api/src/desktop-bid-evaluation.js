import {cleanupDesktopUploads,uploadLeaseMs} from './desktop-file-cleanup.js';
const bad=()=>Response.json({error:'invalid_evaluation'},{status:400}),missing=()=>Response.json({error:'not_found'},{status:404}),conflict=()=>Response.json({error:'source_conflict'},{status:409});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
import {validBidEvaluation} from '../../runner/bid-evaluation-import-contract.mjs';
export async function importDesktopBidEvaluation(request,env,runner,requestId,sourceKey){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)||!/^[a-f0-9]{64}$/.test(sourceKey))return bad();
 const project=await env.DB.prepare('SELECT p.id FROM desktop_plan_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=?').bind(runner.ownerId,requestId).first();if(!project)return missing();
 let input;try{input=await request.json();}catch{return bad();}if(!validBidEvaluation(input)||await hash(input.id)!==sourceKey)return bad();
 const body=JSON.stringify(input);if(body.length>20_000_000)return Response.json({error:'too_large'},{status:413});const contentHash=await hash(body);
 const lookup=()=>env.DB.prepare('SELECT i.job_id,i.content_hash,a.deleted_at FROM desktop_bid_evaluation_imports i LEFT JOIN job_artifacts a ON a.job_id=i.job_id WHERE i.owner_id=? AND i.request_id=? AND i.source_key=?').bind(runner.ownerId,requestId,sourceKey).first();
 const prior=async row=>row.content_hash!==contentHash?conflict():row.deleted_at?Response.json({error:'evaluation_removed'},{status:410}):Response.json({jobId:row.job_id});const existing=await lookup();if(existing)return prior(existing);
 const jobId=crypto.randomUUID(),artifactId=crypto.randomUUID(),mutation=crypto.randomUUID(),key=`desktop-evaluations/${project.id}/${artifactId}`,now=new Date().toISOString(),bytes=new TextEncoder().encode(JSON.stringify({tenderSources:input.tenderSources,bidSources:input.bidSources,result:input.result})),sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(bytes.byteLength>25*1024*1024)return Response.json({error:'too_large'},{status:413});
 await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(mutation,runner.ownerId,key,Date.now()+uploadLeaseMs,Date.now()).run();
 try{
  await env.FILES.put(key,bytes);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(mutation,runner.ownerId).run();
  const own='EXISTS (SELECT 1 FROM desktop_bid_evaluation_imports WHERE owner_id=? AND request_id=? AND source_key=? AND mutation_id=?)',params=[runner.ownerId,requestId,sourceKey,mutation],state=input.status==='completed'?'succeeded':input.status==='error'?'failed':'interrupted',payload=JSON.stringify({fileIds:[],imported:true,sourceId:input.id,sourceNames:[...input.tenderSources,...input.bidSources].map(x=>x.name)}),result=JSON.stringify(state==='succeeded'?{artifactId,criteriaCount:input.result.criteria.length}:{message:input.error||''});
  const outcome=await env.DB.batch([
   env.DB.prepare("INSERT INTO desktop_bid_evaluation_imports(owner_id,request_id,source_key,project_id,job_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?) ON CONFLICT(owner_id,request_id,source_key) DO NOTHING").bind(runner.ownerId,requestId,sourceKey,project.id,jobId,contentHash,mutation,now,mutation,runner.ownerId,Date.now()),
   env.DB.prepare(`INSERT INTO jobs(id,project_id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at,result_json) SELECT ?,?,?,'bid-evaluation.analyze',?,?,?,?,?,? WHERE ${own}`).bind(jobId,project.id,runner.ownerId,`import-${sourceKey}`,payload,state,input.createdAt||now,input.updatedAt||now,result,...params),
   env.DB.prepare(`INSERT INTO job_artifacts(id,job_id,object_key,sha256,size,created_at) SELECT ?,?,?,?,?,? WHERE ${own}`).bind(artifactId,jobId,key,sha,bytes.byteLength,now,...params),
   env.DB.prepare(`INSERT INTO bid_evaluation_web_reviews(job_id,criterion_id,status,score,note,version,updated_at) SELECT ?,json_extract(value,'$.criterionId'),json_extract(value,'$.status'),json_extract(value,'$.score'),json_extract(value,'$.note'),1,json_extract(value,'$.updatedAt') FROM json_each(?) WHERE ${own}`).bind(jobId,JSON.stringify(input.reviews),...params),
  ]);
  if(outcome[0].meta.changes)return Response.json({jobId},{status:201});
 }finally{try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(mutation,runner.ownerId).run();await cleanupDesktopUploads(env,runner.ownerId);}catch{/* Retry later. */}}
 const winner=await lookup();return winner?prior(winner):conflict();
}
