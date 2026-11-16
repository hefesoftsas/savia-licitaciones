import {createManagedWorkspace} from './managed-workspaces.mjs';
import {recognizeScannedPdf} from './local-ocr.mjs';
import {rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname,join} from 'node:path';
import fileModule from '../client/electron/services/fileService.cjs';
import {createHash} from 'node:crypto';
import {supportedImage} from './desktop-assets.mjs';
import {TaskInputError} from './task-errors.mjs';
const allowed=new Set(['.pdf','.doc','.docx','.wps','.xls','.xlsx','.txt','.md','.markdown']);
export function createFeasibilityExtractHandler({temporaryRoot=tmpdir(),parse=fileModule.parseDocumentWithConfig,ocr=parse===fileModule.parseDocumentWithConfig?recognizeScannedPdf:null}={}){
 return async(payload,context)=>{
  const en=payload?.language==='en',fail=(es,english)=>{throw new TaskInputError(en?english:es);};
  if(!Array.isArray(payload.sourceKeys)||!payload.sourceKeys.length||payload.sourceKeys.length>50)fail('No hay archivos para extraer.','There are no files to extract.');
  context.reportProgress?.('reading');
  const directory=await createManagedWorkspace(temporaryRoot,'feasibility-extract');const app={isPackaged:false,getPath:()=>directory},config={components:{file_parser:{provider:'local'}},developer_mode:false};let extractedCount=0,imageCount=0;
  try{
   for(const [index,id] of payload.sourceKeys.entries()){
    context.signal?.throwIfAborted();const file=await context.getFeasibilityOriginal(id),fileName=file.name||`Archivo ${index+1}`,ext=extname(fileName).toLowerCase();if(!allowed.has(ext))fail('Uno de los archivos no tiene un formato compatible.','One file uses an unsupported format.');
    context.reportActivity?.('document.start',{document:fileName,index:index+1,total:payload.sourceKeys.length});
    const bytes=Buffer.from(file.bytes),images=new Map(),target=join(directory,`source-${index}${ext}`);let content;
    try{if(['.txt','.md','.markdown'].includes(ext))content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);else{await writeFile(target,bytes);if(payload.preserveImages===true&&['.pdf','.doc','.docx','.wps'].includes(ext)){const {convertPathToMarkdown}=await import('../client/electron/services/doc2markdown/convert.mjs');content=await convertPathToMarkdown(target,{includeImages:true,imageResolver:async({buffer})=>{context.signal?.throwIfAborted();const data=Buffer.from(buffer);if(!supportedImage(data)||data.length>25*1024*1024)fail('Una imagen incrustada no tiene un formato compatible o supera 25 MiB.','An embedded image has an unsupported format or exceeds 25 MiB.');const hash=createHash('sha256').update(data).digest('hex');images.set(hash,data);if(images.size>100)fail('Un archivo contiene más de 100 imágenes.','A file contains more than 100 images.');const base=context.job.feasibilityProjectId?`/api/projects/${encodeURIComponent(context.job.feasibilityProjectId)}/feasibility-report`:'/api/feasibility-report';return `${base}/extractions/images/${encodeURIComponent(context.job.id)}/${id}/${hash}`;}});}else content=await parse(app,target,config,{preserveImages:false});}}catch(error){context.signal?.throwIfAborted();if(error instanceof TaskInputError)throw error;if(error?.code==='pdf_text_layer_missing'&&ocr){content=await ocr(target,{signal:context.signal,language:en?'en':'es',reportConsole:entry=>context.reportConsole?.({...entry,document:fileName}),reportProgress:context.reportProgress,reportActivity:(code,details)=>context.reportActivity?.(code,{document:fileName,...details})});}else if(error?.code==='pdf_text_layer_missing')fail('PDF escaneado sin texto seleccionable; necesita reconocimiento de texto (OCR).','Scanned PDF without selectable text; text recognition (OCR) is needed.');else fail('No se pudo extraer un archivo. Comprueba su formato; DOC y WPS pueden requerir LibreOffice.','A file could not be extracted. Check its format; DOC and WPS may require LibreOffice.');}
    if(typeof content!=='string'||!content.trim()||content.includes('\0'))fail('Un archivo no contiene texto legible.','A file contains no readable text.');const text=Buffer.from(content,'utf8');if(text.length>25*1024*1024)fail('El texto extraído supera 25 MiB.','Extracted text exceeds 25 MiB.');for(const [hash,data] of images){context.signal?.throwIfAborted();await context.uploadFeasibilityImage(id,hash,data);}await context.uploadFeasibilityText(id,text,payload.preserveImages===true?{imageCount:images.size}:undefined);context.reportActivity?.('document.end',{document:fileName});imageCount+=images.size;extractedCount++;
   }
   await context.assertFeasibilityExtractionCurrent();context.signal?.throwIfAborted();return {extractedCount,...(payload.preserveImages===true?{imageCount}:{})};
  }finally{await rm(directory,{recursive:true,force:true});}
 };
}
