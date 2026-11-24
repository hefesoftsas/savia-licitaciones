import { Check, ChevronDown, Download, FileSpreadsheet, FileText, History, Loader2, Pencil, Send, Sparkles, Square, Wrench } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { SelectField } from '@/shared/ui/SelectField';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import { formatActivityEventLabel, type JobActivityEvent } from './autopilot-state.mjs';
import { WebJobProgress } from './WebJobProgress';
import WebRequirementSupports from './WebRequirementSupports';
import WebWordDocument from './WebWordDocument';

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
  createdAt?: string;
  updatedAt?: string;
  payload?: {
    bidDocument?: string;
    proposalId?: string;
    targetExportJobId?: string | null;
    fileIds?: string[];
    tenderFileIds?: string[];
    bidFileIds?: string[];
    workflowRequirements?: Array<{ title: string; status?: string }>;
  };
  result?: {
    message?: string;
    summary?: string;
    agentSummary?: string;
    wordRevision?: number | null;
    textEditCount?: number;
    programmaticFixCount?: number;
    appliedEdits?: Array<{ target: string; op: string; find?: string; replace?: string }>;
    skippedSuggestions?: Array<{ category?: string; title?: string; reason: string }>;
    resolvedRequirements?: Array<{ title: string; evidence?: string }>;
  } | null;
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

function formatFixActivityLabel(event: JobActivityEvent, language: Language): string {
  const details = event?.details || {};
  if (event.code === 'agent.console' && typeof details.text === 'string' && details.text.trim()) {
    try {
      const parsed = JSON.parse(details.text) as { event?: string; text?: string };
      if (parsed?.event === 'proposal.fix' && typeof parsed.text === 'string' && parsed.text.trim()) {
        return parsed.text.trim();
      }
      if (!/^(assistant\.|process\.|tool\.)/.test(String(parsed?.event || details.event || ''))) {
        return '';
      }
    } catch {
      // Fall back to shared activity label below.
    }
  }
  return formatActivityEventLabel(event, language);
}

function normalizeRequirementTitle(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.:;]+$/, '')
    .toLowerCase();
}

const EXTERNAL_SUPPORT_PATTERN =
  /garantia|fianza|seguro|poliza|habilitacion|titulo habilitante|solvencia|certificado|acreditacion|escritura|rup|rolece|insurance|bond|certificate|license|accreditation/i;

function describeUnresolvedRequirement(
  item: Requirement,
  skippedSuggestions: Array<{ category?: string; title?: string; reason: string }>,
  language: Language,
): { canAiFix: boolean; reason: string } {
  const en = language === 'en';
  const targetKey = normalizeRequirementTitle(item.title);
  const matchingSkip = skippedSuggestions.find(skip => {
    const skipTitleKey = skip.title ? normalizeRequirementTitle(skip.title) : '';
    if (skipTitleKey && skipTitleKey === targetKey) return true;
    const rawReason = String(skip.reason || '').trim();
    if (!rawReason) return false;
    const colonIdx = rawReason.indexOf(':');
    if (colonIdx > 0 && normalizeRequirementTitle(rawReason.slice(0, colonIdx)) === targetKey) {
      return true;
    }
    const normReason = normalizeRequirementTitle(rawReason);
    return (
      normReason === targetKey ||
      normReason.startsWith(`${targetKey} `) ||
      normReason.startsWith(`${targetKey}-`)
    );
  });

  if (matchingSkip) {
    const rawReason = String(matchingSkip.reason || '').trim();
    const colonIdx = rawReason.indexOf(':');
    let cleanReason = rawReason;
    if (colonIdx > 0 && normalizeRequirementTitle(rawReason.slice(0, colonIdx)) === targetKey) {
      cleanReason = rawReason.slice(colonIdx + 1).trim();
      if (cleanReason) cleanReason = cleanReason.charAt(0).toUpperCase() + cleanReason.slice(1);
    }
    return {
      canAiFix: false,
      reason:
        cleanReason ||
        (en
          ? 'Requires external supporting documentation that AI cannot invent.'
          : 'Requiere aportar documentación o acreditación externa que la IA no puede inventar.'),
    };
  }

  const normalizedCombined = `${normalizeRequirementTitle(item.title)} ${normalizeRequirementTitle(item.source)}`;
  const requiresExternalSupport =
    ['legal', 'financial', 'experience'].includes(item.category) ||
    EXTERNAL_SUPPORT_PATTERN.test(normalizedCombined);

  if (requiresExternalSupport) {
    return {
      canAiFix: false,
      reason:
        item.evidence.trim() ||
        (en
          ? 'Requires external supporting documentation that AI cannot invent.'
          : 'Requiere aportar documentación o acreditación externa que la IA no puede inventar.'),
    };
  }

  return {
    canAiFix: true,
    reason:
      item.evidence.trim() ||
      (en
        ? 'Not yet explicitly reflected in the draft proposal; the runner can add or clarify it.'
        : 'Aún no figura de forma explícita en el borrador; el runner puede redactarlo o aclararlo.'),
  };
}

function formatRevisionTimestamp(iso: string | undefined, language: Language): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString(language === 'en' ? 'en-US' : 'es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

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
  onRequirementUpdated: (item: Requirement) => void;
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
    onRequirementUpdated,
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
  const [fixActivity, setFixActivity] = useState<JobActivityEvent[]>([]);
  const [resolvingReqId, setResolvingReqId] = useState<string | null>(null);
  const [resolveEvidence, setResolveEvidence] = useState('');
  const [savingReqId, setSavingReqId] = useState<string | null>(null);

  const noopDirty = useCallback(() => undefined, []);

  const mountedRef = useRef(true);
  const autoImportEvalJobIdRef = useRef<string | null>(null);
  const importedEvalJobIdsRef = useRef<Set<string>>(new Set());
  const pendingFixJobIdRef = useRef<string | null>(null);
  const notifiedFixJobIdsRef = useRef<Set<string>>(new Set());

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

  const activeFixJob = useMemo(() => {
    if (!draftId) return null;
    return (
      projectJobs.find(
        job =>
          job.kind === 'proposal-review.apply-suggestions' &&
          ['queued', 'running'].includes(job.state) &&
          (job.payload?.proposalId === draftId || job.payload?.fileIds?.includes(draftId)),
      ) || null
    );
  }, [projectJobs, draftId]);

  const latestFixJob = useMemo(() => {
    if (!draftId) return null;
    return (
      projectJobs.find(
        job =>
          job.kind === 'proposal-review.apply-suggestions' &&
          (job.payload?.proposalId === draftId || job.payload?.fileIds?.includes(draftId)),
      ) || null
    );
  }, [projectJobs, draftId]);

  const latestSucceededFixJob = useMemo(() => {
    if (!draftId) return null;
    return (
      projectJobs.find(
        job =>
          job.kind === 'proposal-review.apply-suggestions' &&
          job.state === 'succeeded' &&
          (job.payload?.proposalId === draftId || job.payload?.fileIds?.includes(draftId)),
      ) || null
    );
  }, [projectJobs, draftId]);

  const revisionJobs = useMemo(() => {
    if (!draftId) return [];
    return projectJobs
      .filter(
        job =>
          job.kind === 'proposal-review.apply-suggestions' &&
          job.state === 'succeeded' &&
          job.artifactState === 'stored' &&
          (job.payload?.proposalId === draftId || job.payload?.fileIds?.includes(draftId)),
      )
      .sort((a, b) => {
        const revDiff = (b.result?.wordRevision ?? 0) - (a.result?.wordRevision ?? 0);
        if (revDiff !== 0) return revDiff;
        const aTime = Date.parse(a.updatedAt || a.createdAt || '') || 0;
        const bTime = Date.parse(b.updatedAt || b.createdAt || '') || 0;
        return bTime - aTime;
      });
  }, [projectJobs, draftId]);

  const reviewJobIdsForDraft = useMemo(() => {
    if (!draftId) return [];
    const kinds = ['bid-evaluation.analyze', 'rejection-check.analyze', 'blind-check.inspect', 'duplicate-check.analyze'];
    const ids: string[] = [];
    for (const kind of kinds) {
      const match = projectJobs.find(
        job =>
          job.kind === kind &&
          job.state === 'succeeded' &&
          job.artifactState === 'stored' &&
          (job.payload?.bidFileIds?.includes(draftId) || job.payload?.fileIds?.includes(draftId)),
      );
      if (match) ids.push(match.id);
    }
    return ids;
  }, [projectJobs, draftId]);

  useEffect(() => {
    if (activeEvalJob?.id) {
      autoImportEvalJobIdRef.current = activeEvalJob.id;
    }
  }, [activeEvalJob?.id]);

  useEffect(() => {
    if (activeFixJob?.id) {
      pendingFixJobIdRef.current = activeFixJob.id;
    }
  }, [activeFixJob?.id]);

  const applyResolvedRequirements = useCallback(
    async (resolvedList: Array<{ title: string; evidence?: string }>) => {
      if (!resolvedList.length || !requirements.length) return 0;
      const byTitle = new Map<string, Requirement>(
        requirements.map(item => [normalizeRequirementTitle(item.title), item]),
      );
      let updated = 0;
      for (const entry of resolvedList) {
        const key = normalizeRequirementTitle(entry?.title || '');
        if (!key) continue;
        const existing = byTitle.get(key);
        if (!existing) continue;
        const rawEvidence = String(entry.evidence || '').trim();
        const nextEvidence =
          rawEvidence.length > 280
            ? `${rawEvidence.slice(0, 279)}…`
            : rawEvidence || existing.evidence;
        if (existing.status === 'meets' && existing.evidence === nextEvidence) continue;
        try {
          const res = await request<{ item: Requirement }>(
            `/api/projects/${encodeURIComponent(projectId)}/workflow/requirements/${encodeURIComponent(existing.id)}`,
            {
              method: 'PATCH',
              json: {
                title: existing.title,
                source: existing.source,
                evidence: nextEvidence,
                status: 'meets',
                category: existing.category,
                version: existing.version,
              },
            },
          );
          if (mountedRef.current) {
            onRequirementUpdated(res.item);
          }
          byTitle.set(key, res.item);
          updated += 1;
        } catch {
          // Ignore stale version or transient update errors per item.
        }
      }
      return updated;
    },
    [projectId, requirements, onRequirementUpdated],
  );

  useEffect(() => {
    if (
      !latestFixJob ||
      !generatedTechnicalJob ||
      latestFixJob.state !== 'succeeded' ||
      pendingFixJobIdRef.current !== latestFixJob.id ||
      notifiedFixJobIdsRef.current.has(latestFixJob.id)
    ) {
      return;
    }
    notifiedFixJobIdsRef.current.add(latestFixJob.id);
    pendingFixJobIdRef.current = null;
    window.dispatchEvent(
      new CustomEvent('savia:word-reviewed', {
        detail: { projectId, jobId: generatedTechnicalJob.id },
      }),
    );
    const resolved = latestFixJob.result?.resolvedRequirements || [];
    if (resolved.length > 0) {
      void applyResolvedRequirements(resolved);
    }
    showToast(
      latestFixJob.result?.summary ||
        (en ? 'Proposal updated by the runner.' : 'Propuesta actualizada por el runner.'),
      'success',
    );
  }, [latestFixJob, generatedTechnicalJob, projectId, applyResolvedRequirements, showToast, en]);

  useEffect(() => {
    if (!activeEvalJob && !activeFixJob) return;
    const timer = window.setInterval(() => {
      void loadJobs().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeEvalJob?.id, activeFixJob?.id, loadJobs]);

  useEffect(() => {
    if (!activeFixJob) {
      setFixActivity([]);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    const loadActivity = async () => {
      try {
        const snapshot = await request<{ events?: JobActivityEvent[] }>(
          `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(activeFixJob.id)}/activity`,
          { signal: controller.signal },
        );
        if (alive && !controller.signal.aborted) {
          setFixActivity(Array.isArray(snapshot.events) ? snapshot.events : []);
        }
      } catch {
        // Retry on the next interval.
      }
    };
    void loadActivity();
    const timer = window.setInterval(() => void loadActivity(), 2500);
    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [projectId, activeFixJob?.id]);

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

        const existingByTitle = new Map<string, Requirement>(
          requirements.map(item => [normalizeRequirementTitle(item.title), item]),
        );
        let added = 0;
        let updated = 0;

        for (const criterion of criteria) {
          const title = String(criterion.name || '').trim().slice(0, 300);
          if (!title) continue;
          const key = normalizeRequirementTitle(title);
          const source = String(criterion.tenderQuote || '').trim().slice(0, 20000);
          const rawEvidence = String(criterion.bidQuote || criterion.explanation || '').trim();
          const evidence = rawEvidence.length > 280 ? `${rawEvidence.slice(0, 279)}…` : rawEvidence;
          const status = inferCriterionStatus(criterion);
          const category = inferRequirementCategory(title, source);
          const existing = existingByTitle.get(key);
          try {
            if (existing) {
              if (existing.status === status && existing.evidence === evidence) continue;
              const res = await request<{ item: Requirement }>(
                `/api/projects/${encodeURIComponent(projectId)}/workflow/requirements/${encodeURIComponent(existing.id)}`,
                {
                  method: 'PATCH',
                  json: {
                    title: existing.title,
                    source: existing.source,
                    evidence,
                    status,
                    category: existing.category,
                    version: existing.version,
                  },
                },
              );
              onRequirementUpdated(res.item);
              existingByTitle.set(key, res.item);
              updated += 1;
            } else {
              const res = await request<{ item: Requirement }>(`/api/projects/${encodeURIComponent(projectId)}/workflow/requirements`, {
                method: 'POST',
                json: { title, category, source, evidence, status },
              });
              onRequirementAccepted(res.item);
              existingByTitle.set(key, res.item);
              added += 1;
            }
          } catch {
            // Skip duplicate or oversized entries safely.
          }
        }

        if (added > 0 || updated > 0) {
          const changed = added + updated;
          showToast(
            en
              ? `${changed} requirement(s) verified and updated against your proposal.`
              : `${changed} requisito(s) comprobado(s) y actualizado(s) frente a tu propuesta.`,
            'success',
          );
        }
        return added + updated;
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
    [syncingEvaluation, projectId, requirements, onRequirementAccepted, onRequirementUpdated, showToast, en],
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

  const cancelActiveJob = async () => {
    const activeJob = activeEvalJob || activeFixJob;
    if (!activeJob) return;
    try {
      await request(`/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(activeJob.id)}/cancel`, {
        method: 'POST',
      });
      await loadJobs();
      showToast(en ? 'Task cancelled.' : 'Tarea cancelada.', 'info');
    } catch {
      showToast(en ? 'Could not cancel task.' : 'No se pudo cancelar la tarea.', 'error');
    }
  };

  const fixProblemsWithRunner = async (targetRequirements?: Requirement[]) => {
    if (autopilotBusy || activeEvalJob || activeFixJob || syncingEvaluation || !draftId || !credentialId) return;
    const isTargeted = Array.isArray(targetRequirements) && targetRequirements.length > 0;
    const sourceRequirements = isTargeted ? targetRequirements : requirements.filter(req => req.status !== 'meets');
    const unresolvedRequirements = sourceRequirements
      .slice(0, 40)
      .map(req => ({
        title: req.title.trim().slice(0, 300),
        source: String(req.source || '').trim().slice(0, 600),
        evidence: String(req.evidence || '').trim().slice(0, 300),
        status: req.status,
      }))
      .filter(req => req.title.length > 0);
    const targetedReviewIds = isTargeted ? [] : reviewJobIdsForDraft;
    if (!unresolvedRequirements.length && !targetedReviewIds.length) return;

    setAutopilotBusy(true);
    setAutopilotPhase(
      en ? 'Sending fixes to the local runner…' : 'Enviando correcciones al runner local…',
    );
    try {
      const created = await request<{ job?: ProjectJob }>(`/api/projects/${encodeURIComponent(projectId)}/jobs`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        json: {
          kind: 'proposal-review.apply-suggestions',
          credentialId,
          payload: {
            proposalId: draftId,
            reviewJobIds: targetedReviewIds,
            ...(unresolvedRequirements.length ? { workflowRequirements: unresolvedRequirements } : {}),
            language,
            dataProcessingConsent: true,
          },
        },
      });
      if (created.job?.id) {
        pendingFixJobIdRef.current = created.job.id;
      }
      if (isTargeted) {
        setResolvingReqId(null);
      }
      await loadJobs();
      showToast(
        en ? 'Fixes queued for the local runner.' : 'Correcciones enviadas al runner local.',
        'success',
      );
    } catch {
      showToast(
        en ? 'Could not start automatic fixes.' : 'No se pudo iniciar la corrección automática.',
        'error',
      );
    } finally {
      if (mountedRef.current) {
        setAutopilotBusy(false);
        setAutopilotPhase('');
      }
    }
  };

  const openRequirementResolver = (item: Requirement) => {
    if (resolvingReqId === item.id) {
      setResolvingReqId(null);
      return;
    }
    setResolvingReqId(item.id);
    setResolveEvidence(item.evidence || '');
  };

  const saveRequirementResolution = async (item: Requirement, nextStatus: string) => {
    if (savingReqId) return;
    setSavingReqId(item.id);
    try {
      const trimmedEvidence = resolveEvidence.trim().slice(0, 300);
      const res = await request<{ item: Requirement }>(
        `/api/projects/${encodeURIComponent(projectId)}/workflow/requirements/${encodeURIComponent(item.id)}`,
        {
          method: 'PATCH',
          json: {
            title: item.title,
            source: item.source,
            evidence: trimmedEvidence,
            status: nextStatus,
            category: item.category,
            version: item.version,
          },
        },
      );
      if (mountedRef.current) {
        onRequirementUpdated(res.item);
        if (nextStatus === 'meets') {
          setResolvingReqId(null);
        } else {
          setResolveEvidence(res.item.evidence || '');
        }
      }
      showToast(
        nextStatus === 'meets'
          ? en
            ? 'Requirement marked as met.'
            : 'Requisito guardado como cumplido.'
          : en
            ? 'Supporting note saved.'
            : 'Nota de soporte guardada.',
        'success',
      );
    } catch (error) {
      const conflict = (error as { status?: number }).status === 409;
      showToast(
        conflict
          ? en
            ? 'The requirement changed elsewhere. Reload the page and retry.'
            : 'El requisito cambió en otra sesión. Recarga la página e inténtalo de nuevo.'
          : en
            ? 'Could not save requirement update.'
            : 'No se pudo guardar la actualización del requisito.',
        'error',
      );
    } finally {
      if (mountedRef.current) {
        setSavingReqId(null);
      }
    }
  };

  const runningJob = activeEvalJob || activeFixJob;
  const isWorking = autopilotBusy || Boolean(runningJob) || syncingEvaluation;
  const completedTasks = tasks.filter(t => t.completed).length;
  const meetsCount = requirements.filter(r => r.status === 'meets').length;
  const pendingReqCount = requirements.filter(r => r.status === 'pending').length;
  const unresolvedReqCount = requirements.length - meetsCount;

  const fixQueuedTitles = activeFixJob?.payload?.workflowRequirements?.map(item => item.title).filter(Boolean) || [];
  const fixLogLines = useMemo(() => {
    const lines: string[] = [];
    for (const event of fixActivity) {
      const label = formatFixActivityLabel(event, language);
      if (!label || lines[lines.length - 1] === label) continue;
      lines.push(label);
    }
    return lines.slice(-15);
  }, [fixActivity, language]);

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
        ? autopilotPhase ||
          (activeFixJob
            ? en
              ? 'Applying fixes to your proposal in the local runner…'
              : 'Arreglando problemas detectados en tu propuesta desde el runner local…'
            : en
              ? 'Verifying tender requirements against your proposal…'
              : 'Verificando requisitos del pliego frente a tu propuesta…')
        : requirements.length === 0
          ? en
            ? 'Your Word proposal is ready. Run autopilot to verify compliance and prepare the delivery checklist.'
            : 'Tu borrador en Word está listo. Ejecuta el piloto automático para comprobar requisitos y armar el checklist.'
          : en
            ? 'Proposal checked and checklist ready. Review any pending items below or record your filing.'
            : 'Propuesta comprobada y checklist listo. Revisa los detalles abajo o registra la presentación.';

  const techRev =
    generatedTechnicalJob?.wordRevision && generatedTechnicalJob.wordRevision > 0 ? ` (rev. ${generatedTechnicalJob.wordRevision})` : '';
  const latestDraftUrl = generatedTechnicalJob
    ? `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(generatedTechnicalJob.id)}/artifact`
    : '';
  const latestDraftName = `propuesta-tecnica${generatedTechnicalJob?.wordRevision ? `-rev-${generatedTechnicalJob.wordRevision}` : ''}.docx`;

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
                  {runningJob && (
                    <Button icon={Square} size="sm" variant="outline" onClick={() => void cancelActiveJob()}>
                      {en ? 'Cancel' : 'Cancelar'}
                    </Button>
                  )}
                </div>
                {runningJob && (
                  <WebJobProgress state={runningJob.state} progress={runningJob.progress} language={language} />
                )}
                {activeFixJob && fixQueuedTitles.length > 0 && (
                  <p className="web-review-hint">
                    {en
                      ? `Targeting ${fixQueuedTitles.length} requirement(s): ${fixQueuedTitles.slice(0, 4).join(' · ')}${fixQueuedTitles.length > 4 ? ` (+${fixQueuedTitles.length - 4} more)` : ''}`
                      : `Revisando ${fixQueuedTitles.length} requisito(s): ${fixQueuedTitles.slice(0, 4).join(' · ')}${fixQueuedTitles.length > 4 ? ` (+${fixQueuedTitles.length - 4} más)` : ''}`}
                  </p>
                )}
                {activeFixJob && fixLogLines.length > 0 && (
                  <ul className="web-workflow-fix-log" aria-live="polite" aria-label={en ? 'Runner fix activity' : 'Actividad de corrección del runner'}>
                    {fixLogLines.map((line, index) => (
                      <li key={`${index}-${line}`}>{line}</li>
                    ))}
                  </ul>
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

            {(latestFixJob && !isWorking && ['failed', 'interrupted'].includes(latestFixJob.state)) ? (
              <p className="web-review-hint" role="alert">
                {latestFixJob.result?.message ||
                  (latestFixJob.state === 'interrupted'
                    ? en
                      ? 'The previous runner fix was interrupted before completing.'
                      : 'La última corrección del runner se interrumpió antes de terminar.'
                    : en
                      ? 'Could not complete the runner fix.'
                      : 'No se pudo completar la corrección del runner.')}
              </p>
            ) : latestEvalAttempt && !isWorking && latestEvalAttempt.state !== 'succeeded' && latestEvalAttempt.result?.message && (
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
                <div className="web-workflow-summary-actions">
                  <WebWordDocument
                    language={language}
                    url={latestDraftUrl}
                    name={latestDraftName}
                    label={en ? 'View' : 'Ver'}
                  />
                  <a className="web-link" href={latestDraftUrl} download={latestDraftName}>
                    <Download size={14} aria-hidden="true" />
                    {en ? 'Download' : 'Descargar'}
                  </a>
                </div>
              </div>

              {revisionJobs.length > 0 && (
                <details className="web-workflow-summary-details web-workflow-revisions-details">
                  <summary>
                    <span className="web-workflow-summary-label">
                      <History size={15} aria-hidden="true" />
                      <span>{en ? 'Revision history' : 'Historial de revisiones'}</span>
                    </span>
                    <span className="web-workflow-summary-meta">
                      <small>
                        {revisionJobs.length}{' '}
                        {en
                          ? revisionJobs.length === 1
                            ? 'revision'
                            : 'revisions'
                          : revisionJobs.length === 1
                            ? 'revisión'
                            : 'revisiones'}
                      </small>
                      <ChevronDown size={15} className="web-workflow-summary-chevron" aria-hidden="true" />
                    </span>
                  </summary>
                  <div className="web-workflow-summary-body">
                    <div className="web-workflow-revisions-list">
                      {revisionJobs.map((revJob, index) => {
                        const revNumber = revJob.result?.wordRevision ?? revisionJobs.length - index;
                        const isCurrent =
                          generatedTechnicalJob.wordRevision != null
                            ? revNumber === generatedTechnicalJob.wordRevision
                            : index === 0;
                        const revUrl = `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(revJob.id)}/artifact`;
                        const revName = `propuesta-rev-${revNumber}.docx`;
                        const revTimestamp = formatRevisionTimestamp(revJob.updatedAt || revJob.createdAt, language);
                        return (
                          <div key={revJob.id} className="web-workflow-revision-row">
                            <div className="web-workflow-revision-info">
                              <div className="web-workflow-revision-head">
                                <strong>{en ? `Revision ${revNumber}` : `Revisión ${revNumber}`}</strong>
                                {isCurrent && (
                                  <span className="web-workflow-req-badge is-ai">
                                    {en ? 'Current' : 'Actual'}
                                  </span>
                                )}
                                {revTimestamp && <small className="web-review-hint">{revTimestamp}</small>}
                              </div>
                              {revJob.result?.summary && (
                                <small className="web-review-hint">{revJob.result.summary}</small>
                              )}
                            </div>
                            <div className="web-workflow-revision-actions">
                              <WebWordDocument
                                language={language}
                                url={revUrl}
                                name={revName}
                                label={en ? 'View' : 'Ver'}
                              />
                              <a className="web-link" href={revUrl} download={revName}>
                                <Download size={14} aria-hidden="true" />
                                {en ? 'Download' : 'Descargar'}
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </details>
              )}

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
                        {(unresolvedReqCount > 0 || reviewJobIdsForDraft.length > 0) && (
                          <Button
                            icon={Wrench}
                            size="sm"
                            disabled={isWorking || !credentialId}
                            onClick={() => void fixProblemsWithRunner()}
                          >
                            {activeFixJob
                              ? en
                                ? 'Fixing proposal…'
                                : 'Arreglando…'
                              : en
                                ? 'Fix with runner'
                                : 'Arreglar con el runner'}
                          </Button>
                        )}
                        <Button
                          icon={FileSpreadsheet}
                          size="sm"
                          variant="outline"
                          onClick={() => void onExportRequirements('xlsx')}
                        >
                          {en ? 'Export Excel' : 'Exportar Excel'}
                        </Button>
                      </div>
                      {latestSucceededFixJob?.result?.summary && (
                        <div className="web-workflow-fix-result" role="status">
                          <p className="web-review-hint">
                            <strong>{latestSucceededFixJob.result.summary}</strong>
                          </p>
                          {latestSucceededFixJob.result.agentSummary &&
                            latestSucceededFixJob.result.agentSummary !== latestSucceededFixJob.result.summary && (
                              <p className="web-review-hint">{latestSucceededFixJob.result.agentSummary}</p>
                            )}
                          {((latestSucceededFixJob.result.appliedEdits?.length || 0) > 0 ||
                            (latestSucceededFixJob.result.skippedSuggestions?.length || 0) > 0) && (
                            <details className="web-workflow-fix-details">
                              <summary>
                                <span>
                                  {en
                                    ? `See edits (${latestSucceededFixJob.result.appliedEdits?.length || 0}) and manual items (${latestSucceededFixJob.result.skippedSuggestions?.length || 0})`
                                    : `Ver cambios aplicados (${latestSucceededFixJob.result.appliedEdits?.length || 0}) y pendientes manuales (${latestSucceededFixJob.result.skippedSuggestions?.length || 0})`}
                                </span>
                                <ChevronDown size={14} className="web-workflow-summary-chevron" aria-hidden="true" />
                              </summary>
                              <ul className="web-workflow-fix-log">
                                {(latestSucceededFixJob.result.appliedEdits || []).map((edit, idx) => (
                                  <li key={`edit-${idx}-${edit.target}`}>
                                    <strong>{edit.target || (en ? 'Edit' : 'Párrafo')}:</strong>{' '}
                                    {edit.replace || edit.find || edit.op}
                                  </li>
                                ))}
                                {(latestSucceededFixJob.result.skippedSuggestions || []).map((skip, idx) => (
                                  <li key={`skip-${idx}`}>
                                    <strong>{en ? 'Manual review' : 'Manual'}:</strong> {skip.reason}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      )}
                      <div className="web-autopilot-list">
                        {requirements.map(item => {
                          const unresolvedInfo =
                            item.status === 'meets'
                              ? null
                              : describeUnresolvedRequirement(
                                  item,
                                  latestSucceededFixJob?.result?.skippedSuggestions || [],
                                  language,
                                );
                          const reasonPrefix =
                            item.status === 'does_not_meet'
                              ? en
                                ? 'Why it does not meet:'
                                : 'Por qué no cumple:'
                              : en
                                ? 'Why it is pending:'
                                : 'Por qué está pendiente:';
                          const isResolving = resolvingReqId === item.id && item.status !== 'meets';
                          return (
                            <div key={item.id} className="web-autopilot-item-row is-column">
                              <div className="web-autopilot-item-main">
                                <div className="web-autopilot-item-body">
                                  <div className="web-workflow-req-head">
                                    <strong>{item.title}</strong>
                                    {unresolvedInfo && (
                                      <span className={`web-workflow-req-badge ${unresolvedInfo.canAiFix ? 'is-ai' : 'is-manual'}`}>
                                        {unresolvedInfo.canAiFix
                                          ? en
                                            ? 'AI can fix'
                                            : 'Arreglable por IA'
                                          : en
                                            ? 'Manual support needed'
                                            : 'Requiere soporte manual'}
                                      </span>
                                    )}
                                  </div>
                                  {item.status === 'meets' && item.evidence && (
                                    <small className="web-review-hint">
                                      {en ? 'In your proposal:' : 'En tu propuesta:'} {item.evidence}
                                    </small>
                                  )}
                                  {unresolvedInfo && (
                                    <small className="web-review-hint">
                                      <strong>{reasonPrefix}</strong> {unresolvedInfo.reason}
                                    </small>
                                  )}
                                </div>
                                <div className="web-workflow-req-controls">
                                  {item.status !== 'meets' && (
                                    <>
                                      {unresolvedInfo?.canAiFix && (
                                        <Button
                                          icon={Wrench}
                                          size="sm"
                                          variant="outline"
                                          disabled={isWorking || !credentialId}
                                          onClick={() => void fixProblemsWithRunner([item])}
                                        >
                                          {en ? 'Fix with AI' : 'Arreglar con IA'}
                                        </Button>
                                      )}
                                      <Button
                                        icon={Pencil}
                                        size="sm"
                                        variant={isResolving ? 'secondary' : 'outline'}
                                        onClick={() => openRequirementResolver(item)}
                                      >
                                        {isResolving ? (en ? 'Close' : 'Cerrar') : en ? 'Resolve' : 'Resolver'}
                                      </Button>
                                    </>
                                  )}
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
                              </div>
                              {isResolving && (
                                <div className="web-workflow-req-resolver">
                                  <label className="web-workflow-req-resolver-field">
                                    <span>
                                      {en ? 'How it is met or supporting reference' : 'Cómo se cumple o soporte aportado'}
                                    </span>
                                    <Input
                                      value={resolveEvidence}
                                      maxLength={300}
                                      disabled={savingReqId === item.id}
                                      placeholder={
                                        en
                                          ? 'e.g. Policy #12345 attached in annexes'
                                          : 'Ej.: Póliza n.º 12345 vigente adjunta en anexos'
                                      }
                                      onChange={event => setResolveEvidence(event.target.value)}
                                    />
                                  </label>
                                  <WebRequirementSupports
                                    projectId={projectId}
                                    requirementId={item.id}
                                    language={language}
                                    onDirty={noopDirty}
                                  />
                                  <div className="web-inline">
                                    <Button
                                      icon={Check}
                                      size="sm"
                                      disabled={savingReqId === item.id}
                                      onClick={() => void saveRequirementResolution(item, 'meets')}
                                    >
                                      {savingReqId === item.id
                                        ? en
                                          ? 'Saving…'
                                          : 'Guardando…'
                                        : en
                                          ? 'Save & mark "Meets"'
                                          : 'Guardar y marcar «Cumple»'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={savingReqId === item.id || resolveEvidence.trim() === item.evidence.trim()}
                                      onClick={() => void saveRequirementResolution(item, item.status)}
                                    >
                                      {en ? 'Save note' : 'Guardar nota'}
                                    </Button>
                                    {!unresolvedInfo?.canAiFix && credentialId && (
                                      <Button
                                        icon={Wrench}
                                        size="sm"
                                        variant="ghost"
                                        disabled={isWorking}
                                        onClick={() => void fixProblemsWithRunner([item])}
                                      >
                                        {en ? 'Try with runner' : 'Intentar con el runner'}
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={savingReqId === item.id}
                                      onClick={() => setResolvingReqId(null)}
                                    >
                                      {en ? 'Cancel' : 'Cancelar'}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
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
