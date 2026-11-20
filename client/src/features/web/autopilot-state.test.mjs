import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_UI_MODE_KEY,
  RUNNER_ONLINE_WINDOW_MS,
  stageToMilestoneIndex,
  getStageLabel,
  summarizeRunnerConnection,
  getActiveJobStatusLabel,
  formatActivityEventLabel,
  buildAutopilotTimeline,
  resolveAutopilotDecision,
  resolveAutopilotViewPhase,
  extractPendingFactGroups,
  countPendingFacts,
  mergeUpdatedFactGroups,
  readProjectUiMode,
  writeProjectUiMode,
  computeAutopilotProgress,
  extractPendingPlaceholdersForGroup,
  describeBlockedReason,
} from './autopilot-state.mjs';

test('maps all 8 backend stages to the 4 human milestones', () => {
  assert.equal(stageToMilestoneIndex('project-overview'), 0);
  assert.equal(stageToMilestoneIndex('technical-score'), 0);
  assert.equal(stageToMilestoneIndex('response-requirements'), 0);
  assert.equal(stageToMilestoneIndex('chapters'), 1);
  assert.equal(stageToMilestoneIndex('outline'), 1);
  assert.equal(stageToMilestoneIndex('facts'), 2);
  assert.equal(stageToMilestoneIndex('draft'), 3);
  assert.equal(stageToMilestoneIndex('word'), 3);
});

test('buildAutopilotTimeline sets pending, completed, active, paused, blocked, and ready states', () => {
  const initial = buildAutopilotTimeline(null, 'es');
  assert.deepEqual(
    initial.map(step => [step.stepNumber, step.label, step.status]),
    [
      [1, 'Lectura del pliego', 'pending'],
      [2, 'Estructura', 'pending'],
      [3, 'Datos clave', 'pending'],
      [4, 'Borrador Word', 'pending'],
    ],
  );

  const running = buildAutopilotTimeline(
    { status: 'running', stage: 'outline', reason: null, runId: 'r1', wordId: null },
    'en',
  );
  assert.deepEqual(
    running.map(step => [step.label, step.status]),
    [
      ['Tender reading', 'completed'],
      ['Structure', 'active'],
      ['Key facts', 'pending'],
      ['Word draft', 'pending'],
    ],
  );

  const blocked = buildAutopilotTimeline(
    { status: 'blocked', stage: 'facts', reason: 'facts_need_input', runId: 'r1', wordId: null },
    'es',
  );
  assert.deepEqual(
    blocked.map(step => step.status),
    ['completed', 'completed', 'blocked', 'pending'],
  );

  const paused = buildAutopilotTimeline(
    { status: 'paused', stage: 'draft', reason: null, runId: 'r1', wordId: null },
    'es',
  );
  assert.deepEqual(
    paused.map(step => step.status),
    ['completed', 'completed', 'completed', 'paused'],
  );

  const ready = buildAutopilotTimeline(
    { status: 'ready', stage: 'word', reason: null, runId: 'r1', wordId: 'w1' },
    'es',
  );
  assert.deepEqual(
    ready.map(step => step.status),
    ['completed', 'completed', 'completed', 'completed'],
  );
});

test('getStageLabel returns bilingual labels with fallback', () => {
  assert.equal(getStageLabel('technical-score', 'es'), 'Criterios de puntuación');
  assert.equal(getStageLabel('technical-score', 'en'), 'Scoring criteria');
  assert.equal(getStageLabel('unknown-stage', 'es'), 'Preparando oferta');
  assert.equal(getStageLabel('unknown-stage', 'en'), 'Preparing bid');
});

test('getActiveJobStatusLabel maps activeJob progress, state, and offline runner', () => {
  assert.equal(getActiveJobStatusLabel(null, 'es'), 'Coordinando el siguiente paso…');
  assert.equal(
    getActiveJobStatusLabel(null, 'es', 'offline'),
    'Esperando un runner conectado para iniciar esta etapa.',
  );
  assert.equal(
    getActiveJobStatusLabel({ id: 'j1', kind: 'k', state: 'queued', progress: null }, 'es'),
    'Esperando al runner local…',
  );
  assert.equal(
    getActiveJobStatusLabel({ id: 'j1', kind: 'k', state: 'queued', progress: null }, 'es', 'offline'),
    'En cola — esperando a que se conecte un runner.',
  );
  assert.equal(
    getActiveJobStatusLabel({ id: 'j1', kind: 'k', state: 'queued', progress: null }, 'en', 'offline'),
    'Queued — waiting for a connected runner.',
  );
  assert.equal(getActiveJobStatusLabel({ id: 'j1', kind: 'k', state: 'running', progress: 'ocr' }, 'es'), 'Extrayendo texto (OCR)…');
  assert.equal(getActiveJobStatusLabel({ id: 'j1', kind: 'k', state: 'running', progress: 'generating' }, 'en'), 'Generating AI content…');
});

test('summarizeRunnerConnection classifies unknown, offline, online, and busy runners', () => {
  const now = Date.parse('2026-11-19T20:00:00.000Z');
  assert.deepEqual(summarizeRunnerConnection(null, now), {
    state: 'unknown',
    onlineCount: 0,
    totalCount: 0,
    runnerName: null,
    runningJobs: 0,
  });

  const stale = new Date(now - RUNNER_ONLINE_WINDOW_MS - 5000).toISOString();
  assert.deepEqual(
    summarizeRunnerConnection([{ name: 'Equipo viejo', lastSeenAt: stale, runningJobs: 0 }], now),
    { state: 'offline', onlineCount: 0, totalCount: 1, runnerName: 'Equipo viejo', runningJobs: 0 },
  );

  const fresh = new Date(now - 30_000).toISOString();
  assert.deepEqual(
    summarizeRunnerConnection([{ name: 'MacBook', lastSeenAt: fresh, runningJobs: 0 }], now),
    { state: 'online', onlineCount: 1, totalCount: 1, runnerName: 'MacBook', runningJobs: 0 },
  );

  assert.deepEqual(
    summarizeRunnerConnection([{ name: 'MacBook', lastSeenAt: fresh, runningJobs: 2 }], now),
    { state: 'busy', onlineCount: 1, totalCount: 1, runnerName: 'MacBook', runningJobs: 2 },
  );
});

test('formatActivityEventLabel formats runner events cleanly in Spanish and English', () => {
  assert.equal(
    formatActivityEventLabel(
      { sequence: 1, code: 'document.start', at: '2026-11-19T20:00:00Z', details: { document: 'pliego.pdf', index: 1, total: 4 } },
      'es',
    ),
    'Abriendo documento · pliego.pdf · 1/4',
  );
  assert.equal(
    formatActivityEventLabel(
      { sequence: 2, code: 'ocr.page', at: '2026-11-19T20:00:01Z', details: { document: 'scan.pdf', page: 3, totalPages: 12 } },
      'en',
    ),
    'Recognizing page (OCR) · scan.pdf · Page 3/12',
  );
  assert.equal(
    formatActivityEventLabel(
      { sequence: 3, code: 'tool.read.start', at: '2026-11-19T20:00:02Z', details: { path: '招标文件/resumen.md' } },
      'es',
    ),
    'Leer archivo · inicio · 招标文件/resumen.md',
  );
  assert.equal(
    formatActivityEventLabel(
      {
        sequence: 4,
        code: 'agent.console',
        at: '2026-11-19T20:00:03Z',
        details: { event: 'assistant.text', text: JSON.stringify({ event: 'assistant.text', text: 'Analizando criterios técnicos' }) },
      },
      'es',
    ),
    'Analizando criterios técnicos',
  );
});

test('resolveAutopilotDecision prioritizes live agent questions and maps all blocked reasons', () => {
  const question = { id: 'q1', jobId: 'j1', question: 'Confirm scope?', options: [{ label: 'Yes', custom: false }] };
  const fromQuestion = resolveAutopilotDecision(
    { status: 'running', stage: 'chapters', reason: null, runId: 'r1', wordId: null },
    [question],
  );
  assert.equal(fromQuestion?.kind, 'agent_question');
  assert.equal(fromQuestion?.questions.length, 1);

  assert.equal(
    resolveAutopilotDecision({ status: 'blocked', stage: 'outline', reason: 'technical_score_unknown', runId: 'r1', wordId: null })?.kind,
    'technical_score_unknown',
  );
  assert.equal(
    resolveAutopilotDecision({ status: 'blocked', stage: 'facts', reason: 'facts_need_input', runId: 'r1', wordId: null })?.kind,
    'facts_need_input',
  );
  assert.equal(
    resolveAutopilotDecision({ status: 'blocked', stage: 'facts', reason: 'facts_pending_replacements', runId: 'r1', wordId: null })?.kind,
    'facts_need_input',
  );
  assert.equal(
    resolveAutopilotDecision({ status: 'blocked', stage: 'facts', reason: 'rup_consent_required', runId: 'r1', wordId: null })?.kind,
    'rup_consent_required',
  );
  assert.equal(
    resolveAutopilotDecision({ status: 'blocked', stage: 'facts', reason: 'existing_draft', runId: 'r1', wordId: null })?.kind,
    'existing_draft',
  );
  assert.equal(
    resolveAutopilotDecision({ status: 'blocked', stage: 'draft', reason: 'task_failed', runId: 'r1', wordId: null })?.kind,
    'task_failed',
  );
  assert.equal(
    resolveAutopilotDecision({ status: 'blocked', stage: 'word', reason: 'template_selection_required', runId: 'r1', wordId: null })?.kind,
    'generic_blocked',
  );
  assert.equal(
    resolveAutopilotDecision({ status: 'running', stage: 'draft', reason: null, runId: 'r1', wordId: null }),
    null,
  );
});

test('resolveAutopilotViewPhase resolves setup, running, paused, decision, and ready', () => {
  assert.equal(resolveAutopilotViewPhase(null), 'setup');
  assert.equal(resolveAutopilotViewPhase({ status: 'running', stage: 'draft', reason: null, runId: 'r1', wordId: null }), 'running');
  assert.equal(resolveAutopilotViewPhase({ status: 'paused', stage: 'draft', reason: null, runId: 'r1', wordId: null }), 'paused');
  assert.equal(resolveAutopilotViewPhase({ status: 'blocked', stage: 'facts', reason: 'facts_need_input', runId: 'r1', wordId: null }), 'decision');
  assert.equal(resolveAutopilotViewPhase({ status: 'ready', stage: 'word', reason: null, runId: 'r1', wordId: 'w1' }), 'ready');
  assert.equal(
    resolveAutopilotViewPhase(
      { status: 'running', stage: 'outline', reason: null, runId: 'r1', wordId: null },
      [{ id: 'q1', jobId: 'j1', question: 'Q', options: [] }],
    ),
    'decision',
  );
});

test('extractPendingFactGroups and mergeUpdatedFactGroups only surface pending groups and preserve others', () => {
  const groups = [
    { id: 'g1', title: 'Empresa', content: 'Constructora Savia S.A.S.' },
    { id: 'g2', title: 'Equipo clave', content: 'Director de obra: [Pendiente por completar]. Residente: [Pendiente por confirmar].' },
    { id: 'g3', title: 'Plazo [Pending]', content: '90 días calendario' },
  ];

  const pending = extractPendingFactGroups(groups);
  assert.equal(pending.length, 2);
  assert.equal(pending[0].id, 'g2');
  assert.equal(pending[0].pendingCount, 2);
  assert.equal(pending[1].id, 'g3');
  assert.equal(pending[1].pendingCount, 1);
  assert.equal(countPendingFacts(groups), 3);

  const merged = mergeUpdatedFactGroups(groups, [
    { id: 'g2', title: 'Equipo clave', content: 'Director de obra: Ana Gómez. Residente: Luis Pérez.' },
  ]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].content, 'Constructora Savia S.A.S.');
  assert.equal(merged[1].content, 'Director de obra: Ana Gómez. Residente: Luis Pérez.');
  assert.equal(merged[2].title, 'Plazo [Pending]');
  assert.equal(countPendingFacts(merged), 1);
});

test('readProjectUiMode and writeProjectUiMode default to autopilot and persist detailed mode', () => {
  const store = new Map();
  const storage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
  };

  assert.equal(readProjectUiMode(storage), 'autopilot');
  writeProjectUiMode(storage, 'detailed');
  assert.equal(store.get(PROJECT_UI_MODE_KEY), 'detailed');
  assert.equal(readProjectUiMode(storage), 'detailed');
  writeProjectUiMode(storage, 'autopilot');
  assert.equal(readProjectUiMode(storage), 'autopilot');
});

test('computeAutopilotProgress computes stage counts and percentage across lifecycle states', () => {
  assert.deepEqual(computeAutopilotProgress(null), {
    percent: 0,
    stageNumber: 0,
    completedStages: 0,
    totalStages: 8,
    state: 'idle',
  });

  assert.deepEqual(
    computeAutopilotProgress({
      status: 'running',
      stage: 'project-overview',
      reason: null,
      runId: 'r1',
      wordId: null,
      activeJob: { id: 'j1', kind: 'technical-plan.analyze', state: 'running', progress: 'generating' },
    }),
    { percent: 9, stageNumber: 1, completedStages: 0, totalStages: 8, state: 'running' },
  );

  assert.deepEqual(
    computeAutopilotProgress({
      status: 'running',
      stage: 'response-requirements',
      reason: null,
      runId: 'r1',
      wordId: null,
      activeJob: { id: 'j3', kind: 'technical-plan.analyze', state: 'running', progress: 'generating' },
    }),
    { percent: 34, stageNumber: 3, completedStages: 2, totalStages: 8, state: 'running' },
  );

  assert.deepEqual(
    computeAutopilotProgress({
      status: 'running',
      stage: 'draft',
      reason: null,
      runId: 'r1',
      wordId: null,
      activeJob: { id: 'j7', kind: 'technical-plan.generate-batch', state: 'queued', progress: null },
    }),
    { percent: 76, stageNumber: 7, completedStages: 6, totalStages: 8, state: 'running' },
  );

  assert.deepEqual(
    computeAutopilotProgress({ status: 'paused', stage: 'outline', reason: null, runId: 'r1', wordId: null }),
    { percent: 50, stageNumber: 5, completedStages: 4, totalStages: 8, state: 'paused' },
  );

  assert.deepEqual(
    computeAutopilotProgress({ status: 'blocked', stage: 'facts', reason: 'facts_need_input', runId: 'r1', wordId: null }),
    { percent: 63, stageNumber: 6, completedStages: 5, totalStages: 8, state: 'blocked' },
  );

  assert.deepEqual(
    computeAutopilotProgress({ status: 'ready', stage: 'word', reason: null, runId: 'r1', wordId: 'w1' }),
    { percent: 100, stageNumber: 8, completedStages: 8, totalStages: 8, state: 'ready' },
  );
});

test('extractPendingPlaceholdersForGroup extracts concise unique missing hints', () => {
  const hints = extractPendingPlaceholdersForGroup({
    id: 'g2',
    title: 'Equipo [Pending]',
    content: 'Director de obra: [Pendiente por completar].\nResidente: [Pendiente por confirmar].\nOtro: [Pendiente por completar].',
  });
  assert.deepEqual(hints, [
    'Equipo [Pending]',
    'Director de obra: [Pendiente por completar]',
    'Residente: [Pendiente por confirmar]',
    'Otro: [Pendiente por completar]',
  ]);
});

test('describeBlockedReason returns clear bilingual self-contained copy', () => {
  assert.deepEqual(describeBlockedReason('step_failed', 'facts', 'es'), {
    title: 'Interrupción temporal en «Datos clave de la oferta»',
    description:
      'Ocurrió un inconveniente temporal al guardar esta etapa. Tu avance anterior está a salvo y puedes reintentar aquí mismo.',
    actionLabel: 'Reintentar y continuar',
  });
  assert.equal(describeBlockedReason('draft_unavailable', 'word', 'en').actionLabel, 'Regenerate Word draft');
  assert.equal(
    describeBlockedReason('template_selection_required', 'word', 'es').actionLabel,
    'Continuar con formato estándar',
  );
  assert.equal(describeBlockedReason('something_else', 'draft', 'en').title, 'Paused at “Chapter drafting”');
});
