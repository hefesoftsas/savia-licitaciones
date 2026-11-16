import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transferDesktopAddendum} from '../desktop-addendum-transfer.mjs';
test('transfiere datos históricos sin revelar notas y permite reintentos',async()=>{
 const calls=[];const run={id:'r',status:'completed',historical:true,reviews:[{note:'dato privado'}]};
 const send=async(url,options)=>{calls.push({url,options});return new Response('{}',{status:201});};
 assert.deepEqual(await transferDesktopAddendum({data:{runs:[run]},server:'https://example.test',token:'secret',requestId:'id',send}),{status:'imported',count:1});
 assert.match(calls[0].url,/technical-plan\/id\/addenda$/);assert.deepEqual(JSON.parse(calls[0].options.body),{runs:[run]});
});
test('notifica historial demasiado grande y fallos de transferencia sin ocultar omisiones',async()=>{
 assert.deepEqual(await transferDesktopAddendum({data:{runs:Array.from({length:51},(_,i)=>({id:String(i)}))}}),{status:'unsupported',count:51});
 assert.deepEqual(await transferDesktopAddendum({data:{runs:[]}}),{status:'absent',count:0});
 await assert.rejects(transferDesktopAddendum({data:{runs:[{id:'x',status:'completed',historical:true,reviews:[]}]},server:'https://example.test',token:'t',requestId:'r',send:async()=>new Response('',{status:409})}),/HTTP 409/);
});
