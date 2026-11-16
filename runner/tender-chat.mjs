import { recognizeScannedPdf } from './local-ocr.mjs';
import {createPiUsageCollector} from './pi-usage.mjs';
import {createManagedWorkspace} from './managed-workspaces.mjs';
import { isSupportedTextCredential, textProviderConfig } from './text-provider.mjs';
import { rm, writeFile, readFile, open } from 'node:fs/promises';
import {saveSourceFile} from './file-stream.mjs';
import { randomUUID } from 'node:crypto';
import { accessSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { TaskInputError } from './task-errors.mjs';
import runtimeModule from '../client/electron/services/pi/piRuntimeService.cjs';
import aiModule from '../client/electron/services/aiService.cjs';
import chatModule from '../client/electron/services/tenderChatService.cjs';
import fileModule from '../client/electron/services/fileService.cjs';
import pathsModule from '../client/electron/utils/paths.cjs';

export function isTenderChatAvailable() {
  const directory = pathsModule.getBundledAgentToolsBinDir({ isPackaged: false });
  try {
    for (const name of ['rg', 'fd', 'jq']) {
      accessSync(join(directory, process.platform === 'win32' ? `${name}.exe` : name), process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    }
    return true;
  } catch { return false; }
}

function memoryChatStore() {
  let messages = [];
  return {
    list: () => messages,
    beginTurn(_projectId, user, assistant) { messages = [...messages, user, assistant]; },
    update(_projectId, id, update) { messages = messages.map(message => message.id === id ? { ...message, ...update } : message); },
    clear() { messages = []; },
  };
}

const sourceTypes = {
  '.txt':['text/plain'], '.md':['text/plain','text/markdown','text/x-markdown'], '.markdown':['text/plain','text/markdown','text/x-markdown'],
  '.pdf':['application/pdf'], '.docx':['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.doc':['application/msword'], '.wps':['application/vnd.ms-works','application/x-kingsoft-wps','application/wps-office.doc'],
  '.xls':['application/vnd.ms-excel'], '.xlsx':['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};
const extensionsForMime = {'text/plain':'.txt','text/markdown':'.md','text/x-markdown':'.md','application/pdf':'.pdf','application/msword':'.doc','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'.docx','application/vnd.ms-excel':'.xls','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'.xlsx','application/vnd.ms-works':'.wps','application/x-kingsoft-wps':'.wps','application/wps-office.doc':'.wps'};
export async function extractTenderSources(fileIds, context, app, config, workDir, en, { allowUnreadable = false, includeUnreadableReasons = false, parse = fileModule.parseDocumentWithConfig, maxFileBytes = 1024 * 1024 * 1024, ocr = parse === fileModule.parseDocumentWithConfig ? recognizeScannedPdf : null } = {}) {
  const fail = (es, english) => { throw new TaskInputError(en ? english : es); };
  const sources = [];
  for (const [index, id] of fileIds.entries()) {
    context.signal?.throwIfAborted();
    const file = await (context.getFileStream ? context.getFileStream(id) : context.getFileInfo(id));
    const fileName = file.name || `Documento ${index + 1}`;
    context.reportProgress?.('reading');
    context.reportActivity?.('document.start',{document:fileName,index:index+1,total:fileIds.length});
    let streamedPath;
    try {
      const contentType = String(file.contentType || '').split(';', 1)[0].trim().toLowerCase();
      const namedExt = extname(fileName).toLowerCase(), ext = namedExt || extensionsForMime[contentType];
      if (!ext || !sourceTypes[ext] || (contentType && contentType !== 'application/octet-stream' && !sourceTypes[ext].includes(contentType))) fail('El formato del documento no coincide con su tipo o no es compatible.', 'The document format does not match its type or is unsupported.');
      const isText = ['.txt','.md','.markdown'].includes(ext);
      let bytes;
      if (file.body) {
        streamedPath = join(workDir, `source-${randomUUID()}${ext}`);
        const limit = Math.min(maxFileBytes, isText ? 25 * 1024 * 1024 : maxFileBytes);
        await saveSourceFile(file,streamedPath,{signal:context.signal,maxBytes:limit,language:en?'en':'es'});
        const source = await open(streamedPath,'r'); try { const header=Buffer.alloc(8),result=await source.read(header,0,8,0);bytes=header.subarray(0,result.bytesRead); } finally { await source.close(); }
      } else bytes = new Uint8Array(file.bytes);
      const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
      const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
      const isOle = [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((value,position)=>bytes[position]===value);
      if ((isText && (isPdf || isZip || isOle)) || (ext === '.pdf' && !isPdf) || (['.docx','.xlsx'].includes(ext) && !isZip) || (['.doc','.xls'].includes(ext) && !isOle) || (ext === '.wps' && isPdf)) fail('El formato del documento no coincide con su contenido.', 'The document format does not match its contents.');
      let content;
      if (isText) {
        try { content = new TextDecoder('utf-8', { fatal: true }).decode(streamedPath ? await readFile(streamedPath) : bytes); }
        catch { fail('El documento no contiene texto UTF-8 válido.', 'The document does not contain valid UTF-8 text.'); }
      } else {
        const filePath = streamedPath || join(workDir, `source-${index + 1}${ext}`);
        if (!streamedPath) await writeFile(filePath, bytes);
        try { content = await parse(app, filePath, config, { preserveImages: false }); }
        catch (error) { context.signal?.throwIfAborted(); if(error?.code === 'pdf_text_layer_missing' && ocr) { content = await ocr(filePath, {signal:context.signal,language:en?'en':'es',reportConsole:entry=>context.reportConsole?.({...entry,document:fileName}),reportProgress:context.reportProgress,reportActivity:(code,details)=>context.reportActivity?.(code,{document:fileName,...details})}); } else if(error?.code === 'pdf_text_layer_missing') fail('PDF escaneado sin texto seleccionable; necesita reconocimiento de texto (OCR).', 'Scanned PDF without selectable text; text recognition (OCR) is needed.'); else if (['.doc','.wps'].includes(ext)) fail('No se pudo extraer el documento DOC o WPS; puede requerir LibreOffice u otro conversor compatible en el runner.', 'Could not extract the DOC or WPS document; the runner may require LibreOffice or another compatible converter.'); else fail('No se pudo extraer texto del documento; comprueba su formato y que los PDF contengan texto seleccionable.', 'Could not extract document text; check its format and that PDFs contain selectable text.'); }
      }
      context.signal?.throwIfAborted();
      if (typeof content !== 'string' || !content.trim() || content.includes('\0')) fail('El documento no contiene texto legible.', 'The document contains no readable text.');
      context.reportActivity?.('document.end',{document:fileName});
      sources.push({ id, fileName, content });
    } catch (error) {
      if (!allowUnreadable || !(error instanceof TaskInputError)) throw error;
      sources.push({ id, fileName, content: '', ...(includeUnreadableReasons ? { reason: error.message } : {}) });
    } finally { if (streamedPath) await rm(streamedPath,{force:true}); else if (file.body && !file.body.locked) await file.body.cancel().catch(()=>{}); }
  }
  return sources;
}

export function createTenderChatHandler({ createAiService = aiModule.createAiService, temporaryRoot = tmpdir(), parse = fileModule.parseDocumentWithConfig } = {}) {
  return async (payload, context) => {
    context.signal?.throwIfAborted();
    const fail = (es, en) => { throw new TaskInputError(payload?.language === 'en' ? en : es); };
    if (payload?.dataProcessingConsent !== true) fail('Se requiere consentimiento para enviar documentos al proveedor de IA.', 'Consent is required to send documents to the AI provider.');
    if (typeof payload?.question !== 'string' || !payload.question.trim()) fail('Escribe una pregunta.', 'Enter a question.');
    if (!Array.isArray(payload.fileIds) || !payload.fileIds.length || payload.fileIds.some(id => typeof id !== 'string')) fail('Selecciona al menos un documento.', 'Select at least one document.');
    const credential = await context.getCredential();
    if (!isSupportedTextCredential(credential)) fail('Configura un proveedor compatible.', 'Configure a supported provider.');
    const usage = createPiUsageCollector();
    context.reportProgress?.('preparing');
    const workDir = await createManagedWorkspace(temporaryRoot,'pi');
    let runtime;
    let cancel = () => {};
    try {
      const app = { isPackaged: false, getPath: () => workDir };
      const config = {
        ...textProviderConfig(credential), request_mode: 'normal',
        web_runner_openai_chat: credential.provider === 'openai-api',
        ui_language: payload.language === 'en' ? 'en' : 'es', language: payload.language === 'en' ? 'en' : 'es',
        developer_mode: false, multimodal_enabled: false,  concurrency_limit: 2,
        components: { file_parser: { provider: 'local' } },
      };
      const extracted = await extractTenderSources(payload.fileIds, context, app, config, workDir, payload.language === 'en', {allowUnreadable:true, includeUnreadableReasons:true, parse});
      const unreadableSources = extracted.filter(source=>!source.content.trim()).map(({id,fileName,reason})=>({id,fileName,reason}));
      const sources = extracted.filter(source=>source.content.trim());
      if(!sources.length) fail(`No se pudo leer ninguno de los documentos seleccionados. ${unreadableSources.map(source=>`${source.fileName}: ${source.reason}`).join(' ')}`, `None of the selected documents could be read. ${unreadableSources.map(source=>`${source.fileName}: ${source.reason}`).join(' ')}`);
      const readableIds = sources.map(source=>source.id);
      const knowledgeIds = context.knowledgeDocumentIds || [];
      if (knowledgeIds.length) {
        const mimeTypes = { txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', wps: 'application/vnd.ms-works', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
        const references = await extractTenderSources(knowledgeIds, {
          signal: context.signal,
          reportProgress: context.reportProgress,
          reportConsole: context.reportConsole,
          reportActivity: (code, details) => context.reportActivity?.(code, details?.document ? { ...details, document: `[Biblioteca] ${details.document}` } : details),
          getFileInfo: async id => { let file; try { file = await context.getKnowledgeDocumentInfo(id); } catch (error) { if ([404, 409].includes(error?.status)) fail('El documento de biblioteca cambió o ya no está disponible.', 'The library document changed or is no longer available.'); throw error; } const type = file.contentType?.split(';', 1)[0].trim().toLowerCase(); return !type || type === 'application/octet-stream' ? { ...file, contentType: mimeTypes[file.name?.split('.').pop()?.toLowerCase()] || file.contentType } : file; },
        }, app, config, workDir, payload.language === 'en');
        if (references.reduce((size, item) => size + item.content.length, 0) > 1_000_000) fail('Los documentos de biblioteca son demasiado extensos; selecciona menos o divídelos.', 'The library documents are too long; select fewer or split them.');
        sources.push(...references.map(reference => ({ ...reference, id: `knowledge:${reference.id}`, fileName: `[Biblioteca] ${reference.fileName}` })));
      }
      const configStore = { load: () => config };
      const aiService = createAiService({ app, configStore });
      runtime = runtimeModule.createPiRuntimeService({
        app, configStore, aiService, isMonitorActive: () => false,
        requestUserQuestion: (request, signal) => context.askUser(request, signal),
      });
      const store = memoryChatStore();
      const agentService = {
        loadPersistentTask: () => null,
        deletePersistentTask: () => {},
        updatePersistentTask: () => {},
        runTask: request => runtime.runTask({ ...request, onConsole: event => { context.reportConsole?.(event); request.onConsole?.(event); }, onUsage: usage.add, onActivity: event => {
      if (['pi.tool.start','pi.tool.end'].includes(event.source)) context.reportActivity?.(`tool.${event.meta?.tool}.${event.source.endsWith('start')?'start':event.meta?.is_error?'error':'end'}`, {path:event.meta?.path});
          if (event.source === 'pi.tool.start') context.reportProgress?.(['read', 'grep', 'find', 'ls'].includes(event.meta?.tool) ? 'reading' : 'generating');
          else if (event.source === 'pi.message' || event.source === 'pi.tool.end') context.reportProgress?.('generating');
          request.onActivity?.(event);
        } }),
      };
      const service = chatModule.createTenderChatService({ store, agentService, getProjectId: () => context.job.projectId,
        getSources: () => sources, prepareSourceDirectory: async () => {}, getConfig: () => config, allowUserQuestions: true, includeApprovedKnowledge: context.includeApprovedKnowledge === true, fictionalTest: payload.fictionalTest === true && payload.wordAssistance === true });
      cancel = () => service.cancel();
      context.signal?.addEventListener('abort', cancel, { once: true });
      context.signal?.throwIfAborted();
      context.reportProgress?.('generating');
      const question = unreadableSources.length ? `${payload.question}

${payload.language === 'en' ? 'Source coverage is partial. These selected files could not be read (JSON):' : 'La cobertura de fuentes es parcial. No se pudieron leer estos archivos seleccionados (JSON):'} ${JSON.stringify(unreadableSources.map(source=>source.fileName))}
${payload.language === 'en' ? 'Answer only from readable sources, disclose this limitation, and do not treat missing extraction as evidence that information is absent from the full record.' : 'Responde solo con las fuentes legibles, indica esta limitación y no confundas la falta de extracción con la ausencia de información en el expediente completo.'}` : payload.question;
      const answer = await service.send(question, config.ui_language, [...readableIds, ...knowledgeIds.map(id => `knowledge:${id}`)], payload.history || []);
      context.signal?.throwIfAborted();
      context.reportProgress?.('generating');
      const assistant = store.list().findLast(item => item.role === 'assistant');
      return { answer, followUps: assistant?.followUps || [], usage: usage.snapshot(), ...(unreadableSources.length ? {unreadableSources, readableSourceCount:readableIds.length} : {}) };
    } finally {
      context.signal?.removeEventListener('abort', cancel);
      try { await runtime?.close(); } finally { await rm(workDir, { recursive: true, force: true }); }
    }
  };
}
