import {createRequire} from 'node:module';
import {imageReferences} from './desktop-assets.mjs';
const require=createRequire(import.meta.url);
const {buildDocxResult}=require('../client/electron/services/exportService.cjs');
const {normalizeExportFormat}=require('../client/electron/services/exportFormatDefaults.cjs');
const manual=items=>items.map(item=>({...item,content_mode:'manual-fill',...(item.children?{children:manual(item.children)}:{})}));
export async function exportFeasibility(state,{language='es',options={},signal,assets=[]}={}){
 signal?.throwIfAborted();
 if(!state?.outlineData?.outline?.length)throw new Error(language==='en'?'The report has no chapters.':'El informe no tiene capítulos.');
 const images=new Map(assets.map(item=>[item.reference,item]));
 const resolveImage=source=>{const image=images.get(source);if(image)return {buffer:Buffer.from(image.bytes),type:image.type};return /^data:image\/(png|jpeg|gif);base64,/i.test(source)?undefined:null;};
 const payload={project_name:state.projectInfo?.projectName||(language==='en'?'Feasibility report':'Informe de viabilidad'),outline:manual(state.outlineData.outline),export_format:normalizeExportFormat(state.exportFormat),feasibility_options:{...options,project_info:state.projectInfo}};
 const result=await buildDocxResult(payload,{locale:language,resolveImage,quietWarnings:true});signal?.throwIfAborted();return {bytes:result.buffer,warnings:result.warnings};
}
export function createFeasibilityExportHandler({convert=exportFeasibility}={}){
 return async(payload,context)=>{
  context.signal?.throwIfAborted();
  const state=await context.getFeasibilityContext();
  const references=new Set(),collect=nodes=>{for(const node of nodes){if(node.children?.length)collect(node.children);else for(const image of imageReferences(node.content||''))if(image.kind==='url')references.add(image.reference);}};collect(state.outlineData?.outline||[]);
  const assets=[];for(const asset of state.exportAssets||[]){if(asset.kind!=='url'||!references.has(asset.reference))continue;let bytes;try{bytes=Buffer.from(await context.getFeasibilityAsset(asset.id));}catch(error){if(error?.status===404)continue;throw error;}let type=({'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'})[asset.contentType];if(type==='webp'){try{const requireClient=createRequire(new URL('../client/package.json',import.meta.url)),image=requireClient('sharp')(bytes),metadata=await image.metadata();if(metadata.pages>1)continue;bytes=await image.rotate().png().toBuffer();type='png';}catch{continue;}}assets.push({reference:asset.reference,bytes,type});}
  const result=await convert(state,{language:payload.language,options:payload.options,signal:context.signal,assets});
  await context.getFeasibilityContext();context.signal?.throwIfAborted();
  const artifact=await context.uploadAccountArtifact(result.bytes);return {artifactId:artifact.id,warnings:result.warnings};
 };
}
