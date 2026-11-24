import { CheckCircle2, Download, FileCheck2, FileText, Loader2, Pause, Play, Sparkles, Square, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import AppDialog from '@/shared/ui/AppDialog';
import MarkdownRenderer from '@/shared/ui/MarkdownRenderer';
import { SelectField } from '@/shared/ui/SelectField';
import { Input } from '@/shared/ui/primitives/input';
import { useToast } from '@/shared/ui/ToastProvider';
import type { ExportFormatConfig } from '@/shared/types/exportFormat';
import type { ProcurementMarket } from '@/shared/types/secop';
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
  payload: { version: number; targets?: string[] };
  draftCount?: number;
  reviewCount?: number;
  artifactState?: string;
  result?: { message?: string; warnings?: string[] } | null;
};

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
  const [previewTab, setPreviewTab] = useState<'analysis' | 'outline' | 'parameters' | 'chapters'>('chapters');

  const runTokenRef = useRef(0);
  const mountedRef = useRef(true);
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

  const stages = [
    {
      id: 'data',
      label: en ? '1. Data & files' : '1. Datos y fuentes',
      status: activeJob?.endpoint.includes('extractions') ? 'running' : version > 0 && state.projectInfo.projectName?.trim() && !missingExtractedSources(state, sources) ? 'complete' : 'pending',
    },
    {
      id: 'analysis',
      label: en ? '2. Analysis' : '2. Análisis',
      status: activeJob?.endpoint.includes('analyses') ? 'running' : hasAnalysis ? 'complete' : 'pending',
    },
    {
      id: 'outline',
      label: en ? '3. Outline' : '3. Índice',
      status: activeJob?.endpoint.includes('outlines') ? 'running' : hasOutline ? 'complete' : 'pending',
    },
    {
      id: 'parameters',
      label: en ? '4. Parameters' : '4. Parámetros',
      status: activeJob?.endpoint.includes('parameters') ? 'running' : hasParameters ? 'complete' : 'pending',
    },
    {
      id: 'content',
      label: en ? '5. Draft & Word' : '5. Redacción y Word',
      status: activeJob?.endpoint.includes('content-jobs') || activeJob?.endpoint.includes('exports') ? 'running' : leavesDone && hasExportCurrent ? 'complete' : 'pending',
    },
  ] as const;

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
          ? 'Generate full feasibility report'
          : 'Generar informe de viabilidad completo';

  return (
    <div className="web-module-autopilot">
      <nav aria-label={en ? 'Autopilot stages' : 'Etapas de viabilidad'} className="web-autopilot-stage-strip">
        {stages.map(item => (
          <div key={item.id} className="web-autopilot-stage-chip" data-status={item.status}>
            <span>{item.status === 'complete' ? '✓' : item.status === 'running' ? '•' : '○'}</span>
            <strong>{item.label}</strong>
          </div>
        ))}
      </nav>

      <WebJobQuestions language={language} basePath={feasibilityPath('/api/feasibility-report/questions')} />

      <section className="web-review-autopilot-card">
        <div className="web-autopilot-card-header">
          <div className="web-autopilot-card-title">
            <span className="web-draft-step-number">1</span>
            <div>
              <h2>{en ? 'Project details & documents' : 'Datos base y fuentes del proyecto'}</h2>
              <p className="web-review-hint">
                {en
                  ? 'Confirm preloaded tender details and report length. All project offer files are included automatically.'
                  : 'Confirma los datos precargados del contrato y la extensión deseada. Los documentos de la oferta se incluyen automáticamente.'}
              </p>
            </div>
          </div>
          {projectId && (
            <span className="web-review-status-pill" data-state={projectFiles.length ? 'succeeded' : 'pending'}>
              {projectFiles.length} {en ? 'offer file(s)' : 'archivo(s) de oferta'}
            </span>
          )}
        </div>

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
      </section>

      <section className="web-review-autopilot-card">
        <div className="web-autopilot-card-header">
          <div className="web-autopilot-card-title">
            <span className="web-draft-step-number">2</span>
            <div>
              <h2>{en ? 'Full feasibility generation' : 'Generación en piloto automático'}</h2>
              <p className="web-review-hint">
                {en
                  ? 'Runs text extraction, feasibility diagnosis, outline, key parameters, chapter drafting, and Word export automatically.'
                  : 'Encadena extracción de texto, análisis de viabilidad, índice, parámetros clave, redacción de capítulos y exportación a Word.'}
              </p>
            </div>
          </div>
        </div>

        <div className="web-inline">
          {!running ? (
            <Button icon={Sparkles} disabled={uploadingSources || !state.projectInfo.projectName?.trim()} onClick={() => void runPipeline(false)}>
              {ctaLabel}
            </Button>
          ) : (
            <Button icon={Pause} variant="outline" onClick={pauseAutopilot}>
              {en ? 'Pause autopilot' : 'Pausar piloto automático'}
            </Button>
          )}
          {activeJob && ['queued', 'running'].includes(activeJob.job.state) && (
            <Button icon={Square} size="sm" variant="outline" onClick={() => void cancelActiveTask()}>
              {en ? 'Cancel active task' : 'Cancelar tarea en curso'}
            </Button>
          )}
          {leafCounts.total > 0 && (
            <span className="web-review-hint">
              {en ? `${leafCounts.drafted} of ${leafCounts.total} chapters drafted` : `${leafCounts.drafted} de ${leafCounts.total} capítulos redactados`}
            </span>
          )}
        </div>

        {(running || (activeJob && ['queued', 'running'].includes(activeJob.job.state))) && (
          <div className="web-autopilot-progress-panel" role="status">
            <div className="web-inline">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              <strong>{stageLabel || (en ? 'Processing feasibility stage on local runner…' : 'Ejecutando etapa en el runner local…')}</strong>
            </div>
            {activeJob && <WebJobProgress state={activeJob.job.state} progress={activeJob.job.progress} language={language} />}
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
      </section>

      {(hasAnalysis || hasOutline || hasParameters || hasExportCurrent) && (
        <section className="web-review-autopilot-card">
          <div className="web-autopilot-card-header">
            <div className="web-autopilot-card-title">
              <span className="web-draft-step-number">3</span>
              <div>
                <h2>{en ? 'Generated report & preview' : 'Informe generado y vista previa'}</h2>
                <p className="web-review-hint">
                  {en
                    ? 'Download the Word report or inspect any generated section before fine-tuning in the advanced view.'
                    : 'Descarga el informe en Word o revisa el diagnóstico, índice, parámetros y capítulos generados.'}
                </p>
              </div>
            </div>
            {hasExportCurrent && latestExportJob && (
              <span className="web-review-status-pill" data-state="succeeded">
                <CheckCircle2 size={13} aria-hidden="true" />
                {en ? 'Word ready' : 'Word listo'}
              </span>
            )}
          </div>

          <div className="web-inline">
            {latestExportJob && latestExportJob.artifactState === 'stored' && (
              <a
                className="web-link web-autopilot-download-cta"
                href={feasibilityPath(`/api/feasibility-report/exports/${encodeURIComponent(latestExportJob.id)}/artifact`)}
                download
              >
                <Download size={15} aria-hidden="true" />
                {en ? 'Download feasibility report (DOCX)' : 'Descargar informe de viabilidad (DOCX)'}
              </a>
            )}
            <Button icon={FileText} size="sm" variant="outline" onClick={() => onOpenAdvanced('content')}>
              {en ? 'Edit chapters in advanced view' : 'Editar capítulos en vista avanzada'}
            </Button>
          </div>

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
        </section>
      )}

      {!hasAnalysis && !hasOutline && !running && (
        <div className="web-review-hint web-inline">
          <FileCheck2 size={14} aria-hidden="true" />
          <span>{en ? 'Need step-by-step control? Switch to Advanced view above at any time.' : '¿Prefieres ir paso a paso? Puedes cambiar a Vista avanzada arriba en cualquier momento.'}</span>
        </div>
      )}

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
