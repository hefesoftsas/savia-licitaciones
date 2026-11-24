import { CheckCircle2, ClipboardCheck, CopyCheck, EyeOff, FileSearch, FileText, Loader2, ShieldAlert, Upload, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { SelectField } from '@/shared/ui/SelectField';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import { uploadLargeProjectFile } from './project-multipart-upload.mjs';
import { WebReviewAutopilotViewer, type ActiveReviewResult, type ReviewResultKey } from './WebReviewAutopilotViewer';

export type ReviewFileItem = { id: string; name: string; deleting?: number | boolean };
export type ReviewJobItem = {
  id: string;
  kind: string;
  state: string;
  artifactState?: string;
  createdAt?: string;
  payload?: { fileIds?: string[]; tenderFileIds?: string[]; bidFileIds?: string[]; bidDocument?: string };
  result?: {
    criteria?: string;
    analysisStatus?: string;
    message?: string;
    updatedProposal?: boolean;
    wordRevision?: number | null;
    programmaticFixCount?: number;
    textEditCount?: number;
    summary?: string;
  } | null;
};

type CheckKey = 'rejection' | 'evaluation' | 'blind' | 'duplicates';
type PendingRejection = {
  extractJobId: string;
  proposalId: string;
  tenderIds: string[];
  custom: string;
};

const MAX_REVIEW_TENDERS = 49;

/**
 * Guided autopilot workspace for "Revisa tu oferta": detects the generated Word draft
 * (or lets the user upload / pick another proposal), auto-pairs the rest of the project's
 * tenders, and queues the chosen checks cleanly.
 */
export function WebReviewAutopilot({
  projectId,
  language,
  files,
  jobs,
  credentialId,
  onPrepareProposal,
  onOpenAdvanced,
  onRefreshJobs,
  onRefreshFiles,
}: {
  projectId: string;
  language: 'es' | 'en';
  files: ReviewFileItem[];
  jobs: ReviewJobItem[];
  credentialId: string;
  onPrepareProposal: () => void;
  onOpenAdvanced: (focus?: 'rejection' | 'duplicates') => void;
  onRefreshJobs: () => Promise<void>;
  onRefreshFiles: () => Promise<void>;
}) {
  const en = language === 'en';
  const { showToast } = useToast();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const autoDraftRef = useRef('');
  const advancingExtractRef = useRef('');

  const [selectedProposalId, setSelectedProposalId] = useState('');
  const [choosingOther, setChoosingOther] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [cancellingId, setCancellingId] = useState('');
  const [pendingRejection, setPendingRejection] = useState<PendingRejection | null>(null);
  const [selectedResultKey, setSelectedResultKey] = useState<ReviewResultKey | ''>('');
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>({
    rejection: true,
    evaluation: true,
    blind: true,
    duplicates: false,
  });

  const availableFiles = files.filter((file) => !file.deleting && !/\.zip$/i.test(file.name));
  const generatedWordJob = jobs.find(
    (job) =>
      job.kind === 'technical-plan.export-word' &&
      job.state === 'succeeded' &&
      job.artifactState === 'stored' &&
      job.payload?.bidDocument !== 'economic',
  );
  const generatedDraftId = generatedWordJob ? `word-draft:${generatedWordJob.id}` : '';
  const draftLabel = en ? 'Generated proposal draft (DOCX)' : 'Borrador de propuesta generado (DOCX)';

  useEffect(() => {
    autoDraftRef.current = '';
    advancingExtractRef.current = '';
    setSelectedProposalId('');
    setChoosingOther(false);
    setPendingRejection(null);
    setSelectedResultKey('');
  }, [projectId]);

  useEffect(() => {
    if (!generatedDraftId || autoDraftRef.current === generatedDraftId) return;
    autoDraftRef.current = generatedDraftId;
    setSelectedProposalId((current) => (!current || current.startsWith('word-draft:') ? generatedDraftId : current));
  }, [generatedDraftId]);

  const selectedFile = availableFiles.find((file) => file.id === selectedProposalId) || null;
  const validProposalId = selectedProposalId && (selectedProposalId === generatedDraftId || selectedFile) ? selectedProposalId : '';
  const isGeneratedProposal = Boolean(validProposalId && validProposalId === generatedDraftId);
  const proposalName = isGeneratedProposal ? draftLabel : selectedFile?.name || '';
  const isDocxProposal = isGeneratedProposal || /\.docx$/i.test(proposalName);
  const tenderIds = availableFiles.filter((file) => file.id !== validProposalId).map((file) => file.id);
  const cappedTenders = tenderIds.slice(0, MAX_REVIEW_TENDERS);

  const useRejection = Boolean(validProposalId && checks.rejection);
  const useEvaluation = Boolean(validProposalId && checks.evaluation && cappedTenders.length > 0);
  const useBlind = Boolean(validProposalId && checks.blind && isDocxProposal);
  const useDuplicates = Boolean(validProposalId && checks.duplicates);
  const anyCheckSelected = useRejection || useEvaluation || useBlind || useDuplicates;
  const needsAi = useRejection || useEvaluation;

  const blocker = !validProposalId
    ? en
      ? 'Generate, upload or select a proposal in step 1.'
      : 'Genera, sube o selecciona una propuesta en el paso 1.'
    : !anyCheckSelected
      ? en
        ? 'Select at least one validation in step 2.'
        : 'Elige al menos una validación en el paso 2.'
      : needsAi && !credentialId
        ? en
          ? 'Configure or select an AI model in “Connection & AI” (or run only Anonymity / Duplicates).'
          : 'Configura o selecciona un modelo de IA en «Conexión e IA» (o deja solo Anonimato / Duplicados).'
        : null;

  const latestJobByKind = (kinds: string[]) => jobs.find((job) => kinds.includes(job.kind)) || null;
  const rejectionAnalyzeJob = latestJobByKind(['rejection-check.analyze']);
  const rejectionExtractJob = pendingRejection
    ? jobs.find((job) => job.id === pendingRejection.extractJobId) || null
    : null;
  const rejectionJob = rejectionExtractJob || rejectionAnalyzeJob;
  const evaluationJob = latestJobByKind(['bid-evaluation.analyze']);
  const blindJob = latestJobByKind(['blind-check.inspect']);
  const duplicateJob = latestJobByKind(['duplicate-check.analyze']);
  const applyJob = latestJobByKind(['proposal-review.apply-suggestions']);

  const trackedJobs = [rejectionJob, evaluationJob, blindJob, duplicateJob, applyJob].filter(Boolean) as ReviewJobItem[];
  const hasActiveJobs = Boolean(pendingRejection) || trackedJobs.some((job) => ['queued', 'running'].includes(job.state));

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => {
      void onRefreshJobs().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs, onRefreshJobs]);

  useEffect(() => {
    if (!pendingRejection) return;
    const extractJob = jobs.find((job) => job.id === pendingRejection.extractJobId);
    if (!extractJob) return;
    if (extractJob.state === 'succeeded') {
      if (advancingExtractRef.current === extractJob.id) return;
      advancingExtractRef.current = extractJob.id;
      const extractedCriteria = extractJob.result?.criteria?.trim() || '';
      const payload = {
        fileIds: [...pendingRejection.tenderIds, pendingRejection.proposalId],
        tenderFileIds: pendingRejection.tenderIds,
        bidFileIds: [pendingRejection.proposalId],
        language,
        dataProcessingConsent: true,
        criteria: extractedCriteria,
        customCheckItems: pendingRejection.custom,
        options: {
          rejectionCheck: Boolean(extractedCriteria),
          typoCheck: true,
          logicCheck: true,
        },
      };
      void request(`/api/projects/${encodeURIComponent(projectId)}/jobs`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        json: { kind: 'rejection-check.analyze', credentialId, payload },
      })
        .then(() => {
          setPendingRejection(null);
          return onRefreshJobs();
        })
        .catch(() => {
          advancingExtractRef.current = '';
          setPendingRejection(null);
          showToast(
            en
              ? 'Criteria were extracted, but starting the rejection analysis failed.'
              : 'Se extrajeron las causales, pero no se pudo iniciar el análisis de rechazo.',
            'error',
          );
        });
    } else if (['failed', 'cancelled', 'interrupted'].includes(extractJob.state)) {
      setPendingRejection(null);
      showToast(
        en
          ? 'Could not extract rejection criteria automatically from the tender.'
          : 'No se pudieron extraer las causales de rechazo automáticamente desde el pliego.',
        'error',
      );
    }
  }, [jobs, pendingRejection, projectId, credentialId, language, en, onRefreshJobs, showToast]);

  const handleUploadProposal = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || uploading || submitting) return;
    if (!/\.(docx|pdf|txt|md|markdown|doc)$/i.test(file.name)) {
      showToast(
        en ? 'Supported formats: DOCX, PDF, DOC, TXT or Markdown.' : 'Formatos admitidos: DOCX, PDF, DOC, TXT o Markdown.',
        'error',
      );
      return;
    }
    setUploading(true);
    try {
      const key = crypto.randomUUID();
      const uploaded =
        file.size > 50 * 1024 * 1024
          ? ((await uploadLargeProjectFile({ projectId, file, key, request })) as { file: ReviewFileItem })
          : await request<{ file: ReviewFileItem }>(`/api/projects/${encodeURIComponent(projectId)}/files`, {
              method: 'POST',
              body: file,
              headers: {
                'content-type': file.type || 'application/octet-stream',
                'x-file-name': encodeURIComponent(file.name),
                'idempotency-key': key,
              },
            });
      await onRefreshFiles();
      setSelectedProposalId(uploaded.file.id);
      setChoosingOther(false);
      showToast(en ? 'Proposal uploaded and selected.' : 'Propuesta subida y seleccionada.', 'success');
    } catch {
      showToast(en ? 'Could not upload the proposal file.' : 'No se pudo subir el archivo de la propuesta.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const queueJob = (body: Record<string, unknown>) =>
    request<{ job: ReviewJobItem }>(`/api/projects/${encodeURIComponent(projectId)}/jobs`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      json: body,
    });

  const startValidation = async () => {
    if (blocker || submitting || uploading) return;
    setSubmitting(true);
    try {
      const tasks: Promise<unknown>[] = [];

      if (useRejection) {
        let draft = { criteria: '', custom: '' };
        try {
          draft = await request<{ criteria: string; custom: string }>(
            `/api/projects/${encodeURIComponent(projectId)}/rejection-draft`,
          );
        } catch {
          draft = { criteria: '', custom: '' };
        }
        const sortedTenders = JSON.stringify([...cappedTenders].sort());
        const cachedExtract = jobs.find(
          (job) =>
            job.kind === 'rejection-check.extract' &&
            job.state === 'succeeded' &&
            job.result?.criteria?.trim() &&
            JSON.stringify([...(job.payload?.fileIds || [])].sort()) === sortedTenders,
        );
        const existingCriteria = draft.criteria?.trim() ? draft.criteria : cachedExtract?.result?.criteria || '';
        if (!existingCriteria.trim() && cappedTenders.length > 0) {
          tasks.push(
            queueJob({
              kind: 'rejection-check.extract',
              credentialId,
              payload: { fileIds: cappedTenders, language, dataProcessingConsent: true },
            }).then((res) => {
              setPendingRejection({
                extractJobId: res.job.id,
                proposalId: validProposalId,
                tenderIds: cappedTenders,
                custom: draft.custom || '',
              });
            }),
          );
        } else {
          tasks.push(
            queueJob({
              kind: 'rejection-check.analyze',
              credentialId,
              payload: {
                fileIds: [...cappedTenders, validProposalId],
                tenderFileIds: cappedTenders,
                bidFileIds: [validProposalId],
                language,
                dataProcessingConsent: true,
                criteria: existingCriteria,
                customCheckItems: draft.custom || '',
                options: {
                  rejectionCheck: Boolean(existingCriteria.trim()),
                  typoCheck: true,
                  logicCheck: true,
                },
              },
            }),
          );
        }
      }

      if (useEvaluation) {
        tasks.push(
          queueJob({
            kind: 'bid-evaluation.analyze',
            credentialId,
            payload: {
              fileIds: [...cappedTenders, validProposalId],
              tenderFileIds: cappedTenders,
              bidFileIds: [validProposalId],
              language,
              dataProcessingConsent: true,
            },
          }),
        );
      }

      if (useBlind) {
        tasks.push(
          queueJob({
            kind: 'blind-check.inspect',
            payload: {
              fileIds: [validProposalId],
              language,
              preset: 'builtin-general',
              sensitiveWords: [],
            },
          }),
        );
      }

      if (useDuplicates) {
        tasks.push(
          queueJob({
            kind: 'duplicate-check.analyze',
            payload: {
              fileIds: [...cappedTenders, validProposalId],
              tenderFileIds: cappedTenders,
              bidFileIds: [validProposalId],
              language,
            },
          }),
        );
      }

      const settled = await Promise.allSettled(tasks);
      const failures = settled.filter((item) => item.status === 'rejected').length;
      await onRefreshJobs().catch(() => undefined);
      if (failures === settled.length) {
        showToast(en ? 'Could not start the selected validations.' : 'No se pudieron iniciar las validaciones.', 'error');
      } else if (failures > 0) {
        showToast(
          en ? 'Some validations started, while others could not be queued.' : 'Algunas validaciones se iniciaron, pero otras fallaron.',
          'info',
        );
      } else {
        showToast(
          en ? 'Validations queued for the local runner.' : 'Validaciones enviadas al runner local.',
          'success',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cancelJob = async (jobId: string) => {
    setCancellingId(jobId);
    try {
      await request(`/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: 'POST',
      });
      if (pendingRejection?.extractJobId === jobId) setPendingRejection(null);
      await onRefreshJobs();
    } catch {
      showToast(en ? 'Could not cancel the task.' : 'No se pudo cancelar la tarea.', 'error');
    } finally {
      setCancellingId('');
    }
  };

  const statusText = (job: ReviewJobItem) => {
    if (pendingRejection && job.id === pendingRejection.extractJobId && ['queued', 'running'].includes(job.state)) {
      return en ? 'Extracting criteria from tender…' : 'Extrayendo causales del pliego…';
    }
    return (
      ({
        queued: en ? 'Queued' : 'En cola',
        running: en ? 'Running' : 'En ejecución',
        succeeded: en ? 'Complete' : 'Completado',
        failed: en ? 'Failed' : 'Falló',
        cancelled: en ? 'Cancelled' : 'Cancelado',
        interrupted: en ? 'Interrupted' : 'Interrumpido',
      } as Record<string, string>)[job.state] || job.state
    );
  };

  const pickerOptions = [
    ...(generatedDraftId ? [{ value: generatedDraftId, label: draftLabel }] : []),
    ...availableFiles.map((file) => ({ value: file.id, label: file.name })),
    { value: '', label: en ? 'Clear selection' : 'Quitar selección' },
  ];

  const fileSelectOptions = [
    { value: '', label: en ? 'Select an uploaded project file…' : 'Elige un archivo ya subido del proyecto…' },
    ...availableFiles.map((file) => ({ value: file.id, label: file.name })),
  ];

  const checkCards: {
    key: CheckKey;
    title: string;
    description: string;
    icon: typeof ShieldAlert;
    disabled: boolean;
    hint?: string;
    checked: boolean;
  }[] = [
    {
      key: 'rejection',
      title: en ? 'Rejection criteria, spelling & logic' : 'Causales de rechazo, ortografía y lógica',
      description: en
        ? 'Extracts mandatory criteria from tenders and checks your bid for omissions or typos.'
        : 'Extrae automáticamente las causales del pliego y revisa errores o inconsistencias en tu oferta.',
      icon: ShieldAlert,
      disabled: !validProposalId,
      checked: checks.rejection,
    },
    {
      key: 'evaluation',
      title: en ? 'Tender evaluation' : 'Evaluación frente al pliego',
      description: en
        ? 'Compares the proposal against scoring and compliance requirements.'
        : 'Compara tu propuesta frente a los criterios evaluables del pliego.',
      icon: ClipboardCheck,
      disabled: !validProposalId || cappedTenders.length === 0,
      hint:
        cappedTenders.length === 0
          ? en
            ? 'Requires at least one tender document in the project.'
            : 'Requiere al menos un documento de pliego en el proyecto.'
          : undefined,
      checked: checks.evaluation && cappedTenders.length > 0,
    },
    {
      key: 'blind',
      title: en ? 'Bid anonymity' : 'Anonimato de la oferta',
      description: en
        ? 'Local DOCX scan for company names, metadata or images that identify the bidder.'
        : 'Inspección local del DOCX para detectar datos o metadatos que revelen al oferente.',
      icon: EyeOff,
      disabled: !validProposalId || !isDocxProposal,
      hint:
        validProposalId && !isDocxProposal
          ? en
            ? 'Available only for DOCX files.'
            : 'Solo disponible para propuestas en DOCX.'
          : undefined,
      checked: checks.blind && isDocxProposal,
    },
    {
      key: 'duplicates',
      title: en ? 'Duplicate check with tender' : 'Duplicados con el pliego',
      description: en
        ? 'Local check to detect copied or repeated passages against project documents.'
        : 'Detección local de texto repetido respecto a los documentos del proyecto.',
      icon: CopyCheck,
      disabled: !validProposalId,
      checked: checks.duplicates,
    },
  ];

  const resultRows: ActiveReviewResult[] = [
    ...(rejectionJob
      ? [{ key: 'rejection' as const, label: en ? 'Rejection, spelling & logic' : 'Causales de rechazo, ortografía y lógica', job: rejectionJob, focus: 'rejection' as const }]
      : []),
    ...(evaluationJob
      ? [{ key: 'evaluation' as const, label: en ? 'Tender evaluation' : 'Evaluación frente al pliego', job: evaluationJob }]
      : []),
    ...(blindJob
      ? [{ key: 'blind' as const, label: en ? 'Bid anonymity' : 'Anonimato de la oferta', job: blindJob }]
      : []),
    ...(duplicateJob
      ? [{ key: 'duplicates' as const, label: en ? 'Duplicates' : 'Duplicados con el pliego', job: duplicateJob, focus: 'duplicates' as const }]
      : []),
  ];

  const activeResult = selectedResultKey
    ? resultRows.find(
        (row) => row.key === selectedResultKey && row.job.state === 'succeeded' && row.job.artifactState === 'stored',
      ) || null
    : null;

  useEffect(() => {
    if (selectedResultKey && !activeResult) setSelectedResultKey('');
  }, [selectedResultKey, activeResult]);

  const completedReviewJobs = resultRows.filter(
    (row) => row.job.state === 'succeeded' && row.job.artifactState === 'stored',
  );
  const hasBlindCompleted = completedReviewJobs.some((row) => row.job.kind === 'blind-check.inspect');
  const applyActive = Boolean(applyJob && ['queued', 'running'].includes(applyJob.state));
  const applyBlocker = !validProposalId || !isDocxProposal
    ? en
      ? 'Select or upload a DOCX proposal in step 1 to apply suggestions automatically.'
      : 'Selecciona o sube una propuesta DOCX en el paso 1 para aplicar las sugerencias automáticamente.'
    : completedReviewJobs.length > 0 && !hasBlindCompleted && !credentialId
      ? en
        ? 'Configure or select an AI model in “Connection & AI” to apply text suggestions.'
        : 'Configura o selecciona un modelo de IA en «Conexión e IA» para aplicar sugerencias de redacción.'
      : null;
  const canApplySuggestions = completedReviewJobs.length > 0 && !applyBlocker && !applying && !applyActive && !submitting && !uploading;

  const applySuggestions = async () => {
    if (!canApplySuggestions) return;
    setApplying(true);
    try {
      await queueJob({
        kind: 'proposal-review.apply-suggestions',
        ...(credentialId ? { credentialId } : {}),
        payload: {
          proposalId: validProposalId,
          reviewJobIds: completedReviewJobs.map((row) => row.job.id),
          language,
          ...(credentialId ? { dataProcessingConsent: true } : {}),
        },
      });
      await onRefreshJobs().catch(() => undefined);
      showToast(
        en ? 'Suggestion implementation queued for the local runner.' : 'Implementación de sugerencias enviada al runner local.',
        'success',
      );
    } catch {
      showToast(
        en ? 'Could not start applying suggestions.' : 'No se pudo iniciar la implementación de sugerencias.',
        'error',
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="web-review-autopilot">
      <input
        ref={uploadInputRef}
        type="file"
        accept=".docx,.pdf,.txt,.md,.markdown,.doc"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void handleUploadProposal(event)}
      />

      <section className="web-review-autopilot-card" aria-labelledby={`autopilot-proposal-${projectId}`}>
        <div className="web-review-step-head">
          <span className="web-review-step-num" aria-hidden="true">1</span>
          <div>
            <h2 id={`autopilot-proposal-${projectId}`}>
              {en ? 'Proposal to validate' : 'Propuesta a validar'}
            </h2>
            <p className="web-review-hint">
              {en
                ? 'Use the Word draft created in Prepare bid or upload a file directly.'
                : 'Usa el borrador en Word creado en Preparar oferta o sube otra propuesta.'}
            </p>
          </div>
        </div>

        {validProposalId ? (
          <div className="web-review-autopilot-proposal">
            <div className="web-review-autopilot-proposal-info">
              <div className="web-review-role-meta">
                <FileText size={16} aria-hidden="true" />
                <strong className="web-review-role-name" title={proposalName}>
                  {proposalName}
                </strong>
                <span className="web-review-draft-pill">
                  {isGeneratedProposal
                    ? en
                      ? 'Generated proposal'
                      : 'Propuesta generada'
                    : en
                      ? 'Selected file'
                      : 'Archivo seleccionado'}
                </span>
              </div>
              <p className="web-review-hint">
                {cappedTenders.length > 0
                  ? en
                    ? `Will automatically compare against ${cappedTenders.length} tender document(s) in this project${tenderIds.length > MAX_REVIEW_TENDERS ? ` (first ${MAX_REVIEW_TENDERS})` : ''}.`
                    : `Se comparará automáticamente con ${cappedTenders.length} documento(s) del pliego del proyecto${tenderIds.length > MAX_REVIEW_TENDERS ? ` (los primeros ${MAX_REVIEW_TENDERS})` : ''}.`
                  : en
                    ? 'No additional tender documents in the project; checks that do not require a tender will run.'
                    : 'No hay otros documentos del pliego en el proyecto; se ejecutarán las validaciones que no requieren pliego.'}
              </p>
            </div>
            <div className="web-review-step-actions">
              <Button
                icon={Upload}
                size="sm"
                variant="outline"
                disabled={uploading || submitting}
                onClick={() => uploadInputRef.current?.click()}
              >
                {uploading
                  ? en
                    ? 'Uploading…'
                    : 'Subiendo…'
                  : en
                    ? 'Upload another proposal'
                    : 'Subir otra propuesta'}
              </Button>
              {availableFiles.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={uploading || submitting}
                  onClick={() => setChoosingOther((current) => !current)}
                >
                  {choosingOther
                    ? en
                      ? 'Close list'
                      : 'Cerrar lista'
                    : en
                      ? 'Choose another file'
                      : 'Elegir otro archivo'}
                </Button>
              )}
            </div>
            {choosingOther && (
              <div className="web-review-autopilot-picker">
                <SelectField
                  value={validProposalId}
                  options={pickerOptions}
                  disabled={uploading || submitting}
                  aria-label={en ? 'Choose proposal file' : 'Elegir archivo de propuesta'}
                  onChange={(value) => {
                    setSelectedProposalId(value);
                    setChoosingOther(false);
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="web-review-autopilot-empty">
            <div className="web-review-proposal-notice" role="status">
              <div className="web-review-proposal-notice-copy">
                <strong>{en ? 'No generated proposal draft yet' : 'Aún no hay una propuesta generada'}</strong>
                <p>
                  {en
                    ? 'Generate the Word proposal first in “Prepare bid” to validate it automatically here, or upload your proposal file.'
                    : 'Primero genera la propuesta en Word desde «Preparar oferta» para validarla aquí automáticamente, o sube el archivo de tu propuesta.'}
                </p>
              </div>
              <div className="web-review-step-actions">
                <Button size="sm" variant="outline" disabled={uploading || submitting} onClick={onPrepareProposal}>
                  {en ? 'Go to Prepare bid' : 'Ir a Preparar oferta'}
                </Button>
                <Button
                  icon={Upload}
                  size="sm"
                  disabled={uploading || submitting}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  {uploading ? (en ? 'Uploading…' : 'Subiendo…') : en ? 'Upload proposal' : 'Subir propuesta'}
                </Button>
              </div>
            </div>
            {availableFiles.length > 0 && (
              <div className="web-review-autopilot-existing">
                <span className="web-review-hint">
                  {en ? 'Or pick a file already uploaded to the project:' : 'O elige un archivo ya subido del proyecto:'}
                </span>
                <SelectField
                  value=""
                  options={fileSelectOptions}
                  disabled={uploading || submitting}
                  placeholder={en ? 'Choose an uploaded project file…' : 'Elige un archivo ya subido del proyecto…'}
                  aria-label={en ? 'Existing project files' : 'Archivos del proyecto'}
                  onChange={(value) => {
                    if (value) setSelectedProposalId(value);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </section>

      <section className="web-review-autopilot-card" aria-labelledby={`autopilot-checks-${projectId}`}>
        <div className="web-review-step-head">
          <span className="web-review-step-num" aria-hidden="true">2</span>
          <div>
            <h2 id={`autopilot-checks-${projectId}`}>
              {en ? 'What do you want to validate?' : '¿Qué quieres validar?'}
            </h2>
            <p className="web-review-hint">
              {en
                ? 'Choose the checks to run with a single click.'
                : 'Marca las comprobaciones que quieres ejecutar de una sola vez.'}
            </p>
          </div>
        </div>

        <div className="web-review-autopilot-checks">
          {checkCards.map((item) => {
            const Icon = item.icon;
            return (
              <label
                key={item.key}
                className={`web-review-check-card${item.checked && !item.disabled ? ' is-selected' : ''}${item.disabled ? ' is-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={item.disabled || submitting || uploading}
                  onChange={(event) =>
                    setChecks((current) => ({ ...current, [item.key]: event.target.checked }))
                  }
                />
                <span className="web-review-check-card-body">
                  <span className="web-review-check-card-title">
                    <Icon size={15} aria-hidden="true" />
                    <strong>{item.title}</strong>
                  </span>
                  <span className="web-review-check-card-desc">{item.description}</span>
                  {item.hint && <span className="web-review-check-card-hint">{item.hint}</span>}
                </span>
              </label>
            );
          })}
        </div>

        <div className="web-review-inline-row">
          <Button
            icon={CheckCircle2}
            size="sm"
            disabled={Boolean(blocker) || submitting || uploading}
            onClick={() => void startValidation()}
          >
            {submitting
              ? en
                ? 'Starting validations…'
                : 'Iniciando validaciones…'
              : en
                ? 'Validate proposal'
                : 'Validar propuesta'}
          </Button>
          {blocker && <span className="web-review-hint" role="status">{blocker}</span>}
        </div>
      </section>

      {(resultRows.length > 0 || Boolean(applyJob)) && (
        <section className="web-review-autopilot-card" aria-labelledby={`autopilot-results-${projectId}`}>
          <div className="web-review-step-head">
            <span className="web-review-step-num" aria-hidden="true">3</span>
            <div>
              <h2 id={`autopilot-results-${projectId}`}>
                {en ? 'Status and results' : 'Estado y resultados'}
              </h2>
              <p className="web-review-hint">
                {en
                  ? 'Inspect each report right here or open full details in Advanced view.'
                  : 'Abre cualquier resultado aquí mismo o consulta el detalle completo en la Vista avanzada.'}
              </p>
            </div>
          </div>

          <div className="web-review-autopilot-results">
            {resultRows.map(({ key, label, job, focus }) => {
              const active = ['queued', 'running'].includes(job.state);
              const canView = job.state === 'succeeded' && job.artifactState === 'stored';
              const isViewing = activeResult?.key === key;
              return (
                <article
                  key={key}
                  className={`web-review-autopilot-result-row${isViewing ? ' is-viewing' : ''}`}
                >
                  <div className="web-review-autopilot-result-meta">
                    <div className="web-review-role-meta">
                      <strong>{label}</strong>
                      <span className="web-review-status-pill" data-state={job.state}>
                        {active && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                        {statusText(job)}
                      </span>
                    </div>
                    {job.result?.message && <p className="web-review-hint">{job.result.message}</p>}
                  </div>
                  <div className="web-review-step-actions">
                    {active && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancellingId === job.id}
                        onClick={() => void cancelJob(job.id)}
                      >
                        {en ? 'Cancel' : 'Cancelar'}
                      </Button>
                    )}
                    {canView && (
                      <>
                        <Button
                          icon={FileSearch}
                          size="sm"
                          variant={isViewing ? undefined : 'outline'}
                          aria-pressed={isViewing}
                          onClick={() => setSelectedResultKey((current) => (current === key ? '' : key))}
                        >
                          {isViewing
                            ? en
                              ? 'Hide results'
                              : 'Ocultar resultados'
                            : en
                              ? 'View results'
                              : 'Ver resultados'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onOpenAdvanced(focus)}>
                          {en ? 'Advanced view' : 'Vista avanzada'}
                        </Button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {((completedReviewJobs.length > 0 && isDocxProposal) || applyJob) && (
            <div className="web-review-apply-bar">
              <div className="web-review-apply-head">
                <div className="web-review-apply-copy">
                  <strong>
                    {en ? 'Implement suggestions & update proposal' : 'Implementar sugerencias y actualizar propuesta'}
                  </strong>
                  <p className="web-review-hint">
                    {isGeneratedProposal
                      ? en
                        ? 'The local runner will apply formatting fixes and review improvements directly to the project Word draft.'
                        : 'El runner local aplicará las correcciones de formato y mejoras de revisión directamente sobre el borrador Word del proyecto.'
                      : en
                        ? 'The local runner will apply formatting fixes and review improvements to generate an updated DOCX copy.'
                        : 'El runner local aplicará las correcciones de formato y mejoras de revisión para generar una copia DOCX actualizada.'}
                  </p>
                </div>
                {completedReviewJobs.length > 0 && (
                  <Button
                    icon={Wand2}
                    size="sm"
                    disabled={!canApplySuggestions}
                    onClick={() => void applySuggestions()}
                  >
                    {applying || applyActive
                      ? en
                        ? 'Updating proposal…'
                        : 'Actualizando propuesta…'
                      : en
                        ? 'Implement suggestions & update proposal'
                        : 'Implementar sugerencias y actualizar propuesta'}
                  </Button>
                )}
              </div>
              {applyBlocker && completedReviewJobs.length > 0 && (
                <p className="web-review-hint" role="status">
                  {applyBlocker}
                </p>
              )}
              {applyJob && (
                <div className="web-review-apply-status">
                  <div className="web-review-apply-status-meta">
                    <div className="web-review-role-meta">
                      <strong>{en ? 'Proposal update task' : 'Actualización de la propuesta'}</strong>
                      <span className="web-review-status-pill" data-state={applyJob.state}>
                        {['queued', 'running'].includes(applyJob.state) && (
                          <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                        )}
                        {statusText(applyJob)}
                      </span>
                    </div>
                    {(applyJob.result?.summary || applyJob.result?.message) && (
                      <p className="web-review-hint">{applyJob.result.summary || applyJob.result.message}</p>
                    )}
                  </div>
                  <div className="web-review-step-actions">
                    {['queued', 'running'].includes(applyJob.state) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancellingId === applyJob.id}
                        onClick={() => void cancelJob(applyJob.id)}
                      >
                        {en ? 'Cancel' : 'Cancelar'}
                      </Button>
                    )}
                    {applyJob.state === 'succeeded' && applyJob.artifactState === 'stored' && (
                      <>
                        <a
                          className="web-link"
                          href={`/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(applyJob.id)}/artifact`}
                          download
                        >
                          {en ? 'Download updated proposal' : 'Descargar propuesta actualizada'}
                        </a>
                        {applyJob.result?.updatedProposal && (
                          <Button size="sm" variant="outline" onClick={onPrepareProposal}>
                            {en ? 'Open in Prepare bid' : 'Abrir en Preparar oferta'}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeResult && (
            <WebReviewAutopilotViewer
              projectId={projectId}
              language={language}
              files={files}
              activeResult={activeResult}
              onClose={() => setSelectedResultKey('')}
              onOpenAdvanced={onOpenAdvanced}
            />
          )}
        </section>
      )}
    </div>
  );
}
