import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import {
  extractZipDocuments,
  isSupportedDocumentName,
  isZipFileName,
} from './zip-extract.mjs';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries) {
  const localParts = [];
  const cdParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const rawData = Buffer.from(entry.data || '');
    const method = entry.method ?? 8;
    const compressed = method === 0 ? rawData : deflateRawSync(rawData);
    const flags = (entry.encrypted ? 0x01 : 0) | 0x0800;
    const crc = crc32(rawData);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);

    localParts.push(localHeader, nameBytes, compressed);

    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(flags, 8);
    cdHeader.writeUInt16LE(method, 10);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(compressed.length, 20);
    cdHeader.writeUInt32LE(rawData.length, 24);
    cdHeader.writeUInt16LE(nameBytes.length, 28);
    cdHeader.writeUInt32LE(offset, 42);

    cdParts.push(cdHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + compressed.length;
  }

  const cdBuffer = Buffer.concat(cdParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return new Blob([Buffer.concat([...localParts, cdBuffer, eocd])], { type: 'application/zip' });
}

test('filename helpers identify zip and supported document types', () => {
  assert.equal(isZipFileName('pliegos.ZIP'), true);
  assert.equal(isZipFileName('pliego.pdf'), false);
  assert.equal(isSupportedDocumentName('anexo.pdf'), true);
  assert.equal(isSupportedDocumentName('presupuesto.XLSX'), true);
  assert.equal(isSupportedDocumentName('script.exe'), false);
  assert.equal(isSupportedDocumentName('paquete.zip'), false);
});

test('extractZipDocuments extracts stored and deflated documents and skips junk/unsupported files', async () => {
  const zipBlob = buildZip([
    { name: 'Pliegos/', data: '', method: 0 },
    { name: 'Pliegos/Términos de Referencia.pdf', data: '%PDF-1.4 contenido', method: 8 },
    { name: 'Anexos/notas.txt', data: 'Texto plano sin compresión', method: 0 },
    { name: '__MACOSX/._notas.txt', data: 'appledouble', method: 0 },
    { name: 'Anexos/.DS_Store', data: 'junk', method: 0 },
    { name: 'Anexos/imagen.png', data: 'png-bytes', method: 8 },
    { name: 'Anexos/vacio.txt', data: '', method: 0 },
    { name: 'Anexos/secreto.pdf', data: 'encrypted', method: 8, encrypted: true },
  ]);

  const result = await extractZipDocuments(zipBlob);
  assert.equal(result.files.length, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.empty, 1);
  assert.equal(result.encrypted, 1);
  assert.equal(result.tooLarge, 0);

  assert.equal(result.files[0].name, 'Términos de Referencia.pdf');
  assert.equal(result.files[0].type, 'application/pdf');
  assert.equal(await result.files[0].text(), '%PDF-1.4 contenido');

  assert.equal(result.files[1].name, 'notas.txt');
  assert.equal(result.files[1].type, 'text/plain');
  assert.equal(await result.files[1].text(), 'Texto plano sin compresión');
});

test('extractZipDocuments enforces size limits and rejects invalid archives', async () => {
  const oversizedZip = buildZip([
    { name: 'grande.txt', data: '1234567890', method: 8 },
  ]);
  const limited = await extractZipDocuments(oversizedZip, { maxFileSize: 5 });
  assert.equal(limited.files.length, 0);
  assert.equal(limited.tooLarge, 1);

  await assert.rejects(
    () => extractZipDocuments(new Blob(['not a zip file'])),
    /Invalid ZIP archive/,
  );
});
