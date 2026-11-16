'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {bindWorkspaceCompany,getWorkspaceScopeRoot}=require('../utils/paths.cjs');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Only routing labels and identifiers live in application preferences; all business data stays in each workspace.
function normalizeCompanyRegistry(value){
 if(value===undefined)return {activeId:'default',companies:[{id:'default',name:'Empresa principal'}]};
 if(!value||typeof value!=='object'||!Array.isArray(value.companies)||!value.companies.length)throw Error('El índice de empresas no es válido.');
 const ids=new Set(),names=new Set(),companies=value.companies.map(company=>{
  const id=company?.id,name=typeof company?.name==='string'?company.name.trim():'';
  if((id!=='default'&&!UUID.test(id||''))||!name||name.length>120||ids.has(id)||names.has(name.toLocaleLowerCase('es')))throw Error('El índice de empresas contiene un registro no válido.');
  ids.add(id);names.add(name.toLocaleLowerCase('es'));return {id,name};
 });
 if(!ids.has('default')||!ids.has(value.activeId))throw Error('La empresa seleccionada no existe en el índice.');
 return {activeId:value.activeId,companies};
}
function createCompanyRegistry(configStore){
 const getState=()=>normalizeCompanyRegistry(configStore.load().company_workspaces);
 function validatedName(state,name,exceptId){const label=String(name||'').trim();if(!label||label.length>120||state.companies.some(item=>item.id!==exceptId&&item.name.toLocaleLowerCase('es')===label.toLocaleLowerCase('es')))throw Error('Escribe un nombre de empresa único de hasta 120 caracteres.');return label;}
 function create(name){
  const state=getState(),label=validatedName(state,name);
  const company={id:crypto.randomUUID(),name:label},parent=path.join(path.dirname(configStore.getConfigFilePath()),'company-profiles'),root=path.join(parent,company.id);
  fs.mkdirSync(parent,{recursive:true});fs.mkdirSync(root);
  try{configStore.save({company_workspaces:{...state,companies:[...state.companies,company]}});}catch(error){try{fs.rmdirSync(root);}catch{}throw error;}return company;
 }
 function registerRestored(name,stagingRoot){
  const state=getState(),label=validatedName(state,name),parent=path.resolve(path.dirname(configStore.getConfigFilePath()),'company-profiles'),stage=path.resolve(stagingRoot);
  if(path.dirname(stage)!==parent||!/^\.restore-[a-zA-Z0-9]+$/.test(path.basename(stage))||!fs.lstatSync(stage).isDirectory())throw Error('Directorio temporal de restauración no válido.');
  const company={id:crypto.randomUUID(),name:label},target=path.join(parent,company.id);fs.renameSync(stage,target);
  try{configStore.save({company_workspaces:{...state,companies:[...state.companies,company]}});}
  catch(error){try{if(!getState().companies.some(item=>item.id===company.id))fs.renameSync(target,stage);}catch{}throw error;}
  return company;
 }
 function setForNextLaunch(id){const state=getState();if(!state.companies.some(company=>company.id===id))throw Error('La empresa seleccionada no existe.');configStore.save({company_workspaces:{...state,activeId:id}});}
 function rename(id,name){const state=getState();if(!state.companies.some(company=>company.id===id))throw Error('La empresa seleccionada no existe.');const label=validatedName(state,name,id);configStore.save({company_workspaces:{...state,companies:state.companies.map(company=>company.id===id?{...company,name:label}:company)}});}
 return {getState,create,registerRestored,setForNextLaunch,rename};
}
function initializeWorkspaceCompany(app,configStore){
 const rootDir=app.getPath('userData'),profiles=path.join(rootDir,'company-profiles');
 const hasProfiles=fs.existsSync(profiles)&&fs.readdirSync(profiles,{withFileTypes:true}).some(entry=>entry.isDirectory()&&UUID.test(entry.name));
 if(hasProfiles){
  let indexed=false;try{const config=JSON.parse(fs.readFileSync(configStore.getConfigFilePath(),'utf8'));indexed=Object.hasOwn(config,'company_workspaces');}catch{}
  if(!indexed)throw Error('Falta el índice de empresas; conserva las carpetas para su recuperación.');
 }
 const id=createCompanyRegistry(configStore).getState().activeId;
 if(id!=='default'){
  const root=path.join(app.getPath('userData'),'company-profiles',id);
  let exists=false;try{exists=fs.statSync(root).isDirectory();}catch{}
  if(!exists)throw Error('No se encuentra el directorio de la empresa seleccionada.');
  if(fs.existsSync(path.join(root,'.initialized'))&&!fs.existsSync(path.join(root,'workspace','savia.sqlite')))throw Error('No se encuentra la base de datos de la empresa seleccionada.');
  bindWorkspaceCompany(app,id);
 }
 getWorkspaceScopeRoot(app);return id;
}
function markWorkspaceInitialized(app){const root=getWorkspaceScopeRoot(app);if(root!==app.getPath('userData'))fs.writeFileSync(path.join(root,'.initialized'),'1','utf8');}
module.exports={normalizeCompanyRegistry,createCompanyRegistry,initializeWorkspaceCompany,markWorkspaceInitialized};
