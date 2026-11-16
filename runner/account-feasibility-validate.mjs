import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {verifyComponentSnapshot} from './cloud-snapshot-archive.mjs';
import {validateFeasibilitySnapshotMetadata,feasibilityImageType} from './feasibility-snapshot-contract.mjs';
const invalid=()=>{throw new Error('La captura de viabilidad no es compatible o contiene referencias inválidas.');};
export async function validateAccountFeasibilitySnapshot(directory){
 const manifest=await verifyComponentSnapshot(directory);let metadata;try{metadata=JSON.parse(await readFile(join(directory,'metadata.json'),'utf8'));}catch{invalid();}
 const {objectRows,historical,assets,texts,images}=validateFeasibilitySnapshotMetadata(metadata,manifest);
 for(const [kind,rows] of [['asset',assets],['image',images]])for(const row of rows){const entry=objectRows.get(`${kind}:${row.id}`),bytes=await readFile(join(directory,'objects',entry.file));if(feasibilityImageType(bytes)!==row.content_type)invalid();}
 for(const [kind,rows] of [['historical',historical],['text',texts]])for(const row of rows){const entry=objectRows.get(`${kind}:${row[kind==='historical'?'source_key':'id']}`);if(entry)try{new TextDecoder('utf-8',{fatal:true}).decode(await readFile(join(directory,'objects',entry.file)));}catch{invalid();}}
 return {manifest,metadata};
}
