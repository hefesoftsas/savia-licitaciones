import test from 'node:test';
import assert from 'node:assert/strict';
import { fontDisplayName } from './fontDisplayName.ts';
import { presetDisplayName } from '../../features/web/blind-check/presetDisplayName.ts';

test('font display aliases do not replace custom family names', () => {
  assert.equal(fontDisplayName('宋体'), 'SimSun');
  assert.equal(fontDisplayName('Arial'), 'Arial');
  assert.equal(fontDisplayName('Custom family'), 'Custom family');
});
test('only built-in preset names are translated; user names are preserved', () => {
  assert.equal(presetDisplayName({id:'builtin-general',name:'通用'}, 'es'), 'General');
  assert.equal(presetDisplayName({id:'builtin-hebei',name:'河北（参考）'}, 'en'), 'Hebei (reference)');
  assert.equal(presetDisplayName({id:'custom',name:'Mi plantilla'}, 'en'), 'Mi plantilla');
});
