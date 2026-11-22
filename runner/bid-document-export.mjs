import {execFile} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {createManagedWorkspace} from './managed-workspaces.mjs';
import {saveSourceFile} from './file-stream.mjs';

const client = createRequire(new URL('../client/package.json', import.meta.url));
const {PDFDocument} = client('pdf-lib');
const {PDFParse} = client('pdf-parse');

export async function measureWordPages(bytes, signal) {
  const {findLibreOfficeCommand} = await import('../client/electron/services/doc2markdown/convert.mjs');
  const command = await findLibreOfficeCommand();
  if (!command) throw new Error('Instala LibreOffice en el equipo del runner para verificar la paginación.');
  const directory = await createManagedWorkspace(tmpdir(), 'page-count');
  try {
    const input = join(directory, 'memoria.docx');
    await writeFile(input, bytes);
    const profile = pathToFileURL(join(directory, 'profile')).href;
    await promisify(execFile)(command, [`-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', directory, input], {signal,timeout:120000,windowsHide:true});
    const pdf = await PDFDocument.load(await readFile(join(directory, 'memoria.pdf')));
    return pdf.getPageCount();
  } finally {
    await rm(directory,{recursive:true,force:true});
  }
}

export async function extractEconomicAnnex(payload, context) {
  const {fileIds, economicAnnex, language} = payload;
  const directory = await createManagedWorkspace(tmpdir(), 'economic-annex');
  try {
    const path = join(directory,'source.pdf');
    for (const id of fileIds) {
      context.signal?.throwIfAborted();
      const file = await context.getFileStream(id);
      if (!/\.pdf$/i.test(file.name)) { await file.body?.cancel(); continue; }
      await saveSourceFile(file,path,{signal:context.signal,language,maxBytes:50*1024*1024});
      const bytes = await readFile(path);
      await rm(path,{force:true});
      // Use the same PDF parser as tender analysis so the runner reuses its initialized worker.
      const parser = new PDFParse({data:new Uint8Array(bytes)});
      try {
        const {pages:sourcePages} = await parser.getText();
        let first, last;
        for (const {num:pageNumber,text:pageText} of sourcePages) {
          context.signal?.throwIfAborted();
          const text = pageText.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
          const heading = /^\s*(?:annex|anexo|appendix)\s*(?:n[ou]m\.?\s*)?(\d{1,3})\s*$/m.exec(text);
          if (first && heading && Number(heading[1]) !== economicAnnex) break;
          if (!first && Number(heading?.[1]) === economicAnnex && /(?:proposici[oó]|proposta|oferta)\s+economic|economic (?:offer|proposal)/.test(text)) first = pageNumber;
          if (first) last = pageNumber;
        }
        if (!first || last-first >= 30) continue;
        const original = await PDFDocument.load(bytes), result = await PDFDocument.create();
        const pages = await result.copyPages(original,Array.from({length:last-first+1},(_,i)=>first-1+i));
        for (const page of pages) result.addPage(page);
        return {bytes:await result.save(),pageCount:pages.length,warnings:[]};
      } finally {
        await parser.destroy();
      }
    }
    throw new Error(language==='en' ? 'The official economic offer annex could not be located in the selected PDFs.' : 'No se pudo localizar el anexo oficial de la oferta económica en los PDF seleccionados.');
  } finally {
    await rm(directory,{recursive:true,force:true});
  }
}
