import {digest} from './runners.js';

async function readRows(env,owner,project){
 const [projects,documents,links,presentation]=await env.DB.batch([
  env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(project,owner),
  env.DB.prepare('SELECT d.id,d.name,d.source_kind,d.file_id AS original_file_id,f.id AS file_id,d.missing_reason,d.created_at,d.version FROM project_offer_documents d JOIN projects p ON p.id=d.project_id LEFT JOIN project_files f ON f.id=d.file_id AND f.project_id=d.project_id WHERE p.id=? AND p.owner_id=? ORDER BY d.id').bind(project,owner),
  env.DB.prepare('SELECT l.id,l.document_id,l.requirement_id,l.support_id,l.source_document_id,l.source_requirement_id,l.source_support_id FROM project_offer_support_links l JOIN projects p ON p.id=l.project_id WHERE p.id=? AND p.owner_id=? ORDER BY l.id').bind(project,owner),
  env.DB.prepare('SELECT x.id,x.document_id,x.source_document_id,x.sort_order,x.expected_size,x.expected_digest,x.state,x.review_required FROM project_offer_package_items x JOIN projects p ON p.id=x.project_id WHERE p.id=? AND p.owner_id=? ORDER BY x.sort_order,x.id').bind(project,owner),
 ]);return projects.results.length?{documents:documents.results,links:links.results,presentation:presentation.results}:null;
}
export async function runnerOfferDocumentsCapture(request,env,runner,projectId){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 const rows=await readRows(env,runner.ownerId,projectId);if(!rows)return Response.json({error:'not_found'},{status:404});if(Object.values(rows).some(list=>list.length>10000))return Response.json({error:'too_large'},{status:413});
 const documents=rows.documents.map(row=>({id:row.id,name:row.name,kind:row.source_kind,fileId:row.file_id,missingReason:row.file_id?null:(row.missing_reason||'file_removed'),createdAt:row.created_at,version:row.version})),byId=new Map(documents.map(row=>[row.id,row]));
 const links=rows.links.map(row=>({id:row.id,documentId:row.document_id||row.source_document_id,requirementId:row.requirement_id||row.source_requirement_id,supportId:row.support_id||row.source_support_id,sourceDocumentId:row.source_document_id,sourceRequirementId:row.source_requirement_id,sourceSupportId:row.source_support_id,unresolvedDocument:!row.document_id,unresolvedRequirement:!row.requirement_id,unresolvedSupport:!row.support_id}));
 const presentation=rows.presentation.map(row=>({id:row.id,documentId:row.document_id||row.source_document_id,sourceDocumentId:row.source_document_id,unresolvedDocument:!row.document_id,sortOrder:row.sort_order,size:row.expected_size,digest:row.expected_digest,state:row.document_id&&byId.get(row.document_id)?.fileId?row.state:'missing',reviewRequired:!!row.review_required}));
 const revision=await digest(JSON.stringify(rows));if(JSON.stringify(await readRows(env,runner.ownerId,projectId))!==JSON.stringify(rows))return Response.json({error:'capture_changed'},{status:409});return Response.json({revision,documents,links,presentation});
}
