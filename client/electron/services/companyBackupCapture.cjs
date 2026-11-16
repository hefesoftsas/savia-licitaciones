'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createCompanyArchive}=require('./companyBackupArchive.cjs');
const {workspaceDatabasePath}=require('../utils/brandCompatibility.cjs');
const MAX_BYTES=256*1024*1024,MAX_FILES=10000;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

// Capture only company-owned data. Global settings, license and Pi's service home are excluded.
function readCompanyFiles(scopeRoot){
 const files=[],roots=['workspace','technical-plan-projects','agent-runtime/pi/tasks'];let total=0;
 function walk(relative){
  const absolute=path.join(scopeRoot,...relative.split('/'));let stat;try{stat=fs.lstatSync(absolute);}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(stat.isSymbolicLink())throw Error('El espacio contiene un enlace simbólico que no se puede respaldar.');
  if(stat.isDirectory()){for(const item of fs.readdirSync(absolute).sort())walk(`${relative}/${item}`);return;}
  if(!stat.isFile())throw Error('El espacio contiene un archivo no compatible.');
  if(/^workspace\/[^/]+\.sqlite(?:-(?:wal|shm|journal))?(?:\.backup-.*)?$/i.test(relative))return;
  total+=stat.size;if(total>MAX_BYTES||files.length>=MAX_FILES)throw Error('El respaldo supera el tamaño o cantidad de archivos permitidos.');
  const bytes=fs.readFileSync(absolute);if(bytes.length!==stat.size)throw Error('Los archivos cambiaron durante el respaldo.');
  files.push({path:relative,bytes,sha256:hash(bytes)});
 }
 for(const root of roots)walk(root);
 return files;
}
function sameFiles(left,right){return left.length===right.length&&left.every((file,index)=>file.path===right[index].path&&file.sha256===right[index].sha256);}

// The caller must prevent new workspace operations for the entire call and reject active tasks.
// The version and file checks are additional detection, not a substitute for that exclusive lease.
async function captureCompanyBackup({scopeRoot,db,Database,companyName,schemaVersion,assertQuiescent}){
 if(typeof assertQuiescent!=='function')throw Error('Se requiere acceso exclusivo al espacio para crear el respaldo.');
 await assertQuiescent();
 const source=workspaceDatabasePath(path.join(scopeRoot,'workspace'));
 if(path.resolve(db.name)!==path.resolve(source))throw Error('La base no corresponde a la empresa seleccionada.');
 const databaseStat=fs.lstatSync(source);if(!databaseStat.isFile()||databaseStat.isSymbolicLink())throw Error('La base del espacio no es un archivo compatible.');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'savia-company-snapshot-')),copy=path.join(temp,'savia.sqlite');let monitor,check;
 try{
  monitor=new Database(source,{readonly:true,fileMustExist:true});const versionBefore=monitor.pragma('data_version',{simple:true});
  const before=readCompanyFiles(scopeRoot);
  await db.backup(copy);
  check=new Database(copy,{readonly:true,fileMustExist:true});
  if(check.pragma('quick_check',{simple:true})!=='ok'||check.pragma('user_version',{simple:true})!==schemaVersion)throw Error('No se pudo verificar la base de datos del respaldo.');
  check.close();check=null;
  const database=fs.readFileSync(copy);if(database.length>MAX_BYTES)throw Error('La base supera el tamaño permitido para el respaldo.');
  const after=readCompanyFiles(scopeRoot);await assertQuiescent();
  if(monitor.pragma('data_version',{simple:true})!==versionBefore||!sameFiles(before,after))throw Error('Los datos cambiaron durante el respaldo; vuelve a intentarlo.');
  return createCompanyArchive({companyName,schemaVersion,files:[{path:'workspace/savia.sqlite',bytes:database},...before.map(({path:entry,bytes})=>({path:entry,bytes}))]});
 }finally{check?.close();monitor?.close();fs.rmSync(temp,{recursive:true,force:true});}
}
module.exports={captureCompanyBackup};
