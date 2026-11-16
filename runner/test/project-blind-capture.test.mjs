import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareBlindCapture} from '../project-blind-capture.mjs';

test('prepara descarga por objeto y detecta una revisión cambiada',async()=>{
 const sha='a'.repeat(64),version='b'.repeat(64),revision='c'.repeat(64),calls=[];let current=revision;
 const tasks=[{id:'job',kind:'blind-check.fix-report',state:'succeeded',artifact:{size:4,sha256:sha,etag:'etag-doc',version},report:{size:2,sha256:sha,etag:'etag-report',version}}];
 const fetchImpl=async(url,options)=>{calls.push({url,options});if(url.includes('/artifact/'))return new Response('docx');if(url.includes('/report/'))return new Response('{}');return Response.json({revision:current,tasks});};
 const capture=await prepareBlindCapture({server:'https://example.test',token:'fixture-token',projectId:'project',fetchImpl});
 assert.deepEqual(capture.tasks,tasks);assert.deepEqual(capture.objects.map(item=>item.id),['blind-artifact:job','blind-report:job']);
 assert.equal(capture.objects[0].sha256,sha);let body='';for await(const chunk of await capture.objects[0].open())body+=chunk;assert.equal(body,'docx');
 assert.ok(calls.every(call=>call.options.headers.authorization==='Bearer fixture-token'&&call.options.redirect==='error'));
 await capture.assertUnchanged();current='d'.repeat(64);await assert.rejects(capture.assertUnchanged(),/cambi/);
});

test('rechaza metadatos y rutas de objetos inválidos antes de descargar',async()=>{
 const fetchImpl=async()=>Response.json({revision:'a'.repeat(64),tasks:[{id:'../invalid',artifact:{size:2,sha256:'b'.repeat(64),etag:'x',version:'c'.repeat(64)},report:null}]});
 await assert.rejects(prepareBlindCapture({server:'https://example.test',token:'fixture',projectId:'p',fetchImpl}));
});

test('admite copias corregidas grandes sin ampliar los informes JSON',async()=>{
 const large={size:25*1024*1024+1,sha256:'b'.repeat(64),etag:'x',version:'c'.repeat(64)},base={id:'job',kind:'blind-check.fix',artifact:large,report:null};let tasks=[base];const fetchImpl=async()=>Response.json({revision:'a'.repeat(64),tasks});const prepared=await prepareBlindCapture({server:'https://example.test',token:'fixture',projectId:'p',fetchImpl});assert.equal(prepared.objects[0].size,large.size);tasks=[{...base,kind:'blind-check.inspect'}];await assert.rejects(prepareBlindCapture({server:'https://example.test',token:'fixture',projectId:'p',fetchImpl}));tasks=[{...base,artifact:null,report:large}];await assert.rejects(prepareBlindCapture({server:'https://example.test',token:'fixture',projectId:'p',fetchImpl}));
});
