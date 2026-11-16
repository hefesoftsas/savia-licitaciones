import { isSupportedTextCredential, textProviderConfig } from './text-provider.mjs';
import {createManagedWorkspace} from './managed-workspaces.mjs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import aiModule from '../client/electron/services/aiService.cjs';
import runtimeModule from '../client/electron/services/pi/piRuntimeService.cjs';
import outlineModule from '../client/electron/services/outlineGenerationTaskV2.cjs';
import { TaskInputError } from './task-errors.mjs';

export function createOutlineRootsHandler({ temporaryRoot = tmpdir(), createAiService = aiModule.createAiService, createRuntime = runtimeModule.createPiRuntimeService } = {}) {
  return async (payload, context) => {
    const en = payload?.language === 'en';
    if (payload?.dataProcessingConsent !== true) throw new TaskInputError(en ? 'Consent is required.' : 'Se requiere consentimiento.');
    const getContext = async () => { try { return await context.getPlanContext(); } catch (error) { if (error.status === 409) throw new TaskInputError(en ? 'The plan or its sources changed.' : 'El plan o sus fuentes cambiaron.'); throw error; } };
    context.signal?.throwIfAborted();
    const snapshot = await getContext();
    const credential = await context.getCredential();
    if (!isSupportedTextCredential(credential)) throw new TaskInputError(en ? 'Configure a supported provider.' : 'Configura un proveedor compatible.');
    const directory = await createManagedWorkspace(temporaryRoot,'outline'); let runtime;
    try {
      const app = { isPackaged: false, getPath: () => directory };
      const config = { ...textProviderConfig(credential), request_mode: 'normal', ui_language: en ? 'en' : 'es', language: en ? 'en' : 'es', developer_mode: false, multimodal_enabled: false,  concurrency_limit: 2, components: { file_parser: { provider: 'local' } } };
      const configStore = { load: () => config }, aiService = createAiService({ app, configStore });
      runtime = createRuntime({ app, configStore, aiService, isMonitorActive: () => false, requestUserQuestion: (request, signal) => context.askUser(request, signal) });
      const prompt = `${en ? 'Write chapter titles and descriptions in English.' : 'Escribe los títulos y las descripciones de capítulos en español.'} First read all three approved analysis files: project-overview.md, technical-score.md and response-requirements.md. Create only the first-level chapters of the response document using these analyses as evidence. The response requirements determine the structure and order; the project overview provides background and the technical-score analysis provides technical context. Do not invent requirements, scores, bidder facts or commitments. If a material decision is missing, ask the user. Write outline.json as a JSON object with the only key "outline", an array of 1 to 50 root leaf objects, no children. Each object must have id:null, title, description, attr and content_mode. attr must be one of 通用, 商务/资信, 技术, 其他, 目录, 报价, 业绩. content_mode must be one of ai-generate, template-fill, directory-generate, manual-fill, other. Commercial credentials and track record use template-fill; contents use directory-generate; pricing uses template-fill if a fixed form exists, otherwise manual-fill. Technical prose uses ai-generate. For other mode include content_mode_note. Titles must not include numbering. Use json-validation to check the file.`;
      const validate = candidate => {
        const report = outlineModule.validateOutlineOutput(candidate.output_content);
        if (!report.issues.length && (report.value.outline.length > 50 || report.value.outline.some(node => node.children?.length || node.title.length > 300 || node.description.length > 2000 || !node.title.trim() || !node.description.trim() || (node.content_mode_note?.length || 0) > 2000))) report.issues.push({ severity: 'blocking', file: 'outline.json', message: 'Only 1 to 50 root chapters are permitted, with concise titles and descriptions.' });
        return report;
      };
      const result = await runtime.runTask({ task_id: context.job.id, title: en ? 'Initial outline' : 'Índice inicial', prompt, files: Object.entries(snapshot.analyses).map(([name, content]) => ({ path: `${name}.md`, content })), signal: context.signal, output_file: 'outline.json', prepare_output_files: ['outline.json'], json_validation_schemas: { 'outline.json': outlineModule.OUTLINE_JSON_SCHEMA }, validateOutput: validate, max_retries: 1, secop_safe_tools: true, failure_handled_by_parent: true, active_tools: ['read', 'write', 'edit', 'json-validation', 'ask-user'] });
      context.signal?.throwIfAborted();
      await getContext();
      if (!result.validation_result?.outline?.length) throw new TaskInputError(en ? 'The outline is empty.' : 'El índice está vacío.');
      return { outline: result.validation_result.outline };
    } finally { try { await runtime?.close(); } finally { await rm(directory, { recursive: true, force: true }); } }
  };
}
