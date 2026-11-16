import { Worker } from 'node:worker_threads';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskInputError } from './task-errors.mjs';

// Isolate PDF.js from pdf-parse's different worker version and reclaim OCR memory per file.
export async function recognizeScannedPdf(path, { signal, language = 'es', reportProgress, reportActivity, reportConsole } = {}) {
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), 'savia-ocr-'));
  let worker, abort;
  try {
    signal?.throwIfAborted();
    return await new Promise((resolve, reject) => {
      worker = new Worker(new URL('./local-ocr-worker.mjs', import.meta.url), { workerData: { path, language, directory }, execArgv: [], stdout: true, stderr: true });
      worker.stdout.on('data',chunk=>reportConsole?.({event:'ocr.stdout',text:chunk.toString()}));
      worker.stderr.on('data',chunk=>reportConsole?.({event:'ocr.stderr',text:chunk.toString()}));
      abort = () => reject(signal.reason);
      signal?.addEventListener('abort', abort, { once: true });
      worker.on('message', message => {
        if (message.console) reportConsole?.(message.console);
        else if (message.activity) reportActivity?.(message.activity.code,message.activity.details);
        else if (message.stage) reportProgress?.(message.stage);
        else if (typeof message.text === 'string') resolve(message.text);
        else if (message.error) { const error = new TaskInputError(message.error); error.cause = message.cause; reject(error); }
      });
      worker.on('error', () => reject(new TaskInputError(language === 'en' ? 'Local OCR could not start. Update Savia Connector and retry.' : 'No se pudo iniciar el OCR local. Actualiza Savia Conector y reintenta.')));
      worker.on('exit', () => reject(new TaskInputError(language === 'en' ? 'Local OCR stopped before finishing.' : 'El OCR local se detuvo antes de terminar.')));
    });
  } finally {
    if (abort) signal?.removeEventListener('abort', abort);
    try { await worker?.terminate(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
}
