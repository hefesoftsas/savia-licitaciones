export async function importDesktopAddenda(request,env,runner,requestId) {
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  let input;try{input=await request.json();}catch{return Response.json({error:'invalid_history'},{status:400});}
  if(!Array.isArray(input?.runs)||input.runs.length>50||input.runs.some(run=>!run||typeof run.id!=='string'||!run.id||run.id.length>200||!['completed','error','interrupted'].includes(run.status)||run.historical!==true||!Array.isArray(run.reviews)||new TextEncoder().encode(JSON.stringify(run)).byteLength>262144)||new Set(input.runs.map(run=>run.id)).size!==input.runs.length)return Response.json({error:'invalid_history'},{status:400});
  const encoded=JSON.stringify(input.runs);if(new TextEncoder().encode(encoded).byteLength>900000)return Response.json({error:'history_too_large'},{status:413});
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(encoded))),b=>b.toString(16).padStart(2,'0')).join('');
  const project=await env.DB.prepare('SELECT i.project_id FROM desktop_plan_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=?').bind(runner.ownerId,requestId).first();
  if(!project){const existing=await env.DB.prepare('SELECT 1 FROM desktop_plan_imports WHERE owner_id=? AND request_id=?').bind(runner.ownerId,requestId).first();return Response.json({error:existing?'project_removed':'not_found'},{status:existing?410:404});}
  const prior=await env.DB.prepare('SELECT content_hash FROM desktop_addendum_imports WHERE owner_id=? AND request_id=?').bind(runner.ownerId,requestId).first();
  if(prior)return prior.content_hash===hash?Response.json({imported:true}):Response.json({error:'history_conflict'},{status:409});
  const token=crypto.randomUUID(),now=new Date().toISOString(),guard='AND NOT EXISTS (SELECT 1 FROM project_addendum_history h JOIN json_each(?) ids ON ids.value=h.source_run_id WHERE h.project_id=?)';
  const statements=[env.DB.prepare(`INSERT INTO desktop_addendum_imports(owner_id,request_id,project_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND owner_id=?) ${guard} ON CONFLICT(owner_id,request_id) DO NOTHING`).bind(runner.ownerId,requestId,project.project_id,hash,token,now,project.project_id,runner.ownerId,JSON.stringify(input.runs.map(run=>run.id)),project.project_id),...input.runs.map(run=>env.DB.prepare('INSERT INTO project_addendum_history(project_id,source_run_id,record_json,created_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM desktop_addendum_imports WHERE owner_id=? AND request_id=? AND mutation_id=?)').bind(project.project_id,run.id,JSON.stringify(run),now,runner.ownerId,requestId,token))];
  const result=await env.DB.batch(statements);
  if(result[0].meta.changes)return Response.json({imported:true},{status:201});
  const existing=await env.DB.prepare('SELECT content_hash FROM desktop_addendum_imports WHERE owner_id=? AND request_id=?').bind(runner.ownerId,requestId).first();
  return existing?.content_hash===hash?Response.json({imported:true}):Response.json({error:'history_conflict'},{status:409});
}
export async function projectAddenda(request,env,ownerId,projectId) {
  if(request.method!=='GET')return new Response('Method not allowed',{status:405});
  const project=await env.DB.prepare('SELECT 1 FROM projects WHERE id=? AND owner_id=?').bind(projectId,ownerId).first();if(!project)return Response.json({error:'not_found'},{status:404});
  const rows=await env.DB.prepare('SELECT record_json FROM project_addendum_history WHERE project_id=? ORDER BY created_at DESC,source_run_id').bind(projectId).all();
  return Response.json({runs:rows.results.map(row=>JSON.parse(row.record_json))});
}
