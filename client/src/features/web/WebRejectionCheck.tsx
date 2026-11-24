import {ShieldAlert, RefreshCw, Save, ScanSearch, FileSearch, Trash2, FileSpreadsheet} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import AppDialog from '@/shared/ui/AppDialog';
import {useToast} from '@/shared/ui/ToastProvider';
import {request} from './api.mjs';

type FileItem={id:string;name:string;deleting?:number|boolean};
type Options={rejectionCheck:boolean;typoCheck:boolean;logicCheck:boolean};
type Job={id:string;kind:string;state:string;credentialId?:string|null;artifactState?:string;payload:{fileIds?:string[];tenderFileIds?:string[];bidFileIds?:string[];bidDocument?:string};result:{criteria?:string;analysisStatus?:string;message?:string}|null};
type Finding={id:string;bidDocumentId?:string;title?:string;summary?:string;severity?:string;requirement?:string;bidEvidence?:string;riskReason?:string;suggestion?:string;wrongText?:string;correctText?:string;originalExcerpt?:string;reason?:string;originalText?:string;fallacyReason?:string;locationHint?:string};
type Draft={criteria:string;custom:string;options:Options;version:number};
type Section={status:string;findings?:Finding[];error?:string;removedCount?:number};
type Report={status:string;criteria?:{content?:string};sourceFiles?:{id:string;name:string}[];rejectionCheckResult?:Section;typoCheckResult?:Section;logicCheckResult?:Section};
export default function WebRejectionCheck({projectId,language,files,jobs,credentialId,onRefresh,onDirtyChange,onPrepareProposal,defaultOpen=false}:{projectId:string;language:'es'|'en';files:FileItem[];jobs:Job[];credentialId:string;onRefresh:()=>Promise<void>;onDirtyChange:(dirty:boolean)=>void;onPrepareProposal?:()=>void;defaultOpen?:boolean}){
 const en=language==='en',{showToast}=useToast(),[roles,setRoles]=useState<Record<string,string>>({}),[criteria,setCriteria]=useState(''),[custom,setCustom]=useState(''),[dirty,setDirty]=useState(false),[consentFor,setConsentFor]=useState(''),[options,setOptions]=useState<Options>({rejectionCheck:true,typoCheck:true,logicCheck:true}),[busy,setBusy]=useState(''),[selected,setSelected]=useState(''),[report,setReport]=useState<Report|null>(null),[failed,setFailed]=useState(false),[removeId,setRemoveId]=useState(''),[findingToRemove,setFindingToRemove]=useState<{jobId:string;section:'rejection'|'typo'|'logic';id:string;title:string}|null>(null),[reportReload,setReportReload]=useState(0),[draftVersion,setDraftVersion]=useState<number|null>(null),[draftFailed,setDraftFailed]=useState(false),[draftReload,setDraftReload]=useState(0),[draftConflict,setDraftConflict]=useState(false);
 const selectedRef=useRef(selected);selectedRef.current=selected;
 const autoSelectedDraftRef=useRef('');
 const draftLabel=en?'Generated proposal draft (DOCX)':'Borrador de propuesta generado (DOCX)';
 const generatedWordJob=jobs.find(job=>job.kind==='technical-plan.export-word'&&job.state==='succeeded'&&job.artifactState==='stored'&&job.payload?.bidDocument!=='economic');
 const generatedDraftId=generatedWordJob?`word-draft:${generatedWordJob.id}`:'';
 const submission=useRef<{body:string;key:string}|null>(null),relevant=jobs.filter(job=>job.kind==='rejection-check.extract'||job.kind==='rejection-check.analyze'),available=files.filter(file=>!file.deleting),tenders=available.filter(file=>roles[file.id]==='tender').map(file=>file.id),bids=[...(generatedDraftId&&roles[generatedDraftId]==='bid'?[generatedDraftId]:[]),...available.filter(file=>roles[file.id]==='bid').map(file=>file.id)],fileIds=[...tenders,...bids],selection=JSON.stringify({tenders,bids,credentialId,criteria,custom,options}),consent=true;
 useEffect(()=>{autoSelectedDraftRef.current='';},[projectId]);
 useEffect(()=>{if(!generatedDraftId||autoSelectedDraftRef.current===generatedDraftId)return;autoSelectedDraftRef.current=generatedDraftId;setRoles(current=>Object.hasOwn(current,generatedDraftId)?current:{...current,[generatedDraftId]:'bid'});},[generatedDraftId]);
 useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false);},[dirty,onDirtyChange]);
 useEffect(()=>{let active=true;setDraftVersion(null);setDraftFailed(false);void request<Draft>(`/api/projects/${encodeURIComponent(projectId)}/rejection-draft`).then(value=>{if(active){setCriteria(value.criteria);setCustom(value.custom);setOptions(value.options);setDraftVersion(value.version);setDirty(false);}}).catch(()=>{if(active)setDraftFailed(true);});return()=>{active=false;};},[projectId,draftReload]);
 const saveDraft=async()=>{if(busy||draftVersion===null||!dirty)return;setBusy('draft');try{const saved=await request<Draft>(`/api/projects/${encodeURIComponent(projectId)}/rejection-draft`,{method:'PUT',json:{criteria,custom,options,version:draftVersion}});setDraftVersion(saved.version);setDirty(false);setDraftConflict(false);showToast(en?'Draft saved.':'Borrador guardado.','success');}catch(error){if((error as Error & {status?:number}).status===409)setDraftConflict(true);else showToast(en?'Could not save the draft.':'No se pudo guardar el borrador.','error');}finally{setBusy('');}};
 const path=(id:string)=>`/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(id)}/artifact`;
 useEffect(()=>{let active=true;setReport(null);setFailed(false);if(selected)void request<Report>(path(selected)).then(value=>{if(active)setReport(value);}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[selected,projectId,reportReload]);
 useEffect(()=>{if(selected&&jobs.find(job=>job.id===selected)?.artifactState!=='stored'){setSelected('');setReport(null);}},[selected,jobs]);
 const queue=async(mode:'extract'|'analyze')=>{if(busy||!credentialId||!consent)return;const payload=mode==='extract'?{fileIds:tenders,language,dataProcessingConsent:true}:{fileIds,tenderFileIds:tenders,bidFileIds:bids,language,dataProcessingConsent:true,options,criteria,customCheckItems:custom},body={kind:`rejection-check.${mode}`,credentialId,payload},serialized=JSON.stringify(body);if(submission.current?.body!==serialized)submission.current={body:serialized,key:crypto.randomUUID()};setBusy(mode);try{await request(`/api/projects/${encodeURIComponent(projectId)}/jobs`,{method:'POST',headers:{'idempotency-key':submission.current.key},json:body});submission.current=null;showToast(en?'Task queued for the local runner.':'Tarea enviada al runner local.','success');await onRefresh().catch(()=>showToast(en?'Task queued; refresh its status.':'Tarea enviada; actualiza su estado.','info'));}catch{showToast(en?'Could not start the task. Retry the same selection.':'No se pudo iniciar la tarea. Reintenta con la misma selección.','error');}finally{setBusy('');}};
 const cancel=async(id:string)=>{setBusy(id);try{await request(`/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(id)}/cancel`,{method:'POST'});await onRefresh();}catch{showToast(en?'Could not cancel the task.':'No se pudo cancelar la tarea.','error');}finally{setBusy('');}};
 const remove=async()=>{const id=removeId;if(!id||busy)return;setBusy(id);try{await request(path(id),{method:'DELETE'});if(selected===id){setSelected('');setReport(null);}showToast(en?'Report removed.':'Informe eliminado.','success');}catch(error){if((error as Error & {status?:number}).status===503){if(selected===id){setSelected('');setReport(null);}showToast(en?'Removal is pending. Retry from the task.':'La eliminación está pendiente. Reintenta desde la tarea.','error');}else showToast(en?'Could not remove the report.':'No se pudo eliminar el informe.','error');}finally{setRemoveId('');setBusy('');await onRefresh().catch(()=>undefined);}};
 const removeFinding=async()=>{const target=findingToRemove;if(!target||busy)return;setBusy(target.id);try{await request(`/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(target.jobId)}/rejection-findings/remove`,{method:'POST',json:{section:target.section,findingId:target.id}});const updated=await request<Report>(path(target.jobId));if(selectedRef.current===target.jobId)setReport(updated);showToast(en?'Finding removed.':'Hallazgo retirado.','success');}catch{if(selectedRef.current===target.jobId)await request<Report>(path(target.jobId)).then(setReport).catch(()=>undefined);showToast(en?'Could not update the finding. Refresh the report.':'No se pudo actualizar el hallazgo. Actualiza el informe.','error');}finally{setFindingToRemove(null);setBusy('');}};
 const exportExcel=async()=>{const job=relevant.find(item=>item.id===selected);if(!report||!job||busy)return;setBusy('excel');try{const {buildRejectionExcel}=await import('./rejection-excel.mjs');const bytes=buildRejectionExcel(report,{language,files:[...files,...(generatedDraftId?[{id:generatedDraftId,name:draftLabel}]:[])],bidFileIds:job.payload.bidFileIds||[]});const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=url;link.download=en?'rejection-review.xlsx':'revision-rechazo.xlsx';document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{showToast(en?'Could not export the Excel report.':'No se pudo exportar el informe Excel.','error');}finally{setBusy('');}};
 const names=new Map([...(report?.sourceFiles||[]),...files,...(generatedDraftId?[{id:generatedDraftId,name:draftLabel}]:[])].map(file=>[file.id,file.name])),name=(id:string)=>names.get(id)||(id.startsWith('word-draft:')?draftLabel:en?'Unavailable document':'Documento no disponible');
 const jobStatus=(value:string)=>({queued:en?'Queued':'En cola',running:en?'Running':'En ejecución',succeeded:en?'Complete':'Completado',failed:en?'Failed':'Falló',cancelled:en?'Cancelled':'Cancelado',interrupted:en?'Interrupted':'Interrumpido',success:en?'Complete':'Completado',error:en?'Partial or failed':'Parcial o con errores'} as Record<string,string>)[value]||value;
 const renderSection=(label:string,kind:'rejection'|'typo'|'logic',section?:Section)=>!section?null:<details><summary>{label} · {jobStatus(section.status)} ({section.findings?.length||0})</summary>{!!section.removedCount&&<p>{en?'Removed findings':'Hallazgos retirados'}: {section.removedCount}</p>}{section.status==='error'?<p>{en?'This check failed; no conclusion is available.':'Esta comprobación falló; no hay una conclusión disponible.'}</p>:!section.findings?.length?<p>{section.removedCount?(en?'No findings remain.':'No quedan hallazgos.'):(en?'No findings were reported.':'No se reportaron hallazgos.')}</p>:section.findings.map((item,index)=><article key={item.id||index}><strong>{item.title||item.wrongText||label}</strong>{item.bidDocumentId&&<p>{name(item.bidDocumentId)}</p>}{item.severity&&<p>{en?'Severity':'Gravedad'}: {({high:en?'High':'Alta',medium:en?'Medium':'Media',low:en?'Low':'Baja'} as Record<string,string>)[item.severity]||item.severity}</p>}{([['summary',en?'Summary':'Resumen'],['requirement',en?'Requirement':'Requisito'],['bidEvidence',en?'Bid evidence':'Evidencia de la oferta'],['riskReason',en?'Reason':'Motivo'],['wrongText',en?'Incorrect text':'Texto incorrecto'],['correctText',en?'Suggested correction':'Corrección sugerida'],['originalExcerpt',en?'Original excerpt':'Fragmento original'],['reason',en?'Reason':'Motivo'],['originalText',en?'Original text':'Texto original'],['fallacyReason',en?'Reason':'Motivo'],['locationHint',en?'Location':'Ubicación'],['suggestion',en?'Suggestion':'Sugerencia']] as [keyof Finding,string][]).map(([field,title])=>item[field]?<p key={field}><strong>{title}:</strong> {item[field]}</p>:null)}<Button size="sm" variant="ghost" disabled={!!busy||!item.id} onClick={()=>setFindingToRemove({jobId:selected,section:kind,id:item.id,title:item.title||item.wrongText||label})}>{en?'Remove finding':'Retirar hallazgo'}</Button></article>)}</details>;
 const selectedSources=(job:Job)=>JSON.stringify([...(job.payload.fileIds||[])].sort())===JSON.stringify([...tenders].sort());
 const setOption=(key:keyof Options,value:boolean)=>{setOptions(current=>({...current,[key]:value}));setDirty(true);};
 const hasAssignedRoles=tenders.length>0||bids.length>0;
 const startBlocker=fileIds.length>50
  ?(en?'Select at most 50 documents.':'Selecciona como máximo 50 documentos.')
  :!bids.length
   ?(en?'Mark at least one file as “Bid” in step 1.':'Marca al menos un archivo como «Oferta» en el paso 1.')
   :!Object.values(options).some(Boolean)
    ?(en?'Enable at least one check type.':'Activa al menos un tipo de comprobación.')
    :options.rejectionCheck&&!criteria.trim()
     ?(en?'Extract or enter rejection criteria in step 2 (or uncheck “Rejection risks”).':'Extrae o escribe las causales de rechazo en el paso 2 (o desmarca «Causales de rechazo»).')
     :null;
 const startDisabled=!!busy||draftVersion===null||!credentialId||!consent||!!startBlocker;
 return <details className="web-technical-plan" open={defaultOpen||undefined}><summary className="web-review-summary"><ShieldAlert size={18} aria-hidden="true"/><span><strong>{en?'Review rejection risks':'Revisar causales de rechazo'}</strong><small>{en?'Identify potential rejection risks in the documents.':'Identifica posibles motivos de rechazo en los documentos.'}</small></span></summary>
 <div className="web-review-steps">
  <section className="web-review-step" aria-labelledby={`rejection-step-1-${projectId}`}>
   <div className="web-review-step-head">
    <span className="web-review-step-num" aria-hidden="true">1</span>
    <div>
     <h3 id={`rejection-step-1-${projectId}`}>{en?'Mark which files are tenders and which are your bid':'Indica qué archivos son pliegos y cuáles son tu oferta'}</h3>
     <p className="web-review-hint" role="status">{en?`${tenders.length} tender(s) · ${bids.length} bid(s)`:`${tenders.length} pliego(s) · ${bids.length} oferta(s)`}</p>
    </div>
    {(available.length>0||hasAssignedRoles) && <div className="web-review-step-actions">
     {available.length>0 && <Button size="sm" variant="outline" disabled={!!busy} onClick={()=>setRoles(current=>({...Object.fromEntries(available.map(file=>[file.id,'tender'])),...(generatedDraftId&&current[generatedDraftId]?{[generatedDraftId]:current[generatedDraftId]}:{})}))}>{en?'Mark all as tender':'Marcar todos como pliego'}</Button>}
     {hasAssignedRoles && <Button size="sm" variant="ghost" disabled={!!busy} onClick={()=>setRoles({})}>{en?'Clear selection':'Limpiar selección'}</Button>}
    </div>}
   </div>
   {!generatedDraftId && <div className="web-review-proposal-notice" role="status">
    <div className="web-review-proposal-notice-copy">
     <strong>{en?'No generated proposal draft yet':'Aún no hay una propuesta generada'}</strong>
     <p>{available.length>0?(en?'Generate the Word proposal first in “Prepare bid” to validate it here without downloading or uploading it again, or mark an uploaded document as Bid below.':'Primero genera la propuesta en Word desde «Preparar oferta» para validarla aquí sin descargarla ni volver a subirla, o marca uno de tus documentos como Oferta abajo.'):(en?'Generate the Word proposal first in “Prepare bid” to validate it here, or upload your bid documents in Documents.':'Primero genera la propuesta en Word desde «Preparar oferta» para validarla aquí, o sube tu oferta en Documentos.')}</p>
    </div>
    {onPrepareProposal && <Button size="sm" variant="outline" disabled={!!busy} onClick={onPrepareProposal}>{en?'Go to Prepare bid':'Ir a Preparar oferta'}</Button>}
   </div>}
   {(generatedDraftId||available.length>0) ? <div className="web-review-role-list" role="region" aria-label={en?'Project documents':'Documentos del proyecto'}>
    {generatedDraftId && <div className="web-review-role-row">
     <div className="web-review-role-meta">
      <span className="web-review-role-name" title={draftLabel}>{draftLabel}</span>
      <span className="web-review-draft-pill">{en?'Generated proposal':'Propuesta generada'}</span>
     </div>
     <div className="web-review-role-group" role="group" aria-label={`${en?'Role of':'Función de'} ${draftLabel}`}>
      {([['',en?'Skip':'No incluir'],['bid',en?'Bid':'Oferta']] as const).map(([value,label])=>{
       const active=(roles[generatedDraftId]||'')===value;
       return <button key={value||'none'} type="button" disabled={!!busy} aria-pressed={active} data-role={value||'none'} className={`web-review-role-option${active?' is-active':''}`} onClick={()=>setRoles(current=>({...current,[generatedDraftId]:value}))}>{label}</button>;
      })}
     </div>
    </div>}
    {available.map(file=>{
     const role=roles[file.id]||'';
     return <div key={file.id} className="web-review-role-row">
      <span className="web-review-role-name" title={file.name}>{file.name}</span>
      <div className="web-review-role-group" role="group" aria-label={`${en?'Role of':'Función de'} ${file.name}`}>
       {([['',en?'Skip':'No incluir'],['tender',en?'Tender':'Pliego'],['bid',en?'Bid':'Oferta']] as const).map(([value,label])=>{
        const active=role===value;
        return <button key={value||'none'} type="button" disabled={!!busy} aria-pressed={active} data-role={value||'none'} className={`web-review-role-option${active?' is-active':''}`} onClick={()=>setRoles(current=>({...current,[file.id]:value}))}>{label}</button>;
       })}
      </div>
     </div>;
    })}
   </div> : <p className="web-review-hint">{en?'No project documents available. Upload files in Documents first.':'No hay documentos disponibles en este proyecto. Súbelos primero en Documentos.'}</p>}
   <p className="web-review-hint">{en?'Supported formats: TXT, Markdown, DOCX and PDF with selectable text (up to 1,000,000 characters total). Savia sends selected files to your configured provider.':'Admite TXT, Markdown, DOCX y PDF con texto seleccionable (hasta un millón de caracteres en total). Savia envía los archivos seleccionados a tu proveedor configurado.'}</p>
   {fileIds.length>50&&<p role="alert">{en?'Select no more than 50 documents.':'Selecciona como máximo 50 documentos.'}</p>}
  </section>

  <section className="web-review-step" aria-labelledby={`rejection-step-2-${projectId}`}>
   <div className="web-review-step-head">
    <span className="web-review-step-num" aria-hidden="true">2</span>
    <div>
     <h3 id={`rejection-step-2-${projectId}`}>{en?'Extract or enter rejection criteria':'Obtén o escribe las causales de rechazo'}</h3>
     <p className="web-review-hint">{en?'Extract them automatically from marked tenders or type them manually.':'Extráelas automáticamente de los pliegos marcados o escríbelas manualmente.'}</p>
    </div>
   </div>
   <div className="web-review-inline-row">
    <Button size="sm" variant="outline" disabled={!!busy||draftVersion===null||!credentialId||!consent||!tenders.length||fileIds.length>50} onClick={()=>void queue('extract')}>{en?'Extract criteria from tenders':'Extraer causales de los pliegos'}</Button>
    {!tenders.length && <span className="web-review-hint">{en?'Mark at least one file as Tender in step 1 to extract.':'Marca al menos un archivo como Pliego en el paso 1 para extraerlas.'}</span>}
   </div>
   <label className="web-review-field">
    <span>{en?'Rejection criteria':'Causales de rechazo'}</span>
    <textarea disabled={!!busy||draftVersion===null} value={criteria} maxLength={200000} placeholder={en?'E.g. Delivery deadline, mandatory signature, page limit…':'Ej. Plazo máximo de entrega, firma obligatoria, límite de páginas…'} onChange={event=>{setCriteria(event.target.value);setDirty(true);}} />
   </label>
   <details className="web-review-optional" open={!!custom.trim()||undefined}>
    <summary>{en?'Additional checks (optional)':'Comprobaciones adicionales (opcional)'}</summary>
    <label className="web-review-field">
     <span>{en?'Custom checks':'Instrucciones o validaciones extra'}</span>
     <textarea disabled={!!busy||draftVersion===null} value={custom} maxLength={20000} onChange={event=>{setCustom(event.target.value);setDirty(true);}} />
    </label>
   </details>
   {draftVersion===null&&!draftFailed&&<p className="web-review-hint" role="status">{en?'Loading draft…':'Cargando borrador…'}</p>}
   {draftFailed&&<p role="alert">{en?'Could not load the draft.':'No se pudo cargar el borrador.'} <Button icon={RefreshCw} iconOnly size="sm" variant="outline" onClick={()=>setDraftReload(value=>value+1)}>{en?'Retry':'Reintentar'}</Button></p>}
   {draftConflict&&<p role="alert">{en?'Another session changed this draft. Copy your edits before reloading the page to see the saved version.':'Otra sesión modificó este borrador. Copia tus cambios antes de recargar la página para ver la versión guardada.'}</p>}
   <div className="web-review-inline-row">
    <Button icon={Save} size="sm" variant="outline" disabled={!!busy||draftVersion===null||!dirty||draftConflict} onClick={()=>void saveDraft()}>{en?'Save draft':'Guardar borrador'}</Button>
    {dirty&&<span className="web-review-hint" role="status">{en?'Draft has unsaved changes.':'El borrador tiene cambios sin guardar.'}</span>}
   </div>
  </section>

  <section className="web-review-step" aria-labelledby={`rejection-step-3-${projectId}`}>
   <div className="web-review-step-head">
    <span className="web-review-step-num" aria-hidden="true">3</span>
    <div>
     <h3 id={`rejection-step-3-${projectId}`}>{en?'Choose what to check and start review':'Elige qué comprobar e inicia la revisión'}</h3>
    </div>
   </div>
   <div className="web-review-checks-row">
    {([['rejectionCheck',en?'Rejection risks':'Causales de rechazo'],['typoCheck',en?'Spelling':'Ortografía'],['logicCheck',en?'Logic':'Lógica']] as [keyof Options,string][]).map(([key,label])=><label key={key} className="web-consent"><input type="checkbox" disabled={!!busy||draftVersion===null} checked={options[key]} onChange={event=>setOption(key,event.target.checked)} />{label}</label>)}
   </div>
   <div className="web-review-inline-row">
    <Button icon={ScanSearch} size="sm" disabled={startDisabled} onClick={()=>void queue('analyze')}>{en?'Start review':'Iniciar revisión'}</Button>
    {startDisabled&&startBlocker&&draftVersion!==null&&!busy&&<span className="web-review-hint" role="status">{startBlocker}</span>}
   </div>
  </section>
 </div>
 {relevant.map(job=><article key={job.id}><p><strong>{job.kind==='rejection-check.extract'?(en?'Criteria extraction':'Extracción de causales'):(en?'Bid review':'Revisión de ofertas')}</strong> · {jobStatus(job.state)}{job.result?.analysisStatus==='error'&&` · ${en?'Some checks failed.':'Algunas comprobaciones fallaron.'}`}</p><p>{(job.payload.fileIds||[]).map(name).join(', ')}</p>{job.result?.message&&<p>{job.result.message}</p>}{job.kind==='rejection-check.extract'&&job.result?.criteria&&<><p>{en?'Review the extracted text before using it.':'Revisa el texto extraído antes de utilizarlo.'}</p><Button size="sm" variant="outline" disabled={!!busy||draftVersion===null||!selectedSources(job)} onClick={()=>{setCriteria(job.result?.criteria||'');setDirty(true);}}>{en?'Use and review criteria':'Usar y revisar causales'}</Button>{!selectedSources(job)&&<p>{en?'Select the same tender documents to use these criteria.':'Selecciona los mismos pliegos para usar estas causales.'}</p>}</>}{['queued','running'].includes(job.state)&&<Button size="sm" variant="outline" disabled={!!busy} onClick={()=>void cancel(job.id)}>{en?'Cancel':'Cancelar'}</Button>}{job.kind==='rejection-check.analyze'&&job.state==='succeeded'&&job.artifactState==='stored'&&<><Button icon={FileSearch} iconOnly size="sm" variant="outline" onClick={()=>{setSelected(job.id);setReportReload(value=>value+1);}}>{en?'View report':'Ver informe'}</Button> <a className="web-link" href={path(job.id)}>{en?'Download complete report':'Descargar informe completo'}</a></>}{job.kind==='rejection-check.analyze'&&['stored','deletion_pending'].includes(job.artifactState||'')&&!['queued','running'].includes(job.state)&&<Button icon={Trash2} iconOnly size="sm" variant="ghost" disabled={!!busy} onClick={()=>setRemoveId(job.id)}>{job.artifactState==='deletion_pending'?(en?'Retry removal':'Reintentar eliminación'):(en?'Remove report':'Eliminar informe')}</Button>}</article>)}
 {failed&&<p role="alert">{en?'Could not load the report.':'No se pudo cargar el informe.'}</p>}{report&&<section className="web-duplicate-reviews"><h4>{en?'Review results':'Resultados de la revisión'} · {jobStatus(report.status)}</h4><Button icon={FileSpreadsheet} size="sm" variant="outline" disabled={!!busy} onClick={()=>void exportExcel()}>{en?'Export to Excel':'Exportar a Excel'}</Button><p>{en?'Excel cells over 32,767 characters are shortened. Download JSON to preserve all text.':'Las celdas de Excel con más de 32.767 caracteres se acortan. Descarga el JSON para conservar todo el texto.'}</p>{report.criteria?.content&&<details><summary>{en?'Criteria used':'Causales utilizadas'}</summary><p style={{whiteSpace:'pre-wrap'}}>{report.criteria.content}</p></details>}{renderSection(en?'Rejection risks':'Causales de rechazo','rejection',report.rejectionCheckResult)}{renderSection(en?'Spelling':'Ortografía','typo',report.typoCheckResult)}{renderSection(en?'Logic':'Lógica','logic',report.logicCheckResult)}</section>}
 <AppDialog open={!!findingToRemove} onOpenChange={open=>{if(!open&&!busy)setFindingToRemove(null);}} title={en?'Remove this finding?':'¿Retirar este hallazgo?'} description={findingToRemove?.title||''} actions={<><Button variant="outline" disabled={!!busy} onClick={()=>setFindingToRemove(null)}>{en?'Cancel':'Cancelar'}</Button><Button icon={Trash2} variant="destructive" disabled={!!busy} onClick={()=>void removeFinding()}>{en?'Remove':'Retirar'}</Button></>} />
 <AppDialog open={!!removeId} onOpenChange={open=>{if(!open&&!busy)setRemoveId('');}} title={en?'Remove this report?':'¿Eliminar este informe?'} description={en?'The saved report will be removed. The task history and original documents remain.':'Se eliminará el informe guardado. Se conservarán el historial de la tarea y los documentos originales.'} actions={<><Button variant="outline" disabled={!!busy} onClick={()=>setRemoveId('')}>{en?'Cancel':'Cancelar'}</Button><Button icon={Trash2} variant="destructive" disabled={!!busy} onClick={()=>void remove()}>{en?'Remove':'Eliminar'}</Button></>} />
 </details>;
}
