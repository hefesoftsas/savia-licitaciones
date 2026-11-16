import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lockFromPnpmList, verifyLockfile } from './verify-dependency-age.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--no-optional')) {
  console.error('Uso: node scripts/install-dependencies.mjs [--no-optional]');
  process.exit(1);
}
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const options = { cwd: root, shell: process.platform === 'win32', env: process.env };
try {
  const version = spawnSync(pnpm, ['--version'], { ...options, encoding: 'utf8' });
  if (version.status !== 0 || version.stdout.trim() !== '11.24.0') throw new Error('Se requiere pnpm 11.24.0 para esta instalación.');
  const listing = spawnSync(pnpm, ['list', '--lockfile-only', '--json', '--recursive', '--depth', 'Infinity'], { ...options, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (listing.status !== 0) throw new Error(`No se pudo leer el lockfile de pnpm: ${listing.stderr}`);
  const lockText = await readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8');
  const count = await verifyLockfile(lockFromPnpmList(JSON.parse(listing.stdout), lockText));
  console.log(`Antigüedad verificada para ${count} referencias de dependencias.`);
  const result = spawnSync(pnpm, ['install', '--frozen-lockfile', '--ignore-scripts', ...(args.includes('--no-optional') ? ['--no-optional'] : [])], { ...options, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
