import {test} from 'node:test';
import assert from 'node:assert/strict';
import {countTechnicalEditableWords} from '../technical-word-editable.mjs';
test('cuenta texto editable sin tablas, imágenes, enlaces ni código',()=>{
 const input='Texto abierto para corregir.\n\n[Enlace protegido](https://example.com) y `código protegido`.\n\n![Plano](asset.png)\n\n| Encabezado | Precio |\n|---|---|\n| Texto de tabla | 42 |\n\n```js\nconst nombre = 42\n```\n\n<figure><img src="a.png"><figcaption>Plano aprobado</figcaption></figure>';
 assert.equal(countTechnicalEditableWords(input),5);
});
test('respeta tablas HTML, cercas de virgulillas y referencias de enlace',()=>{
 const input='Alcance **general** y [documento][ref].\n\n[ref]: https://example.com\n\n~~~\ncódigo secreto texto\n~~~\n\n<table><tr><td>Palabras protegidas</td></tr></table>';
 assert.equal(countTechnicalEditableWords(input),3);
});
test('no estima palabras editables por encima del recuento legible',()=>{
 assert.equal(countTechnicalEditableWords(''),0);assert.equal(countTechnicalEditableWords('<p>Texto con formato HTML</p>'),0);
});
test('prepara un plan con el recuento real y nunca asigna el texto protegido',async()=>{
 const {buildTechnicalWordAdjustment}=await import('../technical-word-editable.mjs');const payload={mode:'all',targets:['a'],planningOptions:{minimumWords:0,maximumWords:500}},content=`${'palabra '.repeat(600)}\n\n| Detalle | Descripción |\n|---|---|\n| ${'protegido '.repeat(600)} | tabla |`;
 const result=buildTechnicalWordAdjustment(payload,[{id:'a',content,targetWords:400}]);assert.equal(result.direction,'shrink');assert.equal(result.jobs[0].fromWords,1203);assert.equal(result.jobs[0].targetWords,963);assert.ok(result.shortfall>0);
});
