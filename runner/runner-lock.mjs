import {mkdir,readFile,realpath,unlink,rmdir,stat,writeFile} from 'node:fs/promises';
import {basename,dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';

const busy=()=>Object.assign(new Error('Otra instancia usa esta configuración o su bloqueo no puede verificarse. Detén el runner y vuelve a intentar.'),{code:'RUNNER_LOCKED'});
const gone=error=>error?.code==='ENOENT';
function alive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;return true;}}
async function ownerOf(path){
 try{const value=JSON.parse(await readFile(join(path,'owner.json'),'utf8'));return Number.isSafeInteger(value?.pid)&&value.pid>0&&typeof value.id==='string'&&/^[0-9a-f-]{36}$/i.test(value.id)?value:null;}
 catch(error){if(gone(error))return null;throw busy();}
}
async function removeOwned(path,owner){const current=await ownerOf(path);if(!current||current.pid!==owner.pid||current.id!==owner.id)throw busy();try{await unlink(join(path,'owner.json'));await rmdir(path);}catch(error){if(!gone(error))throw busy();}}
async function reap(path){
 const gate=`${path}.reap`;try{await mkdir(gate,{mode:0o700});}catch(error){if(error.code==='EEXIST')throw busy();throw error;}
 try{
  let owner;try{owner=await ownerOf(path);}catch{throw busy();}
  if(owner){if(alive(owner.pid))throw busy();await removeOwned(path,owner);return;}
  let details;try{details=await stat(path);}catch(error){if(gone(error))return;throw error;}
  if(Date.now()-details.mtimeMs<30_000)throw busy();
  try{await rmdir(path);}catch(error){if(!gone(error))throw busy();}
 }finally{try{await rmdir(gate);}catch{/* A failed cleanup is reported on the next attempt. */}}
}
export async function acquireRunnerLock(configPath){
 await mkdir(dirname(configPath),{recursive:true,mode:0o700});let canonical;try{canonical=await realpath(configPath);}catch(error){if(!gone(error))throw error;canonical=join(await realpath(dirname(configPath)),basename(configPath));}const path=`${canonical}.lock`,owner={pid:process.pid,id:randomUUID()};
 try{await mkdir(path,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;await reap(path);try{await mkdir(path,{mode:0o700});}catch(next){if(next.code==='EEXIST')throw busy();throw next;}}
 try{await writeFile(join(path,'owner.json'),JSON.stringify(owner),{encoding:'utf8',flag:'wx',mode:0o600});}catch(error){try{await rmdir(path);}catch{/* Do not delete files that we did not create. */}throw error;}
 let released=false;return async()=>{if(released)return;await removeOwned(path,owner);released=true;};
}
