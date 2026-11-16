import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

test('los recursos web no exponen identificadores de la marca anterior', async () => {
  const directory = process.env.SAVIA_ASSETS_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '../dist/assets');
  const files = (await readdir(directory)).filter(file => /\.(?:js|css)$/.test(file));
  assert.ok(files.length, 'No se encontraron recursos web compilados');
  const prefix = ['y', 'b', '-'].join('');
  const legacy = new RegExp(`(?:data-|--|\\b)${prefix}`, 'i');
  const legacyEditorHelper = new RegExp(`\\b${['y', 'b'].join('')}(?:CellContentHeight|PageContentHeight|KeepHeight|TableKeep)`);
  const matches = [];
  for (const file of files) {
    const content = await readFile(join(directory, file), 'utf8');
    if (legacy.test(content) || legacyEditorHelper.test(content)) matches.push(file);
  }
  assert.deepEqual(matches, []);
});
