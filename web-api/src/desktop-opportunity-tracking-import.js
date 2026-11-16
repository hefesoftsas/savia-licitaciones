export async function importDesktopOpportunityTracking(request,env,runner,requestId){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_tracking'},{status:400});}
 if(!['review','participate','discarded'].includes(input?.decision)||typeof input.owner!=='string'||input.owner.length>120||typeof input.notes!=='string'||input.notes.length>4000)return Response.json({error:'invalid_tracking'},{status:400});
 const data={decision:input.decision,owner:input.owner,notes:input.notes},bytes=new TextEncoder().encode(JSON.stringify(data));
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const project=await env.DB.prepare('SELECT i.project_id FROM desktop_plan_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=?').bind(runner.ownerId,requestId).first();
 if(!project){
  const previous=await env.DB.prepare('SELECT project_id FROM desktop_plan_imports WHERE owner_id=? AND request_id=?').bind(runner.ownerId,requestId).first();
  return previous?Response.json({error:'project_removed'},{status:410}):Response.json({error:'not_found'},{status:404});
 }
 const token=crypto.randomUUID(),now=new Date().toISOString();
 const result=await env.DB.batch([
  env.DB.prepare('INSERT INTO desktop_opportunity_tracking_imports (owner_id,request_id,project_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM project_opportunity_tracking WHERE project_id=?) ON CONFLICT(owner_id,request_id) DO NOTHING').bind(runner.ownerId,requestId,project.project_id,hash,token,now,project.project_id),
  env.DB.prepare('INSERT INTO project_opportunity_tracking (project_id,decision,owner,notes,version,updated_at) SELECT ?,?,?,?,1,? WHERE EXISTS (SELECT 1 FROM desktop_opportunity_tracking_imports WHERE owner_id=? AND request_id=? AND mutation_id=?)').bind(project.project_id,data.decision,data.owner,data.notes,now,runner.ownerId,requestId,token),
 ]);
 if(result[0].meta.changes)return Response.json({imported:true},{status:201});
 const previous=await env.DB.prepare('SELECT content_hash FROM desktop_opportunity_tracking_imports WHERE owner_id=? AND request_id=?').bind(runner.ownerId,requestId).first();
 return previous?.content_hash===hash?Response.json({imported:true}):Response.json({error:'tracking_conflict'},{status:409});
}
