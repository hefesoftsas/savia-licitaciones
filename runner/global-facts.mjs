import { isSupportedTextCredential, textProviderConfig } from './text-provider.mjs';
import {createManagedWorkspace} from './managed-workspaces.mjs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import aiModule from '../client/electron/services/aiService.cjs';
import runtimeModule from '../client/electron/services/pi/piRuntimeService.cjs';
import factsModule from '../client/electron/services/globalFactsTaskV2.cjs';
import { extractTenderSources } from './tender-chat.mjs';
import { TaskInputError } from './task-errors.mjs';

export function createGlobalFactsHandler({ temporaryRoot = tmpdir(), createAiService = aiModule.createAiService, createRuntime = runtimeModule.createPiRuntimeService, runTask = factsModule.runGlobalFactsTaskV2 } = {}) {
  return async (payload, context) => {
    const en = payload?.language === 'en';
    if (payload?.dataProcessingConsent !== true || !['placeholder', 'omit', 'fabricate'].includes(payload.mode) || !Array.isArray(payload.fileIds) || !payload.fileIds.length) throw new TaskInputError(en ? 'Consent, sources and a missing-information mode are required.' : 'Se requieren consentimiento, documentos y un tratamiento de información ausente.');
    if (payload.factsSnapshot?.knowledgeIds?.length && payload.knowledgeConsent !== true) throw new TaskInputError(en ? 'Consent is required for selected knowledge.' : 'Se requiere consentimiento para el conocimiento seleccionado.');
    if (payload.includeRup === true && payload.rupConsent !== true) throw new TaskInputError(en ? 'Separate consent is required for RUP data.' : 'Se requiere consentimiento específico para los datos del RUP.');
    const getContext = async () => { try { return await context.getPlanContext(); } catch (error) { if (error.status === 409) throw new TaskInputError(en ? 'The plan or sources changed.' : 'El plan o las fuentes cambiaron.'); throw error; } };
    context.signal?.throwIfAborted();
    const snapshot = await getContext(), credential = await context.getCredential();
    if (!Array.isArray(snapshot.outline) || !snapshot.outline.length) throw new TaskInputError(en ? 'Create an outline first.' : 'Crea primero un índice.');
    if (!isSupportedTextCredential(credential)) throw new TaskInputError(en ? 'Configure a supported provider.' : 'Configura un proveedor compatible.');
    const directory = await createManagedWorkspace(temporaryRoot,'facts'); let runtime;
    try {
      const app = { isPackaged: false, getPath: () => directory };
      const config = { ...textProviderConfig(credential), request_mode: 'normal', ui_language: en ? 'en' : 'es', language: en ? 'en' : 'es', developer_mode: false, multimodal_enabled: false,  concurrency_limit: 2, components: { file_parser: { provider: 'local' } } };
      const sources = await extractTenderSources(payload.fileIds, context, app, config, directory, en);
      const configStore = { load: () => config }, aiService = createAiService({ app, configStore });
      runtime = createRuntime({ app, configStore, aiService, isMonitorActive: () => false, requestUserQuestion: (request, signal) => context.askUser(request, signal) });
      const rupFacts = payload.includeRup === true ? snapshot.rupFacts : undefined;
      if (payload.includeRup === true && (!Array.isArray(rupFacts) || JSON.stringify(rupFacts).length > 1_000_000)) throw new TaskInputError(en ? 'Reviewed RUP data is unavailable or too large.' : 'Los datos revisados del RUP no están disponibles o son demasiado extensos.');
      const rupFiles = rupFacts ? [{ path: 'references/rup-reviewed.json', content: JSON.stringify({ facts: rupFacts }) }] : [];
      const knowledgeIds = payload.factsSnapshot?.knowledgeIds || [];
      const knowledgeEntries = knowledgeIds.length && payload.knowledgeConsent === true ? snapshot.knowledgeEntries : undefined;
      if (knowledgeIds.length && (!Array.isArray(knowledgeEntries) || knowledgeEntries.length !== knowledgeIds.length || new Set(knowledgeEntries.map(entry => entry.id)).size !== knowledgeIds.length || knowledgeEntries.some(entry => !knowledgeIds.includes(entry.id)) || JSON.stringify(knowledgeEntries).length > 250000)) throw new TaskInputError(en ? 'Selected knowledge is unavailable or too large.' : 'El conocimiento seleccionado no está disponible o es demasiado extenso.');
      const knowledgeFiles = knowledgeEntries ? [{ path: 'references/knowledge.json', content: JSON.stringify({ entries: knowledgeEntries }) }] : [];
      const approvedAnalyses = Object.entries(snapshot.analyses || {}).filter(([key, value]) => ['technical-score', 'response-requirements'].includes(key) && typeof value === 'string' && value.trim()).map(([key, value]) => ({ path: `analyses/${key}.md`, content: value }));
      const directive = (en ? '\nWrite user-facing facts, titles and questions in English; preserve protocol keys and IDs.' : '\nEscribe los hechos, títulos y preguntas para el usuario en español; conserva las claves y los identificadores del protocolo.') + (approvedAnalyses.length ? `\nRead these approved analyses as additional context: ${approvedAnalyses.map(file => file.path).join(', ')}.` : '') + (rupFiles.length ? (en ? '\nRead references/rup-reviewed.json as user-reviewed RUP evidence; cite labels and pages, and do not infer unsupported bidder claims.' : '\nLee references/rup-reviewed.json como datos revisados del RUP; indica etiquetas y páginas, y no infieras afirmaciones del oferente que no estén respaldadas.') : '') + (knowledgeFiles.length ? (en ? '\nRead references/knowledge.json as user-approved knowledge; cite the document name and quote, and do not infer unsupported claims.' : '\nLee references/knowledge.json como conocimiento aceptado por el usuario; indica el nombre del documento y la cita, sin inferir afirmaciones no respaldadas.') : '') + (payload.mode === 'fabricate' ? (en ? '\nMark every illustrative proposed detail as [Proposed: verify]; never present it as a verified fact.' : '\nMarca cada detalle ilustrativo propuesto como [Propuesto: verificar]; nunca lo presentes como un hecho verificado.') : '');
      const agentService = { updatePersistentTask: () => {}, runTask: task => { const { persistent_task, validateOutput, ...rest } = task; return runtime.runTask({ ...rest, files: [...(task.files || []), ...approvedAnalyses, ...rupFiles, ...knowledgeFiles], prompt: `${task.prompt}${directive}`, secop_safe_tools: true, failure_handled_by_parent: true, active_tools: ['read', 'write', 'edit', 'grep', 'find', 'ls', 'json-validation', 'ask-user', 'report-failure'], validateOutput: candidate => { const report = validateOutput(candidate); if (!report.issues.length && (report.value.groups.length > 100 || report.value.groups.some(item => item.id.length > 100 || item.title.length > 300 || item.content.length > 20000))) report.issues.push({ severity: 'blocking', file: 'global-facts.json', message: 'Too many groups or excessively long fields.' }); return report; } }); } };
      let task = { task_id: context.job.id, stats: {} }, groups;
      const checkpointTask = (patch, planPatch) => { task = { ...task, ...patch }; if (patch.status === 'success' && planPatch?.globalFacts) groups = planPatch.globalFacts; return { task }; };
      const updateTask = patch => { task = { ...task, ...patch }; return task; };
      const analyses = snapshot.analyses || {};
      const workspaceStore = { loadTechnicalPlan: () => ({ outlineData: { outline: snapshot.outline }, projectOverview: analyses['project-overview'] || '', techRequirements: analyses['technical-score'] || '', bidAnalysisTasks: { projectOverview: { content: analyses['project-overview'] || '' }, techRequirements: { content: analyses['technical-score'] || '' }, responseFileRequirements: { content: analyses['response-requirements'] || '' } }, tenderFiles: sources.map(source => ({ id: source.id, fileName: source.fileName })) }), readTenderSourceMarkdown: id => sources.find(source => source.id === id)?.content || '' };
      await runTask({ agentService, workspaceStore, knowledgeBaseService: null, updateTask, checkpointTask, taskControl: { signal: context.signal }, payload: { globalFactsMode: payload.mode, language: en ? 'en' : 'es' } });
      context.signal?.throwIfAborted(); await getContext();
      if (!Array.isArray(groups) || !groups.length) throw new TaskInputError(en ? 'No facts were produced.' : 'No se generaron hechos.');
      return { groups };
    } finally { try { await runtime?.close(); } finally { await rm(directory, { recursive: true, force: true }); } }
  };
}
