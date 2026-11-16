import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeTestAnswers,applyTestAnswers} from '../src/features/web/word-test-copy.mjs';

test('llena todos los campos con valores claramente ficticios',()=>{
 const fields=Array.from({length:216},(_,id)=>({id}));
 const answers=makeTestAnswers(fields,false);
 assert.equal(answers.length,216);
 assert.ok(answers.every((answer,id)=>answer.id===id&&answer.proposal.includes('PRUEBA')&&answer.proposal.includes(String(id+1))));
});
test('no entrega una copia incompleta si falla algún reemplazo',()=>{
 assert.throws(()=>applyTestAnswers({},[{}],()=>({applied:0,failed:1,stale:false}),false));
 assert.equal(applyTestAnswers({},[{},{}],()=>({applied:2,failed:0,stale:false}),false),2);
});
