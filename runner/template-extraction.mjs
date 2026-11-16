import { isSupportedTextCredential, textProviderConfig } from './text-provider.mjs';
import {createManagedWorkspace} from './managed-workspaces.mjs';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, open } from 'node:fs/promises';
import { saveSourceFile } from './file-stream.mjs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import aiModule from '../client/electron/services/aiService.cjs';
import runtimeModule from '../client/electron/services/pi/piRuntimeService.cjs';
import helperModule from '../client/electron/services/openXmlHelperService.cjs';
import extractionModule from '../client/electron/services/templateExtractionTask.cjs';
import { resolvePackagedHelper } from './technical-plan-export.mjs';
import { TaskInputError } from './task-errors.mjs';

export function createTemplateExtractionHandler({ temporaryRoot = tmpdir(), createAiService = aiModule.createAiService, createRuntime = runtimeModule.createPiRuntimeService, createHelper = helperModule.createOpenXmlHelperService, runExtraction = extractionModule.runTemplateExtractionTask } = {}) {
  return async (payload, context) => {
    const en = payload?.language === 'en';
    if (payload?.dataProcessingConsent !== true || !Array.isArray(payload.fileIds) || !payload.fileIds.length) throw new TaskInputError(en ? 'Consent and Word source documents are required.' : 'Se requieren consentimiento y documentos Word de origen.');
    const getContext = async () => { try { return await context.getPlanContext(); } catch (error) { if (error.status === 409) throw new TaskInputError(en ? 'The plan or source documents changed.' : 'El plan o los documentos de origen cambiaron.'); throw error; } };
    context.signal?.throwIfAborted();
    const snapshot = await getContext(), credential = await context.getCredential();
    if (!Array.isArray(snapshot.roots) || !snapshot.roots.length) throw new TaskInputError(en ? 'There are no template chapters.' : 'No hay capítulos de plantilla.');
    if (!isSupportedTextCredential(credential)) throw new TaskInputError(en ? 'Configure a supported provider.' : 'Configura un proveedor compatible.');
    const directory = await createManagedWorkspace(temporaryRoot,'template'); let runtime, helper;
    const cancel = () => { void helper?.close().catch(() => {}); };
    try {
      const app = { isPackaged: false, getPath: () => directory }, workspace = join(directory, 'workspace');
      await mkdir(join(workspace, 'sources'), { recursive: true });
      const sources = [];
      for (const [index, id] of payload.fileIds.entries()) {
        context.signal?.throwIfAborted();
        const file = await (context.getFileStream ? context.getFileStream(id) : context.getFileInfo(id));
        if (!file.name?.toLowerCase().endsWith('.docx')) { if (file.body && !file.body.locked) await file.body.cancel().catch(()=>{}); throw new TaskInputError(en ? 'Choose valid DOCX documents.' : 'Selecciona documentos DOCX válidos.'); }
        const relative = `sources/source-${index + 1}.docx`, path = join(workspace, relative);
        const size = await saveSourceFile(file, path, {signal:context.signal,language:en?'en':'es'});
        const source = await open(path,'r'); let header; try { header = Buffer.alloc(4); await source.read(header,0,4,0); } finally { await source.close(); }
        if (size < 4 || !header.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new TaskInputError(en ? 'Choose valid DOCX documents.' : 'Selecciona documentos DOCX válidos.');
        sources.push(relative);
      }
      const config = { ...textProviderConfig(credential), request_mode: 'normal', ui_language: en ? 'en' : 'es', language: en ? 'en' : 'es', developer_mode: false, multimodal_enabled: false,  concurrency_limit: 2, };
      const configStore = { load: () => config }, aiService = createAiService({ app, configStore });
      const executablePath = resolvePackagedHelper(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
      helper = createHelper({ app, configStore, executablePath });
      context.signal?.addEventListener('abort', cancel, { once: true });
      runtime = createRuntime({ app, configStore, aiService, isMonitorActive: () => false, requestUserQuestion: (request, signal) => context.askUser(request, signal) });
      const output = 'template/bid-template.docx', source = 'template/bid-template-source.docx', fields = 'template/bid-template-fields.json';
      await mkdir(join(workspace, 'template'), { recursive: true });
      const workspaceStore = {
        listTenderSourceDocxRelativePaths: () => sources,
        resolveTenderSourceDocxPath: hint => sources.filter(item => item === hint),
        getBidTemplateSourcePath: () => join(workspace, source), getBidTemplateSourceRelativePath: () => source,
        getBidTemplatePath: () => join(workspace, output), getBidTemplateRelativePath: () => output,
        getBidTemplateFieldsPath: () => join(workspace, fields), getBidTemplateFieldsRelativePath: () => fields,
        hasBidTemplate: () => existsSync(join(workspace, output)) && existsSync(join(workspace, fields)),
      };
      const directive = en ? '\nWrite all user-facing text and field names in English. Keep JSON keys and enum values unchanged.' : '\nEscribe los textos visibles y nombres de campos en español. Conserva las claves y los valores de enumeración del JSON.';
      const agentService = { updatePersistentTask: () => {}, runTask: task => { const { persistent_task, ...rest } = task; return runtime.runTask({ ...rest, prompt: `${task.prompt}${directive}`, secop_safe_tools: true, failure_handled_by_parent: true, active_tools: ['read', 'write', 'edit', 'grep', 'find', 'ls', 'json-validation', 'openxml', 'report-failure'] }); } };
      await runExtraction({ agentService, workspaceStore, openXmlHelperService: helper, taskId: context.job.id, outline: snapshot.roots, signal: context.signal });
      context.signal?.throwIfAborted();
      if (!workspaceStore.hasBidTemplate()) throw new TaskInputError(en ? 'The template was not produced.' : 'No se generó la plantilla.');
      const manifest = JSON.parse(await readFile(workspaceStore.getBidTemplateFieldsPath(), 'utf8'));
      if (manifest?.version !== 1 || !Array.isArray(manifest.fields) || JSON.stringify(manifest.fields).length > 500_000) throw new TaskInputError(en ? 'The template field list is invalid.' : 'La lista de campos de la plantilla no es válida.');
      const bytes = await readFile(workspaceStore.getBidTemplatePath());
      await getContext();
      const artifact = await context.uploadArtifact(bytes);
      context.signal?.throwIfAborted();
      return { artifactId: artifact.id, fields: manifest.fields };
    } finally {
      context.signal?.removeEventListener('abort', cancel);
      try { try { await runtime?.close(); } finally { await helper?.close(); } } finally { await rm(directory, { recursive: true, force: true }); }
    }
  };
}
