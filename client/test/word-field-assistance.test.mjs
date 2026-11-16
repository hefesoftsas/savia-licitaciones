import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fieldContext,parseFieldAdvice,sameField,applyPendingField} from '../src/features/web/word-field-assistance.mjs';
test('la ayuda describe el campo sin atribuir información inexistente',()=>{
 const field={blockId:'a',start:3,length:25,text:'[POR DEFINIR',contextBefore:'Valor: ',contextAfter:' – indica el valor] resto'};
 assert.match(fieldContext(field),/Valor/); assert.match(fieldContext(field),/POR DEFINIR/);
 assert.deepEqual(parseFieldAdvice('{"question":"¿Cuál es el valor?","proposal":"","source":""}'),{question:'¿Cuál es el valor?',proposal:'',source:''});
 assert.equal(parseFieldAdvice('no es json'),null);
 assert.equal(sameField(field,{...field}),true);assert.equal(sameField(field,{...field,start:4}),false);
});
test('solo reemplaza el marcador seleccionado si el documento no cambió',()=>{
 const field={blockId:'a',start:3,length:12,text:'[POR DEFINIR'};let calls=0;
 const editor={findMatches(query){return query==='[POR DEFINIR'?[{...field,length:11}]:query===']'?[{...field,start:14,length:1,text:']'}]:[];},exec(command){calls++;assert.equal(command.type,'replaceMatch');assert.equal(command.text,'Confirmado');return {ok:true,changed:true};}};
 assert.equal(applyPendingField(editor,field,'Confirmado',1,2),false);assert.equal(calls,0);
 assert.equal(applyPendingField(editor,field,'Confirmado',2,2),true);assert.equal(calls,1);
});
