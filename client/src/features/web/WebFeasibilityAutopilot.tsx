import { CheckCircle2, ChevronDown, Download, FileText, Loader2, Pause, Play, Sparkles, Square, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import AppDialog from '@/shared/ui/AppDialog';
import MarkdownRenderer from '@/shared/ui/MarkdownRenderer';
import { SelectField } from '@/shared/ui/SelectField';
import { Input } from '@/shared/ui/primitives/input';
import { useToast } from '@/shared/ui/ToastProvider';
import type { ExportFormatConfig } from '@/shared/types/exportFormat';
import type { ProcurementMarket } from '@/shared/types/secop';
import { request as apiRequest } from './api.mjs';
import { useFeasibilityPath, useFeasibilityRequest } from './FeasibilityScope';
import { prepareFeasibilitySave, type FeasibilityState } from './WebFeasibility';
import WebExportFormatPicker from './WebExportFormatPicker';
import { WebJobProgress } from './WebJobProgress';
import WebJobQuestions from './WebJobQuestions';

type Node = { id: string; title: string; description?: string; content?: string; children?: Node[]; [key: string]: unknown };
type Availability = { sourceKey: string; available: boolean; deleted?: boolean; textAvailable?: boolean };
type ProjectDefaults = { projectName?: string; location?: string; constructionContent?: string; contractingEntity?: string };
type GenericJob = {
  id: string;
  kind?: string;
  state: string;
  progress?: string | null;
  createdAt?: string;
  updatedAt?: string;
  payload: { version: number; targets?: string[]; reviewTargets?: string[]; autoReview?: boolean; mode?: string };
  draftCount?: number;
  reviewCount?: number;
  artifactState?: string;
  result?: { message?: string; warnings?: string[] } | null;
};
type LiveDraft = { nodeId: string; content: string; reviewed: boolean; fallback: boolean };

const templates = [
  ['government', 'Inversión pública', 'Government investment'],
  ['enterprise', 'Inversión empresarial', 'Enterprise investment'],
  ['industrial', 'Industrial y manufactura', 'Industrial and manufacturing'],
  ['hi_tech', 'Alta tecnología y digitalización', 'High-tech and digital'],
  ['infrastructure', 'Infraestructura y servicios', 'Infrastructure and utilities'],
  ['eco_environmental', 'Agroambiental y ecológico', 'Agriculture and environment'],
  ['commercial_realestate', 'Comercial e inmobiliario', 'Commercial and real estate'],
] as const;

const wordPresets = [10000, 20000, 30000] as const;

const allLeavesHaveContent = (nodes: Node[]): boolean =>
  nodes.length > 0 && nodes.every(node => (node.children?.length ? allLeavesHaveContent(node.children) : Boolean(String(node.content || '').trim())));

const countLeaves = (nodes: Node[]): { total: number; drafted: number } =>
  nodes.reduce(
    (acc, node) => {
      if (node.children?.length) {
        const sub = countLeaves(node.children);
        return { total: acc.total + sub.total, drafted: acc.drafted + sub.drafted };
      }
      return { total: acc.total + 1, drafted: acc.drafted + (String(node.content || '').trim() ? 1 : 0) };
    },
    { total: 0, drafted: 0 },
  );

function flattenLeafTitles(nodes: Node[], out = new Map<string, string>()): Map<string, string> {
  for (const node of nodes) {
    if (node.children?.length) {
      flattenLeafTitles(node.children, out);
    } else {
      out.set(node.id, node.title);
    }
  }
  return out;
}

function countWords(text: string): number {
  const trimmed = String(text || '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function describeStageFromEndpoint(endpoint: string, en: boolean): { index: number; total: number; label: string } | null {
  if (endpoint.includes('extractions')) {
    return { index: 1, total: 5, label: en ? 'Extracting text from uploaded sources' : 'Extrayendo texto de archivos adjuntos' };
  }
  if (endpoint.includes('analyses')) {
    return { index: 2, total: 5, label: en ? 'Analyzing feasibility' : 'Analizando viabilidad del proyecto' };
  }
  if (endpoint.includes('outlines')) {
    return { index: 3, total: 5, label: en ? 'Generating report outline' : 'Generando índice del informe' };
  }
  if (endpoint.includes('parameters')) {
    return { index: 4, total: 5, label: en ? 'Consolidating key parameters' : 'Calculando parámetros clave' };
  }
  if (endpoint.includes('content-jobs')) {
    return { index: 5, total: 5, label: en ? 'Drafting and reviewing chapters' : 'Redactando y revisando capítulos' };
  }
  if (endpoint.includes('exports')) {
    return { index: 5, total: 5, label: en ? 'Exporting Word document (DOCX)' : 'Exportando documento Word (DOCX)' };
  }
  return null;
}

function formatElapsed(startIso: string | undefined, nowMs: number): string {
  if (!startIso) return '';
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return '';
  const totalSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return mins > 0 ? `${mins}m ${String(secs).padStart(2, '0')}s` : `${secs}s`;
}

function sleep(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms));
}

export function WebFeasibilityAutopilot({
  language,
  market = 'ALL',
  state,
  saved,
  version,
  sources,
  defaults,
  projectId,
  projectFiles = [],
  credentials,
  onStateChange,
  onReloadReport,
  onOpenProjectFiles,
  onOpenAdvanced,
}: {
  language: 'es' | 'en';
  market?: ProcurementMarket;
  state: FeasibilityState;
  saved: FeasibilityState;
  version: number;
  sources: Availability[];
  defaults?: ProjectDefaults;
  projectId?: string;
  projectFiles?: { id: string; name: string }[];
  credentials: { id: string; provider: string; model: string }[];
  onStateChange: (next: FeasibilityState) => void;
  onReloadReport: () => Promise<{ state: FeasibilityState; version: number; sources: Availability[] }>;
  onOpenProjectFiles?: () => void;
  onOpenAdvanced: (step?: 'materials' | 'sources' | 'analysis' | 'outline' | 'parameters' | 'content') => void;
}) {
  const en = language === 'en';
  const request = useFeasibilityRequest();
  const feasibilityPath = useFeasibilityPath();
  const { showToast } = useToast();
  const credentialId = credentials[0]?.id || 'local-runner';

  const [running, setRunning] = useState(false);
  const [stageLabel, setStageLabel] = useState('');
  const [activeJob, setActiveJob] = useState<{ endpoint: string; job: GenericJob } | null>(null);
  const [latestExportJob, setLatestExportJob] = useState<GenericJob | null>(null);
  const [failedStageMessage, setFailedStageMessage] = useState('');
  const [exportFormat, setExportFormat] = useState<ExportFormatConfig | null>(null);
  const [uploadingSources, setUploadingSources] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(() => !state.projectInfo.projectName?.trim());
  const [previewTab, setPreviewTab] = useState<'analysis' | 'outline' | 'parameters' | 'chapters'>('chapters');
  const [liveDrafts, setLiveDrafts] = useState<LiveDraft[]>([]);
  const [runnerName, setRunnerName] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());

  const runTokenRef = useRef(0);
  const mountedRef = useRef(true);
  const wasActiveRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runTokenRef.current += 1;
    };
  }, []);

  const refreshJobSnapshot = useCallback(async () => {
    try {
      const [ext, ana, out, par, con, exp] = await Promise.all([
        request<{ jobs: GenericJob[] }>('/api/feasibility-report/extractions'),
        request<{ jobs: GenericJob[] }>('/api/feasibility-report/analyses'),
        request<{ jobs: GenericJob[] }>('/api/feasibility-report/outlines'),
        request<{ jobs: GenericJob[] }>('/api/feasibility-report/parameters'),
        request<{ jobs: GenericJob[] }>('/api/feasibility-report/content-jobs'),
        request<{ jobs: GenericJob[] }>('/api/feasibility-report/exports'),
      ]);
      if (!mountedRef.current) return;
      const exportReady = exp.jobs.find(job => job.state === 'succeeded' && job.artifactState === 'stored' && job.payload?.version === version) || exp.jobs.find(job => job.state === 'succeeded' && job.artifactState === 'stored') || null;
      setLatestExportJob(exportReady);

      const candidates: Array<{ endpoint: string; jobs: GenericJob[] }> = [
        { endpoint: '/api/feasibility-report/exports', jobs: exp.jobs },
        { endpoint: '/api/feasibility-report/content-jobs', jobs: con.jobs },
        { endpoint: '/api/feasibility-report/parameters', jobs: par.jobs },
        { endpoint: '/api/feasibility-report/outlines', jobs: out.jobs },
        { endpoint: '/api/feasibility-report/analyses', jobs: ana.jobs },
        { endpoint: '/api/feasibility-report/extractions', jobs: ext.jobs },
      ];
      let live: { endpoint: string; job: GenericJob } | null = null;
      for (const group of candidates) {
        const found = group.jobs.find(item => ['queued', 'running'].includes(item.state));
        if (found) {
          live = { endpoint: group.endpoint, job: found };
          break;
        }
      }
      if (!running) setActiveJob(live);
    } catch {
      // Ignore background snapshot failure until user interacts.
    }
  }, [request, version, running]);

  useEffect(() => {
    void refreshJobSnapshot();
  }, [refreshJobSnapshot]);

  const isTaskActive = running || Boolean(activeJob && ['queued', 'running'].includes(activeJob.job.state));

  useEffect(() => {
    if (wasActiveRef.current && !isTaskActive && !running) {
      void onReloadReport().catch(() => undefined);
    }
    wasActiveRef.current = isTaskActive;
  }, [isTaskActive, running, onReloadReport]);

  useEffect(() => {
    if (!isTaskActive) return;
    setNowTick(Date.now());
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isTaskActive]);

  useEffect(() => {
    if (!isTaskActive || running) return;
    const timer = window.setInterval(() => {
      void refreshJobSnapshot();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [isTaskActive, running, refreshJobSnapshot]);

  useEffect(() => {
    if (!isTaskActive || !activeJob?.job.id) {
      setRunnerName('');
      return;
    }
    let alive = true;
    void apiRequest<{
      runners?: Array<{ id: string; name: string }>;
      activeJobs?: Array<{ id: string; runnerName?: string | null }>;
    }>('/api/runners')
      .then(data => {
        if (!alive || !mountedRef.current) return;
        const matched = data.activeJobs?.find(item => item.id === activeJob.job.id)?.runnerName;
        setRunnerName(matched || data.runners?.[0]?.name || '');
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isTaskActive, activeJob?.job.id]);

  useEffect(() => {
    if (!isTaskActive || !activeJob?.endpoint.includes('content-jobs') || !activeJob.job.id) {
      setLiveDrafts([]);
      return;
    }
    let alive = true;
    void request<{ drafts?: LiveDraft[] }>(
      `/api/feasibility-report/content-jobs/${encodeURIComponent(activeJob.job.id)}/drafts`,
    )
      .then(data => {
        if (alive && mountedRef.current) {
          setLiveDrafts(Array.isArray(data.drafts) ? data.drafts : []);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [
    isTaskActive,
    activeJob?.endpoint,
    activeJob?.job.id,
    activeJob?.job.draftCount,
    activeJob?.job.reviewCount,
    request,
  ]);

  const setProjectInfoField = (key: string, value: string) => {
    onStateChange({ ...state, projectInfo: { ...state.projectInfo, [key]: value } });
  };

  const dirty = JSON.stringify(state) !== JSON.stringify(saved);
  const missingExtractedSources = (currentState: FeasibilityState, currentSources: Availability[]) =>
    currentState.sourceFiles.some(item => item.sourceType === 'original' && !currentSources.find(src => src.sourceKey === item.sourceKey)?.textAvailable);

  const hasOutline = Boolean(state.outlineData?.outline?.length);
  const hasAnalysis = Boolean(state.analysisMarkdown.trim());
  const hasParameters = Boolean(state.keyParametersMarkdown.trim());
  const leavesDone = allLeavesHaveContent(state.outlineData?.outline || []);
  const leafCounts = countLeaves(state.outlineData?.outline || []);
  const hasExportCurrent = Boolean(latestExportJob && latestExportJob.payload?.version === version && latestExportJob.artifactState === 'stored');

  const waitForJob = async (endpoint: string, jobId: string, token: number): Promise<GenericJob | null> => {
    while (mountedRef.current && runTokenRef.current === token) {
      const data = await request<{ jobs: GenericJob[] }>(endpoint);
      if (!mountedRef.current || runTokenRef.current !== token) return null;
      const found = data.jobs.find(item => item.id === jobId) || null;
      if (found) setActiveJob({ endpoint, job: found });
      if (found && !['queued', 'running'].includes(found.state)) {
        return found;
      }
      await sleep(2500);
    }
    return null;
  };

  const ensureAndApplyStage = async ({
    token,
    endpoint,
    label,
    curVersion,
    createBody,
    needsApply = true,
  }: {
    token: number;
    endpoint: string;
    label: string;
    curVersion: number;
    createBody: Record<string, unknown>;
    needsApply?: boolean;
  }): Promise<{ ok: boolean; version: number; state?: FeasibilityState; sources?: Availability[]; job?: GenericJob }> => {
    if (!mountedRef.current || runTokenRef.current !== token) return { ok: false, version: curVersion };
    setStageLabel(label);

    const listed = await request<{ jobs: GenericJob[] }>(endpoint);
    let job =
      listed.jobs.find(item => ['queued', 'running'].includes(item.state) && item.payload?.version === curVersion) ||
      listed.jobs.find(item => item.state === 'succeeded' && item.payload?.version === curVersion && (endpoint !== '/api/feasibility-report/exports' || item.artifactState === 'stored'));

    if (!job && endpoint === '/api/feasibility-report/content-jobs') {
      const resumable = listed.jobs.find(item => ['failed', 'interrupted', 'cancelled'].includes(item.state) && item.payload?.version === curVersion);
      if (resumable) {
        await request(`${endpoint}/${encodeURIComponent(resumable.id)}/resume`, { method: 'POST', json: {} }).catch(() => null);
        const freshList = await request<{ jobs: GenericJob[] }>(endpoint);
        job = freshList.jobs.find(item => item.id === resumable.id);
      }
    }

    if (!job) {
      const created = await request<{ job: GenericJob }>(endpoint, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        json: createBody,
      });
      job = created.job;
    }

    setActiveJob({ endpoint, job });
    if (['queued', 'running'].includes(job.state)) {
      const finished = await waitForJob(endpoint, job.id, token);
      if (!finished) return { ok: false, version: curVersion };
      job = finished;
    }

    if (job.state !== 'succeeded') {
      const msg = job.result?.message || (en ? 'The task did not finish.' : 'La tarea no se completó.');
      setFailedStageMessage(`${label}: ${msg}`);
      return { ok: false, version: curVersion, job };
    }

    if (needsApply) {
      setStageLabel(`${label} · ${en ? 'Applying…' : 'Aplicando…'}`);
      await request(`${endpoint}/${encodeURIComponent(job.id)}/apply`, { method: 'POST', json: { version: curVersion } });
    }

    const reloaded = await onReloadReport();
    return { ok: true, version: reloaded.version, state: reloaded.state, sources: reloaded.sources, job };
  };

  const runPipeline = async (forceConfirmClear = false) => {
    if (running || uploadingSources) return;
    if (!state.projectInfo.projectName?.trim()) {
      showToast(en ? 'Enter the project name before starting.' : 'Escribe el nombre del proyecto antes de comenzar.', 'error');
      return;
    }
    if (!Number.isSafeInteger(state.targetWords) || state.targetWords < 1000) {
      showToast(en ? 'Enter at least 1,000 target words.' : 'Introduce al menos 1.000 palabras objetivo.', 'error');
      return;
    }

    if ((dirty || version === 0) && !forceConfirmClear && version > 0) {
      const impact = prepareFeasibilitySave(state, saved).kind;
      if (impact) {
        setConfirmSave(true);
        return;
      }
    }

    setFailedStageMessage('');
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;
    setRunning(true);

    try {
      let curState = state;
      let curVersion = version;
      let curSources = sources;

      if (curVersion === 0 || JSON.stringify(curState) !== JSON.stringify(saved)) {
        setStageLabel(en ? 'Saving project details…' : 'Guardando datos del informe…');
        const nextPayload = prepareFeasibilitySave(curState, saved).state;
        const savedRes = await request<{ report: { state: FeasibilityState; version: number } }>('/api/feasibility-report', {
          method: 'PUT',
          json: { report: nextPayload, version: curVersion },
        });
        curState = savedRes.report.state;
        curVersion = savedRes.report.version;
        const reloaded = await onReloadReport();
        curState = reloaded.state;
        curVersion = reloaded.version;
        curSources = reloaded.sources;
      }

      if (missingExtractedSources(curState, curSources)) {
        const res = await ensureAndApplyStage({
          token,
          endpoint: '/api/feasibility-report/extractions',
          label: en ? 'Extracting text from uploaded sources' : 'Extrayendo texto de archivos adjuntos',
          curVersion,
          createBody: { version: curVersion, language, preserveImages: true },
          needsApply: false,
        });
        if (!res.ok || !res.state) return;
        curState = res.state;
        curVersion = res.version;
        curSources = res.sources || curSources;
      }

      if (!curState.analysisMarkdown.trim()) {
        const res = await ensureAndApplyStage({
          token,
          endpoint: '/api/feasibility-report/analyses',
          label: en ? 'Analyzing feasibility' : 'Analizando viabilidad del proyecto',
          curVersion,
          createBody: { version: curVersion, language, credentialId, dataProcessingConsent: true },
        });
        if (!res.ok || !res.state) return;
        curState = res.state;
        curVersion = res.version;
      }

      if (!curState.outlineData?.outline?.length) {
        const hasRefs = Boolean(curState.referenceDocumentIds?.length);
        const res = await ensureAndApplyStage({
          token,
          endpoint: '/api/feasibility-report/outlines',
          label: en ? 'Generating report outline' : 'Generando índice del informe',
          curVersion,
          createBody: {
            version: curVersion,
            language,
            credentialId,
            dataProcessingConsent: true,
            ...(hasRefs ? { knowledgeConsent: true } : {}),
          },
        });
        if (!res.ok || !res.state) return;
        curState = res.state;
        curVersion = res.version;
      }

      if (!curState.keyParametersMarkdown.trim()) {
        const hasRefs = Boolean(curState.referenceDocumentIds?.length);
        const res = await ensureAndApplyStage({
          token,
          endpoint: '/api/feasibility-report/parameters',
          label: en ? 'Consolidating key parameters' : 'Calculando parámetros clave',
          curVersion,
          createBody: {
            version: curVersion,
            language,
            credentialId,
            dataProcessingConsent: true,
            ...(hasRefs ? { knowledgeConsent: true } : {}),
          },
        });
        if (!res.ok || !res.state) return;
        curState = res.state;
        curVersion = res.version;
      }

      if (!allLeavesHaveContent(curState.outlineData?.outline || [])) {
        const hasRefs = Boolean(curState.referenceDocumentIds?.length);
        const res = await ensureAndApplyStage({
          token,
          endpoint: '/api/feasibility-report/content-jobs',
          label: en ? 'Drafting and reviewing chapters' : 'Redactando y revisando capítulos',
          curVersion,
          createBody: {
            version: curVersion,
            language,
            credentialId,
            dataProcessingConsent: true,
            mode: 'missing',
            autoReview: true,
            ...(hasRefs ? { knowledgeConsent: true } : {}),
          },
        });
        if (!res.ok || !res.state) return;
        curState = res.state;
        curVersion = res.version;
      }

      setStageLabel(en ? 'Exporting Word document (DOCX)' : 'Exportando documento Word (DOCX)');
      const expRes = await ensureAndApplyStage({
        token,
        endpoint: '/api/feasibility-report/exports',
        label: en ? 'Exporting Word document (DOCX)' : 'Exportando documento Word (DOCX)',
        curVersion,
        createBody: {
          version: curVersion,
          language,
          options: {
            includeCover: true,
            includePreparationNotes: true,
            includeAppendixTables: true,
            preparationUnit: curState.projectInfo.constructionUnit || '',
            securityLevel: '',
            documentCode: '',
          },
          ...(exportFormat ? { exportFormat } : {}),
        },
        needsApply: false,
      });
      if (expRes.ok && expRes.job) {
        setLatestExportJob(expRes.job);
        showToast(en ? 'Feasibility report ready in Word.' : 'Informe de viabilidad listo en Word.', 'success');
      }
    } catch (error) {
      if (mountedRef.current && runTokenRef.current === token) {
        const message = (error as Error)?.message || (en ? 'Autopilot paused due to an unexpected error.' : 'El piloto automático se detuvo por un error inesperado.');
        setFailedStageMessage(message);
        showToast(message, 'error');
      }
    } finally {
      if (mountedRef.current && runTokenRef.current === token) {
        setRunning(false);
        setStageLabel('');
        void refreshJobSnapshot();
      }
    }
  };

  const pauseAutopilot = () => {
    runTokenRef.current += 1;
    setRunning(false);
    setStageLabel('');
    showToast(
      en
        ? 'Autopilot paused. Any task already queued on the runner continues safely.'
        : 'Piloto automático en pausa. Las tareas ya enviadas continúan ejecutándose.',
      'info',
    );
  };

  const cancelActiveTask = async () => {
    if (!activeJob) return;
    runTokenRef.current += 1;
    setRunning(false);
    setStageLabel('');
    try {
      await request(`${activeJob.endpoint}/${encodeURIComponent(activeJob.job.id)}/cancel`, { method: 'POST', json: {} });
      showToast(en ? 'Task cancelled.' : 'Tarea cancelada.', 'info');
      setActiveJob(null);
      await refreshJobSnapshot();
    } catch {
      showToast(en ? 'Could not cancel the task.' : 'No se pudo cancelar la tarea.', 'error');
    }
  };

  const handleUploadExtraSources = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    if (!fileList.length || running || uploadingSources) return;
    if (fileList.some(file => !file.size || file.size > 25 * 1024 * 1024)) {
      showToast(en ? 'Files must be non-empty and under 25 MB.' : 'Los archivos no pueden estar vacíos ni superar 25 MB.', 'error');
      return;
    }
    setUploadingSources(true);
    try {
      let curVersion = version;
      if (curVersion === 0 || dirty) {
        const savedRes = await request<{ report: { state: FeasibilityState; version: number } }>('/api/feasibility-report', {
          method: 'PUT',
          json: { report: prepareFeasibilitySave(state, saved).state, version: curVersion },
        });
        curVersion = savedRes.report.version;
      }
      const keys: string[] = [...state.sourceFiles.flatMap(item => (item.sourceKey ? [item.sourceKey] : []))];
      for (const file of fileList) {
        const res = await request<{ source: { sourceKey: string } }>('/api/feasibility-report/uploads', {
          method: 'POST',
          headers: {
            'idempotency-key': crypto.randomUUID(),
            'x-file-name': encodeURIComponent(file.name),
            'content-type': 'application/octet-stream',
          },
          body: file,
        });
        keys.push(res.source.sourceKey);
      }
      await request('/api/feasibility-report/source-selection', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        json: { version: curVersion, sourceKeys: [...new Set(keys)] },
      });
      await onReloadReport();
      showToast(en ? 'Additional files attached.' : 'Archivos adicionales adjuntados.', 'success');
    } catch {
      showToast(en ? 'Could not attach extra files.' : 'No se pudieron adjuntar los archivos adicionales.', 'error');
    } finally {
      setUploadingSources(false);
    }
  };

  const selectedTemplate = templates.find(([id]) => id === state.outlineTemplate);
  const templateLabel = selectedTemplate
    ? en
      ? selectedTemplate[2]
      : selectedTemplate[1]
    : state.outlineTemplate;
  const totalSourcesCount = projectFiles.length + state.sourceFiles.length;
  const optionsSummary = [
    templateLabel,
    `${Number(state.targetWords || 0).toLocaleString(language)} ${en ? 'words' : 'pal.'}`,
    `${totalSourcesCount} ${en ? (totalSourcesCount === 1 ? 'file' : 'files') : totalSourcesCount === 1 ? 'archivo' : 'archivos'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const leafTitleMap = useMemo(
    () => flattenLeafTitles(state.outlineData?.outline || []),
    [state.outlineData?.outline],
  );
  const derivedStage = activeJob ? describeStageFromEndpoint(activeJob.endpoint, en) : null;
  const isContentStage = Boolean(activeJob?.endpoint.includes('content-jobs'));
  const elapsedLabel = formatElapsed(activeJob?.job.createdAt, nowTick);
  const progressMeta = [
    derivedStage
      ? en
        ? `Stage ${derivedStage.index} of ${derivedStage.total}`
        : `Etapa ${derivedStage.index} de ${derivedStage.total}`
      : '',
    elapsedLabel
      ? en
        ? `Elapsed: ${elapsedLabel}`
        : `Transcurrido: ${elapsedLabel}`
      : '',
    runnerName ? `Runner: ${runnerName}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const contentProgress = useMemo(() => {
    if (!isContentStage || !activeJob) return null;
    const targets = activeJob.job.payload?.targets || [];
    const reviewTargets = activeJob.job.payload?.reviewTargets || targets;
    const autoReview = Boolean(activeJob.job.payload?.autoReview);
    const totalTargets = targets.length || leafCounts.total;
    const draftedNow = Math.max(activeJob.job.draftCount || 0, liveDrafts.length);
    const reviewedNow = Math.max(
      activeJob.job.reviewCount || 0,
      liveDrafts.filter(draft => draft.reviewed).length,
    );
    const totalUnits = autoReview ? totalTargets + reviewTargets.length : totalTargets;
    const doneUnits = autoReview ? draftedNow + reviewedNow : draftedNow;
    const percent = totalUnits > 0 ? Math.min(100, Math.round((doneUnits / totalUnits) * 100)) : 0;
    const totalWordsWritten = liveDrafts.reduce((sum, draft) => sum + countWords(draft.content), 0);

    const draftedSet = new Set(liveDrafts.map(draft => draft.nodeId));
    const reviewedSet = new Set(liveDrafts.filter(draft => draft.reviewed).map(draft => draft.nodeId));
    let currentChapterPrefix = '';
    let currentChapterTitle = '';
    if (draftedNow < totalTargets) {
      const nextId = targets.find(id => !draftedSet.has(id)) || targets[draftedNow];
      if (nextId) {
        currentChapterPrefix = en ? 'Drafting chapter:' : 'Redactando capítulo:';
        currentChapterTitle = leafTitleMap.get(nextId) || nextId;
      }
    } else if (autoReview && reviewedNow < reviewTargets.length) {
      const nextReviewId = reviewTargets.find(id => !reviewedSet.has(id)) || reviewTargets[reviewedNow];
      if (nextReviewId) {
        currentChapterPrefix = en ? 'Reviewing chapter:' : 'Revisando capítulo:';
        currentChapterTitle = leafTitleMap.get(nextReviewId) || nextReviewId;
      }
    }

    const orderMap = new Map(targets.map((id, idx) => [id, idx]));
    const completedLines = [...liveDrafts]
      .sort((a, b) => (orderMap.get(a.nodeId) ?? 9999) - (orderMap.get(b.nodeId) ?? 9999))
      .slice(-12)
      .map(draft => {
        const title = leafTitleMap.get(draft.nodeId) || draft.nodeId;
        const words = countWords(draft.content).toLocaleString(language);
        const reviewedTag = draft.reviewed ? (en ? ' · Reviewed' : ' · Revisado') : '';
        return `✓ ${title} (~${words} ${en ? 'words' : 'pal.'}${reviewedTag})`;
      });

    return {
      totalTargets,
      reviewTotal: reviewTargets.length,
      autoReview,
      draftedNow,
      reviewedNow,
      percent,
      totalWordsWritten,
      currentChapterPrefix,
      currentChapterTitle,
      completedLines,
    };
  }, [isContentStage, activeJob, leafCounts.total, liveDrafts, leafTitleMap, en, language]);

  const liveChapterTotal = leafCounts.total || (isContentStage ? activeJob?.job.payload?.targets?.length || 0 : 0);
  const liveChapterDone = Math.max(leafCounts.drafted, contentProgress?.draftedNow || 0);

  const pillState = hasExportCurrent || isTaskActive || projectFiles.length > 0 ? 'succeeded' : 'pending';
  const pillLabel = hasExportCurrent
    ? en
      ? 'Word ready'
      : 'Word listo'
    : isTaskActive
      ? en
        ? 'Running'
        : 'En curso'
      : projectId
        ? `${totalSourcesCount} ${en ? (totalSourcesCount === 1 ? 'file' : 'files') : totalSourcesCount === 1 ? 'archivo' : 'archivos'}`
        : en
          ? 'Pending'
          : 'Pendiente';

  const statusLine = isTaskActive
    ? stageLabel ||
      derivedStage?.label ||
      (en ? 'Generating your feasibility report on the local runner…' : 'Generando el informe de viabilidad en el runner local…')
    : hasExportCurrent
      ? en
        ? 'Feasibility report ready in Word. Download it directly or inspect generated sections below.'
        : 'Informe de viabilidad listo en Word. Descárgalo directamente o revisa las secciones abajo.'
      : version > 0 && (hasAnalysis || hasOutline || hasParameters || leafCounts.drafted > 0)
        ? en
          ? 'Report generation in progress. Continue autopilot to draft remaining chapters and export Word.'
          : 'Informe en curso. Continúa el piloto automático para redactar los capítulos pendientes y exportar Word.'
        : en
          ? 'Generates analysis, outline, key parameters, drafted chapters, and Word export from your preloaded project files.'
          : 'Genera automáticamente análisis, índice, parámetros, capítulos y exportación Word a partir de los documentos del proyecto.';

  const previewSummary =
    leafCounts.total > 0
      ? en
        ? `${leafCounts.drafted}/${leafCounts.total} chapters`
        : `${leafCounts.drafted}/${leafCounts.total} capítulos`
      : hasParameters
        ? en
          ? 'Parameters ready'
          : 'Parámetros listos'
        : hasOutline
          ? en
            ? 'Outline ready'
            : 'Índice listo'
          : en
            ? 'Analysis ready'
            : 'Análisis listo';

  const ctaLabel = running
    ? en
      ? 'Autopilot running…'
      : 'Piloto automático en curso…'
    : leavesDone && hasExportCurrent
      ? en
        ? 'Regenerate Word report'
        : 'Exportar Word nuevamente'
      : version > 0 && (hasAnalysis || hasOutline || hasParameters || leafCounts.drafted > 0)
        ? en
          ? 'Continue autopilot'
          : 'Continuar piloto automático'
        : en
          ? 'Generate feasibility report'
          : 'Generar informe de viabilidad';

  return (
    <div className="web-module-autopilot">
      <WebJobQuestions language={language} basePath={feasibilityPath('/api/feasibility-report/questions')} />

      <section className="web-review-autopilot-card">
        <div className="web-autopilot-card-header">
          <div className="web-autopilot-card-title">
            <div>
              <h2>{en ? 'Feasibility report' : 'Informe de viabilidad'}</h2>
              <p className="web-review-hint">{statusLine}</p>
            </div>
          </div>
          <span className="web-review-status-pill" data-state={pillState}>
            {hasExportCurrent && <CheckCircle2 size={13} aria-hidden="true" />}
            {pillLabel}
          </span>
        </div>

        <div className="web-inline">
          {!running ? (
            isTaskActive ? (
              <Button
                size="sm"
                variant="outline"
                disabled={uploadingSources}
                onClick={() => void runPipeline(false)}
              >
                {en ? 'Continue to Word export' : 'Seguir hasta exportar Word'}
              </Button>
            ) : (
              <Button icon={Sparkles} disabled={uploadingSources || !state.projectInfo.projectName?.trim()} onClick={() => void runPipeline(false)}>
                {ctaLabel}
              </Button>
            )
          ) : (
            <Button icon={Pause} variant="outline" onClick={pauseAutopilot}>
              {en ? 'Pause' : 'Pausar'}
            </Button>
          )}
          {activeJob && ['queued', 'running'].includes(activeJob.job.state) && (
            <Button icon={Square} size="sm" variant="outline" onClick={() => void cancelActiveTask()}>
              {en ? 'Cancel' : 'Cancelar'}
            </Button>
          )}
          {latestExportJob && latestExportJob.artifactState === 'stored' && (
            <a
              className="web-link web-autopilot-download-cta"
              href={feasibilityPath(`/api/feasibility-report/exports/${encodeURIComponent(latestExportJob.id)}/artifact`)}
              download
            >
              <Download size={15} aria-hidden="true" />
              {en ? 'Download Word (DOCX)' : 'Descargar Word (DOCX)'}
            </a>
          )}
          {liveChapterTotal > 0 && !running && (
            <span className="web-review-hint">
              {en ? `${liveChapterDone} of ${liveChapterTotal} chapters` : `${liveChapterDone} de ${liveChapterTotal} capítulos`}
            </span>
          )}
        </div>

        {isTaskActive && (
          <div className="web-autopilot-progress-panel" role="status">
            <div className="web-autopilot-card-header">
              <div className="web-inline">
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                <strong>{stageLabel || derivedStage?.label || (en ? 'Processing feasibility stage on local runner…' : 'Ejecutando etapa en el runner local…')}</strong>
              </div>
              {progressMeta && <span className="web-feasibility-progress-meta">{progressMeta}</span>}
            </div>
            {contentProgress && (
              <>
                <div
                  className="web-feasibility-progress-bar"
                  role="progressbar"
                  aria-valuenow={contentProgress.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="web-feasibility-progress-fill"
                    style={{ width: `${contentProgress.percent}%` }}
                  />
                </div>
                <div className="web-feasibility-progress-stats">
                  <span>
                    {en ? 'Drafts:' : 'Borradores:'} {contentProgress.draftedNow}/{contentProgress.totalTargets}
                  </span>
                  {contentProgress.autoReview && (
                    <span>
                      {en ? 'Reviewed:' : 'Revisados:'} {contentProgress.reviewedNow}/{contentProgress.reviewTotal}
                    </span>
                  )}
                  <span>{contentProgress.percent}%</span>
                  {contentProgress.totalWordsWritten > 0 && (
                    <span>
                      ~{contentProgress.totalWordsWritten.toLocaleString(language)} {en ? 'words' : 'pal.'}
                    </span>
                  )}
                </div>
                {contentProgress.currentChapterTitle && (
                  <p className="web-review-hint">
                    <strong>{contentProgress.currentChapterPrefix}</strong> {contentProgress.currentChapterTitle}
                  </p>
                )}
              </>
            )}
            {activeJob && <WebJobProgress state={activeJob.job.state} progress={activeJob.job.progress} language={language} />}
            {contentProgress && contentProgress.completedLines.length > 0 && (
              <ul
                className="web-workflow-fix-log"
                aria-live="polite"
                aria-label={en ? 'Completed chapters' : 'Capítulos generados'}
              >
                {contentProgress.completedLines.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {failedStageMessage && (
          <div className="web-review-proposal-notice" role="alert">
            <div className="web-review-proposal-notice-copy">
              <strong>{en ? 'Autopilot stopped' : 'El piloto automático se detuvo'}</strong>
              <p>{failedStageMessage}</p>
            </div>
            <Button icon={Play} size="sm" onClick={() => void runPipeline(true)}>
              {en ? 'Retry from this stage' : 'Reintentar desde aquí'}
            </Button>
          </div>
        )}

        <div className="web-workflow-summary-list">
          <details
            className="web-workflow-summary-details"
            open={optionsOpen}
            onToggle={event => setOptionsOpen(event.currentTarget.open)}
          >
            <summary>
              <span>{en ? 'Report options' : 'Opciones del informe'}</span>
              <span className="web-workflow-summary-meta">
                <small>{optionsSummary}</small>
                <ChevronDown size={15} className="web-workflow-summary-chevron" aria-hidden="true" />
              </span>
            </summary>
            <div className="web-workflow-summary-body">
              <div className="web-feasibility-grid">
                <label>
                  {en ? 'Project name' : 'Nombre del proyecto'}
                  <Input
                    disabled={running}
                    value={state.projectInfo.projectName || ''}
                    onChange={event => setProjectInfoField('projectName', event.target.value)}
                  />
                </label>
                <div className="web-admin-sheet-field">
                  <span>{en ? 'Report template' : 'Plantilla del informe'}</span>
                  <SelectField
                    disabled={running}
                    value={state.outlineTemplate}
                    aria-label={en ? 'Report template' : 'Plantilla del informe'}
                    options={templates.map(([id, esLabel, enLabel]) => ({ value: id, label: en ? enLabel : esLabel }))}
                    onChange={value => onStateChange({ ...state, outlineTemplate: value })}
                  />
                </div>
                <label>
                  {en ? 'Implementing entity' : 'Entidad ejecutora'}
                  <Input
                    disabled={running}
                    value={state.projectInfo.constructionUnit || ''}
                    placeholder={defaults?.contractingEntity || ''}
                    onChange={event => setProjectInfoField('constructionUnit', event.target.value)}
                  />
                  {defaults?.contractingEntity && !state.projectInfo.constructionUnit?.trim() && (
                    <Button
                      type="button"
                      size="sm"
                      variant="link"
                      className="web-autopilot-link-wrap"
                      disabled={running}
                      onClick={() => setProjectInfoField('constructionUnit', defaults.contractingEntity || '')}
                    >
                      {en ? `Use "${defaults.contractingEntity}"` : `Usar «${defaults.contractingEntity}»`}
                    </Button>
                  )}
                </label>
                <label>
                  {en ? 'Location' : 'Ubicación'}
                  <Input
                    disabled={running}
                    value={state.projectInfo.location || ''}
                    onChange={event => setProjectInfoField('location', event.target.value)}
                  />
                </label>
                <label>
                  {en ? 'Total investment (optional)' : 'Inversión estimada (opcional)'}
                  <Input
                    disabled={running}
                    value={state.projectInfo.totalInvestment || ''}
                    placeholder={en ? 'E.g. 450,000 EUR' : 'Ej. 450.000 EUR'}
                    onChange={event => setProjectInfoField('totalInvestment', event.target.value)}
                  />
                </label>
                <label>
                  {en ? 'Target length (words)' : 'Extensión objetivo (palabras)'}
                  <div className="web-autopilot-number-row">
                    <Input
                      type="number"
                      min={1000}
                      step={1000}
                      disabled={running}
                      value={state.targetWords}
                      onChange={event => onStateChange({ ...state, targetWords: Number(event.target.value) })}
                    />
                    {wordPresets.map(preset => (
                      <Button
                        key={preset}
                        type="button"
                        size="sm"
                        variant={state.targetWords === preset ? 'default' : 'outline'}
                        disabled={running}
                        onClick={() => onStateChange({ ...state, targetWords: preset })}
                      >
                        {preset.toLocaleString(language)}
                      </Button>
                    ))}
                  </div>
                </label>
                <label className="web-feasibility-span-2">
                  {en ? 'Project description' : 'Descripción / objeto del proyecto'}
                  <Input
                    disabled={running}
                    value={state.projectInfo.constructionContent || ''}
                    onChange={event => setProjectInfoField('constructionContent', event.target.value)}
                  />
                </label>
              </div>

              <div className="web-inline">
                {projectId && onOpenProjectFiles && (
                  <Button type="button" size="sm" variant="outline" disabled={running} onClick={onOpenProjectFiles}>
                    {en ? 'Manage offer documents' : 'Gestionar documentos de la oferta'}
                  </Button>
                )}
                <label className="web-upload web-project-upload">
                  <Upload size={14} aria-hidden="true" />
                  {uploadingSources ? (en ? 'Uploading…' : 'Subiendo…') : en ? 'Attach extra files' : 'Adjuntar archivos extra'}
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.wps,.xls,.xlsx,.txt,.md,.markdown"
                    disabled={running || uploadingSources}
                    onChange={event => void handleUploadExtraSources(event)}
                  />
                </label>
                {state.sourceFiles.length > 0 && (
                  <span className="web-review-hint">
                    {state.sourceFiles.length} {en ? 'extra source(s) attached' : 'fuente(s) adicional(es) adjunta(s)'}
                  </span>
                )}
              </div>

              <details className="web-autopilot-inline-details">
                <summary>{en ? 'Word styling options (optional)' : 'Formato Word de salida (opcional)'}</summary>
                <div style={{ paddingTop: 10 }}>
                  <WebExportFormatPicker language={language} market={market} disabled={running} onChange={setExportFormat} />
                </div>
              </details>
            </div>
          </details>

          {(hasAnalysis || hasOutline || hasParameters || hasExportCurrent) && (
            <details className="web-workflow-summary-details">
              <summary>
                <span>{en ? 'Report preview' : 'Vista previa del informe'}</span>
                <span className="web-workflow-summary-meta">
                  <small>{previewSummary}</small>
                  <ChevronDown size={15} className="web-workflow-summary-chevron" aria-hidden="true" />
                </span>
              </summary>
              <div className="web-workflow-summary-body">
                <div className="web-autopilot-drawer-tabs" role="tablist" aria-label={en ? 'Feasibility sections' : 'Secciones del informe'}>
                  {([
                    ['chapters', en ? `Chapters (${leafCounts.drafted}/${leafCounts.total})` : `Capítulos (${leafCounts.drafted}/${leafCounts.total})`],
                    ['analysis', en ? 'Analysis' : 'Análisis'],
                    ['outline', en ? 'Outline' : 'Índice'],
                    ['parameters', en ? 'Key parameters' : 'Parámetros clave'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={previewTab === key}
                      onClick={() => setPreviewTab(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="web-autopilot-drawer-panel" role="tabpanel">
                  {previewTab === 'analysis' && (
                    state.analysisMarkdown.trim() ? (
                      <MarkdownRenderer allowRawHtml={false}>{state.analysisMarkdown}</MarkdownRenderer>
                    ) : (
                      <p className="web-review-hint">{en ? 'No analysis generated yet.' : 'Aún no se ha generado el análisis.'}</p>
                    )
                  )}
                  {previewTab === 'parameters' && (
                    state.keyParametersMarkdown.trim() ? (
                      <MarkdownRenderer allowRawHtml={false}>{state.keyParametersMarkdown}</MarkdownRenderer>
                    ) : (
                      <p className="web-review-hint">{en ? 'No key parameters generated yet.' : 'Aún no se han generado los parámetros clave.'}</p>
                    )
                  )}
                  {previewTab === 'outline' && (
                    state.outlineData?.outline?.length ? (
                      <OutlinePreview nodes={state.outlineData.outline} en={en} />
                    ) : (
                      <p className="web-review-hint">{en ? 'No outline generated yet.' : 'Aún no se ha generado el índice.'}</p>
                    )
                  )}
                  {previewTab === 'chapters' && (
                    state.outlineData?.outline?.length ? (
                      <ChaptersPreview nodes={state.outlineData.outline} en={en} />
                    ) : (
                      <p className="web-review-hint">{en ? 'Chapters will appear after generating the outline.' : 'Los capítulos aparecerán al generar el índice.'}</p>
                    )
                  )}
                </div>

                <div className="web-inline">
                  <Button icon={FileText} size="sm" variant="outline" onClick={() => onOpenAdvanced('content')}>
                    {en ? 'Edit chapters in advanced view' : 'Editar capítulos en vista avanzada'}
                  </Button>
                </div>
              </div>
            </details>
          )}
        </div>
      </section>

      <p className="web-review-hint">
        {en ? 'Need step-by-step control? Switch to Advanced view above at any time.' : '¿Prefieres ir paso a paso? Puedes cambiar a Vista avanzada arriba en cualquier momento.'}
      </p>

      <AppDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title={en ? 'Save changes and regenerate dependent stages?' : '¿Guardar cambios y regenerar etapas dependientes?'}
        description={
          en
            ? 'Your edits affect base project details, so downstream analysis, outline, parameters or chapters will be cleared before regenerating.'
            : 'Tus cambios modifican datos base del informe, por lo que se limpiarán el análisis, índice, parámetros o capítulos dependientes antes de regenerarlos.'
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirmSave(false)}>
              {en ? 'Cancel' : 'Cancelar'}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmSave(false);
                void runPipeline(true);
              }}
            >
              {en ? 'Save and continue' : 'Guardar y continuar'}
            </Button>
          </>
        }
      />
    </div>
  );
}

function OutlinePreview({ nodes, en }: { nodes: Node[]; en: boolean }) {
  return (
    <ul className="web-autopilot-outline-list">
      {nodes.map(node => (
        <li key={node.id}>
          <div className="web-autopilot-outline-row">
            <strong>{node.title}</strong>
            <span className="web-review-status-pill" data-state={String(node.content || '').trim() ? 'succeeded' : 'pending'}>
              {String(node.content || '').trim() ? (en ? 'Drafted' : 'Redactado') : en ? 'Pending' : 'Pendiente'}
            </span>
          </div>
          {node.description && <p className="web-review-hint">{node.description}</p>}
          {!!node.children?.length && <OutlinePreview nodes={node.children} en={en} />}
        </li>
      ))}
    </ul>
  );
}

function ChaptersPreview({ nodes, en }: { nodes: Node[]; en: boolean }) {
  return (
    <div className="web-stack">
      {nodes.map(node => (
        <div key={node.id} className="web-stack">
          {String(node.content || '').trim() ? (
            <details className="web-autopilot-drawer-section">
              <summary>
                <strong>{node.title}</strong>
              </summary>
              <div style={{ paddingTop: 8 }}>
                <MarkdownRenderer allowRawHtml={false}>{String(node.content || '')}</MarkdownRenderer>
              </div>
            </details>
          ) : !node.children?.length ? (
            <div className="web-autopilot-drawer-section">
              <strong>{node.title}</strong>
              <p className="web-review-hint">{en ? 'Pending generation.' : 'Pendiente de redacción.'}</p>
            </div>
          ) : null}
          {!!node.children?.length && <ChaptersPreview nodes={node.children} en={en} />}
        </div>
      ))}
    </div>
  );
}
