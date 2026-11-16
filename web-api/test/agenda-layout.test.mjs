import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agendaLayout } from '../src/agenda-layout.js';

function environment() {
  const rows = new Map();
  return { rows, BETTER_AUTH_URL: 'http://localhost', DB: { prepare() { return { bind(id, value) { return { first: async () => rows.has(id) ? { layout_json: rows.get(id) } : null, run: async () => { rows.set(id, value); } }; } }; } } };
}
function request(method, body, origin = 'http://localhost') {
  return new Request('http://localhost/api/agenda-layout', { method, headers: { origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
test('agenda layout persists per user and rejects invalid orders', async () => {
  const env = environment();
  const read = async id => (await agendaLayout(request('GET'), env, id)).json();
  assert.deepEqual((await read('a')).order, ['summary', 'calendar', 'events']);
  const order = ['events', 'summary', 'calendar'];
  assert.equal((await agendaLayout(request('PUT', { order }), env, 'a')).status, 200);
  assert.deepEqual((await read('a')).order, order);
  assert.deepEqual((await read('b')).order, ['summary', 'calendar', 'events']);
  assert.equal((await agendaLayout(request('PUT', { order: ['events', 'events', 'calendar'] }), env, 'a')).status, 400);
  assert.equal((await agendaLayout(request('PUT', { order }, 'http://other.example'), env, 'a')).status, 403);
  assert.deepEqual((await read('a')).order, order);
  env.rows.set('a', 'invalid');
  assert.deepEqual((await read('a')).order, ['summary', 'calendar', 'events']);
});
