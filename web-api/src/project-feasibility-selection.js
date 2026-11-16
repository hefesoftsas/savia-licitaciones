const bad=()=>Response.json({error:'invalid_request'},{status:400});
const missing=()=>Response.json({error:'not_found'},{status:404});
const conflict=()=>Response.json({error:'version_or_idempotency_conflict'},{status:409});
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export async function projectSelectFeasibilitySources(request,env,owner,project){
 if(!await env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(project,owner).first())return missing();
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return bad();}const key=request.headers.get('idempotency-key')||'';
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(key)||!Number.isSafeInteger(input?.version)||input.version<1||!Array.isArray(input.sourceKeys)||!input.sourceKeys.length||input.sourceKeys.length>50||input.sourceKeys.some(k=>typeof k!=='string'||!/^[a-f0-9]{64}$/.test(k))||new Set(input.sourceKeys).size!==input.sourceKeys.length)return bad();
 const hash=await digest(new TextEncoder().encode(JSON.stringify({version:input.version,sourceKeys:input.sourceKeys})));
 const lookup=()=>env.DB.prepare('SELECT content_hash FROM project_feasibility_source_selections WHERE owner_id=? AND project_id=? AND request_id=?').bind(owner,project,key).first();
 const current=()=>env.DB.prepare('SELECT state_json,version,updated_at FROM project_feasibility_reports WHERE project_id=? AND owner_id=?').bind(project,owner).first();
 const output=row=>({state:JSON.parse(row.state_json),version:row.version,updatedAt:row.updated_at});
 const existing=await lookup();if(existing){const row=await current();return existing.content_hash===hash&&row?Response.json({report:output(row)}):conflict();}
 const row=await current();if(!row)return missing();if(row.version!==input.version)return conflict();
 const sources=await env.DB.prepare('SELECT * FROM project_feasibility_sources WHERE project_id=? AND owner_id=? AND deleting=0 AND deleted=0 AND source_key IN (SELECT value FROM json_each(?))').bind(project,owner,JSON.stringify(input.sourceKeys)).all();if(sources.results.length!==input.sourceKeys.length)return missing();
 const byId=new Map(sources.results.map(source=>[source.source_key,source]));const files=input.sourceKeys.map(id=>{const item=byId.get(id);return {id:item.source_key,sourceKey:item.source_key,fileName:item.name,sourceType:'original',contentType:item.content_type,size:item.size,importedAt:item.created_at};});
 const state={...JSON.parse(row.state_json),sourceFiles:files,analysisMarkdown:'',outlineData:null,keyParametersMarkdown:'',importedTasks:[]},serialized=JSON.stringify(state);if(new TextEncoder().encode(serialized).byteLength>1_500_000)return Response.json({error:'report_too_large'},{status:413});
 const mutation=crypto.randomUUID(),now=new Date().toISOString(),results=await env.DB.batch([
  env.DB.prepare('INSERT INTO project_feasibility_source_selections(project_id,owner_id,request_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM project_feasibility_reports WHERE project_id=? AND owner_id=? AND version=?) AND (SELECT COUNT(*) FROM project_feasibility_sources WHERE project_id=? AND owner_id=? AND deleting=0 AND deleted=0 AND source_key IN (SELECT value FROM json_each(?)))=? ON CONFLICT(project_id,request_id) DO NOTHING').bind(project,owner,key,hash,mutation,now,project,owner,input.version,project,owner,JSON.stringify(input.sourceKeys),input.sourceKeys.length),
  env.DB.prepare('UPDATE project_feasibility_reports SET state_json=?,version=version+1,updated_at=? WHERE project_id=? AND owner_id=? AND version=? AND EXISTS (SELECT 1 FROM project_feasibility_source_selections WHERE project_id=? AND owner_id=? AND request_id=? AND mutation_id=?)').bind(serialized,now,project,owner,input.version,project,owner,key,mutation),
 ]);
 if(results[0].meta.changes)return Response.json({report:output(await current())});const winner=await lookup(),report=await current();return winner?.content_hash===hash&&report?Response.json({report:output(report)}):conflict();
}
