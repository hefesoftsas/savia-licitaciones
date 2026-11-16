import {randomUUID} from 'node:crypto';
import {writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createManagedWorkspace} from './managed-workspaces.mjs';
import {restoreProjectSubmission} from './project-submission-restore.mjs';

export async function transferDesktopSubmission({data,server,token,requestId,send,temporaryRoot=tmpdir()}){
 if(!data)return {requests:0,results:0,attachments:0,submissions:0,removed:0,omittedSubmissions:[],missingFiles:[]};
 const roles=new Map();for(const file of data.evidence){const set=roles.get(file.submissionId)||new Set();set.add(file.role);roles.set(file.submissionId,set);}
 const omittedSubmissions=[],evidence=data.evidence;
 const directory=await createManagedWorkspace(temporaryRoot,'submission-transfer');
 try{
  const objects=new Map();const materialize=async(file,kind)=>{const {bytes,...metadata}=file;if(!Buffer.isBuffer(bytes))throw new Error('Falta el contenido de un archivo de seguimiento.');const name=`${randomUUID()}.bin`;await writeFile(join(directory,name),bytes,{flag:'wx',mode:0o600});objects.set(`submission-${kind}:${file.id}`,{file:name,size:file.size,sha256:file.sha256});return metadata;};
  const attachments=[];for(const file of data.attachments)attachments.push(await materialize(file,'attachment'));
  const restoredEvidence=[];for(const file of evidence)restoredEvidence.push(await materialize(file,'evidence'));
  const submission={requests:data.requests,results:data.results,submissions:data.submissions.map(item=>({...item,missingRoles:['package','receipt'].filter(role=>!roles.get(item.id)?.has(role))})),attachments,evidence:restoredEvidence};
  const transfer=send|| (async(url,options,timeout=60000)=>{const response=await fetch(url,{...options,headers:{authorization:`Bearer ${token}`,...options.headers},redirect:'error',signal:AbortSignal.timeout(timeout)});if(!response.ok)throw Object.assign(new Error(`No se pudo importar el seguimiento (HTTP ${response.status}). Repite el comando para continuar.`),{status:response.status});return response.json();});
  const result=await restoreProjectSubmission({submission,objects,directory,server,requestId,send:transfer});
  return {...result,omittedSubmissions,missingFiles:data.missing.map(({id,ownerId,role,reason})=>({id,ownerId,role,reason}))};
 }finally{await rm(directory,{recursive:true,force:true});}
}
