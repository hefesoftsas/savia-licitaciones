import test from 'node:test';
import assert from 'node:assert/strict';
import { publishAppearance, subscribeAppearance } from './appearanceEvents.ts';

test('appearance changes reach other windows without browser persistence', async () => {
  const events = [];
  const unsubscribe = subscribeAppearance(value => events.push(value));
  try {
    publishAppearance({ ui_language: 'en', ui_theme: 'dark' });
    for (let n=0;n<20 && events.length===0;n++) await new Promise(resolve=>setTimeout(resolve,10));
    assert.deepEqual(events,[{ ui_language:'en', ui_theme:'dark' }]);
    unsubscribe();
    publishAppearance({ ui_theme: 'light' });
    await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal(events.length,1);
  } finally { unsubscribe(); }
});
