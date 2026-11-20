import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import runtimeModule from '../../client/electron/services/pi/piRuntimeService.cjs';
import baselineModule from '../../client/electron/services/pi/piWorkspaceBaseline.cjs';

const { safeRelativePath } = runtimeModule;
const { createWorkspaceBaseline } = baselineModule;

test('safeRelativePath allows legitimate filenames containing consecutive dots', () => {
  assert.equal(
    safeRelativePath('招标文件/招标文件-06-2026-2519 Memòria Just..pdf.md'),
    '招标文件/招标文件-06-2026-2519 Memòria Just..pdf.md',
  );
  assert.equal(safeRelativePath('..leading.md'), '..leading.md');
  assert.equal(safeRelativePath('dir/..hidden..txt'), 'dir/..hidden..txt');
  assert.equal(safeRelativePath('a...b.pdf'), 'a...b.pdf');
  assert.equal(
    safeRelativePath('招标文件\\招标文件-06-2026-2519 Memòria Just..pdf.md'),
    '招标文件/招标文件-06-2026-2519 Memòria Just..pdf.md',
  );
});

test('safeRelativePath rejects traversal segments, absolute paths, drive letters, and empty/invalid paths', () => {
  const invalidPaths = [
    '',
    null,
    undefined,
    '.',
    '..',
    './foo.md',
    '../foo.md',
    'a/../b.md',
    'a/b/..',
    'a/./b.md',
    '..\\foo.md',
    'a\\..\\b.md',
    '/etc/passwd',
    '\\etc\\passwd',
    'C:/foo.md',
    'C:\\foo.md',
    'd:bar.md',
    'a//b.md',
    'dir/',
    'foo\0bar.md',
  ];
  for (const input of invalidPaths) {
    assert.throws(() => safeRelativePath(input), /非法文件路径/, `Expected rejection for ${JSON.stringify(input)}`);
  }
});

test('safeRelativePath rejects reserved Pi agent paths', () => {
  const reserved = [
    'AGENTS.md',
    'agents.md',
    'CLAUDE.md',
    '.pi',
    '.pi/settings.json',
    '.agents',
    '.agents/skill.md',
  ];
  for (const input of reserved) {
    assert.throws(() => safeRelativePath(input), /保留路径/, `Expected reserved rejection for ${JSON.stringify(input)}`);
  }
});

test('createWorkspaceBaseline protects files with consecutive dots and rejects traversal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-baseline-'));
  const workspaceDir = join(root, 'workspace');
  const baselineDir = join(root, 'baseline');
  try {
    await mkdir(join(workspaceDir, '招标文件'), { recursive: true });
    const nested = '招标文件/招标文件-06-2026-2519 Memòria Just..pdf.md';
    const leading = '..leading.md';
    await writeFile(join(workspaceDir, nested), 'nested content', 'utf8');
    await writeFile(join(workspaceDir, leading), 'leading content', 'utf8');

    const baseline = createWorkspaceBaseline({ workspaceDir, baselineDir });
    baseline.protect('inputs', [nested, leading]);
    assert.deepEqual(baseline.files('inputs'), [nested, leading]);

    assert.throws(() => baseline.protect('inputs', ['../escape.md']), /工作区内/);
    assert.throws(() => baseline.protect('inputs', ['..']), /工作区内/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
