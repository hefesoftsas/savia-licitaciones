import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareSubmissionCapture} from '../project-submission-capture.mjs';

const hash='a'.repeat(64),revision='b'.repeat(64),version='c'.repeat(64);
const fixture=()=>({revision,requests:[{id:'request',taskId:'old-task'}],results:[{id:'result'}],submissions:[{id:'submission'}],attachments:[{id:'attachment',requestId:'request',size:2,sha256:hash,etag:'etag',version}],evidence:[{id:'package',submissionId:'submission',role:'package',size:2,sha256:hash,etag:'etag',version},{id:'receipt',submissionId:'submission',role:'receipt',size:2,sha256:hash,etag:'etag',version}]});
test('prepara descargas condicionales y detecta cambios en la revisión',async()=>{
 let current=revision;const calls=[];const fetchImpl=async(url,options)=>{calls.push({url,options});return /\/(attachments|evidence)\//.test(url)?new Response('ok'):Response.json({...fixture(),revision:current});};
 const capture=await prepareSubmissionCapture({server:'https://example.test',token:'fixture',projectId:'p',fetchImpl});
 assert.equal(capture.objects.length,3);assert.equal(capture.objects[0].id,'submission-attachment:attachment');assert.equal(capture.objects[0].sha256,hash);
 let body='';for await(const bytes of await capture.objects[0].open())body+=bytes;assert.equal(body,'ok');assert.match(calls[1].url,/etag=etag&version=/);assert.ok(calls.every(call=>call.options.headers.authorization==='Bearer fixture'&&call.options.redirect==='error'));
 await capture.assertUnchanged();current='d'.repeat(64);await assert.rejects(capture.assertUnchanged(),/cambi/);
});
test('rechaza relaciones incompletas, identificadores duplicados y archivos inválidos',async()=>{
 for(const mutate of [x=>x.attachments[0].requestId='missing',x=>x.evidence.pop(),x=>x.requests.push({...x.requests[0]}),x=>x.evidence[0].sha256='bad',x=>x.evidence[0].id='../bad']){
  const data=fixture();mutate(data);await assert.rejects(prepareSubmissionCapture({server:'https://example.test',token:'fixture',projectId:'p',fetchImpl:async()=>Response.json(data)}));
 }
});
