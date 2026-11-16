'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('validar múltiples correos con espacios largos termina sin bloquearse', () => {
  const result = spawnSync(process.execPath, ['-e', "const Joi=require('module').createRequire(require.resolve('wait-on'))('joi'); const schema=Joi.string().email({multiple:true}); if(!schema.validate(' '.repeat(100000)).error) process.exit(2)"], { cwd: path.resolve(__dirname, '../..'), timeout: 1800 });
  assert.equal(result.status, 0, result.error?.message || result.stderr.toString());
});

test('la validación de listas conserva el comportamiento con separadores y espacios', () => {
  const Joi = require('node:module').createRequire(require.resolve('wait-on'))('joi');
  const comma = Joi.string().email({ multiple: true });
  const semicolon = Joi.string().email({ multiple: true, separator: ';' });
  assert.equal(comma.validate('uno@example.com, dos@example.com').error, undefined);
  assert.equal(semicolon.validate('uno@example.com ; dos@example.com').error, undefined);
  assert.ok(comma.validate('uno@example.com, no-es-correo').error);
});
