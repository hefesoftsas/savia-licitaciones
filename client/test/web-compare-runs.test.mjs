import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRuns } from '../src/features/web/compare-runs.mjs';

test('groups only criteria with identical source snapshots and literal excerpts', () => {
  const criterion = (id, quote = 'Experiencia mínima') => ({ id, name: id, tenderSourceId: 'p', tenderQuote: quote });
  const run = (id, text, criteria) => ({ id, status: 'completed', tenderSources: [{ id: 'p', text }], result: { criteria }, reviews: [] });
  const rows = compareRuns([run('a', 'Texto original', [criterion('a1')]), run('b', 'Texto original', [criterion('b1')]), run('c', 'Texto actualizado', [criterion('c1')])]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].cells.map(cell => cell?.criterion.id || null), ['a1', 'b1', null]);
  assert.deepEqual(rows[1].cells.map(cell => cell?.criterion.id || null), [null, null, 'c1']);
});

test('does not merge ambiguous duplicate excerpts within an evaluation', () => {
  const make = id => ({ id, tenderSourceId: 'p', tenderQuote: 'Misma cita' });
  const run = (id, criteria) => ({ id, status: 'completed', tenderSources: [{ id: 'p', text: 'Texto' }], result: { criteria }, reviews: [] });
  const rows = compareRuns([run('a', [make('a1'), make('a2')]), run('b', [make('b1')])]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.cells.filter(Boolean).length === 1));
});
