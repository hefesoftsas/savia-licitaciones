import {createReadStream} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
export async function uploadStagedBlindArtifact({url,path,entry,send,retryDelay=delay}){
 const base=`${url}/large-artifact`,start=await send(`${base}/start`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({size:entry.size,sha256:entry.sha256})});
 if(typeof start?.handle!=='string'||start.partSize!==10*1024*1024)throw new Error('Respuesta de carga inválida.');const parts=[];
 try{for(let offset=0,n=1;offset<entry.size;offset+=start.partSize,n++){for(let attempt=0;;attempt++){const body=createReadStream(path,{start:offset,end:Math.min(entry.size,offset+start.partSize)-1});try{const part=await send(`${base}/part/${n}`,{method:'POST',headers:{'x-savia-multipart':start.handle,'content-type':'application/octet-stream'},body,duplex:'half'},300000);if(part?.partNumber!==n||typeof part.etag!=='string'||!part.etag)throw Object.assign(new Error('Respuesta de parte inválida.'),{status:400});parts.push(part);break;}catch(error){if(attempt>=2||(error.status&&error.status!==408&&error.status!==429&&error.status<500))throw error;await retryDelay((attempt+1)*1000);}finally{body.destroy();}}}
  const result=await send(`${base}/complete`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({handle:start.handle,parts})},300000);if(typeof result?.stagedToken!=='string'||!result.stagedToken)throw new Error('Comprobante de carga inválido.');return result.stagedToken;
 }catch(error){try{await send(`${base}/abort`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({handle:start.handle})});}catch{/* R2 expires incomplete uploads. */}throw error;}
}
