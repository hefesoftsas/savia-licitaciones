import { isSupportedTextCredential, textProviderConfig } from './text-provider.mjs';
import {createManagedWorkspace} from './managed-workspaces.mjs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import aiModule from '../client/electron/services/aiService.cjs';
import runtimeModule from '../client/electron/services/pi/piRuntimeService.cjs';
import suggestionsModule from '../client/electron/services/requirementSuggestionService.cjs';
import { extractTenderSources } from './tender-chat.mjs';
import { TaskInputError } from './task-errors.mjs';

export function createRequirementSuggestionsHandler({ tempRoot = tmpdir(), createAiService = aiModule.createAiService, createRuntime = runtimeModule.createPiRuntimeService } = {}) {
  return async (payload, context) => {
    const en = payload?.language === 'en';
    if (payload?.dataProcessingConsent !== true) throw new TaskInputError(en ? 'Consent is required to send documents to the provider.' : 'Se requiere consentimiento para enviar documentos al proveedor.');
    if (!Array.isArray(payload.fileIds) || !payload.fileIds.length) throw new TaskInputError(en ? 'Select at least one document.' : 'Selecciona al menos un documento.');
    context.signal?.throwIfAborted();
    let profile;
    try { profile = await context.getRequirementSources(); }
    catch (error) { if (error.status === 409) throw new TaskInputError(en ? 'The sources changed or the task expired.' : 'Las fuentes cambiaron o la tarea venció.'); throw error; }
    const credential = await context.getCredential();
    if (!isSupportedTextCredential(credential)) throw new TaskInputError(en ? 'Configure a supported provider.' : 'Configura un proveedor compatible.');
    const directory = await createManagedWorkspace(tempRoot,'requirements'); let runtime;
    try {
      const app = { isPackaged: false, getPath: () => directory };
      const config = { ...textProviderConfig(credential), web_runner_openai_requirements: credential.provider === 'openai-api', request_mode: 'normal', ui_language: en ? 'en' : 'es', language: en ? 'en' : 'es', developer_mode: false, multimodal_enabled: false,  concurrency_limit: 2, components: { file_parser: { provider: 'local' } } };
      const sources = await extractTenderSources(payload.fileIds, context, app, config, directory, en, { allowUnreadable: true });
      const documents = sources.map(item => ({ id: item.id, name: item.fileName, text: item.content }));
      const configStore = { load: () => config }, aiService = createAiService({ app, configStore });
      runtime = createRuntime({ app, configStore, aiService, isMonitorActive: () => false, requestUserQuestion: async () => { throw new Error('La interacción con el agente aún no está disponible en web.'); } });
      const service = suggestionsModule.createRequirementSuggestionService({ getConfig: () => config, agentService: { runTask: task => runtime.runTask({ ...task, signal: context.signal }) } });
      const facts = payload.includeRup === true ? profile.facts || [] : [], certificates = payload.includeRup === true ? profile.certificates || [] : [];
      let result;
      try { result = await service.analyze({ documents, facts, certificates, language: payload.language, signal: context.signal }); }
      catch (error) {
        if (/Importa un documento de licitación con texto legible|Import a tender document with readable text/.test(String(error?.message || ''))) throw new TaskInputError(error.message);
        throw error;
      }
      context.signal?.throwIfAborted();
      try { await context.assertRequirementSources(); }
      catch (error) { if (error.status === 409) throw new TaskInputError(en ? 'The sources changed or the task expired.' : 'Las fuentes cambiaron o la tarea venció.'); throw error; }
      return { ...result, sources: documents.map(({ id, name }) => ({ id, name })), facts, certificates };
    } finally { try { await runtime?.close(); } finally { await rm(directory, { recursive: true, force: true }); } }
  };
}
