import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {restoreLargeProjectFile} from '../project-multipart-restore.mjs';

test('reintenta una parte temporalmente rechazada sin volver a generar la captura',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-multipart-retry-'));
 try{
  const path=join(dir,'file'),data=Buffer.alloc(10*1024*1024+1,0x61);await writeFile(path,data);let attempts=0,aborted=false;
  const send=async(url,options)=>{if(url.endsWith('/start'))return {handle:'handle',partSize:10*1024*1024};if(url.endsWith('/abort')){aborted=true;return {};}
   if(url.endsWith('/part/1')){attempts++;for await(const ignored of options.body){}if(attempts===1)throw Object.assign(new Error('temporal'),{status:503});return {partNumber:1,etag:'one'};}
   if(url.endsWith('/part/2')){let bytes=0;for await(const chunk of options.body)bytes+=chunk.length;assert.equal(bytes,1);return {partNumber:2,etag:'two'};}
   if(url.endsWith('/complete')){assert.deepEqual(JSON.parse(options.body).parts,[{partNumber:1,etag:'one'},{partNumber:2,etag:'two'}]);return {};}
   throw new Error('unexpected');};
  await restoreLargeProjectFile({url:'http://localhost/file',path,entry:{size:data.length,sha256:'a'.repeat(64)},name:'a',contentType:'text/plain',send,retryDelayMs:0});assert.equal(attempts,2);assert.equal(aborted,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('transfiere por partes un original verificado que ya está en memoria',async()=>{
 const bytes=Buffer.alloc(10*1024*1024+1,0x62),seen=[];
 const send=async(url,options)=>{if(url.endsWith('/start'))return {handle:'handle',partSize:10*1024*1024};if(url.includes('/part/')){let count=0;for await(const chunk of options.body){count+=chunk.length;assert.ok(chunk.every(value=>value===0x62));}seen.push(count);return {partNumber:seen.length,etag:`etag-${seen.length}`};}if(url.endsWith('/complete'))return {};throw Error('unexpected');};
 await restoreLargeProjectFile({url:'http://localhost/file',bytes,entry:{size:bytes.length,sha256:'a'.repeat(64)},name:'original.pdf',contentType:'application/pdf',send,retryDelayMs:0});
 assert.deepEqual(seen,[10*1024*1024,1]);
});
