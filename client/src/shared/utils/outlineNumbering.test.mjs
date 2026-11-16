import test from 'node:test';import assert from 'node:assert/strict';import {formatOutlineTitle} from './outlineNumbering.ts';
test('English UI translates legacy default numbering without changing custom templates',()=>{
 assert.equal(formatOutlineTitle('1','Scope',{numbering_format:'custom',numbering_template:'第{zh}章'},'en'),'Chapter 1 Scope');
 assert.equal(formatOutlineTitle('1.2','Scope',{numbering_format:'custom',numbering_template:'第{zh}节'},'en'),'Section 2 Scope');
 assert.equal(formatOutlineTitle('1','Scope',{numbering_format:'custom',numbering_template:'Part {num}'},'en'),'Part 1 Scope');
});
test('Spanish UI displays legacy default chapter and section templates in Spanish without changing settings',()=>{
 const chapter={numbering_format:'custom',numbering_template:'第{zh}章'};const section={numbering_format:'custom',numbering_template:'第{zh}节'};
 assert.equal(formatOutlineTitle('1','Alcance',chapter,'es'),'Capítulo 1 Alcance');assert.equal(formatOutlineTitle('1.2','Objeto',section,'es'),'Sección 2 Objeto');
 assert.equal(chapter.numbering_template,'第{zh}章');assert.equal(formatOutlineTitle('1','Alcance',chapter,'zh'),'第一章 Alcance');
 assert.equal(formatOutlineTitle('1','Alcance',{numbering_format:'custom',numbering_template:'Parte {num}'},'es'),'Parte 1 Alcance');
});
