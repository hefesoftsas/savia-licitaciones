import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {verifyComponentSnapshot} from './cloud-snapshot-archive.mjs';
import {restoreProjectComponents} from './project-component-restore.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(value);
const invalid=()=>new Error('Índice de captura de proyectos inválido.');
export async function restoreAccountProjects({server,token,directory,knowledgeDirectory,fetchImpl=fetch,restore=restoreProjectComponents,onProgress=()=>{}}){
 if(!isAbsolute(directory)||(knowledgeDirectory&&!isAbsolute(knowledgeDirectory)))throw invalid();
 let index;try{const root=await lstat(directory),file=await lstat(join(directory,'index.json'));if(!root.isDirectory()||!file.isFile()||file.size>4000000)throw invalid();index=JSON.parse(await readFile(join(directory,'index.json'),'utf8'));}catch{throw invalid();}
 if(!index||index.format!=='savia-account-project-collection'||index.version!==1||index.complete!==false||index.atomic!==false||!Array.isArray(index.projects)||index.projects.length>10000||JSON.stringify(index.omitted)!==JSON.stringify(['other-project-data','other-account-data','credentials']))throw invalid();
 let previous=null;for(const project of index.projects){if(!project||!validId(project.id)||(previous!==null&&project.id<=previous)||project.directory!==hash(project.id))throw invalid();previous=project.id;}
 if(knowledgeDirectory){const manifest=await verifyComponentSnapshot(knowledgeDirectory);if(manifest.included.join(',')!=='account-knowledge')throw new Error('Captura de biblioteca inválida.');}
 for(const project of index.projects){const path=join(directory,project.directory),manifest=await verifyComponentSnapshot(path),bytes=await readFile(join(path,'metadata.json'));let metadata;try{metadata=JSON.parse(bytes.toString('utf8'));}catch{throw invalid();}if(hash(bytes)!==manifest.metadataSha256||metadata.project?.id!==project.id||!manifest.included.includes('project-header')||manifest.omitted.join(',')!=='other-project-data,other-account-data,credentials')throw invalid();}
 const projects=[];for(const project of index.projects){let result;try{result=await restore({server,token,fetchImpl,directory:join(directory,project.directory),...(knowledgeDirectory?{knowledgeDirectory}:{})});}catch(error){throw new Error(`No se pudo recuperar el proyecto ${project.id}: ${error.message}`);}projects.push({sourceId:project.id,result});onProgress(project.id,result);}
 return {complete:false,projects,omitted:index.omitted};
}
