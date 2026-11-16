import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeTemplateDefaults } from './localizeTemplateDefaults.ts';

test('localizes built-in format examples without changing saved configuration', () => {
  const source = {page:{page_number_format:'第{page}页'},headings:[{numbering_format:'custom',numbering_template:'第{zh}章'},{numbering_format:'custom',numbering_template:'Annex {num}'}]};
  const localized=localizeTemplateDefaults(source,'en');
  assert.equal(localized.page.page_number_format,'Page {page}');
  assert.equal(localized.headings[0].numbering_template,'Chapter {num}');
  assert.equal(localized.headings[1].numbering_template,'Annex {num}');
  assert.equal(source.page.page_number_format,'第{page}页');
  assert.equal(localizeTemplateDefaults(source,'es').headings[0].numbering_template,'Capítulo {num}');
});
