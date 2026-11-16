import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateProjectReviewTasks,restoreProjectReviewTasks} from '../project-review-restore.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');

test('valida y transmite informes, criterios y hallazgos retirados',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-review-restore-'));
 try{
  const report=Buffer.from(JSON.stringify({status:'success',sourceFiles:[{id:'f',name:'Oferta'}],rejectionCheckResult:{findings:[{id:'one',bidDocumentId:'f'}]}}));await writeFile(join(directory,'report'),report);
  const objects=new Map([['review-artifact:reject',{id:'review-artifact:reject',file:'report',size:report.length,sha256:hash(report)}]]);
  const tasks=[{id:'reject',kind:'rejection-check.analyze',state:'succeeded',payload:{fileIds:['f'],tenderFileIds:[],bidFileIds:['f']},result:{artifactId:'old'},createdAt:'2026',updatedAt:'2026',artifact:{size:report.length,sha256:hash(report)},removals:[{section:'rejection',findingId:'one',createdAt:'2026'}]},
   {id:'extract',kind:'rejection-check.extract',state:'succeeded',payload:{fileIds:['f']},result:{criteria:'Causales',sourceFiles:[{id:'f',name:'Pliego'}]},createdAt:'2026',updatedAt:'2026',artifact:null,removals:[]}];
  assert.deepEqual(await validateProjectReviewTasks({tasks,objects,directory}),new Set(['review-artifact:reject']));
  const calls=[];await restoreProjectReviewTasks({tasks,objects,directory,server:'https://example.test',requestId:'req',send:async(url,options)=>{calls.push({url,options});return {jobId:'new'};}});
  assert.equal(JSON.parse(calls[0].options.body.get('metadata')).removals[0].findingId,'one');assert.equal(await calls[0].options.body.get('artifact').text(),report.toString());assert.match(calls[0].url,new RegExp(`/review-tasks/${hash('reject')}$`));assert.equal(calls[1].options.body.get('artifact'),null);
  await assert.rejects(validateProjectReviewTasks({tasks:[...tasks,tasks[0]],objects,directory}));
  await assert.rejects(validateProjectReviewTasks({tasks:[{...tasks[0],removals:[{section:'rejection',findingId:'absent',createdAt:'2026'}]}],objects,directory}));
  await writeFile(join(directory,'report'),'changed');await assert.rejects(validateProjectReviewTasks({tasks,objects,directory}));
 }finally{await rm(directory,{recursive:true,force:true});}
});
