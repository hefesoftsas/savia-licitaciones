import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { importKnowledgeFolder, importKnowledgeDocument } from '../src/desktop-knowledge-import.js';
import { restoreKnowledgeIndex } from '../src/knowledge-index-restore.js';
import { restoreAccountKnowledge } from '../../runner/account-knowledge-restore.mjs';
import { restoreKnowledgeSources } from '../../runner/project-knowledge-restore.mjs';
import { restoreProjectComponents } from '../../runner/project-component-restore.mjs';
import { createComponentSnapshot } from '../../runner/cloud-snapshot-archive.mjs';
import { importDesktopPlan } from '../src/desktop-plan-import.js';
import { importDesktopWorkflow } from '../src/desktop-workflow-import.js';
import { Readable } from 'node:stream';

test('recupera documento e índice y reutiliza el mapa de entradas en los reintentos',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'restore-knowledge'},r2Buckets:['FILES']}));
 const root=await mkdtemp(join(tmpdir(),'savia-knowledge-restore-'));
 try {
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await writeFile(join(root,'doc.bin'),'data');
  const knowledge={folders:[{id:'f',name:'Fuentes',created_at:'2026'}],documents:[{id:'d',folder_id:'f',name:'fuente.pdf',content_type:'application/pdf',size:4,created_at:'2026'}],indices:[{document_id:'d',revision:1}],entries:[{id:'e',document_id:'d',title:'Título',summary:'Resumen',quote:'Cita',sort_order:0}]};
  const objects=new Map([['knowledge:d',{file:'doc.bin',size:4,sha256:'3a6eb0790f39ac87c94f3856b2dd2c5d110e6811602261a9a923d3bb23adc8b7'}]]);
  const send=async(url,options)=>{const parts=new URL(url).pathname.split('/'),request=new Request(url,options),runner={ownerId:'alice'},env={DB,FILES};let response;
   if(parts.at(-1)==='index')response=await restoreKnowledgeIndex(request,env,runner,parts[5],parts[7]);
   else if(parts[6]==='folders')response=await importKnowledgeFolder(request,env,runner,parts[5],parts[7]);
   else response=await importKnowledgeDocument(request,env,runner,parts[5],parts[7]);
   if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();};
  const options={knowledge,objects,directory:root,requestId:'r',server:'http://localhost',send};
  const first=await restoreKnowledgeSources(options),second=await restoreKnowledgeSources(options);
  assert.deepEqual([...first],[...second]); assert.notEqual(first.get('e'),'e');
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM knowledge_entries WHERE owner_id=?').bind('alice').first()).n,1);
  const doc=await DB.prepare('SELECT object_key FROM knowledge_documents WHERE owner_id=?').bind('alice').first();
  assert.equal(await(await FILES.get(doc.object_key)).text(),'data');
 } finally {await worker.dispose();await rm(root,{recursive:true,force:true});}
});

test('recupera un proyecto enlazando sus capítulos a las entradas copiadas',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'project-restore'},r2Buckets:['FILES']}));
 const root=await mkdtemp(join(tmpdir(),'savia-project-knowledge-restore-'));
 try {
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();
  const knowledge={folders:[{id:'f',name:'Fuentes',created_at:'2026'}],documents:[{id:'d',folder_id:'f',name:'fuente.pdf',content_type:'application/pdf',size:4,created_at:'2026'}],indices:[{document_id:'d',revision:1}],entries:[{id:'e',document_id:'d',title:'Título',summary:'Resumen',quote:'Cita',sort_order:0}]};
  const node={id:'node',parentId:null,sortOrder:0,title:'Capítulo',description:'',content:'Texto',contentMode:'manual-fill',contentModeNote:'',sourceRequirementId:'',sourceRequirementTitle:'',knowledgeIdsJson:'["e"]',planJson:null,attr:null};
  const directory=join(root,'snapshot');
  await createComponentSnapshot(directory,{metadata:{project:{id:'p',title:'Proyecto'},files:[],assets:[],workflow:{stage:null,stageUpdatedAt:null,tasks:[],requirements:[]},technicalPlan:{nodes:[node]},knowledge},included:['project-header','project-files','project-workflow','technical-plan-nodes','plan-assets','project-knowledge'],omitted:['other-project-data','other-account-data','credentials'],objects:[{id:'knowledge:d',size:4,open:()=>Readable.from(['data'])}]});
  const missing=join(root,'missing');
  await createComponentSnapshot(missing,{metadata:{project:{id:'p',title:'Proyecto'},files:[],assets:[],workflow:{stage:null,stageUpdatedAt:null,tasks:[],requirements:[]},technicalPlan:{nodes:[node]},knowledge:{folders:[],documents:[],indices:[],entries:[]}},included:['project-header','project-files','project-workflow','technical-plan-nodes','plan-assets','project-knowledge'],omitted:['other-project-data','other-account-data','credentials'],objects:[]});
  let calls=0;await assert.rejects(restoreProjectComponents({server:'http://localhost',token:'test',directory:missing,fetchImpl:()=>{calls++;}}),/conocimiento/i);assert.equal(calls,0);
  const fetchImpl=async(url,options)=>{const parts=new URL(url).pathname.split('/'),request=new Request(url,options),runner={ownerId:'alice'},env={DB,FILES};
   if(parts[4]==='knowledge'){if(parts.at(-1)==='index')return restoreKnowledgeIndex(request,env,runner,parts[5],parts[7]);if(parts[6]==='folders')return importKnowledgeFolder(request,env,runner,parts[5],parts[7]);return importKnowledgeDocument(request,env,runner,parts[5],parts[7]);}
   if(parts.at(-1)==='workflow')return importDesktopWorkflow(request,env,runner,parts[5]);
   return importDesktopPlan(request,env,runner);};
  const accountDirectory=join(root,'account-snapshot'),accountKnowledge={kind:'account-knowledge',folders:[{...knowledge.folders[0],sort_order:0}],documents:[{...knowledge.documents[0],sort_order:0,missing_reason:null,restored_name:null,etag:'etag',version:'a'.repeat(64)}],indices:knowledge.indices,entries:knowledge.entries,importedItems:[]};
  await createComponentSnapshot(accountDirectory,{metadata:accountKnowledge,included:['account-knowledge'],omitted:['other-account-data','credentials'],objects:[{id:'knowledge:d',size:4,open:()=>Readable.from(['data'])}]});
  const mismatched=join(root,'account-mismatch');await createComponentSnapshot(mismatched,{metadata:accountKnowledge,included:['account-knowledge'],omitted:['other-account-data','credentials'],objects:[{id:'knowledge:d',size:4,open:()=>Readable.from(['else'])}]});let sent=0;await assert.rejects(restoreProjectComponents({server:'http://localhost',token:'test',directory,knowledgeDirectory:mismatched,fetchImpl:()=>{sent++;}}),/misma versión/);assert.equal(sent,0);const stale=join(root,'account-stale'),staleData={...accountKnowledge,indices:[{document_id:'d',revision:2}]};await createComponentSnapshot(stale,{metadata:staleData,included:['account-knowledge'],omitted:['other-account-data','credentials'],objects:[{id:'knowledge:d',size:4,open:()=>Readable.from(['data'])}]});await assert.rejects(restoreProjectComponents({server:'http://localhost',token:'test',directory,knowledgeDirectory:stale,fetchImpl:()=>{sent++;}}),/misma versión/);assert.equal(sent,0);
  await restoreAccountKnowledge({server:'http://localhost',token:'test',directory:accountDirectory,fetchImpl});
  const options={server:'http://localhost',token:'test',directory,knowledgeDirectory:accountDirectory,fetchImpl},first=await restoreProjectComponents(options),second=await restoreProjectComponents(options);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM knowledge_documents WHERE owner_id=?').bind('alice').first()).n,1);
  assert.equal(first.projectId,second.projectId);
  const saved=await DB.prepare('SELECT knowledge_item_ids_json FROM project_technical_plan_nodes WHERE project_id=?').bind(first.projectId).first();
  const [mapped]=JSON.parse(saved.knowledge_item_ids_json);assert.notEqual(mapped,'e');
  assert.equal((await DB.prepare('SELECT title FROM knowledge_entries WHERE id=? AND owner_id=?').bind(mapped,'alice').first()).title,'Título');
  await DB.prepare('UPDATE knowledge_indices SET mutation_id=? WHERE owner_id=?').bind('edited','alice').run();await assert.rejects(restoreProjectComponents(options),/409/);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM projects WHERE owner_id=?').bind('alice').first()).n,1);
 } finally {await worker.dispose();await rm(root,{recursive:true,force:true});}
});
