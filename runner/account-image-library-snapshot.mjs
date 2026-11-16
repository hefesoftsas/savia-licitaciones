import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {createComponentSnapshot,verifyComponentSnapshot} from './cloud-snapshot-archive.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const missingReasons=['not_found','unsafe_path','empty','too_large','unsupported'];
const invalid=()=>{throw new Error('Captura de la biblioteca de imágenes inválida.');};
function imageType(b){const starts=a=>a.every((v,i)=>b[i]===v);if(starts([137,80,78,71,13,10,26,10]))return 'image/png';if(starts([255,216,255]))return 'image/jpeg';if(starts([71,73,70,56])&&(b[4]===55||b[4]===57)&&b[5]===97)return 'image/gif';if(starts([66,77]))return 'image/bmp';if(starts([82,73,70,70])&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80)return 'image/webp';return '';}
function validate(images){
 if(!Array.isArray(images)||images.length>10000)invalid();const ids=new Set();
 for(const image of images){
  if(!image||typeof image.id!=='string'||!/^[A-Za-z0-9._:-]{1,100}$/.test(image.id)||ids.has(image.id)||typeof image.name!=='string'||!image.name.trim()||image.name.length>255||/[\x00-\x1f\x7f]/.test(image.name)||typeof image.createdAt!=='string'||image.createdAt.length>100||typeof image.contentType!=='string'||!Number.isSafeInteger(image.size)||!/^[a-f0-9]{64}$/.test(image.version||''))invalid();
  if(image.missingReason===null){if(image.size<1||image.size>25*1024*1024||typeof image.etag!=='string'||!image.etag||!['image/png','image/jpeg','image/gif','image/bmp','image/webp'].includes(image.contentType))invalid();}
  else if(!missingReasons.includes(image.missingReason)||image.size!==0||image.etag!==null)invalid();ids.add(image.id);
 }
}
export async function captureAccountImageLibrary({server,token,directory,fetchImpl=fetch}){
 const base=`${server}/api/runner/image-library-captures`;
 const get=async url=>{const response=await fetchImpl(url,{headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(300000)});if(!response.ok)throw new Error(`No se pudo capturar la biblioteca (HTTP ${response.status}).`);return response;};
 const capture=await(await get(base)).json();if(!/^[a-f0-9]{64}$/.test(capture.revision||''))invalid();validate(capture.images);
 const objects=capture.images.filter(x=>x.missingReason===null).map(image=>({id:`image:${image.id}`,size:image.size,open:async()=>{const url=`${base}/images/${encodeURIComponent(image.id)}?etag=${encodeURIComponent(image.etag)}&version=${image.version}`,response=await get(url);if(!response.body)invalid();return Readable.from((async function*(){let header=Buffer.alloc(0);for await(const chunk of Readable.fromWeb(response.body)){if(header.length<16)header=Buffer.concat([header,chunk.subarray(0,16-header.length)]);yield chunk;}if(imageType(header)!==image.contentType)invalid();})());}}));
 return createComponentSnapshot(directory,{metadata:{kind:'account-image-library',images:capture.images},included:['account-image-library'],omitted:['other-account-data','credentials'],objects,beforeCommit:async()=>{const current=await(await get(base)).json();if(current.revision!==capture.revision)throw new Error('La biblioteca cambió durante la captura.');}});
}
export async function restoreAccountImageLibrary({server,token,directory,fetchImpl=fetch}){
 const manifest=await verifyComponentSnapshot(directory);if(manifest.included.length!==1||manifest.included[0]!=='account-image-library')invalid();let data;try{data=JSON.parse(await readFile(join(directory,'metadata.json'),'utf8'));}catch{invalid();}if(data?.kind!=='account-image-library')invalid();validate(data.images);
 const objects=new Map(manifest.objects.map(x=>[x.id,x]));if(objects.size!==data.images.filter(x=>x.missingReason===null).length)invalid();
 for(const image of data.images){if(image.missingReason!==null)continue;const entry=objects.get(`image:${image.id}`);if(!entry||entry.size!==image.size)invalid();const bytes=await readFile(join(directory,'objects',entry.file));if(sha(bytes)!==entry.sha256||imageType(bytes)!==image.contentType)invalid();}
 const requestId=`snapshot-${sha(JSON.stringify({metadataSha256:manifest.metadataSha256,objects:manifest.objects}))}`;let images=0,removed=0;
 for(const image of data.images){
  const form=new FormData(),metadata={sourceId:image.id,name:image.name,createdAt:image.createdAt,...(image.missingReason?{missingReason:image.missingReason}:{})};form.set('metadata',JSON.stringify(metadata));
  if(image.missingReason===null){const entry=objects.get(`image:${image.id}`),bytes=await readFile(join(directory,'objects',entry.file));if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)invalid();form.set('file',new Blob([bytes],{type:image.contentType}),image.name);}
  const response=await fetchImpl(`${server}/api/runner/imports/image-library/${requestId}/${sha(image.id)}`,{method:'POST',headers:{authorization:`Bearer ${token}`},body:form,redirect:'error',signal:AbortSignal.timeout(300000)});if(response.status===410){removed++;continue;}if(!response.ok)throw new Error(`No se pudo recuperar una imagen (HTTP ${response.status}). Repite el comando para continuar.`);images++;
 }
 return {images,removed,omitted:manifest.omitted};
}
