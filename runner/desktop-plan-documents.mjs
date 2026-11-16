import {createHash} from 'node:crypto';
import {restoreLargeProjectFile} from './project-multipart-restore.mjs';

export async function transferDesktopPlanDocument({server,token,requestId,sourceKey,name,contentType,bytes,fetchImpl=fetch}) {
 const url=`${server}/api/runner/imports/technical-plan/${requestId}/files/${sourceKey}`;
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const send=async(target,options,timeout=60000)=>{
  const response=await fetchImpl(target,{...options,headers:{authorization:`Bearer ${token}`,...options.headers},redirect:'error',signal:AbortSignal.timeout(timeout)});
  if(!response.ok){const error=new Error(`HTTP ${response.status}`);error.status=response.status;throw error;}
  return response.json();
 };
 try{
  if(bytes.length>50*1024*1024)await restoreLargeProjectFile({url,bytes,entry:{size:bytes.length,sha256},name,contentType,send});
  else {
   const headers={'x-file-name':encodeURIComponent(name),'x-content-sha256':sha256,'content-type':contentType};
   if(bytes.length>25*1024*1024)headers['x-savia-stream-size']=String(bytes.length);
   await send(url,{method:'POST',headers,body:bytes},bytes.length>25*1024*1024?300000:60000);
  }
  return 'imported';
 }catch(error){if(error.status===410)return 'removed';throw error;}
}
