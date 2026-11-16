import {Readable} from 'node:stream';

// Prepared separately until both component capture and restore are available.
export async function prepareReviewCapture({server,token,projectId,fetchImpl=fetch}){
 if(typeof projectId!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(projectId))throw new Error('Proyecto inválido.');
 const base=`${server}/api/runner/project-review-captures/${encodeURIComponent(projectId)}`;
 const request=async url=>{const response=await fetchImpl(url,{headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(300000)});if(!response.ok)throw new Error(`No se pudieron capturar los informes (HTTP ${response.status}).`);return response;};
 const capture=await(await request(base)).json();
 if(!/^[a-f0-9]{64}$/.test(capture.revision||'')||!Array.isArray(capture.tasks)||capture.tasks.length>10000)throw new Error('Informes de captura inválidos.');
 const objects=[],ids=new Set();
 for(const task of capture.tasks){
  if(!task||typeof task.id!=='string'||!/^[A-Za-z0-9._:-]{1,110}$/.test(task.id)||ids.has(task.id))throw new Error('Informe de captura inválido.');ids.add(task.id);
  const source=task.artifact;if(source===null)continue;
  if(!source||!Number.isSafeInteger(source.size)||source.size<1||source.size>25*1024*1024||!/^[a-f0-9]{64}$/.test(source.sha256||'')||typeof source.etag!=='string'||!source.etag||!/^[a-f0-9]{64}$/.test(source.version||''))throw new Error('Archivo de informe inválido.');
  const url=`${base}/artifact/${encodeURIComponent(task.id)}?etag=${encodeURIComponent(source.etag)}&version=${source.version}`;
  objects.push({id:`review-artifact:${task.id}`,size:source.size,sha256:source.sha256,open:async()=>{const response=await request(url);if(!response.body)throw new Error('No se recibió el informe.');return Readable.fromWeb(response.body);}});
 }
 return {tasks:capture.tasks,objects,async assertUnchanged(){const current=await(await request(base)).json();if(current.revision!==capture.revision)throw new Error('Los informes cambiaron durante la captura.');}};
}
