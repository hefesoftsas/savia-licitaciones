import {Save, Download, Pencil, Check, CircleHelp, ZoomIn, ZoomOut, MoveHorizontal} from 'lucide-react';
import {WordIcon} from './WordIcon';
import {Tooltip,TooltipTrigger,TooltipContent,TooltipProvider} from '@/shared/ui/primitives/tooltip';
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DocxEditorRef } from '@docx-editor.dev/react';
import * as Dialog from '@/shared/ui/primitives/dialog';
import { Button } from '@/shared/ui/primitives/button';
import { useToast } from '@/shared/ui/ToastProvider';
import './web-document-editors.css';
const WordCanvas = lazy(() => import('./WebWordCanvas'));

class WordEditorBoundary extends Component<{language:'es'|'en';children:ReactNode},{failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(this.state.failed){const en=this.props.language==='en';return <div role="alert"><p>{en?'The Word editor could not be opened. If Savia was updated, refresh the application to try again.':'No se pudo abrir el editor de Word. Si Savia se actualizó, actualiza la aplicación para intentarlo de nuevo.'}</p><p>{en?'Save any other open work before refreshing.':'Guarda los demás cambios abiertos antes de actualizar.'}</p><Button type="button" variant="outline" onClick={()=>window.location.reload()}>{en?'Refresh application':'Actualizar aplicación'}</Button></div>;}
    return this.props.children;
  }
}


/** An editable copy, as on desktop. It never overwrites source files or chapter text. */
export default function WebWordDocument({ language, url, name = 'propuesta.docx', label, initiallyOpen=false, saveToProject=false, onSaveAndContinue }: { language: 'es' | 'en'; url?: string; name?: string; label?: string; initiallyOpen?:boolean; saveToProject?:boolean; onSaveAndContinue?:()=>void }) {
  const en = language === 'en', { showToast } = useToast();
  const projectId=saveToProject?url?.match(/\/api\/projects\/([^/]+)\/jobs\//)?.[1]:undefined;
  const wordId=saveToProject?url?.match(/\/jobs\/([^/]+)\/artifact$/)?.[1]:undefined;
  const wordMode=onSaveAndContinue?'draft':'delivery';
  const linked=()=>{const params=new URLSearchParams(window.location.search);return !!wordId&&params.get('word')===wordId&&params.get('wordMode')===wordMode;};
  const updateLink=(opened:boolean)=>{if(!wordId)return;const address=new URL(window.location.href);if(opened){address.searchParams.set('word',wordId);address.searchParams.set('wordMode',wordMode);}else if(address.searchParams.get('word')===wordId&&address.searchParams.get('wordMode')===wordMode){address.searchParams.delete('word');address.searchParams.delete('wordMode');}else return;window.history.pushState(null,'',address);window.dispatchEvent(new Event('savia:route-detail'));};
  const [open, setOpen] = useState(initiallyOpen||linked()), [bytes, setBytes] = useState<Uint8Array>(), [filename, setFilename] = useState(name);
  const [editing, setEditing] = useState(false), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [discard, setDiscard] = useState(false), [retry, setRetry] = useState(0);
  const [revision,setRevision]=useState('\"0\"'),[saved,setSaved]=useState(false);
  const [pendingCount,setPendingCount]=useState<number|null>(null);
  const [recoveryTick,setRecoveryTick]=useState(0),[recoveryState,setRecoveryState]=useState<'none'|'saving'|'saved'|'failed'|'stale'>('none');
  const [zoom, setZoom] = useState('auto');
  const editor = useRef<DocxEditorRef>(null), picker = useRef<HTMLInputElement>(null), changeSequence=useRef(0), recoveredSequence=useRef(0), recoveryVersion=useRef('0'), recoveryFlight=useRef<Promise<void>|null>(null), savingRef=useRef(false);
  useEffect(()=>{if(!wordId)return;const restore=()=>{if(linked())setOpen(true);else if(!dirty)setOpen(false);};window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[wordId,dirty]);
  useEffect(()=>{if(initiallyOpen&&wordId&&!linked())updateLink(true);},[initiallyOpen,wordId]);
  useEffect(() => {
    if (!open || !url) return;
    const controller = new AbortController(); setBytes(undefined); setFailed(false); setBusy(true);
    void fetch(url, { credentials: 'same-origin', signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error(); let data = await response.arrayBuffer(); const base=response.headers.get('etag') || '"0"';
      recoveryVersion.current='0';changeSequence.current=0;recoveredSequence.current=0;setRecoveryState('none');setDirty(false);
      if(saveToProject&&wordId){try{const recovery=await fetch(`${url}/recovery`,{credentials:'same-origin',signal:controller.signal});if(recovery.ok){recoveryVersion.current=(recovery.headers.get('etag')||'"0"').replaceAll('"','');if(recovery.headers.get('x-base-revision')===base){data=await recovery.arrayBuffer();setDirty(true);setRecoveryState('saved');}else setRecoveryState('stale');}else if(recovery.status!==404)setRecoveryState('failed');}catch(error){if(controller.signal.aborted)throw error;setRecoveryState('failed');}}
      if (!controller.signal.aborted) { setBytes(new Uint8Array(data)); setEditing(saveToProject); setFilename(name); setRevision(base); setSaved(false); setPendingCount(null); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [open, url, name, retry]);
  useEffect(() => { if (!dirty||recoveryState==='saved') return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty,recoveryState]);
  useEffect(()=>{
    if(!dirty||!open||!url||!saveToProject||!wordId||busy||recoveryState==='stale'||changeSequence.current===recoveredSequence.current)return;
    const timer=setTimeout(()=>{
      if(savingRef.current||recoveryFlight.current)return;
      const sequence=changeSequence.current;setRecoveryState('saving');
      const flight=(async()=>{try{const output=await editor.current?.save();if(!output)throw Error();const response=await fetch(`${url}/recovery`,{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','if-match':revision,'x-recovery-version':recoveryVersion.current},body:new Blob([output as BlobPart])});if(!response.ok)throw Error();recoveryVersion.current=(response.headers.get('etag')||'"0"').replaceAll('"','');recoveredSequence.current=sequence;setRecoveryState(changeSequence.current===sequence?'saved':'none');}catch{setRecoveryState('failed');}finally{recoveryFlight.current=null;if(changeSequence.current!==sequence)setRecoveryTick(value=>value+1);}})();
      recoveryFlight.current=flight;
    },2000);return()=>clearTimeout(timer);
  },[dirty,open,url,wordId,saveToProject,busy,revision,recoveryTick]);
  const close = () => { if (busy) return; if (dirty) { setDiscard(true); return; } setOpen(false); setEditing(false); setBytes(undefined); updateLink(false); };
  const save = async (continueAfter=false) => {
    if(!url || !saveToProject || (!dirty&&!continueAfter) || busy)return;
    savingRef.current=true;setBusy(true);
    try {
      if(continueAfter&&pendingCount!==0){setEditing(true);return;}
      if(recoveryFlight.current)await recoveryFlight.current;
      const savedSequence=changeSequence.current;
      const output=editing?await editor.current?.save():bytes; if(!output)throw Error();
      const response=await fetch(url,{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','if-match':revision},body:new Blob([output as BlobPart])});
      if(response.status===409){showToast(en?'This document changed in another session. Download your changes before reopening it.':'Este documento cambió en otra sesión. Descarga tus cambios antes de volver a abrirlo.','error');return;}
      if(!response.ok)throw Error();
      setRevision(response.headers.get('etag')!);setDirty(changeSequence.current!==savedSequence);setSaved(true);
      if(changeSequence.current===savedSequence&&recoveryVersion.current!=='0'&&recoveryState!=='stale'){try{const removed=await fetch(`${url}/recovery`,{method:'DELETE',credentials:'same-origin',headers:{'if-match':`"${recoveryVersion.current}"`}});if(removed.ok||removed.status===404){recoveryVersion.current='0';setRecoveryState('none');}}catch{/* The saved Word is already durable; the older recovery remains available. */}}
      showToast(en?'Word saved in this project.':'Word guardado en este proyecto.','success');
      if(continueAfter&&changeSequence.current===savedSequence){setOpen(false);updateLink(false);onSaveAndContinue?.();}
    }catch{showToast(en?'Could not save. Your changes remain open; retry.':'No se pudo guardar. Tus cambios siguen abiertos; reintenta.','error');}
    finally{savingRef.current=false;setBusy(false);}
  };
  const download = async () => {
    setBusy(true);
    try {
      const output = editing ? await editor.current?.save() : bytes;
      if (!output) throw Error();
      const blob = new Blob([output as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const href = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = href; anchor.download = editing ? `${filename.replace(/\.docx$/i, '')}-editado.docx` : filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
      if(!saveToProject)setDirty(false); showToast(en ? 'Word copy downloaded.' : 'Copia Word descargada.', 'success');
    } catch { showToast(en ? 'Could not save the Word copy. Your edits are still open.' : 'No se pudo guardar la copia Word. Tus cambios siguen abiertos.', 'error'); }
    finally { setBusy(false); }
  };
  return <>
    <Button type="button" size="sm" variant="outline" onClick={() => {if(url){setOpen(true);updateLink(true);}else picker.current?.click();}}><WordIcon/>{label || (en ? 'Open Word' : 'Abrir Word')}</Button>
    {!url && <input hidden ref={picker} type="file" accept=".docx" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { setBytes(new Uint8Array(await file.arrayBuffer())); setFilename(file.name); setEditing(true); setDirty(false); setFailed(false); setOpen(true); } catch { showToast(en ? 'Could not open the file.' : 'No se pudo abrir el archivo.', 'error'); } }} />}
    <Dialog.Root open={open} onOpenChange={value => { if (!value) close(); }}><Dialog.DialogContent className="web-word-dialog" onInteractOutside={event => event.preventDefault()}>
      <Dialog.Title><span className="web-word-title"><WordIcon/>{saveToProject?(en?'Project Word draft':'Borrador Word del proyecto'):filename}</span></Dialog.Title>
      <Dialog.Description>{saveToProject?(en?'Edit the document, then save it here. Your saved Word will be available when you reopen the project and in Delivery.':onSaveAndContinue?'Revisa el documento y pulsa «Guardar y continuar» para pasar a Entrega. No necesitas aplicar los borradores por separado.':'Edita el documento y guárdalo aquí. Tu Word estará disponible al volver al proyecto y en Entrega.'):(en?'Review or edit a Word copy.':'Revisa o edita una copia Word.')}</Dialog.Description>
      <TooltipProvider delayDuration={250}><div className="web-word-actions">
        <div className="web-word-zoom" role="group" aria-label={en?'Document zoom':'Zoom del documento'}>
          <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={en?'Zoom out':'Alejar'} disabled={zoom==='50'} onClick={()=>setZoom(String(Math.max(50,(zoom==='auto'?100:Number(zoom))-25)))}><ZoomOut size={18}/></Button></TooltipTrigger><TooltipContent>{en?'Zoom out':'Alejar'}</TooltipContent></Tooltip>
          {zoom!=='auto'&&<output className="web-word-zoom-value" aria-live="polite">{zoom}%</output>}
          <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={en?'Zoom in':'Acercar'} disabled={zoom==='200'} onClick={()=>setZoom(String(Math.min(200,(zoom==='auto'?100:Number(zoom))+25)))}><ZoomIn size={18}/></Button></TooltipTrigger><TooltipContent>{en?'Zoom in':'Acercar'}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button size="icon" variant={zoom==='auto'?'secondary':'ghost'} aria-label={en?'Fit width':'Ajustar al ancho'} aria-pressed={zoom==='auto'} onClick={()=>setZoom('auto')}><MoveHorizontal size={18}/></Button></TooltipTrigger><TooltipContent>{en?'Fit page to width':'Ajustar la página al ancho'}</TooltipContent></Tooltip>
        </div>
        {!editing&&<Tooltip><TooltipTrigger asChild><Button aria-label={en?'Edit document':'Editar documento'} size="icon" variant="outline" disabled={!bytes||busy} onClick={()=>setEditing(true)}><Pencil size={16}/></Button></TooltipTrigger><TooltipContent>{en?'Edit document':'Editar documento'}</TooltipContent></Tooltip>}
        {saveToProject&&<Button size="sm" disabled={(!dirty&&!(onSaveAndContinue&&pendingCount===0))||!bytes||busy||failed} onClick={()=>void save(!!onSaveAndContinue&&pendingCount===0)}><Save size={16}/>{busy?(en?'Saving…':'Guardando…'):(onSaveAndContinue&&pendingCount===0?(en?'Save and continue':'Guardar y continuar'):(en?'Save draft':'Guardar borrador'))}</Button>}
        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="outline" aria-label={en?'Download Word':'Descargar Word'} disabled={!bytes||busy||failed} onClick={()=>void download()}><Download size={16}/></Button></TooltipTrigger><TooltipContent>{en?'Download a DOCX to open in Microsoft Word.':'Descarga un DOCX para abrirlo en Microsoft Word.'}</TooltipContent></Tooltip>
        {saveToProject&&<Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={en?'About saving':'Acerca del guardado'}><CircleHelp size={17}/></Button></TooltipTrigger><TooltipContent>{en?'Saves this formatted Word document. Chapter source text is managed separately.':'Guarda este documento Word con su formato. Los textos de origen por capítulo se gestionan por separado.'}</TooltipContent></Tooltip>}
        <span role="status" className="web-word-save-status">{dirty?(en?'Unsaved changes':'Cambios sin guardar'):saved?<><Check size={15}/>{en?'Saved in project':'Guardado en el proyecto'}</>:null}</span>
      </div></TooltipProvider>
      {dirty&&recoveryState==='saved'&&<p role="status">{en?'Recovery copy saved. Review and save your Word when ready.':'Copia de recuperación guardada. Revisa y guarda el Word cuando termines.'}</p>}
      {recoveryState==='failed'&&<p role="alert">{en?'Could not save a recovery copy. Keep this window open and save your Word.':'No se pudo guardar la copia de recuperación. Mantén esta ventana abierta y guarda el Word.'}</p>}
      {recoveryState==='stale'&&url&&<p role="alert">{en?'A recovery copy belongs to an older version. Download it before editing.':'Hay una copia de recuperación de una versión anterior. Descárgala antes de editar.'} <a href={`${url}/recovery`} download>{en?'Download recovery copy':'Descargar copia de recuperación'}</a></p>}
      {failed && <div role="alert"><p>{en ? 'Could not load Word.' : 'No se pudo cargar el Word.'}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>{en ? 'Retry' : 'Reintentar'}</Button></div>}
      <div className="web-word-canvas"><WordEditorBoundary key={`${open}-${retry}`} language={language}><Suspense fallback={<p role="status">{en ? 'Opening editor…' : 'Abriendo editor…'}</p>}>{bytes && <WordCanvas ref={editor} projectId={projectId} wordId={wordId} bytes={bytes} name={filename} language={language} zoom={zoom === 'auto' ? undefined : Number(zoom) / 100} editing={editing} onPendingCount={setPendingCount} onChange={() => { if (editing) {changeSequence.current++;setDirty(true);setRecoveryState(value=>value==='stale'?'stale':'none');setRecoveryTick(value=>value+1);} }} onSave={() => void (saveToProject?save():download())} />}</Suspense></WordEditorBoundary></div>
      {discard && <div className="web-word-discard" role="alert"><p>{en ? 'Close without saving your changes?' : '¿Cerrar sin guardar tus cambios?'}</p><Button variant="outline" onClick={() => setDiscard(false)}>{en ? 'Keep editing' : 'Seguir editando'}</Button><Button variant="destructive" onClick={() => { void (async()=>{savingRef.current=true;try{if(recoveryFlight.current)await recoveryFlight.current;if(url&&recoveryVersion.current!=='0'&&recoveryState!=='stale'){const result=await fetch(`${url}/recovery`,{method:'DELETE',credentials:'same-origin',headers:{'if-match':`"${recoveryVersion.current}"`}});if(!result.ok&&result.status!==404)throw Error();recoveryVersion.current='0';}setDirty(false);setDiscard(false);setOpen(false);setBytes(undefined);setEditing(false);setRecoveryState('none');updateLink(false);}catch{showToast(en?'Could not discard the recovery copy. Try again.':'No se pudo descartar la copia de recuperación. Inténtalo de nuevo.','error');}finally{savingRef.current=false;}})(); }}>{en ? 'Discard and close' : 'Descartar y cerrar'}</Button></div>}
    </Dialog.DialogContent></Dialog.Root>
  </>;
}
