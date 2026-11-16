import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadOpportunityRup,opportunityRows,opportunityMatch} from '../src/features/web/opportunity-rup.mjs';

test('usa solo los datos revisados de la cuenta y conserva el orden de las coincidencias',async()=>{
 const facts=[{label:'UNSPSC experiencia #1 · PROPONENTE',value:'72151500',page:4},{label:'Liquidez',value:'81111500',page:1}];
 const loaded=await loadOpportunityRup(async path=>{assert.equal(path,'/api/rup/facts');return {certificateId:'cert',facts};});
 const rows=[{id:'a',classificationCode:'81111500'},{id:'b',classificationCode:'V1.72151510'},{id:'c',classificationCode:'72151520'}];
 assert.deepEqual(opportunityRows(rows,loaded,true).map(row=>row.id),['b','c','a']);
 assert.deepEqual(opportunityRows(rows,loaded,false).map(row=>row.id),['a','b','c']);
 assert.deepEqual(opportunityMatch(rows[1],loaded).map(x=>[x.code,x.page]),[['72151500',4]]);
 assert.deepEqual(opportunityMatch(rows[0],loaded),[]);
});
test('no atribuye coincidencias si no existe certificado y propaga errores de lectura',async()=>{
 assert.deepEqual(await loadOpportunityRup(async()=>({certificateId:null,facts:[{label:'UNSPSC experiencia #1',value:'72151500',page:1}]})),[]);
 await assert.rejects(loadOpportunityRup(async()=>{throw new Error('offline')}),/offline/);
});
