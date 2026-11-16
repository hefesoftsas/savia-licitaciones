import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateProjectBlindTasks,restoreProjectBlindTasks} from '../project-blind-restore.mjs';

test('valida informes anónimos, correcciones y ausencias antes de restaurar',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-blind-restore-'));
 try{
  const objects=new Map();
  const add=async(id,data)=>{const bytes=Buffer.from(data),sha256=createHash('sha256').update(bytes).digest('hex'),file=`${objects.size}.bin`;await writeFile(join(directory,file),bytes);objects.set(id,{id,file,size:bytes.length,sha256});return {size:bytes.length,sha256};};
  const artifact=await add('blind-artifact:inspection',JSON.stringify({sourceFile:{id:'file-1',name:'oferta.docx'},groups:[],summary:{total:0}}));
  const corrected=await add('blind-artifact:fix',Buffer.from([0x50,0x4b,0x03,0x04,0x41]));
  const report=await add('blind-report:fix',JSON.stringify({after:{groups:[]}}));
  const tasks=[{id:'inspection',kind:'blind-check.inspect',state:'succeeded',payload:{fileIds:['file-1']},result:{},createdAt:'2026',updatedAt:'2026',artifact,report:null},
   {id:'fix',kind:'blind-check.fix-report',state:'succeeded',payload:{fileIds:['file-1'],inspectionJobId:'inspection',reportVersion:1},result:{},createdAt:'2026',updatedAt:'2026',artifact:corrected,report},
   {id:'active',kind:'blind-check.fix-ai',state:'interrupted',payload:{fileIds:['deleted-file'],inspectionJobId:'deleted-inspection'},result:null,createdAt:'2026',updatedAt:'2026',artifact:null,report:null}];
  assert.deepEqual(await validateProjectBlindTasks({tasks,objects,directory}),new Set(objects.keys()));
  const calls=[];await restoreProjectBlindTasks({tasks:[tasks[1],tasks[2],tasks[0]],objects,directory,server:'https://example.test',requestId:'request',send:async(url,options)=>{calls.push({url,options});return {jobId:'new'};}});
  const metadata=calls.map(call=>JSON.parse(call.options.body.get('metadata')));
  assert.equal(metadata[0].id,'inspection');assert.equal(metadata[1].id,'fix');assert.equal(metadata[1].parentExpected,true);assert.equal(metadata[2].parentExpected,false);
  assert.equal(await calls[0].options.body.get('artifact').text(),JSON.stringify({sourceFile:{id:'file-1',name:'oferta.docx'},groups:[],summary:{total:0}}));
  assert.equal(await calls[1].options.body.get('report').text(),JSON.stringify({after:{groups:[]}}));
  assert.match(calls[0].url,new RegExp(`/blind-tasks/${createHash('sha256').update('inspection').digest('hex')}$`));
  const resumed=await restoreProjectBlindTasks({tasks,objects,directory,server:'https://example.test',requestId:'request',send:async(url)=>{if(url.includes(hashId('inspection')))throw Object.assign(new Error('removed'),{status:410});return {};}});assert.deepEqual(resumed,{imported:2,removed:1});
  await assert.rejects(restoreProjectBlindTasks({tasks,objects,directory,server:'https://example.test',requestId:'request',send:async()=>{throw Object.assign(new Error('offline'),{status:503});}}),/offline/);
  await assert.rejects(validateProjectBlindTasks({tasks:[...tasks,tasks[0]],objects,directory}));
  await assert.rejects(validateProjectBlindTasks({tasks:[{...tasks[1],report:null}],objects,directory}));
  await assert.rejects(validateProjectBlindTasks({tasks:[{...tasks[0],artifact:{...artifact,sha256:'0'.repeat(64)}}],objects,directory}));
  await assert.rejects(validateProjectBlindTasks({tasks:[{...tasks[0],payload:{fileIds:['different']}}],objects,directory}));
  await assert.rejects(validateProjectBlindTasks({tasks:[{...tasks[1],payload:{...tasks[1].payload,inspectionJobId:'fix'}}],objects,directory}));
  await writeFile(join(directory,objects.get('blind-report:fix').file),'alterado');await assert.rejects(validateProjectBlindTasks({tasks,objects,directory}));
 }finally{await rm(directory,{recursive:true,force:true});}
});
function hashId(value){return createHash('sha256').update(value).digest('hex');}

test('valida una copia DOCX grande por flujo y detecta corrupción',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-blind-large-'));try{const bytes=Buffer.alloc(25*1024*1024+1,0x41);Buffer.from([0x50,0x4b,3,4]).copy(bytes);const sha256=hashId(bytes),entry={file:'file.bin',size:bytes.length,sha256},objects=new Map([['blind-artifact:fix',entry]]),task={id:'fix',kind:'blind-check.fix',state:'succeeded',payload:{fileIds:['source'],inspectionJobId:'old'},result:{},createdAt:'2026',updatedAt:'2026',artifact:{size:bytes.length,sha256},report:null};await writeFile(join(directory,entry.file),bytes);assert.deepEqual(await validateProjectBlindTasks({tasks:[task],objects,directory}),new Set(['blind-artifact:fix']));let sentBytes=0,submitted=false;await restoreProjectBlindTasks({tasks:[task],objects,directory,server:'https://example.test',requestId:'req',send:async(url,options)=>{if(url.endsWith('/large-artifact/start'))return {handle:'h',partSize:10*1024*1024};if(url.includes('/large-artifact/part/')){for await(const chunk of options.body)sentBytes+=chunk.length;return {partNumber:Number(url.split('/').pop()),etag:'etag'};}if(url.endsWith('/large-artifact/complete'))return {stagedToken:'stage'};submitted=true;assert.equal(options.body.get('stagedArtifact'),'stage');assert.equal(options.body.get('artifact'),null);return {};}});assert.equal(submitted,true);assert.equal(sentBytes,bytes.length);bytes[10]=0x42;await writeFile(join(directory,entry.file),bytes);await assert.rejects(validateProjectBlindTasks({tasks:[task],objects,directory}));}finally{await rm(directory,{recursive:true,force:true});}
});
