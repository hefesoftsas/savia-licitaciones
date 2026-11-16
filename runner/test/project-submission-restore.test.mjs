import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateProjectSubmission,restoreProjectSubmission} from '../project-submission-restore.mjs';

const hash=data=>createHash('sha256').update(data).digest('hex');
const sha256=hash('hola');
const file=(id,link)=>({id,...link,name:'Documento ñ.pdf',contentType:'application/pdf',size:4,sha256,createdAt:'2026-11-05'});
const fixture=()=>({requests:[{id:'r',kind:'correction',title:'Aclaración',dueDate:'',note:'',status:'reviewed',taskId:'eliminada',version:2,createdAt:'2026',updatedAt:'2026'}],results:[{id:'res',result:'awarded',note:'',createdAt:'2026'}],submissions:[{id:'s',date:'2026-11-05',reference:'RAD',version:'v1',note:'',createdAt:'2026'}],attachments:[file('a',{requestId:'r'})],evidence:[file('p',{submissionId:'s',role:'package'}),file('c',{submissionId:'s',role:'receipt'})]});
test('verifica metadatos, relaciones y contenido antes de restaurar',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-submission-restore-'));try{
  const objects=new Map();for(const [id,name] of [['submission-attachment:a','a.bin'],['submission-evidence:p','p.bin'],['submission-evidence:c','c.bin']]){await writeFile(join(directory,name),'hola');objects.set(id,{file:name,size:4,sha256});}
  assert.deepEqual(await validateProjectSubmission({submission:fixture(),objects,directory}),new Set(objects.keys()));
  for(const mutate of [x=>x.attachments[0].requestId='ausente',x=>x.evidence.pop(),x=>x.evidence[1].role='package',x=>x.requests.push({...x.requests[0]}),x=>x.requests[0].status='extraño',x=>x.submissions[0].date='2026-02-30']){const data=fixture();mutate(data);await assert.rejects(validateProjectSubmission({submission:data,objects,directory}));}
  await writeFile(join(directory,'a.bin'),'malo');await assert.rejects(validateProjectSubmission({submission:fixture(),objects,directory}),/inválid/);
  await rm(join(directory,'a.bin'));await symlink(join(directory,'p.bin'),join(directory,'a.bin'));await assert.rejects(validateProjectSubmission({submission:fixture(),objects,directory}),/inválid/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('restaura solicitudes antes de adjuntos y publica presentaciones con ambas evidencias',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-submission-restore-runner-'));try{
  const objects=new Map();for(const [id,name] of [['submission-attachment:a','a.bin'],['submission-evidence:p','p.bin'],['submission-evidence:c','c.bin']]){await writeFile(join(directory,name),'hola');objects.set(id,{file:name,size:4,sha256});}
  const calls=[],send=async(url,options)=>{calls.push({url,options});if(url.endsWith('/start'))return {handle:'handle',partSize:10*1024*1024};if(url.includes('/part/')){let content='';for await(const bytes of options.body)content+=bytes;assert.equal(content,'hola');return {partNumber:1,etag:'etag'};}if(url.endsWith('/complete'))return {stagedToken:'staged'};return {id:'restored'};};
  const result=await restoreProjectSubmission({submission:fixture(),objects,directory,server:'https://example.test',requestId:'restore',send});assert.deepEqual(result,{requests:1,results:1,attachments:1,submissions:1,removed:0});
  const requestIndex=calls.findIndex(x=>x.url.includes('/submission-tracking/requests/')),attachmentIndex=calls.findIndex(x=>x.url.includes('/submission-restores/attachments/')),recordCall=calls.find(x=>x.url.includes('/submission-restores/records/'));assert.ok(requestIndex>=0&&attachmentIndex>requestIndex);assert.deepEqual(JSON.parse(recordCall.options.body).evidence.map(x=>x.stagedToken),['staged','staged']);
  await writeFile(join(directory,'a.bin'),'malo');let sent=0;await assert.rejects(restoreProjectSubmission({submission:fixture(),objects,directory,server:'https://example.test',requestId:'restore',send:async()=>{sent++;}}));assert.equal(sent,0);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('reintenta una parte de un adjunto grande sin volver a comenzar la carga',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-submission-large-'));try{
  const bytes=Buffer.alloc(10*1024*1024+1,0x61),bigHash=hash(bytes),submission=fixture();submission.results=[];submission.submissions=[];submission.evidence=[];submission.attachments=[{...submission.attachments[0],size:bytes.length,sha256:bigHash}];await writeFile(join(directory,'large.bin'),bytes);const objects=new Map([['submission-attachment:a',{file:'large.bin',size:bytes.length,sha256:bigHash}]]);
  let starts=0,firstAttempts=0,total=0,completed=0;const send=async(url,options)=>{if(url.endsWith('/start')){starts++;return {handle:'h',partSize:10*1024*1024};}if(url.includes('/part/')){const n=Number(url.split('/').pop());if(n===1&&firstAttempts++===0)throw Object.assign(new Error('temporal'),{status:503});for await(const chunk of options.body)total+=chunk.length;return {partNumber:n,etag:`e${n}`};}if(url.endsWith('/complete')){completed++;return {stagedToken:'stage'};}return {id:'ok'};};
  const result=await restoreProjectSubmission({submission,objects,directory,server:'https://example.test',requestId:'restore',send});assert.equal(result.attachments,1);assert.equal(starts,1);assert.equal(firstAttempts,2);assert.equal(total,bytes.length);assert.equal(completed,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
