import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderWordFormatPreview} from '../word-format-preview.mjs';
import defaults from '../../client/electron/services/exportFormatDefaults.cjs';

test('the runner creates a real Word sample with the desktop OpenXML helper', async () => {
 const result=await renderWordFormatPreview(defaults.defaultExportFormat,{language:'es'});
 assert.ok(result.bytes.length>1000);
 assert.equal(Buffer.from(result.bytes).subarray(0,2).toString(),'PK');
});
test('an already cancelled preview does not start', async () => {
 const controller=new AbortController(); controller.abort();
 await assert.rejects(renderWordFormatPreview(defaults.defaultExportFormat,{signal:controller.signal}), {name:'AbortError'});
});
