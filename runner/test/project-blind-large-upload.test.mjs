import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {uploadStagedBlindArtifact} from '../project-blind-large-upload.mjs';

test('transfiere una copia grande por partes y obtiene el comprobante',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-blind-upload-'));try{const bytes=Buffer.alloc(25*1024*1024+1,1),path=join(dir,'copy');await writeFile(path,bytes);let total=0;const send=async(url,options)=>{if(url.endsWith('/start'))return {handle:'handle',partSize:10*1024*1024};if(url.includes('/part/')){for await(const chunk of options.body)total+=chunk.length;return {partNumber:Number(url.split('/').pop()),etag:'etag'};}if(url.endsWith('/complete'))return {stagedToken:'stage'};throw Error('unexpected');};assert.equal(await uploadStagedBlindArtifact({url:'https://example.test',path,entry:{size:bytes.length,sha256:'a'.repeat(64)},send,retryDelay:async()=>{}}),'stage');assert.equal(total,bytes.length);}finally{await rm(dir,{recursive:true,force:true});}
});
