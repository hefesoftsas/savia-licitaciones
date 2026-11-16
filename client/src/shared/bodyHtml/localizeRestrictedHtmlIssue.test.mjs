import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localizeRestrictedHtmlIssue } from './localizeRestrictedHtmlIssue.ts';

test('translates HTML editing diagnostics without changing names or original content', () => {
  assert.equal(localizeRestrictedHtmlIssue('禁止使用 <script>', 'es'), 'No se permite la etiqueta <script>.');
  assert.equal(localizeRestrictedHtmlIssue('table 缺少合法 data-sv-preset', 'es'), 'La tabla necesita un valor válido de data-sv-preset.');
  assert.equal(localizeRestrictedHtmlIssue('id section-1 与第 2 个块重复', 'es'), 'El identificador section-1 está repetido en el bloque 2.');
  assert.equal(localizeRestrictedHtmlIssue('禁止使用 <script>', 'zh'), '禁止使用 <script>');
});

test('all built-in HTML diagnostics have a Spanish translation', () => {
  const source=readFileSync(new URL('./restrictedHtml.ts',import.meta.url),'utf8');
  const messages=[...source.matchAll(/addIssue\(context,\s*'(?:error|warning)',\s*(['`])([\s\S]*?)\1\)/g),...source.matchAll(/globalIssues\.push\(\{[^}]*message:\s*(')([^']+)\1/g)];
  assert.ok(messages.length>=40);
  for(const match of messages){
    const example=match[2].replace(/\$\{previous \+ 1\}/g,'2').replace(/\$\{[^}]+\}/g,'ejemplo').replaceAll('\\"','"');
    assert.doesNotMatch(localizeRestrictedHtmlIssue(example,'es'),/[\u3400-\u9fff]/u,`Falta traducir: ${example}`);
  }
});
