import {Readable} from 'node:stream';

export async function prepareAccountCompanyProfileCapture({server,token,fetchImpl=fetch}){
 const base=`${server}/api/runner/company-profile-captures`;
 const request=async url=>{const response=await fetchImpl(url,{headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(300000)});if(!response.ok)throw new Error(`No se pudo capturar el perfil (HTTP ${response.status}).`);return response;};
 const capture=await(await request(base)).json();
 if(!/^[a-f0-9]{64}$/.test(capture.revision||'')||!(capture.profile===null||(capture.profile&&typeof capture.profile==='object'&&!Array.isArray(capture.profile)&&capture.profile.profile&&typeof capture.profile.profile==='object'&&!Array.isArray(capture.profile.profile)&&typeof capture.profile.updatedAt==='string'&&!!capture.profile.updatedAt))||!Array.isArray(capture.images)||capture.images.length>10000)throw new Error('Perfil de captura inválido.');
 const objects=[],ids=new Set();
 for(const image of capture.images){
  if(!image||typeof image.id!=='string'||!/^[A-Za-z0-9._:-]{1,106}$/.test(image.id)||ids.has(image.id)||typeof image.name!=='string'||!image.name.trim()||image.name.length>255||/[\x00-\x1f\x7f]/.test(image.name)||typeof image.customName!=='string'||image.customName.length>20000||typeof image.fieldKey!=='string'||!image.fieldKey||image.fieldKey.length>200||typeof image.contentType!=='string'||!image.contentType||!Number.isSafeInteger(image.size)||image.size<1||image.size>25*1024*1024||!Number.isSafeInteger(image.sortOrder)||image.sortOrder<0||image.sortOrder>1000000||typeof image.createdAt!=='string'||!image.createdAt||image.createdAt.length>100||typeof image.etag!=='string'||!image.etag||!/^[a-f0-9]{64}$/.test(image.version||''))throw new Error('Imagen de perfil inválida.');
  ids.add(image.id);const url=`${base}/images/${encodeURIComponent(image.id)}?etag=${encodeURIComponent(image.etag)}&version=${image.version}`;
  objects.push({id:`company-profile-image:${image.id}`,size:image.size,open:async()=>{const response=await request(url);if(!response.body)throw new Error('No se recibió la imagen del perfil.');return Readable.fromWeb(response.body);}});
 }
 return {profile:capture.profile,images:capture.images,objects,async assertUnchanged(){const current=await(await request(base)).json();if(current.revision!==capture.revision)throw new Error('El perfil cambió durante la captura.');}};
}
