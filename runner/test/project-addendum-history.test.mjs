import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validAddendumHistory,restoreAddendumHistory} from '../project-addendum-history.mjs';
const run={id:'run-1',status:'interrupted',historical:true,reviews:[{note:'Verificar fecha',status:'pending'}],issues:['invalid-json'],rawResult:'{incompleto'};
test('preserva notas y errores originales al restaurar adendas',async()=>{
 let sent;
 await restoreAddendumHistory({runs:[run],server:'https://example.test',requestId:'backup:1',send:async(url,init)=>{sent={url,body:JSON.parse(init.body)};}});
 assert.deepEqual(sent.body,{runs:[run]});assert.match(sent.url,/backup%3A1\/addenda$/);
});
test('rechaza duplicados y tamaño excesivo antes de transmitir',async()=>{
 assert.equal(validAddendumHistory([run,run]),false);
 assert.equal(validAddendumHistory([{...run,rawResult:'x'.repeat(262144)}]),false);
 assert.equal(validAddendumHistory(Array.from({length:51},(_,id)=>({...run,id:String(id)}))),false);
 let calls=0;
 await assert.rejects(restoreAddendumHistory({runs:[run,run],send:async()=>calls++}),/sin pérdidas/);
 assert.equal(calls,0);assert.equal(validAddendumHistory([]),true);
});
