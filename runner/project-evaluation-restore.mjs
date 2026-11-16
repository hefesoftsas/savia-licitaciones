import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validBidEvaluation} from './bid-evaluation-import-contract.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const invalid=()=>{throw new Error('Las evaluaciones de la captura no son válidas.');};
async function materialize(item,objects,directory){
 if(!item || typeof item.id!=='string' || !/^[A-Za-z0-9._:-]{1,117}$/.test(item.id) || !['completed','error','interrupted'].includes(item.status) || !Array.isArray(item.reviews))invalid();
 const entry=objects.get(`evaluation:${item.id}`);let data={tenderSources:[],bidSources:[],result:null};
 if(item.status==='completed'){
  if(!item.source||!entry||entry.size!==item.source.size||entry.size>25*1024*1024||entry.sha256!==item.source.sha256)invalid();
  const bytes=await readFile(join(directory,entry.file));if(bytes.length!==entry.size||hash(bytes)!==entry.sha256)invalid();
  try{data=JSON.parse(bytes.toString('utf8'));}catch{invalid();}
 }else if(item.source!==null||entry)invalid();
 const input={id:`capture-evaluation:${item.id}`,status:item.status,createdAt:item.createdAt,updatedAt:item.updatedAt,error:item.error,tenderSources:data?.tenderSources,bidSources:data?.bidSources,result:data?.result,reviews:item.reviews};
 if(!validBidEvaluation(input)||JSON.stringify(input).length>20_000_000)invalid();return input;
}
export async function validateProjectEvaluations({evaluations,objects,directory}){
 if(!Array.isArray(evaluations)||evaluations.length>10000)invalid();const ids=new Set(),used=new Set();
 for(const item of evaluations){if(ids.has(item?.id))invalid();ids.add(item?.id);await materialize(item,objects,directory);if(item.source)used.add(`evaluation:${item.id}`);}
 return used;
}
export async function restoreProjectEvaluations({evaluations,objects,directory,server,requestId,send}){
 for(const item of evaluations){const input=await materialize(item,objects,directory);await send(`${server}/api/runner/imports/technical-plan/${requestId}/bid-evaluations/${hash(input.id)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});}
}
