import {extname} from 'node:path';
function parse(value,label){try{return JSON.parse(value);}catch{throw new Error(`No se puede leer ${label} de una evaluación del respaldo.`);}}
export function readDesktopBidEvaluation(db,files,hasTable,projectId){
 if(!projectId)return {documents:[],runs:[]};
 const documents=hasTable('bid_evaluation_documents')?db.prepare('SELECT * FROM bid_evaluation_documents WHERE project_id=? ORDER BY created_at,rowid').all(projectId).map(row=>{
  const id=String(row.id||''),name=String(row.name||''),ext=extname(name).toLowerCase(),safe=/^[A-Za-z0-9_-]{1,128}$/.test(id),supported=['.pdf','.docx'].includes(ext),bytes=safe&&supported?files.get(`workspace/bid-evaluation-originals/${id}${ext}`):null;
  return {id,name,text:String(row.text||''),createdAt:row.created_at||'',...(bytes?.length&&bytes.length<=25*1024*1024?{bytes}:{missing:true,reason:!safe?'unsafe_id':!supported?'not_recorded':!bytes?'not_found':!bytes.length?'empty':'too_large'})};
 }):[];
 const runs=hasTable('bid_evaluation_runs')?db.prepare('SELECT * FROM bid_evaluation_runs WHERE project_id=? ORDER BY created_at,rowid').all(projectId).map(row=>({id:row.id,status:row.status==='running'?'interrupted':row.status,tenderSources:parse(row.tender_sources_json,'las fuentes'),bidSources:parse(row.bid_sources_json,'las fuentes'),result:row.result_json?parse(row.result_json,'el resultado'):null,error:row.error??null,createdAt:row.created_at||'',updatedAt:row.updated_at||'',reviews:hasTable('bid_evaluation_reviews')?db.prepare('SELECT criterion_id AS criterionId,status,score,note,updated_at AS updatedAt FROM bid_evaluation_reviews WHERE run_id=? ORDER BY rowid').all(row.id):[]})):[];
 return {documents,runs};
}

export async function transferDesktopBidEvaluation({server,token,requestId,projectId,data,fetchImpl=fetch}){
 const {createHash}=await import('node:crypto'),digest=value=>createHash('sha256').update(value).digest('hex'),auth={authorization:`Bearer ${token}`};
 let importedRuns=0,removedRuns=0,importedOriginals=0,importedTexts=0,removedFiles=0;const missingOriginals=[];
 const sendFile=async(key,name,bytes,type)=>{const response=await fetchImpl(`${server}/api/runner/imports/technical-plan/${requestId}/files/${digest(key)}`,{method:'POST',headers:{...auth,'x-file-name':encodeURIComponent(name),'x-content-sha256':digest(bytes),'content-type':type},body:bytes,redirect:'error',signal:AbortSignal.timeout(60000)});if(response.status===410){removedFiles++;return false;}if(!response.ok)throw new Error(`El proyecto ${projectId} se creó, pero no se pudo transferir un documento de evaluación (HTTP ${response.status}). Repite el comando.`);return true;};
 for(const doc of data.documents){
  if(doc.bytes){if(await sendFile(`bid-evaluation-original\0${doc.id}`,doc.name,doc.bytes,/\.pdf$/i.test(doc.name)?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))importedOriginals++;}
  else missingOriginals.push({sourceKey:digest(doc.id),reason:doc.reason});
  if(doc.text){const name=`${doc.name.slice(0,220)} (texto extraído).txt`;if(await sendFile(`bid-evaluation-text\0${doc.id}`,name,Buffer.from(doc.text,'utf8'),'text/plain'))importedTexts++;}
 }
 for(const run of data.runs){const response=await fetchImpl(`${server}/api/runner/imports/technical-plan/${requestId}/bid-evaluations/${digest(run.id)}`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify(run),redirect:'error',signal:AbortSignal.timeout(60000)});if(response.status===410){removedRuns++;continue;}if(!response.ok)throw new Error(`El proyecto ${projectId} se creó, pero no se pudo transferir una evaluación (HTTP ${response.status}). Repite el comando.`);importedRuns++;}
 return {importedRuns,removedRuns,importedOriginals,importedTexts,removedFiles,missingOriginals};
}
