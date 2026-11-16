import {link,mkdir,unlink,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute,join} from 'node:path';
import {captureProjectComponents} from './project-component-capture.mjs';

const validId=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(value);
const invalid=()=>new Error('Respuesta del inventario de proyectos inválida.');
async function inventory({server,token,fetchImpl}){
 const ids=[];let cursor=null;
 do{
  const url=new URL(`${server}/api/runner/project-inventory`);if(cursor!==null)url.searchParams.set('after',cursor);
  const response=await fetchImpl(url.toString(),{headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`No se pudo leer el inventario de proyectos (HTTP ${response.status}).`);
  const page=await response.json();if(!page||!Array.isArray(page.projects)||page.projects.length>100||!(page.nextCursor===null||validId(page.nextCursor)))throw invalid();
  let previous=cursor;for(const item of page.projects){if(!item||!validId(item.id)||(previous!==null&&item.id<=previous))throw invalid();ids.push(item.id);previous=item.id;if(ids.length>10000)throw new Error('El inventario supera el límite de 10000 proyectos.');}
  if(page.nextCursor!==null&&(page.projects.length!==100||page.nextCursor!==previous))throw invalid();cursor=page.nextCursor;
 }while(cursor!==null);
 return ids;
}
export async function captureAccountProjects({server,token,destination,fetchImpl=fetch,capture=captureProjectComponents,onProgress=()=>{}}){
 if(!isAbsolute(destination))throw new Error('Indica una ruta absoluta nueva para la captura.');
 try{await mkdir(destination,{mode:0o700});}catch(error){if(error.code==='EEXIST')throw new Error('La carpeta de captura ya existe; elige otra.');throw error;}
 const ids=await inventory({server,token,fetchImpl}),projects=[];
 for(const id of ids){const directory=createHash('sha256').update(id,'utf8').digest('hex');try{await capture({server,token,projectId:id,destination:join(destination,directory),fetchImpl});}catch(error){throw new Error(`No se pudo capturar el proyecto ${id}: ${error.message}`);}projects.push({id,directory});onProgress(id);}
 const finalIds=await inventory({server,token,fetchImpl});if(JSON.stringify(ids)!==JSON.stringify(finalIds))throw new Error('El inventario de proyectos cambió durante la captura.');
 const index={format:'savia-account-project-collection',version:1,complete:false,atomic:false,projects,omitted:['other-project-data','other-account-data','credentials']};
 const temporary=join(destination,'index.json.tmp');await writeFile(temporary,JSON.stringify(index),{encoding:'utf8',mode:0o600,flag:'wx'});try{await link(temporary,join(destination,'index.json'));}finally{await unlink(temporary);}
 return index;
}
