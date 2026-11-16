import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('la instalación y los comandos explícitos omiten pre y post scripts', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'savia-lifecycle-'));
  try {
    const marker = "node -e \"require('fs').appendFileSync('events','unexpected\\n')\"";
    const pkg = { name: 'policy-fixture', version: '1.0.0', scripts: { preinstall: marker, postinstall: marker, presample: marker, postsample: marker, sample: "node -e \"require('fs').appendFileSync('events','explicit\\n')\"" } };
    await writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg));
    await writeFile(path.join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - .\nignoreScripts: true\nenablePrePostScripts: false\n');
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const run = args => spawnSync(pnpm, args, { cwd: dir, shell: process.platform === 'win32', encoding: 'utf8', env: process.env });
    for (const args of [['install', '--offline', '--ignore-scripts'], ['run', 'sample']]) {
      const result = run(args); assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(await readFile(path.join(dir, 'events'), 'utf8'), 'explicit\n');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
