import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewMatchesFields} from '../src/features/web/word-review-recovery.mjs';

test('recupera una revisión solo si los 216 campos siguen en el mismo orden',()=>{
 const fields=Array.from({length:216},(_,i)=>({text:`[Pendiente ${i}]`,contextBefore:'',contextAfter:''}));
 const contexts=fields.map(x=>x.text);
 assert.equal(reviewMatchesFields(contexts,fields),true);
 fields[100].text='[Campo distinto]';
 assert.equal(reviewMatchesFields(contexts,fields),false);
});
