import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as state from './preparation-progress.mjs';

test('saving during an in-flight progress read triggers a fresh read', async () => {
 let finishRead;
 const reads = [];
 const snapshots = [];
 const refresh = state.createPreparationRefresh(async (isCurrent) => {
  const snapshot = reads.length === 0 ? 'before save' : 'after save';
  reads.push(snapshot);
  if (reads.length === 1) await new Promise(resolve => { finishRead = resolve; });
  if (isCurrent()) snapshots.push(snapshot);
 });
 const pending = refresh();
 await refresh();
 await refresh(true);
 await refresh(true);
 assert.deepEqual(reads, ['before save']);
 finishRead();
 await pending;
 assert.deepEqual(reads, ['before save', 'after save']);
 assert.deepEqual(snapshots, ['after save']);
});
