'use strict';
const crypto=require('node:crypto');
const AdmZip=require('adm-zip');
const DEFAULT_MAX_BYTES=256*1024*1024,MAX_FILES=10000,MAX_MANIFEST=2*1024*1024;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function rejectFileParentCollisions(names){const set=new Set(names.map(name=>name.normalize('NFKC').toLowerCase()));for(const name of set){const parts=name.split('/');for(let i=1;i<parts.length;i++)if(set.has(parts.slice(0,i).join('/')))throw Error('Una ruta de archivo coincide con una carpeta del respaldo.');}}
function safePath(value){
 if(typeof value!=='string'||value.length>1024||!value||value.includes('\\')||/[\x00-\x1f:*?"<>|]/.test(value))throw Error('Ruta de respaldo no válida.');
 const parts=value.split('/');
 if(parts.some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part)))throw Error('Ruta de respaldo no válida.');
 if(!['workspace','technical-plan-projects','agent-runtime'].includes(parts[0])||parts.length<2)throw Error('Ruta fuera del espacio de empresa.');
 if(parts[0]==='agent-runtime'&&(parts[1]!=='pi'||parts[2]!=='tasks'||parts.length<5))throw Error('Ruta de sesión de agente no válida.');
 if(parts.length===2&&parts[0]==='workspace'){
  const name=parts[1].toLowerCase();
  if(name!=='savia.sqlite' && /\.sqlite(?:-(?:wal|shm|journal))?$/i.test(name))throw Error('El respaldo contiene una base de datos adicional o un diario SQLite.');
 }
 return value;
}
function validateFiles(files,maxBytes){
 if(!Array.isArray(files)||!files.length||files.length>MAX_FILES)throw Error('Cantidad de archivos de respaldo no válida.');
 let total=0;const seen=new Set();
 for(const file of files){const name=safePath(file.path),key=name.normalize('NFKC').toLowerCase();if(seen.has(key))throw Error('Ruta duplicada en el respaldo.');seen.add(key);
  if(!Buffer.isBuffer(file.bytes))throw Error('Contenido de respaldo no válido.');total+=file.bytes.length;if(total>maxBytes)throw Error('El respaldo supera el tamaño permitido.');}
 if(!files.some(file=>file.path==='workspace/savia.sqlite'))throw Error('El respaldo no contiene la base de datos.');
 rejectFileParentCollisions([...seen]);
}
function createCompanyArchive({companyName,schemaVersion,files},{maxBytes=DEFAULT_MAX_BYTES}={}){
 validateFiles(files,maxBytes);
 if(typeof companyName!=='string'||!companyName.trim()||companyName.length>120||!Number.isSafeInteger(schemaVersion)||schemaVersion<1)throw Error('Metadatos de respaldo no válidos.');
 const manifest={format:'savia-company-backup',version:1,companyName:companyName.trim(),schemaVersion,createdAt:new Date().toISOString(),files:files.map(file=>({path:file.path,size:file.bytes.length,sha256:digest(file.bytes)}))};
 const manifestBytes=Buffer.from(JSON.stringify(manifest),'utf8');if(manifestBytes.length>MAX_MANIFEST)throw Error('El índice de respaldo supera el tamaño permitido.');
 const zip=new AdmZip();zip.addFile('manifest.json',manifestBytes);for(const file of files)zip.addFile(file.path,file.bytes);
 const output=zip.toBuffer();if(output.length>maxBytes+MAX_MANIFEST)throw Error('El respaldo supera el tamaño permitido.');return output;
}
function readCompanyArchive(bytes,maxSchema,{maxBytes=DEFAULT_MAX_BYTES}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length>maxBytes+MAX_MANIFEST)throw Error('El tamaño del respaldo no es válido.');
 let zip,entries;try{zip=new AdmZip(bytes);entries=zip.getEntries();}catch{throw Error('El respaldo no es un archivo válido.');}
 if(!entries.length||entries.length>MAX_FILES+1)throw Error('Cantidad de archivos de respaldo no válida.');
 const byName=new Map(),seen=new Set();let size=0;
 for(const entry of entries){const name=entry.entryName;if(entry.isDirectory||entry.header.encrypted||((entry.header.attr>>>16)&0xf000)===0xa000)throw Error('El respaldo contiene un archivo no admitido.');
  if(name!=='manifest.json')safePath(name);
  const key=name.normalize('NFKC').toLowerCase();if(seen.has(key))throw Error('Ruta duplicada en el respaldo.');seen.add(key);
  if(!Number.isSafeInteger(entry.header.size)||entry.header.size<0)throw Error('Tamaño de archivo no válido.');
  if(name==='manifest.json'&&entry.header.size>MAX_MANIFEST)throw Error('Índice de respaldo demasiado grande.');
  size+=entry.header.size;if(size>maxBytes+MAX_MANIFEST)throw Error('El respaldo supera el tamaño permitido.');byName.set(name,entry);
 }
 rejectFileParentCollisions([...seen].filter(name=>name!=='manifest.json'));
 let manifest;try{manifest=JSON.parse(byName.get('manifest.json').getData().toString('utf8'));}catch{throw Error('El índice del respaldo no es válido.');}
 if(manifest?.format!=='savia-company-backup'||manifest.version!==1||typeof manifest.companyName!=='string'||!manifest.companyName.trim()||manifest.companyName.length>120||!Number.isSafeInteger(manifest.schemaVersion)||manifest.schemaVersion<1||!Number.isFinite(Date.parse(manifest.createdAt))||!Array.isArray(manifest.files))throw Error('Los metadatos del respaldo no son válidos.');
 if(!Number.isSafeInteger(maxSchema)||manifest.schemaVersion>maxSchema)throw Error('La versión del respaldo requiere una versión más reciente de Savia.');
 if(manifest.files.length!==entries.length-1)throw Error('Los archivos no coinciden con el índice del respaldo.');
 const files=new Map();for(const item of manifest.files){const name=safePath(item?.path),entry=byName.get(name);
  if(!entry||files.has(name)||!Number.isSafeInteger(item.size)||item.size<0||item.size!==entry.header.size||!/^([a-f0-9]{64})$/.test(item.sha256||''))throw Error('Los archivos no coinciden con el índice del respaldo.');
  let content;try{content=entry.getData();}catch{throw Error('No se pudo verificar la integridad del respaldo.');}
  if(content.length!==item.size||digest(content)!==item.sha256)throw Error('No se pudo verificar la integridad del respaldo.');files.set(name,content);
 }
 validateFiles([...files].map(([name,content])=>({path:name,bytes:content})),maxBytes);
 return {manifest,files};
}
module.exports={createCompanyArchive,readCompanyArchive};
