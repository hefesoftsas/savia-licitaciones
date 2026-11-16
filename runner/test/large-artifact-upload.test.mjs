import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {uploadLargeArtifact} from '../large-artifact-upload.mjs';

test('envía el archivo por partes y reintenta un fallo transitorio',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-artifact-'));try{const path=join(dir,'archivo.docx'),data=Buffer.alloc(25*1024*1024+1,1);await writeFile(path,data);let failures=0,startFailures=0,start,partBytes=0;const received=[];
  const fetchImpl=async(url,options)=>{if(url.endsWith('/start')){start=JSON.parse(options.body);if(!startFailures++)throw new Error('network');return Response.json({handle:'handle',partSize:10*1024*1024});}if(url.includes('/part/')){const n=Number(url.split('/').pop());if(n===2&&!failures++){throw new Error('network');}let count=0;for await(const chunk of options.body)count+=chunk.length;partBytes+=count;received.push(n);return Response.json({partNumber:n,etag:`etag-${n}`});}if(url.endsWith('/complete'))return Response.json({artifact:{id:'result',size:data.length}});throw Error('unexpected');};
  const artifact=await uploadLargeArtifact({server:'https://example.test',token:'fixture',jobId:'job',lease:'lease',path,fetchImpl,retryDelay:async()=>{}});assert.equal(artifact.id,'result');assert.equal(startFailures,2);assert.equal(start.size,data.length);assert.match(start.sha256,/^[a-f0-9]{64}$/);assert.equal(partBytes,data.length);assert.deepEqual(received,[1,2,3]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('recupera la confirmación si se pierde la respuesta al completar',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-artifact-retry-'));try{const path=join(dir,'file'),data=Buffer.alloc(25*1024*1024+1,2);await writeFile(path,data);let statusCalls=0;
  const fetchImpl=async(url,options)=>{if(url.endsWith('/start'))return Response.json({handle:'handle',partSize:10*1024*1024});if(url.includes('/part/')){for await(const _ of options.body){}return Response.json({partNumber:Number(url.split('/').pop()),etag:'etag'});}if(url.endsWith('/complete'))throw new Error('lost');if(url.endsWith('/status')){statusCalls++;return Response.json({artifact:{id:'confirmed',size:data.length}});}throw Error('unexpected');};
  const result=await uploadLargeArtifact({server:'https://example.test',token:'fixture',jobId:'job',lease:'lease',path,fetchImpl,retryDelay:async()=>{}});assert.equal(result.id,'confirmed');assert.equal(statusCalls,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('rechaza confirmaciones sin identificador o con tamaño distinto',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-artifact-invalid-'));try{const path=join(dir,'file'),data=Buffer.alloc(25*1024*1024+1,3);await writeFile(path,data);const fetchImpl=async(url)=>url.endsWith('/start')?Response.json({artifact:{id:'unexpected',size:1}}):Response.json({});await assert.rejects(uploadLargeArtifact({server:'https://example.test',token:'fixture',jobId:'job',lease:'lease',path,fetchImpl}),/respuesta|confirmación/i);}finally{await rm(dir,{recursive:true,force:true});}
});
