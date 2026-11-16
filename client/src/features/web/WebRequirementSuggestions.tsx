import {ScanText, Square} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';

type Suggestion = { id: string; title: string; category: string; sourceId: string; quote: string; factIds: string[] };
type Job = { id: string; state: string; stale: boolean; result: { requirements?: Suggestion[]; sources?: { id: string; name: string }[]; facts?: { id: string; label: string; value: string; page: number }[]; discardedCount?: number; discardedLinks?: number; unreadableSources?: { id: string; name: string }[]; message?: string } | null; accepted: { suggestionId: string; requirementId: string }[] };
type Requirement = { id: string; title: string; source: string; evidence: string; status: string; category: string; version: number };
export default function WebRequirementSuggestions({ projectId, language, fileIds, credentialId, credentialLabel, onAccepted }: { projectId: string; language: 'es' | 'en'; fileIds: string[]; credentialId: string; credentialLabel: string; onAccepted: (item: Requirement) => void }) {
  const en = language === 'en', { showToast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]), [includeRup, setIncludeRup] = useState(false), [consentFor, setConsentFor] = useState(''), [busy, setBusy] = useState(false), [loadError, setLoadError] = useState(false);
  const submission = useRef<{ fingerprint: string; key: string } | null>(null), selection = JSON.stringify([credentialId, fileIds, includeRup]);
  const consent = true;
  useEffect(() => { setConsentFor(''); }, [selection]);
  useEffect(() => {
    let active = true;
    const load = async () => { const result = await request<{ jobs: Job[] }>(`/api/projects/${projectId}/requirement-suggestions`); if (active) { setJobs(items => [...items.filter(item => !result.jobs.some(job => job.id === item.id)), ...result.jobs]); setLoadError(false); } };
    void load().catch(() => { if (active) setLoadError(true); }); const timer = window.setInterval(() => void load().catch(() => { if (active) setLoadError(true); }), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [projectId]);
  const queue = async () => {
    if (busy || !fileIds.length || !credentialId || !consent) return;
    const payload = { fileIds, language, dataProcessingConsent: true, includeRup }, fingerprint = JSON.stringify({ payload, credentialId });
    if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    try {
      const created = await request<{ job: { id: string; state: string } }>(`/api/projects/${projectId}/jobs`, { method: 'POST', headers: { 'idempotency-key': submission.current.key }, json: { kind: 'requirements.suggest', credentialId, payload } });
      setJobs(items => [{ id: created.job.id, state: created.job.state, stale: false, result: null, accepted: [] }, ...items.filter(item => item.id !== created.job.id)]); submission.current = null;
      showToast(en ? 'Analysis queued for the local runner.' : 'Análisis en cola para el runner local.', 'success');
    } catch (error) { const conflict = (error as Error & { status?: number }).status === 409; showToast(conflict ? (en ? 'Sources changed or an analysis is already running. Refresh and review the task status.' : 'Las fuentes cambiaron o ya hay un análisis en curso. Actualiza y revisa el estado de las tareas.') : (en ? 'Could not start the analysis. Check the selected sources and RUP.' : 'No se pudo iniciar el análisis. Revisa los documentos seleccionados y el RUP.'), 'error'); }
    finally { setBusy(false); }
  };
  const cancel = async (job: Job) => { setBusy(true); try { await request(`/api/projects/${projectId}/jobs/${job.id}/cancel`, { method: 'POST' }); setJobs(items => items.map(item => item.id === job.id ? { ...item, state: 'cancelled' } : item)); } catch { showToast(en ? 'Could not cancel the task.' : 'No se pudo cancelar la tarea.', 'error'); } finally { setBusy(false); } };
  const accept = async (job: Job, suggestion: Suggestion) => { setBusy(true); try { const result = await request<{ item: Requirement }>(`/api/projects/${projectId}/requirement-suggestions/${job.id}/accept`, { method: 'POST', json: { suggestionId: suggestion.id } }); onAccepted(result.item); setJobs(items => items.map(item => ({ ...item, accepted: [...item.accepted.filter(entry => entry.suggestionId !== suggestion.id), { suggestionId: suggestion.id, requirementId: result.item.id }] }))); showToast(en ? 'Added as pending.' : 'Agregado como pendiente.', 'success'); } catch (error) { const conflict = (error as Error & { status?: number }).status === 409; showToast(conflict ? (en ? 'Sources changed. Run a new analysis.' : 'Las fuentes cambiaron. Ejecuta un nuevo análisis.') : (en ? 'Could not add the requirement.' : 'No se pudo agregar el requisito.'), 'error'); } finally { setBusy(false); } };
  return <details className="web-plan-generation"><summary><strong>{en ? 'Suggest requirements with Pi' : 'Sugerir requisitos con Pi'}</strong></summary><p>{en ? 'Uses the documents and model selected above. Review each quote; a suggestion does not establish compliance.' : 'Usa los documentos y el modelo seleccionados arriba. Revisa cada cita; una sugerencia no determina cumplimiento.'}</p>
    <p>{en ? `Selected documents: ${fileIds.length}. Model: ${credentialLabel || 'none'}.` : `Documentos seleccionados: ${fileIds.length}. Modelo: ${credentialLabel || 'ninguno'}.`}</p>
    <label className="web-consent"><input type="checkbox" checked={includeRup} disabled={busy} onChange={event => { setIncludeRup(event.target.checked); setConsentFor(''); }} />{en ? 'Include reviewed RUP data as possible matches.' : 'Incluir datos revisados del RUP como posibles coincidencias.'}</label>
    <></>
    <></>
    <Button icon={ScanText} type="button" size="sm" variant="outline" disabled={busy || !fileIds.length || !credentialId || !consent || jobs.some(job => ['queued', 'running'].includes(job.state))} onClick={() => void queue()}>{en ? 'Analyze documents' : 'Analizar documentos'}</Button>{loadError && <p role="status">{en ? 'Could not refresh task status; retrying.' : 'No se pudo actualizar el estado; se reintentará.'}</p>}
    {jobs.map(job => <article key={job.id}><strong>{({ queued: en ? 'Queued' : 'En cola', running: en ? 'Running' : 'En ejecución', succeeded: en ? 'Ready for review' : 'Listo para revisión', failed: en ? 'Failed' : 'Falló', cancelled: en ? 'Cancelled' : 'Cancelado', interrupted: en ? 'Interrupted' : 'Interrumpido' } as Record<string, string>)[job.state] || job.state}</strong>{job.stale && <p role="status">{en ? 'The sources changed. Run the analysis again before adding suggestions.' : 'Las fuentes cambiaron. Ejecuta un nuevo análisis antes de agregar sugerencias.'}</p>}{job.result?.message && <p>{job.result.message}</p>}{Boolean(job.result?.discardedCount || job.result?.discardedLinks) && <p>{en ? `Unsupported suggestions: ${job.result?.discardedCount || 0}; invalid links: ${job.result?.discardedLinks || 0}.` : `Sugerencias sin respaldo: ${job.result?.discardedCount || 0}; enlaces no válidos: ${job.result?.discardedLinks || 0}.`}</p>}{!!job.result?.unreadableSources?.length && <p>{en ? 'Unreadable sources' : 'Fuentes sin texto legible'}: {job.result.unreadableSources.map(item => item.name).join(', ')}.</p>}{job.state === 'succeeded' && job.result?.requirements?.length === 0 && <p>{en ? 'No verifiable requirements found.' : 'No se encontraron requisitos verificables.'}</p>}
      {job.result?.requirements?.map(item => { const accepted = job.accepted.some(entry => entry.suggestionId === item.id), source = job.result?.sources?.find(entry => entry.id === item.sourceId); return <div key={item.id}><strong>{item.title}</strong><p>{source?.name || item.sourceId} · <a href={`/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(item.sourceId)}`} download>{en ? 'Download source' : 'Descargar fuente'}</a></p><blockquote>{item.quote}</blockquote>{!!item.factIds?.length && <p>{en ? 'Possible RUP data to review' : 'Posibles datos del RUP para revisar'}: {item.factIds.map(id => { const fact = job.result?.facts?.find(value => value.id === id); return fact ? `${fact.label} · ${fact.value} · ${en ? 'page' : 'página'} ${fact.page}` : id; }).join('; ')}.</p>}<Button type="button" size="sm" variant="outline" disabled={busy || job.stale || accepted} onClick={() => void accept(job, item)}>{accepted ? (en ? 'Added as pending' : 'Agregado como pendiente') : (en ? 'Add to matrix' : 'Agregar a la matriz')}</Button></div>; })}{['queued', 'running'].includes(job.state) && <Button icon={Square} type="button" size="sm" variant="outline" disabled={busy} onClick={() => void cancel(job)}>{en ? 'Cancel task' : 'Cancelar tarea'}</Button>}</article>)}
  </details>;
}
