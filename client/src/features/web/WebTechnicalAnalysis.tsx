import {useWebRouteDetail} from './useWebRouteDetail';
import { Check, ChevronLeft, ChevronRight, Eye, Maximize2, Pencil, Save, ScanText, Square } from 'lucide-react';
import {WebAnalysisActivity} from './WebAnalysisActivity';
import {WebAnalysisConversation} from './WebAnalysisConversation';
import {WebAnalysisHelp} from './WebAnalysisHelp';
import WebTextEditor from './WebTextEditor';
import { useCallback, useEffect, useRef, useState } from 'react';
import MarkdownRenderer from '@/shared/ui/MarkdownRenderer';
import { WizardActionButton as Button } from './WizardActionButton';
import AppDialog from '@/shared/ui/AppDialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/primitives/dialog';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';

type Category = 'project-overview' | 'technical-score' | 'response-requirements';
type Analysis = { category: Category; revision: number; content: string; jobId: string | null; reviewId: string | null; importedFromDesktop: boolean; reviewedFileIds: string[]; current: boolean };
type Job = { id: string; state: string; progress?:string|null; runnerName?:string|null; updatedAt?:string; category: Category; fileIds: string[]; stale: boolean; result: { content?: string; message?: string } | null };
type ImportedAnalysis = { id: string; label: string; status: string; content: string; error: string | null; sortOrder: number };
const categories: Category[] = ['project-overview', 'technical-score', 'response-requirements'];
const importedCategories: Record<string, Category> = { projectOverview: 'project-overview', 'legacy-project-overview': 'project-overview', techRequirements: 'technical-score', responseFileRequirements: 'response-requirements' };
const names = { es: { 'project-overview': 'Resumen del proyecto', 'technical-score': 'Criterios técnicos de evaluación', 'response-requirements': 'Requisitos del documento de respuesta' }, en: { 'project-overview': 'Project overview', 'technical-score': 'Technical scoring criteria', 'response-requirements': 'Response document requirements' } };

export default function WebTechnicalAnalysis({ projectId, language, fileIds, files, credentialId, consent, resumeKey=0 }: { projectId: string; language: 'es' | 'en'; fileIds: string[]; files: { id: string; name: string }[]; credentialId: string; consent: boolean; resumeKey?:number }) {
  const en = language === 'en', { showToast } = useToast();
  const [analyses, setAnalyses] = useState<Analysis[]>([]), [importedAnalyses, setImportedAnalyses] = useState<ImportedAnalysis[]>([]), [jobs, setJobs] = useState<Job[]>([]), [busy, setBusy] = useState('');
  const [linkedCategory,changeCategory]=useWebRouteDetail('analysis',categories,'project-overview');
  const [categoryStep,setCategoryStep]=useState<Category>(linkedCategory as Category);
  useEffect(()=>setCategoryStep(linkedCategory as Category),[linkedCategory]);
  const [guidedCategory,setGuidedCategory]=useState<Category|null>(null);
  const panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{const guide=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.projectId===projectId&&categories.includes(detail.category)){setCategoryStep(detail.category);setGuidedCategory(detail.category);}};window.addEventListener('savia:guide-analysis',guide);return()=>window.removeEventListener('savia:guide-analysis',guide);},[projectId]);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<{category:Category; jobId:string; revision:number; content:string} | null>(null);
  const analysisBody=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(analysisBody.current)analysisBody.current.scrollTop=0;},[categoryStep]);
  const [failed, setFailed] = useState(false), [replacement, setReplacement] = useState<{ job: Job; revision: number } | null>(null);
  const [importReview, setImportReview] = useState<{ category: Category; index: number; revision: number; fileIds: string[]; fileNames: string[]; importHash: string; reviewSnapshot: unknown; replacing: boolean } | null>(null);
  const [importContext, setImportContext] = useState<{ importHash: string | null; reviewSnapshot: unknown }>({ importHash: null, reviewSnapshot: null });
  const lastResume=useRef(-1);
  useEffect(()=>{if(new URLSearchParams(window.location.search).has('analysis')||lastResume.current===resumeKey||(!analyses.length&&!jobs.length))return;lastResume.current=resumeKey;setCategoryStep(jobs.find(job=>['queued','running'].includes(job.state))?.category||categories.find(category=>!analyses.some(item=>item.category===category&&item.current))||categories[2]);},[resumeKey,analyses,jobs]);
  const submission = useRef<{ body: string; key: string } | null>(null);
  const latestLoad = useRef(0), settledLoad = useRef(0);
  const load = useCallback(async () => {
    const loadId = ++latestLoad.current;
    try {
      const value = await request<{ analyses: Analysis[]; importedAnalyses: ImportedAnalysis[]; importHash: string | null; reviewSnapshot: unknown; jobs: Job[] }>(`/api/projects/${projectId}/technical-analyses`);
      if (loadId <= settledLoad.current) return;
      settledLoad.current = loadId;
      setAnalyses(value.analyses); setImportedAnalyses(value.importedAnalyses); setImportContext({ importHash: value.importHash, reviewSnapshot: value.reviewSnapshot }); setJobs(value.jobs); setFailed(false);
    } catch (error) {
      if (loadId <= settledLoad.current) return;
      settledLoad.current = loadId;
      setFailed(true);
      throw error;
    }
  }, [projectId]);
  const refresh = useCallback(() => load().catch(() => undefined), [load]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { settledLoad.current = latestLoad.current; window.clearInterval(timer); };
  }, [refresh]);
  const notifyPreparationChanged = () => window.dispatchEvent(new CustomEvent('savia:preparation-changed', { detail: { projectId } }));
  const queue = async (category: Category) => {
    const payload = { category, fileIds, language, dataProcessingConsent: true }, body = { kind: 'technical-plan.analyze', credentialId, payload }, serialized = JSON.stringify(body);
    if (submission.current?.body !== serialized) submission.current = { body: serialized, key: crypto.randomUUID() };
    setBusy(category);
    try { await request(`/api/projects/${projectId}/jobs`, { method: 'POST', headers: { 'idempotency-key': submission.current.key }, json: body }); submission.current = null; await refresh(); }
    catch { showToast(en ? 'Could not start the analysis. Retry with the same selection.' : 'No se pudo iniciar el análisis. Reintenta con la misma selección.', 'error'); }
    finally { setBusy(''); }
  };
  const accept = async (job: Job, revision: number) => {
    setBusy(job.id);
    try {
      await request(`/api/projects/${projectId}/technical-analyses/${job.category}/accept`, { method: 'POST', json: { jobId: job.id, revision } });
      notifyPreparationChanged();
      showToast(en ? 'Analysis accepted.' : 'Análisis aceptado.', 'success');
      await refresh();
    } catch {
      await refresh();
      showToast(en ? 'The analysis or its documents changed. Refresh and review again.' : 'El análisis o sus documentos cambiaron. Actualiza y revísalos de nuevo.', 'error');
    } finally { setBusy(''); }
  };
  const cancel = async (job: Job) => { setBusy(job.id); try { await request(`/api/projects/${projectId}/jobs/${job.id}/cancel`, { method: 'POST' }); await refresh(); } catch { showToast(en ? 'Could not cancel the task.' : 'No se pudo cancelar la tarea.', 'error'); } finally { setBusy(''); } };
  const acceptImported = async (review: NonNullable<typeof importReview>) => {
    setBusy(review.category);
    try {
      await request(`/api/projects/${projectId}/technical-analyses/${review.category}/review-import`, { method: 'POST', json: { index: review.index, revision: review.revision, fileIds: review.fileIds, importHash: review.importHash, reviewSnapshot: review.reviewSnapshot } });
      notifyPreparationChanged();
      showToast(en ? 'Imported analysis accepted.' : 'Análisis importado aceptado.', 'success');
      await refresh();
    } catch {
      await refresh();
      showToast(en ? 'The analysis or its documents changed. Review them again.' : 'El análisis o sus documentos cambiaron. Revísalos de nuevo.', 'error');
    } finally { setBusy(''); }
  };
  const currentJob=jobs.find(job=>job.category===categoryStep),currentAnalysis=analyses.find(item=>item.category===categoryStep);
  const discussionBase = currentJob?.state === 'succeeded' && currentJob.result?.content && (!currentAnalysis || (jobs.some(job => job.id === currentAnalysis.jobId) && currentJob.id !== currentAnalysis.jobId)) ? currentJob.id : currentAnalysis?.jobId;
  const editBase = discussionBase || currentAnalysis?.reviewId;
  const needsReview = currentJob?.state === 'succeeded' && !!currentJob.result?.content && !currentJob.stale && currentAnalysis?.jobId !== currentJob.id;
  const waiting = currentJob && ['queued','running'].includes(currentJob.state);
  const guidance = guidedCategory === categoryStep ? (!fileIds.length ? (en?'Select documents in Pliegos before starting the analysis.':'Selecciona documentos en Pliegos antes de iniciar el análisis.') : !credentialId ? (en?'Connect your runner before starting the analysis.':'Conecta tu runner antes de iniciar el análisis.') : waiting ? (en?'Wait for the analysis to finish.':'Espera a que termine el análisis.') : needsReview ? (en?'Review the result, then select Accept analysis.':'Revisa el resultado y pulsa «Aceptar análisis».') : (en?'Select Analyze selected documents to generate this analysis.':'Pulsa «Analizar documentos seleccionados» para generar este análisis.')) : '';
  useEffect(()=>{if(guidedCategory!==categoryStep)return;const timer=window.setTimeout(()=>{const target=panel.current?.querySelector<HTMLButtonElement>(needsReview?'[data-analysis-accept]':waiting?'[data-analysis-guide]':'.web-wizard-step:not([hidden]) [data-analysis-generate], [data-analysis-generate-active]');target?.focus({preventScroll:true});},100);return()=>window.clearTimeout(timer);},[guidedCategory,categoryStep,needsReview,waiting]);
  const saveEdit = async () => {
    if (!editing || !editing.content.trim()) return;
    setBusy('edit');
    try {
      await request(`/api/projects/${projectId}/technical-analyses/${editing.category}/edit`, {method:'POST',json:{jobId:editing.jobId,revision:editing.revision,content:editing.content}});
      setEditing(null);
      notifyPreparationChanged();
      showToast(en?'Analysis saved.':'Análisis guardado.','success');
      await refresh();
    } catch { showToast(en?'The analysis or its documents changed. Review them and try again.':'El análisis o sus documentos cambiaron. Revísalos e inténtalo de nuevo.','error'); }
    finally { setBusy(''); }
  };
  const content = <><details open ref={analysisBody} className="web-technical-plan web-analysis-body"><summary><strong>{en ? 'Tender analysis for the technical plan' : 'Análisis del pliego para el plan técnico'}</strong></summary>
    <div className="web-analysis-help-heading"><p>{en ? 'Review these three analyses before developing the outline.' : 'Revisa estos tres análisis antes de desarrollar el índice.'}</p><WebAnalysisHelp language={language} index={categories.indexOf(categoryStep)} accepted={categories.map(category=>analyses.some(item=>item.category===category&&item.current))} body={analysisBody}/></div><nav className="web-analysis-steps" aria-label={en?'Analysis steps':'Pasos del análisis'}>{categories.map((category,index)=>{const saved=analyses.find(item=>item.category===category),job=jobs.find(item=>item.category===category),state=job?.state==='running'?(en?'Processing':'Procesando'):job?.state==='queued'?(en?'Queued':'En cola'):saved?.current&&(!job||saved.jobId===job.id)?(en?'Accepted':'Aceptado'):job?.state==='succeeded'?(en?'Review result':'Revisar resultado'):job?.state==='failed'?(en?'Failed':'Falló'):saved?.current?(en?'Accepted':'Aceptado'):(en?'Pending':'Pendiente');return <button type="button" key={category} aria-current={categoryStep===category?'step':undefined} onClick={()=>{setCategoryStep(category);changeCategory(category);}}><span>{index+1}. {index===0?(en?'Overview':'Resumen'):index===1?(en?'Scoring':'Criterios'):(en?'Requirements':'Requisitos')}</span><small>{state}</small>{['running','queued'].includes(job?.state||'')?<progress aria-label={state}/>:<progress max={1} value={saved?.current||job?.state==='succeeded'?1:0} aria-label={state}/>}</button>;})}</nav>
    {discussionBase && <WebAnalysisConversation key={`${categoryStep}:${discussionBase}`} projectId={projectId} category={categoryStep} baseJobId={discussionBase} revision={currentAnalysis?.revision || 0} fileIds={fileIds} credentialId={credentialId} language={language} onAccepted={load}/>}
    {failed && <p role="alert">{en ? 'Could not refresh analyses.' : 'No se pudieron actualizar los análisis.'}</p>}
    {!!importedAnalyses.length && <details className="web-plan-generation"><summary><strong>{en ? 'Analyses from a backup' : 'Análisis de una copia de seguridad'} ({importedAnalyses.length})</strong></summary><p>{en ? 'These are historical results. Their original sources may not all be available. Review an eligible result before using it in this project. Old tasks do not resume.' : 'Son resultados históricos. Es posible que no estén disponibles todas sus fuentes originales. Revisa cada resultado compatible antes de usarlo en este proyecto. Las tareas antiguas no se reanudan.'}</p>{!fileIds.length && <p>{en ? 'Select documents above to review an eligible result.' : 'Selecciona documentos arriba para revisar un resultado compatible.'}</p>}{importedAnalyses.map((item, index) => <details key={`${item.id}:${index}`}><summary>{item.label || (importedCategories[item.id] ? names[language][importedCategories[item.id]] : item.id)}</summary><p>{en ? 'Status in the backup:' : 'Estado en el respaldo:'} {({ success: en ? 'Complete' : 'Completado', error: en ? 'Error' : 'Error', running: en ? 'Running when saved' : 'En ejecución al guardar', idle: en ? 'Not started' : 'Sin iniciar', saved: en ? 'Saved' : 'Guardado' } as Record<string, string>)[item.status] || item.status}</p>{item.content && <MarkdownRenderer allowRawHtml={false}>{item.content.replaceAll('![', '[')}</MarkdownRenderer>}{item.error && <p>{en ? 'Recorded error:' : 'Error registrado:'} {item.error}</p>}{importedCategories[item.id] && (item.status === 'success' || (item.id === 'legacy-project-overview' && item.status === 'saved')) && !!item.content.trim() && <Button icon={Eye} size="sm" variant="outline" disabled={!!busy || !fileIds.length || !importContext.importHash || !importContext.reviewSnapshot || item.content.length > 200000} onClick={() => { const category = importedCategories[item.id], current = analyses.find(value => value.category === category); if (importContext.importHash) setImportReview({ category, index, revision: current?.revision || 0, fileIds: [...fileIds], fileNames: fileIds.map(id => files.find(file => file.id === id)?.name || (en ? 'Unavailable' : 'No disponible')), importHash: importContext.importHash, reviewSnapshot: importContext.reviewSnapshot, replacing: !!current }); }}>{en ? 'Review for this project' : 'Revisar para este proyecto'}</Button>}</details>)}</details>}
    {categories.map(category => { const saved = analyses.find(item => item.category === category); const relevant = jobs.filter(job => job.category === category); const running = relevant.some(job => ['queued', 'running'].includes(job.state)); const renderJob=(job:Job)=><article key={job.id}><WebAnalysisActivity projectId={projectId} jobId={job.id} language={language} state={job.state} progress={job.progress} runnerName={job.runnerName} updatedAt={job.updatedAt} accepted={saved?.jobId===job.id&&saved.current}/><details className="web-analysis-sources"><summary>{en?'Source documents':'Documentos consultados'} ({job.fileIds.length})</summary><ul>{job.fileIds.map(id=><li key={id}>{files.find(file=>file.id===id)?.name||(en?'Unavailable':'No disponible')}</li>)}</ul></details>{job.stale && <p>{en ? 'Documents have changed since this task was requested.' : 'Los documentos cambiaron desde que se solicitó esta tarea.'}</p>}{job.result?.message && <p>{job.result.message}</p>}{job.result?.content && saved?.jobId!==job.id && <><MarkdownRenderer allowRawHtml={false}>{job.result.content.replaceAll('![', '[')}</MarkdownRenderer>{job.id!==relevant[0]?.id&&<Button icon={Check} size="sm" variant="outline" disabled={!!busy || job.stale || saved?.jobId === job.id} onClick={() => saved ? setReplacement({ job, revision: saved.revision }) : void accept(job, 0)}>{saved?.jobId === job.id ? (en ? 'Accepted' : 'Aceptado') : (en ? 'Accept analysis' : 'Aceptar análisis')}</Button>}</>}{['queued', 'running'].includes(job.state) && <Button icon={Square} size="sm" variant="ghost" disabled={!!busy} onClick={() => void cancel(job)}>{en ? 'Cancel task' : 'Cancelar tarea'}</Button>}</article>; return <section key={category} className="web-plan-generation" hidden={category!==categoryStep}>
      <h4>{names[language][category]}</h4>
      {saved && <><p>{saved.current ? (en ? 'Accepted analysis' : 'Análisis aceptado') : (en ? 'Documents changed since acceptance; analyze again.' : 'Los documentos cambiaron desde la aceptación; vuelve a analizarlos.')}{saved.importedFromDesktop && (en ? ' · Reviewed from a backup' : ' · Revisado de una copia de seguridad')}</p>{saved.importedFromDesktop && <p>{en ? 'Documents reviewed:' : 'Documentos revisados:'} {saved.reviewedFileIds.map(id => files.find(file => file.id === id)?.name || (en ? 'Unavailable' : 'No disponible')).join(', ')}</p>}<MarkdownRenderer allowRawHtml={false}>{saved.content.replaceAll('![', '[')}</MarkdownRenderer></>}
      <Button icon={ScanText} size="sm" variant="outline" data-analysis-generate-active={category===categoryStep?true:undefined} disabled={!!busy || running || !credentialId || !fileIds.length || !consent} onClick={() => void queue(category)}>{en ? 'Analyze selected documents' : 'Analizar documentos seleccionados'}</Button>
      {relevant.slice(0,1).map(renderJob)}{relevant.length>1&&<details className="web-analysis-history"><summary>{en?'Previous attempts':'Intentos anteriores'} ({relevant.length-1})</summary>{relevant.slice(1).map(renderJob)}</details>}
    </section>; })}
    <AppDialog open={!!importReview} onOpenChange={open => { if (!open) setImportReview(null); }} title={en ? 'Accept imported analysis?' : '¿Aceptar el análisis importado?'} description={importReview ? `${en ? 'Confirm that you reviewed the analysis against these selected documents:' : 'Confirma que revisaste el análisis con estos documentos seleccionados:'} ${importReview.fileNames.join(', ')}. ${en ? 'Original sources may be incomplete.' : 'Las fuentes originales pueden estar incompletas.'} ${importReview.replacing ? (en ? 'This replaces the accepted analysis in this category.' : 'Esto reemplaza el análisis aceptado de esta categoría.') : ''}` : ''} actions={<><Button variant="outline" onClick={() => setImportReview(null)}>{en ? 'Cancel' : 'Cancelar'}</Button><Button icon={Check} onClick={() => { const review = importReview; setImportReview(null); if (review) void acceptImported(review); }}>{en ? 'Accept reviewed analysis' : 'Aceptar análisis revisado'}</Button></>} />
    <AppDialog open={!!replacement} onOpenChange={open => { if (!open) setReplacement(null); }} title={en ? 'Replace accepted analysis?' : '¿Reemplazar el análisis aceptado?'} description={en ? 'The selected result will replace the analysis currently accepted for this category.' : 'El resultado seleccionado reemplazará el análisis aceptado actualmente para esta categoría.'} actions={<><Button variant="outline" onClick={() => setReplacement(null)}>{en ? 'Cancel' : 'Cancelar'}</Button><Button onClick={() => { setReplacement(null); if (replacement) void accept(replacement.job, replacement.revision); }}>{en ? 'Replace' : 'Reemplazar'}</Button></>} />
  </details><div className="web-analysis-fixed-actions" aria-label={en?'Analysis actions':'Acciones del análisis'}>
    {guidance && <p className="web-analysis-guidance" data-analysis-guide role="status">{guidance}</p>}
    {editBase && <Button icon={Pencil} size="sm" variant="outline" disabled={!!busy} onClick={()=>setEditing({category:categoryStep,jobId:editBase,revision:currentAnalysis?.revision||0,content:((editBase===currentAnalysis?.jobId || editBase===currentAnalysis?.reviewId) ? currentAnalysis.content : currentJob?.result?.content)||''})}>{en?'Edit analysis':'Editar análisis'}</Button>}
    {currentJob?.result?.content&&<Button icon={Check} data-analysis-accept size="sm" disabled={!!busy||currentJob.stale||currentAnalysis?.jobId===currentJob.id} onClick={()=>currentAnalysis?setReplacement({job:currentJob,revision:currentAnalysis.revision}):void accept(currentJob,0)}>{currentAnalysis?.jobId===currentJob.id?(en?'Accepted':'Aceptado'):(en?'Accept analysis':'Aceptar análisis')}</Button>}
    <div className="web-analysis-navigation"><Button icon={ChevronLeft} iconOnly size="sm" variant="outline" disabled={categoryStep===categories[0]} onClick={()=>{const next=categories[categories.indexOf(categoryStep)-1];setCategoryStep(next);changeCategory(next);}}>{en?'Previous analysis':'Análisis anterior'}</Button><Button icon={ChevronRight} iconOnly size="sm" variant="outline" disabled={categoryStep===categories[2]} onClick={()=>{const next=categories[categories.indexOf(categoryStep)+1];setCategoryStep(next);changeCategory(next);}}>{en?'Next analysis':'Siguiente análisis'}</Button></div>
  </div>
  <Dialog open={!!editing} onOpenChange={open=>{if(!open&&!busy)setEditing(null);}}><DialogContent className="web-analysis-edit-dialog" onInteractOutside={event=>event.preventDefault()}>
    <DialogTitle>{en?'Edit analysis':'Editar análisis'}</DialogTitle><DialogDescription>{en?'Review your changes before saving.':'Revisa tus cambios antes de guardarlos.'}</DialogDescription>
    {editing && <div className="web-analysis-edit-body"><WebTextEditor value={editing.content} onChange={content=>setEditing({...editing,content})} language={language} title={names[language][editing.category]} maxLength={200000} disabled={!!busy}/></div>}
    <div className="web-analysis-edit-actions"><Button variant="outline" disabled={!!busy} onClick={()=>setEditing(null)}>{en?'Cancel':'Cancelar'}</Button><Button icon={Save} disabled={!!busy||!editing?.content.trim()} onClick={()=>void saveEdit()}>{en?'Save changes':'Guardar cambios'}</Button></div>
  </DialogContent></Dialog></>;
  return <div className="web-analysis-panel" ref={panel}>
    <div className="web-analysis-expand"><Button icon={Maximize2} iconOnly size="sm" variant="ghost" onClick={() => setExpanded(true)}>{en ? 'Expand analysis' : 'Ampliar análisis'}</Button></div>
    {!expanded && content}
    <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="web-analysis-dialog">
      <DialogTitle>{en ? 'Tender analysis' : 'Análisis del pliego'}</DialogTitle>
      <DialogDescription>{en ? 'Review and accept each analysis.' : 'Revisa y acepta cada análisis.'}</DialogDescription>
      <div className="web-analysis-panel web-analysis-expanded-content">{expanded && content}</div>
    </DialogContent></Dialog>
  </div>;
}
