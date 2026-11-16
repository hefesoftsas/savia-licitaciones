import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRunnerCredential } from '../src/credentials.js';

test('un fallo de escritura al rotar no impide usar la credencial ya descifrada', async () => {
  const ownerId = 'owner', id = 'credential', provider = 'opencode-go', iv = crypto.getRandomValues(new Uint8Array(12));
  const hex = value => Buffer.from(value).toString('hex');
  const oldKey = await crypto.subtle.importKey('raw', Buffer.from('11'.repeat(32), 'hex'), 'AES-GCM', false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(JSON.stringify([ownerId, id, provider])) }, oldKey, new TextEncoder().encode('clave-de-prueba'));
  const row = { id, ownerId, provider, model: 'model', keyId: 'old', iv: hex(iv), ciphertext: hex(ciphertext), contextTokens: 400000, outputTokens: 16384 };
  let attempts = 0;
  const env = { CREDENTIAL_KEY_ID: 'new', CREDENTIAL_KEY_HEX: '22'.repeat(32), CREDENTIAL_PREVIOUS_KEYS_JSON: JSON.stringify({old:'11'.repeat(32)}), DB: { prepare(sql) { return { bind() { return this; }, async first() { if (sql.startsWith('UPDATE')) { attempts++; throw new Error('storage unavailable'); } return row; } }; } } };
  const request = new Request('http://localhost/credential', { method: 'POST', body: JSON.stringify({ lease: 'a'.repeat(64) }) });
  const response = await handleRunnerCredential(request, env, { ownerId, id: 'runner' }, 'job');
  assert.equal(response.status, 200); assert.equal((await response.json()).credential.secret, 'clave-de-prueba'); assert.equal(attempts, 1);
});
