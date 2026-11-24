import { CheckCircle2, CheckSquare, FileDown, FileSpreadsheet, ListChecks, Loader2, PackagePlus, Plus, ScanText, Sparkles, Square, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Checkbox } from '@/shared/ui/primitives/checkbox';
import { Input } from '@/shared/ui/primitives/input';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import { WebJobProgress } from './WebJobProgress';

type Language = 'es' | 'en';
type Stage = 'evaluating' | 'preparing' | 'submitted' | 'awarded' | 'not_awarded' | 'discarded';
type Focus = 'prepare' | 'submit' | 'after';
type Task = { id: string; title: string; dueDate: string; completed: boolean; version: number };
type Requirement = { id: string; title: string; source: string; evidence: string; status: string; category: string; version: number };
type ProjectFile = { id: string; name: string; size: number; deleting?: number | boolean };
type Suggestion = { id: string; title: string; category: string; sourceId: string; quote: string; factIds: string[] };
type SuggestionJob = {
  id: string;
  state: string;
  progress?: string | null;
  stale: boolean;
  result: {
    requirements?: Suggestion[];
    sources?: { id: string; name: string }[];
    facts?: { id: string; label: string; value: string; page: number }[];
    discardedCount?: number;
    discardedLinks?: number;
    unreadableSources?: { id: string; name: string }[];
    message?: string;
  } | null;
  accepted: { suggestionId: string; requirementId: string }[];
};
type Tracking = { decision: 'review' | 'participate' | 'discarded'; owner: string; notes: string; version: number; updatedAt: string | null };
type OfferDoc = { id: string; name: string; fileId: string | null; version: number };
type OfferPackageItem = { id: string; documentId: string; unresolvedDocument: boolean; state: string };

const STAGE_LIST: Stage[] = ['evaluating', 'preparing', 'submitted', 'awarded', 'not_awarded', 'discarded'];
const STAGE_NAMES = {
  es: ['Por evaluar', 'Preparando', 'Presentada', 'Adjudicada', 'No adjudicada', 'Descartada'],
  en: ['To evaluate', 'Preparing', 'Submitted', 'Awarded', 'Not awarded', 'Discarded'],
};
const CATEGORY_ORDER = ['all', 'legal', 'financial', 'technical', 'experience', 'general'] as const;
const CATEGORY_LABELS: Record<string, { es: string; en: string }> = {
  all: { es: 'Todos', en: 'All' },
  general: { es: 'General', en: 'General' },
  legal: { es: 'Jurídico', en: 'Legal' },
  financial: { es: 'Financiero', en: 'Financial' },
  technical: { es: 'Técnico', en: 'Technical' },
  experience: { es: 'Experiencia', en: 'Experience' },
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

export function WebWorkflowAutopilot({
  projectId,
  language,
  stage,
  tasks,
  requirements,
  fileIds,
  projectFiles,
  credentialId,
  submissionCount,
  openRequestCount,
  onStageChange,
  onTaskCreated,
  onTaskToggled,
  onTaskDeleted,
  onRequirementAccepted,
  onRequirementStatusChange,
  onExportRequirements,
  onOpenAdvanced,
}: {
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
  onOpenAdvanced: (focus?: Focus) => void;
}) {
  const en = language === 'en';
  const { showToast } = useToast();

  const availableFiles = useMemo(
    () => projectFiles.filter(file => !file.deleting && !/\.zip$/i.test(file.name)),
    [projectFiles],
  );
  const targetFileIds = useMemo(() => {
    const validSelected = fileIds.filter(id => availableFiles.some(file => file.id === id));
    return (validSelected.length ? validSelected : availableFiles.map(file => file.id)).slice(0, 50);
  }, [fileIds, availableFiles]);

  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [hasRupFacts, setHasRupFacts] = useState(false);
  const [includeRup, setIncludeRup] = useState(false);
  const [rupChecked, setRupChecked] = useState(false);
  const [suggestionJobs, setSuggestionJobs] = useState<SuggestionJob[]>([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [acceptingBatch, setAcceptingBatch] = useState(false);
  const [acceptProgress, setAcceptProgress] = useState<{ done: number; total: number } | null>(null);
  const [checklistBusy, setChecklistBusy] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskBusy, setQuickTaskBusy] = useState(false);
  const [offerData, setOfferData] = useState<{ documents: OfferDoc[]; presentation: OfferPackageItem[] } | null>(null);
  const [packageBusy, setPackageBusy] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [officialDeadline, setOfficialDeadline] = useState('');

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadSuggestions = useCallback(async () => {
    const result = await request<{ jobs: SuggestionJob[] }>(`/api/projects/${encodeURIComponent(projectId)}/requirement-suggestions`);
    if (mountedRef.current) setSuggestionJobs(result.jobs);
  }, [projectId]);

  const loadOfferPackage = useCallback(async () => {
    const data = await request<{ documents: OfferDoc[]; presentation: OfferPackageItem[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/offer-documents`,
    );
    if (mountedRef.current) setOfferData(data);
  }, [projectId]);

  useEffect(() => {
    let active = true;
    void request<Tracking>(`/api/projects/${encodeURIComponent(projectId)}/opportunity-tracking`)
      .then(data => {
        if (active) setTracking(data);
      })
      .catch(() => undefined);
    void request<{ facts: { id: string }[] }>('/api/rup/facts')
      .then(data => {
        if (!active) return;
        const found = Boolean(data.facts?.length);
        setHasRupFacts(found);
        if (!rupChecked) {
          setIncludeRup(found);
          setRupChecked(true);
        }
      })
      .catch(() => undefined);
    void request<{ process?: { deadline?: string } }>(`/api/projects/${encodeURIComponent(projectId)}/secop`)
      .then(data => {
        if (active && typeof data?.process?.deadline === 'string') setOfficialDeadline(data.process.deadline);
      })
      .catch(() => undefined);
    void loadOfferPackage().catch(() => undefined);
    void loadSuggestions().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [projectId, loadOfferPackage, loadSuggestions]);

  const activeSuggestionJob = suggestionJobs.find(job => ['queued', 'running'].includes(job.state)) || null;
  const latestReadySuggestionJob = suggestionJobs.find(job => job.state === 'succeeded' && !job.stale) || null;
  const latestSuggestionJob = activeSuggestionJob || suggestionJobs[0] || null;

  useEffect(() => {
    if (!activeSuggestionJob) return;
    const timer = window.setInterval(() => {
      void loadSuggestions().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeSuggestionJob?.id, loadSuggestions]);

  useEffect(() => {
    if (!latestReadySuggestionJob?.result?.requirements) {
      setSelectedSuggestionIds([]);
      return;
    }
    const acceptedSet = new Set(latestReadySuggestionJob.accepted.map(item => item.suggestionId));
    setSelectedSuggestionIds(
      latestReadySuggestionJob.result.requirements.filter(item => !acceptedSet.has(item.id)).map(item => item.id),
    );
  }, [latestReadySuggestionJob?.id, latestReadySuggestionJob?.accepted.length]);

  const queueAnalysis = async () => {
    if (suggestBusy || !targetFileIds.length || !credentialId || activeSuggestionJob) return;
    setSuggestBusy(true);
    try {
      await request(`/api/projects/${encodeURIComponent(projectId)}/jobs`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        json: {
          kind: 'requirements.suggest',
          credentialId,
          payload: { fileIds: targetFileIds, language, dataProcessingConsent: true, includeRup },
        },
      });
      await loadSuggestions();
      showToast(en ? 'Tender requirements analysis queued.' : 'Análisis de requisitos del pliego en cola.', 'success');
    } catch (error) {
      const conflict = (error as Error & { status?: number }).status === 409;
      showToast(
        conflict
          ? en
            ? 'Another analysis is running or sources changed.'
            : 'Ya hay un análisis en curso o las fuentes cambiaron.'
          : en
            ? 'Could not start requirements analysis.'
            : 'No se pudo iniciar el análisis de requisitos.',
        'error',
      );
    } finally {
      setSuggestBusy(false);
    }
  };

  const cancelAnalysis = async (jobId: string) => {
    setSuggestBusy(true);
    try {
      await request(`/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
      await loadSuggestions();
      showToast(en ? 'Analysis cancelled.' : 'Análisis cancelado.', 'info');
    } catch {
      showToast(en ? 'Could not cancel the analysis.' : 'No se pudo cancelar el análisis.', 'error');
    } finally {
      setSuggestBusy(false);
    }
  };

  const acceptSelectedSuggestions = async () => {
    if (!latestReadySuggestionJob || acceptingBatch) return;
    const acceptedSet = new Set(latestReadySuggestionJob.accepted.map(item => item.suggestionId));
    const list = (latestReadySuggestionJob.result?.requirements || []).filter(
      item => selectedSuggestionIds.includes(item.id) && !acceptedSet.has(item.id),
    );
    if (!list.length) return;
    setAcceptingBatch(true);
    setAcceptProgress({ done: 0, total: list.length });
    let added = 0;
    let failedCount = 0;
    try {
      for (const item of list) {
        try {
          const result = await request<{ item: Requirement }>(
            `/api/projects/${encodeURIComponent(projectId)}/requirement-suggestions/${encodeURIComponent(latestReadySuggestionJob.id)}/accept`,
            { method: 'POST', json: { suggestionId: item.id } },
          );
          onRequirementAccepted(result.item);
          added += 1;
        } catch {
          failedCount += 1;
        }
        setAcceptProgress({ done: added + failedCount, total: list.length });
      }
      await loadSuggestions();
      if (added > 0) {
        showToast(
          en ? `${added} requirement(s) added to the matrix.` : `${added} requisito(s) agregado(s) a la matriz.`,
          failedCount ? 'info' : 'success',
        );
      } else {
        showToast(en ? 'Could not add the selected requirements.' : 'No se pudieron agregar los requisitos seleccionados.', 'error');
      }
    } finally {
      setAcceptingBatch(false);
      setAcceptProgress(null);
    }
  };

  const generateRecommendedChecklist = async () => {
    if (checklistBusy) return;
    const existingNormalized = new Set(tasks.map(task => task.title.trim().toLowerCase()));
    const templates = en
      ? [
          { title: 'Review mandatory legal & financial eligibility requirements', daysBefore: 7 },
          { title: 'Gather certificates, company experience and tax/legal supports', daysBefore: 5 },
          { title: 'Draft and review technical proposal & economic annex', daysBefore: 3 },
          { title: 'Run pre-submission review (anonymity, rejection & duplicates)', daysBefore: 1 },
        ]
      : [
          { title: 'Revisar causales de rechazo y requisitos habilitantes del pliego', daysBefore: 7 },
          { title: 'Recopilar certificados, experiencia y soportes jurídicos/financieros', daysBefore: 5 },
          { title: 'Redactar y ajustar propuesta técnica y anexo económico', daysBefore: 3 },
          { title: 'Ejecutar revisión final (anonimato, rechazo y duplicados) antes de presentar', daysBefore: 1 },
        ];
    const toCreate = templates.filter(item => !existingNormalized.has(item.title.toLowerCase()));
    if (!toCreate.length) {
      showToast(en ? 'The recommended checklist is already created.' : 'El checklist recomendado ya está creado.', 'info');
      return;
    }
    setChecklistBusy(true);
    let createdCount = 0;
    try {
      for (const item of toCreate) {
        const dueDate = officialDeadline ? subtractIsoDays(officialDeadline, item.daysBefore) : '';
        const res = await request<{ item: Task }>(`/api/projects/${encodeURIComponent(projectId)}/workflow/tasks`, {
          method: 'POST',
          json: { title: item.title, dueDate },
        });
        onTaskCreated(res.item);
        createdCount += 1;
      }
      showToast(en ? `${createdCount} tasks created.` : `${createdCount} tareas creadas en tu checklist.`, 'success');
    } catch {
      showToast(en ? 'Could not create all checklist tasks.' : 'No se pudieron crear todas las tareas del checklist.', 'error');
    } finally {
      setChecklistBusy(false);
    }
  };

  const addQuickTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!quickTaskTitle.trim() || quickTaskBusy) return;
    setQuickTaskBusy(true);
    try {
      const res = await request<{ item: Task }>(`/api/projects/${encodeURIComponent(projectId)}/workflow/tasks`, {
        method: 'POST',
        json: { title: quickTaskTitle.trim(), dueDate: '' },
      });
      onTaskCreated(res.item);
      setQuickTaskTitle('');
    } catch {
      showToast(en ? 'Could not create the task.' : 'No se pudo agregar la tarea.', 'error');
    } finally {
      setQuickTaskBusy(false);
    }
  };

  const populateOfferPackage = async () => {
    if (packageBusy || !availableFiles.length) return;
    setPackageBusy(true);
    try {
      const current =
        offerData ||
        (await request<{ documents: OfferDoc[]; presentation: OfferPackageItem[] }>(
          `/api/projects/${encodeURIComponent(projectId)}/offer-documents`,
        ));
      const byFileId = new Map<string, OfferDoc>();
      for (const doc of current.documents) {
        if (doc.fileId) byFileId.set(doc.fileId, doc);
      }
      for (const file of availableFiles) {
        if (!byFileId.has(file.id)) {
          await request(`/api/projects/${encodeURIComponent(projectId)}/offer-documents/documents`, {
            method: 'POST',
            headers: { 'idempotency-key': crypto.randomUUID() },
            json: { fileId: file.id },
          });
        }
      }
      const afterDocs = await request<{ documents: OfferDoc[]; presentation: OfferPackageItem[] }>(
        `/api/projects/${encodeURIComponent(projectId)}/offer-documents`,
      );
      const inPackage = new Set(afterDocs.presentation.filter(item => !item.unresolvedDocument).map(item => item.documentId));
      let addedToPkg = 0;
      for (const doc of afterDocs.documents) {
        if (!doc.fileId || inPackage.has(doc.id)) continue;
        await request(`/api/projects/${encodeURIComponent(projectId)}/offer-documents/package`, {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          json: { documentId: doc.id, version: doc.version },
        });
        addedToPkg += 1;
      }
      await loadOfferPackage();
      showToast(
        addedToPkg
          ? en
            ? `${addedToPkg} document(s) added to the offer package.`
            : `${addedToPkg} documento(s) añadido(s) al paquete de oferta.`
          : en
            ? 'All project documents are already in the package.'
            : 'Todos los documentos del proyecto ya están incluidos en el paquete.',
        'success',
      );
    } catch {
      showToast(en ? 'Could not update the offer package.' : 'No se pudo actualizar el paquete de oferta.', 'error');
    } finally {
      setPackageBusy(false);
    }
  };

  const updateDecision = async (decision: Tracking['decision']) => {
    if (!tracking || trackingBusy) return;
    setTrackingBusy(true);
    try {
      const updated = await request<Tracking>(`/api/projects/${encodeURIComponent(projectId)}/opportunity-tracking`, {
        method: 'PUT',
        json: { ...tracking, decision },
      });
      setTracking(updated);
      showToast(en ? 'Decision saved.' : 'Decisión guardada.', 'success');
    } catch {
      showToast(en ? 'Could not save decision.' : 'No se pudo guardar la decisión.', 'error');
    } finally {
      setTrackingBusy(false);
    }
  };

  const meetsCount = requirements.filter(r => r.status === 'meets').length;
  const pendingReqCount = requirements.filter(r => r.status === 'pending').length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const packageCount = offerData?.presentation.filter(item => !item.unresolvedDocument).length || 0;

  const filteredRequirements =
    categoryFilter === 'all' ? requirements : requirements.filter(item => item.category === categoryFilter);
  const suggestions = latestReadySuggestionJob?.result?.requirements || [];
  const acceptedSuggestionIds = new Set(latestReadySuggestionJob?.accepted.map(a => a.suggestionId) || []);
  const pendingSuggestionsCount = suggestions.filter(item => !acceptedSuggestionIds.has(item.id)).length;

  return (
    <div className="web-module-autopilot">
      <div className="web-autopilot-kpi-strip" aria-label={en ? 'Offer organization summary' : 'Resumen de organización'}>
        <div className="web-autopilot-kpi">
          <span>{en ? 'Decision & stage' : 'Decisión y etapa'}</span>
          <div className="web-inline" style={{ marginTop: 4 }}>
            <select
              aria-label={en ? 'Decision' : 'Decisión'}
              disabled={!tracking || trackingBusy}
              value={tracking?.decision || 'review'}
              onChange={event => void updateDecision(event.target.value as Tracking['decision'])}
            >
              <option value="review">{en ? 'To review' : 'Por revisar'}</option>
              <option value="participate">{en ? 'Participate' : 'Participar'}</option>
              <option value="discarded">{en ? 'Discarded' : 'Descartada'}</option>
            </select>
            <select
              aria-label={en ? 'Work stage' : 'Etapa de trabajo'}
              value={stage.stage}
              onChange={event => void onStageChange(event.target.value as Stage)}
            >
              {STAGE_LIST.map((value, idx) => (
                <option key={value} value={value}>
                  {STAGE_NAMES[language][idx]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="web-autopilot-kpi">
          <span>{en ? 'Requirements' : 'Requisitos'}</span>
          <strong>
            {requirements.length} {en ? 'total' : 'en matriz'}
          </strong>
          <small>
            {meetsCount} {en ? 'meet' : 'cumplen'} · {pendingReqCount} {en ? 'pending' : 'pend.'}
          </small>
        </div>

        <div className="web-autopilot-kpi">
          <span>{en ? 'Checklist' : 'Tareas'}</span>
          <strong>
            {completedTasks}/{tasks.length}
          </strong>
          <small>{en ? 'completed' : 'completadas'}</small>
        </div>

        <div className="web-autopilot-kpi">
          <span>{en ? 'Offer package' : 'Paquete y cierre'}</span>
          <strong>
            {packageCount} {en ? 'in package' : 'en paquete'}
          </strong>
          <small>
            {submissionCount > 0
              ? `${submissionCount} ${en ? 'filing(s)' : 'radicado(s)'}`
              : openRequestCount > 0
                ? `${openRequestCount} ${en ? 'open req.' : 'solicitud(es)'}`
                : officialDeadline
                  ? `${en ? 'Closes' : 'Cierre'} ${officialDeadline.slice(0, 10)}`
                  : en
                    ? 'No filing yet'
                    : 'Sin radicado'}
          </small>
        </div>
      </div>

      <section className="web-review-autopilot-card">
        <div className="web-autopilot-card-header">
          <div className="web-autopilot-card-title">
            <span className="web-draft-step-number">1</span>
            <div>
              <h2>{en ? 'Analyze tenders & extract requirements' : 'Analizar pliegos y extraer requisitos'}</h2>
              <p className="web-review-hint">
                {en
                  ? 'Identifies legal, financial, technical, and experience requirements with exact tender quotes and optional RUP matching.'
                  : 'Extrae automáticamente requisitos jurídicos, financieros, técnicos y de experiencia con citas exactas del pliego.'}
              </p>
            </div>
          </div>
          <span className="web-review-status-pill" data-state={targetFileIds.length ? 'succeeded' : 'pending'}>
            {targetFileIds.length} {en ? 'tender doc(s)' : 'documento(s)'}
          </span>
        </div>

        <label className="web-consent">
          <input
            type="checkbox"
            checked={includeRup}
            disabled={suggestBusy || Boolean(activeSuggestionJob)}
            onChange={event => setIncludeRup(event.target.checked)}
          />
          {en
            ? `Cross-check with reviewed RUP / ROLECE data${hasRupFacts ? ' (detected)' : ' (none loaded yet)'}`
            : `Cruzar con datos revisados de RUP / ROLECE${hasRupFacts ? ' (detectado)' : ' (sin RUP cargado aún)'}`}
        </label>

        <div className="web-inline">
          <Button
            icon={ScanText}
            disabled={suggestBusy || !targetFileIds.length || !credentialId || Boolean(activeSuggestionJob)}
            onClick={() => void queueAnalysis()}
          >
            {activeSuggestionJob
              ? en
                ? 'Analyzing tenders…'
                : 'Analizando pliegos…'
              : latestSuggestionJob?.state === 'succeeded'
                ? en
                  ? 'Re-analyze tenders'
                  : 'Volver a analizar pliegos'
                : en
                  ? 'Extract tender requirements'
                  : 'Analizar pliegos con piloto automático'}
          </Button>
          {activeSuggestionJob && (
            <Button icon={Square} size="sm" variant="outline" disabled={suggestBusy} onClick={() => void cancelAnalysis(activeSuggestionJob.id)}>
              {en ? 'Cancel analysis' : 'Cancelar análisis'}
            </Button>
          )}
        </div>

        {activeSuggestionJob && (
          <div className="web-autopilot-progress-panel" role="status">
            <div className="web-inline">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              <span>{en ? 'Reading tender documents on the local runner…' : 'Leyendo documentos del pliego en el runner local…'}</span>
            </div>
            <WebJobProgress state={activeSuggestionJob.state} progress={activeSuggestionJob.progress} language={language} />
          </div>
        )}

        {latestSuggestionJob && !activeSuggestionJob && latestSuggestionJob.state !== 'succeeded' && latestSuggestionJob.result?.message && (
          <p className="web-review-hint" role="alert">
            {latestSuggestionJob.result.message}
          </p>
        )}

        {latestReadySuggestionJob && suggestions.length > 0 && (
          <div className="web-stack">
            <div className="web-autopilot-card-header">
              <strong>
                {en
                  ? `${suggestions.length} requirements suggested (${pendingSuggestionsCount} pending)`
                  : `${suggestions.length} requisitos sugeridos (${pendingSuggestionsCount} por agregar)`}
              </strong>
              {pendingSuggestionsCount > 0 && (
                <div className="web-inline">
                  <Button
                    icon={Sparkles}
                    size="sm"
                    disabled={acceptingBatch || !selectedSuggestionIds.length}
                    onClick={() => void acceptSelectedSuggestions()}
                  >
                    {acceptingBatch && acceptProgress
                      ? en
                        ? `Adding ${acceptProgress.done}/${acceptProgress.total}…`
                        : `Agregando ${acceptProgress.done}/${acceptProgress.total}…`
                      : en
                        ? `Add ${selectedSuggestionIds.length} selected to matrix`
                        : `Agregar ${selectedSuggestionIds.length} seleccionados a la matriz`}
                  </Button>
                </div>
              )}
            </div>

            <div className="web-autopilot-list">
              {suggestions.map(item => {
                const accepted = acceptedSuggestionIds.has(item.id);
                const checked = accepted || selectedSuggestionIds.includes(item.id);
                const sourceName = latestReadySuggestionJob.result?.sources?.find(s => s.id === item.sourceId)?.name || item.sourceId;
                return (
                  <div key={item.id} className="web-autopilot-item-row">
                    <Checkbox
                      checked={checked}
                      disabled={accepted || acceptingBatch}
                      aria-label={item.title}
                      onCheckedChange={value =>
                        setSelectedSuggestionIds(current =>
                          value === true ? [...new Set([...current, item.id])] : current.filter(id => id !== item.id),
                        )
                      }
                    />
                    <div className="web-autopilot-item-body">
                      <div className="web-inline">
                        <strong>{item.title}</strong>
                        <span className="web-review-status-pill">{CATEGORY_LABELS[item.category]?.[language] || item.category}</span>
                        {accepted && (
                          <span className="web-review-status-pill" data-state="succeeded">
                            <CheckCircle2 size={12} aria-hidden="true" />
                            {en ? 'In matrix' : 'En matriz'}
                          </span>
                        )}
                      </div>
                      <small className="web-review-hint">
                        {sourceName} · «{item.quote.length > 220 ? `${item.quote.slice(0, 220)}…` : item.quote}»
                      </small>
                      {!!item.factIds?.length && (
                        <small className="web-review-hint">
                          {en ? 'RUP matches:' : 'Coincidencias RUP:'}{' '}
                          {item.factIds
                            .map(id => {
                              const fact = latestReadySuggestionJob.result?.facts?.find(f => f.id === id);
                              return fact ? `${fact.label} (${fact.value})` : id;
                            })
                            .join(', ')}
                        </small>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="web-review-autopilot-card">
        <div className="web-autopilot-card-header">
          <div className="web-autopilot-card-title">
            <span className="web-draft-step-number">2</span>
            <div>
              <h2>{en ? 'Recommended checklist & offer package' : 'Checklist automático y paquete de oferta'}</h2>
              <p className="web-review-hint">
                {en
                  ? 'Generate key preparation tasks anchored to the tender deadline and assemble the offer package with one click.'
                  : 'Genera tareas clave con fechas calculadas frente al cierre y prepara el paquete con tus documentos.'}
              </p>
            </div>
          </div>
        </div>

        <div className="web-inline">
          <Button icon={ListChecks} size="sm" variant="outline" disabled={checklistBusy} onClick={() => void generateRecommendedChecklist()}>
            {en ? 'Generate recommended checklist' : 'Generar checklist recomendado'}
          </Button>
          <Button
            icon={PackagePlus}
            size="sm"
            variant="outline"
            disabled={packageBusy || !availableFiles.length}
            onClick={() => void populateOfferPackage()}
          >
            {en ? 'Propose package from offer files' : 'Proponer paquete con documentos del proyecto'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpenAdvanced('submit')}>
            {en ? 'Record filing' : 'Registrar presentación'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpenAdvanced('after')}>
            {en ? 'Follow up' : 'Dar seguimiento'}
          </Button>
        </div>

        {tasks.length > 0 && (
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
                <Button icon={Trash2} iconOnly size="sm" variant="ghost" onClick={() => void onTaskDeleted(task)}>
                  {en ? `Remove ${task.title}` : `Eliminar ${task.title}`}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={event => void addQuickTask(event)} className="web-autopilot-quick-form">
          <Input
            aria-label={en ? 'Quick task' : 'Nueva tarea rápida'}
            placeholder={en ? 'Add custom task…' : 'Agregar tarea rápida…'}
            maxLength={300}
            value={quickTaskTitle}
            disabled={quickTaskBusy}
            onChange={event => setQuickTaskTitle(event.target.value)}
          />
          <Button icon={Plus} type="submit" size="sm" variant="outline" disabled={quickTaskBusy || !quickTaskTitle.trim()}>
            {en ? 'Add' : 'Agregar'}
          </Button>
        </form>
      </section>

      <section className="web-review-autopilot-card">
        <div className="web-autopilot-card-header">
          <div className="web-autopilot-card-title">
            <span className="web-draft-step-number">3</span>
            <div>
              <h2>{en ? 'Requirements compliance matrix' : 'Matriz rápida de requisitos'}</h2>
              <p className="web-review-hint">
                {en
                  ? 'Mark compliance status quickly or export to Excel/CSV. Use Advanced view to attach files or run manual RUP comparisons.'
                  : 'Marca el estado de cumplimiento rápidamente o exporta la matriz a Excel/CSV.'}
              </p>
            </div>
          </div>
          <div className="web-inline">
            <Button icon={FileDown} size="sm" variant="outline" disabled={!requirements.length} onClick={() => void onExportRequirements('csv')}>
              {en ? 'CSV' : 'CSV'}
            </Button>
            <Button icon={FileSpreadsheet} size="sm" variant="outline" disabled={!requirements.length} onClick={() => void onExportRequirements('xlsx')}>
              {en ? 'Excel' : 'Excel'}
            </Button>
            <Button icon={CheckSquare} size="sm" variant="outline" onClick={() => onOpenAdvanced('prepare')}>
              {en ? 'Supports & RUP detail' : 'Soportes y RUP en vista avanzada'}
            </Button>
          </div>
        </div>

        <div className="web-autopilot-terms-row" role="group" aria-label={en ? 'Filter requirements' : 'Filtrar requisitos'}>
          {CATEGORY_ORDER.map(cat => (
            <button
              key={cat}
              type="button"
              className={`web-autopilot-term-chip${categoryFilter === cat ? ' is-selected' : ''}`}
              onClick={() => setCategoryFilter(cat)}
            >
              {CATEGORY_LABELS[cat][language]}
            </button>
          ))}
        </div>

        {filteredRequirements.length ? (
          <div className="web-autopilot-list">
            {filteredRequirements.map(item => (
              <div key={item.id} className="web-autopilot-item-row">
                <div className="web-autopilot-item-body">
                  <div className="web-inline">
                    <strong>{item.title}</strong>
                    <span className="web-review-status-pill">{CATEGORY_LABELS[item.category]?.[language] || item.category}</span>
                  </div>
                  {item.source && (
                    <small className="web-review-hint">
                      {item.source.length > 180 ? `${item.source.slice(0, 180)}…` : item.source}
                    </small>
                  )}
                </div>
                <select
                  aria-label={en ? `Compliance for ${item.title}` : `Valoración de ${item.title}`}
                  value={item.status}
                  onChange={event => void onRequirementStatusChange(item, event.target.value)}
                >
                  {STATUS_LIST.map(st => (
                    <option key={st} value={st}>
                      {STATUS_LABELS[st][language]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        ) : (
          <p className="web-review-hint">
            {requirements.length
              ? en
                ? 'No requirements in this category.'
                : 'No hay requisitos en esta categoría.'
              : en
                ? 'Run step 1 above to extract requirements from the tender documents.'
                : 'Ejecuta el paso 1 arriba para extraer los requisitos del pliego automáticamente.'}
          </p>
        )}
      </section>
    </div>
  );
}
