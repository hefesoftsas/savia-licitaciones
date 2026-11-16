import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const sha=value=>createHash('sha256').update(value).digest('hex');
const text=(value,max,required=false)=>typeof value==='string' && value.length<=max && (!required || !!value.trim());
const invalid=()=>{throw new Error('Las fuentes de conocimiento de la captura no son válidas.');};

export async function validateKnowledgeSources({knowledge,objects,directory}) {
 if(!knowledge || !Array.isArray(knowledge.folders) || !Array.isArray(knowledge.documents) || !Array.isArray(knowledge.indices) || !Array.isArray(knowledge.entries) || knowledge.documents.length>1000 || knowledge.entries.length>10000 || knowledge.indices.length!==knowledge.documents.length)invalid();
 const folders=new Set(),docs=new Set(),indices=new Set(),entries=new Set(),counts=new Map();
 for(const folder of knowledge.folders){if(!folder || !text(folder.id,256,true) || folders.has(folder.id) || !text(folder.name,300,true) || !text(folder.created_at,100,true))invalid();folders.add(folder.id);}
 for(const doc of knowledge.documents){
  const entry=objects.get(`knowledge:${doc?.id}`);
  if(!doc || !text(doc.id,118,true) || docs.has(doc.id) || !folders.has(doc.folder_id) || !text(doc.name,255,true) || !text(doc.content_type,200,true) || !text(doc.created_at,100,true) || !Number.isSafeInteger(doc.size) || doc.size<1 || doc.size>25*1024*1024 || !entry || entry.size!==doc.size)invalid();
  const bytes=await readFile(join(directory,entry.file));if(bytes.length!==entry.size || sha(bytes)!==entry.sha256)invalid();
  docs.add(doc.id);
 }
 for(const index of knowledge.indices){if(!index || !docs.has(index.document_id) || indices.has(index.document_id) || !Number.isSafeInteger(index.revision) || index.revision<1)invalid();indices.add(index.document_id);}
 for(const entry of knowledge.entries){if(!entry || !text(entry.id,128,true) || entries.has(entry.id) || !docs.has(entry.document_id) || !text(entry.title,300,true) || !text(entry.summary,2000,true) || !text(entry.quote,10000,true) || !Number.isSafeInteger(entry.sort_order) || entry.sort_order<0)invalid();entries.add(entry.id);counts.set(entry.document_id,(counts.get(entry.document_id)||0)+1);}
 if([...docs].some(id=>!counts.get(id) || counts.get(id)>500))invalid();
 return entries;
}

export async function restoreKnowledgeSources({knowledge,objects,directory,requestId,server,send}) {
 await validateKnowledgeSources({knowledge,objects,directory});
 const base=`${server}/api/runner/imports/knowledge/${requestId}`, mapping=new Map();
 for(const folder of knowledge.folders) await send(`${base}/folders/${sha(folder.id)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceId:folder.id,name:folder.name,createdAt:folder.created_at})});
 for(const doc of knowledge.documents) {
  const entry=objects.get(`knowledge:${doc.id}`), bytes=await readFile(join(directory,entry.file));
  if(bytes.length!==entry.size || sha(bytes)!==entry.sha256)throw new Error('El documento de conocimiento cambió durante la recuperación.');
  const form=new FormData();form.set('metadata',JSON.stringify({sourceId:doc.id,folderSourceId:doc.folder_id,name:doc.name,createdAt:doc.created_at,contentType:doc.content_type,items:[]}));form.set('file',new Blob([bytes],{type:doc.content_type}),doc.name);
  const sourceKey=sha(doc.id);
  await send(`${base}/documents/${sourceKey}`,{method:'POST',headers:{},body:form});
  const entries=knowledge.entries.filter(item=>item.document_id===doc.id).map(item=>({id:item.id,title:item.title,summary:item.summary,quote:item.quote,sortOrder:item.sort_order}));
  const result=await send(`${base}/documents/${sourceKey}/index`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({entries})});
  if(!Array.isArray(result.mapping) || result.mapping.length!==entries.length)invalid();
  const expected=new Set(entries.map(item=>item.id));
  for(const item of result.mapping){if(!item || !expected.delete(item.sourceId) || !text(item.id,128,true) || mapping.has(item.sourceId))invalid();mapping.set(item.sourceId,item.id);}
 }
 return mapping;
}
