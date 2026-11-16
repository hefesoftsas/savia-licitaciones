import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join, sep } from 'node:path';
import { readFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { TaskInputError } from './task-errors.mjs';
const requireClient = createRequire(new URL('../client/package.json', import.meta.url));

async function abortable(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  let listener;
  try { return await Promise.race([promise, new Promise((_, reject) => { listener = () => reject(signal.reason); signal.addEventListener('abort', listener, { once: true }); })]); }
  finally { signal.removeEventListener('abort', listener); }
}

/** OCR runs entirely on the runner. Language data and WASM are bundled, never fetched. */
export async function recognizeScannedPdf(path, { signal, language = 'es', reportProgress, reportActivity, reportConsole, temporaryDirectory } = {}) {
  const en = language === 'en', started=Date.now();
  let currentPage=0,lastStatus='';
  const trace=(event,details)=>reportConsole?.({event,...details});
  signal?.throwIfAborted();
  const directory = temporaryDirectory || await mkdtemp(join(tmpdir(), 'savia-ocr-'));
  let document, worker, loading;
  const abort = () => { void worker?.terminate().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const { createWorker, OEM } = requireClient('tesseract.js');
    const { createCanvas, DOMMatrix, ImageData, Path2D } = requireClient('@napi-rs/canvas');
    globalThis.DOMMatrix ||= DOMMatrix; globalThis.ImageData ||= ImageData; globalThis.Path2D ||= Path2D;
    // Explicit local files prevent Tesseract's default CDN fallback and cache writes.
    for (const lang of ['spa', 'eng']) {
      const data = requireClient(`@tesseract.js-data/${lang}`);
      await cp(join(data.langPath, `${lang}.traineddata.gz`), join(directory, `${lang}.traineddata.gz`));
    }
    const pdfPath = requireClient.resolve('pdfjs-dist/legacy/build/pdf.mjs');
    const { getDocument } = await import(pathToFileURL(pdfPath).href);
    const pdfRoot = join(dirname(pdfPath), '../..');
    const dirUrl = (name) => pathToFileURL(join(pdfRoot, name) + sep).href;
    loading = getDocument({ data: new Uint8Array(await readFile(path)), useSystemFonts: true, isEvalSupported: false,
      standardFontDataUrl: dirUrl('standard_fonts'),
      wasmUrl: dirUrl('wasm'), cMapUrl: dirUrl('cmaps'), cMapPacked: true });
    document = await loading.promise;
    trace('ocr.pdf.open',{path,pages:document.numPages,engine:'PDF.js'});
    signal?.throwIfAborted();
    reportProgress?.('ocr');
    worker = await createWorker(en ? 'eng' : 'spa+eng', OEM.LSTM_ONLY, { langPath: directory, cacheMethod: 'none', gzip: true, logger: message=>{const percent=Math.round((message.progress||0)*100),key=`${currentPage}:${message.status}:${Math.floor(percent/10)}`;if(key!==lastStatus){lastStatus=key;trace('ocr.engine',{engine:'Tesseract',page:currentPage,status:message.status,percent});}} });
    signal?.throwIfAborted();
    const pages = []; let readable = false;
    for (let number = 1; number <= document.numPages; number++) {
      signal?.throwIfAborted();
      currentPage=number;
      const pageStarted=Date.now();
      reportActivity?.('ocr.page',{page:number,totalPages:document.numPages});
      const page = await document.getPage(number);
      const existing = (await page.getTextContent()).items.map(item => item.str || '').join(' ').trim();
      let text = existing;
      trace('ocr.text-layer',{page:number,characters:existing.length});
      if (!existing) {
        const natural = page.getViewport({ scale: 1 });
        const scale = Math.min(2.5, Math.sqrt(12_000_000 / (natural.width * natural.height)));
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        trace('ocr.render',{page:number,width:canvas.width,height:canvas.height,scale});
        const render = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        const cancelRender = () => render.cancel();
        signal?.addEventListener('abort', cancelRender, { once: true });
        try { await render.promise; } finally { signal?.removeEventListener('abort', cancelRender); }
        signal?.throwIfAborted();
        const result = await abortable(worker.recognize(canvas.toBuffer('image/png'), { rotateAuto: true }), signal);
        text = result.data.text.trim();
        trace('ocr.recognized',{page:number,confidence:result.data.confidence,characters:text.length,text});
        canvas.width = 1; canvas.height = 1;
      }
      if(text.trim()) readable = true;
      pages.push(`## ${en ? 'Page' : 'Página'} ${number}\n\n${text || (en ? '[No readable text detected]' : '[No se detectó texto legible]')}`);
      trace('ocr.page.complete',{page:number,pages:document.numPages,elapsedMs:Date.now()-pageStarted,characters:text.length});
      page.cleanup();
    }
    signal?.throwIfAborted();
    if (!readable) throw new TaskInputError(en ? 'OCR could not identify readable text. Check the scan quality.' : 'El OCR no pudo reconocer texto legible. Revisa la calidad del escaneo.');
    trace('ocr.complete',{pages:document.numPages,elapsedMs:Date.now()-started});
    return `${en ? 'Text extracted with local OCR. Verify names, figures and tables against the original.' : 'Texto extraído con OCR local. Verifica nombres, cifras y tablas con el original.'}\n\n${pages.join('\n\n')}`;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof TaskInputError) throw error;
    const failure = new TaskInputError(en ? 'Local OCR could not read this PDF. Update Savia Connector and retry; check that the PDF opens and is not password-protected.' : 'El OCR local no pudo leer este PDF. Actualiza Savia Conector y reintenta; comprueba que el PDF se abra y no tenga contraseña.');
    failure.cause = error; throw failure;
  } finally {
    signal?.removeEventListener('abort', abort);
    try { await worker?.terminate(); } catch { /* already stopped on cancellation */ }
    try { await loading?.destroy(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
}

if (!isMainThread) {
  recognizeScannedPdf(workerData.path, { language: workerData.language, temporaryDirectory: workerData.directory, reportConsole:entry=>parentPort.postMessage({console:entry}), reportProgress: stage => parentPort.postMessage({ stage }), reportActivity:(code,details)=>parentPort.postMessage({activity:{code,details}}) })
    .then(text => parentPort.postMessage({ text }))
    .catch(error => parentPort.postMessage({ error: error.message, cause: String(error.cause || '') }));
}
