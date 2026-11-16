import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {TaskInputError} from './task-errors.mjs';
const partSize=10*1024*1024,maxSize=1024*1024*1024;
export async function uploadLargeArtifact({server,token,jobId,lease,path,signal,fetchImpl=fetch,retryDelay=delay}){
 const info=await stat(path);if(!info.isFile()||info.size<=25*1024*1024||info.size>maxSize)throw new TaskInputError('La copia corregida supera el tamaño permitido.');
 const hash=createHash('sha256'),source=createReadStream(path,{signal});for await(const chunk of source){signal?.throwIfAborted();hash.update(chunk);}const sha256=hash.digest('hex'),base=`${server}/api/runner/jobs/${encodeURIComponent(jobId)}/artifact-multipart`;
 const send=async(action,options={})=>{const response=await fetchImpl(`${base}/${action}`,{...options,method:'POST',headers:{authorization:`Bearer ${token}`,'x-savia-lease':lease,...options.headers},redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(300000)]):AbortSignal.timeout(300000)});if(!response.ok)throw Object.assign(new Error(`El servidor rechazó la copia (${response.status}).`),{status:response.status});return response.json();};
 const confirmed=value=>{if(!value||typeof value.id!=='string'||!value.id||value.id.length>128||value.size!==info.size)throw Object.assign(new Error('Confirmación de archivo inválida.'),{status:400});return value;};
 let start;for(let attempt=0;;attempt++){try{start=await send('start',{headers:{'content-type':'application/json'},body:JSON.stringify({size:info.size,sha256})});break;}catch(error){if(signal?.aborted||attempt>=2||(error.status&&error.status!==408&&error.status!==429&&error.status<500))throw error;await retryDelay((attempt+1)*1000,undefined,signal?{signal}:undefined);}}if(start.artifact)return confirmed(start.artifact);if(typeof start.handle!=='string'||start.partSize!==partSize)throw new Error('Respuesta de carga inválida.');
 const parts=[];try{for(let offset=0,n=1;offset<info.size;offset+=partSize,n++){
  for(let attempt=0;;attempt++){signal?.throwIfAborted();const body=createReadStream(path,{start:offset,end:Math.min(info.size,offset+partSize)-1,signal});try{const part=await send(`part/${n}`,{headers:{'x-savia-multipart':start.handle,'content-type':'application/octet-stream'},body,duplex:'half'});if(part?.partNumber!==n||typeof part.etag!=='string'||!part.etag)throw Object.assign(new Error('Respuesta de parte inválida.'),{status:400});parts.push(part);break;}catch(error){if(signal?.aborted||attempt>=2||(error.status&&error.status!==408&&error.status!==429&&error.status<500))throw error;await retryDelay((attempt+1)*1000,undefined,signal?{signal}:undefined);}finally{body.destroy();}}
 }try{return confirmed((await send('complete',{headers:{'content-type':'application/json'},body:JSON.stringify({handle:start.handle,parts})})).artifact);}catch(error){
  if(signal?.aborted||(error.status&&error.status<500&&error.status!==408&&error.status!==429))throw error;
  for(let attempt=0;attempt<3;attempt++){try{const status=await send('status',{headers:{'content-type':'application/json'},body:JSON.stringify({size:info.size,sha256})});if(status.artifact)return confirmed(status.artifact);}catch(statusError){if(signal?.aborted||(statusError.status&&statusError.status!==404&&statusError.status!==408&&statusError.status!==429&&statusError.status<500))throw statusError;}if(attempt<2)await retryDelay(1000,undefined,signal?{signal}:undefined);}throw error;
 }
 }catch(error){try{await send('abort',{headers:{'content-type':'application/json'},body:JSON.stringify({handle:start.handle})});}catch{/* The incomplete upload expires in R2. */}throw error;}
}
