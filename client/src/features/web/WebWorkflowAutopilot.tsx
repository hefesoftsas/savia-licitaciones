import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2, Send, Sparkles, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { SelectField } from '@/shared/ui/SelectField';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import { WebJobProgress } from './WebJobProgress';

type Language = 'es' | 'en';
type Stage = 'evaluating' | 'preparing' | 'submitted' | 'awarded' | 'not_awarded' | 'discarded';
type Focus = 'prepare' | 'submit' | 'after';
type Task = { id: string; title: string; dueDate: string; completed: boolean; version: number };
type Requirement = { id: string; title: string; source: string; evidence: string; status: string; category: string; version: number };
type ProjectFile = { id: string; name: string; size: number; deleting?: number | boolean };
type ProjectJob = {
  id: string;
  kind: string;
  state: string;
  progress?: string | null;
  artifactState?: string;
  wordRevision?: number;
  payload?: {
    bidDocument?: string;
    fileIds?: string[];
    tenderFileIds?: string[];
    bidFileIds?: string[];
  };
  result?: { message?: string } | null;
};
type EvaluationCriterion = {
  id: string;
  name: string;
  tenderSourceId: string;
  tenderQuote: string;
  maxPoints: number | null;
  maxPointsUnverified: boolean;
  bidSourceId: string | null;
  bidQuote: string;
  proposedPoints: number | null;
  explanation: string;
};

const STATUS_LIST = ['pending', 'meets', 'does_not_meet', 'unknown'] as const;
const STATUS_LABELS: Record<string, { es: string; en: string }> = {
  pending: { es: 'Pendiente', en: 'Pending' },
  meets: { es: 'Cumple', en: 'Meets' },
  does_not_meet: { es: 'No cumple', en: 'Does not meet' },
  unknown: { es: 'No determinado', en: 'Undetermined' },
};

function subtractIsoDays(deadlineIso: string, days: number): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(deadlineIso || '');
  if (!match) return '';
  const target = new Date(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(target.getTime())) return '';
  target.setUTCDate(target.getUTCDate() - days);
  const today = new Date();
  const min = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return (target < min ? min : target).toISOString().slice(0, 10);
}

function inferRequirementCategory(name: string, quote: string): 'legal' | 'financial' | 'technical' | 'experience' {
  const text = `${name} ${quote}`.toLowerCase();
  if (/jur[ií]dic|legal|p[oó]liza|garant[ií]a|capacidad|representaci[oó]n|nit|cif|nif|constituc|antecedente|habilitante/.test(text)) {
    return 'legal';
  }
  if (/financier|liquidez|endeudamiento|patrimonio|balance|solvencia econ[oó]mica|presupuesto|precio|oferta econ[oó]mica|tarifa/.test(text)) {
    return 'financial';
  }
  if (/experiencia|contrato|certificaci[oó]n previa|\brup\b|rolece|trayectoria|acreditaci[oó]n/.test(text)) {
    return 'experience';
  }
  return 'technical';
}

function inferCriterionStatus(criterion: EvaluationCriterion): 'meets' | 'does_not_meet' | 'pending' {
  if (criterion.bidSourceId) {
    if (
      typeof criterion.maxPoints === 'number' &&
      Number.isFinite(criterion.maxPoints) &&
      criterion.maxPoints > 0 &&
      typeof criterion.proposedPoints === 'number' &&
      Number.isFinite(criterion.proposedPoints)
    ) {
      return criterion.proposedPoints >= criterion.maxPoints * 0.7 ? 'meets' : 'pending';
    }
    return 'meets';
  }
  if (criterion.proposedPoints === 0) return 'does_not_meet';
  return 'pending';
}

export type WebWorkflowAutopilotProps = {
  projectId: string;
  language: Language;
  stage: { stage: Stage; version: number };
  tasks: Task[];
  requirements: Requirement[];
  fileIds: string[];
  projectFiles: ProjectFile[];
  credentialId: string;
  submissionCount: number;
  openRequestCount: number;
  onStageChange: (next: Stage) => Promise<boolean>;
  onTaskCreated: (item: Task) => void;
  onTaskToggled: (task: Task, completed: boolean) => Promise<void>;
  onTaskDeleted: (task: Task) => Promise<void>;
  onRequirementAccepted: (item: Requirement) => void;
  onRequirementStatusChange: (item: Requirement, status: string) => Promise<void>;
  onExportRequirements: (format: 'csv' | 'xlsx') => Promise<void>;
  onPrepareProposal?: () => void;
  onOpenAdvanced: (focus?: Focus) => void;
};

/** Minimal one-click autopilot card for preparing offer delivery from the generated proposal. */
export function WebWorkflowAutopilot(props: WebWorkflowAutopilotProps) {
  const {
    projectId,
    language,
    stage,
    tasks,
    requirements,
    fileIds,
    projectFiles,
    credentialId,
    submissionCount,
    onStageChange,
    onTaskCreated,
    onTaskToggled,
    onRequirementAccepted,
    onRequirementStatusChange,
    onExportRequirements,
    onPrepareProposal,
    onOpenAdvanced,
  } = props;

  const en = language === 'en';
  const { showToast } = useToast();

  const availableFiles = useMemo(
    () => projectFiles.filter(file => !file.deleting && !/\.zip$/i.test(file.name)),
    [projectFiles],
  );
  const targetFileIds = useMemo(() => {
    const validSelected = fileIds.filter(id => availableFiles.some(file => file.id === id));
    return (validSelected.length ? validSelected : availableFiles.map(file => file.id)).slice(0, 49);
  }, [fileIds, availableFiles]);

  const [projectJobs, setProjectJobs] = useState<ProjectJob[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [autopilotBusy, setAutopilotBusy] = useState(false);
  const [autopilotPhase, setAutopilotPhase] = useState('');
  const [syncingEvaluation, setSyncingEvaluation] = useState(false);
  const [officialDeadline, setOfficialDeadline] = useState('');

  const mountedRef = useRef(true);
  const autoImportEvalJobIdRef = useRef<string | null>(null);
  const importedEvalJobIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadJobs = useCallback(async () => {
    const data = await request<{ jobs: ProjectJob[] }>(`/api/projects/${encodeURIComponent(projectId)}/jobs`);
    if (mountedRef.current) {
      setProjectJobs(data.jobs || []);
      setJobsLoaded(true);
    }
  }, [projectId]);

  useEffect(() => {
    let active = true;
    void request<{ process?: { deadline?: string } }>(`/api/projects/${encodeURIComponent(projectId)}/secop`)
      .then(data => {
        if (active && typeof data?.process?.deadline === 'string') setOfficialDeadline(data.process.deadline);
      })
      .catch(() => undefined);
    void loadJobs().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [projectId, loadJobs]);

  const statusOptions = useMemo(
    () => STATUS_LIST.map(st => ({ value: st, label: STATUS_LABELS[st][language] })),
    [language],
  );

  const generatedTechnicalJob = useMemo(
    () =>
      projectJobs.find(
        job =>
          job.kind === 'technical-plan.export-word' &&
          job.state === 'succeeded' &&
          job.artifactState === 'stored' &&
          job.payload?.bidDocument !== 'economic',
      ) || null,
    [projectJobs],
  );

  const generatedEconomicJob = useMemo(
    () =>
      projectJobs.find(
        job =>
          job.kind === 'technical-plan.export-word' &&
          job.state === 'succeeded' &&
          job.artifactState === 'stored' &&
          job.payload?.bidDocument === 'economic',
      ) || null,
    [projectJobs],
  );

  const draftId = generatedTechnicalJob ? `word-draft:${generatedTechnicalJob.id}` : '';

  const activeEvalJob = useMemo(() => {
    if (!draftId) return null;
    return (
      projectJobs.find(
        job =>
          job.kind === 'bid-evaluation.analyze' &&
          ['queued', 'running'].includes(job.state) &&
          (job.payload?.bidFileIds?.includes(draftId) || job.payload?.fileIds?.includes(draftId)),
      ) || null
    );
  }, [projectJobs, draftId]);

  const latestEvalJobForDraft = useMemo(() => {
    if (!draftId) return null;
    return (
      projectJobs.find(
        job =>
          job.kind === 'bid-evaluation.analyze' &&
          job.state === 'succeeded' &&
          job.artifactState === 'stored' &&
          (job.payload?.bidFileIds?.includes(draftId) || job.payload?.fileIds?.includes(draftId)),
      ) || null
    );
  }, [projectJobs, draftId]);

  const latestEvalAttempt = useMemo(() => {
    if (!draftId) return null;
    return (
      projectJobs.find(
        job =>
          job.kind === 'bid-evaluation.analyze' &&
          (job.payload?.bidFileIds?.includes(draftId) || job.payload?.fileIds?.includes(draftId)),
      ) || null
    );
  }, [projectJobs, draftId]);

  useEffect(() => {
    if (activeEvalJob?.id) {
      autoImportEvalJobIdRef.current = activeEvalJob.id;
    }
  }, [activeEvalJob?.id]);

  useEffect(() => {
    if (!activeEvalJob) return;
    const timer = window.setInterval(() => {
      void loadJobs().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeEvalJob?.id, loadJobs]);

  const syncEvaluationToRequirements = useCallback(
    async (evalJob: ProjectJob) => {
      if (syncingEvaluation) return 0;
      setSyncingEvaluation(true);
      try {
        const report = await request<{ result?: { criteria?: EvaluationCriterion[] }; criteria?: EvaluationCriterion[] }>(
          `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(evalJob.id)}/evaluation`,
        );
        const criteria = report.result?.criteria || report.criteria || [];
        if (!criteria.length) return 0;

        const existingTitles = new Set(requirements.map(item => item.title.trim().toLowerCase()));
        let added = 0;

        for (const criterion of criteria) {
          const title = String(criterion.name || '').trim().slice(0, 300);
          if (!title || existingTitles.has(title.toLowerCase())) continue;
          const source = String(criterion.tenderQuote || '').trim().slice(0, 20000);
          const rawEvidence = String(criterion.bidQuote || criterion.explanation || '').trim();
          const evidence = rawEvidence.length > 280 ? `${rawEvidence.slice(0, 279)}…` : rawEvidence;
          const status = inferCriterionStatus(criterion);
          const category = inferRequirementCategory(title, source);
          try {
            const res = await request<{ item: Requirement }>(`/api/projects/${encodeURIComponent(projectId)}/workflow/requirements`, {
              method: 'POST',
              json: { title, category, source, evidence, status },
            });
            onRequirementAccepted(res.item);
            existingTitles.add(title.toLowerCase());
            added += 1;
          } catch {
            // Skip duplicate or oversized entries safely.
          }
        }

        if (added > 0) {
          showToast(
            en
              ? `${added} requirement(s) verified against your proposal.`
              : `${added} requisito(s) comprobado(s) frente a tu propuesta.`,
            'success',
          );
        }
        return added;
      } catch {
        showToast(
          en ? 'Could not read proposal evaluation.' : 'No se pudo leer la evaluación de la propuesta.',
          'error',
        );
        return 0;
      } finally {
        if (mountedRef.current) setSyncingEvaluation(false);
      }
    },
    [syncingEvaluation, projectId, requirements, onRequirementAccepted, showToast, en],
  );

  useEffect(() => {
    if (
      !latestEvalJobForDraft ||
      syncingEvaluation ||
      importedEvalJobIdsRef.current.has(latestEvalJobForDraft.id) ||
      autoImportEvalJobIdRef.current !== latestEvalJobForDraft.id
    ) {
      return;
    }
    importedEvalJobIdsRef.current.add(latestEvalJobForDraft.id);
    autoImportEvalJobIdRef.current = null;
    void syncEvaluationToRequirements(latestEvalJobForDraft);
  }, [latestEvalJobForDraft, syncingEvaluation, syncEvaluationToRequirements]);

  const ensureRecommendedChecklist = async () => {
    const existingNormalized = new Set(tasks.map(task => task.title.trim().toLowerCase()));
    const templates = en
      ? [
          { title: 'Verify mandatory tender requirements against draft proposal', daysBefore: 7 },
          { title: 'Gather certificates, company experience and tax/legal supports', daysBefore: 5 },
          { title: 'Polish final technical proposal (DOCX) and economic annex', daysBefore: 3 },
          { title: 'Run final pre-submission review before filing', daysBefore: 1 },
        ]
      : [
          { title: 'Verificar requisitos del pliego frente a tu propuesta', daysBefore: 7 },
          { title: 'Reunir certificados, experiencia y soportes administrativos', daysBefore: 5 },
          { title: 'Revisar borrador final en Word (DOCX) y oferta económica', daysBefore: 3 },
          { title: 'Ejecutar validación previa antes de radicar', daysBefore: 1 },
        ];
    const toCreate = templates.filter(item => !existingNormalized.has(item.title.toLowerCase()));
    for (const item of toCreate) {
      const dueDate = officialDeadline ? subtractIsoDays(officialDeadline, item.daysBefore) : '';
      const res = await request<{ item: Task }>(`/api/projects/${encodeURIComponent(projectId)}/workflow/tasks`, {
        method: 'POST',
        json: { title: item.title, dueDate },
      });
      onTaskCreated(res.item);
    }
  };

  const runFullAutopilot = async (forceRefresh = false) => {
    if (autopilotBusy || activeEvalJob || syncingEvaluation || !generatedTechnicalJob) return;
    setAutopilotBusy(true);
    try {
      if (tasks.length === 0) {
        setAutopilotPhase(en ? 'Creating delivery checklist…' : 'Preparando checklist de entrega…');
        await ensureRecommendedChecklist();
      }
      if (stage.stage === 'evaluating') {
        await onStageChange('preparing');
      }
      if (!forceRefresh && latestEvalJobForDraft) {
        setAutopilotPhase(en ? 'Verifying requirements against your proposal…' : 'Comprobando requisitos frente a tu propuesta…');
        importedEvalJobIdsRef.current.add(latestEvalJobForDraft.id);
        await syncEvaluationToRequirements(latestEvalJobForDraft);
      } else if (targetFileIds.length > 0 && credentialId) {
        setAutopilotPhase(en ? 'Evaluating generated proposal…' : 'Evaluando tu propuesta frente al pliego…');
        const created = await request<{ job?: ProjectJob }>(`/api/projects/${encodeURIComponent(projectId)}/jobs`, {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          json: {
            kind: 'bid-evaluation.analyze',
            credentialId,
            payload: {
              fileIds: [...targetFileIds, draftId],
              tenderFileIds: targetFileIds,
              bidFileIds: [draftId],
              language,
              dataProcessingConsent: true,
            },
          },
        });
        if (created.job?.id) {
          autoImportEvalJobIdRef.current = created.job.id;
        }
        await loadJobs();
        showToast(
          en ? 'Evaluating your generated proposal against tender criteria…' : 'Evaluando tu propuesta frente al pliego…',
          'success',
        );
      }
    } catch {
      showToast(
        en ? 'Could not complete automatic preparation.' : 'No se pudo completar la organización automática.',
        'error',
      );
    } finally {
      if (mountedRef.current) {
        setAutopilotBusy(false);
        setAutopilotPhase('');
      }
    }
  };

  const cancelEvaluation = async () => {
    if (!activeEvalJob) return;
    try {
      await request(`/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(activeEvalJob.id)}/cancel`, {
        method: 'POST',
      });
      await loadJobs();
      showToast(en ? 'Evaluation cancelled.' : 'Evaluación cancelada.', 'info');
    } catch {
      showToast(en ? 'Could not cancel evaluation.' : 'No se pudo cancelar la evaluación.', 'error');
    }
  };

  const isWorking = autopilotBusy || Boolean(activeEvalJob) || syncingEvaluation;
  const completedTasks = tasks.filter(t => t.completed).length;
  const meetsCount = requirements.filter(r => r.status === 'meets').length;
  const pendingReqCount = requirements.filter(r => r.status === 'pending').length;

  const statusPill =
    submissionCount > 0
      ? `${submissionCount} ${en ? 'filing(s)' : 'radicado(s)'}`
      : officialDeadline
        ? `${en ? 'Closes' : 'Cierre'} ${officialDeadline.slice(0, 10)}`
        : generatedTechnicalJob
          ? en
            ? 'Proposal ready'
            : 'Propuesta lista'
          : en
            ? 'Pending'
            : 'Pendiente';

  const statusLine = !jobsLoaded
    ? en
      ? 'Checking generated proposal status…'
      : 'Comprobando propuesta generada…'
    : !generatedTechnicalJob
      ? en
        ? 'Generate your proposal first in "Prepare bid" so Savia can package it and verify compliance.'
        : 'Primero genera tu propuesta en «Preparar oferta» para prepararla y verificar requisitos automáticamente.'
      : isWorking
        ? autopilotPhase || (en ? 'Verifying tender requirements against your proposal…' : 'Verificando requisitos del pliego frente a tu propuesta…')
        : requirements.length === 0
          ? en
            ? 'Your Word proposal is ready. Run autopilot to verify compliance and prepare the delivery checklist.'
            : 'Tu borrador en Word está listo. Ejecuta el piloto automático para comprobar requisitos y armar el checklist.'
          : en
            ? 'Proposal checked and checklist ready. Review any pending items below or record your filing.'
            : 'Propuesta comprobada y checklist listo. Revisa los detalles abajo o registra la presentación.';

  const techRev =
    generatedTechnicalJob?.wordRevision && generatedTechnicalJob.wordRevision > 0 ? ` (rev. ${generatedTechnicalJob.wordRevision})` : '';

  return (
    <div className="web-module-autopilot">
      <section className="web-review-autopilot-card">
        <div className="web-autopilot-card-header">
          <div className="web-autopilot-card-title">
            <div>
              <h2>{en ? 'Organize bid' : 'Organizar oferta'}</h2>
              <p className="web-review-hint">{statusLine}</p>
            </div>
          </div>
          <span className="web-review-status-pill" data-state={generatedTechnicalJob ? 'succeeded' : 'pending'}>
            {statusPill}
          </span>
        </div>

        {jobsLoaded && !generatedTechnicalJob && onPrepareProposal && (
          <div className="web-inline">
            <Button onClick={onPrepareProposal}>{en ? 'Go to Prepare bid' : 'Ir a Preparar oferta'}</Button>
          </div>
        )}

        {jobsLoaded && generatedTechnicalJob && (
          <>
            {isWorking ? (
              <div className="web-autopilot-progress-panel" role="status">
                <div className="web-autopilot-card-header">
                  <div className="web-inline">
                    <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                    <span>{statusLine}</span>
                  </div>
                  {activeEvalJob && (
                    <Button icon={Square} size="sm" variant="outline" onClick={() => void cancelEvaluation()}>
                      {en ? 'Cancel' : 'Cancelar'}
                    </Button>
                  )}
                </div>
                {activeEvalJob && (
                  <WebJobProgress state={activeEvalJob.state} progress={activeEvalJob.progress} language={language} />
                )}
              </div>
            ) : (
              <div className="web-inline">
                {requirements.length === 0 ? (
                  <Button
                    icon={Sparkles}
                    disabled={!latestEvalJobForDraft && (!targetFileIds.length || !credentialId)}
                    onClick={() => void runFullAutopilot(false)}
                  >
                    {en ? 'Organize bid on autopilot' : 'Organizar oferta en piloto automático'}
                  </Button>
                ) : (
                  <>
                    <Button icon={Send} onClick={() => onOpenAdvanced('submit')}>
                      {en ? 'Record filing' : 'Registrar presentación'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!targetFileIds.length || !credentialId}
                      onClick={() => void runFullAutopilot(true)}
                    >
                      {en ? 'Re-run check' : 'Volver a analizar'}
                    </Button>
                  </>
                )}
              </div>
            )}

            {latestEvalAttempt && !isWorking && latestEvalAttempt.state !== 'succeeded' && latestEvalAttempt.result?.message && (
              <p className="web-review-hint" role="alert">
                {latestEvalAttempt.result.message}
              </p>
            )}

            <div className="web-workflow-summary-list">
              <div className="web-workflow-summary-row">
                <span className="web-workflow-summary-label">
                  <FileText size={16} aria-hidden="true" />
                  <strong>
                    {en ? 'Technical proposal (DOCX)' : 'Borrador de propuesta técnica (DOCX)'}
                    {techRev}
                  </strong>
                </span>
                <a
                  className="web-link"
                  href={`/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(generatedTechnicalJob.id)}/artifact`}
                >
                  <Download size={14} aria-hidden="true" />
                  {en ? 'Download' : 'Descargar'}
                </a>
              </div>

              {generatedEconomicJob && (
                <div className="web-workflow-summary-row">
                  <span className="web-workflow-summary-label">
                    <FileText size={16} aria-hidden="true" />
                    <strong>{en ? 'Economic offer (PDF)' : 'Oferta económica generada (PDF)'}</strong>
                  </span>
                  <a
                    className="web-link"
                    href={`/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(generatedEconomicJob.id)}/artifact`}
                  >
                    <Download size={14} aria-hidden="true" />
                    {en ? 'Download' : 'Descargar'}
                  </a>
                </div>
              )}

              <details className="web-workflow-summary-details">
                <summary>
                  <span>{en ? 'Requirements vs. your proposal' : 'Requisitos frente a tu propuesta'}</span>
                  <span className="web-workflow-summary-meta">
                    <small>
                      {requirements.length > 0
                        ? en
                          ? `${meetsCount} meet · ${pendingReqCount} pending`
                          : `${meetsCount} cumplen · ${pendingReqCount} pend.`
                        : en
                          ? 'Pending analysis'
                          : 'Pendiente de analizar'}
                    </small>
                    <ChevronDown size={15} className="web-workflow-summary-chevron" aria-hidden="true" />
                  </span>
                </summary>
                <div className="web-workflow-summary-body">
                  {requirements.length > 0 ? (
                    <>
                      <div className="web-inline">
                        <Button
                          icon={FileSpreadsheet}
                          size="sm"
                          variant="outline"
                          onClick={() => void onExportRequirements('xlsx')}
                        >
                          {en ? 'Export Excel' : 'Exportar Excel'}
                        </Button>
                      </div>
                      <div className="web-autopilot-list">
                        {requirements.map(item => (
                          <div key={item.id} className="web-autopilot-item-row">
                            <div className="web-autopilot-item-body">
                              <strong>{item.title}</strong>
                              {item.evidence && (
                                <small className="web-review-hint">
                                  {en ? 'In your proposal:' : 'En tu propuesta:'} {item.evidence}
                                </small>
                              )}
                            </div>
                            <SelectField
                              aria-label={en ? `Compliance for ${item.title}` : `Valoración de ${item.title}`}
                              value={item.status}
                              options={statusOptions}
                              fullWidth={false}
                              align="end"
                              className={`web-workflow-status-select is-${item.status}`}
                              onChange={value => void onRequirementStatusChange(item, value)}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="web-review-hint">
                      {en
                        ? 'Run autopilot above to compare tender requirements against your draft.'
                        : 'Ejecuta el piloto automático arriba para comparar el pliego con tu propuesta.'}
                    </p>
                  )}
                </div>
              </details>

              <details className="web-workflow-summary-details">
                <summary>
                  <span>{en ? 'Delivery checklist' : 'Checklist de entrega'}</span>
                  <span className="web-workflow-summary-meta">
                    <small>
                      {tasks.length > 0
                        ? en
                          ? `${completedTasks} of ${tasks.length} done`
                          : `${completedTasks} de ${tasks.length} completadas`
                        : en
                          ? 'Created on run'
                          : 'Se creará al ejecutar'}
                    </small>
                    <ChevronDown size={15} className="web-workflow-summary-chevron" aria-hidden="true" />
                  </span>
                </summary>
                <div className="web-workflow-summary-body">
                  {tasks.length > 0 ? (
                    <ul className="web-workflow-tasks">
                      {tasks.map(task => (
                        <li className="web-task" data-completed={task.completed || undefined} key={task.id}>
                          <label>
                            <input
                              type="checkbox"
                              checked={task.completed}
                              onChange={event => void onTaskToggled(task, event.target.checked)}
                            />
                            <span>{task.title}</span>
                          </label>
                          {task.dueDate && <time dateTime={task.dueDate}>{task.dueDate}</time>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="web-review-hint">
                      {en
                        ? 'Autopilot generates deadline-based tasks automatically.'
                        : 'El piloto automático crea estas tareas según la fecha de cierre.'}
                    </p>
                  )}
                </div>
              </details>
            </div>
          </>
        )}
      </section>

      <p className="web-review-hint">
        {en
          ? 'Need to add custom tasks, update your bid decision, or link manual supports? Switch to Advanced view above.'
          : '¿Quieres agregar tareas, cambiar la decisión o editar soportes? Cambia a Vista avanzada arriba.'}
      </p>
    </div>
  );
}
