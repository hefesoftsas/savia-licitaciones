const {test}=require('node:test');
const assert=require('node:assert/strict');
const {countReadableWords}=require('../electron/utils/wordCount.cjs');

test('cuenta palabras españolas con tildes y conserva las reglas de contenido legible',()=>{
 assert.equal(countReadableWords('La planificación técnica incluye acción y ejecución.'),7);
 assert.equal(countReadableWords('Título\n\n[Más información](https://example.com)\n\n```js\nignore code\n```\n![Imagen](https://example.com/a.png)'),3);
 assert.equal(countReadableWords('中文 plan técnico'),4);
});
