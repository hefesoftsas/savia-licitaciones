import {createManagedWorkspace} from './managed-workspaces.mjs';
import {readFile,rm} from 'node:fs/promises';
import {saveSourceFile} from './file-stream.mjs';
import {tmpdir} from 'node:os';
import {extname,join,resolve,sep} from 'node:path';
import {createRequire} from 'node:module';
import {TaskInputError} from './task-errors.mjs';
const require=createRequire(import.meta.url);
const {createDuplicateCheckService}=require('../client/electron/services/duplicateCheckService.cjs');
const supported=new Set(['.doc','.docx','.wps','.pdf','.md','.markdown','.xls','.xlsx']);
const temporaryTimes=new Set(['created_at','modified_at','accessed_at']);

async function previewBytes(reference,directory){
 const embedded=/^data:image\/[^;]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(reference||'');if(embedded)return Buffer.from(embedded[1].replace(/\s/g,''),'base64');
 let url;try{url=new URL(reference);}catch{return null;}
 if(!/^[a-z0-9-]+-asset:$/.test(url.protocol)||url.hostname!=='imported-images')return null;
 const root=resolve(directory,'workspace/imported-images');let target;try{target=resolve(root,decodeURIComponent(url.pathname).replace(/^\/+/,''));}catch{return null;}
 if(!target.startsWith(root+sep))return null;
 try{return await readFile(target);}catch{return null;}
}

export function createDuplicateCheckHandler({temporaryRoot=tmpdir()}={}){
 return async(payload,context)=>{
  const ids=payload?.fileIds,tenders=payload?.tenderFileIds,bids=payload?.bidFileIds;
  if(!Array.isArray(ids)||!Array.isArray(tenders)||!Array.isArray(bids)||!bids.length||ids.length>50||tenders.length+bids.length!==ids.length||new Set(ids).size!==ids.length||new Set([...tenders,...bids]).size!==ids.length||[...tenders,...bids].some(id=>!ids.includes(id))||ids.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)))throw new TaskInputError('Selecciona los documentos de la revisión.');
  context.signal?.throwIfAborted();const directory=await createManagedWorkspace(temporaryRoot,'duplicate-check');
  try {
   const files=new Map();
   for(const [index,id] of ids.entries()){
    context.signal?.throwIfAborted();const file=await (context.getFileStream?context.getFileStream(id):context.getFileInfo(id));context.signal?.throwIfAborted();
    const name=typeof file?.name==='string'?file.name:'',extension=extname(name).toLowerCase();
    if(!name||name.length>255||!supported.has(extension)){if(file.body&&!file.body.locked)await file.body.cancel().catch(()=>{});throw new TaskInputError('Un documento no tiene un formato compatible o está vacío.');}
    const path=join(directory,`${index}${extension}`),size=await saveSourceFile(file,path,{signal:context.signal,language:payload.language});if(!size)throw new TaskInputError('Un documento no tiene un formato compatible o está vacío.');
    files.set(id,{id,file_name:name,file_path:path,extension,size,modified_at:''});
   }
   const tenderFiles=tenders.map(id=>files.get(id)),bidFiles=bids.map(id=>files.get(id));
   let state={tenderFile:tenderFiles[0]||null,tenderFiles,bidFiles},task={};
   const store={loadDuplicateCheck:()=>state,updateDuplicateCheckWithoutReload:patch=>update({},patch)};
   const update=(taskPatch,patch={})=>{context.signal?.throwIfAborted();task={...task,...taskPatch};for(const [key,value] of Object.entries(patch))state[key]=key.endsWith('Analysis')?{...(state[key]||{}),...value}:value;};
   const app={getPath:()=>directory},configStore={load:()=>({developer_mode:false,components:{file_parser:{provider:'local'}}})};
   const service=createDuplicateCheckService({app,configStore,workspaceStore:store});
   await service.runAnalysisTask({workspaceStore:store,updateTask:update,checkpointTask:update,payload:{tenderFiles,bidFiles,force:true}});
   context.signal?.throwIfAborted();
   const metadata=state.metadataAnalysis;
   if(metadata){metadata.rows=(metadata.rows||[]).filter(row=>!temporaryTimes.has(row.key));for(const file of metadata.files||[])file.metadata=(file.metadata||[]).filter(item=>!temporaryTimes.has(item.key));}
   const previews=[];
   for(const item of state.imageAnalysis?.duplicateImages||[]){const bytes=await previewBytes(item.preview_url,directory);previews.push({id:item.id,bytes,missing:!bytes});delete item.preview_url;}
   const clean=JSON.parse(JSON.stringify({status:task.status||'error',metadataAnalysis:state.metadataAnalysis,outlineAnalysis:state.outlineAnalysis,contentAnalysis:state.contentAnalysis,imageAnalysis:state.imageAnalysis},(key,value)=>{
    if(key==='file_path'||key==='content_path')return undefined;
    return typeof value==='string'?value.split(directory).join('[temporal]'):value;
   }));
   return {...clean,sourceFiles:ids.map(id=>({id,name:files.get(id).file_name})),previews};
  } finally {await rm(directory,{recursive:true,force:true});}
 };
}

export function createDuplicateJobHandler(options={}){
 const analyze=createDuplicateCheckHandler(options);
 return async(payload,context)=>{
  const {previews,...result}=await analyze(payload,context);
  const report={...result,previews:previews.map(item=>({id:item.id,missing:item.missing,base64:item.bytes?.toString('base64')||null}))};
  const bytes=Buffer.from(JSON.stringify(report));
  if(bytes.length>25*1024*1024)throw new TaskInputError('El informe supera el tamaño permitido; reduce la cantidad de documentos.');
  context.signal?.throwIfAborted();const artifact=await context.uploadArtifact(bytes,'application/json');
  return {artifactId:artifact.id,analysisStatus:result.status};
 };
}
