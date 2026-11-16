import { createHash } from 'node:crypto';
const invalid=()=>{throw new Error('El vínculo SECOP de la captura no es válido.');};
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const hash=value=>createHash('sha256').update(value).digest('hex');

export function validateProjectSecop(secop,files) {
 if(secop===null)return null;
 if(!secop || typeof secop.sourceId!=='string' || !secop.sourceId.trim() || secop.sourceId.length>200 || !object(secop.process) || secop.process.id!==secop.sourceId || !['secop-i','secop-ii'].includes(secop.process.source) || !Array.isArray(secop.alerts) || secop.alerts.length>1000 || !Array.isArray(secop.links) || secop.links.length>5000)invalid();
 const b=secop.baseline;
 if(b!==null && (!object(b) || !object(b.process) || !(b.documents===null || Array.isArray(b.documents)) || typeof b.checkedAt!=='string' || b.checkedAt.length>100 || typeof b.error!=='string' || b.error.length>20000 || (b.documents?.length>5000) || b.documents?.some(item=>!object(item) || typeof item.id!=='string' || typeof item.name!=='string')))invalid();
 const alerts=new Set();
 for(const a of secop.alerts){if(!a || typeof a.id!=='string' || !a.id || a.id.length>256 || alerts.has(a.id) || typeof a.title!=='string' || a.title.length>5000 || typeof a.kind!=='string' || !a.kind || a.kind.length>100 || typeof a.createdAt!=='string' || a.createdAt.length>100 || typeof a.reviewed!=='boolean' || a.previous===undefined || a.current===undefined)invalid();alerts.add(a.id);}
 const fileIds=new Set(files.map(item=>item.id)),links=new Set(),documents=new Set();
 for(const link of secop.links){if(!link || !['document','zip'].includes(link.kind) || typeof link.documentId!=='string' || !link.documentId || link.documentId.length>256 || typeof link.fileId!=='string' || !fileIds.has(link.fileId))invalid();const key=JSON.stringify([link.kind,link.documentId,link.fileId]);if(links.has(key) || (link.kind==='document' && documents.has(link.documentId)))invalid();links.add(key);if(link.kind==='document')documents.add(link.documentId);}
 const details={sourceId:secop.sourceId,process:secop.process,baseline:secop.baseline,alerts:secop.alerts};
 if(JSON.stringify(details).length>3000000)invalid();
 return {details,links:secop.links.map(link=>({kind:link.kind,documentId:link.documentId,sourceKey:hash(link.fileId)}))};
}

export async function checkProjectSecop({secop,files,server,requestId,send}) {
 const data=validateProjectSecop(secop,files);if(!data)return;
 try { await send(`${server}/api/runner/imports/technical-plan/secop-check`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:data.details.process.source,sourceId:data.details.sourceId,requestId})}); }
 catch(error){if(error.status===409)throw new Error('Ya existe un proyecto vinculado a este proceso SECOP en la cuenta de destino (HTTP 409). No se creó ningún proyecto.');throw error;}
}

export async function restoreProjectSecop({secop,files,server,requestId,send}) {
 const data=validateProjectSecop(secop,files);if(!data)return;
 const base=`${server}/api/runner/imports/technical-plan/${requestId}`;
 await send(`${base}/secop`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data.details)});
 if(data.links.length)await send(`${base}/secop-links`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({links:data.links})});
}
