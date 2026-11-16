import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFictional,generateFictional,applyFictional,undoFictional} from '../src/features/web/word-fictional.mjs';

test('exige una respuesta completa y sin ids duplicados',()=>{
 assert.equal(parseFictional('[{"id":0,"value":"X"},{"id":0,"value":"Y"}]',[0,1]),null);
 assert.equal(parseFictional('[{"id":0,"value":""}]',[0]),null);
 assert.deepEqual(parseFictional('[{"id":0,"value":"DATO FICTICIO DE PRUEBA - Bogotá"}]',[0]),[{id:0,value:'Bogotá'}]);
});
test('genera todos los datos por lotes con sus contextos',async()=>{
 const fields=Array.from({length:41},(_,i)=>({text:`[POR DEFINIR ${i}]`,length:16}));let calls=0;
 const values=await generateFictional(fields,async prompt=>{calls++;const rows=JSON.parse(prompt.split('Campos: ')[1]);return JSON.stringify(rows.map(({id})=>({id,value:`ejemplo ${id}`})));},'español');
 assert.equal(calls,3);assert.equal(values.length,41);assert.equal(values[40].value,'ejemplo 40');
});
test('deshace solo valores ficticios intactos y conserva otros cambios',()=>{
 let selected;const state={a:'[POR DEFINIR]',b:'[POR DEFINIR]'};
 const editor={selectMatch(m){selected=m;return {ok:true};},surface:{copyFlavours(){return {text:state[selected.blockId],html:'<b>original</b>'};},pasteRich(text){state[selected.blockId]=text;return true;}},findMatches(text){return Object.entries(state).filter(([,v])=>v===text).map(([blockId,v])=>({blockId,text:v,scope:undefined}));}};
 const fields=['a','b'].map((blockId,i)=>({blockId,start:0,length:13,paragraphIndex:i}));
 const result=applyFictional(editor,fields,[{id:0,value:'valor A'},{id:1,value:'valor B'}],'x');assert.equal(result.records.length,2);
 state.b+=' editado';const undone=undoFictional(editor,result.records);assert.equal(undone.restored,1);assert.equal(undone.remaining.length,1);assert.equal(state.a,'[POR DEFINIR]');assert.match(state.b,/editado/);
});

test('identifica valores genéricos anteriores sin confundirlos con datos reales',async()=>{
 const {collectLegacyFictional}=await import('../src/features/web/word-fictional.mjs');
 const editor={findMatches(prefix){return prefix==='DATO FICTICIO DE PRUEBA '?[{blockId:'a',paragraphIndex:0,start:3,length:prefix.length,text:prefix,contextAfter:'216 y resto'},{blockId:'b',paragraphIndex:1,start:0,length:prefix.length,text:prefix,contextAfter:' sin número'}]:[];}};
 const fields=collectLegacyFictional(editor);assert.equal(fields.length,1);assert.equal(fields[0].text,'DATO FICTICIO DE PRUEBA 216');assert.equal(fields[0].length,27);
});
