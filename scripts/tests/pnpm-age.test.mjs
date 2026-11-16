import test from 'node:test';
import assert from 'node:assert/strict';
import { lockFromPnpmList, verifyLockfile } from '../verify-dependency-age.mjs';
const now = Date.parse('2026-10-31T12:00:00Z');
test('verifica dependencias transitivas de pnpm y bloquea versiones recientes', async () => {
  const list = [{ dependencies: { parent: { version: '1.0.0', resolved: 'https://registry.npmjs.org/parent/-/parent-1.0.0.tgz', dependencies: { child: { version: '2.0.0', resolved: 'https://registry.npmjs.org/child/-/child-2.0.0.tgz' } } } } }];
  const lock = lockFromPnpmList(list, '');
  assert.equal(Object.keys(lock.packages).length, 2);
  await assert.rejects(() => verifyLockfile(lock, { now, fetchTimes: async name => ({ '1.0.0': '2026-09-01T00:00:00Z', '2.0.0': '2026-10-30T00:00:00Z' }) }), /child@2.0.0/);
});
test('rechaza dependencias de pnpm sin fuente verificable', () => {
  assert.throws(() => lockFromPnpmList([{ dependencies: { bad: { version: '1.0.0' } } }], ''), /fuente/);
});
test('rechaza un listado vacío en lugar de aceptar un lockfile sin comprobar', () => {
  assert.throws(() => lockFromPnpmList([], ''), /vacío/);
});
