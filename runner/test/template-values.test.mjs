import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fillTemplateValues } from '../template-values.mjs';
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const AdmZip = require('adm-zip');
const cheerio = require('cheerio');
function fixture() { const zip = new AdmZip(); zip.addFile('word/document.xml', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:sdt><w:sdtPr><w:tag w:val="savia:field:f0001"/></w:sdtPr><w:sdtContent><w:r><w:t>Vacío</w:t></w:r></w:sdtContent></w:sdt><w:sdt><w:sdtPr><w:tag w:val="savia:field:f0002"/></w:sdtPr><w:sdtContent><w:r><w:t>Otro</w:t></w:r></w:sdtContent></w:sdt></w:p></w:body></w:document>')); return zip.toBuffer(); }
test('rellena una copia por identificador, conserva controles y escapa el texto', () => {
 const original = fixture(), result = fillTemplateValues(original, { f0001: '  Peña & <Cía>  ' });
 const originalXml = new AdmZip(original).readAsText('word/document.xml'), xml = new AdmZip(result).readAsText('word/document.xml');
 assert.match(cheerio.load(xml, { xmlMode: true }).text(), /Peña & <Cía>/); assert.match(xml, /&amp; &lt;/); assert.match(xml, /savia:field:f0001/); assert.match(xml, /Otro/); assert.match(originalXml, /Vacío/);
 assert.throws(() => fillTemplateValues(original, { missing: 'valor' }), /campo|field/i);
 assert.throws(() => fillTemplateValues(original, { f0001: 'dos\nlíneas' }), /línea/i);
 assert.throws(() => fillTemplateValues(original, { f0001: '\ud800' }), /línea/i);
 assert.deepEqual(fillTemplateValues(original, {}), original);
});
