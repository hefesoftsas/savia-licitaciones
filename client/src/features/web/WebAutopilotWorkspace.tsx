import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  MonitorOff,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/shared/ui/primitives/button';
import MarkdownRenderer from '@/shared/ui/MarkdownRenderer';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import { WebDocumentDropZone } from './WebDocumentDropZone';
import WebWordDocument from './WebWordDocument';
import { WebAutopilotTimeline } from './WebAutopilotTimeline';
import { WebAutopilotDecisionCard, type ResumePreparationOptions } from './WebAutopilotDecisionCard';
import { WebAutopilotRunnerFeed } from './WebAutopilotRunnerFeed';
import {
  getActiveJobStatusLabel,
  getStageLabel,
  resolveAutopilotDecision,
  resolveAutopilotViewPhase,
  summarizeRunnerConnection,
  type AutopilotPreparation,
  type AutopilotQuestion,
  type FactGroup,
  type RunnerConnectionSummary,
  type RunnerInfo,
} from './autopilot-state.mjs';

export interface AutopilotFileItem {
  id: string;
  name: string;
  deleting?: number | boolean;
}

export interface AutopilotUploadStatus {
  projectId: string;
  phase: 'extracting' | 'uploading';
  current: number;
  total: number;
  fileName: string;
  percent: number | null;
}

export interface WebAutopilotWorkspaceProps {
  projectId: string;
  projectTitle: string;
  language: 'es' | 'en';
  files: AutopilotFileItem[];
  selectedFiles: string[];
  onSelectedFilesChange: (ids: string[]) => void;
  credentialId: string;
  consent: boolean;
  busy: boolean;
  uploadBatchStatus: AutopilotUploadStatus | null;
  pendingUploadsCount: number;
  onUploadFiles: (files: File[]) => void;
  onRetryUploads: () => void;
  onRemoveFile: (file: AutopilotFileItem) => void;
  onOpenDetailed?: (tab?: string) => void;
  onOpenReviews: () => void;
  onOpenChat: () => void;
  onOpenRunners: () => void;
}

interface OutlineNode {
  id: string;
  number?: string;
  title: string;
  content?: string;
  children?: OutlineNode[];
}

interface ProgressSnapshot {
  analyses: { category: string; current: boolean; content?: string }[];
  outline: OutlineNode[];
  facts: FactGroup[];
}

function renderOutlineTree(nodes: OutlineNode[], en: boolean) {
  if (!nodes.length) return null;
  return (
    <ul className="web-autopilot-outline-list">
      {nodes.map(node => {
        const hasChildren = Boolean(node.children?.length);
        const drafted = !hasChildren && Boolean(node.content?.trim());
        return (
          <li key={node.id}>
            <div className="web-autopilot-outline-row">
              <span>
                {node.number ? <strong>{node.number} </strong> : null}
                {node.title}
              </span>
              {!hasChildren && (
                <span className="web-autopilot-badge" data-complete={drafted ? 'true' : 'false'}>
                  {drafted ? (en ? 'Drafted' : 'Redactado') : (en ? 'Pending' : 'Pendiente')}
                </span>
              )}
            </div>
            {hasChildren && renderOutlineTree(node.children!, en)}
          </li>
        );
      })}
    </ul>
  );
}

/** Focused, guided alternative project workspace driven by /automatic-preparation. */
export function WebAutopilotWorkspace({
  projectId,
  projectTitle,
  language,
  files,
  selectedFiles,
  onSelectedFilesChange,
  credentialId,
  consent,
  busy,
  uploadBatchStatus,
  pendingUploadsCount,
  onUploadFiles,
  onRetryUploads,
  onRemoveFile,
  onOpenReviews,
  onOpenChat,
  onOpenRunners,
}: WebAutopilotWorkspaceProps) {
  const en = language === 'en';
  const { showToast } = useToast();

  const [preparation, setPreparation] = useState<AutopilotPreparation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [questions, setQuestions] = useState<AutopilotQuestion[]>([]);
  const [runnerSummary, setRunnerSummary] = useState<RunnerConnectionSummary>({
    state: 'unknown',
    onlineCount: 0,
    totalCount: 0,
    runnerName: null,
    runningJobs: 0,
  });
  const [lastActiveJob, setLastActiveJob] = useState<{
    runId: string;
    id: string;
    state: string;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'summary' | 'outline' | 'facts'>('summary');
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const latestPollRef = useRef(0);
  const prepBase = `/api/projects/${encodeURIComponent(projectId)}/automatic-preparation`;
  const questionsBase = `/api/projects/${encodeURIComponent(projectId)}/job-questions`;

  useEffect(() => {
    setPreparation(null);
    setLoaded(false);
    setPollFailed(false);
    setQuestions([]);
    setLastActiveJob(null);
    setSnapshot(null);
    const controller = new AbortController();

    const poll = async () => {
      const seq = ++latestPollRef.current;
      try {
        const [prepResult, qResult] = await Promise.all([
          request<{ preparation: AutopilotPreparation | null }>(prepBase, { signal: controller.signal }),
          request<{ questions: AutopilotQuestion[] }>(questionsBase, { signal: controller.signal }).catch(() => ({
            questions: [],
          })),
        ]);
        if (seq === latestPollRef.current && !controller.signal.aborted) {
          const nextPrep = prepResult.preparation;
          setPreparation(nextPrep);
          if (nextPrep?.activeJob?.id) {
            setLastActiveJob({
              runId: nextPrep.runId,
              id: nextPrep.activeJob.id,
              state: nextPrep.activeJob.state,
            });
          } else if (!nextPrep) {
            setLastActiveJob(null);
          }
          setQuestions(qResult.questions || []);
          setLoaded(true);
          setPollFailed(false);
        }
      } catch {
        if (seq === latestPollRef.current && !controller.signal.aborted) {
          setPollFailed(true);
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [prepBase, questionsBase]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const loadRunners = async () => {
      try {
        const data = await request<{ runners: RunnerInfo[]; serverTime: string }>('/api/runners', {
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;
        setRunnerSummary(summarizeRunnerConnection(data.runners, Date.parse(data.serverTime)));
      } catch {
        if (!active || controller.signal.aborted) return;
        setRunnerSummary({
          state: 'unknown',
          onlineCount: 0,
          totalCount: 0,
          runnerName: null,
          runningJobs: 0,
        });
      }
    };

    void loadRunners();
    const timer = window.setInterval(() => void loadRunners(), 5000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [projectId]);

  const loadSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    try {
      const [analysesData, planData, factsData] = await Promise.all([
        request<{ analyses?: { category: string; current: boolean; content?: string }[] }>(
          `/api/projects/${encodeURIComponent(projectId)}/technical-analyses`,
        ).catch(() => ({ analyses: [] })),
        request<{ outline?: OutlineNode[] }>(
          `/api/projects/${encodeURIComponent(projectId)}/technical-plan`,
        ).catch(() => ({ outline: [] })),
        request<{ groups?: FactGroup[] }>(
          `/api/projects/${encodeURIComponent(projectId)}/technical-facts`,
        ).catch(() => ({ groups: [] })),
      ]);
      setSnapshot({
        analyses: analysesData.analyses || [],
        outline: planData.outline || [],
        facts: factsData.groups || [],
      });
    } finally {
      setSnapshotLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!drawerOpen) return;
    void loadSnapshot();
    const timer = window.setInterval(() => void loadSnapshot(), 8000);
    return () => window.clearInterval(timer);
  }, [drawerOpen, loadSnapshot]);

  const sendAction = async (
    action: 'start' | 'pause' | 'resume',
    options?: ResumePreparationOptions,
  ) => {
    setActionBusy(true);
    latestPollRef.current += 1;
    try {
      const payload =
        action === 'start'
          ? {
              action,
              fileIds: selectedFiles,
              ...(credentialId && credentialId !== 'local-runner'
                ? { credentialId }
                : { localRunner: true }),
              language,
              consent,
            }
          : action === 'resume'
            ? {
                action,
                ...(options?.technicalScore ? { technicalScore: options.technicalScore } : {}),
                ...(options?.allowPendingFacts ? { allowPendingFacts: true } : {}),
                ...(options?.skipExistingDraft ? { skipExistingDraft: true } : {}),
              }
            : { action };

      const result = await request<{ preparation: AutopilotPreparation }>(prepBase, {
        method: 'POST',
        json: payload,
      });
      latestPollRef.current += 1;
      setPreparation(result.preparation);
      setPollFailed(false);
    } catch {
      showToast(
        en
          ? 'Could not update automatic preparation. Check your connection and try again.'
          : 'No se pudo actualizar la preparación automática. Revisa tu conexión e inténtalo de nuevo.',
        'error',
      );
    } finally {
      setActionBusy(false);
    }
  };

  const phase = resolveAutopilotViewPhase(preparation, questions);
  const decision = resolveAutopilotDecision(preparation, questions);
  const feedJobId =
    preparation?.activeJob?.id ||
    (preparation && lastActiveJob?.runId === preparation.runId ? lastActiveJob.id : null);
  const feedJobState =
    preparation?.activeJob?.state ||
    (preparation && lastActiveJob?.runId === preparation.runId ? lastActiveJob.state : null);
  const isWaitingForRunner =
    runnerSummary.state === 'offline' && preparation?.activeJob?.state !== 'running';
  const activeUpload = uploadBatchStatus?.projectId === projectId ? uploadBatchStatus : null;
  const selectableFiles = files.filter(file => !file.deleting && !/\.zip$/i.test(file.name));
  const canStart =
    loaded &&
    !busy &&
    !actionBusy &&
    consent &&
    selectedFiles.length > 0 &&
    selectedFiles.length <= 50;

  const wordArtifactUrl = preparation?.wordId
    ? `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(preparation.wordId)}/artifact`
    : undefined;

  const analysisLabels: Record<string, string> = en
    ? {
        'project-overview': 'Tender summary',
        'technical-score': 'Technical scoring',
        'response-requirements': 'Response requirements',
      }
    : {
        'project-overview': 'Resumen del pliego',
        'technical-score': 'Criterios de puntuación',
        'response-requirements': 'Requisitos de respuesta',
      };

  return (
    <div className="web-autopilot">
      <WebAutopilotTimeline preparation={preparation} language={language} />

      {pollFailed && (
        <div className="web-autopilot-banner" role="alert">
          {en
            ? 'Connection interrupted while checking progress. Retrying automatically…'
            : 'Se interrumpió la conexión al consultar el avance. Reintentando automáticamente…'}
        </div>
      )}

      {phase === 'setup' && (
        <section className="web-autopilot-card web-autopilot-setup" aria-label={en ? 'Prepare bid' : 'Preparar oferta'}>
          <header className="web-autopilot-card-head">
            <div>
              <h2>{en ? 'Prepare your bid on autopilot' : 'Prepara tu oferta en piloto automático'}</h2>
              <p>
                {en
                  ? 'Upload the tender documents or ZIP packages. Savia will read the specification, build the outline, extract key facts, and draft your Word proposal.'
                  : 'Sube los documentos del pliego o paquetes ZIP. Savia leerá el pliego, estructurará el índice, extraerá los datos clave y redactará tu borrador en Word.'}
              </p>
            </div>
          </header>

          <WebDocumentDropZone
            language={language}
            disabled={busy || actionBusy}
            label={en ? 'Choose files' : 'Elegir archivos'}
            onFiles={onUploadFiles}
          />

          {activeUpload && (
            <p className="web-upload-status" role="status">
              {activeUpload.phase === 'extracting'
                ? (en ? `Unzipping ${activeUpload.fileName}…` : `Descomprimiendo ${activeUpload.fileName}…`)
                : activeUpload.percent === null
                  ? (en
                      ? `Uploading ${activeUpload.current} of ${activeUpload.total}: ${activeUpload.fileName}`
                      : `Subiendo ${activeUpload.current} de ${activeUpload.total}: ${activeUpload.fileName}`)
                  : activeUpload.percent < 100
                    ? (en
                        ? `Uploading ${activeUpload.current} of ${activeUpload.total}: ${activeUpload.fileName} (${activeUpload.percent}%)`
                        : `Subiendo ${activeUpload.current} de ${activeUpload.total}: ${activeUpload.fileName} (${activeUpload.percent}%)`)
                    : (en ? `Verifying ${activeUpload.fileName}…` : `Verificando ${activeUpload.fileName}…`)}
            </p>
          )}

          {!busy && pendingUploadsCount > 0 && (
            <div className="web-upload-status">
              <Button size="sm" variant="outline" onClick={onRetryUploads}>
                {en ? `Retry upload (${pendingUploadsCount})` : `Reintentar carga (${pendingUploadsCount})`}
              </Button>
            </div>
          )}

          {files.length > 0 && (
            <div className="web-autopilot-files">
              <div className="web-autopilot-files-head">
                <strong>
                  {en
                    ? `Uploaded documents (${selectedFiles.length} of ${selectableFiles.length} selected)`
                    : `Documentos cargados (${selectedFiles.length} de ${selectableFiles.length} seleccionados)`}
                </strong>
                {selectedFiles.length > 50 && (
                  <span role="alert" className="web-autopilot-warning">
                    {en ? 'Select up to 50 documents.' : 'Selecciona un máximo de 50 documentos.'}
                  </span>
                )}
              </div>
              <ul className="web-autopilot-file-list">
                {files.map(file => {
                  const isZip = /\.zip$/i.test(file.name);
                  const isDisabled = Boolean(file.deleting) || isZip;
                  const checked = !isDisabled && selectedFiles.includes(file.id);
                  return (
                    <li key={file.id} className="web-autopilot-file-item">
                      <label>
                        <input
                          type="checkbox"
                          disabled={isDisabled}
                          checked={checked}
                          onChange={event => {
                            if (event.target.checked) {
                              onSelectedFilesChange([...selectedFiles, file.id]);
                            } else {
                              onSelectedFilesChange(selectedFiles.filter(id => id !== file.id));
                            }
                          }}
                        />
                        <FileText size={15} aria-hidden="true" />
                        <span>
                          {file.name}
                          {isZip && (
                            <small className="web-file-pending">
                              {en ? 'ZIP archive (not analyzed directly)' : 'Archivo ZIP (no se analiza directamente)'}
                            </small>
                          )}
                          {Boolean(file.deleting) && (
                            <small className="web-file-pending">
                              {en ? 'Deletion pending' : 'Eliminación pendiente'}
                            </small>
                          )}
                        </span>
                      </label>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy || actionBusy}
                        aria-label={en ? `Remove ${file.name}` : `Retirar ${file.name}`}
                        onClick={() => onRemoveFile(file)}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {runnerSummary.state === 'offline' && (
            <div className="web-autopilot-runner-offline-alert" role="status">
              <div>
                <strong>{en ? 'No runner connected' : 'No hay ningún runner conectado'}</strong>
                <p>
                  {en
                    ? 'A connected runner on your machine is required to read documents and prepare your bid.'
                    : 'Necesitas un runner conectado en tu equipo para leer los pliegos y preparar la oferta.'}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={onOpenRunners}>
                {en ? 'Connect runner' : 'Conectar runner'}
              </Button>
            </div>
          )}

          <div className="web-autopilot-cta-row">
            <Button size="default" disabled={!canStart} onClick={() => void sendAction('start')}>
              <Sparkles size={16} aria-hidden="true" />
              {actionBusy
                ? (en ? 'Starting…' : 'Iniciando…')
                : (en ? 'Prepare bid' : 'Preparar oferta')}
            </Button>
            {selectedFiles.length === 0 && (
              <span className="web-autopilot-hint">
                {en
                  ? 'Upload at least one tender document to start.'
                  : 'Sube al menos un documento del pliego para comenzar.'}
              </span>
            )}
          </div>
        </section>
      )}

      {phase === 'running' && preparation && (
        <section className="web-autopilot-card web-autopilot-running" aria-label={en ? 'Preparation in progress' : 'Preparación en curso'}>
          <div className="web-autopilot-running-head">
            <div className="web-autopilot-running-title">
              {isWaitingForRunner ? (
                <MonitorOff size={20} className="web-autopilot-offline-icon" aria-hidden="true" />
              ) : (
                <Loader2 size={20} className="web-loading-icon" aria-hidden="true" />
              )}
              <div>
                <h3>{getStageLabel(preparation.stage, language)}</h3>
                <p role="status">
                  {getActiveJobStatusLabel(preparation.activeJob, language, runnerSummary.state)}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={actionBusy}
              onClick={() => void sendAction('pause')}
            >
              <Pause size={14} aria-hidden="true" />
              {en ? 'Pause' : 'Pausar'}
            </Button>
          </div>

          {isWaitingForRunner && (
            <div className="web-autopilot-runner-offline-alert" role="status">
              <div>
                <strong>{en ? 'No runner connected' : 'No hay ningún runner conectado'}</strong>
                <p>
                  {en
                    ? 'Automatic preparation will resume as soon as you connect a runner on your machine.'
                    : 'La preparación automática continuará en cuanto conectes un runner en tu equipo.'}
                </p>
              </div>
              <Button size="sm" onClick={onOpenRunners}>
                {en ? 'Connect or configure runner' : 'Conectar o configurar runner'}
              </Button>
            </div>
          )}

          <WebAutopilotRunnerFeed
            projectId={projectId}
            activeJobId={feedJobId}
            activeJobState={feedJobState}
            language={language}
            runnerSummary={runnerSummary}
            onOpenRunners={onOpenRunners}
          />

          <p className="web-autopilot-hint">
            {en
              ? 'Savia works in the background. You can inspect progress below or come back later without losing your work.'
              : 'Savia trabaja en segundo plano. Puedes revisar los avances abajo o volver más tarde sin perder el progreso.'}
          </p>
        </section>
      )}

      {phase === 'paused' && preparation && (
        <section className="web-autopilot-card web-autopilot-paused" aria-label={en ? 'Preparation paused' : 'Preparación en pausa'}>
          <div className="web-autopilot-running-head">
            <div>
              <h3>{en ? 'Automatic preparation paused' : 'Preparación automática en pausa'}</h3>
              <p role="status">
                {en
                  ? `Paused at: ${getStageLabel(preparation.stage, language)}. All completed work is saved.`
                  : `En pausa en: ${getStageLabel(preparation.stage, language)}. Todo el avance completado se conserva.`}
              </p>
            </div>
            <div className="web-autopilot-inline-actions">
              <Button size="sm" disabled={actionBusy} onClick={() => void sendAction('resume')}>
                <Play size={14} aria-hidden="true" />
                {en ? 'Resume' : 'Reanudar'}
              </Button>
            </div>
          </div>
        </section>
      )}

      {phase === 'decision' && decision && (
        <>
          <WebAutopilotDecisionCard
            projectId={projectId}
            stage={preparation?.stage || ''}
            language={language}
            decision={decision}
            busy={actionBusy}
            onResume={options => sendAction('resume', options)}
            onQuestionAnswered={questionId => {
              setQuestions(current => current.filter(item => item.id !== questionId));
            }}
          />
          {feedJobId && (
            <section className="web-autopilot-card" aria-label={en ? 'Runner activity' : 'Actividad del runner'}>
              <WebAutopilotRunnerFeed
                projectId={projectId}
                activeJobId={feedJobId}
                activeJobState={feedJobState}
                language={language}
                runnerSummary={runnerSummary}
                onOpenRunners={onOpenRunners}
              />
            </section>
          )}
        </>
      )}

      {phase === 'ready' && preparation && (
        <section className="web-autopilot-card web-autopilot-ready" aria-label={en ? 'Word draft ready' : 'Borrador Word listo'}>
          <header className="web-autopilot-ready-head">
            <CheckCircle2 size={24} className="web-autopilot-ready-icon" aria-hidden="true" />
            <div>
              <h2>{en ? 'Your Word draft is ready' : 'Tu borrador Word está listo'}</h2>
              <p>
                {en
                  ? `Review and polish "${projectTitle}", download the DOCX, or run compliance reviews before submission.`
                  : `Revisa y afina «${projectTitle}», descarga el DOCX o ejecuta las revisiones de cumplimiento antes de presentar.`}
              </p>
            </div>
          </header>

          <div className="web-autopilot-ready-actions">
            {wordArtifactUrl && (
              <>
                <WebWordDocument
                  language={language}
                  saveToProject
                  url={wordArtifactUrl}
                  name={`${projectTitle || 'propuesta'}.docx`}
                  label={en ? 'Review & edit Word' : 'Revisar y editar Word'}
                  onSaveAndContinue={() =>
                    window.dispatchEvent(
                      new CustomEvent('savia:word-reviewed', {
                        detail: { projectId, jobId: preparation.wordId },
                      }),
                    )
                  }
                />
                <a className="web-autopilot-download-link" href={wordArtifactUrl} download>
                  <Download size={15} aria-hidden="true" />
                  {en ? 'Download DOCX' : 'Descargar DOCX'}
                </a>
              </>
            )}
            <Button size="sm" variant="outline" onClick={onOpenReviews}>
              <ShieldCheck size={15} aria-hidden="true" />
              {en ? 'Go to Reviews' : 'Ir a Revisiones'}
            </Button>
            <Button size="sm" variant="outline" onClick={onOpenChat}>
              <MessageSquare size={15} aria-hidden="true" />
              {en ? 'Open Chat' : 'Abrir Chat'}
            </Button>
          </div>
        </section>
      )}

      <details
        className="web-autopilot-drawer"
        open={drawerOpen}
        onToggle={event => setDrawerOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="web-autopilot-drawer-summary">
          <span className="web-autopilot-drawer-title">
            <Eye size={16} aria-hidden="true" />
            <strong>{en ? 'View progress' : 'Ver avances'}</strong>
            <small>
              {en
                ? 'Read-only summary, outline, and key facts generated so far'
                : 'Vista de solo lectura del resumen, índice y datos clave generados'}
            </small>
          </span>
          <ChevronDown size={16} className="web-autopilot-drawer-chevron" aria-hidden="true" />
        </summary>

        <div className="web-autopilot-drawer-body">
          <div className="web-autopilot-drawer-tabs" role="tablist" aria-label={en ? 'Generated progress' : 'Avances generados'}>
            <button
              type="button"
              role="tab"
              aria-selected={drawerTab === 'summary'}
              onClick={() => setDrawerTab('summary')}
            >
              {en ? 'Summary' : 'Resumen'}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={drawerTab === 'outline'}
              onClick={() => setDrawerTab('outline')}
            >
              {en ? 'Outline' : 'Índice'}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={drawerTab === 'facts'}
              onClick={() => setDrawerTab('facts')}
            >
              {en ? 'Key facts' : 'Datos clave'}
            </button>
          </div>

          {snapshotLoading && !snapshot && (
            <p role="status" className="web-autopilot-hint">
              {en ? 'Loading generated progress…' : 'Cargando avances generados…'}
            </p>
          )}

          {snapshot && drawerTab === 'summary' && (
            <div className="web-autopilot-drawer-panel" role="tabpanel">
              {snapshot.analyses.filter(item => item.content?.trim()).length === 0 ? (
                <p className="web-autopilot-hint">
                  {en ? 'No tender summary generated yet.' : 'Aún no se ha generado el resumen del pliego.'}
                </p>
              ) : (
                snapshot.analyses
                  .filter(item => item.content?.trim())
                  .map(item => (
                    <article key={item.category} className="web-autopilot-drawer-section">
                      <h4>{analysisLabels[item.category] || item.category}</h4>
                      <MarkdownRenderer allowRawHtml={false}>
                        {item.content!.replaceAll('![', '[')}
                      </MarkdownRenderer>
                    </article>
                  ))
              )}
            </div>
          )}

          {snapshot && drawerTab === 'outline' && (
            <div className="web-autopilot-drawer-panel" role="tabpanel">
              {snapshot.outline.length === 0 ? (
                <p className="web-autopilot-hint">
                  {en ? 'No outline generated yet.' : 'Aún no se ha generado el índice.'}
                </p>
              ) : (
                renderOutlineTree(snapshot.outline, en)
              )}
            </div>
          )}

          {snapshot && drawerTab === 'facts' && (
            <div className="web-autopilot-drawer-panel" role="tabpanel">
              {snapshot.facts.length === 0 ? (
                <p className="web-autopilot-hint">
                  {en ? 'No key facts extracted yet.' : 'Aún no se han extraído los datos clave.'}
                </p>
              ) : (
                snapshot.facts.map(group => (
                  <article key={group.id} className="web-autopilot-drawer-section">
                    <h4>{group.title}</h4>
                    <p className="web-autopilot-prewrap">{group.content}</p>
                  </article>
                ))
              )}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
