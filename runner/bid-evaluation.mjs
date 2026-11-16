import { isSupportedTextCredential, textProviderConfig } from './text-provider.mjs';
import {createManagedWorkspace} from './managed-workspaces.mjs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import aiModule from '../client/electron/services/aiService.cjs';
import runtimeModule from '../client/electron/services/pi/piRuntimeService.cjs';
import evaluationModule from '../client/electron/services/bidEvaluationService.cjs';
import {extractTenderSources} from './tender-chat.mjs';
import {TaskInputError} from './task-errors.mjs';

export function createBidEvaluationHandler({tempRoot=tmpdir(),createAiService=aiModule.createAiService,createRuntime=runtimeModule.createPiRuntimeService}={}){
 return async(payload,context)=>{
  const en=payload?.language==='en',fail=(es,english)=>{throw new TaskInputError(en?english:es);}, {fileIds,tenderFileIds,bidFileIds}=payload||{};
  if(payload?.dataProcessingConsent!==true)fail('Se requiere consentimiento para enviar los documentos.','Consent is required to send the documents.');
  if(!['es','en'].includes(payload.language)||!Array.isArray(fileIds)||!Array.isArray(tenderFileIds)||!Array.isArray(bidFileIds)||!tenderFileIds.length||!bidFileIds.length||fileIds.length>50||tenderFileIds.length+bidFileIds.length!==fileIds.length||new Set(fileIds).size!==fileIds.length||new Set([...tenderFileIds,...bidFileIds]).size!==fileIds.length||fileIds.some(id=>typeof id!=='string'||!id)||[...tenderFileIds,...bidFileIds].some(id=>!fileIds.includes(id)))fail('Selecciona pliegos y documentos de una oferta.','Select tender documents and documents from one offer.');
  context.signal?.throwIfAborted();const credential=await context.getCredential();if(!isSupportedTextCredential(credential))fail('Configura un proveedor compatible.','Configure a supported provider.');
  const directory=await createManagedWorkspace(tempRoot,'bid-eval');let runtime;
  try{
   const app={isPackaged:false,getPath:()=>directory},language=en?'en':'es',config={...textProviderConfig(credential), web_runner_openai_bid: credential.provider === 'openai-api', request_mode:'normal',ui_language:language,language,developer_mode:false,multimodal_enabled:false, concurrency_limit:1,components:{file_parser:{provider:'local'}}};
   const types={txt:'text/plain',md:'text/markdown',markdown:'text/markdown',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},sourceContext={...context,getFileInfo:async id=>{const file=await context.getFileInfo(id),type=String(file.contentType||'').split(';',1)[0].trim().toLowerCase();return !type||type==='application/octet-stream'?{...file,contentType:types[String(file.name||'').split('.').pop().toLowerCase()]||type}:file;}};
   const extracted=await extractTenderSources(fileIds,sourceContext,app,config,directory,en,{allowUnreadable:true});if(extracted.reduce((sum,item)=>sum+item.content.length,0)>1000000)fail('Los documentos son demasiado extensos.','The documents are too long.');
   const map=new Map(extracted.map(item=>[item.id,{id:item.id,name:item.fileName,text:item.content}])),tenderSources=tenderFileIds.map(id=>map.get(id)),bidSources=bidFileIds.map(id=>map.get(id));
   const configStore={load:()=>config},aiService=createAiService({app,configStore});runtime=createRuntime({app,configStore,aiService,isMonitorActive:()=>false,requestUserQuestion:async()=>{throw new Error('Questions are unavailable in this evaluation.');}});
   const service=evaluationModule.createBidEvaluationService({getConfig:()=>config,agentService:{runTask:task=>runtime.runTask({...task,signal:context.signal,failure_handled_by_parent:true})}});
   const result=await service.analyze({tenderSources,bidSources,language,signal:context.signal});context.signal?.throwIfAborted();return {tenderSources,bidSources,result};
  }finally{try{await runtime?.close();}finally{await rm(directory,{recursive:true,force:true});}}
 };
}
export function createBidEvaluationJobHandler(options={}){
 const analyze=createBidEvaluationHandler(options);
 return async(payload,context)=>{
  let secret='';const scoped={...context,getCredential:async()=>{const credential=await context.getCredential();secret=credential?.secret||'';return credential;}};
  const report=await analyze(payload,scoped),redact=value=>typeof value==='string'&&secret?value.split(secret).join('[redactado]'):Array.isArray(value)?value.map(redact):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[redact(key),redact(item)])):value;
  const bytes=Buffer.from(JSON.stringify(redact(report)));if(bytes.length>25*1024*1024)throw new TaskInputError('El informe supera el tamaño permitido.');context.signal?.throwIfAborted();const artifact=await context.uploadArtifact(bytes,'application/json');return {artifactId:artifact.id,criteriaCount:report.result.criteria.length};
 };
}
