import {Readable} from 'node:stream';

// Kept separate until the matching restore protocol is ready.
export async function prepareSubmissionCapture({server,token,projectId,fetchImpl=fetch}){
 const validId=id=>typeof id==='string'&&/^[A-Za-z0-9._:-]{1,100}$/.test(id);
 if(typeof projectId!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(projectId))throw new Error('Proyecto inválido.');
 const base=`${server}/api/runner/project-submission-captures/${encodeURIComponent(projectId)}`;
 const request=async url=>{const response=await fetchImpl(url,{headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(300000)});if(!response.ok)throw new Error(`No se pudo capturar el seguimiento (HTTP ${response.status}).`);return response;};
 const capture=await(await request(base)).json();
 if(!capture||!/^[a-f0-9]{64}$/.test(capture.revision||''))throw new Error('Seguimiento de captura inválido.');
 const ids={};for(const kind of ['requests','results','submissions','attachments','evidence']){
  const list=capture[kind],set=new Set();if(!Array.isArray(list)||list.length>10000)throw new Error('Seguimiento de captura inválido.');
  for(const row of list){if(!row||!validId(row.id)||set.has(row.id))throw new Error('Registro de captura inválido.');set.add(row.id);}ids[kind]=set;
 }
 const objects=[],roles=new Map();
 for(const kind of ['attachments','evidence'])for(const file of capture[kind]){
  if(kind==='attachments'&&!ids.requests.has(file.requestId))throw new Error('Adjunto sin solicitud.');
  if(kind==='evidence'){
   if(!ids.submissions.has(file.submissionId)||!['package','receipt'].includes(file.role))throw new Error('Evidencia sin presentación.');
   const set=roles.get(file.submissionId)||new Set();if(set.has(file.role))throw new Error('Evidencia duplicada.');set.add(file.role);roles.set(file.submissionId,set);
  }
  if(!Number.isSafeInteger(file.size)||file.size<0||file.size>256*1024*1024||!/^[a-f0-9]{64}$/.test(file.sha256||'')||typeof file.etag!=='string'||!file.etag||!/^[a-f0-9]{64}$/.test(file.version||''))throw new Error('Archivo de seguimiento inválido.');
  const url=`${base}/${kind}/${encodeURIComponent(file.id)}?etag=${encodeURIComponent(file.etag)}&version=${file.version}`;
  objects.push({id:`submission-${kind==='attachments'?'attachment':'evidence'}:${file.id}`,size:file.size,sha256:file.sha256,open:async()=>{const response=await request(url);if(!response.body)throw new Error('No se recibió el archivo de seguimiento.');return Readable.fromWeb(response.body);}});
 }
 for(const item of capture.submissions){const missing=item.missingRoles??[];if(!Array.isArray(missing)||missing.some(role=>!['package','receipt'].includes(role))||new Set(missing).size!==missing.length||['package','receipt'].some(role=>missing.includes(role)===!!roles.get(item.id)?.has(role)))throw new Error('Presentación con evidencias inconsistentes.');}
 return {...capture,objects,async assertUnchanged(){const current=await(await request(base)).json();if(current.revision!==capture.revision)throw new Error('El seguimiento cambió durante la captura.');}};
}
