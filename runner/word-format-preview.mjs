import {createRequire} from 'node:module';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolvePackagedHelper} from './technical-plan-export.mjs';

const require=createRequire(import.meta.url);
const {createOpenXmlHelperService}=require('../client/electron/services/openXmlHelperService.cjs');
const {normalizeExportFormat}=require('../client/electron/services/exportFormatDefaults.cjs');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
/** Render an isolated sample with the same OpenXML helper used by the desktop app. */
export async function renderWordFormatPreview(format,{language='es',signal,executablePath}={}) {
 signal?.throwIfAborted();
 const directory=await mkdtemp(join(tmpdir(),'savia-word-preview-'));
 const app={isPackaged:false,getPath:()=>directory,getAppPath:()=>join(root,'client')};
 const helper=createOpenXmlHelperService({app,executablePath:executablePath||resolvePackagedHelper(root),configStore:{load:()=>({language})}});
 const cancel=()=>{void helper.close().catch(()=>{});};
 signal?.addEventListener('abort',cancel,{once:true});
 try {const sample=await readFile(join(root,'client','electron','resources','content-generation',language==='en'?'正文模板.en.html':'正文模板.es.html'),'utf8');const result=await helper.renderRestrictedHtmlDocx(sample,normalizeExportFormat(format));signal?.throwIfAborted();return {bytes:result.bytes,roles:result.roles};}
 finally {signal?.removeEventListener('abort',cancel);await helper.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
}
