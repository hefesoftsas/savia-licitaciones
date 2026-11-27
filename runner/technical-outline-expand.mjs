import { isSupportedTextCredential, textProviderConfig } from './text-provider.mjs';
import {createManagedWorkspace} from './managed-workspaces.mjs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import aiModule from '../client/electron/services/aiService.cjs';
import runtimeModule from '../client/electron/services/pi/piRuntimeService.cjs';
import outlineModule from '../client/electron/services/outlineGenerationTaskV2.cjs';
import { TaskInputError } from './task-errors.mjs';

function reconcileExpandedOutline(items, roots) {
  if (!Array.isArray(items) || !Array.isArray(roots) || items.length !== roots.length) return null;
  const byId = new Map();
  for (const item of items) {
    if (typeof item?.id !== 'string' || byId.has(item.id)) return null;
    byId.set(item.id, item);
  }
  const direct = roots.map(root => byId.get(root?.id));
  if (direct.some(node => !node)) return null;
  const used = new Set();
  const reconciled = [];
  for (let index = 0; index < roots.length; index++) {
    const root = roots[index];
    if (!root) return null;
    let candidate = direct[index];
    if (candidate.title !== root.title || candidate.description !== root.description || candidate.attr !== root.attr) {
      const matchIndex = items.findIndex((item, itemIndex) => (
        !used.has(itemIndex) &&
        item?.title === root.title &&
        item?.description === root.description &&
        item?.attr === root.attr
      ));
      if (matchIndex === -1) return null;
      used.add(matchIndex);
      candidate = items[matchIndex];
    } else {
      used.add(items.indexOf(candidate));
    }
    const normalized = { ...candidate, id: root.id };
    if (!candidate.children?.length && root.content_mode !== 'ai-generate') {
      normalized.content_mode = root.content_mode;
      if (root.content_mode_note !== undefined) normalized.content_mode_note = root.content_mode_note;
    }
    reconciled.push(normalized);
  }
  return reconciled;
}

export function createOutlineExpandHandler({ temporaryRoot = tmpdir(), createAiService = aiModule.createAiService, createRuntime = runtimeModule.createPiRuntimeService, runTask = outlineModule.runOutlineGenerationTaskV2 } = {}) {
  return async (payload, context) => {
    const en = payload?.language === 'en';
    if (payload?.dataProcessingConsent !== true || typeof payload.noTechnicalScore !== 'boolean') throw new TaskInputError(en ? 'Consent and a scoring choice are required.' : 'Se requiere consentimiento y una selección sobre la puntuación técnica.');
    const getContext = async () => { try { return await context.getPlanContext(); } catch (error) { if (error.status === 409) throw new TaskInputError(en ? 'The plan, selection or sources changed.' : 'El plan, la selección o las fuentes cambiaron.'); throw error; } };
    context.signal?.throwIfAborted();
    const snapshot = await getContext(), credential = await context.getCredential();
    if (!Array.isArray(snapshot.roots) || !snapshot.roots.length) throw new TaskInputError(en ? 'Confirm chapters first.' : 'Confirma primero los capítulos.');
    if (!isSupportedTextCredential(credential)) throw new TaskInputError(en ? 'Configure a supported provider.' : 'Configura un proveedor compatible.');
    const directory = await createManagedWorkspace(temporaryRoot,'outline-expand'); let runtime;
    try {
      const app = { isPackaged: false, getPath: () => directory };
      const config = { ...textProviderConfig(credential), request_mode: 'normal', ui_language: en ? 'en' : 'es', language: en ? 'en' : 'es', developer_mode: false, multimodal_enabled: false,  concurrency_limit: 2, components: { file_parser: { provider: 'local' } } };
      const configStore = { load: () => config }, aiService = createAiService({ app, configStore });
      runtime = createRuntime({ app, configStore, aiService, isMonitorActive: () => false, requestUserQuestion: (request, signal) => context.askUser(request, signal) });
      const directive = en ? '\nAll user-facing questions, chapter titles, descriptions and review text must be in English. Keep JSON keys and enum values unchanged. For individually specified activities, create a distinct response leaf for each under the appropriate chapter, preserving its identifier and scope unless the required template dictates another structure. Preserve the selected root chapters and their order; if a change is needed, stop and ask the user to revise the selection.' : '\nTodas las preguntas al usuario, títulos, descripciones y textos de revisión deben estar en español. Conserva las claves y los valores de enumeración del JSON. Para las actuaciones individualizadas, crea una sección de respuesta por actuación bajo el capítulo correspondiente, conservando su identificador y alcance salvo que el formato exigido indique otra estructura. Mantén los capítulos raíz seleccionados y su orden; si es necesario cambiarlos, detén la tarea y pide al usuario que revise la selección.';
      const agentService = { updatePersistentTask: () => {}, runTask: task => {
        const { persistent_task, continueTask, ...rest } = task;
        return runtime.runTask({ ...rest, prompt: `${task.prompt}${directive}`, secop_safe_tools: true, failure_handled_by_parent: true, active_tools: ['read', 'write', 'edit', 'grep', 'find', 'ls', 'json-validation', 'ask-user', 'report-failure'], ...(continueTask ? { continueTask: async (...args) => { const next = await continueTask(...args); return next?.prompt ? { ...next, prompt: `${next.prompt}${directive}` } : next; } } : {}) });
      } };
      let task = { task_id: context.job.id, stats: {} }, generated;
      const checkpointTask = (patch, planPatch) => { task = { ...task, ...patch }; if (planPatch?.outlineData) generated = planPatch.outlineData; return { task }; };
      const updateTask = patch => { task = { ...task, ...patch }; return task; };
      const score = payload.noTechnicalScore ? '未提取到' : snapshot.analyses['technical-score'];
      const workspaceStore = { loadTechnicalPlan: () => ({ outlineMode: 'response-file', projectOverview: snapshot.analyses['project-overview'], techRequirements: score, bidAnalysisTasks: { techRequirements: { status: 'success', content: score }, responseFileRequirements: { content: snapshot.analyses['response-requirements'] } } }), listTenderSourceDocxRelativePaths: () => [], hasBidTemplate: () => false, clearBidTemplate: () => {} };
      await runTask({ agentService, ordinaryAgentService: agentService, workspaceStore, knowledgeBaseService: { readReferences: () => [] }, openXmlHelperService: null, updateTask, checkpointTask,
        taskControl: { signal: context.signal, waitForOutlineSelection: async () => { context.signal?.throwIfAborted(); return { items: snapshot.roots, selectedIds: snapshot.roots.map(item => item.id) }; } },
        payload: { agent_resume: { phase: 'outline-selection' }, outline_mode: 'response-file', no_technical_score_mode: payload.noTechnicalScore } });
      context.signal?.throwIfAborted();
      await getContext();
      if (!Array.isArray(generated?.outline) || !generated.outline.length) throw new TaskInputError(en ? 'The outline was not generated.' : 'No se generó el índice.');
      const reconciledOutline = reconcileExpandedOutline(generated.outline, snapshot.roots) || generated.outline;
      return { outline: reconciledOutline, warnings: snapshot.roots.some(root => root.content_mode === 'template-fill') ? [en ? 'Automatic extraction of tender templates is not yet available in the web workflow.' : 'La extracción automática de plantillas del pliego aún no está disponible en el flujo web.'] : [] };
    } finally { try { await runtime?.close(); } finally { await rm(directory, { recursive: true, force: true }); } }
  };
}
