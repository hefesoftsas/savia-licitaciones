import { ExternalLink, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { request } from './api.mjs';
import { localizeFindingLocation, localizeFindingNote, localizeFindingText } from './blind-check/findingText.mjs';
import { localizeRejectionFieldText } from './rejection-text-locale';
import WebDuplicateReport, { type DuplicateReport } from './WebDuplicateReport';
import type { ReviewFileItem, ReviewJobItem } from './WebReviewAutopilot';

export type ReviewResultKey = 'rejection' | 'evaluation' | 'blind' | 'duplicates';

export type ActiveReviewResult = {
  key: ReviewResultKey;
  label: string;
  job: ReviewJobItem;
  focus?: 'rejection' | 'duplicates';
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

type EvaluationReport = {
  tenderSources?: { id: string; name: string; text: string }[];
  bidSources?: { id: string; name: string; text: string }[];
  result: {
    criteria: EvaluationCriterion[];
    discardedCount: number;
    unreadableDocuments: string[];
  };
};

type BlindSample = { where: string; text: string; detail: string; hint: string };
type BlindGroup = {
  id: string;
  ruleTitle: string;
  category: string;
  severity: string;
  message: string;
  count: number;
  samples: BlindSample[];
};
type BlindReport = {
  sourceFile?: { id: string; name: string };
  summary: { high: number; medium: number; low: number; total: number };
  ruleErrors: string[];
  groups: BlindGroup[];
};

type RejectionFinding = {
  id: string;
  bidDocumentId?: string;
  title?: string;
  summary?: string;
  severity?: string;
  requirement?: string;
  bidEvidence?: string;
  riskReason?: string;
  suggestion?: string;
  wrongText?: string;
  correctText?: string;
  originalExcerpt?: string;
  reason?: string;
  originalText?: string;
  fallacyReason?: string;
  locationHint?: string;
};
type RejectionSection = {
  status: string;
  findings?: RejectionFinding[];
  removedCount?: number;
};
type RejectionReport = {
  status: string;
  criteria?: { content?: string };
  sourceFiles?: { id: string; name: string }[];
  rejectionCheckResult?: RejectionSection;
  typoCheckResult?: RejectionSection;
  logicCheckResult?: RejectionSection;
};

/**
 * Inline, human-readable results viewer shown inside Autopilot review Card 3
 * for evaluation, anonymity, rejection/spelling/logic, and duplicate checks.
 */
export function WebReviewAutopilotViewer({
  projectId,
  language,
  files,
  activeResult,
  onClose,
  onOpenAdvanced,
}: {
  projectId: string;
  language: 'es' | 'en';
  files: ReviewFileItem[];
  activeResult: ActiveReviewResult;
  onClose: () => void;
  onOpenAdvanced: (focus?: 'rejection' | 'duplicates') => void;
}) {
  const en = language === 'en';
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  const draftLabel = en ? 'Generated proposal draft (DOCX)' : 'Borrador de propuesta generado (DOCX)';
  const endpoint =
    activeResult.key === 'evaluation'
      ? `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(activeResult.job.id)}/evaluation`
      : `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(activeResult.job.id)}/artifact`;
  const downloadUrl =
    activeResult.key === 'evaluation'
      ? `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(activeResult.job.id)}/evaluation?format=md&language=${language}`
      : `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(activeResult.job.id)}/artifact`;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setData(null);
    void request<unknown>(endpoint)
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint, reloadCount]);

  const severityLabel = (value?: string) =>
    (({ high: en ? 'High' : 'Alta', medium: en ? 'Medium' : 'Media', low: en ? 'Low' : 'Baja' } as Record<string, string>)[
      value || ''
    ] ||
    value ||
    '');

  const sectionStatusLabel = (value?: string) =>
    (({
      success: en ? 'Complete' : 'Completado',
      error: en ? 'Failed' : 'Falló',
      running: en ? 'Running' : 'En ejecución',
      idle: en ? 'Not started' : 'Sin iniciar',
    } as Record<string, string>)[value || ''] ||
    value ||
    '—');

  const resolveName = (id: string, extraSources: { id: string; name: string }[] = []) => {
    if (id.startsWith('word-draft:')) return draftLabel;
    return (
      extraSources.find((item) => item.id === id)?.name ||
      files.find((item) => item.id === id)?.name ||
      (en ? 'Unavailable document' : 'Documento no disponible')
    );
  };

  const renderEvaluation = (report: EvaluationReport) => {
    const sources = [...(report.tenderSources || []), ...(report.bidSources || [])];
    const criteria = report.result?.criteria || [];
    const matchedCount = criteria.filter((item) => Boolean(item.bidSourceId)).length;
    return (
      <div className="web-review-viewer-body">
        <div className="web-review-viewer-metrics">
          <span className="web-review-viewer-metric">
            <strong>{criteria.length}</strong> {en ? 'criteria reviewed' : 'criterios revisados'}
          </span>
          <span className="web-review-viewer-metric">
            <strong>{matchedCount}</strong> {en ? 'with bid evidence' : 'con evidencia en la oferta'}
          </span>
        </div>

        {!!report.result?.unreadableDocuments?.length && (
          <p role="alert" className="web-review-hint">
            {en
              ? 'Some documents have no readable text; results may be incomplete.'
              : 'Algunos documentos no tienen texto legible; los resultados pueden estar incompletos.'}
          </p>
        )}
        {!!report.result?.discardedCount && (
          <p role="alert" className="web-review-hint">
            {en
              ? 'Some unverified criteria were omitted.'
              : 'Se omitieron algunos criterios cuya fuente no pudo verificarse.'}
          </p>
        )}

        {!criteria.length ? (
          <p className="web-review-hint">
            {en ? 'No verifiable criteria were found in the tender.' : 'No se encontraron criterios verificables en el pliego.'}
          </p>
        ) : (
          <div className="web-review-viewer-list">
            {criteria.map((item) => (
              <article key={item.id} className="web-review-viewer-item">
                <div className="web-review-viewer-item-head">
                  <strong>{item.name}</strong>
                  <span className="web-review-status-pill" data-state={item.bidSourceId ? 'succeeded' : 'queued'}>
                    {en ? 'Suggested score' : 'Puntaje sugerido'}:{' '}
                    {item.proposedPoints ?? (en ? 'N/A' : 'N/D')} /{' '}
                    {item.maxPoints ?? (en ? 'unverified' : 'sin verificar')}
                  </span>
                </div>
                {item.explanation && <p className="web-review-viewer-text">{item.explanation}</p>}
                {item.maxPointsUnverified && (
                  <p className="web-review-hint">
                    {en ? 'Maximum score could not be verified in the tender.' : 'No se pudo verificar el puntaje máximo en el pliego.'}
                  </p>
                )}
                <div className="web-review-viewer-evidence">
                  <span className="web-review-viewer-label">
                    {en ? 'Tender evidence' : 'Evidencia del pliego'} · {resolveName(item.tenderSourceId, sources)}
                  </span>
                  <blockquote className="web-review-viewer-quote">{item.tenderQuote}</blockquote>
                </div>
                <div className="web-review-viewer-evidence">
                  <span className="web-review-viewer-label">
                    {en ? 'Bid evidence' : 'Evidencia de la oferta'} ·{' '}
                    {item.bidSourceId
                      ? resolveName(item.bidSourceId, sources)
                      : en
                        ? 'No verified evidence found'
                        : 'Sin evidencia verificada en la oferta'}
                  </span>
                  {item.bidQuote && <blockquote className="web-review-viewer-quote">{item.bidQuote}</blockquote>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderBlind = (report: BlindReport) => {
    const fileName = report.sourceFile?.id ? resolveName(report.sourceFile.id, [report.sourceFile]) : '';
    const groups = report.groups || [];
    return (
      <div className="web-review-viewer-body">
        <div className="web-review-viewer-metrics">
          {fileName && (
            <span className="web-review-viewer-metric">
              <strong>{fileName}</strong>
            </span>
          )}
          <span className="web-review-viewer-metric">
            <strong>{report.summary?.total || 0}</strong> {en ? 'total findings' : 'hallazgos totales'}
          </span>
          <span className="web-review-viewer-metric">
            <strong>{report.summary?.high || 0}</strong> {en ? 'high' : 'alta'}
          </span>
          <span className="web-review-viewer-metric">
            <strong>{report.summary?.medium || 0}</strong> {en ? 'medium' : 'media'}
          </span>
          <span className="web-review-viewer-metric">
            <strong>{report.summary?.low || 0}</strong> {en ? 'low' : 'baja'}
          </span>
        </div>

        {!!report.ruleErrors?.length && (
          <p role="alert" className="web-review-hint">
            {en ? 'Some rules failed; the report is incomplete.' : 'Algunas reglas fallaron; el informe está incompleto.'}
          </p>
        )}

        {!groups.length ? (
          <p className="web-review-hint">
            {en ? 'No anonymity findings were reported.' : 'No se encontraron hallazgos de anonimato.'}
          </p>
        ) : (
          <div className="web-review-viewer-list">
            {groups.map((group, index) => (
              <details
                key={group.id}
                className="web-review-viewer-group"
                open={group.severity === 'high' || index < 2 || undefined}
              >
                <summary>
                  <span>{localizeFindingText(group.ruleTitle, language, group.category)}</span>
                  <span className="web-review-viewer-group-badges">
                    <span className="web-review-severity-pill" data-severity={group.severity}>
                      {severityLabel(group.severity)}
                    </span>
                    <span className="web-review-status-pill">{group.count}</span>
                  </span>
                </summary>
                <div className="web-review-viewer-group-body">
                  <p className="web-review-hint">{localizeFindingText(group.message, language, group.category)}</p>
                  {group.samples.map((sample, sampleIndex) => (
                    <article key={sampleIndex} className="web-review-viewer-item">
                      <span className="web-review-viewer-label">{localizeFindingLocation(sample.where, language)}</span>
                      {sample.text && <p className="web-review-viewer-text">{sample.text}</p>}
                      {sample.detail && (
                        <p className="web-review-hint">{localizeFindingText(sample.detail, language, group.category)}</p>
                      )}
                      {sample.hint && (
                        <p className="web-review-hint">{localizeFindingNote(sample.hint, language, group.category)}</p>
                      )}
                    </article>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderRejection = (report: RejectionReport) => {
    const sections: { key: string; title: string; section?: RejectionSection }[] = [
      { key: 'rejection', title: en ? 'Rejection risks' : 'Causales de rechazo', section: report.rejectionCheckResult },
      { key: 'typo', title: en ? 'Spelling' : 'Ortografía', section: report.typoCheckResult },
      { key: 'logic', title: en ? 'Logic' : 'Lógica', section: report.logicCheckResult },
    ].filter((item) => Boolean(item.section));

    const sources = report.sourceFiles || [];
    const fields: [keyof RejectionFinding, string][] = [
      ['summary', en ? 'Summary' : 'Resumen'],
      ['requirement', en ? 'Requirement' : 'Requisito'],
      ['bidEvidence', en ? 'Bid evidence' : 'Evidencia de la oferta'],
      ['riskReason', en ? 'Reason' : 'Motivo'],
      ['wrongText', en ? 'Incorrect text' : 'Texto incorrecto'],
      ['correctText', en ? 'Suggested correction' : 'Corrección sugerida'],
      ['originalExcerpt', en ? 'Original excerpt' : 'Fragmento original'],
      ['reason', en ? 'Reason' : 'Motivo'],
      ['originalText', en ? 'Original text' : 'Texto original'],
      ['fallacyReason', en ? 'Reason' : 'Motivo'],
      ['locationHint', en ? 'Location' : 'Ubicación'],
      ['suggestion', en ? 'Suggestion' : 'Sugerencia'],
    ];

    return (
      <div className="web-review-viewer-body">
        <div className="web-review-viewer-metrics">
          {sections.map(({ key, title, section }) => (
            <span key={key} className="web-review-viewer-metric">
              <strong>{section?.findings?.length || 0}</strong> {title}
            </span>
          ))}
        </div>

        {!!report.criteria?.content && (
          <details className="web-review-viewer-group">
            <summary>{en ? 'Rejection criteria checked' : 'Causales de rechazo evaluadas'}</summary>
            <div className="web-review-viewer-group-body">
              <p className="web-review-viewer-text" style={{ whiteSpace: 'pre-wrap' }}>
                {report.criteria.content}
              </p>
            </div>
          </details>
        )}

        <div className="web-review-viewer-list">
          {sections.map(({ key, title, section }) => {
            const findings = section?.findings || [];
            return (
              <details
                key={key}
                className="web-review-viewer-group"
                open={findings.length > 0 || undefined}
              >
                <summary>
                  <span>
                    {title} · {sectionStatusLabel(section?.status)}
                  </span>
                  <span className="web-review-status-pill">{findings.length}</span>
                </summary>
                <div className="web-review-viewer-group-body">
                  {section?.status === 'error' ? (
                    <p className="web-review-hint">
                      {en
                        ? 'This check failed; no conclusion is available.'
                        : 'Esta comprobación falló; no hay una conclusión disponible.'}
                    </p>
                  ) : !findings.length ? (
                    <p className="web-review-hint">
                      {en ? 'No findings were reported.' : 'No se reportaron hallazgos.'}
                    </p>
                  ) : (
                    findings.map((finding, index) => (
                      <article key={finding.id || index} className="web-review-viewer-item">
                        <div className="web-review-viewer-item-head">
                          <strong>{finding.title || finding.wrongText || title}</strong>
                          {finding.severity && (
                            <span className="web-review-severity-pill" data-severity={finding.severity}>
                              {severityLabel(finding.severity)}
                            </span>
                          )}
                        </div>
                        {finding.bidDocumentId && (
                          <span className="web-review-viewer-label">{resolveName(finding.bidDocumentId, sources)}</span>
                        )}
                        {fields.map(([field, label]) =>
                          finding[field] ? (
                            <p key={field} className="web-review-viewer-text">
                              <strong>{label}:</strong> {localizeRejectionFieldText(String(finding[field]), language)}
                            </p>
                          ) : null,
                        )}
                      </article>
                    ))
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDuplicates = (report: DuplicateReport) => (
    <div className="web-review-viewer-body web-duplicate-reviews">
      <WebDuplicateReport
        report={report}
        language={language}
        name={(id) => resolveName(id, report.sourceFiles || [])}
      />
    </div>
  );

  return (
    <section className="web-review-viewer" aria-label={`${en ? 'Results' : 'Resultados'}: ${activeResult.label}`}>
      <div className="web-review-viewer-head">
        <div>
          <h3>
            {en ? 'Results' : 'Resultados'} · {activeResult.label}
          </h3>
        </div>
        <div className="web-review-step-actions">
          <a className="web-link" href={downloadUrl} download>
            {activeResult.key === 'evaluation'
              ? en
                ? 'Export report (.md)'
                : 'Exportar informe (.md)'
              : en
                ? 'Download JSON'
                : 'Descargar JSON'}
          </a>
          <Button
            icon={ExternalLink}
            size="sm"
            variant="outline"
            onClick={() => onOpenAdvanced(activeResult.focus)}
          >
            {en ? 'Advanced view' : 'Vista avanzada'}
          </Button>
          <Button
            icon={X}
            iconOnly
            size="sm"
            variant="ghost"
            aria-label={en ? 'Close viewer' : 'Ocultar visor'}
            onClick={onClose}
          >
            {en ? 'Close' : 'Cerrar'}
          </Button>
        </div>
      </div>

      {loading && (
        <p className="web-review-hint" role="status">
          {en ? 'Loading results…' : 'Cargando resultados…'}
        </p>
      )}
      {failed && (
        <div className="web-review-inline-row" role="alert">
          <p className="web-review-hint">{en ? 'Could not load the results.' : 'No se pudieron cargar los resultados.'}</p>
          <Button
            icon={RefreshCw}
            size="sm"
            variant="outline"
            onClick={() => setReloadCount((value) => value + 1)}
          >
            {en ? 'Retry' : 'Reintentar'}
          </Button>
        </div>
      )}
      {!loading && !failed && data !== null && (
        <>
          {activeResult.key === 'evaluation' && renderEvaluation(data as EvaluationReport)}
          {activeResult.key === 'blind' && renderBlind(data as BlindReport)}
          {activeResult.key === 'rejection' && renderRejection(data as RejectionReport)}
          {activeResult.key === 'duplicates' && renderDuplicates(data as DuplicateReport)}
        </>
      )}
    </section>
  );
}
