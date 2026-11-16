const result=(error,status)=>Response.json({error},{status});

export async function checkSecopAvailability(request,env,runner) {
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 let input;try{input=await request.json();}catch{return result('invalid_input',400);}
 if(!input || !['secop-i','secop-ii'].includes(input.source) || typeof input.sourceId!=='string' || !input.sourceId.trim() || input.sourceId.length>200 || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.requestId || ''))return result('invalid_input',400);
 const row=await env.DB.prepare('SELECT s.project_id,i.request_id FROM project_secop s LEFT JOIN desktop_secop_imports i ON i.owner_id=s.owner_id AND i.project_id=s.project_id AND i.source=s.source AND i.external_id=s.external_id WHERE s.owner_id=? AND s.source=? AND s.external_id=?').bind(runner.ownerId,input.source,input.sourceId).first();
 return !row || row.request_id===input.requestId ? Response.json({available:true}) : result('secop_already_linked',409);
}

export async function restoreSecopLinks(request,env,runner,requestId) {
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId))return result('invalid_input',400);
 let input;try{input=await request.json();}catch{return result('invalid_input',400);}
 if(!Array.isArray(input?.links) || input.links.length>5000)return result('invalid_input',400);
 const ids=new Set(),documents=new Set();
 for(const link of input.links){
  if(!link || !['document','zip'].includes(link.kind) || typeof link.documentId!=='string' || !link.documentId || link.documentId.length>256 || !/^[a-f0-9]{64}$/.test(link.sourceKey || ''))return result('invalid_input',400);
  const identity=JSON.stringify([link.kind,link.documentId,link.sourceKey]);if(ids.has(identity) || (link.kind==='document' && documents.has(link.documentId)))return result('invalid_input',400);
  ids.add(identity);if(link.kind==='document')documents.add(link.documentId);
 }
 const owner=runner.ownerId,project=await env.DB.prepare('SELECT p.id FROM desktop_plan_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id JOIN project_secop s ON s.project_id=p.id AND s.owner_id=p.owner_id WHERE i.owner_id=? AND i.request_id=?').bind(owner,requestId).first();
 if(!project)return result('not_found',404);
 const body=JSON.stringify(input.links);
 const missing=await env.DB.prepare("SELECT 1 AS found FROM json_each(?) j LEFT JOIN desktop_plan_file_imports i ON i.owner_id=? AND i.request_id=? AND i.source_key=json_extract(j.value,'$.sourceKey') AND i.project_id=? LEFT JOIN project_files f ON f.id=i.file_id AND f.project_id=i.project_id WHERE f.id IS NULL LIMIT 1").bind(body,owner,requestId,project.id).first();
 if(missing)return result('file_removed',410);
 const conflict=await env.DB.prepare("SELECT 1 AS found FROM json_each(?) j JOIN desktop_plan_file_imports i ON i.owner_id=? AND i.request_id=? AND i.source_key=json_extract(j.value,'$.sourceKey') JOIN project_secop_files s ON s.project_id=? AND s.document_id=json_extract(j.value,'$.documentId') WHERE json_extract(j.value,'$.kind')='document' AND s.file_id<>i.file_id LIMIT 1").bind(body,owner,requestId,project.id).first();
 if(conflict)return result('link_conflict',409);
 const guard="NOT EXISTS (SELECT 1 FROM json_each(?) j LEFT JOIN desktop_plan_file_imports i ON i.owner_id=? AND i.request_id=? AND i.source_key=json_extract(j.value,'$.sourceKey') AND i.project_id=? LEFT JOIN project_files f ON f.id=i.file_id AND f.project_id=i.project_id WHERE f.id IS NULL) AND NOT EXISTS (SELECT 1 FROM json_each(?) j JOIN desktop_plan_file_imports i ON i.owner_id=? AND i.request_id=? AND i.source_key=json_extract(j.value,'$.sourceKey') JOIN project_secop_files s ON s.project_id=? AND s.document_id=json_extract(j.value,'$.documentId') WHERE json_extract(j.value,'$.kind')='document' AND s.file_id<>i.file_id) AND EXISTS (SELECT 1 FROM project_secop WHERE project_id=? AND owner_id=?)";
 const args=[body,owner,requestId,project.id,body,owner,requestId,project.id,project.id,owner];
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO project_secop_files(project_id,document_id,file_id) SELECT ?,json_extract(j.value,'$.documentId'),i.file_id FROM json_each(?) j JOIN desktop_plan_file_imports i ON i.owner_id=? AND i.request_id=? AND i.source_key=json_extract(j.value,'$.sourceKey') WHERE json_extract(j.value,'$.kind')='document' AND ${guard}`).bind(project.id,body,owner,requestId,...args),
  env.DB.prepare(`INSERT OR IGNORE INTO secop_zip_files(project_id,document_id,file_id) SELECT ?,json_extract(j.value,'$.documentId'),i.file_id FROM json_each(?) j JOIN desktop_plan_file_imports i ON i.owner_id=? AND i.request_id=? AND i.source_key=json_extract(j.value,'$.sourceKey') WHERE json_extract(j.value,'$.kind')='zip' AND ${guard}`).bind(project.id,body,owner,requestId,...args),
 ]);
 const absent=await env.DB.prepare("SELECT 1 AS found FROM json_each(?) j JOIN desktop_plan_file_imports i ON i.owner_id=? AND i.request_id=? AND i.source_key=json_extract(j.value,'$.sourceKey') WHERE (json_extract(j.value,'$.kind')='document' AND NOT EXISTS (SELECT 1 FROM project_secop_files s WHERE s.project_id=? AND s.document_id=json_extract(j.value,'$.documentId') AND s.file_id=i.file_id)) OR (json_extract(j.value,'$.kind')='zip' AND NOT EXISTS (SELECT 1 FROM secop_zip_files s WHERE s.project_id=? AND s.document_id=json_extract(j.value,'$.documentId') AND s.file_id=i.file_id)) LIMIT 1").bind(body,owner,requestId,project.id,project.id).first();
 return absent?result('link_conflict',409):Response.json({linked:input.links.length});
}
