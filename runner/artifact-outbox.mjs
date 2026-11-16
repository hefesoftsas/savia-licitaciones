import {createReadStream} from 'node:fs';
import {chmod,link,mkdir,open,readdir,rm,stat} from 'node:fs/promises';
import {createCipheriv,createDecipheriv,hkdfSync,randomBytes,randomUUID} from 'node:crypto';
import {Transform,Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {dirname,isAbsolute,join} from 'node:path';
const pattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,magic=Buffer.from('SAVIAAO1'),maxBytes=1024*1024*1024;
const filename=id=>{if(!pattern.test(id))throw new Error('Identificador de tarea no válido.');return `${id}.bin`;};
export async function hasArtifactOutboxFiles(directory){try{return (await readdir(directory)).some(name=>name.endsWith('.bin')&&pattern.test(name.slice(0,-4)));}catch(error){if(error.code==='ENOENT')return false;throw error;}}
export function createArtifactOutbox({directory,server,runnerId,token}){
 if(!isAbsolute(directory)||!server||!runnerId||typeof token!=='string'||!token)throw new Error('Configuración de recuperación no válida.');
 const key=Buffer.from(hkdfSync('sha256',Buffer.from(token),Buffer.from(server),Buffer.from(`savia-runner-artifact-v1:${runnerId}`),32));
 const aad=id=>Buffer.from(JSON.stringify([1,server,runnerId,id]));
 async function list(){try{return (await readdir(directory)).filter(name=>name.endsWith('.bin')&&pattern.test(name.slice(0,-4))).map(name=>({jobId:name.slice(0,-4),state:'pending'})).sort((a,b)=>a.jobId.localeCompare(b.jobId));}catch(error){if(error.code==='ENOENT')return [];throw error;}}
 async function save(id,source){
  const target=join(directory,filename(id)),info=await stat(source);if(!info.isFile()||info.size<1||info.size>maxBytes)throw new Error('La copia supera el tamaño recuperable.');await mkdir(directory,{recursive:true,mode:0o700});const temporary=join(directory,`.${randomUUID()}.tmp`),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad(id));let file;
  try{file=await open(temporary,'wx',0o600);await file.writeFile(Buffer.concat([magic,iv]));let size=0;const counter=new Transform({transform(chunk,_encoding,done){size+=chunk.length;if(size>maxBytes){done(new Error('La copia supera el tamaño recuperable.'));return;}done(null,chunk);}});await pipeline(createReadStream(source),counter,cipher,new Writable({write(chunk,_encoding,done){file.writeFile(chunk).then(()=>done(),done);}}));if(size!==info.size)throw new Error('La copia cambió durante el cifrado.');await file.writeFile(cipher.getAuthTag());await file.sync();await file.close();file=null;await link(temporary,target);
  }finally{if(file)await file.close().catch(()=>{});await rm(temporary,{force:true});}
 }
 async function exportFile(id,destination){
  if(!isAbsolute(destination))throw new Error('La ruta de exportación debe ser absoluta.');const source=join(directory,filename(id)),input=await open(source,'r');let info,header,tag;
  try{info=await input.stat();if(!info.isFile()||info.size<37||info.size>maxBytes+36)throw new Error('Copia cifrada inválida.');header=Buffer.alloc(20);tag=Buffer.alloc(16);if((await input.read(header,0,20,0)).bytesRead!==20||(await input.read(tag,0,16,info.size-16)).bytesRead!==16||!header.subarray(0,8).equals(magic))throw new Error('Copia cifrada inválida.');}finally{await input.close();}
  const temporary=join(dirname(destination),`.savia-${randomUUID()}.tmp`),decipher=createDecipheriv('aes-256-gcm',key,header.subarray(8));decipher.setAAD(aad(id));decipher.setAuthTag(tag);let file;
  try{file=await open(temporary,'wx',0o600);await pipeline(createReadStream(source,{start:20,end:info.size-17}),decipher,new Writable({write(chunk,_encoding,done){file.writeFile(chunk).then(()=>done(),done);}}));await file.sync();await file.close();file=null;await link(temporary,destination);if(process.platform!=='win32')await chmod(destination,0o600);}finally{if(file)await file.close().catch(()=>{});await rm(temporary,{force:true});}
 }
 return {save,list,export:exportFile,remove:async id=>rm(join(directory,filename(id)),{force:true})};
}
