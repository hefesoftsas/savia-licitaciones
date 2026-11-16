import {digest} from './runners.js';
// Se evalúa dentro de la misma sentencia que modifica la tarea o el informe.
export const feasibilityKnowledgeGuard=`NOT EXISTS (SELECT 1 FROM json_each(account_jobs.payload_json,'$.knowledgeSnapshot') s WHERE NOT EXISTS (SELECT 1 FROM knowledge_documents d LEFT JOIN knowledge_imported_items imported ON imported.document_id=d.id AND imported.owner_id=d.owner_id LEFT JOIN knowledge_indices idx ON idx.document_id=d.id AND idx.owner_id=d.owner_id WHERE d.owner_id=account_jobs.owner_id AND d.id=json_extract(s.value,'$.documentId') AND d.deleting=0 AND ((json_extract(s.value,'$.kind')='imported' AND imported.document_id IS NOT NULL) OR (json_extract(s.value,'$.kind')='index' AND d.missing_reason IS NULL AND idx.revision=json_extract(s.value,'$.revision')))))`;
export async function resolveFeasibilityKnowledge(env,owner,ids){
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.length>100)return null;
 const reportImport=await env.DB.prepare("SELECT request_id FROM desktop_feasibility_imports WHERE owner_id=? ORDER BY created_at DESC LIMIT 1").bind(owner).first();
 const match=/^desktop-feasibility-([a-f0-9]{64})$/.exec(reportImport?.request_id||''),snapshot=[];
 for(const sourceId of ids){
  let doc=await env.DB.prepare('SELECT id FROM knowledge_documents WHERE id=? AND owner_id=? AND deleting=0').bind(sourceId,owner).first();
  if(!doc&&match){const sourceKey=await digest(sourceId);doc=await env.DB.prepare('SELECT d.id FROM desktop_knowledge_document_imports m JOIN knowledge_documents d ON d.id=m.document_id AND d.owner_id=m.owner_id AND d.deleting=0 WHERE m.owner_id=? AND m.request_id=? AND m.source_key=?').bind(owner,`desktop-knowledge-${match[1]}`,sourceKey).first();}
  if(!doc)return null;
  const imported=await env.DB.prepare('SELECT document_id FROM knowledge_imported_items WHERE document_id=? AND owner_id=?').bind(doc.id,owner).first();
  if(imported){snapshot.push({sourceId,documentId:doc.id,kind:'imported'});continue;}
  const index=await env.DB.prepare('SELECT i.revision FROM knowledge_indices i JOIN knowledge_documents d ON d.id=i.document_id AND d.owner_id=i.owner_id WHERE i.document_id=? AND i.owner_id=? AND d.deleting=0 AND d.missing_reason IS NULL').bind(doc.id,owner).first();if(!index)return null;snapshot.push({sourceId,documentId:doc.id,kind:'index',revision:index.revision});
 }
 return snapshot;
}
export async function readFeasibilityKnowledge(env,owner,snapshot){
 const items=[];
 for(const ref of snapshot||[]){
  const previousCount=items.length;
  if(ref.kind==='imported'){
   const row=await env.DB.prepare('SELECT i.items_json FROM knowledge_imported_items i JOIN knowledge_documents d ON d.id=i.document_id AND d.owner_id=i.owner_id WHERE i.document_id=? AND i.owner_id=? AND d.deleting=0').bind(ref.documentId,owner).first();if(!row)return null;
   for(const item of JSON.parse(row.items_json))if(item.id&&item.content)items.push({id:`${ref.sourceId}::${item.id}`,title:item.title||'',summary:item.summary||'',content:item.content});
  }else{
   const row=await env.DB.prepare('SELECT revision FROM knowledge_indices i JOIN knowledge_documents d ON d.id=i.document_id AND d.owner_id=i.owner_id WHERE i.document_id=? AND i.owner_id=? AND i.revision=? AND d.deleting=0 AND d.missing_reason IS NULL').bind(ref.documentId,owner,ref.revision).first();if(!row)return null;
   const entries=await env.DB.prepare('SELECT id,title,summary,quote FROM knowledge_entries WHERE document_id=? AND owner_id=? ORDER BY sort_order,id').bind(ref.documentId,owner).all();for(const item of entries.results)items.push({id:`${ref.sourceId}::${item.id}`,title:item.title,summary:item.summary,content:item.quote});
  }
  if(items.length===previousCount)return null;
 }
 return items;
}
