import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const blindModule=process.env.SAVIA_TEST_PACKAGED_RUNNER?pathToFileURL(join(process.env.SAVIA_TEST_PACKAGED_RUNNER,'runner','blind-check.mjs')).href:new URL('../blind-check.mjs',import.meta.url).href;
const {inspectBlindDocument,collectBlindImageColors}=await import(blindModule);
import {exportTechnicalPlan} from '../technical-plan-export.mjs';
const require=createRequire(new URL('../../client/package.json',import.meta.url));
const {findBuiltinPreset}=require('./electron/services/blindCheckPresets.cjs');

test('inspecciona un DOCX real, detecta términos y limpia los archivos temporales', {timeout:240000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-blind-test-'));
 try{
  const doc=await exportTechnicalPlan({projectTitle:'Oferta',outline:[{id:'a',title:'Alcance',number:'1',content_mode:'manual-fill',content:'La empresa Acme ofrece el servicio.',children:[]}]},{tempRoot:root});
  const profile=findBuiltinPreset('builtin-general').profile;
  const result=await inspectBlindDocument({fileName:'oferta.docx',bytes:doc.bytes,profile,sensitiveWords:[{text:'Acme',source:'custom'}]},{tempRoot:root});
  assert.ok(result.stats.paragraphs>0);assert.ok(result.groups.some(group=>JSON.stringify(group).includes('Acme')));assert.ok(Array.isArray(result.ruleErrors));assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('rechaza archivos incompatibles y limpia el espacio si falla el helper',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-blind-error-'));
 try{
  const profile=findBuiltinPreset('builtin-general').profile;
  await assert.rejects(inspectBlindDocument({fileName:'oferta.pdf',bytes:Buffer.from('invalid'),profile,sensitiveWords:[]},{tempRoot:root}),/docx/i);
  let closed=false;
  await assert.rejects(inspectBlindDocument({fileName:'oferta.docx',bytes:Buffer.from('bad'),profile,sensitiveWords:[]},{tempRoot:root,createHelper:()=>({runBlindCheck:async()=>{throw new Error('helper failure');},close:async()=>{closed=true;}}),collectColors:async()=>[]}),/helper failure/);
  assert.equal(closed,true);assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});


test('clasifica imágenes por píxeles y respeta la cancelación',async()=>{
 const sharp=require('sharp'),AdmZip=require('adm-zip'),zip=new AdmZip();
 const make=background=>sharp({create:{width:12,height:12,channels:4,background}}).png().toBuffer();
 zip.addFile('word/media/rojo.png',await make({r:255,g:0,b:0,alpha:1}));
 zip.addFile('word/media/gris.png',await make({r:80,g:80,b:80,alpha:1}));
 zip.addFile('word/media/transparente.png',await make({r:255,g:0,b:0,alpha:0}));
 zip.addFile('word/media/semitransparente.png',await make({r:70,g:0,b:0,alpha:0.5}));
 const facts=await collectBlindImageColors(zip.toBuffer());
 assert.deepEqual(facts.map(item=>[item.part,item.color,item.color_ratio]),[['word/media/gris.png',false,0],['word/media/rojo.png',true,1],['word/media/semitransparente.png',false,0],['word/media/transparente.png',false,0]]);
 const controller=new AbortController();controller.abort();await assert.rejects(collectBlindImageColors(zip.toBuffer(),{signal:controller.signal}),{name:'AbortError'});
});

test('conserva el informe local si falla la revisión Pi y exige consentimiento',async()=>{
 const {createBlindJobHandler}=await import(blindModule);const root=await mkdtemp(join(tmpdir(),'savia-blind-pi-'));
 try{
  const doc=await exportTechnicalPlan({projectTitle:'Oferta',outline:[{id:'a',title:'Alcance',number:'1',content_mode:'manual-fill',content:'La empresa Acme ofrece el servicio.',children:[]}]},{tempRoot:root});
  const base={fileIds:['bid'],bidFileId:'bid',language:'es',preset:'builtin-general',sensitiveWords:['Acme'],aiReview:true,dataProcessingConsent:true};let uploaded;
  const context={job:{id:'job'},signal:new AbortController().signal,getFileInfo:async()=>({name:'oferta.docx',bytes:doc.bytes}),getCredential:async()=>({provider:'opencode-go',model:'fixture',secret:'secret-123'}),uploadArtifact:async bytes=>{uploaded=JSON.parse(bytes);return {id:'artifact'};}};
  const handler=createBlindJobHandler({tempRoot:root,createRuntime:()=>({runTask:async()=>{throw new Error('fallo secret-123');},close:async()=>{}}),createAiService:()=>({})});
  await assert.rejects(handler({...base,dataProcessingConsent:false},context),/consentimiento/i);
  const result=await handler(base,context);assert.equal(result.artifactId,'artifact');assert.ok(uploaded.groups.some(group=>group.ruleId==='privacy.keyword'));assert.equal(uploaded.aiReview.status,'error');assert.equal(JSON.stringify(uploaded).includes('secret-123'),false);assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('guarda la revisión Pi validada sin requerir un método de persistencia en el runtime',async()=>{
 const {createBlindJobHandler}=await import(blindModule);const root=await mkdtemp(join(tmpdir(),'savia-blind-pi-ok-'));
 try{
  const doc=await exportTechnicalPlan({projectTitle:'Oferta',outline:[{id:'a',title:'Alcance',number:'1',content_mode:'manual-fill',content:'La empresa Acme ofrece el servicio.',children:[]}]},{tempRoot:root});let report,seen=false;
  const handler=createBlindJobHandler({tempRoot:root,createAiService:({configStore})=>{const c=configStore.load();assert.equal(c.text_model_provider,'anthropic-api');assert.equal(c.base_url,'https://api.anthropic.com');assert.equal(c.web_runner_anthropic_native,true);assert.equal(c.reasoning_effort,'');return {};},createRuntime:()=>({runTask:async task=>{seen=true;assert.equal(task.secop_safe_tools,true);const groups=JSON.parse(task.files.find(file=>file.path.includes('程序检查结果')).content);const output={summary:'Revisión realizada.',clauses:[],issues:[],candidates:groups.filter(group=>group.candidate).map(group=>({id:group.id,verdict:'uncertain',reason:'Revisar manualmente.'}))};const validated=task.validateOutput({output_content:JSON.stringify(output)});assert.ok(validated.value,JSON.stringify(validated.issues));return {validation_result:validated.value};},close:async()=>{throw new Error('close failure');}})});
  const payload={fileIds:['bid'],bidFileId:'bid',language:'es',preset:'builtin-general',sensitiveWords:['Acme'],aiReview:true,dataProcessingConsent:true};
  const context={job:{id:'job'},signal:new AbortController().signal,getFileInfo:async()=>({name:'oferta.docx',bytes:doc.bytes}),getCredential:async()=>({provider:'anthropic-api',model:'fixture',secret:'sk-ant-api-fixture'}),uploadArtifact:async bytes=>{report=JSON.parse(bytes);return {id:'artifact'};}};
  await handler(payload,context);assert.equal(seen,true);assert.equal(report.aiReview.status,'success');assert.equal(report.aiReview.review.summary,'Revisión realizada.');assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('corrige una copia con el helper real y conserva el documento original',async()=>{
 const {repairBlindDocument}=await import(blindModule);const root=await mkdtemp(join(tmpdir(),'savia-blind-fix-'));
 try{
  const {Document,Packer,Paragraph}=require('docx'),AdmZip=require('adm-zip');
  const original=await Packer.toBuffer(new Document({creator:'Entidad Privada',sections:[{children:[new Paragraph('Texto de la oferta.')]}]})),before=Buffer.from(original);
  const result=await repairBlindDocument({fileName:'oferta.docx',bytes:original,profile:findBuiltinPreset('builtin-general').profile,sensitiveWords:[],fixRules:['struct.doc_props']},{tempRoot:root});
  assert.ok(new AdmZip(original).readAsText('docProps/core.xml').includes('Entidad Privada'));assert.ok(!new AdmZip(result.bytes).readAsText('docProps/core.xml').includes('Entidad Privada'));assert.deepEqual(original,before);assert.ok(result.report.validation.checked);assert.ok(result.report.fixes['struct.doc_props']>0);assert.ok(result.report.after.stats.paragraphs>0);assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('convierte imágenes seleccionadas a gris en la copia y vuelve a inspeccionarla',async()=>{
 const {repairBlindDocument}=await import(blindModule),{Document,Packer,Paragraph,ImageRun}=require('docx'),AdmZip=require('adm-zip'),sharp=require('sharp'),root=await mkdtemp(join(tmpdir(),'savia-blind-gray-'));
 try{
  const color=await sharp({create:{width:12,height:12,channels:4,background:{r:255,g:0,b:0,alpha:1}}}).png().toBuffer();
  const original=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph({children:[new ImageRun({data:color,type:'png',transformation:{width:12,height:12}})]})]}]}));
  const profile=findBuiltinPreset('builtin-general').profile;profile.image.check_color=true;
  const sourceFile={body:new ReadableStream({start(controller){controller.enqueue(original);controller.close();}})};const result=await repairBlindDocument({fileName:'oferta.docx',sourceFile,profile,sensitiveWords:[],fixRules:['image.color']},{tempRoot:root});
  const sourceFacts=await collectBlindImageColors(original),fixedFacts=await collectBlindImageColors(result.bytes);assert.equal(sourceFacts[0].color,true);assert.equal(fixedFacts[0].color,false);assert.equal(result.report.fixes['image.color'],1);assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('revisa y corrige con Pi en una sesión temporal, sin cambiar el original',async()=>{
 const {repairBlindDocument}=await import(blindModule);const {Document,Packer,Paragraph}=require('docx'),root=await mkdtemp(join(tmpdir(),'savia-blind-ai-fix-'));
 try{
  const bytes=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('La oferta de Acme cumple los requisitos.')]}]})),before=Buffer.from(bytes),profile=findBuiltinPreset('builtin-general').profile;
  let phases=[],target='',failAfterEdit=false;
  const store=require('./electron/services/pi/piPersistentTaskStore.cjs');
  const createRuntime=({app})=>({runTask:async task=>{phases.push(task.initial_stage);
   if(task.initial_stage==='blind-check-review'){
    store.createPersistentAgentTask(app,'blind-check-review',{run_id:task.task_id,session_file:'fixture.jsonl'});
    const dump=task.files.find(file=>file.path.includes('标书正文')).content;target=dump.split('\n').map(line=>/^\[([^\]]+)\] .*Acme/.exec(line)?.[1]).find(Boolean);assert.ok(target);const groups=JSON.parse(task.files.find(file=>file.path.includes('程序检查结果')).content),output={summary:'Revisión',clauses:[],issues:[{id:'a1',title:'Nombre',severity:'high',category:'privacy',basis:'Regla de anonimato',detail:'Nombre del oferente',suggestion:'Retirar',locations:[{target,text:'Acme'}]}],candidates:groups.filter(group=>group.candidate).map(group=>({id:group.id,verdict:'uncertain',reason:'Revisar'}))};const checked=task.validateOutput({output_content:JSON.stringify(output)});assert.ok(checked.value,JSON.stringify(checked.issues));return {validation_result:checked.value};
   }
   const open=JSON.parse(task.files.find(file=>file.path.includes('待处理问题')).content),Type=new Proxy({}, {get:()=>()=>({})}),workspaceDir=store.loadPersistentAgentTask(app,'blind-check-review').paths.workspaceDir,tools=task.create_tools({Type,workspaceDir}),edit=tools.find(tool=>tool.name==='apply-edits'),applied=await edit.execute('edit',{edits:[{issue:'a1',op:'replace',target,find:'Acme',replace:'licitante'}]});assert.equal(applied.details.applied,1);if(failAfterEdit)throw new Error('simulated failure');const output={summary:'Revisión manual',items:open.map(item=>item.id==='a1'?{id:item.id,action:'fixed',reason:'',suggestion:''}:{id:item.id,action:'manual',reason:'Requiere confirmación',suggestion:'Revisar'}),clauses:[]};const checked=await task.validateOutput({output_content:JSON.stringify(output)});assert.ok(checked.value,JSON.stringify(checked.issues));return {validation_result:checked.value};
  },close:async()=>{}});
  const result=await repairBlindDocument({fileName:'oferta.docx',bytes,profile,sensitiveWords:[{text:'Acme',source:'custom'}],fixRules:[]},{tempRoot:root,aiRepair:{language:'es',credential:{provider:'openai-api',model:'fixture',secret:'fixture-secret'},createAiService:({configStore})=>{const c=configStore.load();assert.equal(c.text_model_provider,'openai-api');assert.equal(c.base_url,'https://api.openai.com/v1');assert.equal(c.reasoning_effort,'');return {};},createRuntime}});
  assert.deepEqual(phases,['blind-check-review','blind-check-fix']);assert.equal(result.report.aiRepair.status,'success');assert.equal(result.report.aiRepair.edits.length,1);assert.ok(!new (require('adm-zip'))(result.bytes).readAsText('word/document.xml').includes('Acme'));assert.deepEqual(bytes,before);assert.ok(result.bytes.length);assert.deepEqual(await readdir(root),[]);
  failAfterEdit=true;const partial=await repairBlindDocument({fileName:'oferta.docx',bytes,profile,sensitiveWords:[{text:'Acme',source:'custom'}],fixRules:[]},{tempRoot:root,aiRepair:{language:'es',credential:{provider:'opencode-go',model:'fixture',secret:'fixture-secret'},createAiService:()=>({}),createRuntime}});
  assert.equal(partial.report.aiRepair.status,'error');assert.equal(partial.report.aiRepair.edits.length,1);assert.ok(!new (require('adm-zip'))(partial.bytes).readAsText('word/document.xml').includes('Acme'));assert.ok(partial.report.after.stats.paragraphs>0);assert.deepEqual(bytes,before);assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('cancela la reparación con Pi sin entregar una copia parcial',async()=>{
 const {createBlindFixJobHandler}=await import(blindModule),{Document,Packer,Paragraph}=require('docx'),root=await mkdtemp(join(tmpdir(),'savia-blind-ai-cancel-'));
 try{
  const bytes=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('La empresa Acme ofrece el servicio.')]}]})),controller=new AbortController();let uploads=0;
  const handler=createBlindFixJobHandler({tempRoot:root,createAiService:()=>({}),createRuntime:()=>({runTask:async()=>{controller.abort();controller.signal.throwIfAborted();},close:async()=>{}})});
  await assert.rejects(handler({fileIds:['bid'],language:'es',profile:findBuiltinPreset('builtin-general').profile,sensitiveWords:[],fixRules:[],aiRepair:true,dataProcessingConsent:true,reportVersion:1},{job:{id:'job'},signal:controller.signal,getFileInfo:async()=>({name:'oferta.docx',bytes}),getCredential:async()=>({provider:'opencode-go',model:'fixture',secret:'secret'}),uploadArtifact:async()=>{uploads++;}}),{name:'AbortError'});
  assert.equal(uploads,0);assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('inspecciona el DOCX recibido por flujo y limpia el temporal',{timeout:240000},async()=>{
 const {createBlindJobHandler}=await import(blindModule),root=await mkdtemp(join(tmpdir(),'savia-blind-stream-'));try{const doc=await exportTechnicalPlan({projectTitle:'Oferta',outline:[{id:'a',title:'Alcance',number:'1',content_mode:'manual-fill',content:'Servicio de prueba.',children:[]}]},{tempRoot:root}),profile=findBuiltinPreset('builtin-general').profile;profile.image={...profile.image,check_color:false};let report;
 const context={job:{id:'job'},signal:new AbortController().signal,getFileInfo:async()=>{throw Error('no usar buffer');},getFileStream:async()=>({name:'oferta.docx',body:new ReadableStream({start(c){c.enqueue(doc.bytes);c.close();}})}),uploadArtifact:async bytes=>{report=JSON.parse(bytes);return {id:'artifact'};}};
 const result=await createBlindJobHandler({tempRoot:root})({fileIds:['bid'],bidFileId:'bid',preset:'project',profile,sensitiveWords:[]},context);assert.equal(result.artifactId,'artifact');assert.ok(report.stats.paragraphs>0);assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('corrige el DOCX recibido por flujo y entrega la copia',{timeout:240000},async()=>{
 const {createBlindFixJobHandler}=await import(blindModule),root=await mkdtemp(join(tmpdir(),'savia-blind-fix-stream-'));try{const {Document,Packer,Paragraph}=require('docx'),original=await Packer.toBuffer(new Document({creator:'Empresa',sections:[{children:[new Paragraph('Texto de prueba')]}]})),profile=findBuiltinPreset('builtin-general').profile;profile.image={...profile.image,check_color:false};let result;
 const context={job:{id:'job'},signal:new AbortController().signal,getFileInfo:async()=>{throw Error('no usar buffer');},getFileStream:async()=>({name:'oferta.docx',body:new ReadableStream({start(c){c.enqueue(original);c.close();}})}),uploadArtifact:async bytes=>{result=Buffer.from(bytes);return {id:'artifact'};}};
 const response=await createBlindFixJobHandler({tempRoot:root})({fileIds:['bid'],profile,sensitiveWords:[],fixRules:['struct.doc_props'],inspectionJobId:'inspection'},context);assert.equal(response.artifactId,'artifact');assert.ok(result.length>0);assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('entrega una copia grande desde el archivo temporal antes de limpiarlo',{timeout:240000},async()=>{
 const {repairBlindDocument}=await import(blindModule),{readFile}=await import('node:fs/promises'),root=await mkdtemp(join(tmpdir(),'savia-blind-delivery-'));try{const {Document,Packer,Paragraph}=require('docx'),original=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('Texto de prueba')]}]})),profile=findBuiltinPreset('builtin-general').profile;let size=0;
 const result=await repairBlindDocument({fileName:'oferta.docx',bytes:original,profile,sensitiveWords:[],fixRules:['struct.doc_props']},{tempRoot:root,largeArtifactThreshold:1,deliverLargeFile:async path=>{size=(await readFile(path)).length;return {id:'artifact',size};}});assert.equal(result.artifact.id,'artifact');assert.ok(size>0);assert.equal(result.bytes,undefined);assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('la tarea entrega el archivo grande antes de retirar el espacio temporal',{timeout:240000},async()=>{
 const {createBlindFixJobHandler}=await import(blindModule),{readFile}=await import('node:fs/promises'),root=await mkdtemp(join(tmpdir(),'savia-blind-job-delivery-'));try{const {Document,Packer,Paragraph}=require('docx'),original=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('Texto')]}]})),profile=findBuiltinPreset('builtin-general').profile;profile.image={...profile.image,check_color:false};let delivered=false,recovery;
 const context={job:{id:'job'},signal:new AbortController().signal,getFileInfo:async()=>({name:'oferta.docx',bytes:original}),uploadArtifactFile:async (path,data)=>{assert.ok((await readFile(path)).length>0);recovery=data;delivered=true;return {id:'large'};},uploadArtifact:async()=>{throw Error('no cargar en memoria');}};
 const result=await createBlindFixJobHandler({tempRoot:root,largeArtifactThreshold:1})({fileIds:['bid'],profile,sensitiveWords:[],fixRules:['struct.doc_props'],inspectionJobId:'inspection'},context);assert.equal(result.artifactId,'large');assert.equal(delivered,true);assert.equal(recovery.report,null);assert.equal(recovery.resultBase.inspectionJobId,'inspection');assert.deepEqual(recovery.resultBase.fixes,result.fixes);assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});
