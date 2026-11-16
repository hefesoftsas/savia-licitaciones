import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../src/features/web/api.mjs';

test('requests use same-origin cookies and expose server errors', async () => {
  let options;
  const fetcher = async (_url, input) => { options = input; return new Response(JSON.stringify({ error: 'invalid_title' }), { status: 400 }); };
  await assert.rejects(request('/api/projects', { method: 'POST', json: { title: '' } }, fetcher), /invalid_title/);
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.headers.get('content-type'), 'application/json');
  assert.equal(options.body, '{"title":""}');
});

test('accepts empty responses and leaves file content type intact', async () => {
  let options;
  const fetcher = async (_url, input) => { options = input; return new Response(null, { status: 204 }); };
  assert.equal(await request('/api/test', { method: 'POST', body: 'data', headers: { 'content-type': 'text/plain' } }, fetcher), null);
  assert.equal(options.headers.get('content-type'), 'text/plain');
});
