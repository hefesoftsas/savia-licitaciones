import {Readable} from 'node:stream';

// Prepared separately until component capture and restore can include it together.
export async function prepareBlindCapture({server,token,projectId,fetchImpl=fetch}){
 if(typeof projectId!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(projectId))throw new Error('Proyecto inválido.');
 const base=`${server}/api/runner/project-blind-captures/${encodeURIComponent(projectId)}`;
 const request=async url=>{
  const response=await fetchImpl(url,{headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(300000)});
  if(!response.ok)throw new Error(`No se pudieron capturar las revisiones anónimas (HTTP ${response.status}).`);
  return response;
 };
 const capture=await(await request(base)).json();
 if(!/^[a-f0-9]{64}$/.test(capture.revision||'')||!Array.isArray(capture.tasks)||capture.tasks.length>10000)throw new Error('Revisiones anónimas de captura inválidas.');
 const objects=[],ids=new Set();
 for(const task of capture.tasks){
  if(!task||typeof task.id!=='string'||!/^[A-Za-z0-9._:-]{1,110}$/.test(task.id)||ids.has(task.id))throw new Error('Revisión anónima inválida.');
  ids.add(task.id);
  for(const kind of ['artifact','report']){
   const source=task[kind];if(source===null)continue;
   const limit=kind==='artifact'&&task.kind!=='blind-check.inspect'?1024*1024*1024:25*1024*1024;
   if(!source||!Number.isSafeInteger(source.size)||source.size<1||source.size>limit||!/^[a-f0-9]{64}$/.test(source.sha256||'')||typeof source.etag!=='string'||!source.etag||!/^[a-f0-9]{64}$/.test(source.version||''))throw new Error('Archivo de revisión anónima inválido.');
   const url=`${base}/${kind}/${encodeURIComponent(task.id)}?etag=${encodeURIComponent(source.etag)}&version=${source.version}`;
   objects.push({id:`blind-${kind}:${task.id}`,size:source.size,sha256:source.sha256,open:async()=>{const response=await request(url);if(!response.body)throw new Error('No se recibió el archivo de revisión.');return Readable.fromWeb(response.body);}});
  }
 }
 if(objects.length>10000)throw new Error('La captura contiene demasiados archivos de revisión.');
 return {tasks:capture.tasks,objects,async assertUnchanged(){const current=await(await request(base)).json();if(current.revision!==capture.revision)throw new Error('Las revisiones anónimas cambiaron durante la captura.');}};
}
