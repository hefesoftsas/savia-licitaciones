import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {captureAccountProjects} from '../account-projects-capture.mjs';
import {restoreAccountProjects} from '../account-projects-restore.mjs';
import {createComponentSnapshot} from '../cloud-snapshot-archive.mjs';
async function fixture(root){const destination=join(root,'projects');await captureAccountProjects({server:'https://example.invalid',token:'test',destination,fetchImpl:async()=>Response.json({projects:[{id:'a'},{id:'b'}],nextCursor:null}),capture:({projectId,destination})=>createComponentSnapshot(destination,{metadata:{project:{id:projectId}},included:['project-header','project-files'],omitted:['other-project-data','other-account-data','credentials'],objects:[]})});return destination;}

test('valida el conjunto y recupera cada proyecto con su biblioteca opcional',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-project-restore-'));try{const directory=await fixture(root),knowledgeDirectory=join(root,'knowledge');await createComponentSnapshot(knowledgeDirectory,{metadata:{kind:'account-knowledge'},included:['account-knowledge'],omitted:['other-account-data','credentials'],objects:[]});const calls=[];
  const result=await restoreAccountProjects({server:'https://example.invalid',token:'secret',directory,knowledgeDirectory,restore:async options=>{calls.push(options);return {projectId:`new-${calls.length}`,files:0};}});
  assert.equal(result.complete,false);assert.deepEqual(result.projects.map(x=>[x.sourceId,x.result.projectId]),[['a','new-1'],['b','new-2']]);assert.ok(calls.every(x=>x.knowledgeDirectory===knowledgeDirectory&&x.token==='secret'));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('rechaza un proyecto cuyo identificador no coincide aunque los hashes sean válidos',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-project-restore-id-'));try{const directory=await fixture(root),index=JSON.parse(await readFile(join(directory,'index.json'),'utf8')),path=join(directory,index.projects[0].directory),metadata=JSON.stringify({project:{id:'otro'}}),manifest=JSON.parse(await readFile(join(path,'manifest.json'),'utf8'));manifest.metadataSha256=createHash('sha256').update(metadata).digest('hex');await writeFile(join(path,'metadata.json'),metadata);await writeFile(join(path,'manifest.json'),JSON.stringify(manifest));let writes=0;await assert.rejects(restoreAccountProjects({directory,restore:async()=>writes++}),/índice/i);assert.equal(writes,0);}finally{await rm(root,{recursive:true,force:true});}
});

test('rechaza rutas o capturas alteradas antes de recuperar cualquier proyecto',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-project-restore-bad-'));try{const directory=await fixture(root),path=join(directory,'index.json'),original=await readFile(path,'utf8'),index=JSON.parse(original);let writes=0;const restore=async()=>{writes++;};
  index.projects[0].directory='../outside';await writeFile(path,JSON.stringify(index));await assert.rejects(restoreAccountProjects({directory,restore}),/índice/i);assert.equal(writes,0);await writeFile(path,original);
  const file=join(directory,index.projects[1].directory,'metadata.json');await writeFile(file,'{}');await assert.rejects(restoreAccountProjects({directory,restore}),/integridad/i);assert.equal(writes,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('identifica el proyecto fallido y permite reintentar sin ocultar resultados',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-project-restore-retry-'));try{const directory=await fixture(root);let fail=true;const calls=[],progress=[];const restore=async({directory:path})=>{calls.push(path);if(calls.length===2&&fail)throw new Error('conflicto');return {projectId:'destino',files:1};};
  await assert.rejects(restoreAccountProjects({directory,restore,onProgress:(id,result)=>progress.push([id,result])}),/proyecto b.*conflicto/i);assert.deepEqual(progress.map(x=>x[0]),['a']);fail=false;calls.length=0;const result=await restoreAccountProjects({directory,restore});assert.equal(result.projects.length,2);
 }finally{await rm(root,{recursive:true,force:true});}
});
