import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomicOfferAdapter } from '../src/features/web/economic-offer-adapter.mjs';

test('serializa guardados y usa la última versión confirmada', async () => {
  const versions = [];
  const api = async (_path, options = {}) => {
    if (!options.method) return { offer: { version: 2 } };
    versions.push(options.json.version);
    await new Promise(resolve => setTimeout(resolve, 5));
    return { offer: { draft: options.json.draft, version: options.json.version + 1 } };
  };
  const adapter = createEconomicOfferAdapter(api, () => {});
  await adapter.get('project');
  await Promise.all([adapter.save('project', { value: 1 }), adapter.save('project', { value: 2 })]);
  assert.deepEqual(versions, [2, 3]);
});

test('un conflicto no actualiza la versión y se informa al usuario', async () => {
  const versions = [];
  const api = async (_path, options = {}) => {
    if (!options.method) return { offer: { version: 4 } };
    versions.push(options.json.version);
    const error = new Error('version_conflict'); error.status = 409; throw error;
  };
  const adapter = createEconomicOfferAdapter(api, () => {});
  await adapter.get('project');
  await assert.rejects(adapter.save('project', {}), /actualizado|changed/i);
  await assert.rejects(adapter.save('project', {}));
  assert.deepEqual(versions, [4, 4]);
});
