import {test} from 'node:test';
import assert from 'node:assert/strict';
import {uploadLargeProjectFile} from '../src/features/web/project-multipart-upload.mjs';

test('sube partes acotadas y reintenta sin cargar el archivo completo',async()=>{
 const size=50*1024*1024+1,file={name:'oferta.pdf',type:'application/pdf',size,slice:(start,end)=>({start,end})},calls=[],progress=[];let failed=false;
 const request=async(url,options)=>{calls.push({url,options});if(url.endsWith('/start'))return {handle:'handle',partSize:10*1024*1024};if(url.includes('/part/')){const n=Number(url.split('/').pop());if(n===2&&!failed){failed=true;throw Object.assign(new Error('network'),{status:503});}return {partNumber:n,etag:`etag-${n}`};}if(url.endsWith('/complete'))return {file:{id:'file'}};throw Error('unexpected');};
 assert.deepEqual(await uploadLargeProjectFile({projectId:'p',file,key:'id',request,retryDelay:async()=>{},onProgress:(uploaded,total)=>progress.push([uploaded,total])}),{file:{id:'file'}});assert.equal(calls.filter(c=>c.url.includes('/part/')).length,7);assert.deepEqual(calls.at(-1).options.json.parts.map(x=>x.partNumber),[1,2,3,4,5,6]);assert.equal(calls.at(-2).options.body.end,size);assert.equal(calls[0].options.json.requestKey,'id');assert.equal(progress.length,6);assert.deepEqual(progress.at(-1),[size,size]);
});
test('aborta si una parte falla y rechaza archivos por encima del límite',async()=>{
 const calls=[],file={name:'x',type:'',size:50*1024*1024+1,slice:()=>({})};const request=async(url)=>{calls.push(url);if(url.endsWith('/start'))return {handle:'handle',partSize:10*1024*1024};if(url.endsWith('/abort'))return {};throw Object.assign(new Error('rechazado'),{status:403});};
 await assert.rejects(uploadLargeProjectFile({projectId:'p',file,key:'id',request,retryDelay:async()=>{}}),/rechazado/);assert.ok(calls.at(-1).endsWith('/abort'));calls.length=0;await assert.rejects(uploadLargeProjectFile({projectId:'p',file:{...file,size:1024*1024*1024+1},key:'id',request}),/1 GiB/);assert.equal(calls.length,0);
});
