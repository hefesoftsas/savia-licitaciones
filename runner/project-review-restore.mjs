import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {basename,join} from 'node:path';
const invalid=()=>{throw new Error('Los informes de la captura no son válidos.');};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),id=x=>typeof x==='string'&&/^[A-Za-z0-9._:-]{1,110}$/.test(x),stamp=x=>typeof x==='string'&&x.length>0&&x.length<=100&&!/[\x00-\x1f\x7f]/.test(x);
const sections={rejection:'rejectionCheckResult',typo:'typoCheckResult',logic:'logicCheckResult'};
async function materialize(task,objects,directory,used){
 const source=task.artifact,key=`review-artifact:${task.id}`,entry=objects.get(key);
 if(!record(source)||!entry||used.has(key)||!Number.isSafeInteger(source.size)||source.size<1||source.size>25*1024*1024||entry.size!==source.size||!/^[a-f0-9]{64}$/.test(source.sha256||'')||entry.sha256!==source.sha256||typeof entry.file!=='string'||basename(entry.file)!==entry.file)invalid();
 const bytes=await readFile(join(directory,entry.file));if(bytes.length!==entry.size||hash(bytes)!==entry.sha256)invalid();used.add(key);return bytes;
}
export async function validateProjectReviewTasks({tasks,objects,directory}){
 if(!Array.isArray(tasks)||tasks.length>10000||!(objects instanceof Map))invalid();const ids=new Set(),used=new Set();
 for(const task of tasks){
  if(!record(task)||!id(task.id)||ids.has(task.id)||!['duplicate-check.analyze','rejection-check.analyze','rejection-check.extract'].includes(task.kind)||!['succeeded','failed','interrupted'].includes(task.state)||!record(task.payload)||!Array.isArray(task.payload.fileIds)||!task.payload.fileIds.length||task.payload.fileIds.length>50||task.payload.fileIds.some(item=>!id(item))||new Set(task.payload.fileIds).size!==task.payload.fileIds.length||!stamp(task.createdAt)||!stamp(task.updatedAt)||(task.result!==null&&!record(task.result))||!Array.isArray(task.removals)||task.removals.length>10000)invalid();
  ids.add(task.id);for(const key of ['tenderFileIds','bidFileIds'])if(task.payload[key]!==undefined&&(!Array.isArray(task.payload[key])||task.payload[key].some(value=>!task.payload.fileIds.includes(value))))invalid();
  const needsArtifact=task.state==='succeeded'&&task.kind!=='rejection-check.extract';
  if(task.state==='succeeded'&&task.kind==='rejection-check.extract'&&(typeof task.result?.criteria!=='string'||task.result.criteria.length>200000))invalid();
  let report=null;
  if(needsArtifact){const bytes=await materialize(task,objects,directory,used);try{report=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{invalid();}if(!record(report)||typeof report.status!=='string'||!Array.isArray(report.sourceFiles))invalid();}
  else if(task.artifact!==null||objects.has(`review-artifact:${task.id}`))invalid();
  if((task.kind!=='rejection-check.analyze'||!needsArtifact)&&task.removals.length)invalid();
  const seen=new Set();for(const item of task.removals){if(!record(item)||!Object.hasOwn(sections,item.section)||typeof item.findingId!=='string'||!item.findingId||item.findingId.length>256||!stamp(item.createdAt))invalid();const key=JSON.stringify([item.section,item.findingId]);if(seen.has(key))invalid();seen.add(key);const findings=report?.[sections[item.section]]?.findings;if(!Array.isArray(findings)||findings.filter(finding=>finding?.id===item.findingId).length!==1)invalid();}
 }
 return used;
}
export async function restoreProjectReviewTasks({tasks,objects,directory,server,requestId,send}){
 await validateProjectReviewTasks({tasks,objects,directory});let imported=0,removed=0;
 for(const task of tasks){const form=new FormData();form.set('metadata',JSON.stringify(task));if(task.artifact){const bytes=await materialize(task,objects,directory,new Set());form.set('artifact',new Blob([bytes]),'artifact');}
  try{await send(`${server}/api/runner/imports/technical-plan/${requestId}/review-tasks/${hash(task.id)}`,{method:'POST',body:form},300000);imported++;}catch(error){if(error?.status===410){removed++;continue;}throw error;}}
 return {imported,removed};
}
