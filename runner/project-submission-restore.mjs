import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const invalid=()=>{throw new Error('El seguimiento de la captura es inválido.');};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9._:-]{1,100}$/.test(x);
const text=(x,max,required=false)=>typeof x==='string'&&x.length<=max&&(!required||!!x.trim());
const stamp=x=>text(x,100,true)&&!/[\x00-\x1f\x7f]/.test(x);
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(`${x}T00:00:00Z`))&&new Date(`${x}T00:00:00Z`).toISOString().slice(0,10)===x;
async function verifyFile(file,key,objects,directory,used){
 const entry=objects.get(key);
 if(!record(entry)||used.has(key)||!text(file.name,1024,true)||!text(file.contentType,200,true)||/[\x00-\x1f\x7f]/.test(file.name+file.contentType)||!stamp(file.createdAt)||!Number.isSafeInteger(file.size)||file.size<0||file.size>256*1024*1024||!/^[a-f0-9]{64}$/.test(file.sha256||'')||entry.size!==file.size||entry.sha256!==file.sha256||typeof entry.file!=='string'||basename(entry.file)!==entry.file)invalid();
 const path=join(directory,entry.file);let stat;try{stat=await lstat(path);}catch{invalid();}if(!stat.isFile()||stat.size!==file.size)invalid();
 const hash=createHash('sha256');try{for await(const chunk of createReadStream(path))hash.update(chunk);}catch{invalid();}if(hash.digest('hex')!==file.sha256)invalid();used.add(key);
}
// Validate all relationships and bytes before any remote mutation.
export async function validateProjectSubmission({submission,objects,directory}){
 if(!record(submission)||!(objects instanceof Map)||typeof directory!=='string')invalid();
 const ids={};for(const kind of ['requests','results','submissions','attachments','evidence']){
  const list=submission[kind],set=new Set();if(!Array.isArray(list)||list.length>10000)invalid();
  for(const item of list){if(!record(item)||!id(item.id)||set.has(item.id))invalid();set.add(item.id);}ids[kind]=set;
 }
 for(const item of submission.requests)if(!['observation','correction'].includes(item.kind)||!text(item.title,300,true)||!(item.dueDate===''||date(item.dueDate))||!text(item.note,20000)||!['pending','reviewed','resolved'].includes(item.status)||!text(item.taskId,256)||!Number.isSafeInteger(item.version)||item.version<1||!stamp(item.createdAt)||!stamp(item.updatedAt))invalid();
 for(const item of submission.results)if(!['awarded','not_awarded','other'].includes(item.result)||!text(item.note,20000)||!stamp(item.createdAt))invalid();
 for(const item of submission.submissions)if(!date(item.date)||!text(item.reference,300,true)||!text(item.version,300,true)||!text(item.note,20000)||!stamp(item.createdAt))invalid();
 const used=new Set(),roles=new Map();
 for(const item of submission.attachments){if(!ids.requests.has(item.requestId))invalid();await verifyFile(item,`submission-attachment:${item.id}`,objects,directory,used);}
 for(const item of submission.evidence){if(!ids.submissions.has(item.submissionId)||!['package','receipt'].includes(item.role))invalid();const set=roles.get(item.submissionId)||new Set();if(set.has(item.role))invalid();set.add(item.role);roles.set(item.submissionId,set);await verifyFile(item,`submission-evidence:${item.id}`,objects,directory,used);}
 for(const item of submission.submissions){const missing=item.missingRoles??[];if(!Array.isArray(missing)||missing.some(role=>!['package','receipt'].includes(role))||new Set(missing).size!==missing.length||['package','receipt'].some(role=>missing.includes(role)===!!roles.get(item.id)?.has(role)))invalid();}
 return used;
}

const digest=value=>createHash('sha256').update(value).digest('hex');
async function uploadFile({server,requestId,kind,file,objects,directory,send}){
 const objectId=`submission-${kind}:${file.id}`,entry=objects.get(objectId),source=digest(`${kind}:${file.id}`),base=`${server}/api/runner/imports/technical-plan/${encodeURIComponent(requestId)}/submission-files/${source}/stage`,json={'content-type':'application/json'};
 const start=await send(`${base}/start`,{method:'POST',headers:json,body:JSON.stringify({size:entry.size,sha256:entry.sha256})});
 if(entry.size===0){if(typeof start?.stagedToken!=='string'||!start.stagedToken)throw new Error('Comprobante de carga inválido.');return start.stagedToken;}
 if(typeof start?.handle!=='string'||start.partSize!==10*1024*1024)throw new Error('Respuesta de carga inválida.');const parts=[];
 try{
  for(let offset=0,n=1;offset<entry.size;offset+=start.partSize,n++)for(let attempt=0;;attempt++){
   const body=createReadStream(join(directory,entry.file),{start:offset,end:Math.min(entry.size,offset+start.partSize)-1});
   try{const part=await send(`${base}/part/${n}`,{method:'POST',headers:{'x-savia-multipart':start.handle,'content-type':'application/octet-stream'},body,duplex:'half'},300000);if(part?.partNumber!==n||typeof part.etag!=='string'||!part.etag)throw Object.assign(new Error('Respuesta de parte inválida.'),{status:400});parts.push(part);break;}
   catch(error){if(attempt>=2||(error.status&&error.status!==408&&error.status!==429&&error.status<500))throw error;await delay((attempt+1)*1000);}finally{body.destroy();}
  }
  const completed=await send(`${base}/complete`,{method:'POST',headers:json,body:JSON.stringify({handle:start.handle,parts})},300000);if(typeof completed?.stagedToken!=='string'||!completed.stagedToken)throw new Error('Comprobante de carga inválido.');return completed.stagedToken;
 }catch(error){try{await send(`${base}/abort`,{method:'POST',headers:json,body:JSON.stringify({handle:start.handle})});}catch{/* La carga incompleta expira en R2. */}throw error;}
}
export async function restoreProjectSubmission({submission,objects,directory,server,requestId,send}){
 await validateProjectSubmission({submission,objects,directory});
 const base=`${server}/api/runner/imports/technical-plan/${encodeURIComponent(requestId)}`,json={'content-type':'application/json'},counts={requests:0,results:0,attachments:0,submissions:0,removed:0},removedRequests=new Set();
 for(const kind of ['requests','results'])for(const item of submission[kind]){
  try{await send(`${base}/submission-tracking/${kind}/${digest(item.id)}`,{method:'POST',headers:json,body:JSON.stringify(item)});counts[kind]++;}
  catch(error){if(error?.status!==410)throw error;counts.removed++;if(kind==='requests')removedRequests.add(item.id);}
 }
 for(const file of submission.attachments){
  if(removedRequests.has(file.requestId)){counts.removed++;continue;}
  const stagedToken=await uploadFile({server,requestId,kind:'attachment',file,objects,directory,send});
  try{await send(`${base}/submission-restores/attachments/${digest(file.id)}`,{method:'POST',headers:json,body:JSON.stringify({file,stagedToken})},300000);counts.attachments++;}catch(error){if(error?.status!==410)throw error;counts.removed++;}
 }
 for(const item of submission.submissions){
  const evidence=[];for(const file of submission.evidence.filter(x=>x.submissionId===item.id)){const stagedToken=await uploadFile({server,requestId,kind:'evidence',file,objects,directory,send});evidence.push({...file,stagedToken});}
  try{await send(`${base}/submission-restores/records/${digest(item.id)}`,{method:'POST',headers:json,body:JSON.stringify({item,evidence})},300000);counts.submissions++;}catch(error){if(error?.status!==410)throw error;counts.removed++;}
 }
 return counts;
}
