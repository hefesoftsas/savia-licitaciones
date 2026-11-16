'use strict';
const fs=require('node:fs'),path=require('node:path');
const {acquireProjectProfileLock}=require('./technicalProjectProfileLock.cjs');
const {createConfigStore}=require('./configStore.cjs');
const {createCompanyRegistry}=require('./companyRegistry.cjs');
const {workspaceDatabasePath}=require('../utils/brandCompatibility.cjs');
const {captureCompanyBackup}=require('./companyBackupCapture.cjs');

// Only call after the desktop application has closed cleanly. The same installation-wide
// lock prevents any other Savia instance from opening while the snapshot is captured.
async function captureOfflineCompany({userData,companyId,Database,maxSchema,configStore}){
 const lock=acquireProjectProfileLock({root:userData,Database});let db,held=true;
 try{
  const app={getPath:()=>userData},registry=createCompanyRegistry(configStore||createConfigStore(app));
  const company=registry.getState().companies.find(item=>item.id===companyId);if(!company)throw Error('La empresa seleccionada no existe.');
  const scopeRoot=company.id==='default'?userData:path.join(userData,'company-profiles',company.id);
  const source=workspaceDatabasePath(path.join(scopeRoot,'workspace'));
  let stat;try{stat=fs.lstatSync(source);}catch{throw Error('No se encuentra la base de datos de esta empresa.');}
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('La base de datos de esta empresa no es compatible.');
  db=new Database(source,{readonly:true,fileMustExist:true});const version=db.pragma('user_version',{simple:true});
  if(!Number.isSafeInteger(version)||version<1||version>maxSchema)throw Error('La versión de la base de datos no es compatible.');
  return await captureCompanyBackup({scopeRoot,db,Database,companyName:company.name,schemaVersion:version,assertQuiescent:()=>{if(!held)throw Error('Se perdió el acceso exclusivo al espacio.');}});
 }finally{db?.close();held=false;lock.close();}
}
module.exports={captureOfflineCompany};
