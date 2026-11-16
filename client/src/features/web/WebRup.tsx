import {WebLoading} from './WebLoading';
import { ExternalLink, FileCheck2, Plus, RefreshCw, Save, ScanText, Square, Trash2, Upload } from 'lucide-react';
import { WebJobProgress } from './WebJobProgress';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import AppDialog from '@/shared/ui/AppDialog';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';

type Certificate = { id: string; name: string; pages: number; issuedOn: string };
type Fact = { id: string; certificateId: string; label: string; value: string; page: number; version: number };
type FactInput = { label: string; value: string; page: number };
type Credential = { id: string; provider: string; model: string };
type Suggestion = { label: string; value: string; page: number; quote: string };
type AnalysisJob = {
  id: string;
  state: string;
  progress?: string | null;
  payload: { certificateId: string; certificateVersion: number };
  result: { suggestions?: Suggestion[]; rejectedCount?: number; pagesWithoutText?: number[]; message?: string } | null;
};

function FactEditor({
  fact,
  pages,
  en,
  busy,
  onSave,
  onRemove,
  onDirty,
}: {
  fact: Fact;
  pages: number;
  en: boolean;
  busy: boolean;
  onSave: (fact: Fact, input: FactInput) => void;
  onRemove: (fact: Fact) => void;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const [label, setLabel] = useState(fact.label);
  const [value, setValue] = useState(fact.value);
  const [page, setPage] = useState(String(fact.page));
  const dirty = label !== fact.label || value !== fact.value || page !== String(fact.page);

  useEffect(() => {
    onDirty(fact.id, dirty);
    return () => onDirty(fact.id, false);
  }, [dirty, fact.id, onDirty]);

  return (
    <form
      className="web-rup-fact-row"
      onSubmit={event => {
        event.preventDefault();
        onSave(fact, { label, value, page: Number(page) });
      }}
    >
      <label>
        <span>{en ? 'Data' : 'Dato'}</span>
        <Input required maxLength={300} disabled={busy} value={label} onChange={event => setLabel(event.target.value)} />
      </label>
      <label>
        <span>{en ? 'Value' : 'Valor'}</span>
        <Input required maxLength={300} disabled={busy} value={value} onChange={event => setValue(event.target.value)} />
      </label>
      <label className="web-rup-page-field">
        <span>{en ? 'PDF page' : 'Página del PDF'}</span>
        <Input required type="number" min="1" max={pages} step="1" disabled={busy} value={page} onChange={event => setPage(event.target.value)} />
      </label>
      <div className="web-inline web-rup-fact-actions">
        <Button
          icon={Save}
          type="submit"
          size="sm"
          variant="outline"
          disabled={busy || !dirty || !label.trim() || !value.trim() || !Number.isInteger(Number(page)) || Number(page) < 1 || Number(page) > pages}
        >
          {en ? 'Save' : 'Guardar'}
        </Button>
        <Button icon={Trash2} iconOnly type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(fact)}>
          {en ? 'Remove' : 'Eliminar'}
        </Button>
        {dirty && <span role="status">{en ? 'Unsaved changes' : 'Cambios sin guardar'}</span>}
      </div>
    </form>
  );
}

export default function WebRup({
  language,
  onDirtyChange,
  credentials,
}: {
  language: 'es' | 'en';
  onDirtyChange: (dirty: boolean) => void;
  credentials: Credential[];
}) {
  const en = language === 'en';
  const { showToast } = useToast();
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [version, setVersion] = useState(0);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [issuedOn, setIssuedOn] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const analysisCredential = credentials[0]?.id || '';
  const [analysisConsent, setAnalysisConsent] = useState(true);
  const [analyses, setAnalyses] = useState<AnalysisJob[]>([]);
  const analysisSubmission = useRef<{ fingerprint: string; key: string } | null>(null);

  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [page, setPage] = useState('');
  const [formRevision, setFormRevision] = useState(0);
  const [dirtyFacts, setDirtyFacts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState<{ text: string; action: () => void } | null>(null);

  const dirty = Boolean(file || label.trim() || value.trim() || page || dirtyFacts.length || (certificate && issuedOn !== certificate.issuedOn));

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const markDirty = useState(
    () => (id: string, next: boolean) => setDirtyFacts(items => (next ? (items.includes(id) ? items : [...items, id]) : items.filter(v => v !== id))),
  )[0];

  const load = async () => {
    const [info, reviewed] = await Promise.all([
      request<{ certificate: Certificate | null; version: number }>('/api/rup/certificate'),
      request<{ facts: Fact[]; certificateId: string | null; version: number }>('/api/rup/facts'),
    ]);
    if (info.version !== reviewed.version || (info.certificate?.id || null) !== reviewed.certificateId) throw new Error('version_conflict');
    setCertificate(info.certificate);
    setVersion(info.version);
    setFacts(reviewed.facts);
    setIssuedOn(info.certificate?.issuedOn || '');
    setConflict(false);
    setFailed(false);
  };

  useEffect(() => {
    let active = true;
    void load()
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const changed = (error as Error & { status?: number }).status === 409 || (error as Error).message === 'version_conflict';
      if (changed) setConflict(true);
      showToast(
        changed
          ? en
            ? 'The certificate or data changed in another session. Copy your edits and reload.'
            : 'El certificado o los datos cambiaron en otra sesión. Copia tus cambios y vuelve a cargar.'
          : en
            ? 'The action could not be completed.'
            : 'No se pudo completar la acción.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const reload = () => {
    const action = () =>
      void run(async () => {
        await load();
        setFile(null);
        if (fileInput.current) fileInput.current.value = '';
        setLabel('');
        setValue('');
        setPage('');
        setDirtyFacts([]);
        setFormRevision(v => v + 1);
      });
    if (dirty) {
      setConfirm({
        text: en ? 'Discard unsaved RUP changes and reload?' : '¿Descartar los cambios sin guardar del RUP y volver a cargar?',
        action,
      });
    } else action();
  };

  const importPdf = () => {
    if (!file) return;
    const action = () =>
      void run(async () => {
        const response = await fetch('/api/rup/certificate', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/pdf',
            'x-file-name': encodeURIComponent(file.name),
            'x-rup-version': String(version),
          },
          body: file,
        });
        if (!response.ok) throw Object.assign(new Error('upload_failed'), { status: response.status });
        const next = (await response.json()) as { certificate: Certificate; version: number };
        setCertificate(next.certificate);
        setVersion(next.version);
        setIssuedOn('');
        setFacts([]);
        setFile(null);
        if (fileInput.current) fileInput.current.value = '';
        setLabel('');
        setValue('');
        setPage('');
        setDirtyFacts([]);
        setAnalysisConsent(true);
        setConflict(false);
        showToast(en ? 'RUP saved.' : 'RUP guardado.', 'success');
      });
    if (certificate) {
      setConfirm({
        text: en
          ? 'Replace the current RUP? Its reviewed data will no longer appear in the current certificate.'
          : '¿Reemplazar el RUP actual? Sus datos revisados dejarán de aparecer en el certificado vigente.',
        action,
      });
    } else action();
  };

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const data = await request<{ jobs: AnalysisJob[] }>('/api/rup/analyses');
      if (active) setAnalyses(items => [...items.filter(item => !data.jobs.some(job => job.id === item.id)), ...data.jobs]);
    };
    void refresh().catch(() => undefined);
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const queueAnalysis = () => {
    if (!certificate || !analysisCredential || !analysisConsent || busy) return;
    void run(async () => {
      const input = {
        certificateId: certificate.id,
        certificateVersion: version,
        credentialId: analysisCredential,
        language,
        dataProcessingConsent: true,
      };
      const fingerprint = JSON.stringify(input);
      if (analysisSubmission.current?.fingerprint !== fingerprint) {
        analysisSubmission.current = { fingerprint, key: crypto.randomUUID() };
      }
      const result = await request<{ job: AnalysisJob }>('/api/rup/analyses', {
        method: 'POST',
        headers: { 'idempotency-key': analysisSubmission.current.key },
        json: input,
      });
      setAnalyses(items => [result.job, ...items.filter(item => item.id !== result.job.id)]);
      analysisSubmission.current = null;
      showToast(en ? 'RUP analysis queued for the local runner.' : 'Análisis del RUP en cola para el runner local.', 'success');
    });
  };

  const cancelAnalysis = (job: AnalysisJob) =>
    void run(async () => {
      await request(`/api/rup/analyses/${job.id}/cancel`, { method: 'POST' });
      setAnalyses(items => items.map(item => (item.id === job.id ? { ...item, state: 'cancelled' } : item)));
    });

  const useSuggestion = (suggestion: Suggestion) => {
    const action = () => {
      setLabel(suggestion.label);
      setValue(suggestion.value);
      setPage(String(suggestion.page));
    };
    if (label.trim() || value.trim() || page) {
      setConfirm({
        text: en ? 'Replace the new data you are editing with this suggestion?' : '¿Reemplazar el dato nuevo que estás editando por esta sugerencia?',
        action,
      });
    } else action();
  };

  const saveDate = () =>
    void run(async () => {
      const next = await request<{ certificate: Certificate; version: number }>('/api/rup/certificate', {
        method: 'PATCH',
        json: { issuedOn, version },
      });
      setCertificate(next.certificate);
      setVersion(next.version);
    });

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!certificate) return;
    void run(async () => {
      const result = await request<{ fact: Fact }>('/api/rup/facts', {
        method: 'POST',
        json: { certificateId: certificate.id, certificateVersion: version, label, value, page: Number(page) },
      });
      setFacts(items => [...items, result.fact]);
      setLabel('');
      setValue('');
      setPage('');
    });
  };

  const save = (fact: Fact, input: FactInput) => {
    if (!certificate) return;
    void run(async () => {
      const result = await request<{ fact: Fact }>(`/api/rup/facts/${fact.id}`, {
        method: 'PATCH',
        json: { ...input, version: fact.version, certificateId: certificate.id, certificateVersion: version },
      });
      setFacts(items => items.map(item => (item.id === fact.id ? result.fact : item)));
    });
  };

  const remove = (fact: Fact) => {
    if (!certificate) return;
    setConfirm({
      text: en ? `Remove “${fact.label}”?` : `¿Eliminar «${fact.label}»?`,
      action: () =>
        void run(async () => {
          await request(`/api/rup/facts/${fact.id}`, {
            method: 'DELETE',
            json: { version: fact.version, certificateId: certificate.id, certificateVersion: version },
          });
          setFacts(items => items.filter(item => item.id !== fact.id));
        }),
    });
  };

  return (
    <section className="web-company-section">
      <div className="web-secop-heading web-company-heading">
        <div>
          <h2>{en ? 'RUP certificate (Single Registry of Bidders)' : 'Certificado RUP (Registro Único de Proponentes)'}</h2>
          <p>
            {en
              ? 'Save a copy and review its data. Savia does not verify the certificate with the chamber.'
              : 'Guarda una copia y revisa sus datos. Savia no verifica el certificado ante la cámara.'}
          </p>
        </div>
        <Button icon={RefreshCw} iconOnly type="button" size="sm" variant="outline" disabled={busy || loading} onClick={reload}>
          {en ? 'Reload' : 'Volver a cargar'}
        </Button>
      </div>

      {loading ? (
        <WebLoading message={en?'Loading…':'Cargando…'}/>
      ) : (
        <>
          {(failed || conflict) && (
            <div role="alert" className="web-market-alert">
              <p>{en ? 'Reload the RUP information to continue.' : 'Vuelve a cargar la información del RUP para continuar.'}</p>
            </div>
          )}

          <div className="web-company-card web-rup-upload-card">
            <div className="web-rup-upload-grid">
              <div className="web-rup-file-field">
                <span>{en ? 'RUP PDF (up to 25 MiB)' : 'PDF del RUP (hasta 25 MiB)'}</span>
                <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden aria-label={en ? 'Choose RUP PDF' : 'Seleccionar PDF del RUP'} disabled={busy || failed || conflict} onChange={event => setFile(event.target.files?.[0] || null)} />
                <div className="web-rup-file-choice">
                  <Button icon={Upload} type="button" size="sm" variant="outline" disabled={busy || failed || conflict} onClick={() => fileInput.current?.click()}>{en ? 'Choose PDF' : 'Seleccionar PDF'}</Button>
                  <span title={file?.name} role="status">{file?.name || (en ? 'No file selected' : 'Ningún archivo seleccionado')}</span>
                </div>
              </div>
              <Button icon={Upload} type="button" size="sm" variant="outline" disabled={busy || failed || conflict || !file} onClick={importPdf}>
                {en ? 'Save PDF' : 'Guardar PDF'}
              </Button>
            </div>

            {certificate && (
              <div className="web-rup-current">
                <div className="web-company-card-title-row">
                  <FileCheck2 size={16} aria-hidden="true" />
                  <strong>{certificate.name}</strong>
                  <span className="web-market-badge is-subtle">
                    {certificate.pages} {en ? 'pages' : 'páginas'}
                  </span>
                  <a
                    href={`/api/rup/certificates/${encodeURIComponent(certificate.id)}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="web-market-record-link"
                  >
                    <span>{en ? 'Open PDF' : 'Abrir PDF'}</span>
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                </div>
                <div className="web-rup-date-row">
                  <label>
                    <span>{en ? 'Issue date (optional)' : 'Fecha de expedición (opcional)'}</span>
                    <Input type="date" value={issuedOn} disabled={busy || failed || conflict} onChange={event => setIssuedOn(event.target.value)} />
                  </label>
                  <Button
                    icon={Save}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || failed || conflict || issuedOn === certificate.issuedOn}
                    onClick={saveDate}
                  >
                    {en ? 'Save date' : 'Guardar fecha'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {certificate && (
            <>
              <section className="web-company-card web-stack">
                <div className="web-secop-heading">
                  <div>
                    <h3>{en ? 'Analyze RUP with Pi' : 'Analizar RUP con Pi'}</h3>
                    <p>
                      {en
                        ? 'Extract UNSPSC codes, financial indicators and capacities automatically from the PDF.'
                        : 'Extrae automáticamente códigos UNSPSC, indicadores financieros y capacidades desde el PDF.'}
                    </p>
                  </div>
                  <Button
                    icon={ScanText}
                    type="button"
                    size="sm"
                    disabled={
                      busy ||
                      failed ||
                      conflict ||
                      !!file ||
                      issuedOn !== certificate.issuedOn ||
                      !analysisCredential ||
                      !analysisConsent ||
                      analyses.some(
                        job =>
                          job.payload.certificateId === certificate.id &&
                          job.payload.certificateVersion === version &&
                          ['queued', 'running'].includes(job.state),
                      )
                    }
                    onClick={queueAnalysis}
                  >
                    {en ? 'Analyze certificate' : 'Analizar certificado'}
                  </Button>
                </div>

                {analyses.map(job => {
                  const stale = job.payload.certificateId !== certificate.id || job.payload.certificateVersion !== version;
                  return (
                    <article key={job.id} className="web-rup-job">
                      <div className="web-company-card-title-row">
                        <strong>
                          {(
                            {
                              queued: en ? 'Queued' : 'En cola',
                              running: en ? 'Running' : 'En ejecución',
                              succeeded: en ? 'Ready for review' : 'Listo para revisión',
                              failed: en ? 'Failed' : 'Falló',
                              cancelled: en ? 'Cancelled' : 'Cancelado',
                              interrupted: en ? 'Interrupted' : 'Interrumpido',
                            } as Record<string, string>
                          )[job.state] || job.state}
                        </strong>
                        {['queued', 'running'].includes(job.state) && (
                          <Button icon={Square} type="button" size="sm" variant="outline" disabled={busy} onClick={() => cancelAnalysis(job)}>
                            {en ? 'Cancel task' : 'Cancelar tarea'}
                          </Button>
                        )}
                      </div>
                      <WebJobProgress state={job.state} progress={job.progress} language={language} />
                      {stale && (
                        <p>{en ? 'The certificate changed; analyze the current version again.' : 'El certificado cambió; vuelve a analizar la versión actual.'}</p>
                      )}
                      {job.result?.message && <p>{job.result.message}</p>}
                      {job.result?.rejectedCount ? (
                        <p>{en ? `Unsupported suggestions discarded: ${job.result.rejectedCount}.` : `Sugerencias sin respaldo descartadas: ${job.result.rejectedCount}.`}</p>
                      ) : null}
                      {!!job.result?.pagesWithoutText?.length && (
                        <p>
                          {en ? 'Pages without readable text' : 'Páginas sin texto legible'}: {job.result.pagesWithoutText.join(', ')}.
                        </p>
                      )}
                      {job.state === 'succeeded' && job.result?.suggestions?.length === 0 && (
                        <p>{en ? 'No verifiable suggestions were found. Review the certificate manually.' : 'No se encontraron sugerencias verificables. Revisa el certificado manualmente.'}</p>
                      )}
                      {!!job.result?.suggestions?.length && (
                        <div className="web-rup-suggestions">
                          {job.result.suggestions.map((suggestion, index) => (
                            <div key={index} className="web-rup-suggestion">
                              <div>
                                <strong>{suggestion.label}</strong>
                                <p>
                                  {suggestion.value} · {en ? 'page' : 'página'} {suggestion.page}
                                </p>
                                <blockquote>{suggestion.quote}</blockquote>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy || failed || conflict || stale}
                                onClick={() => useSuggestion(suggestion)}
                              >
                                {en ? 'Review as new data' : 'Revisar como dato nuevo'}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>

              <section className="web-company-card web-stack">
                <div>
                  <h3>{en ? 'Reviewed data' : 'Datos revisados'}</h3>
                  <p>{en ? 'Check each value against the indicated PDF page.' : 'Comprueba cada valor en la página indicada del PDF.'}</p>
                </div>

                {facts.length ? (
                  <div className="web-rup-facts-list">
                    {facts.map(fact => (
                      <FactEditor
                        key={`${formRevision}:${fact.id}:${fact.version}`}
                        fact={fact}
                        pages={certificate.pages}
                        en={en}
                        busy={busy || failed || conflict}
                        onSave={save}
                        onRemove={remove}
                        onDirty={markDirty}
                      />
                    ))}
                  </div>
                ) : (
                  <p>{en ? 'No reviewed data yet.' : 'Aún no hay datos revisados.'}</p>
                )}

                <form className="web-rup-fact-row web-rup-add-row" onSubmit={add}>
                  <label>
                    <span>{en ? 'New data' : 'Nuevo dato'}</span>
                    <Input required maxLength={300} disabled={busy || failed || conflict} value={label} onChange={event => setLabel(event.target.value)} />
                  </label>
                  <label>
                    <span>{en ? 'Value' : 'Valor'}</span>
                    <Input required maxLength={300} disabled={busy || failed || conflict} value={value} onChange={event => setValue(event.target.value)} />
                  </label>
                  <label className="web-rup-page-field">
                    <span>{en ? 'PDF page' : 'Página del PDF'}</span>
                    <Input
                      required
                      type="number"
                      min="1"
                      max={certificate.pages}
                      step="1"
                      disabled={busy || failed || conflict}
                      value={page}
                      onChange={event => setPage(event.target.value)}
                    />
                  </label>
                  <div className="web-inline web-rup-fact-actions">
                    <Button
                      icon={Plus}
                      type="submit"
                      size="sm"
                      disabled={
                        busy ||
                        failed ||
                        conflict ||
                        !label.trim() ||
                        !value.trim() ||
                        !Number.isInteger(Number(page)) ||
                        Number(page) < 1 ||
                        Number(page) > certificate.pages
                      }
                    >
                      {en ? 'Add reviewed data' : 'Agregar dato revisado'}
                    </Button>
                  </div>
                </form>
              </section>
            </>
          )}
        </>
      )}

      <AppDialog
        open={!!confirm}
        onOpenChange={open => {
          if (!open && !busy) setConfirm(null);
        }}
        title={en ? 'Confirm change' : 'Confirmar cambio'}
        description={confirm?.text || ''}
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              {en ? 'Cancel' : 'Cancelar'}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const action = confirm?.action;
                setConfirm(null);
                action?.();
              }}
            >
              {en ? 'Continue' : 'Continuar'}
            </Button>
          </>
        }
      />
    </section>
  );
}
