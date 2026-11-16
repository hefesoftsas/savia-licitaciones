import {mkdtemp,writeFile,readdir,readFile,lstat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const prefix='savia-local-task-',marker='.savia-owner.json';
export async function createManagedWorkspace(root=tmpdir(),kind='task'){
 if(typeof kind!=='string'||!/^[a-z-]{1,40}$/.test(kind))throw new Error('Tipo de espacio temporal inválido.');
 const directory=await mkdtemp(join(root,prefix));
 try{await writeFile(join(directory,marker),JSON.stringify({format:1,pid:process.pid,kind}),{encoding:'utf8',flag:'wx',mode:0o600});return directory;}
 catch(error){await rm(directory,{recursive:true,force:true}).catch(()=>{});throw error;}
}
function processAlive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
export async function cleanupOrphanedWorkspaces(root=tmpdir(),{minAgeMs=3600000,now=Date.now(),isAlive=processAlive}={}){
 const result={removed:0,failed:0};let entries;try{entries=await readdir(root,{withFileTypes:true});}catch{return {...result,failed:1};}
 for(const entry of entries){
  if(!entry.isDirectory()||!/^savia-local-task-[A-Za-z0-9]{6}$/.test(entry.name))continue;
  const directory=join(root,entry.name),path=join(directory,marker);let metadata,owner;
  try{metadata=await lstat(path);if(!metadata.isFile()||now-metadata.mtimeMs<minAgeMs)continue;if(typeof process.getuid==='function'&&metadata.uid!==process.getuid())continue;owner=JSON.parse(await readFile(path,'utf8'));}catch{continue;}
  if(owner?.format!==1||!Number.isSafeInteger(owner.pid)||owner.pid<1||typeof owner.kind!=='string'||!/^[a-z-]{1,40}$/.test(owner.kind))continue;
  try{if(await isAlive(owner.pid))continue;}catch{continue;}
  try{await rm(directory,{recursive:true,force:true});result.removed++;}catch{result.failed++;}
 }
 return result;
}
