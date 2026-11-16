import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseBatchAdvice,applyBatchAdvice,makeBatches} from '../src/features/web/word-batch-assistance.mjs';
test('procesa los 216 campos en lotes acotados sin perder identificadores',()=>{const fields=Array.from({length:216},(_,i)=>({id:i,context:`campo ${i}`}));const batches=makeBatches(fields,20);assert.equal(batches.length,11);assert.deepEqual(batches.flat().map(x=>x.id),fields.map(x=>x.id));});
test('rechaza valores sin fuente, campos duplicados o ajenos',()=>{const parsed=parseBatchAdvice(JSON.stringify([{id:0,proposal:'Uno',source:'pliego',question:''},{id:1,proposal:'Dos',source:'',question:'¿Cuál?'},{id:99,proposal:'Ajeno',source:'x',question:''},{id:0,proposal:'Otro',source:'x',question:''}]),[0,1]);assert.deepEqual(parsed,[{id:0,proposal:'Uno',source:'pliego',question:''},{id:1,proposal:'',source:'',question:'¿Cuál?'}]);});
test('aplica desde el final sin alterar marcadores si el documento cambió',()=>{const fields=[{blockId:'p',start:0,length:2,text:'['},{blockId:'p',start:8,length:2,text:'['}];let positions=[];const fake={exec({match}){positions.push(match.start);return {ok:true,changed:true};}};assert.deepEqual(applyBatchAdvice(fake,fields,[{id:0,proposal:'a'},{id:1,proposal:'b'}],1,2),{applied:0,failed:0,stale:true});assert.deepEqual(applyBatchAdvice(fake,fields,[{id:0,proposal:'a'},{id:1,proposal:'b'}],1,1),{applied:2,failed:0,stale:false});assert.deepEqual(positions,[8,0]);});
test('aplica 216 respuestas diferentes sin desplazar los marcadores anteriores',()=>{
 let text=Array.from({length:216},(_,i)=>`[PENDIENTE ${i}]`).join(' | ');
 const fields=[...text.matchAll(/\[PENDIENTE \d+\]/g)].map(match=>({start:match.index,length:match[0].length,text:match[0],paragraphIndex:0}));
 const editor={exec({match,text:value}){if(text.slice(match.start,match.start+match.length)!==match.text)return {ok:false,changed:false};text=text.slice(0,match.start)+value+text.slice(match.start+match.length);return {ok:true,changed:true};}};
 const answers=fields.map((_,id)=>({id,proposal:`Respuesta completa ${id}`}));
 assert.deepEqual(applyBatchAdvice(editor,fields,answers,0,0),{applied:216,failed:0,stale:false});
 assert.equal(text,answers.map(item=>item.proposal).join(' | '));
});
test('usa la selección y pegado del editor cuando replaceMatch no está disponible',()=>{
 let selected=null,inserted='';const editor={exec:()=>({ok:false,code:'unsupported'}),selectMatch(match){selected=match;return {ok:true};},surface:{pasteRich(text){inserted=text;return true;}}};const field={start:0};
 assert.deepEqual(applyBatchAdvice(editor,[field],[{id:0,proposal:'Prueba'}],0,0),{applied:1,failed:0,stale:false});assert.equal(selected,field);assert.equal(inserted,'Prueba');
});
