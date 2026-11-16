import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';

export async function restoreLargeProjectFile({url,path,bytes,entry,name,contentType,send,retryDelayMs=1000}) {
 if(bytes!==undefined&&(!Buffer.isBuffer(bytes)||bytes.length!==entry.size))throw new Error('El archivo local cambió durante la recuperación.');
 const base=`${url}/multipart`,metadata={name,contentType,size:entry.size,hash:entry.sha256};
 const start=await send(`${base}/start`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(metadata)});
 if(start.file)return;
 if(typeof start.handle!=='string'||start.partSize!==10*1024*1024)throw new Error('La respuesta de carga multipart no es válida.');
 const parts=[];
 try{
  for(let offset=0,n=1;offset<entry.size;offset+=start.partSize,n++){
   const length=Math.min(start.partSize,entry.size-offset);
   for(let attempt=0;;attempt++){
    const body=bytes===undefined?createReadStream(path,{start:offset,end:offset+length-1}):Readable.from([bytes.subarray(offset,offset+length)]);
    try{const part=await send(`${base}/part/${n}`,{method:'POST',headers:{'x-savia-multipart':start.handle,'content-type':'application/octet-stream'},body,duplex:'half'},300000);if(part.partNumber!==n||typeof part.etag!=='string')throw Object.assign(new Error('La respuesta de una parte no es válida.'),{status:400});parts.push(part);break;}
    catch(error){if(attempt>=2||(error.status && error.status!==408 && error.status!==429 && error.status<500))throw error;await delay(retryDelayMs*(attempt+1));}
    finally{body.destroy();}
   }
  }
  await send(`${base}/complete`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({handle:start.handle,parts})},300000);
 }catch(error){try{await send(`${base}/abort`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({handle:start.handle})});}catch{/* R2 aborts incomplete uploads after its retention period. */}throw error;}
}
