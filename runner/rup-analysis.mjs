import {trackPiProgress} from './pi-progress.mjs';
import { isSupportedTextCredential, textProviderConfig } from './text-provider.mjs';
import {createManagedWorkspace} from './managed-workspaces.mjs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import aiModule from '../client/electron/services/aiService.cjs';
import runtimeModule from '../client/electron/services/pi/piRuntimeService.cjs';
import rupModule from '../client/electron/services/rupAgentService.cjs';
import layoutModule from '../client/electron/services/rupPdfLayout.cjs';
import { TaskInputError } from './task-errors.mjs';
const require = createRequire(new URL('../client/package.json', import.meta.url));

async function extractPages(bytes, signal) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText(), document = parser.doc, pages = [];
    for (const entry of result.pages) {
      signal?.throwIfAborted(); let ordered = '';
      if (document?.getPage) { let page; try { page = await document.getPage(entry.num); ordered = layoutModule.layoutText((await page.getTextContent()).items); } catch { /* Keep ordinary extracted text. */ } finally { page?.cleanup(); } }
      pages.push({ page: entry.num, text: entry.text.trim(), layoutText: ordered });
    }
    return pages;
  } finally { await parser.destroy(); }
}
export function createRupAnalysisHandler({ tempRoot = tmpdir(), createAiService = aiModule.createAiService, createRuntime = runtimeModule.createPiRuntimeService } = {}) {
  return async (payload, context) => {
    const en = payload?.language === 'en';
    if (payload?.dataProcessingConsent !== true) throw new TaskInputError(en ? 'Consent is required to send the certificate to the AI provider.' : 'Se requiere consentimiento para enviar el certificado al proveedor de IA.');
    context.signal?.throwIfAborted();
    let pdf;
    try { pdf = Buffer.from(await context.getRupPdf()); }
    catch (error) { if (error.status === 409) throw new TaskInputError(en ? 'The certificate changed or the task expired.' : 'El certificado cambió o la tarea venció.'); throw error; }
    const credential = await context.getCredential();
    if (!isSupportedTextCredential(credential)) throw new TaskInputError(en ? 'Configure a supported provider.' : 'Configura un proveedor compatible.');
    const directory = await createManagedWorkspace(tempRoot,'rup'); let runtime;
    try {
      const app = { isPackaged: false, getPath: () => directory };
      const config = { ...textProviderConfig(credential), web_runner_openai_rup: credential.provider === 'openai-api', request_mode: 'normal', ui_language: en ? 'en' : 'es', language: en ? 'en' : 'es', developer_mode: false, multimodal_enabled: false,  concurrency_limit: 2, components: { file_parser: { provider: 'local' } } };
      const configStore = { load: () => config }, aiService = createAiService({ app, configStore });
      runtime = createRuntime({ app, configStore, aiService, isMonitorActive: () => false, requestUserQuestion: async () => { throw new Error('La interacción con el agente aún no está disponible en web.'); } }); trackPiProgress(runtime, context);
      const service = rupModule.createRupAgentService({ certificate: { readPdf: () => pdf, extractPages: () => extractPages(pdf, context.signal) }, getConfig: () => config, agentService: { runTask: task => runtime.runTask({ ...task, signal: context.signal }) } });
      let result;
      try { result = await service.analyze(payload.language, { jurisdiction: payload?.jurisdiction || payload?.market }); }
      catch (error) {
        if (/No selectable text was found in the certificate|No se encontró texto seleccionable en el certificado/.test(String(error?.message || ''))) throw new TaskInputError(error.message);
        throw error;
      }
      context.signal?.throwIfAborted();
      try { await context.assertRupCurrent(); }
      catch (error) { if (error.status === 409) throw new TaskInputError(en ? 'The certificate changed or the task expired.' : 'El certificado cambió o la tarea venció.'); throw error; }
      return result;
    } finally { try { await runtime?.close(); } finally { await rm(directory, { recursive: true, force: true }); } }
  };
}
