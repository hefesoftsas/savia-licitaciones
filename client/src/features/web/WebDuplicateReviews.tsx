import {WebLoading} from './WebLoading';
import {Archive, CopyCheck, FileText, Image as ImageIcon, RefreshCw, ShieldAlert, Trash2} from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import AppDialog from '@/shared/ui/AppDialog';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import {Tabs, TabsList, TabsTrigger} from '@/shared/ui/primitives/tabs';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';

type Row = Record<string, unknown>;
type Review = { id: string; createdAt: string; deleting: boolean };
type Asset = { expected: boolean; available: boolean; reason?: string };
type Snapshot = { tables: Record<string, Row[]>; files: { id: string; sourceKey: string; category?:'document'|'image';sourceId?:string;reference?:string;original: Asset; content: Asset }[] };
const duplicateSections = [
 ['duplicate_check_metadata_items', 'Metadatos', 'Metadata'],
 ['duplicate_check_outline_items', 'Estructura de los documentos', 'Document outlines'],
 ['duplicate_check_outline_groups', 'Coincidencias de estructura', 'Outline matches'],
 ['duplicate_check_outline_pairwise', 'Comparaciones de estructura', 'Outline comparisons'],
 ['duplicate_check_content_duplicates', 'Frases repetidas', 'Repeated sentences'],
 ['duplicate_check_content_occurrences', 'Ubicaciones de frases', 'Sentence occurrences'],
 ['duplicate_check_image_files', 'Imágenes analizadas', 'Analyzed images'],
 ['duplicate_check_duplicate_images', 'Imágenes coincidentes', 'Matching images'],
 ['duplicate_check_image_occurrences', 'Ubicaciones de imágenes', 'Image occurrences'],
 ['duplicate_check_analysis_sections', 'Estado de los análisis', 'Analysis status'],
 ['duplicate_check_tasks', 'Tareas históricas', 'Historical tasks'],
 ['duplicate_check_meta', 'Estado guardado', 'Saved state'],
 ['duplicate_check_content_files', 'Extracción de texto', 'Text extraction'],
] as const;
const rejectionSections = [
 ['rejection_check_risk_findings','Causales y riesgos','Rejection risks'],
 ['rejection_check_typo_findings','Errores ortográficos','Spelling findings'],
 ['rejection_check_logic_findings','Hallazgos de lógica','Logic findings'],
 ['rejection_check_extraction','Causales extraídas','Extracted criteria'],
 ['rejection_check_results','Estado de las revisiones','Review status'],
 ['rejection_check_tasks','Tareas históricas','Historical tasks'],
 ['rejection_check_meta','Configuración guardada','Saved settings'],
] as const;
const show = (value: unknown) => value === null || value === undefined ? '—' : typeof value === 'string' ? value : JSON.stringify(value);
const rejectionFields:Record<string,[string,string]>={finding_id:['Identificador','Identifier'],bid_document_id:['Documento de oferta','Bid document'],type:['Tipo','Type'],severity:['Gravedad','Severity'],title:['Título','Title'],summary:['Resumen','Summary'],requirement:['Requisito','Requirement'],bid_evidence:['Evidencia de la oferta','Bid evidence'],risk_reason:['Motivo del riesgo','Risk reason'],suggestion:['Sugerencia','Suggestion'],wrong_text:['Texto incorrecto','Incorrect text'],correct_text:['Corrección','Correction'],original_excerpt:['Fragmento original','Original excerpt'],original_text:['Texto original','Original text'],reason:['Motivo','Reason'],location_hint:['Ubicación','Location'],fallacy_reason:['Motivo del problema','Reason for issue'],status:['Estado','Status'],content:['Contenido','Content'],error:['Error','Error'],result_type:['Tipo de resultado','Result type'],updated_at:['Actualizado','Updated'],created_at:['Creado','Created'],sort_order:['Orden','Order'],source:['Origen','Source'],progress:['Progreso','Progress'],progress_message:['Progreso','Progress'],task_id:['Tarea','Task'],started_at:['Inicio','Started'],stats_json:['Estadísticas','Statistics'],id:['Identificador','Identifier']};

export default function WebDuplicateReviews({language,mode='duplicate',embedded=false,defaultOpen=false,onModeChange}:{language:'es'|'en';mode?:'duplicate'|'rejection';embedded?:boolean;defaultOpen?:boolean;onModeChange?:(next:'duplicate'|'rejection')=>void}) {
 const en=language==='en', {showToast}=useToast();
 const [activeMode,setActiveMode]=useState<'duplicate'|'rejection'>(mode);
 useEffect(()=>{setActiveMode(mode);},[mode]);
 const [reviews,setReviews]=useState<Review[]>([]), [selected,setSelected]=useState(''), [snapshot,setSnapshot]=useState<Snapshot|null>(null), [loading,setLoading]=useState(true), [failed,setFailed]=useState(false), [refresh,setRefresh]=useState(0), [busy,setBusy]=useState(false), [confirmRemove,setConfirmRemove]=useState(false);
 const base=activeMode==='rejection'?'/api/imported-rejection-checks':'/api/imported-duplicate-checks',sections=activeMode==='rejection'?rejectionSections:duplicateSections;
 useEffect(()=>{let active=true;setLoading(true);setFailed(false);void request<{reviews:Review[]}>(base).then(data=>{if(active){setReviews(data.reviews);setSelected(current=>data.reviews.some(review=>review.id===current)?current:data.reviews[0]?.id||'');}}).catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[refresh,base]);
 useEffect(()=>{let active=true;setSnapshot(null);if(!selected||reviews.find(item=>item.id===selected)?.deleting)return;setLoading(true);setFailed(false);void request<Snapshot>(`${base}/${encodeURIComponent(selected)}`).then(data=>{if(active)setSnapshot(data);}).catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[selected,refresh,reviews,base]);
 const names=new Map((activeMode==='rejection'?snapshot?.tables.rejection_check_documents:snapshot?.tables.duplicate_check_files||[])?.map(file=>[String(activeMode==='rejection'?file.document_id:file.file_id),String(file.file_name||file.file_id||file.document_id)])||[]);
 const reason=(value:string)=>({not_found:en?'not found':'no encontrado',outside_backup:en?'outside the backup':'fuera del respaldo',unsafe_path:en?'unsafe path':'ruta insegura',not_recorded:en?'not recorded':'no registrado',too_large:en?'over the size limit':'supera el límite de tamaño',empty:en?'empty':'vacío',unsupported_format:en?'unsupported format':'formato no compatible'} as Record<string,string>)[value]||value;
 const valueFor=(field:string,value:unknown)=>{if(field==='bid_document_id'&&typeof value==='string')return names.get(value)||value;if(typeof value==='string'&&['status','severity'].includes(field))return ({high:en?'High':'Alta',medium:en?'Medium':'Media',low:en?'Low':'Baja',success:en?'Complete':'Completado',error:en?'Error':'Error',running:en?'Running when saved':'En ejecución al guardar',idle:en?'Not started':'Sin iniciar',pending:en?'Pending':'Pendiente'} as Record<string,string>)[value]||value;return show(value);};
 const path=(sourceKey:string,kind:'original'|'content')=>`${base}/${encodeURIComponent(selected)}/files/${sourceKey}/${kind}`;
 const attach=async(event:ChangeEvent<HTMLInputElement>,sourceKey:string)=>{const input=event.currentTarget,file=input.files?.[0];input.value='';if(!file||busy)return;setBusy(true);try{await request(path(sourceKey,'original'),{method:'PUT',body:file});showToast(en?'Original attached.':'Original adjuntado.','success');}catch(error){showToast((error as Error & {status?:number}).status===409?(en?'Another original is already attached.':'Ya se adjuntó otro original.'):(en?'Could not attach the original.':'No se pudo adjuntar el original.'),'error');}finally{setBusy(false);setRefresh(value=>value+1);}};
 const remove=async()=>{if(!selected||busy)return;setBusy(true);try{await request(`${base}/${encodeURIComponent(selected)}`,{method:'DELETE'});showToast(en?'Review removed.':'Revisión eliminada.','success');}catch(error){showToast((error as Error & {status?:number}).status===503?(en?'Removal is pending. Try again.':'La eliminación está pendiente. Vuelve a intentarlo.'):(en?'Could not remove the review.':'No se pudo eliminar la revisión.'),'error');}finally{setConfirmRemove(false);setBusy(false);setRefresh(value=>value+1);}};
 const asset=(file:Snapshot['files'][number],kind:'original'|'content')=>{const item=file[kind],label=kind==='original'?'Original':file.category==='image'?(en?'Image file':'Archivo de imagen'):(en?'Extracted text':'Texto extraído');return <div key={kind} className="web-imported-review-asset">{item.available?<a className="web-link" href={path(file.sourceKey,kind)}>{en?'Download':'Descargar'} {label.toLowerCase()}</a>:<><span>{label}: {item.expected?(en?'transfer pending; retry the import':'transferencia pendiente; repite la importación'):(en?'not available in backup':'no disponible en el respaldo')}{item.reason&&` (${reason(item.reason)})`}</span>{kind==='original'&&!item.expected&&<><p>{en?'Check that the file matches the historical document before attaching it.':'Comprueba que el archivo corresponda al documento histórico antes de adjuntarlo.'}</p><label className="web-upload">{en?'Attach original':'Adjuntar original'}<input type="file" disabled={busy} onChange={event=>void attach(event,file.sourceKey)} /></label></>}</>}</div>;};

 const switchMode=(next:string)=>{
   const resolved=next==='rejection'?'rejection':'duplicate';
   setActiveMode(resolved);
   onModeChange?.(resolved);
 };

 const body=(
   <div className="web-imported-reviews-body">
     <div className="web-imported-reviews-toolbar">
       <Tabs value={activeMode} onValueChange={switchMode}>
         <TabsList className="web-resources-tabs" aria-label={en?'Imported review type':'Tipo de revisión importada'}>
           <TabsTrigger value="duplicate"><CopyCheck size={14}/> {en?'Duplicate reviews':'Revisiones de duplicados'}</TabsTrigger>
           <TabsTrigger value="rejection"><ShieldAlert size={14}/> {en?'Rejection reviews':'Revisiones de rechazo'}</TabsTrigger>
         </TabsList>
       </Tabs>
       <Button icon={RefreshCw} iconOnly type="button" size="sm" variant="outline" disabled={busy||loading} onClick={()=>setRefresh(value=>value+1)}>{en?'Refresh':'Actualizar'}</Button>
     </div>

     {loading&&<WebLoading message={en?'Loading reviews…':'Cargando revisiones…'}/>}
     {failed&&<p role="alert">{en?'Could not load the review. Try refreshing.':'No se pudo cargar la revisión. Intenta actualizar.'}</p>}
     {!loading&&!failed&&!reviews.length&&(
       <div className="web-agenda-empty">
         <Archive size={22} aria-hidden="true"/>
         <strong>{en?'No imported reviews yet.':'Aún no hay revisiones importadas.'}</strong>
         <p>{en?'Use the local runner to import a desktop backup, or run new reviews directly in the "Review offer" tab of your project.':'Usa el runner local para importar un respaldo de escritorio, o ejecuta nuevas revisiones directamente en la pestaña «Revisar oferta» de tu proyecto.'}</p>
       </div>
     )}

     {reviews.length>0&&(
       <div className="web-certificate-editor web-imported-reviews-selector">
         <div className="web-admin-assign-row">
           <label className="web-imported-review-select-label">
             <span>{en?'Imported backup':'Respaldo importado'}</span>
             <select className="web-tenant-select" value={selected} onChange={event=>setSelected(event.target.value)}>
               {reviews.map(review=><option key={review.id} value={review.id}>{new Date(review.createdAt).toLocaleString(language)} · {review.id.slice(0,8)}{review.deleting?(en?' · removal pending':' · eliminación pendiente'):''}</option>)}
             </select>
           </label>
           <Button icon={Trash2} iconOnly variant="outline" size="sm" disabled={busy||!selected} onClick={()=>setConfirmRemove(true)}>
             {reviews.find(item=>item.id===selected)?.deleting?(en?'Retry removal':'Reintentar eliminación'):(en?'Remove review':'Eliminar revisión')}
           </Button>
         </div>
         {reviews.find(item=>item.id===selected)?.deleting&&<p role="alert">{en?'Removal was interrupted. Retry to finish deleting its files.':'La eliminación se interrumpió. Reintenta para terminar de borrar sus archivos.'}</p>}
       </div>
     )}

     {snapshot&&(
       <div className="web-imported-reviews-snapshot">
         <div className="web-secop-heading web-company-heading">
           <h3>{en?'Documents and images':'Documentos e imágenes'}</h3>
           <span className="web-market-badge is-subtle">{snapshot.files.length}</span>
         </div>
         {!snapshot.files.length ? (
           <p>{en?'No documents were recorded.':'No se registraron documentos.'}</p>
         ) : (
           <div className="web-certificate-list">
             {snapshot.files.map(file=>(
               <article key={file.id} className="web-admin-user-card">
                 <div className="web-admin-user-top">
                   <div className="web-admin-user-identity">
                     <strong>{file.category==='image'?(en?'Image':'Imagen'):`${names.get(file.sourceId||file.id)||file.sourceId||file.id}`}</strong>
                     {file.category==='image'&&file.reference&&<p>{file.reference}</p>}
                   </div>
                   <span className="web-market-badge is-subtle">
                     {file.category==='image'?<><ImageIcon size={12}/> {en?'Image':'Imagen'}</>:<><FileText size={12}/> {en?'Document':'Documento'}</>}
                   </span>
                 </div>
                 <div className="web-admin-user-footer">
                   {file.category!=='image'&&asset(file,'original')}
                   {asset(file,'content')}
                 </div>
               </article>
             ))}
           </div>
         )}

         <div className="web-imported-reviews-sections">
           {sections.map(([key,es,title])=>{
             const rows=snapshot.tables[key]||[];
             if(!rows.length)return null;
             return <details key={key} className="web-profile-group">
               <summary><strong>{en?title:es} ({rows.length})</strong></summary>
               <div className="web-duplicate-rows">
                 {rows.map((row,index)=>(
                   <dl key={index}>
                     {Object.entries(row).map(([field,value])=>(
                       <div key={field}>
                         <dt>{activeMode==='rejection'&&rejectionFields[field]?rejectionFields[field][en?1:0]:field.replace(/_/g,' ')}</dt>
                         <dd>{valueFor(field,value)}</dd>
                       </div>
                     ))}
                   </dl>
                 ))}
               </div>
             </details>;
           })}
         </div>
       </div>
     )}

     <AppDialog open={confirmRemove} onOpenChange={open=>{if(!open&&!busy)setConfirmRemove(false);}} title={en?'Remove this review?':'¿Eliminar esta revisión?'} description={en?'The imported results and their stored files will be removed.':'Se eliminarán los resultados importados y sus archivos guardados.'} actions={<><Button variant="outline" disabled={busy} onClick={()=>setConfirmRemove(false)}>{en?'Cancel':'Cancelar'}</Button><Button icon={Trash2} variant="destructive" disabled={busy} onClick={()=>void remove()}>{en?'Remove':'Eliminar'}</Button></>} />
   </div>
 );

 if (embedded) {
   return <details className="web-technical-plan" open={defaultOpen||undefined}>
     <summary className="web-review-summary">
       <Archive size={18} aria-hidden="true"/>
       <span>
         <strong>{en?'Imported desktop reviews':'Revisiones importadas del escritorio'}</strong>
         <small>{en?'Consult duplicate and rejection review backups imported from Savia desktop.':'Consulta respaldos históricos de duplicados y causales de rechazo importados desde Savia de escritorio.'}</small>
       </span>
     </summary>
     <p>{en?'Review results imported from Savia desktop. They reflect the state at the time of the backup; unfinished tasks are not resumed.':'Consulta resultados importados de Savia de escritorio. Reflejan el estado del respaldo; las tareas inconclusas no se reanudan.'}</p>
     {body}
   </details>;
 }

 return <section className="web-resources web-duplicate-reviews">
   <div className="web-resources-intro">
     <h2>{en?'Imported desktop reviews':'Revisiones importadas del escritorio'}</h2>
     <p>{en?'Review results imported from Savia desktop. They reflect the state at the time of the backup; unfinished tasks are not resumed.':'Consulta resultados importados de Savia de escritorio. Reflejan el estado del respaldo; las tareas inconclusas no se reanudan.'}</p>
   </div>
   {body}
 </section>;
}
