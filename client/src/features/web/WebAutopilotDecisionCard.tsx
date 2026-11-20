import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, HelpCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/shared/ui/primitives/button';
import { Input } from '@/shared/ui/primitives/input';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import { AgentQuestionForm } from './WebJobQuestions';
import {
  countPendingFacts,
  describeBlockedReason,
  extractPendingFactGroups,
  extractPendingPlaceholdersForGroup,
  mergeUpdatedFactGroups,
  type AutopilotDecision,
  type FactGroup,
} from './autopilot-state.mjs';

export interface ResumePreparationOptions {
  technicalScore?: 'present' | 'none';
  allowPendingFacts?: boolean;
  skipExistingDraft?: boolean;
}

export interface WebAutopilotDecisionCardProps {
  projectId: string;
  stage: string;
  language: 'es' | 'en';
  decision: AutopilotDecision;
  busy: boolean;
  onResume: (options?: ResumePreparationOptions) => Promise<void>;
  onQuestionAnswered: (questionId: string) => void;
}

interface FactsPayload {
  revision: number;
  planVersion: number;
  groups: FactGroup[];
  importReviewPending: boolean;
  reviewSnapshot: unknown;
}

/** Focused, self-contained inline decision card shown when Autopilot needs user input or recovery. */
export function WebAutopilotDecisionCard({
  projectId,
  stage,
  language,
  decision,
  busy,
  onResume,
  onQuestionAnswered,
}: WebAutopilotDecisionCardProps) {
  const en = language === 'en';
  const { showToast } = useToast();
  const [factsData, setFactsData] = useState<FactsPayload | null>(null);
  const [editedGroups, setEditedGroups] = useState<FactGroup[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);
  const [factsError, setFactsError] = useState(false);
  const [savingFacts, setSavingFacts] = useState(false);

  const loadFacts = useCallback(async (onlyPending: boolean) => {
    setFactsLoading(true);
    setFactsError(false);
    try {
      const data = await request<FactsPayload>(`/api/projects/${encodeURIComponent(projectId)}/technical-facts`);
      setFactsData(data);
      if (onlyPending) {
        const pending = extractPendingFactGroups(data.groups);
        setEditedGroups(pending.map(({ id, title, content }) => ({ id, title, content })));
      } else {
        setEditedGroups([]);
      }
    } catch {
      setFactsError(true);
    } finally {
      setFactsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (decision.kind === 'facts_need_input') {
      void loadFacts(true);
    } else if (decision.kind === 'rup_consent_required') {
      void loadFacts(false);
    } else {
      setFactsData(null);
      setEditedGroups([]);
      setFactsError(false);
    }
  }, [decision.kind, loadFacts]);

  const updateGroup = (id: string, patch: Partial<FactGroup>) => {
    setEditedGroups(current => current.map(item => (item.id === id ? { ...item, ...patch } : item)));
  };

  const remainingPending = countPendingFacts(editedGroups);
  const hasEmptyFields = editedGroups.some(group => !group.title.trim() || !group.content.trim());

  const saveFactsAndContinue = async () => {
    if (!factsData || savingFacts || busy) return;
    setSavingFacts(true);
    try {
      if (factsData.importReviewPending && editedGroups.length === 0) {
        await request(`/api/projects/${encodeURIComponent(projectId)}/technical-facts/review-import`, {
          method: 'POST',
          json: {
            revision: factsData.revision,
            planVersion: factsData.planVersion,
            reviewSnapshot: factsData.reviewSnapshot,
          },
        });
      } else if (editedGroups.length > 0) {
        const merged = mergeUpdatedFactGroups(factsData.groups, editedGroups);
        await request(`/api/projects/${encodeURIComponent(projectId)}/technical-facts`, {
          method: 'PUT',
          json: {
            revision: factsData.revision,
            planVersion: factsData.planVersion,
            groups: merged,
          },
        });
      }
      window.dispatchEvent(new CustomEvent('savia:preparation-changed', { detail: { projectId } }));
      showToast(en ? 'Key facts saved. Resuming preparation.' : 'Datos clave guardados. Reanudando preparación.', 'success');
      await onResume(remainingPending > 0 ? { allowPendingFacts: true } : undefined);
    } catch {
      showToast(
        en
          ? 'Could not save the key facts. Reload and try again.'
          : 'No se pudieron guardar los datos clave. Recarga e inténtalo de nuevo.',
        'error',
      );
    } finally {
      setSavingFacts(false);
    }
  };

  if (decision.kind === 'agent_question') {
    const basePath = `/api/projects/${encodeURIComponent(projectId)}/job-questions`;
    return (
      <section className="web-autopilot-card web-autopilot-decision" aria-label={en ? 'Agent question' : 'Pregunta del asistente'}>
        <header className="web-autopilot-decision-header">
          <HelpCircle size={20} aria-hidden="true" />
          <div>
            <h3>{en ? 'Savia needs your confirmation' : 'Savia necesita tu confirmación'}</h3>
            <p>{en ? 'Preparation is waiting for your answer to continue.' : 'La preparación espera tu respuesta para continuar.'}</p>
          </div>
        </header>
        <div className="web-autopilot-decision-body">
          {decision.questions.map(question => (
            <div key={question.id} className="web-autopilot-question-item">
              <AgentQuestionForm
                question={question}
                basePath={basePath}
                language={language}
                onAnswered={onQuestionAnswered}
              />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (decision.kind === 'technical_score_unknown') {
    return (
      <section className="web-autopilot-card web-autopilot-decision" aria-label={en ? 'Technical scoring decision' : 'Decisión de puntuación técnica'}>
        <header className="web-autopilot-decision-header">
          <HelpCircle size={20} aria-hidden="true" />
          <div>
            <h3>{en ? 'Does this tender have technical scoring?' : '¿Este pliego tiene puntuación técnica?'}</h3>
            <p>
              {en
                ? 'Savia could not determine automatically whether the tender awards points to technical criteria. Choose an option to build the right structure.'
                : 'Savia no pudo confirmar automáticamente si el pliego asigna puntaje técnico. Elige una opción para construir la estructura adecuada.'}
            </p>
          </div>
        </header>
        <div className="web-autopilot-decision-actions">
          <Button size="sm" disabled={busy} onClick={() => void onResume({ technicalScore: 'present' })}>
            {en ? 'Technical scoring applies' : 'Hay puntuación técnica'}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void onResume({ technicalScore: 'none' })}>
            {en ? 'No technical scoring' : 'Sin puntuación técnica'}
          </Button>
        </div>
      </section>
    );
  }

  if (decision.kind === 'facts_need_input') {
    return (
      <section className="web-autopilot-card web-autopilot-decision" aria-label={en ? 'Pending key facts' : 'Datos clave pendientes'}>
        <header className="web-autopilot-decision-header">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <h3>{en ? 'Complete pending key facts' : 'Completa los datos clave pendientes'}</h3>
            <p>
              {en
                ? 'Only the sections with missing placeholders are shown below. Complete them or leave them marked to keep drafting.'
                : 'Solo se muestran los apartados con datos por completar. Complétalos ahora o déjalos marcados para seguir redactando.'}
            </p>
          </div>
        </header>

        <div className="web-autopilot-decision-body">
          {factsLoading && <p role="status">{en ? 'Loading pending facts…' : 'Cargando datos pendientes…'}</p>}
          {factsError && (
            <div role="alert" className="web-autopilot-inline-alert">
              <p>{en ? 'Could not load the pending facts.' : 'No se pudieron cargar los datos pendientes.'}</p>
              <Button size="sm" variant="outline" onClick={() => void loadFacts(true)}>
                <RefreshCw size={14} aria-hidden="true" />
                {en ? 'Retry' : 'Reintentar'}
              </Button>
            </div>
          )}

          {!factsLoading && !factsError && editedGroups.length > 0 && (
            <div className="web-autopilot-facts-editor">
              {editedGroups.map(group => {
                const pendingInGroup = countPendingFacts([group]);
                const pendingHints = extractPendingPlaceholdersForGroup(group);
                return (
                  <div key={group.id} className="web-autopilot-fact-group">
                    <div className="web-autopilot-fact-group-head">
                      <label className="web-autopilot-field">
                        <span>{en ? 'Section' : 'Apartado'}</span>
                        <Input
                          value={group.title}
                          maxLength={300}
                          disabled={busy || savingFacts}
                          onChange={event => updateGroup(group.id, { title: event.target.value })}
                        />
                      </label>
                      <span className="web-autopilot-badge" data-complete={pendingInGroup === 0 ? 'true' : 'false'}>
                        {pendingInGroup === 0
                          ? (en ? 'Ready' : 'Listo')
                          : (en ? `${pendingInGroup} pending` : `${pendingInGroup} pendiente${pendingInGroup === 1 ? '' : 's'}`)}
                      </span>
                    </div>
                    {pendingHints.length > 0 && (
                      <div className="web-autopilot-pending-hints" aria-label={en ? 'Missing items' : 'Datos por completar'}>
                        {pendingHints.map(hint => (
                          <span key={hint} className="web-autopilot-pending-hint">{hint}</span>
                        ))}
                      </div>
                    )}
                    <label className="web-autopilot-field">
                      <span>{en ? 'Verified details' : 'Datos verificados'}</span>
                      <textarea
                        className="web-autopilot-textarea"
                        value={group.content}
                        maxLength={20000}
                        rows={4}
                        disabled={busy || savingFacts}
                        onChange={event => updateGroup(group.id, { content: event.target.value })}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          {!factsLoading && !factsError && editedGroups.length === 0 && factsData?.importReviewPending && (
            <p role="status">
              {en
                ? 'Imported facts need your confirmation before drafting.'
                : 'Los datos importados requieren tu confirmación antes de redactar.'}
            </p>
          )}
        </div>

        <div className="web-autopilot-decision-actions">
          <Button
            size="sm"
            disabled={busy || savingFacts || factsLoading || factsError || hasEmptyFields}
            onClick={() => void saveFactsAndContinue()}
          >
            <Check size={15} aria-hidden="true" />
            {savingFacts
              ? (en ? 'Saving…' : 'Guardando…')
              : (en ? 'Save and continue' : 'Guardar y continuar')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || savingFacts}
            onClick={() => void onResume({ allowPendingFacts: true })}
          >
            {en ? 'Leave marked and continue drafting' : 'Dejar marcado y seguir redactando'}
          </Button>
        </div>
      </section>
    );
  }

  if (decision.kind === 'rup_consent_required') {
    return (
      <section className="web-autopilot-card web-autopilot-decision" aria-label={en ? 'RUP confirmation' : 'Confirmación de datos RUP'}>
        <header className="web-autopilot-decision-header">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <h3>{en ? 'Confirm RUP / accreditation data' : 'Confirma los datos del RUP / acreditación'}</h3>
            <p>
              {en
                ? 'Review the extracted accreditation facts below and confirm to keep drafting your bid.'
                : 'Revisa los datos extraídos abajo y confirma para seguir redactando tu oferta.'}
            </p>
          </div>
        </header>

        <div className="web-autopilot-decision-body">
          {factsLoading && <p role="status">{en ? 'Loading facts…' : 'Cargando datos…'}</p>}
          {factsError && (
            <div role="alert" className="web-autopilot-inline-alert">
              <p>{en ? 'Could not load the facts preview.' : 'No se pudo cargar la vista previa de los datos.'}</p>
              <Button size="sm" variant="outline" onClick={() => void loadFacts(false)}>
                <RefreshCw size={14} aria-hidden="true" />
                {en ? 'Retry' : 'Reintentar'}
              </Button>
            </div>
          )}
          {!factsLoading && !factsError && factsData && factsData.groups.length > 0 && (
            <div className="web-autopilot-rup-preview">
              {factsData.groups.map(group => (
                <article key={group.id} className="web-autopilot-drawer-section">
                  <h4>{group.title}</h4>
                  <p className="web-autopilot-prewrap">{group.content}</p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="web-autopilot-decision-actions">
          <Button size="sm" disabled={busy} onClick={() => void onResume()}>
            <Check size={15} aria-hidden="true" />
            {en ? 'Confirm and continue' : 'Confirmar y continuar'}
          </Button>
        </div>
      </section>
    );
  }

  if (decision.kind === 'existing_draft') {
    return (
      <section className="web-autopilot-card web-autopilot-decision" aria-label={en ? 'Existing draft' : 'Borrador existente'}>
        <header className="web-autopilot-decision-header">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <h3>{en ? 'Drafted chapters already exist' : 'Ya existen capítulos redactados'}</h3>
            <p>
              {en
                ? 'Some chapters already have saved text. You can keep what is drafted and complete only the remaining chapters automatically.'
                : 'Algunos capítulos ya tienen texto guardado. Puedes conservar lo ya redactado y completar automáticamente solo los capítulos pendientes.'}
            </p>
          </div>
        </header>
        <div className="web-autopilot-decision-actions">
          <Button size="sm" disabled={busy} onClick={() => void onResume({ skipExistingDraft: true })}>
            {en ? 'Complete remaining chapters' : 'Completar capítulos faltantes'}
          </Button>
        </div>
      </section>
    );
  }

  if (decision.kind === 'task_failed') {
    return (
      <section className="web-autopilot-card web-autopilot-decision" aria-label={en ? 'Task failed' : 'Tarea fallida'}>
        <header className="web-autopilot-decision-header">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <h3>{en ? 'The last step could not finish' : 'El último paso no pudo completarse'}</h3>
            <p>
              {en
                ? 'Check the runner status and live activity panel below, then retry this step. Completed progress is saved.'
                : 'Revisa el estado y el panel de actividad del runner justo abajo y reintenta este paso. El avance completado se conserva.'}
            </p>
          </div>
        </header>
        <div className="web-autopilot-decision-actions">
          <Button size="sm" disabled={busy} onClick={() => void onResume()}>
            <RefreshCw size={14} aria-hidden="true" />
            {en ? 'Retry this step' : 'Reintentar este paso'}
          </Button>
        </div>
      </section>
    );
  }

  const copy = describeBlockedReason(decision.reason, stage, language);
  return (
    <section className="web-autopilot-card web-autopilot-decision" aria-label={en ? 'Action required' : 'Acción requerida'}>
      <header className="web-autopilot-decision-header">
        <AlertCircle size={20} aria-hidden="true" />
        <div>
          <h3>{copy.title}</h3>
          <p>{copy.description}</p>
        </div>
      </header>
      <div className="web-autopilot-decision-actions">
        <Button size="sm" disabled={busy} onClick={() => void onResume()}>
          <RefreshCw size={14} aria-hidden="true" />
          {copy.actionLabel}
        </Button>
      </div>
    </section>
  );
}
