import {createHash} from 'node:crypto';
import {readFile,lstat,open} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {basename,join} from 'node:path';
import {uploadStagedBlindArtifact} from './project-blind-large-upload.mjs';

const invalid=()=>{throw new Error('Las revisiones anónimas de la captura no son válidas.');};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const text=(value,max=128)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const id=value=>text(value,110)&&/^[A-Za-z0-9._:-]+$/.test(value);

async function materialize(task,kind,objects,directory,used){
 const source=task[kind],key=`blind-${kind}:${task.id}`,entry=objects.get(key),limit=kind==='artifact'&&task.kind!=='blind-check.inspect'?1024*1024*1024:25*1024*1024;
 if(!source||!entry||used.has(key)||!Number.isSafeInteger(source.size)||source.size<1||source.size>limit||entry.size!==source.size||!/^[a-f0-9]{64}$/.test(source.sha256||'')||entry.sha256!==source.sha256||!text(entry.file,200)||basename(entry.file)!==entry.file)invalid();
 const path=join(directory,entry.file);
 if(entry.size>25*1024*1024){const info=await lstat(path);if(!info.isFile()||info.size!==entry.size)invalid();const digest=createHash('sha256');for await(const chunk of createReadStream(path))digest.update(chunk);if(digest.digest('hex')!==entry.sha256)invalid();const file=await open(path,'r'),prefix=Buffer.alloc(4);try{if((await file.read(prefix,0,4,0)).bytesRead!==4)invalid();}finally{await file.close();}used.add(key);return {path,prefix};}
 const bytes=await readFile(path);if(bytes.length!==entry.size||hash(bytes)!==entry.sha256)invalid();
 used.add(key);return bytes;
}

export async function validateProjectBlindTasks({tasks,objects,directory}){
 if(!Array.isArray(tasks)||tasks.length>10000||!(objects instanceof Map))invalid();
 const ids=new Map(),used=new Set();
 for(const task of tasks){
  if(!record(task)||!id(task.id)||ids.has(task.id)||!['blind-check.inspect','blind-check.fix','blind-check.fix-report','blind-check.fix-ai'].includes(task.kind)||!['succeeded','failed','interrupted'].includes(task.state)||!record(task.payload)||!Array.isArray(task.payload.fileIds)||!task.payload.fileIds.length||task.payload.fileIds.length>50||task.payload.fileIds.some(item=>!id(item))||new Set(task.payload.fileIds).size!==task.payload.fileIds.length||!text(task.createdAt,100)||!text(task.updatedAt,100)||(task.result!==null&&!record(task.result)))invalid();
  if(task.kind!=='blind-check.inspect'&&!id(task.payload.inspectionJobId))invalid();
  ids.set(task.id,task);
  if(task.state!=='succeeded'){
   if(task.artifact!==null||task.report!==null||objects.has(`blind-artifact:${task.id}`)||objects.has(`blind-report:${task.id}`))invalid();
   continue;
  }
  const bytes=await materialize(task,'artifact',objects,directory,used);
  if(task.kind==='blind-check.inspect'){
   let report;try{report=JSON.parse(bytes.toString('utf8'));}catch{invalid();}
   if(!record(report)||!record(report.sourceFile)||!id(report.sourceFile.id)||report.sourceFile.id!==(task.payload.bidFileId||task.payload.fileIds[0])||typeof report.sourceFile.name!=='string'||!Array.isArray(report.groups)||!record(report.summary))invalid();
  }else {const prefix=Buffer.isBuffer(bytes)?bytes.subarray(0,4):bytes.prefix;if(prefix.length<4||!prefix.equals(Buffer.from([0x50,0x4b,0x03,0x04])))invalid();}
  if(['blind-check.fix-report','blind-check.fix-ai'].includes(task.kind)&&task.payload.reportVersion===1){
   const bytes=await materialize(task,'report',objects,directory,used);let report;try{report=JSON.parse(bytes.toString('utf8'));}catch{invalid();}
   if(!record(report)||!record(report.after)||!Array.isArray(report.after.groups))invalid();
  }else if(task.report!==null||objects.has(`blind-report:${task.id}`))invalid();
 }
 for(const task of tasks){const parent=ids.get(task.payload.inspectionJobId);if(parent&&parent.kind!=='blind-check.inspect')invalid();}
 return used;
}

export async function restoreProjectBlindTasks({tasks,objects,directory,server,requestId,send}){
 await validateProjectBlindTasks({tasks,objects,directory});
 const inspections=new Set(tasks.filter(task=>task.kind==='blind-check.inspect').map(task=>task.id));
 const ordered=[...tasks.filter(task=>task.kind==='blind-check.inspect'),...tasks.filter(task=>task.kind!=='blind-check.inspect')];
 let imported=0,removed=0;
 for(const task of ordered){
  const form=new FormData(),metadata={...task,...(task.kind==='blind-check.inspect'?{}:{parentExpected:inspections.has(task.payload.inspectionJobId)})},url=`${server}/api/runner/imports/technical-plan/${requestId}/blind-tasks/${hash(Buffer.from(task.id))}`;
  form.set('metadata',JSON.stringify(metadata));
  const used=new Set();
  for(const kind of ['artifact','report'])if(task[kind]){const value=await materialize(task,kind,objects,directory,used);if(Buffer.isBuffer(value))form.set(kind,new Blob([value]),kind);else form.set('stagedArtifact',await uploadStagedBlindArtifact({url,path:value.path,entry:objects.get(`blind-${kind}:${task.id}`),send}));}
  try{await send(url,{method:'POST',body:form},300000);imported++;}
  catch(error){if(error?.status===410){removed++;continue;}throw error;}
 }
 return {imported,removed};
}
