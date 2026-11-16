import {trackPiProgress} from './pi-progress.mjs';
import { isSupportedTextCredential, textProviderConfig } from './text-provider.mjs';
import {createManagedWorkspace} from './managed-workspaces.mjs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import aiModule from '../client/electron/services/aiService.cjs';
import runtimeModule from '../client/electron/services/pi/piRuntimeService.cjs';
import { extractTenderSources } from './tender-chat.mjs';
import { TaskInputError } from './task-errors.mjs';

const schema = { type: 'object', additionalProperties: false, required: ['entries'], properties: { entries: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', additionalProperties: false, required: ['title', 'summary', 'quote'], properties: { title: { type: 'string', minLength: 1, maxLength: 300 }, summary: { type: 'string', minLength: 1, maxLength: 2000 }, quote: { type: 'string', minLength: 1, maxLength: 10000 } } } } } };
export function createKnowledgeAnalysisHandler({ temporaryRoot = tmpdir(), createAiService = aiModule.createAiService, createRuntime = runtimeModule.createPiRuntimeService } = {}) {
 return async (payload, context) => {
  const en = payload?.language === 'en';
  if (payload?.dataProcessingConsent !== true || typeof payload.documentId !== 'string') throw new TaskInputError(en ? 'Consent and a document are required.' : 'Se requiere consentimiento y un documento.');
  context.signal?.throwIfAborted();
  let file; try { file = await context.getKnowledgeFile(); } catch (error) { if (error.status === 409) throw new TaskInputError(en ? 'The document is unavailable or the task expired.' : 'El documento ya no está disponible o la tarea venció.'); throw error; }
  const credential = await context.getCredential();
  if (!isSupportedTextCredential(credential)) throw new TaskInputError(en ? 'Configure a supported provider.' : 'Configura un proveedor compatible.');
  const directory = await createManagedWorkspace(temporaryRoot,'knowledge'); let runtime;
  try {
   const app = { isPackaged: false, getPath: () => directory };
   const config = { ...textProviderConfig(credential), request_mode: 'normal', ui_language: en ? 'en' : 'es', language: en ? 'en' : 'es', developer_mode: false, multimodal_enabled: false,  concurrency_limit: 2, components: { file_parser: { provider: 'local' } } };
   const guessedTypes = { txt: 'text/plain', md: 'text/markdown', pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
   const fileInfo = !file.contentType || file.contentType.split(';', 1)[0].trim().toLowerCase() === 'application/octet-stream' ? { ...file, contentType: guessedTypes[file.name?.split('.').pop()?.toLowerCase()] || file.contentType } : file;
   const [source] = await extractTenderSources([payload.documentId], { signal: context.signal, getFileInfo: async () => fileInfo }, app, config, directory, en);
   if (source.content.length > 300000) throw new TaskInputError(en ? 'The document is too long for one analysis; split it into smaller files.' : 'El documento es demasiado extenso para un análisis; divídelo en archivos más pequeños.');
   const configStore = { load: () => config }, aiService = createAiService({ app, configStore });
   runtime = createRuntime({ app, configStore, aiService, isMonitorActive: () => false, requestUserQuestion: async () => { throw new Error('La interacción con el agente aún no está disponible en este análisis.'); } }); trackPiProgress(runtime, context);
   const validateOutput = candidate => {
    let data; try { data = JSON.parse(candidate.output_content); } catch { return { value: null, issues: [{ severity: 'blocking', file: 'knowledge.json', message: 'Invalid JSON.' }] }; }
    if (!Array.isArray(data?.entries) || !data.entries.length || data.entries.length > 100) return { value: null, issues: [{ severity: 'blocking', file: 'knowledge.json', message: 'Provide 1 to 100 entries.' }] };
    const entries = data.entries.filter(item => item && typeof item.title === 'string' && item.title.trim() && item.title.length <= 300 && typeof item.summary === 'string' && item.summary.trim() && item.summary.length <= 2000 && typeof item.quote === 'string' && item.quote.trim() && item.quote.length <= 10000 && source.content.includes(item.quote)).map(({ title, summary, quote }) => ({ title: title.trim(), summary: summary.trim(), quote }));
    return entries.length ? { value: { entries, discardedCount: data.entries.length - entries.length }, issues: [] } : { value: null, issues: [{ severity: 'blocking', file: 'knowledge.json', message: 'Each entry needs an exact quote from the source.' }] };
   };
   const prompt = `${en ? 'Write titles and summaries in English.' : 'Escribe los títulos y resúmenes en español.'} Read source.md and identify reusable knowledge. Do not invent claims. For each entry provide title, summary and quote copied exactly as a contiguous excerpt from source.md. Write knowledge.json as an object with an entries array. Produce at most 100 useful entries, each quote at most 10000 characters. Verify with json-validation.`;
   const result = await runtime.runTask({ task_id: context.job.id, title: en ? 'Analyze knowledge document' : 'Analizar documento de conocimiento', prompt, files: [{ path: 'source.md', content: source.content }], signal: context.signal, output_file: 'knowledge.json', prepare_output_files: ['knowledge.json'], json_validation_schemas: { 'knowledge.json': schema }, validateOutput, max_retries: 1, secop_safe_tools: true, failure_handled_by_parent: true, active_tools: ['read', 'write', 'edit', 'json-validation'] });
   context.signal?.throwIfAborted();
   try { await context.assertKnowledgeCurrent(); } catch (error) { if (error.status === 409) throw new TaskInputError(en ? 'The document is unavailable or the task expired.' : 'El documento ya no está disponible o la tarea venció.'); throw error; }
   if (!result.validation_result?.entries?.length) throw new TaskInputError(en ? 'No verifiable entries were produced.' : 'No se generaron entradas verificables.');
   return result.validation_result;
  } finally { try { await runtime?.close(); } finally { await rm(directory, { recursive: true, force: true }); } }
 };
}
