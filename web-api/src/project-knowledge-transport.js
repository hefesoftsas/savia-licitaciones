import { digest } from './runners.js';
import { readReferencedKnowledge, KnowledgeSnapshotError } from './project-knowledge-snapshot.js';

const fail = () => { throw new KnowledgeSnapshotError('Las fuentes de conocimiento cambiaron o no están disponibles.'); };
const version = (row,etag) => digest(JSON.stringify([row,etag]));

export async function prepareKnowledgeTransport(env,owner,planRows) {
  const ids=new Set();
  for(const row of planRows) {
    let value; try { value=row.knowledge_item_ids_json===null ? [] : JSON.parse(row.knowledge_item_ids_json); } catch { fail(); }
    if(!Array.isArray(value) || value.some(id=>typeof id!=='string' || !id || id.length>128)) fail();
    for(const id of value)ids.add(id);
  }
  const references=[...ids].sort(), snapshot=await readReferencedKnowledge(env,owner,references), objects=[];
  for(const doc of snapshot.documents) {
    const object=await env.FILES.head(doc.object_key);
    if(!object || object.size!==doc.size)fail();
    objects.push({id:doc.id,key:doc.object_key,size:doc.size,etag:object.etag});
  }
  const original=JSON.stringify(snapshot), publicDocuments=[], byId=new Map(objects.map(item=>[item.id,item]));
  for(const doc of snapshot.documents) {
    const object=byId.get(doc.id), {object_key,...metadata}=doc;
    publicDocuments.push({...metadata,etag:object.etag,version:await version(doc,object.etag)});
  }
  return {
    revisionData:{snapshot,objects},
    knowledge:{folders:snapshot.folders,documents:publicDocuments,indices:snapshot.indices,entries:snapshot.entries},
    async assertUnchanged(){
      if(JSON.stringify(await readReferencedKnowledge(env,owner,references))!==original)fail();
      for(const item of objects){const object=await env.FILES.head(item.key);if(!object || object.size!==item.size || object.etag!==item.etag)fail();}
    },
  };
}

export async function openReferencedKnowledge(env,owner,projectId,documentId,etag,expectedVersion) {
  const row=await env.DB.prepare(`SELECT d.id,d.folder_id,d.name,d.content_type,d.object_key,d.size,d.created_at,d.sort_order FROM knowledge_documents d JOIN knowledge_folders f ON f.id=d.folder_id AND f.owner_id=d.owner_id JOIN knowledge_indices i ON i.document_id=d.id AND i.owner_id=d.owner_id WHERE d.id=? AND d.owner_id=? AND d.deleting=0 AND d.missing_reason IS NULL AND EXISTS (SELECT 1 FROM project_technical_plan_nodes n JOIN projects p ON p.id=n.project_id JOIN json_each(CASE WHEN json_valid(n.knowledge_item_ids_json) THEN n.knowledge_item_ids_json ELSE '[]' END) j JOIN knowledge_entries e ON e.id=j.value AND e.document_id=d.id AND e.owner_id=d.owner_id WHERE p.id=? AND p.owner_id=?)`).bind(documentId,owner,projectId,owner).first();
  if(!row)return null;
  if(typeof etag!=='string' || !etag || await version(row,etag)!==expectedVersion)fail();
  const object=await env.FILES.get(row.object_key,{onlyIf:{etagMatches:etag}});
  if(!object?.body || object.size!==row.size || object.etag!==etag)fail();
  return object.body;
}
