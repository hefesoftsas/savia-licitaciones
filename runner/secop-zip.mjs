import { createRequire } from 'node:module';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const AdmZip = require('adm-zip');
const maxFileBytes = 50 * 1024 * 1024;
const maxTotalBytes = 100 * 1024 * 1024;
const supported = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx']);

function safeFileName(rawName, extension) {
  const base = path.posix.basename(String(rawName || '').replace(/\\/g, '/')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '');
  const trimmed = base.toLowerCase().endsWith(`.${extension}`) ? base.slice(0, -(extension.length + 1)) : base;
  const stem = trimmed.slice(0, 139 - extension.length).replace(/[. ]+$/g, '') || 'documento';
  return `${stem}.${extension}`;
}

function validSignature(bytes, extension) {
  const expected = extension === 'pdf' ? Buffer.from('%PDF-') : ['docx', 'xlsx'].includes(extension) ? Buffer.from('504b0304', 'hex') : Buffer.from('d0cf11e0a1b11ae1', 'hex');
  return bytes.subarray(0, expected.length).equals(expected);
}

export function expandSecopZip(bytes) {
  if (bytes.length > maxFileBytes || !Buffer.from(bytes).subarray(0, 4).equals(Buffer.from('504b0304', 'hex'))) throw new Error('ZIP inválido o demasiado grande.');
  const entries = new AdmZip(Buffer.from(bytes)).getEntries();
  if (entries.length > 500) throw new Error('El ZIP contiene demasiadas entradas.');
  const files = []; let total = 0, skipped = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replace(/\\/g, '/');
    const extension = path.posix.extname(name).slice(1).toLowerCase();
    if (name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..') || !supported.has(extension)) { skipped++; continue; }
    const size = Number(entry.header.size);
    if (!Number.isSafeInteger(size) || size < 0 || size > maxFileBytes || total + size > maxTotalBytes || files.length >= 50) throw new Error('El ZIP supera los límites de descompresión.');
    const content = entry.getData();
    if (content.length !== size || !validSignature(content, extension)) throw new Error('El ZIP contiene un documento inválido.');
    files.push({ name: safeFileName(name, extension), extension, bytes: content }); total += size;
  }
  if (!files.length) throw new Error('El ZIP no contiene documentos admitidos.');
  return { files, skipped };
}

async function downloadSecopBytes(url, { fetchImpl, signal, cookieHeader }) {
  const headers = cookieHeader ? { cookie: cookieHeader } : undefined;
  const response = await fetchImpl(url, { redirect: 'manual', ...(headers ? { headers } : {}), signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) });
  if (!response.ok || response.status >= 300 || !response.body || /text\/html/i.test(response.headers.get('content-type') || '')) {
    await response.body?.cancel?.().catch(() => undefined);
    return { blocked: true, status: response.status };
  }
  if (Number(response.headers.get('content-length')) > maxFileBytes) {
    await response.body.cancel();
    throw new Error('El archivo supera 50 MB.');
  }
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    signal.throwIfAborted(); size += chunk.byteLength;
    if (size > maxFileBytes) throw new Error('El archivo supera 50 MB.');
    chunks.push(Buffer.from(chunk));
  }
  return { blocked: false, buffer: Buffer.concat(chunks, size) };
}

async function defaultChallengeSolver({ url, documentId, title, signal }) {
  const uiUrl = process.env.SAVIA_CONNECTOR_UI_URL;
  const uiToken = process.env.SAVIA_CONNECTOR_UI_TOKEN;
  if (!uiUrl || !uiToken) {
    throw new Error('SECOP solicitó verificación humana (CAPTCHA). Usa Savia Conector o descarga el archivo manualmente desde SECOP.');
  }
  const response = await fetch(`${uiUrl}/secop-challenge`, {
    method: 'POST',
    headers: { authorization: `Bearer ${uiToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ url, documentId, title }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error === 'cancelled' ? 'Verificación de SECOP cancelada por el usuario.' : 'SECOP solicitó verificación humana (CAPTCHA).');
  }
  return data;
}

// The server authorizes the document ID against the saved portfolio before
// creating a job. The runner only downloads from SECOP's fixed endpoint.
export function createSecopZipHandler({ fetchImpl = fetch, solveChallenge = defaultChallengeSolver } = {}) {
  let cachedCookie = '';
  return async ({ documentId, name, extension }, context) => {
    if (typeof documentId !== 'string' || !/^\d+$/.test(documentId)) throw new Error('Identificador de documento inválido.');
    const targetExt = typeof extension === 'string' && supported.has(extension.toLowerCase()) ? extension.toLowerCase() : 'zip';
    if (extension && targetExt === 'zip' && extension.toLowerCase() !== 'zip') throw new Error('Formato de documento no compatible.');
    context.signal.throwIfAborted();
    const url = new URL('https://community.secop.gov.co/Public/Archive/RetrieveFile/Index');
    url.searchParams.set('DocumentId', documentId);
    url.searchParams.set('InCommunity', 'False');
    url.searchParams.set('InPaymentGateway', 'False');
    url.searchParams.set('DocUniqueIdentifier', '');

    let result = await downloadSecopBytes(url, { fetchImpl, signal: context.signal, cookieHeader: cachedCookie });
    if (result.blocked) {
      const challenge = await solveChallenge({ url: url.toString(), documentId, title: name || documentId, signal: context.signal });
      if (typeof challenge?.cookieHeader === 'string' && challenge.cookieHeader) cachedCookie = challenge.cookieHeader;
      if (typeof challenge?.filePath === 'string' && challenge.filePath) {
        try {
          const buffer = await readFile(challenge.filePath);
          if (buffer.length > maxFileBytes) throw new Error('El archivo supera 50 MB.');
          result = { blocked: false, buffer };
        } finally {
          await rm(challenge.filePath, { force: true }).catch(() => undefined);
        }
      } else {
        result = await downloadSecopBytes(url, { fetchImpl, signal: context.signal, cookieHeader: cachedCookie });
      }
    }
    if (result.blocked) throw new Error('SECOP solicitó verificación humana (CAPTCHA). Inténtalo de nuevo o descarga el archivo manualmente.');

    let files, skipped = 0;
    if (targetExt === 'zip') {
      ({ files, skipped } = expandSecopZip(result.buffer));
    } else {
      if (!validSignature(result.buffer, targetExt)) throw new Error('El documento descargado de SECOP no tiene un formato válido.');
      files = [{ name: safeFileName(name || 'documento', targetExt), extension: targetExt, bytes: result.buffer }];
    }
    for (let index = 0; index < files.length; index++) {
      context.signal.throwIfAborted();
      await context.stageSecopFile(index, files[index]);
    }
    context.signal.throwIfAborted();
    const committed = await context.commitSecopFiles({ count: files.length, skipped });
    return { ...committed, skipped };
  };
}
