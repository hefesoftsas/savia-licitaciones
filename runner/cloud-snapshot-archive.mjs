import {mkdir,open,readFile,readdir,lstat,rm,rmdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Transform,Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const hashPattern=/^[a-f0-9]{64}$/,filePattern=/^[a-f0-9-]{36}\.bin$/,idPattern=/^[A-Za-z0-9._:-]{1,128}$/,labelPattern=/^[a-z][a-z0-9-]{0,63}$/;
const invalid=()=>{throw new Error('Manifiesto de captura inválido.');};
const integrity=()=>{throw new Error('La integridad de la captura no coincide.');};
const sha=data=>createHash('sha256').update(data).digest('hex');
function labels(included,omitted){if(!Array.isArray(included)||!Array.isArray(omitted)||!omitted.length||[...included,...omitted].some(x=>typeof x!=='string'||!labelPattern.test(x))||new Set([...included,...omitted]).size!==included.length+omitted.length)invalid();}
async function writeOwned(path,bytes,owned){const file=await open(path,'wx',0o600);owned.push(path);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}}
async function streamObject(path,source,expectedSize,expectedHash,owned){
 const file=await open(path,'wx',0o600);owned.push(path);let length=0;const hash=createHash('sha256');
 const counter=new Transform({transform(chunk,_encoding,callback){length+=chunk.length;if(length>expectedSize){callback(new Error('La integridad de la captura no coincide.'));return;}hash.update(chunk);callback(null,chunk);}});
 const target=new Writable({write(chunk,_encoding,callback){file.writeFile(chunk).then(()=>callback(),callback);}});
 try{await pipeline(source,counter,target);await file.sync();}finally{await file.close();}
 const actualHash=hash.digest('hex');if(length!==expectedSize||(expectedHash!==undefined&&actualHash!==expectedHash))integrity();return actualHash;
}
export async function createComponentSnapshot(destination,{metadata,included,omitted,objects,beforeCommit=async()=>{}}){
 if(!isAbsolute(destination)||!Array.isArray(objects)||objects.length>10000||typeof beforeCommit!=='function')invalid();labels(included,omitted);
 const metadataBytes=Buffer.from(JSON.stringify(metadata));if(metadataBytes.length>5000000)invalid();const ids=new Set();
 for(const item of objects){if(!item||typeof item.id!=='string'||!idPattern.test(item.id)||ids.has(item.id)||!Number.isSafeInteger(item.size)||item.size<0||item.size>1073741824||(item.sha256!==undefined&&(typeof item.sha256!=='string'||!hashPattern.test(item.sha256)))||typeof item.open!=='function')invalid();ids.add(item.id);}
 await mkdir(destination,{mode:0o700});const owned=[];let objectDir=false;
 try{await mkdir(join(destination,'objects'),{mode:0o700});objectDir=true;await writeOwned(join(destination,'metadata.json'),metadataBytes,owned);const entries=[];
  for(const item of objects){const file=`${randomUUID()}.bin`,path=join(destination,'objects',file),sha256=await streamObject(path,await item.open(),item.size,item.sha256,owned);entries.push({id:item.id,file,size:item.size,sha256});}
  await beforeCommit();const manifest={format:'savia-component-snapshot',version:1,complete:false,included:[...included],omitted:[...omitted],metadataSha256:sha(metadataBytes),objects:entries};await writeOwned(join(destination,'manifest.json'),Buffer.from(JSON.stringify(manifest)),owned);return manifest;
 }catch(error){for(const path of owned.reverse())await rm(path,{force:true}).catch(()=>{});if(objectDir)await rmdir(join(destination,'objects')).catch(()=>{});await rmdir(destination).catch(()=>{});throw error;}
}
async function regularDirectory(path){try{const info=await lstat(path);if(!info.isDirectory())integrity();}catch{integrity();}}
async function regularFile(path){try{const info=await lstat(path);if(!info.isFile())integrity();return info;}catch{integrity();}}
export async function verifyComponentSnapshot(directory){
 if(!isAbsolute(directory))invalid();await regularDirectory(directory);await regularDirectory(join(directory,'objects'));const manifestPath=join(directory,'manifest.json'),metadataPath=join(directory,'metadata.json');const manifestStat=await regularFile(manifestPath);if(manifestStat.size>5000000)invalid();let manifest;try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch{invalid();}
 if(!manifest||manifest.format!=='savia-component-snapshot'||manifest.version!==1||manifest.complete!==false||!hashPattern.test(manifest.metadataSha256||'')||!Array.isArray(manifest.objects)||manifest.objects.length>10000)invalid();labels(manifest.included,manifest.omitted);const ids=new Set(),files=new Set();
 for(const item of manifest.objects){if(!item||typeof item.id!=='string'||!idPattern.test(item.id)||ids.has(item.id)||typeof item.file!=='string'||!filePattern.test(item.file)||files.has(item.file)||!Number.isSafeInteger(item.size)||item.size<0||item.size>1073741824||!hashPattern.test(item.sha256||''))invalid();ids.add(item.id);files.add(item.file);}
 const metadataStat=await regularFile(metadataPath);if(metadataStat.size>5000000)invalid();const metadata=await readFile(metadataPath);if(sha(metadata)!==manifest.metadataSha256)integrity();try{JSON.parse(metadata.toString('utf8'));}catch{integrity();}
 let entries;try{entries=await readdir(join(directory,'objects'),{withFileTypes:true});}catch{integrity();}if(entries.length!==files.size||entries.some(entry=>!entry.isFile()||!files.has(entry.name)))integrity();
 for(const item of manifest.objects){const path=join(directory,'objects',item.file),info=await regularFile(path);if(info.size!==item.size)integrity();const digest=createHash('sha256');for await(const chunk of createReadStream(path))digest.update(chunk);if(digest.digest('hex')!==item.sha256)integrity();}
 return manifest;
}
