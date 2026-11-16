import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const hash=value=>createHash('sha256').update(value).digest('hex');
const text=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||value.length>0);
const invalid=()=>{throw new Error('Las comparaciones RUP de la captura no son válidas.');};
const fields=new Set(['factId','label','value','page','title','source','operator','threshold','interpretedValue','documentsHash','updatedAt','certificateName','issuedOn']);
export function validateProjectComparisons(comparisons,workflow,objects){
 if(!Array.isArray(comparisons)||comparisons.length>10000)invalid();
 const seen=new Set(),requirements=new Set(workflow.requirements.map(item=>item.id)),used=new Set();
 for(const item of comparisons){
  const s=item?.snapshot;
  if(!item||!text(item.id,117,true)||!/^[A-Za-z0-9._:-]+$/.test(item.id)||seen.has(item.id)||!(item.requirementId===null||requirements.has(item.requirementId))||!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(key=>!fields.has(key))||!text(s.factId,256,true)||!Number.isSafeInteger(s.page)||s.page<1||!text(s.certificateName,255)||!text(s.issuedOn,100))invalid();
  for(const field of ['label','value','title','source','operator','threshold','interpretedValue','documentsHash','updatedAt'])if(!text(s[field],field==='source'?20000:1000))invalid();
  seen.add(item.id);const objectId=`comparison:${item.id}`,entry=objects.get(objectId);
  if(item.source){if(item.missingReason!==null||!entry||entry.size!==item.source.size||entry.size>25*1024*1024)invalid();used.add(objectId);}
  else if(item.source!==null||entry||!['not_found','too_large','unsafe_path'].includes(item.missingReason))invalid();
 }
 return used;
}
export async function restoreProjectComparisons({comparisons,workflow,objects,directory,server,requestId,send}){
 validateProjectComparisons(comparisons,workflow,objects);
 const requirements=new Set(workflow.requirements.map(item=>item.id));
 for(const item of comparisons){
  let requirementId=item.requirementId;
  if(requirementId===null){let n=0;do{requirementId=`unlinked:${hash(`${item.id}:${n++}`)}`;}while(requirements.has(requirementId));}
  const s=item.snapshot,sourceId=`capture-comparison:${item.id}`,certificate={name:s.certificateName,issuedOn:s.issuedOn,...(!item.source?{reason:item.missingReason}:{})};
  const {certificateName,issuedOn,...fields}=s,form=new FormData();
  form.set('metadata',JSON.stringify({...fields,requirementId,sourceId,certificate}));
  if(item.source){const entry=objects.get(`comparison:${item.id}`),bytes=await readFile(join(directory,entry.file));if(bytes.length!==entry.size||hash(bytes)!==entry.sha256)throw new Error('La fuente de comparación cambió durante la recuperación.');form.set('pdf',new Blob([bytes],{type:'application/pdf'}),'rup.pdf');}
  await send(`${server}/api/runner/imports/technical-plan/${requestId}/rup-comparisons/${hash(sourceId)}`,{method:'POST',body:form});
 }
}
