import { hasPendingFacts, pendingFactLocations } from './preparation-readiness.mjs';

export const PROJECT_UI_MODE_KEY = 'savia_project_ui_mode';

export const BACKEND_STAGES = [
  'project-overview',
  'technical-score',
  'response-requirements',
  'chapters',
  'outline',
  'facts',
  'draft',
  'word',
];

export const AUTOPILOT_MILESTONES = [
  {
    id: 'reading',
    index: 0,
    stages: ['project-overview', 'technical-score', 'response-requirements'],
    label: { es: 'Lectura del pliego', en: 'Tender reading' },
  },
  {
    id: 'structure',
    index: 1,
    stages: ['chapters', 'outline'],
    label: { es: 'Estructura', en: 'Structure' },
  },
  {
    id: 'facts',
    index: 2,
    stages: ['facts'],
    label: { es: 'Datos clave', en: 'Key facts' },
  },
  {
    id: 'draft',
    index: 3,
    stages: ['draft', 'word'],
    label: { es: 'Borrador Word', en: 'Word draft' },
  },
];

export const STAGE_LABELS = {
  'project-overview': { es: 'Resumen del pliego', en: 'Tender summary' },
  'technical-score': { es: 'Criterios de puntuación', en: 'Scoring criteria' },
  'response-requirements': { es: 'Requisitos de respuesta', en: 'Response requirements' },
  chapters: { es: 'Capítulos principales', en: 'Main chapters' },
  outline: { es: 'Índice detallado', en: 'Detailed outline' },
  facts: { es: 'Datos clave de la oferta', en: 'Key proposal facts' },
  draft: { es: 'Redacción de capítulos', en: 'Chapter drafting' },
  word: { es: 'Generación del borrador Word', en: 'Word draft export' },
};

const STAGE_TO_MILESTONE_INDEX = new Map(
  AUTOPILOT_MILESTONES.flatMap(milestone => milestone.stages.map(stage => [stage, milestone.index])),
);

export function stageToMilestoneIndex(stage) {
  if (typeof stage !== 'string') return 0;
  return STAGE_TO_MILESTONE_INDEX.get(stage) ?? 3;
}

export function getStageLabel(stage, language = 'es') {
  const entry = STAGE_LABELS[stage];
  if (!entry) return language === 'en' ? 'Preparing bid' : 'Preparando oferta';
  return language === 'en' ? entry.en : entry.es;
}

export const RUNNER_ONLINE_WINDOW_MS = 6 * 60 * 1000;

export function summarizeRunnerConnection(runners, serverNow) {
  if (!Array.isArray(runners) || !Number.isFinite(serverNow)) {
    return { state: 'unknown', onlineCount: 0, totalCount: 0, runnerName: null, runningJobs: 0 };
  }
  const local = runners.filter(
    runner => runner.executionMode === undefined || runner.executionMode === 'local',
  );
  const onlineRunners = local.filter(runner => {
    const seenAt = Date.parse(runner.lastSeenAt || '');
    return Number.isFinite(seenAt) && serverNow - seenAt < RUNNER_ONLINE_WINDOW_MS;
  });
  const runningJobs = local.reduce((total, runner) => total + (runner.runningJobs || 0), 0);
  const state = runningJobs > 0 ? 'busy' : onlineRunners.length > 0 ? 'online' : 'offline';
  const runnerName = (onlineRunners[0] || local[0])?.name || null;
  return {
    state,
    onlineCount: onlineRunners.length,
    totalCount: local.length,
    runnerName,
    runningJobs,
  };
}

const JOB_PROGRESS_LABELS = {
  preparing: { es: 'Preparando tarea…', en: 'Preparing task…' },
  reading: { es: 'Leyendo documentos…', en: 'Reading documents…' },
  ocr: { es: 'Extrayendo texto (OCR)…', en: 'Extracting text (OCR)…' },
  generating: { es: 'Generando contenido con IA…', en: 'Generating AI content…' },
};

export function getActiveJobStatusLabel(activeJob, language = 'es', runnerState = 'unknown') {
  const en = language === 'en';
  if (!activeJob) {
    if (runnerState === 'offline') {
      return en
        ? 'Waiting for a connected runner to start this stage.'
        : 'Esperando un runner conectado para iniciar esta etapa.';
    }
    return en ? 'Coordinating next step…' : 'Coordinando el siguiente paso…';
  }
  if (activeJob.progress && JOB_PROGRESS_LABELS[activeJob.progress]) {
    return en ? JOB_PROGRESS_LABELS[activeJob.progress].en : JOB_PROGRESS_LABELS[activeJob.progress].es;
  }
  if (activeJob.state === 'queued') {
    if (runnerState === 'offline') {
      return en
        ? 'Queued — waiting for a connected runner.'
        : 'En cola — esperando a que se conecte un runner.';
    }
    return en ? 'Waiting for local runner…' : 'Esperando al runner local…';
  }
  if (activeJob.state === 'running') {
    return en ? 'Running on local runner…' : 'Ejecutando en el runner local…';
  }
  return en ? 'Updating progress…' : 'Actualizando avance…';
}

function truncateText(text, maxLength = 180) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

const TOOL_LABELS_ES = {
  read: 'Leer archivo',
  write: 'Escribir resultado',
  edit: 'Editar resultado',
  grep: 'Buscar texto',
  find: 'Buscar archivos',
  ls: 'Listar archivos',
  'json-validation': 'Validar resultado',
  'ask-user': 'Solicitar tu respuesta',
  'report-failure': 'Notificar un error',
};

const TOOL_LABELS_EN = {
  read: 'Read file',
  write: 'Write result',
  edit: 'Edit result',
  grep: 'Search text',
  find: 'Find files',
  ls: 'List files',
  'json-validation': 'Validate result',
  'ask-user': 'Ask for your input',
  'report-failure': 'Report an error',
};

const ACTIVITY_CODE_LABELS_ES = {
  'document.start': 'Abriendo documento',
  'document.end': 'Documento leído',
  'chapter.start': 'Redactando capítulo',
  'chapter.end': 'Capítulo guardado',
  'ocr.page': 'Reconociendo página (OCR)',
  'job.succeeded': 'Tarea completada',
  'job.failed': 'Tarea fallida',
  preparing: 'Preparando documentos',
  reading: 'Consultando fuentes',
  ocr: 'Reconociendo texto escaneado (OCR)',
  generating: 'Trabajando con el modelo',
};

const ACTIVITY_CODE_LABELS_EN = {
  'document.start': 'Opening document',
  'document.end': 'Document read',
  'chapter.start': 'Drafting chapter',
  'chapter.end': 'Chapter saved',
  'ocr.page': 'Recognizing page (OCR)',
  'job.succeeded': 'Task completed',
  'job.failed': 'Task failed',
  preparing: 'Preparing documents',
  reading: 'Reading sources',
  ocr: 'Recognizing scanned text (OCR)',
  generating: 'Working with the model',
};

export function formatActivityEventLabel(event, language = 'es') {
  const en = language === 'en';
  const code = String(event?.code || '');
  const details = event?.details || {};
  const toolLabels = en ? TOOL_LABELS_EN : TOOL_LABELS_ES;
  const codeLabels = en ? ACTIVITY_CODE_LABELS_EN : ACTIVITY_CODE_LABELS_ES;

  if (code === 'agent.console') {
    const evt = String(details.event || '');
    const tool = details.tool ? (toolLabels[details.tool] || details.tool) : '';
    let summary = '';
    if (typeof details.text === 'string' && details.text.trim()) {
      try {
        const parsed = JSON.parse(details.text);
        if (typeof parsed?.text === 'string' && /^(assistant\.|process\.)/.test(parsed.event || evt)) {
          summary = truncateText(parsed.text);
        } else if (parsed?.args?.path || parsed?.path) {
          summary = truncateText(parsed.args?.path || parsed.path);
        }
      } catch {
        summary = truncateText(details.text);
      }
    }
    if (evt === 'tool.start') {
      return truncateText(
        `${tool || (en ? 'Tool' : 'Herramienta')}: ${summary || (en ? 'started' : 'iniciada')}`,
      );
    }
    if (evt === 'tool.end') {
      return truncateText(
        `${tool || (en ? 'Tool' : 'Herramienta')}: ${summary || (en ? 'finished' : 'completada')}`,
      );
    }
    if (evt === 'tool.error') {
      return truncateText(
        `${tool || (en ? 'Tool' : 'Herramienta')} (${en ? 'error' : 'error'}): ${summary || ''}`,
      );
    }
    if (summary) return summary;
    return truncateText([evt || (en ? 'Agent update' : 'Actividad del agente'), tool].filter(Boolean).join(' · '));
  }

  let base = '';
  if (code.startsWith('tool.')) {
    const [, toolName, status] = code.split('.');
    const toolLabel = toolLabels[toolName] || toolName || (en ? 'Tool' : 'Herramienta');
    const suffix = status === 'start'
      ? (en ? 'started' : 'inicio')
      : status === 'error'
        ? 'error'
        : (en ? 'finished' : 'fin');
    base = `${toolLabel} · ${suffix}`;
  } else {
    base = codeLabels[code] || code || (en ? 'Runner event' : 'Evento del runner');
  }

  const parts = [base];
  const target = [details.chapter, details.document, details.path].filter(Boolean).join(' · ');
  if (target) parts.push(target);
  if (details.page != null && details.totalPages != null) {
    parts.push(`${en ? 'Page' : 'Página'} ${details.page}/${details.totalPages}`);
  } else if (details.index != null && details.total != null) {
    parts.push(`${details.index}/${details.total}`);
  }
  return truncateText(parts.join(' · '));
}

export function buildAutopilotTimeline(preparation, language = 'es') {
  const locale = language === 'en' ? 'en' : 'es';
  if (!preparation) {
    return AUTOPILOT_MILESTONES.map(milestone => ({
      id: milestone.id,
      index: milestone.index,
      stepNumber: milestone.index + 1,
      label: milestone.label[locale],
      status: 'pending',
    }));
  }

  const isReady = preparation.status === 'ready';
  const currentIndex = isReady ? AUTOPILOT_MILESTONES.length : stageToMilestoneIndex(preparation.stage);

  return AUTOPILOT_MILESTONES.map(milestone => {
    let status = 'pending';
    if (isReady || milestone.index < currentIndex) {
      status = 'completed';
    } else if (milestone.index === currentIndex) {
      if (preparation.status === 'blocked') status = 'blocked';
      else if (preparation.status === 'paused') status = 'paused';
      else status = 'active';
    }
    return {
      id: milestone.id,
      index: milestone.index,
      stepNumber: milestone.index + 1,
      label: milestone.label[locale],
      status,
    };
  });
}

export function resolveAutopilotDecision(preparation, questions = []) {
  if (Array.isArray(questions) && questions.length > 0) {
    return { kind: 'agent_question', reason: 'agent_question', questions };
  }
  if (!preparation || preparation.status !== 'blocked') return null;

  const reason = preparation.reason || 'step_failed';
  if (reason === 'technical_score_unknown') {
    return { kind: 'technical_score_unknown', reason };
  }
  if (reason === 'facts_need_input' || reason === 'facts_pending_replacements') {
    return { kind: 'facts_need_input', reason };
  }
  if (reason === 'rup_consent_required') {
    return { kind: 'rup_consent_required', reason };
  }
  if (reason === 'existing_draft') {
    return { kind: 'existing_draft', reason };
  }
  if (reason === 'task_failed') {
    return { kind: 'task_failed', reason };
  }
  return { kind: 'generic_blocked', reason };
}

export function resolveAutopilotViewPhase(preparation, questions = []) {
  if (Array.isArray(questions) && questions.length > 0) return 'decision';
  if (!preparation) return 'setup';
  if (preparation.status === 'ready') return 'ready';
  if (preparation.status === 'blocked') return 'decision';
  if (preparation.status === 'paused') return 'paused';
  return 'running';
}

export function extractPendingFactGroups(groups = []) {
  if (!Array.isArray(groups)) return [];
  const locations = pendingFactLocations(groups);
  const countByGroup = new Map();
  for (const loc of locations) {
    countByGroup.set(loc.groupId, (countByGroup.get(loc.groupId) || 0) + 1);
  }
  return groups
    .filter(group => hasPendingFacts(`${group.title ?? ''} ${group.content ?? ''}`))
    .map(group => ({
      id: group.id,
      title: String(group.title ?? ''),
      content: String(group.content ?? ''),
      pendingCount: countByGroup.get(group.id) || 1,
    }));
}

export function countPendingFacts(groups = []) {
  if (!Array.isArray(groups)) return 0;
  return pendingFactLocations(groups).length;
}

export function mergeUpdatedFactGroups(allGroups = [], updatedPendingGroups = []) {
  const updates = new Map(updatedPendingGroups.map(group => [group.id, group]));
  return allGroups.map(group => {
    const edited = updates.get(group.id);
    if (!edited) return group;
    return {
      ...group,
      title: edited.title,
      content: edited.content,
    };
  });
}

export function readProjectUiMode(storage) {
  try {
    const value = storage?.getItem?.(PROJECT_UI_MODE_KEY);
    return value === 'detailed' ? 'detailed' : 'autopilot';
  } catch {
    return 'autopilot';
  }
}

export function writeProjectUiMode(storage, mode) {
  try {
    storage?.setItem?.(PROJECT_UI_MODE_KEY, mode === 'detailed' ? 'detailed' : 'autopilot');
  } catch {
    // Ignore storage quota or privacy mode errors.
  }
}

const JOB_PROGRESS_FRACTION = {
  preparing: 0.25,
  reading: 0.45,
  ocr: 0.55,
  generating: 0.75,
};

export function computeAutopilotProgress(preparation) {
  const totalStages = BACKEND_STAGES.length;
  if (!preparation) {
    return { percent: 0, stageNumber: 0, completedStages: 0, totalStages, state: 'idle' };
  }
  if (preparation.status === 'ready') {
    return { percent: 100, stageNumber: totalStages, completedStages: totalStages, totalStages, state: 'ready' };
  }
  const idxRaw = BACKEND_STAGES.indexOf(preparation.stage);
  const idx = idxRaw < 0 ? 0 : idxRaw;
  let sub = 0;
  if (preparation.status === 'running') {
    const activeJob = preparation.activeJob;
    if (activeJob?.state === 'queued') {
      sub = 0.1;
    } else if (activeJob?.state === 'running') {
      sub = JOB_PROGRESS_FRACTION[activeJob.progress] ?? 0.35;
    } else if (activeJob?.state === 'succeeded') {
      sub = 0.95;
    }
  }
  const percent = Math.min(99, Math.max(0, Math.round(((idx + sub) / totalStages) * 100)));
  return {
    percent,
    stageNumber: idx + 1,
    completedStages: idx,
    totalStages,
    state: preparation.status,
  };
}

export function extractPendingPlaceholdersForGroup(group) {
  if (!group) return [];
  const locations = pendingFactLocations([group]);
  const seen = new Set();
  const hints = [];
  for (const loc of locations) {
    const raw = String(group[loc.field] ?? '');
    const lineStart = Math.max(0, raw.lastIndexOf('\n', loc.start) + 1);
    const snippet = truncateText(raw.slice(lineStart, loc.end), 64);
    if (snippet && !seen.has(snippet)) {
      seen.add(snippet);
      hints.push(snippet);
      if (hints.length >= 6) break;
    }
  }
  return hints;
}

export function describeBlockedReason(reason, stage, language = 'es') {
  const en = language === 'en';
  const stageLabel = getStageLabel(stage, language);
  const code = String(reason || '');

  if (code === 'step_failed' || code === 'facts_or_sources_conflict' || code === 'selection_changed') {
    return en
      ? {
          title: `Temporary interruption in “${stageLabel}”`,
          description:
            'A temporary issue occurred while saving this stage. Your previous progress is safe and you can retry right here.',
          actionLabel: 'Retry and continue',
        }
      : {
          title: `Interrupción temporal en «${stageLabel}»`,
          description:
            'Ocurrió un inconveniente temporal al guardar esta etapa. Tu avance anterior está a salvo y puedes reintentar aquí mismo.',
          actionLabel: 'Reintentar y continuar',
        };
  }

  if (code === 'draft_unavailable') {
    return en
      ? {
          title: 'Word draft unavailable',
          description: 'The previous export did not produce a file. Retry to generate the Word draft.',
          actionLabel: 'Regenerate Word draft',
        }
      : {
          title: 'El documento Word no quedó disponible',
          description: 'La exportación anterior no generó el archivo final. Vuelve a intentarlo para crear el borrador Word.',
          actionLabel: 'Volver a generar Word',
        };
  }

  if (code === 'template_selection_required') {
    return en
      ? {
          title: 'Word format confirmation needed',
          description: 'Continue to generate the Word draft using the project default format.',
          actionLabel: 'Continue with standard format',
        }
      : {
          title: 'Falta confirmar el formato del documento Word',
          description: 'Continúa para generar el borrador Word con el formato estándar del proyecto.',
          actionLabel: 'Continuar con formato estándar',
        };
  }

  return en
    ? {
        title: `Paused at “${stageLabel}”`,
        description: 'This stage could not finish automatically. You can retry it here without losing progress.',
        actionLabel: 'Retry and continue',
      }
    : {
        title: `Pausa en «${stageLabel}»`,
        description: 'Esta etapa no se pudo completar automáticamente. Puedes reintentarla aquí sin perder tu avance.',
        actionLabel: 'Reintentar y continuar',
      };
}
