import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareReviewCapture} from '../project-review-capture.mjs';

test('descarga el informe seleccionado y comprueba la revisión de tareas',async()=>{
 const sha='a'.repeat(64),version='b'.repeat(64),revision='c'.repeat(64),calls=[];let current=revision;
 const tasks=[{id:'job',kind:'duplicate-check.analyze',state:'succeeded',artifact:{size:2,sha256:sha,etag:'etag',version},removals:[]},{id:'extract',kind:'rejection-check.extract',state:'succeeded',artifact:null,removals:[]}];
 const fetchImpl=async(url,options)=>{calls.push({url,options});return url.includes('/artifact/')?new Response('{}'):Response.json({revision:current,tasks});};
 const capture=await prepareReviewCapture({server:'https://example.test',token:'fixture',projectId:'p',fetchImpl});assert.deepEqual(capture.tasks,tasks);assert.equal(capture.objects.length,1);assert.equal(capture.objects[0].id,'review-artifact:job');assert.equal(capture.objects[0].sha256,sha);
 let text='';for await(const bytes of await capture.objects[0].open())text+=bytes;assert.equal(text,'{}');assert.ok(calls.every(call=>call.options.headers.authorization==='Bearer fixture'&&call.options.redirect==='error'));
 await capture.assertUnchanged();current='d'.repeat(64);await assert.rejects(capture.assertUnchanged(),/cambi/);
});
test('rechaza identificadores o sumas inválidas antes de descargar',async()=>{
 const fetchImpl=async()=>Response.json({revision:'a'.repeat(64),tasks:[{id:'../unsafe',artifact:{size:2,sha256:'b'.repeat(64),etag:'x',version:'c'.repeat(64)}}]});
 await assert.rejects(prepareReviewCapture({server:'https://example.test',token:'fixture',projectId:'p',fetchImpl}));
});
