import { Archive, Building2, CheckCircle2, FileText, Loader2, Play, Radar, RefreshCw, Sparkles, Square } from 'lucide-react';
import { useState } from 'react';
import type { ProcurementMarket, SecopProcess } from '@/shared/types/secop';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import { prepareOpportunity, selectLoadedDocuments } from './opportunity-import.mjs';
import { formatDeadline, formatSecopValue } from './secop/secopValue.mjs';
import { secopStatusTone } from './secop-status';
import { WebJobProgress } from './WebJobProgress';
import { WebLoading } from './WebLoading';

type Locale = 'es' | 'en';
type Settings = {
  refreshHours: number;
  localRunner: boolean;
  enabled: boolean;
  autoEnabled: boolean;
  runnerAutoEnabled: boolean;
  runnerLanguage: Locale;
  keywords: string;
  version: number;
  terms: string[];
  hasRup: boolean;
  credentialId: string | null;
  credentialAvailable: boolean;
  includeRup: boolean;
};
type Job = { id: string; state: string; progress?: string | null; result: { message?: string } | null };
type Item = {
  id: string;
  process: SecopProcess;
  reason: string;
  checks: string;
  verdict?: 'pursue' | 'review' | 'decline';
  reviewed: boolean;
  saved: boolean;
  projectId: string | null;
};
type Results = {
  jobId: string | null;
  items: Item[];
  unreadCount: number;
  stale: boolean;
  verificationUnavailable?: boolean;
};

const verdictRank: Record<string, number> = { pursue: 0, review: 1, decline: 3 };

export function WebOpportunityAutopilot({
  language,
  market,
  settings,
  jobs,
  results,
  active,
  searching,
  checkingResults,
  verifyingSecop,
  elapsedSeconds,
  busy,
  credential,
  autoEnabled,
  archive,
  onStartAutopilotSearch,
  onToggleAutoRefresh,
  onCancel,
  onReview,
  onOpenDetail,
  onLoadArchive,
  onOpen,
  onPrepareProject,
  onCompanyProfile,
  onOpenAdvanced,
}: {
  language: Locale;
  market: ProcurementMarket;
  settings: Settings;
  jobs: Job[];
  results: Results | null;
  active: Job | undefined;
  searching: boolean;
  checkingResults: boolean;
  verifyingSecop: boolean;
  elapsedSeconds: number;
  busy: boolean;
  credential: string;
  autoEnabled: boolean;
  archive: Array<Item & { jobId: string }> | null;
  onStartAutopilotSearch: () => Promise<void>;
  onToggleAutoRefresh: (enabled: boolean) => Promise<void>;
  onCancel: () => Promise<void>;
  onReview: (jobId: string, candidateId: string) => Promise<void>;
  onOpenDetail: (jobId: string, item: Item) => void;
  onLoadArchive: () => Promise<void>;
  onOpen: (projectId: string) => void;
  onPrepareProject?: (projectId: string, openAutopilot: boolean) => void;
  onCompanyProfile?: () => void;
  onOpenAdvanced: () => void;
}) {
  const en = language === 'en';
  const { showToast } = useToast();
  const [filter, setFilter] = useState<'priority' | 'all' | 'archive'>('priority');
  const [preparingId, setPreparingId] = useState('');
  const [preparingNote, setPreparingNote] = useState('');
  const [togglingAuto, setTogglingAuto] = useState(false);

  const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const inProgress = searching || Boolean(active) || verifyingSecop || Boolean(preparingId);
  const verdictLabels = en
    ? { pursue: 'Worth pursuing', review: 'Review required', decline: 'Poor fit' }
    : { pursue: 'Conviene participar', review: 'Requiere revisión', decline: 'No encaja' };

  const unreadItems = (results?.items || []).filter(item => !item.reviewed);
  const sortedUnread = [...unreadItems].sort(
    (a, b) => (verdictRank[a.verdict || ''] ?? 2) - (verdictRank[b.verdict || ''] ?? 2),
  );
  const priorityItems = sortedUnread.filter(item => item.verdict === 'pursue' || item.verdict === 'review' || !item.verdict);
  const displayedItems = filter === 'priority' ? (priorityItems.length ? priorityItems : sortedUnread) : sortedUnread;

  const hasSignals = settings.terms.length > 0 || settings.hasRup;

  const handleToggleAuto = async (checked: boolean) => {
    if (togglingAuto || busy) return;
    setTogglingAuto(true);
    try {
      await onToggleAutoRefresh(checked);
    } finally {
      setTogglingAuto(false);
    }
  };

  const handlePrepareInAutopilot = async (jobId: string, item: Item) => {
    if (preparingId || busy) return;
    setPreparingId(item.id);
    setPreparingNote(en ? 'Checking official notice…' : 'Consultando expediente oficial…');
    try {
      let fullProcess = item.process;
      try {
        const detail = await request<{ data: SecopProcess }>(
          `/api/secop/detail?source=${encodeURIComponent(item.process.source)}&id=${encodeURIComponent(item.process.id)}&language=${language}`,
        );
        if (detail?.data) fullProcess = { ...detail.data, portfolioId: detail.data.portfolioId || item.process.portfolioId };
      } catch {
        // Keep search metadata when detail endpoint is temporarily unavailable.
      }

      const supportsDirect = fullProcess.source === 'placsp' || fullProcess.source === 'ted';
      const docPath = supportsDirect
        ? `/api/secop/documents?source=${encodeURIComponent(fullProcess.source)}&id=${encodeURIComponent(fullProcess.id)}&language=${language}`
        : fullProcess.portfolioId
          ? `/api/secop/documents?portfolioId=${encodeURIComponent(fullProcess.portfolioId)}`
          : null;

      let docIds: string[] = [];
      if (docPath) {
        setPreparingNote(en ? 'Reading official documents catalog…' : 'Consultando documentos oficiales…');
        try {
          const catalog = await request<{ data: { items: { id: string; extension: string; size: number | null }[] } }>(docPath);
          docIds = selectLoadedDocuments(catalog.data?.items || []);
        } catch {
          docIds = [];
        }
      }

      setPreparingNote(
        docIds.length
          ? en
            ? `Creating project and importing ${docIds.length} document(s)…`
            : `Creando proyecto e importando ${docIds.length} documento(s)…`
          : en
            ? 'Creating project…'
            : 'Creando proyecto…',
      );
      const outcome = (await prepareOpportunity(request, fullProcess, docIds)) as {
        project: { id: string };
        existing: boolean;
        imported: string[];
        queued: string[];
        failed: string[];
      };

      await onReview(jobId, item.id).catch(() => undefined);

      const filesRes = await request<{ files: { id: string; name: string; deleting?: number | boolean }[] }>(
        `/api/projects/${encodeURIComponent(outcome.project.id)}/files`,
      ).catch(() => ({ files: [] }));

      const usableIds = (filesRes.files || [])
        .filter(file => !file.deleting && !/\.zip$/i.test(file.name))
        .map(file => file.id)
        .slice(0, 50);

      if (usableIds.length > 0) {
        setPreparingNote(en ? 'Starting automatic bid preparation…' : 'Iniciando preparación automática de oferta…');
        await request(`/api/projects/${encodeURIComponent(outcome.project.id)}/automatic-preparation`, {
          method: 'POST',
          json: {
            action: 'start',
            fileIds: usableIds,
            language,
            consent: true,
            ...(credential ? { credentialId: credential } : { localRunner: true }),
          },
        }).catch(() => undefined);

        showToast(
          en ? 'Project created and bid preparation started.' : 'Proyecto creado y preparación automática iniciada.',
          'success',
        );
        if (onPrepareProject) onPrepareProject(outcome.project.id, true);
        else onOpen(outcome.project.id);
      } else {
        showToast(
          outcome.queued.length
            ? en
              ? 'Project created; ZIP packages queued for your local runner.'
              : 'Proyecto creado; los paquetes ZIP quedaron en cola para tu runner.'
            : en
              ? 'Project created. Upload or import tender files in Documents to start preparation.'
              : 'Proyecto creado. Importa o sube los pliegos en Documentos para iniciar la preparación.',
          'info',
        );
        if (onPrepareProject) onPrepareProject(outcome.project.id, false);
        else onOpen(outcome.project.id);
      }
    } catch {
      showToast(
        en ? 'Could not create the project from this opportunity.' : 'No se pudo preparar la oferta desde esta oportunidad.',
        'error',
      );
    } finally {
      setPreparingId('');
      setPreparingNote('');
    }
  };

  return (
    <div className="web-module-autopilot">
      <section className="web-review-autopilot-card">
        <div className="web-autopilot-card-header">
          <div className="web-autopilot-card-title">
            <span className="web-draft-step-number">1</span>
            <div>
              <h2>{en ? 'Automatic radar from your company profile' : 'Radar automático según tu perfil de empresa'}</h2>
              <p className="web-review-hint">
                {en
                  ? 'Savia derives search terms from your industry, experience and accredited RUP/CPV codes, then scores open tenders automatically.'
                  : 'Savia detecta términos desde tu sector, experiencia y códigos RUP/CPV para evaluar licitaciones abiertas sin configurar filtros manuales.'}
              </p>
            </div>
          </div>
          {settings.hasRup && (
            <span className="web-review-status-pill" data-state="succeeded">
              {en ? 'RUP / CPV active' : 'RUP / CPV activo'}
            </span>
          )}
        </div>

        {hasSignals ? (
          <div className="web-autopilot-terms-row">
            {settings.terms.map(term => (
              <span key={term} className="web-autopilot-term-chip">
                <Radar size={12} aria-hidden="true" />
                {term}
              </span>
            ))}
          </div>
        ) : (
          <div className="web-review-proposal-notice">
            <div className="web-review-proposal-notice-copy">
              <strong>{en ? 'Complete your company dossier first' : 'Completa primero tu perfil de empresa o términos'}</strong>
              <p>
                {en
                  ? 'Upload your RUP, experience, or business activity in Company Profile (or enter manual terms in Advanced view).'
                  : 'Sube tu RUP, experiencia o actividad económica en Perfil de empresa, o escribe términos manualmente en Vista avanzada.'}
              </p>
            </div>
            <div className="web-inline">
              {onCompanyProfile && (
                <Button icon={Building2} size="sm" variant="outline" onClick={onCompanyProfile}>
                  {en ? 'Go to Company dossier' : 'Ir a Perfil de empresa'}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onOpenAdvanced}>
                {en ? 'Configure manually' : 'Configurar términos'}
              </Button>
            </div>
          </div>
        )}

        <label className="web-consent">
          <input
            type="checkbox"
            checked={autoEnabled}
            disabled={togglingAuto || busy}
            onChange={event => void handleToggleAuto(event.target.checked)}
          />
          {en
            ? `Automatic refresh every ${settings.refreshHours} hours while local runner is connected`
            : `Actualización automática cada ${settings.refreshHours} horas cuando el runner local esté conectado`}
        </label>

        <div className="web-inline">
          <Button
            icon={Play}
            disabled={busy || Boolean(active) || searching || !hasSignals}
            onClick={() => void onStartAutopilotSearch()}
          >
            {searching || active
              ? en
                ? 'Searching & scoring…'
                : 'Buscando y analizando…'
              : results?.jobId
                ? en
                  ? 'Scan opportunities now'
                  : 'Buscar oportunidades ahora'
                : en
                  ? 'Start first scan'
                  : 'Iniciar primer radar'}
          </Button>
          {active && (
            <Button icon={Square} size="sm" variant="outline" disabled={busy} onClick={() => void onCancel()}>
              {en ? 'Cancel' : 'Cancelar'}
            </Button>
          )}
        </div>

        {(searching || active) && (
          <div className="web-autopilot-progress-panel" role="status">
            <div className="web-inline">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              <span>
                {searching
                  ? en
                    ? `Querying official portals… (${formatElapsed(elapsedSeconds)})`
                    : `Consultando fuentes oficiales… (${formatElapsed(elapsedSeconds)})`
                  : en
                    ? `Evaluating fit with your company profile… (${formatElapsed(elapsedSeconds)})`
                    : `Evaluando encaje frente a tu perfil de empresa… (${formatElapsed(elapsedSeconds)})`}
              </span>
            </div>
            {active && <WebJobProgress state={active.state} progress={active.progress} language={language} />}
          </div>
        )}

        {!active && jobs[0] && ['failed', 'interrupted', 'cancelled'].includes(jobs[0].state) && (
          <p className="web-review-hint" role="alert">
            {jobs[0].result?.message || (en ? 'The last scan did not finish. Try running it again.' : 'La última búsqueda no terminó. Puedes volver a intentarlo.')}
          </p>
        )}
      </section>

      <section className="web-review-autopilot-card">
        <div className="web-autopilot-card-header">
          <div className="web-autopilot-card-title">
            <span className="web-draft-step-number">2</span>
            <div>
              <h2>{en ? 'Prioritized opportunities' : 'Oportunidades priorizadas'}</h2>
              <p className="web-review-hint">
                {en
                  ? 'Ranked by strategic fit. Prepare an offer in one click to create the project, import tender documents, and launch Autopilot preparation.'
                  : 'Ordenadas por afinidad. Pulsa «Preparar oferta en piloto automático» para crear el proyecto, importar pliegos y arrancar la redacción.'}
              </p>
            </div>
          </div>
          <div className="web-autopilot-terms-row" role="group" aria-label={en ? 'Filter opportunities' : 'Filtrar oportunidades'}>
            <button
              type="button"
              className={`web-autopilot-term-chip${filter === 'priority' ? ' is-selected' : ''}`}
              onClick={() => setFilter('priority')}
            >
              {en ? `Top fit (${priorityItems.length})` : `Prioritarias (${priorityItems.length})`}
            </button>
            <button
              type="button"
              className={`web-autopilot-term-chip${filter === 'all' ? ' is-selected' : ''}`}
              onClick={() => setFilter('all')}
            >
              {en ? `All unread (${sortedUnread.length})` : `Todas (${sortedUnread.length})`}
            </button>
            <button
              type="button"
              className={`web-autopilot-term-chip${filter === 'archive' ? ' is-selected' : ''}`}
              onClick={() => {
                setFilter('archive');
                if (!archive) void onLoadArchive();
              }}
            >
              <Archive size={12} aria-hidden="true" />
              {en ? 'Archived' : 'Archivadas'}
            </button>
          </div>
        </div>

        {preparingId && (
          <div className="web-autopilot-progress-panel" role="status">
            <div className="web-inline">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              <strong>{preparingNote}</strong>
            </div>
          </div>
        )}

        {checkingResults && <WebLoading message={en ? 'Loading recommendations…' : 'Cargando recomendaciones…'} />}

        {filter === 'archive' ? (
          archive === null ? (
            <p className="web-review-hint" role="status">{en ? 'Loading archived recommendations…' : 'Cargando archivadas…'}</p>
          ) : archive.length ? (
            <div className="web-autopilot-list">
              {archive.map(item => (
                <article key={item.id} className="web-autopilot-item-row">
                  <div className="web-autopilot-item-body">
                    <strong>{item.process.title}</strong>
                    <small className="web-review-hint">
                      {[item.process.entity, item.process.source.toUpperCase(), formatSecopValue(item.process, language)].filter(Boolean).join(' · ')}
                    </small>
                    <small>{item.reason}</small>
                  </div>
                  <div className="web-inline">
                    {item.projectId ? (
                      <Button size="sm" variant="outline" onClick={() => onOpen(item.projectId!)}>
                        {en ? 'Open project' : 'Abrir proyecto'}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={inProgress} onClick={() => onOpenDetail(item.jobId, item)}>
                        {en ? 'Save tender' : 'Guardar licitación'}
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="web-review-hint">{en ? 'No archived recommendations yet.' : 'No hay recomendaciones archivadas.'}</p>
          )
        ) : !results?.jobId ? (
          <p className="web-review-hint">
            {en ? 'Run your first radar scan above to see matched tenders.' : 'Ejecuta el radar arriba para obtener oportunidades recomendadas.'}
          </p>
        ) : !displayedItems.length ? (
          <p className="web-review-hint">
            {en ? 'No unread opportunities match this filter.' : 'No hay recomendaciones pendientes en esta vista.'}
          </p>
        ) : (
          <div className="web-autopilot-list">
            {displayedItems.map(item => (
              <article key={item.id} className="web-review-autopilot-card">
                <div className="web-autopilot-card-header">
                  <div className="web-stack" style={{ gap: 4 }}>
                    <div className="web-inline">
                      {item.verdict && (
                        <span className="web-autopilot-verdict" data-verdict={item.verdict}>
                          {verdictLabels[item.verdict]}
                        </span>
                      )}
                      {item.process.status && (
                        <span className="web-project-status" data-tone={secopStatusTone(item.process.status)}>
                          {item.process.status}
                        </span>
                      )}
                      <span className="web-review-status-pill">{item.process.source.toUpperCase()}</span>
                    </div>
                    <strong>{item.process.title}</strong>
                    <small className="web-review-hint">
                      {[
                        item.process.entity,
                        formatSecopValue(item.process, language),
                        item.process.deadline ? `${en ? 'Closes' : 'Cierre'}: ${formatDeadline(item.process, language)}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </div>
                </div>

                <p className="web-autopilot-prewrap">
                  <strong>{en ? 'Why it fits:' : 'Por qué encaja:'}</strong> {item.reason}
                </p>
                <p className="web-review-hint">
                  <strong>{en ? 'To verify:' : 'Por verificar:'}</strong> {item.checks}
                </p>

                <div className="web-inline">
                  {item.projectId ? (
                    <Button icon={CheckCircle2} size="sm" onClick={() => onOpen(item.projectId!)}>
                      {en ? 'Open project' : 'Abrir proyecto'}
                    </Button>
                  ) : (
                    <Button
                      icon={Sparkles}
                      size="sm"
                      disabled={inProgress || item.saved}
                      onClick={() => results.jobId && void handlePrepareInAutopilot(results.jobId, item)}
                    >
                      {preparingId === item.id
                        ? en
                          ? 'Preparing…'
                          : 'Preparando…'
                        : en
                          ? 'Prepare offer in autopilot'
                          : 'Preparar oferta en piloto automático'}
                    </Button>
                  )}
                  {!item.projectId && (
                    <Button
                      icon={FileText}
                      size="sm"
                      variant="outline"
                      disabled={inProgress}
                      onClick={() => results.jobId && onOpenDetail(results.jobId, item)}
                    >
                      {en ? 'Choose documents' : 'Elegir documentos'}
                    </Button>
                  )}
                  <Button
                    icon={RefreshCw}
                    size="sm"
                    variant="ghost"
                    disabled={inProgress}
                    onClick={() => results.jobId && void onReview(results.jobId, item.id)}
                  >
                    {en ? 'Mark reviewed' : 'Marcar como revisada'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
