import {RefreshCw} from 'lucide-react';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import {request} from './api.mjs';

export type Selection = {id:string;name?:string|null;downloadUrl?:string|null;state:'pending'|'failed'|'imported'|'queued'};
type ImportState = Selection['state'];

export function WebSelectedSecopImports({projectId,language,fallbackUrl,onRefresh,onActivity}:{projectId:string;language:'es'|'en';fallbackUrl?:string;onRefresh:()=>Promise<void>;onActivity?:(state:{items:Selection[];busy:string})=>void}) {
  const en=language==='en';
  const [items,setItems]=useState<Selection[] | null>(null);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState(false);
  const [open,setOpen]=useState(true);
  const [completedInSession,setCompletedInSession]=useState(false);
  const onRefreshRef=useRef(onRefresh);
  onRefreshRef.current=onRefresh;
  const mountedRef=useRef(true);
  useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false;};},[]);

  const importOne=useCallback(async(targetProject:string,id:string,isLive:()=>boolean):Promise<ImportState>=>{
    setBusy(id);
    let nextState:ImportState='failed';
    try{
      const result=await request<{job?:unknown;state?:string}>(`/api/projects/${encodeURIComponent(targetProject)}/secop/imports/${encodeURIComponent(id)}`,{method:'POST'});
      nextState=result.job||result.state==='queued'?'queued':'imported';
    }catch{
      nextState='failed';
    }
    if(!isLive())return nextState;
    setItems(current=>current?.map(row=>row.id===id?{...row,state:nextState}:row)||null);
    if(nextState!=='failed')void onRefreshRef.current().catch(()=>undefined);
    return nextState;
  },[]);

  useEffect(()=>{
    let live=true;
    const isLive=()=>live&&mountedRef.current;
    setItems(null);
    setBusy('');
    setError(false);
    setOpen(true);
    setCompletedInSession(false);
    const run=async()=>{
      try{
        const data=await request<{items:Selection[]}>(`/api/projects/${encodeURIComponent(projectId)}/secop/imports`);
        if(!isLive())return;
        setItems(data.items);
        let currentItems=data.items;
        const hadPending=currentItems.some(item=>item.state==='pending');
        for(const item of data.items){
          if(!isLive()||item.state!=='pending')continue;
          const nextState=await importOne(projectId,item.id,isLive);
          currentItems=currentItems.map(row=>row.id===item.id?{...row,state:nextState}:row);
        }
        if(isLive()){
          setBusy('');
          if(hadPending&&currentItems.length&&currentItems.every(item=>item.state==='imported'))setCompletedInSession(true);
          void onRefreshRef.current().catch(()=>undefined);
        }
      }catch{
        if(isLive())setError(true);
      }
    };
    void run();
    return()=>{live=false;};
  },[projectId,importOne]);

  const retry=async(id:string)=>{
    if(busy)return;
    const nextState=await importOne(projectId,id,()=>mountedRef.current);
    if(!mountedRef.current)return;
    setBusy('');
    if(nextState==='imported'&&items?.every(item=>item.id===id||item.state==='imported'))setCompletedInSession(true);
  };

  const retryFailed=async()=>{
    if(busy||!items)return;
    const failedIds=items.filter(item=>item.state==='failed').map(item=>item.id);
    if(!failedIds.length)return;
    const nextStates=new Map<string,ImportState>();
    for(const id of failedIds){
      if(!mountedRef.current)return;
      nextStates.set(id,await importOne(projectId,id,()=>mountedRef.current));
    }
    if(!mountedRef.current)return;
    setBusy('');
    if(items.every(item=>(nextStates.get(item.id)??item.state)==='imported'))setCompletedInSession(true);
  };

  useEffect(()=>{
    if(busy||!items?.some(item=>item.state==='queued'))return;
    let live=true;
    const timer=window.setInterval(async()=>{
      try{
        const data=await request<{items:Selection[]}>(`/api/projects/${encodeURIComponent(projectId)}/secop/imports`);
        if(!live)return;
        const changed=JSON.stringify(data.items)!==JSON.stringify(items);
        if(changed){
          setItems(data.items);
          if(data.items.some(row=>row.state==='imported'))void onRefreshRef.current().catch(()=>undefined);
          if(data.items.length&&data.items.every(row=>row.state==='imported'))setCompletedInSession(true);
        }
      }catch{/* Retry on next poll. */}
    },3000);
    return()=>{live=false;window.clearInterval(timer);};
  },[busy,items,projectId]);

  useEffect(()=>{onActivity?.({items:items||[],busy});},[items,busy,onActivity]);

  if(error)return <p role="alert">{en?'Could not load the selected documents. Reopen the project to retry.':'No se pudo consultar la selección de documentos. Vuelve a abrir el proyecto para reintentar.'}</p>;
  if(!items?.length)return null;
  const allImported=items.every(item=>item.state==='imported');
  if(allImported&&!completedInSession)return null;

  const imported=items.filter(item=>item.state==='imported').length;
  const queued=items.filter(item=>item.state==='queued').length;
  const failed=items.filter(item=>item.state==='failed').length;
  const completedCount=imported+queued;
  const activeItem=busy?items.find(item=>item.id===busy):undefined;
  const activeName=activeItem?.name||activeItem?.id||'';
  const statusLabel=(item:Selection)=>{
    if(item.id===busy)return en?'Downloading…':'Descargando…';
    if(item.state==='imported')return en?'Imported':'Importado';
    if(item.state==='pending')return en?'Pending':'Pendiente';
    if(item.state==='queued')return en?'Waiting for runner':'En espera del runner';
    return en?'Failed':'Error';
  };
  const summaryTitle=busy
    ?(en?`Downloading documents (${completedCount}/${items.length})`:`Descargando documentos (${completedCount}/${items.length})`)
    :allImported
      ?(en?'Document import complete':'Importación completa')
      :(en?'Document import':'Importación de documentos');
  const summaryMeta=allImported
    ?(en?`${imported}/${items.length} imported`:`${imported}/${items.length} importados`)
    :`${imported}/${items.length} ${en?'imported':'importados'}${queued>0?` · ${queued} ${en?'queued':'en espera'}`:''}${failed>0?` · ${failed} ${en?'failed':'con error'}`:''}`;

  return <div className="web-import-overview">
    <details className="web-selected-imports" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
      <summary><span>{summaryTitle}</span><span>{summaryMeta}</span></summary>
      {busy&&<div className="web-import-progress" role="status" aria-live="polite">
        <span>{en?`Downloading ${Math.min(completedCount+1,items.length)} of ${items.length}: ${activeName}`:`Descargando ${Math.min(completedCount+1,items.length)} de ${items.length}: ${activeName}`}</span>
        <progress value={completedCount} max={items.length} aria-label={en?'Document download progress':'Progreso de descarga de documentos'}/>
      </div>}
      {allImported&&completedInSession&&<p className="web-selected-imports-done" role="status">{en?`All ${items.length} document(s) imported successfully.`:`Se importaron correctamente los ${items.length} documento(s).`}</p>}
      <div className="web-selected-imports-actions">
        <p>{failed>0?(en?'If a file fails, download it manually and upload it in the drop zone below.':'Si algún archivo falla, descárgalo manualmente y súbelo en la zona de carga.'):(en?'Pending imports resume when you open this project. ZIP files need a local runner.':'Las importaciones pendientes continúan al abrir este proyecto. Los ZIP necesitan un runner local.')}</p>
        {failed>0&&!busy&&<Button icon={RefreshCw} variant="outline" size="sm" onClick={()=>void retryFailed()}>{en?'Retry failed':'Reintentar fallidos'}</Button>}
      </div>
      <div className="web-selected-import-list">
        {items.map(item=>{
          const visualState=item.id===busy?'importing':item.state;
          const manualUrl=item.downloadUrl||fallbackUrl;
          return <div className="web-selected-import" key={item.id}>
            <span className="web-selected-import-name">{item.name||(en?`Document ${item.id}`:`Documento ${item.id}`)}</span>
            <div className="web-inline">
              <span className="web-selected-import-status" data-state={visualState}>{statusLabel(item)}</span>
              {item.state==='failed'&&manualUrl&&<a className="web-link web-selected-import-manual" href={manualUrl} target="_blank" rel="noopener noreferrer">{en?'Download manually ↗':'Descargar manualmente ↗'}</a>}
              {item.state==='failed'&&<Button icon={RefreshCw} iconOnly variant="outline" size="sm" disabled={!!busy} onClick={()=>void retry(item.id)}>{en?'Retry':'Reintentar'}</Button>}
            </div>
          </div>;
        })}
      </div>
    </details>
  </div>;
}
