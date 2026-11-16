import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLockfile } from '../verify-dependency-age.mjs';
const now = Date.parse('2026-10-31T12:00:00Z');
const fetchTimes = async name => ({ old: '2026-09-01T00:00:00Z', recent: '2026-10-30T00:00:00Z' });
test('acepta versiones con al menos 2 días', async () => {
  await verifyLockfile({ packages: { 'node_modules/example': { version: 'old' } } }, { now, fetchTimes });
});
test('rechaza versiones recientes incluso si están fijadas en el lockfile', async () => {
  await assert.rejects(() => verifyLockfile({ packages: { 'node_modules/example': { version: 'recent' } } }, { now, fetchTimes }), /example@recent/);
});
test('rechaza versiones sin fecha y fuentes que no se pueden verificar', async () => {
  await assert.rejects(() => verifyLockfile({ packages: { 'node_modules/example': { version: 'missing' } } }, { now, fetchTimes }), /example@missing/);
  await assert.rejects(() => verifyLockfile({ packages: { 'node_modules/example': { version: 'old', resolved: 'https://other.example/a.tgz' } } }, { now, fetchTimes }), /fuente/);
});
test('acepta al cumplir 48 horas y rechaza antes de ese límite', async () => {
  const fetchBoundary = async () => ({ allowed: '2026-10-29T12:00:00Z', early: '2026-10-29T12:00:01Z' });
  await verifyLockfile({ packages: { 'node_modules/example': { version: 'allowed' } } }, { now, fetchTimes: fetchBoundary });
  await assert.rejects(() => verifyLockfile({ packages: { 'node_modules/example': { version: 'early' } } }, { now, fetchTimes: fetchBoundary }), /example@early/);
});
