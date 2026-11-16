import {test} from 'node:test';
import assert from 'node:assert/strict';
import {uploadSubmissionAttachment} from '../src/features/web/submission-attachments.mjs';

test('envía el archivo y conserva la clave para reintentar sin duplicados',async()=>{
 const file={name:'acta ñ.pdf',type:'application/pdf',size:9},calls=[];
 const send=async(url,options)=>{calls.push({url,options});if(calls.length===1)throw new Error('respuesta perdida');return {file:{id:'saved'}};};
 const input={projectId:'p/1',requestId:'r/2',file,key:'same-key',send};await assert.rejects(uploadSubmissionAttachment(input),/respuesta perdida/);assert.deepEqual(await uploadSubmissionAttachment(input),{file:{id:'saved'}});
 assert.equal(calls[0].url,'/api/projects/p%2F1/submission-tracking/requests/r%2F2/files');assert.equal(calls[1].options.headers['idempotency-key'],'same-key');assert.equal(calls[1].options.headers['x-file-name'],encodeURIComponent(file.name));assert.equal(calls[1].options.headers['x-savia-size'],'9');assert.equal(calls[1].options.body,file);
});
test('rechaza un archivo superior al límite antes de enviarlo',async()=>{let sent=false;await assert.rejects(uploadSubmissionAttachment({projectId:'p',requestId:'r',file:{name:'grande',size:256*1024*1024+1},key:'k',send:async()=>{sent=true;}}),/too_large/);assert.equal(sent,false);});
