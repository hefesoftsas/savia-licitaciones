const partSize=10*1024*1024,maxSize=1024*1024*1024;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function uploadLargeProjectFile({projectId,file,key,request,retryDelay=wait,onProgress=()=>{}}){
 if(file.size>maxSize)throw new Error('El documento supera 1 GiB.');
 const base=`/api/projects/${encodeURIComponent(projectId)}/files/multipart`;
 const start=await request(`${base}/start`,{method:'POST',json:{name:file.name,contentType:file.type||'application/octet-stream',size:file.size,requestKey:key}});
 if(typeof start?.handle!=='string'||start.partSize!==partSize)throw new Error('Respuesta de carga inválida.');
 const parts=[];try{
  for(let offset=0,n=1;offset<file.size;offset+=partSize,n++){
   for(let attempt=0;;attempt++){
    try{const part=await request(`${base}/part/${n}`,{method:'POST',headers:{'x-savia-multipart':start.handle,'content-type':'application/octet-stream'},body:file.slice(offset,Math.min(file.size,offset+partSize))});if(part?.partNumber!==n||typeof part.etag!=='string'||!part.etag)throw Object.assign(new Error('Respuesta de parte inválida.'),{status:400});parts.push(part);onProgress(Math.min(file.size,offset+partSize),file.size);break;}
    catch(error){if(attempt>=2||(error.status&&error.status!==408&&error.status!==429&&error.status<500))throw error;await retryDelay((attempt+1)*1000);}
   }
  }
  return await request(`${base}/complete`,{method:'POST',json:{handle:start.handle,parts}});
 }catch(error){try{await request(`${base}/abort`,{method:'POST',json:{handle:start.handle}});}catch{/* Multipart expiration handles an interrupted connection. */}throw error;}
}
