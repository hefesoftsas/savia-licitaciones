const missing=()=>Response.json({error:'not_found'},{status:404});
const conflict=()=>Response.json({error:'source_changed'},{status:409});
export async function repairOfferDocument(request,env,owner,projectId,documentId){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_input'},{status:400});}
 if(typeof input?.fileId!=='string'||!input.fileId||input.fileId.length>128||!Number.isSafeInteger(input.version)||input.version<1)return Response.json({error:'invalid_input'},{status:400});
 const row=await env.DB.prepare('SELECT d.file_id,d.version FROM project_offer_documents d JOIN projects p ON p.id=d.project_id WHERE d.id=? AND d.project_id=? AND p.owner_id=?').bind(documentId,projectId,owner).first();if(!row)return missing();
 if(row.version!==input.version){return row.version===input.version+1&&row.file_id===input.fileId?Response.json({repaired:true}):conflict();}
 if(row.file_id)return conflict();
 const file=await env.DB.prepare('SELECT id FROM project_files WHERE id=? AND project_id=?').bind(input.fileId,projectId).first();if(!file)return missing();
 const result=await env.DB.batch([
  env.DB.prepare("UPDATE project_offer_package_items SET state='changed',review_required=1 WHERE project_id=? AND document_id=? AND EXISTS(SELECT 1 FROM project_offer_documents d JOIN projects p ON p.id=d.project_id WHERE d.id=? AND d.project_id=? AND d.version=? AND d.file_id IS NULL AND p.owner_id=?) AND EXISTS(SELECT 1 FROM project_files WHERE id=? AND project_id=?)").bind(projectId,documentId,documentId,projectId,input.version,owner,input.fileId,projectId),
  env.DB.prepare('UPDATE project_offer_documents SET file_id=?,missing_reason=NULL,version=version+1 WHERE id=? AND project_id=? AND version=? AND file_id IS NULL AND EXISTS(SELECT 1 FROM projects WHERE id=? AND owner_id=?) AND EXISTS(SELECT 1 FROM project_files WHERE id=? AND project_id=?)').bind(input.fileId,documentId,projectId,input.version,projectId,owner,input.fileId,projectId),
 ]);
 if(result[1].meta.changes)return Response.json({repaired:true});
 const current=await env.DB.prepare('SELECT file_id,version FROM project_offer_documents WHERE id=? AND project_id=?').bind(documentId,projectId).first();return current?.version===input.version+1&&current.file_id===input.fileId?Response.json({repaired:true}):conflict();
}
export async function replaceOfferDocument(request,env,owner,projectId,documentId){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_input'},{status:400});}const validId=value=>typeof value==='string'&&value.length>0&&value.length<=128;if(!validId(input?.fileId)||!validId(input.previousFileId)||input.fileId===input.previousFileId||!Number.isSafeInteger(input.version)||input.version<1)return Response.json({error:'invalid_input'},{status:400});
 const current=async()=>env.DB.prepare('SELECT d.file_id,d.version FROM project_offer_documents d JOIN projects p ON p.id=d.project_id WHERE d.id=? AND d.project_id=? AND p.owner_id=?').bind(documentId,projectId,owner).first();const row=await current();if(!row)return missing();if(row.version!==input.version||row.file_id!==input.previousFileId)return row.version===input.version+1&&row.file_id===input.fileId?Response.json({replaced:true}):conflict();
 const file=await env.DB.prepare('SELECT id FROM project_files WHERE id=? AND project_id=?').bind(input.fileId,projectId).first();if(!file)return missing();
 const result=await env.DB.batch([
  env.DB.prepare("UPDATE project_offer_package_items SET state='changed',review_required=1 WHERE project_id=? AND document_id=? AND EXISTS(SELECT 1 FROM project_offer_documents d JOIN projects p ON p.id=d.project_id WHERE d.id=? AND d.project_id=? AND d.version=? AND d.file_id=? AND p.owner_id=?) AND EXISTS(SELECT 1 FROM project_files WHERE id=? AND project_id=?)").bind(projectId,documentId,documentId,projectId,input.version,input.previousFileId,owner,input.fileId,projectId),
  env.DB.prepare('UPDATE project_offer_documents SET file_id=?,missing_reason=NULL,version=version+1 WHERE id=? AND project_id=? AND version=? AND file_id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND owner_id=?) AND EXISTS(SELECT 1 FROM project_files WHERE id=? AND project_id=?)').bind(input.fileId,documentId,projectId,input.version,input.previousFileId,projectId,owner,input.fileId,projectId),
 ]);if(result[1].meta.changes)return Response.json({replaced:true});const latest=await current();return latest?.version===input.version+1&&latest.file_id===input.fileId?Response.json({replaced:true}):conflict();
}
