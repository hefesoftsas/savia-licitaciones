import {Save, Trash2, Plus, FileDown, FileSpreadsheet, CircleHelp, FileText, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, RefreshCw} from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useState, type FormEvent } from 'react';
import AppDialog from '@/shared/ui/AppDialog';
import { useToast } from '@/shared/ui/ToastProvider';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from '@/shared/ui/primitives/tooltip';
import RupPdfPreview from '@/shared/ui/RupPdfPreview';
import WebWordDocument from './WebWordDocument';
import { request } from './api.mjs';
import WebRupComparison from './WebRupComparison';
import WebRequirementSuggestions from './WebRequirementSuggestions';
import WebImportedRupComparisons from './WebImportedRupComparisons';
import WebOpportunityTracking from './WebOpportunityTracking';
import WebRequirementSupports from './WebRequirementSupports';
import WebSubmissionTracking from './WebSubmissionTracking';
import WebOfferDocuments from './WebOfferDocuments';
import WebSubmissionRecords from './WebSubmissionRecords';
import {WebWorkflowHelp} from './WebWorkflowHelp';

const WordCanvas = lazy(() => import('./WebWordCanvas'));

type Language = 'es' | 'en';
type Focus = 'prepare' | 'submit' | 'after';
const focusList: Focus[] = ['prepare', 'submit', 'after'];
const focusFromUrl = (projectId: string): Focus | null => { const params = new URLSearchParams(window.location.search); const value = params.get('tracking'); return params.get('project') === projectId && params.get('tab') === 'tracking' && (value === 'prepare' || value === 'submit' || value === 'after') ? value : null; };

type Stage = 'evaluating' | 'preparing' | 'submitted' | 'awarded' | 'not_awarded' | 'discarded';
type Task = { id: string; title: string; dueDate: string; completed: boolean; version: number };
type Requirement = { id: string; title: string; source: string; evidence: string; status: string; category: string; version: number };
type ProjectFile = { id: string; name: string; size: number; deleting?: number | boolean };
const stages: Stage[] = ['evaluating', 'preparing', 'submitted', 'awarded', 'not_awarded', 'discarded'];
const stageNames = { es: ['Por evaluar', 'Preparando', 'Presentada', 'Adjudicada', 'No adjudicada', 'Descartada'], en: ['To evaluate', 'Preparing', 'Submitted', 'Awarded', 'Not awarded', 'Discarded'] };
const categories = ['general', 'legal', 'financial', 'technical', 'experience'];
const categoryNames = { es: ['General', 'Jurídico', 'Financiero', 'Técnico', 'Experiencia'], en: ['General', 'Legal', 'Financial', 'Technical', 'Experience'] };
const statuses = ['pending', 'meets', 'does_not_meet', 'unknown'];
const statusNames = { es: ['Pendiente', 'Cumple', 'No cumple', 'No determinado'], en: ['Pending', 'Meets', 'Does not meet', 'Undetermined'] };

function WorkflowSourceReader({ projectId, file, en }: { projectId: string; file: { id: string; name: string } | null; en: boolean }) {
  const [source, setSource] = useState<{ bytes?: Uint8Array; text?: string }>({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const extension = file?.name.split('.').pop()?.toLowerCase();
  const supported = ['pdf', 'txt', 'md', 'markdown', 'docx'].includes(extension || '');

  useEffect(() => {
    setSource({});
    setFailed(false);
    setLoading(false);
    if (!file || !supported) return;
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(file.id)}`, { signal: controller.signal });
        if (!response.ok) throw Error();
        const buffer = await response.arrayBuffer();
        if (controller.signal.aborted) return;
        if (extension === 'pdf' || extension === 'docx') {
          setSource({ bytes: new Uint8Array(buffer) });
        } else {
          setSource({ text: new TextDecoder().decode(buffer) });
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [projectId, file?.id, extension, supported, retry]);

  if (!file) return <p className="web-wizard-reader-empty">{en ? 'Choose a document to read it here.' : 'Elige un documento para leerlo aquí.'}</p>;
  return (
    <div className="web-wizard-reader-body">
      {loading && <p role="status">{en ? 'Opening document…' : 'Abriendo documento…'}</p>}
      {failed && (
        <div role="alert">
          <p>{en ? 'Could not open this document.' : 'No se pudo abrir este documento.'}</p>
          <Button icon={RefreshCw} iconOnly variant="outline" onClick={() => setRetry(value => value + 1)}>
            {en ? 'Retry' : 'Reintentar'}
          </Button>
        </div>
      )}
      {!supported && <p>{en ? 'Preview is not available for this format. Download it to read it.' : 'Este formato no tiene vista previa. Descárgalo para leerlo.'}</p>}
      {source.bytes && extension === 'pdf' && <RupPdfPreview key={file.id} bytes={source.bytes} en={en} />}
      {source.bytes && extension === 'docx' && (
        <div className="web-source-word">
          <WebWordDocument key={file.id} language={en ? 'en' : 'es'} name={file.name} url={`/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(file.id)}`} label={en ? 'View Word document' : 'Ver documento Word'} />
          <div className="web-source-word-preview">
            <Suspense fallback={<p>{en ? 'Opening Word…' : 'Abriendo Word…'}</p>}>
              <WordCanvas bytes={source.bytes} name={file.name} language={en ? 'en' : 'es'} />
            </Suspense>
          </div>
        </div>
      )}
      {source.text !== undefined && (
        <>
          <small>{en ? 'Text preview; original formatting is available in the download.' : 'Vista de texto; el formato original se conserva en la descarga.'}</small>
          <pre>{source.text || (en ? 'No readable text found.' : 'No se encontró texto legible.')}</pre>
        </>
      )}
      {(!supported || failed) && <a href={`/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(file.id)}`}>{en ? 'Download document' : 'Descargar documento'}</a>}
    </div>
  );
}

function RequirementForm({ item, language, busy, save, remove, projectId, onDirty }: { item: Requirement; language: Language; busy: boolean; save: (item: Requirement) => void; remove: (item: Requirement) => void; projectId: string; onDirty: (id: string, value: boolean) => void }) {
  const [draft, setDraft] = useState(item), en = language === 'en';
  const dirty = ['title', 'source', 'evidence', 'status', 'category'].some(key => draft[key as keyof Requirement] !== item[key as keyof Requirement]);
  useEffect(() => { onDirty(`requirement:${item.id}`, dirty); return () => onDirty(`requirement:${item.id}`, false); }, [item.id, dirty, onDirty]);
  return <><form className="web-workflow-row web-stack" onSubmit={event => { event.preventDefault(); save({ ...draft, version: item.version }); }}><label>{en ? 'Requirement' : 'Requisito'}<Input disabled={busy} maxLength={300} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} required /></label><div className="web-workflow-fields"><label>{en ? 'Category' : 'Categoría'}<select disabled={busy} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>{categories.map((value, i) => <option value={value} key={value}>{categoryNames[language][i]}</option>)}</select></label><label>{en ? 'Review' : 'Valoración'}<select disabled={busy} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>{statuses.map((value, i) => <option value={value} key={value}>{statusNames[language][i]}</option>)}</select></label><label>{en ? 'Tender source' : 'Fuente del pliego'}<textarea disabled={busy} value={draft.source} maxLength={20000} onChange={e => setDraft({ ...draft, source: e.target.value })} /></label><label>{en ? 'Evidence' : 'Soporte'}<Input disabled={busy} value={draft.evidence} maxLength={300} onChange={e => setDraft({ ...draft, evidence: e.target.value })} /></label></div><div className="web-inline"><Button icon={Save} type="submit" size="sm" variant="outline" disabled={busy || !dirty || !draft.title.trim()}>{en ? 'Save' : 'Guardar'}</Button><Button icon={Trash2} iconOnly type="button" size="sm" variant="ghost" disabled={busy} onClick={() => remove(item)}>{en ? 'Remove' : 'Eliminar'}</Button>{dirty && <span role="status">{en ? 'Unsaved changes' : 'Cambios sin guardar'}</span>}</div></form><WebRequirementSupports projectId={projectId} requirementId={item.id} language={language} onDirty={onDirty} /><WebRupComparison projectId={projectId} requirementId={item.id} requirementVersion={item.version} requirementDirty={dirty} title={item.title} source={item.source} language={language} onDirty={onDirty} /></>;
}

export default function WebWorkflow({ projectId, language, onDirtyChange, fileIds, projectFiles, credentialId, credentialLabel }: { projectId: string; language: Language; onDirtyChange: (dirty: boolean) => void; fileIds: string[]; projectFiles: ProjectFile[]; credentialId: string; credentialLabel: string }) {
  const en = language === 'en', { showToast } = useToast(), base = `/api/projects/${projectId}/workflow`;
  const [focus, setFocus] = useState<Focus>(() => focusFromUrl(projectId) || 'prepare');
  const [expanded, setExpanded] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const availableFiles = projectFiles.filter(file => !file.deleting && !/\.zip$/i.test(file.name));
  const [readerFile, setReaderFile] = useState(availableFiles[0]?.id || '');

  useEffect(() => {
    if (!availableFiles.some(file => file.id === readerFile)) {
      setReaderFile(availableFiles[0]?.id || '');
    }
  }, [availableFiles, readerFile]);

  const selectFocus = (next: Focus) => {
    setFocus(next);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tracking', next);
      window.history.replaceState(null, '', url);
      window.dispatchEvent(new Event('savia:route-detail'));
    }
  };

  useEffect(() => {
    const sync = () => {
      if (new URLSearchParams(window.location.search).get('tab') === 'tracking') {
        setFocus(focusFromUrl(projectId) || 'prepare');
      }
    };
    window.addEventListener('popstate', sync);
    window.addEventListener('savia:route-detail', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('savia:route-detail', sync);
    };
  }, [projectId]);

  const [stage, setStage] = useState<{ stage: Stage; version: number }>({ stage: 'evaluating', version: 0 });
  const [submissionSummary, setSubmissionSummary] = useState<{submissions:{date:string;reference:string}[];requests:{status:string}[]}|null>(null);
  const refreshSummary = useCallback(() => { let active = true; void request<{submissions:{date:string;reference:string}[];requests:{status:string}[]}>(`/api/projects/${encodeURIComponent(projectId)}/submission-tracking`).then(data => { if (active) setSubmissionSummary(data); }).catch(() => { if (active) setSubmissionSummary(null); }); return () => { active = false; }; }, [projectId]);
  useEffect(() => refreshSummary(), [refreshSummary]);
  const [tasks, setTasks] = useState<Task[]>([]), [requirements, setRequirements] = useState<Requirement[]>([]);
  const [taskTitle, setTaskTitle] = useState(''), [taskDate, setTaskDate] = useState(''), [requirementTitle, setRequirementTitle] = useState(''), [requirementSource, setRequirementSource] = useState('');
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [busy, setBusy] = useState(false), [removeTarget, setRemoveTarget] = useState<Requirement | null>(null);
  const [dirtyItems, setDirtyItems] = useState<string[]>([]);
  const markDirty = useCallback((id: string, value: boolean) => setDirtyItems(items => value ? items.includes(id) ? items : [...items, id] : items.filter(item => item !== id)), []);
  const markOpportunityDirty = useCallback((value: boolean) => markDirty('opportunity', value), [markDirty]);
  useEffect(() => { onDirtyChange(Boolean(taskTitle.trim() || taskDate || requirementTitle.trim() || requirementSource.trim() || dirtyItems.length)); }, [taskTitle, taskDate, requirementTitle, requirementSource, dirtyItems, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => { let active = true; setLoading(true); setFailed(false); void Promise.all([request<{stage:Stage;version:number}>(base), request<{items:Task[]}>(`${base}/tasks`), request<{items:Requirement[]}>(`${base}/requirements`)]).then(([s, t, r]) => { if (active) { setStage(s); setTasks(t.items); setRequirements(r.items); } }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [base]);
  const run = async (action: () => Promise<void>) => { setBusy(true); try { await action(); return true; } catch (error) { const conflict = (error as Error & {status?:number}).status === 409; showToast(conflict ? (en ? 'Changed in another session. Copy unsaved edits and reload.' : 'Cambió en otra sesión. Copia los cambios sin guardar y vuelve a cargar.') : (en ? 'Could not save. Please retry.' : 'No se pudo guardar. Inténtalo de nuevo.'), 'error'); return false; } finally { setBusy(false); } };
  const addTask = (event: FormEvent) => { event.preventDefault(); void run(async () => { const data = await request<{item:Task}>(`${base}/tasks`, { method: 'POST', json: { title: taskTitle, dueDate: taskDate } }); setTasks(current => [...current, data.item]); setTaskTitle(''); setTaskDate(''); }); };
  const exportRequirements = async (format: 'csv' | 'xlsx') => {
    setBusy(true);
    try {
      const response = await fetch(`${base}/requirements/export?format=${format}&language=${language}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = `matriz-requisitos.${format}`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { showToast(en ? 'Could not export the saved requirements.' : 'No se pudieron exportar los requisitos guardados.', 'error'); }
    finally { setBusy(false); }
  };
  const addRequirement = (event: FormEvent) => { event.preventDefault(); void run(async () => { const data = await request<{item:Requirement}>(`${base}/requirements`, { method: 'POST', json: { title: requirementTitle, source: requirementSource } }); setRequirements(current => [...current, data.item]); setRequirementTitle(''); setRequirementSource(''); }); };

  const pendingTaskCount = tasks.filter(task => !task.completed).length;
  const openRequestCount = submissionSummary ? submissionSummary.requests.filter(item => item.status !== 'resolved').length : 0;
  const activeFile = availableFiles.find(file => file.id === readerFile) || availableFiles[0] || null;
  const focusIndex = focusList.indexOf(focus);

  const workflowSteps: { id: Focus; label: string; sub: string; complete: boolean }[] = [
    {
      id: 'prepare',
      label: en ? 'Organize offer' : 'Organizar oferta',
      sub: `${stageNames[language][stages.indexOf(stage.stage)]} · ${pendingTaskCount} ${en ? (pendingTaskCount === 1 ? 'pending task' : 'pending tasks') : (pendingTaskCount === 1 ? 'tarea pendiente' : 'tareas pendientes')}`,
      complete: requirements.length > 0 || tasks.some(task => task.completed),
    },
    {
      id: 'submit',
      label: en ? 'Record submission' : 'Registrar presentación',
      sub: submissionSummary?.submissions.length
        ? `${submissionSummary.submissions.length} ${en ? (submissionSummary.submissions.length === 1 ? 'filing' : 'filings') : (submissionSummary.submissions.length === 1 ? 'radicado' : 'radicados')}`
        : en ? 'Pending' : 'Pendiente',
      complete: Boolean(submissionSummary?.submissions.length),
    },
    {
      id: 'after',
      label: en ? 'Follow up' : 'Dar seguimiento',
      sub: openRequestCount > 0
        ? `${openRequestCount} ${en ? (openRequestCount === 1 ? 'open request' : 'open requests') : (openRequestCount === 1 ? 'solicitud por resolver' : 'solicitudes por resolver')}`
        : en ? 'Requests and outcome' : 'Solicitudes y resultado',
      complete: Boolean(submissionSummary?.requests.length && openRequestCount === 0),
    },
  ];

  return (
    <div className={`web-workflow web-preparation-wizard${expanded ? ' web-wizard-fullscreen' : ''}`}>
      {loading ? (
        <p role="status">{en ? 'Loading…' : 'Cargando…'}</p>
      ) : failed ? (
        <p role="alert">{en ? 'Could not load tracking. Reload the page.' : 'No se pudo cargar el seguimiento. Vuelve a cargar la página.'}</p>
      ) : (
        <>
          <nav className="web-wizard-steps web-feasibility-steps" aria-label={en ? 'Offer organization stages' : 'Etapas de organización de la oferta'}>
            {workflowSteps.map((step, index) => {
              const status = step.complete ? 'complete' : focus === step.id ? 'current' : 'pending';
              return (
                <button
                  type="button"
                  key={step.id}
                  data-status={status}
                  aria-current={focus === step.id ? 'step' : undefined}
                  onClick={() => selectFocus(step.id)}
                >
                  <span>{step.complete ? '✓' : index + 1}</span>
                  <div>
                    <strong>{step.label}</strong>
                    <small>{step.sub}</small>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="web-wizard-heading">
            <div>
              <div className="web-tracking-prompt">
                <h3>{focus === 'prepare' ? (en ? 'Organize offer' : 'Organizar oferta') : focus === 'submit' ? (en ? 'Record a submission' : 'Registrar una presentación') : (en ? 'Follow up' : 'Dar seguimiento')}</h3>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="web-tracking-status-trigger" aria-label={en ? 'View tracking summary' : 'Ver resumen de seguimiento'}>
                        <CircleHelp size={16} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="web-tracking-status-tooltip" side="top">
                      <strong>{en ? 'Work stage' : 'Etapa de trabajo'}: {stageNames[language][stages.indexOf(stage.stage)]}</strong>
                      <span>{pendingTaskCount} {en ? (pendingTaskCount === 1 ? 'pending task' : 'pending tasks') : (pendingTaskCount === 1 ? 'tarea pendiente' : 'tareas pendientes')}</span>
                      <span>{submissionSummary ? (submissionSummary.submissions.length ? `${en ? 'Latest filing' : 'Último radicado'}: ${submissionSummary.submissions[0].reference} (${submissionSummary.submissions[0].date})` : (en ? 'No submission recorded' : 'Sin presentación registrada')) : (en ? 'Submission details are unavailable.' : 'No se pudo cargar el resumen de presentaciones.')}</span>
                      {openRequestCount > 0 && <span>{openRequestCount} {en ? (openRequestCount === 1 ? 'open request' : 'open requests') : (openRequestCount === 1 ? 'solicitud por resolver' : 'solicitudes por resolver')}</span>}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p>
                {focus === 'prepare'
                  ? (en ? 'Coordinate the decision, work stage, personal tasks, offer package and tender requirements.' : 'Coordina la decisión, la etapa de trabajo, las tareas personales, el paquete de oferta y los requisitos del pliego.')
                  : focus === 'submit'
                    ? (en ? 'Record filing dates, references and copies of the submitted package and receipt.' : 'Registra fechas de radicación, referencias y copias del paquete presentado y su comprobante.')
                    : (en ? 'Track post-submission observations, corrections and the final award outcome.' : 'Haz seguimiento a observaciones, subsanaciones posteriores al cierre y al resultado de adjudicación.')}
              </p>
            </div>
            <div className="web-wizard-heading-actions">
              <WebWorkflowHelp step={focusIndex} labels={workflowSteps.map(item=>item.label)} language={language} />
              <Button
                icon={expanded ? Minimize2 : Maximize2}
                iconOnly
                size="sm"
                variant="outline"
                aria-pressed={expanded}
                onClick={() => setExpanded(value => !value)}
              >
                {expanded ? (en ? 'Restore panel size' : 'Restaurar tamaño del panel') : (en ? 'Expand work area' : 'Ampliar área de trabajo')}
              </Button>
              {availableFiles.length > 0 && (
                <Button
                  icon={readerOpen ? PanelLeftClose : PanelLeftOpen}
                  iconOnly
                  size="sm"
                  variant="outline"
                  aria-pressed={readerOpen}
                  onClick={() => setReaderOpen(value => !value)}
                >
                  {readerOpen ? (en ? 'Hide source reader' : 'Ocultar pliego') : (en ? 'Show source reader' : 'Mostrar pliego')}
                </Button>
              )}
            </div>
          </div>

          <div className={`web-wizard-columns${readerOpen && activeFile ? '' : ' without-reader'}`}>
            {readerOpen && activeFile && (
              <aside className="web-wizard-reader" aria-label={en ? 'Source document reader' : 'Lector del pliego'}>
                <label>
                  <FileText size={15} />
                  <span className="sr-only">{en ? 'Document to read' : 'Documento para lectura'}</span>
                  <select value={activeFile.id} onChange={event => setReaderFile(event.target.value)}>
                    {availableFiles.map(file => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                  </select>
                </label>
                <WorkflowSourceReader projectId={projectId} file={activeFile} en={en} />
              </aside>
            )}

            <div className="web-wizard-work">
              <div hidden={focus !== 'prepare'}>
                <details className="web-tracking-group web-draft-step" open>
                  <summary>
                    <span className="web-draft-step-number">1</span>
                    <span>
                      <strong>{en ? 'Decision and stage' : 'Decisión y etapa'}</strong>
                      <small>{en ? 'Work stage' : 'Etapa de trabajo'}: {stageNames[language][stages.indexOf(stage.stage)]}</small>
                    </span>
                  </summary>
                  <div className="web-draft-step-content web-stack">
                    <WebOpportunityTracking projectId={projectId} language={language} onDirty={markOpportunityDirty} />
                    <label>
                      {en ? 'Work stage' : 'Etapa de trabajo'}
                      <select
                        value={stage.stage}
                        disabled={busy}
                        onChange={event =>
                          void run(async () => {
                            const result = await request<{ stage: Stage; version: number }>(base, {
                              method: 'PUT',
                              json: { stage: event.target.value, version: stage.version },
                            });
                            setStage(result);
                          })
                        }
                      >
                        {stages.map((value, i) => (
                          <option key={value} value={value}>
                            {stageNames[language][i]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </details>

                <details className="web-tracking-group web-draft-step">
                  <summary>
                    <span className="web-draft-step-number">2</span>
                    <span>
                      <strong>{en ? 'My tasks' : 'Mis tareas'}</strong>
                      <small>
                        {pendingTaskCount} {en ? (pendingTaskCount === 1 ? 'pending task' : 'pending tasks') : (pendingTaskCount === 1 ? 'tarea pendiente' : 'tareas pendientes')} · {tasks.length} {en ? 'total' : 'en total'}
                      </small>
                    </span>
                  </summary>
                  <div className="web-draft-step-content web-stack">
                    <p>{en ? 'Personal tasks and dates, separate from the official schedule.' : 'Tareas y fechas personales, independientes del cronograma oficial.'}</p>
                    {tasks.length ? (
                      <ul className="web-workflow-tasks">
                        {tasks.map(task => (
                          <li className="web-task" data-completed={task.completed || undefined} key={task.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={task.completed}
                                disabled={busy}
                                onChange={event =>
                                  void run(async () => {
                                    const result = await request<{ item: Task }>(`${base}/tasks/${task.id}`, {
                                      method: 'PATCH',
                                      json: { completed: event.target.checked, version: task.version },
                                    });
                                    setTasks(current => current.map(value => (value.id === task.id ? result.item : value)));
                                  })
                                }
                              />
                              <span>{task.title}</span>
                            </label>
                            {task.dueDate && <time dateTime={task.dueDate}>{task.dueDate}</time>}
                            <Button
                              icon={Trash2}
                              iconOnly
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await request(`${base}/tasks/${task.id}`, { method: 'DELETE', json: { version: task.version } });
                                  setTasks(current => current.filter(value => value.id !== task.id));
                                })
                              }
                            >
                              {en ? `Remove ${task.title}` : `Eliminar ${task.title}`}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>{en ? 'No tasks yet.' : 'Aún no hay tareas.'}</p>
                    )}
                    <form onSubmit={addTask} className="web-stack">
                      <div className="web-feasibility-grid">
                        <label>
                          {en ? 'Task' : 'Tarea'}
                          <Input disabled={busy} value={taskTitle} onChange={event => setTaskTitle(event.target.value)} maxLength={300} required />
                        </label>
                        <label>
                          {en ? 'Date (optional)' : 'Fecha (opcional)'}
                          <Input disabled={busy} type="date" value={taskDate} onChange={event => setTaskDate(event.target.value)} />
                        </label>
                      </div>
                      <Button icon={Plus} type="submit" size="sm" variant="outline" disabled={busy || !taskTitle.trim()}>
                        {en ? 'Add task' : 'Agregar tarea'}
                      </Button>
                    </form>
                  </div>
                </details>

                <WebOfferDocuments projectId={projectId} language={language} requirements={requirements} files={projectFiles} />

                <details className="web-tracking-group web-draft-step">
                  <summary>
                    <span className="web-draft-step-number">4</span>
                    <span>
                      <strong>{en ? 'Requirements and evidence' : 'Requisitos y soportes'}</strong>
                      <small>
                        {requirements.length} {en ? (requirements.length === 1 ? 'requirement recorded' : 'requirements recorded') : (requirements.length === 1 ? 'requisito registrado' : 'requisitos registrados')}
                      </small>
                    </span>
                  </summary>
                  <div className="web-draft-step-content web-stack">
                    <WebImportedRupComparisons projectId={projectId} language={language} />
                    <WebRequirementSuggestions
                      projectId={projectId}
                      language={language}
                      fileIds={fileIds}
                      credentialId={credentialId}
                      credentialLabel={credentialLabel}
                      onAccepted={item => setRequirements(current => (current.some(value => value.id === item.id) ? current : [...current, item]))}
                    />
                    <p>{en ? 'Record and review requirements manually. Verify sources and evidence before deciding.' : 'Registra y valora los requisitos manualmente. Verifica la fuente y el soporte antes de decidir.'}</p>
                    <div className="web-inline">
                      <Button icon={FileDown} size="sm" variant="outline" disabled={busy || !requirements.length} onClick={() => void exportRequirements('csv')}>
                        {en ? 'Export CSV' : 'Exportar CSV'}
                      </Button>
                      <Button icon={FileSpreadsheet} size="sm" variant="outline" disabled={busy || !requirements.length} onClick={() => void exportRequirements('xlsx')}>
                        {en ? 'Export Excel' : 'Exportar Excel'}
                      </Button>
                    </div>
                    <p>{en ? 'The export includes saved requirements only.' : 'La exportación incluye solo los requisitos guardados.'}</p>
                    {requirements.length ? (
                      requirements.map(item => (
                        <RequirementForm
                          key={item.id}
                          item={item}
                          language={language}
                          busy={busy}
                          projectId={projectId}
                          onDirty={markDirty}
                          save={draft =>
                            void run(async () => {
                              const result = await request<{ item: Requirement }>(`${base}/requirements/${item.id}`, { method: 'PATCH', json: draft });
                              setRequirements(current => current.map(value => (value.id === item.id ? result.item : value)));
                            })
                          }
                          remove={setRemoveTarget}
                        />
                      ))
                    ) : (
                      <p>{en ? 'No requirements recorded yet.' : 'Aún no hay requisitos registrados.'}</p>
                    )}
                    <form onSubmit={addRequirement} className="web-stack">
                      <div className="web-feasibility-grid">
                        <label>
                          {en ? 'New requirement' : 'Nuevo requisito'}
                          <Input disabled={busy} value={requirementTitle} onChange={event => setRequirementTitle(event.target.value)} maxLength={300} required />
                        </label>
                        <label>
                          {en ? 'Source' : 'Fuente'}
                          <Input disabled={busy} value={requirementSource} onChange={event => setRequirementSource(event.target.value)} maxLength={300} />
                        </label>
                      </div>
                      <Button icon={Plus} type="submit" size="sm" variant="outline" disabled={busy || !requirementTitle.trim()}>
                        {en ? 'Add requirement' : 'Agregar requisito'}
                      </Button>
                    </form>
                  </div>
                </details>
              </div>

              <div hidden={focus !== 'submit'}>
                <WebSubmissionRecords projectId={projectId} language={language} files={projectFiles} onDirty={markDirty} onChanged={refreshSummary} />
              </div>

              <div hidden={focus !== 'after'}>
                <WebSubmissionTracking
                  projectId={projectId}
                  language={language}
                  onDirty={markDirty}
                  onChanged={refreshSummary}
                  onTaskCreated={() =>
                    void request<{ items: Task[] }>(`${base}/tasks`)
                      .then(value => setTasks(value.items))
                      .catch(() => showToast(en ? 'Could not refresh tasks. Reload to see the linked task.' : 'No se pudieron actualizar las tareas. Recarga para ver la tarea asociada.', 'error'))
                  }
                />
              </div>
            </div>
          </div>

          <footer className="web-wizard-footer web-feasibility-actions">
            <Button size="sm" variant="outline" disabled={focusIndex <= 0} onClick={() => selectFocus(focusList[Math.max(0, focusIndex - 1)])}>
              {en ? 'Previous' : 'Anterior'}
            </Button>
            <span>{en ? `Step ${focusIndex + 1} of ${focusList.length}` : `Paso ${focusIndex + 1} de ${focusList.length}`}</span>
            <Button size="sm" variant="outline" disabled={focusIndex >= focusList.length - 1} onClick={() => selectFocus(focusList[Math.min(focusList.length - 1, focusIndex + 1)])}>
              {en ? 'Continue' : 'Continuar'}
            </Button>
          </footer>

          <AppDialog
            open={removeTarget !== null}
            onOpenChange={open => {
              if (!open && !busy) setRemoveTarget(null);
            }}
            title={en ? 'Remove requirement' : 'Eliminar requisito'}
            description={en ? `Remove “${removeTarget?.title || ''}” and its evidence?` : `¿Eliminar «${removeTarget?.title || ''}» y su soporte?`}
            actions={
              <>
                <Button variant="outline" disabled={busy} onClick={() => setRemoveTarget(null)}>
                  {en ? 'Cancel' : 'Cancelar'}
                </Button>
                <Button
                  icon={Trash2}
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    if (removeTarget)
                      void run(async () => {
                        await request(`${base}/requirements/${removeTarget.id}`, { method: 'DELETE', json: { version: removeTarget.version } });
                        setRequirements(current => current.filter(value => value.id !== removeTarget.id));
                        setRemoveTarget(null);
                      });
                  }}
                >
                  {en ? 'Remove' : 'Eliminar'}
                </Button>
              </>
            }
          />
        </>
      )}
    </div>
  );
}
