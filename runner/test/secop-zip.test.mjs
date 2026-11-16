import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { expandSecopZip } from '../secop-zip.mjs';
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const AdmZip = require('adm-zip');
const archive = entries => { const zip = new AdmZip(); for (const [name, bytes] of entries) zip.addFile(name, Buffer.from(bytes)); return zip.toBuffer(); };

test('extrae archivos compatibles, preserva nombres y omite otras entradas', () => {
  const result = expandSecopZip(archive([['anexos/pliego.pdf', '%PDF-1.7\nprueba'], ['anexos/notas.txt', 'texto'], ['otros/hoja.xls', Buffer.from('d0cf11e0a1b11ae1', 'hex')]]));
  assert.deepEqual(result.files.map(file => [file.name, file.extension]), [['pliego.pdf', 'pdf'], ['hoja.xls', 'xls']]);
  assert.equal(result.skipped, 1);
  assert.equal(result.files[0].bytes.toString(), '%PDF-1.7\nprueba');
});

test('rechaza archivos inválidos, sin documentos, firmas incorrectas y exceso de entradas', () => {
  assert.throws(() => expandSecopZip(Buffer.from('no es zip')));
  assert.throws(() => expandSecopZip(archive([['nota.txt', 'texto']])));
  assert.throws(() => expandSecopZip(archive([['pliego.pdf', 'html']])));
  assert.throws(() => expandSecopZip(archive(Array.from({length: 501}, (_, i) => [`${i}.txt`, 'x']))));
  assert.throws(() => expandSecopZip(archive(Array.from({length: 51}, (_, i) => [`${i}.pdf`, '%PDF-prueba']))));
});

test('omite rutas que salen del archivo y no escribe en disco', () => {
  const original = archive([['AA/BB/fuera.pdf', '%PDF-fuera'], ['bien.pdf', '%PDF-bien']]);
  const tampered = Buffer.from(original.toString('latin1').replaceAll('AA/BB/fuera.pdf', '../../fuera.pdf'), 'latin1');
  const result = expandSecopZip(tampered);
  assert.deepEqual(result.files.map(file => file.name), ['bien.pdf']);
  assert.equal(result.skipped, 1);
});

test('el runner descarga solo de SECOP y entrega los archivos antes de confirmar', async () => {
  const { createSecopZipHandler } = await import('../secop-zip.mjs');
  const events = [], bytes = archive([['pliego.pdf', '%PDF-1.7\nprueba'], ['notas.txt', 'texto']]);
  const handle = createSecopZipHandler({ fetchImpl: async (url, options) => { events.push('download'); assert.equal(url.origin, 'https://community.secop.gov.co'); assert.equal(url.pathname, '/Public/Archive/RetrieveFile/Index'); assert.equal(url.searchParams.get('DocumentId'), '42'); assert.equal(options.redirect, 'manual'); return new Response(bytes); } });
  const result = await handle({ documentId: '42' }, { signal: new AbortController().signal, stageSecopFile: async (index, file) => { events.push(`stage:${index}`); assert.equal(file.name, 'pliego.pdf'); assert.equal(file.bytes.toString(), '%PDF-1.7\nprueba'); }, commitSecopFiles: async info => { events.push('commit'); assert.deepEqual(info, { count: 1, skipped: 1 }); return { imported: 1 }; } });
  assert.deepEqual(events, ['download', 'stage:0', 'commit']); assert.deepEqual(result, { imported: 1, skipped: 1 });
});

test('el runner no confirma si fallan la descarga, validación o entrega', async () => {
  const { createSecopZipHandler } = await import('../secop-zip.mjs');
  let commits = 0; const signal = new AbortController().signal;
  const context = { signal, stageSecopFile: async () => { throw Error('sin conexión'); }, commitSecopFiles: async () => { commits++; } };
  await assert.rejects(createSecopZipHandler({ fetchImpl: async () => new Response(archive([['pliego.pdf', '%PDF-1.7']])) })({ documentId: '42' }, context));
  await assert.rejects(createSecopZipHandler({ fetchImpl: async () => new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }) })({ documentId: '42' }, context));
  await assert.rejects(createSecopZipHandler({ fetchImpl: async () => new Response('x', { headers: { 'content-length': String(51 * 1024 * 1024) } }) })({ documentId: '42' }, context));
  await assert.rejects(createSecopZipHandler({ fetchImpl: async () => { throw Error('no debe descargar'); } })({ documentId: '../otro' }, context));
  assert.equal(commits, 0);
});

test('conserva la extensión de los nombres largos y no confirma al cancelarse', async () => {
  const { createSecopZipHandler } = await import('../secop-zip.mjs');
  const zip = archive([[`${'a'.repeat(180)}.pdf`, '%PDF-largo']]);
  assert.match(expandSecopZip(zip).files[0].name, /\.pdf$/);
  const controller = new AbortController(); let committed = false;
  const handler = createSecopZipHandler({ fetchImpl: async () => new Response(zip) });
  await assert.rejects(handler({ documentId: '42' }, { signal: controller.signal, stageSecopFile: async () => controller.abort(), commitSecopFiles: async () => { committed = true; } }), { name: 'AbortError' });
  assert.equal(committed, false);
});

test('descarga documentos individuales y solicita verificación humana si SECOP bloquea con HTML', async () => {
  const { createSecopZipHandler } = await import('../secop-zip.mjs');
  const staged = [];
  let attempts = 0, solved = 0;
  const handle = createSecopZipHandler({
    fetchImpl: async (_url, options) => {
      attempts++;
      if (attempts === 1) return new Response('<html>captcha</html>', { status: 403, headers: { 'content-type': 'text/html' } });
      assert.equal(options.headers?.cookie, 'secop_session=ok');
      return new Response('%PDF-1.7\nverificado', { headers: { 'content-type': 'application/pdf' } });
    },
    solveChallenge: async ({ url, documentId, title }) => {
      solved++;
      assert.match(url, /DocumentId=77/);
      assert.equal(documentId, '77');
      assert.equal(title, 'pliego-oficial.pdf');
      return { ok: true, cookieHeader: 'secop_session=ok' };
    },
  });
  const result = await handle(
    { documentId: '77', name: 'pliego-oficial.pdf', extension: 'pdf' },
    {
      signal: new AbortController().signal,
      stageSecopFile: async (index, file) => { staged.push({ index, name: file.name, content: file.bytes.toString() }); },
      commitSecopFiles: async info => ({ imported: info.count }),
    },
  );
  assert.equal(solved, 1);
  assert.equal(attempts, 2);
  assert.deepEqual(staged, [{ index: 0, name: 'pliego-oficial.pdf', content: '%PDF-1.7\nverificado' }]);
  assert.deepEqual(result, { imported: 1, skipped: 0 });
});
