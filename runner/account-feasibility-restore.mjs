import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {validateAccountFeasibilitySnapshot} from './account-feasibility-validate.mjs';
const sha=data=>createHash('sha256').update(data).digest('hex');
export async function restoreAccountFeasibility({server,token,directory,fetchImpl=fetch,discard=false}){
 const {metadata,manifest}=await validateAccountFeasibilitySnapshot(directory),payload={metadata,manifest},requestId=`snapshot-${sha(JSON.stringify(payload))}`,base=`${server}/api/runner/imports/feasibility-snapshots/${requestId}`;
 const send=async(path,body,json=false)=>{const response=await fetchImpl(base+path,{method:'POST',headers:{authorization:`Bearer ${token}`,...(json?{'content-type':'application/json'}:{})},body:json?JSON.stringify(body):body,redirect:'error',signal:AbortSignal.timeout(300000)});if(!response.ok)throw new Error(`No se pudo ${discard?'descartar':'restaurar'} la captura (HTTP ${response.status}). Identificador: ${requestId}. Repite el comando para continuar.`);return response.json();};
 if(discard)return send('/discard');
 const started=await send('',payload,true);if(started.state==='committed')return {restored:true,omitted:manifest.omitted};
 for(const item of manifest.objects){const bytes=await readFile(join(directory,'objects',item.file));if(bytes.length!==item.size||sha(bytes)!==item.sha256)throw new Error('La captura cambió durante la restauración.');const separator=item.id.indexOf(':'),kind=item.id.slice(0,separator),id=item.id.slice(separator+1);await send(`/objects/${kind}/${encodeURIComponent(id)}`,bytes);}
 await send('/commit');return {restored:true,omitted:manifest.omitted};
}
