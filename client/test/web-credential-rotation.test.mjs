import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rotateAccountCredentials} from '../src/features/web/credential-rotation.mjs';

test('recorre lotes vinculados a la sesión sin volver a enviar un cursor anterior',async()=>{
 const first='00000000-0000-4000-8000-000000000001',second='00000000-0000-4000-8000-000000000002',calls=[];
 const send=async input=>{calls.push(input);return calls.length===1?{rotated:49,failed:1,nextCursor:first}:calls.length===2?{rotated:50,failed:0,nextCursor:second}:{rotated:2,failed:0};};
 const result=await rotateAccountCredentials({ownerId:'cuenta-a',send});
 assert.deepEqual(calls,[{ownerId:'cuenta-a'},{ownerId:'cuenta-a',cursor:first},{ownerId:'cuenta-a',cursor:second}]);assert.deepEqual(result,{rotated:101,failed:1,complete:true});
});

test('limita solicitudes y deja de continuar cuando se cierra la sesión',async()=>{
 const id='00000000-0000-4000-8000-000000000001',controller=new AbortController();let calls=0;
 const result=await rotateAccountCredentials({ownerId:'cuenta-a',maxPages:1,send:async()=>{calls++;return {rotated:50,failed:0,nextCursor:id};}});assert.equal(calls,1);assert.equal(result.complete,false);
 await assert.rejects(rotateAccountCredentials({ownerId:'cuenta-a',signal:controller.signal,send:async()=>{controller.abort();return {rotated:50,failed:0,nextCursor:id};}}),{name:'AbortError'});
 await assert.rejects(rotateAccountCredentials({ownerId:'cuenta-a',send:async()=>({rotated:0,failed:0,nextCursor:id}),maxPages:3}),/cursor/i);
});
