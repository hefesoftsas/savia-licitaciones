import {createHash} from 'node:crypto';
import {extname} from 'node:path';
import {transferDesktopPlanDocument} from './desktop-plan-documents.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const types={'.pdf':'application/pdf','.txt':'text/plain','.md':'text/markdown','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.doc':'application/msword','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.xls':'application/vnd.ms-excel','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
export async function transferDesktopOfferDocuments({data,workflow,supports=[],server,token,requestId,transferFile=transferDesktopPlanDocument,send}){
 const result={importedFiles:0,documents:0,links:0,packageItems:0,missingFiles:[],removedFiles:[]};if(!data)return result;
 if(!Array.isArray(data.documents)||!Array.isArray(data.links)||!Array.isArray(data.orphanLinks)||!Array.isArray(data.presentation)||!Array.isArray(supports))throw new Error('Los documentos de oferta del respaldo no son válidos.');
 const docs=new Map(),requirements=new Set((workflow?.requirements||[]).map(item=>item.id)),supportMap=new Map(supports.map(item=>[item.id,item.requirementId])),documents=[];
 for(const doc of data.documents){if(!doc||typeof doc.id!=='string'||!doc.id||docs.has(doc.id)||typeof doc.name!=='string'||!doc.name.trim())throw new Error('Los documentos de oferta del respaldo no son válidos.');docs.set(doc.id,doc);if(!doc.missing&&(!Buffer.isBuffer(doc.bytes)||doc.bytes.length!==doc.size||hash(doc.bytes)!==doc.sha256))throw new Error('La integridad de un documento de oferta no coincide.');}
 for(const doc of data.documents){let reason=doc.missing?doc.reason:null;const unsupported=doc.name.length>255||/[\x00-\x1f\x7f]/.test(doc.name);if(!reason&&unsupported)reason='unsupported_name';let fileSourceKey=null;
  if(reason)result.missingFiles.push({id:doc.id,reason});else{fileSourceKey=hash(`offer-document:${doc.id}`);const status=await transferFile({server,token,requestId,sourceKey:fileSourceKey,name:doc.name,contentType:types[extname(doc.name).toLowerCase()]||'application/octet-stream',bytes:doc.bytes});if(status==='removed')result.removedFiles.push(doc.id);else result.importedFiles++;}
  documents.push({id:doc.id,name:doc.name,kind:doc.kind,createdAt:doc.createdAt,fileSourceKey,missingReason:reason});
 }
 const links=[...data.links,...data.orphanLinks].map(link=>({documentId:link.documentId,requirementId:link.requirementId,supportId:link.supportId,unresolvedDocument:!docs.has(link.documentId),unresolvedRequirement:!requirements.has(link.requirementId),unresolvedSupport:supportMap.get(link.supportId)!==link.requirementId}));
 const missingDocs=new Set(documents.filter(doc=>doc.missingReason).map(doc=>doc.id));
 const presentation=data.presentation.map(item=>({id:item.id,documentId:item.documentId,unresolvedDocument:!docs.has(item.documentId),sortOrder:item.sortOrder,size:item.size,digest:item.digest,state:!docs.has(item.documentId)||missingDocs.has(item.documentId)?'missing':item.state,reviewRequired:item.reviewRequired}));
 if(!documents.length&&!links.length&&!presentation.length)return result;
 const transfer=send||(async(url,options)=>{const response=await fetch(url,{...options,headers:{authorization:`Bearer ${token}`,...options.headers},redirect:'error',signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`No se pudieron importar los documentos de oferta (HTTP ${response.status}). Repite el comando para continuar.`);return response.json();});
 await transfer(`${server}/api/runner/imports/technical-plan/${encodeURIComponent(requestId)}/offer-documents`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({documents,links,presentation})});result.documents=documents.length;result.links=links.length;result.packageItems=presentation.length;return result;
}
