import {Copy} from 'lucide-react';
import {useEffect,useState} from 'react';
import type {SecopProcess} from '@/shared/types/secop';
import {Checkbox} from '@/shared/ui/primitives/checkbox';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/shared/ui/primitives/dialog';
import {useToast} from '@/shared/ui/ToastProvider';
import {formatSecopValue} from './secop/secopValue.mjs';
import {request} from './api.mjs';
import {selectableDocument,selectLoadedDocuments,MAX_OPPORTUNITY_DOCUMENTS} from './opportunity-import.mjs';

type Document = {id:string;name:string;extension:string;size:number|null;date?:string};
type Listing = {items:Document[];partial:boolean;truncated:boolean};
function officialLink(process:SecopProcess) {
  try { const url=new URL(process.url || ''); if(url.protocol==='https:' && url.hostname==='community.secop.gov.co' && url.pathname==='/Public/Tendering/OpportunityDetail/Index' && /^CO1\.NTC\.\d+$/.test(url.searchParams.get('noticeUID') || ''))return url.href; } catch { /* No verified link. */ }
  return undefined;
}
export function WebOpportunityDetail({item,language,saving,onClose,onSave,selectDocumentsByDefault=false}:{item:SecopProcess;language:'es'|'en';saving:boolean;onClose:()=>void;onSave:(item:SecopProcess,ids:string[])=>void;selectDocumentsByDefault?:boolean}) {
  const en=language==='en',{showToast}=useToast();
  const [process,setProcess]=useState(item),[loading,setLoading]=useState(true),[detailError,setDetailError]=useState(false);
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [docs,setDocs]=useState<Listing|null>(null),[docError,setDocError]=useState(false),[docLoading,setDocLoading]=useState(false),[offset,setOffset]=useState(0);
  useEffect(()=>{let live=true;const load=async()=>{let effective=item;try{const data=await request<{data:SecopProcess}>(`/api/secop/detail?source=${encodeURIComponent(item.source)}&id=${encodeURIComponent(item.id)}&language=${language}`);if(!live)return;effective=data.data;setProcess(effective);}catch{if(live)setDetailError(true);}finally{if(live)setLoading(false);}if(!live || !effective.portfolioId)return;setDocLoading(true);try{const result=await request<{data:Listing}>(`/api/secop/documents?portfolioId=${encodeURIComponent(effective.portfolioId)}`);if(live){setDocs(result.data);if(selectDocumentsByDefault)setSelectedIds(selectLoadedDocuments(result.data.items));}}catch{if(live)setDocError(true);}finally{if(live)setDocLoading(false);}};void load();return()=>{live=false;};},[item.id,item.source,language]);
  const loadMore=async()=>{if(!process.portfolioId||docLoading)return;setDocLoading(true);setDocError(false);try{const next=offset+100,result=await request<{data:Listing}>(`/api/secop/documents?portfolioId=${encodeURIComponent(process.portfolioId)}&offset=${next}`);setDocs(current=>({items:Array.from(new Map([...(current?.items||[]),...result.data.items].map(doc=>[doc.id,doc])).values()),partial:!!current?.partial||result.data.partial,truncated:result.data.truncated}));setOffset(next);}catch{setDocError(true);}finally{setDocLoading(false);}};
  const date=(value?:string)=>{if(!value)return '—';const parsed=new Date(value);return Number.isNaN(parsed.getTime())?value:new Intl.DateTimeFormat(en?'en-US':'es-CO',{dateStyle:'medium',timeZone:'UTC'}).format(parsed);};
  const fields:Array<[string,string]>=[[en?'Reference':'Referencia',process.reference||process.id],[en?'Entity':'Entidad',process.entity],[en?'Procedure':'Modalidad',process.modality||'—'],[en?'Status':'Estado',process.status||'—'],[en?'Phase':'Fase',process.phase||'—'],[en?'Value':'Valor',formatSecopValue(process,language)],[en?'Published':'Publicación',date(process.publicationDate)],[en?'Deadline':'Cierre',date(process.deadline)],[en?'Department':'Departamento',process.department||'—'],[en?'City':'Ciudad',process.city||'—'],[en?'Source':'Fuente',process.source]];
  const link=officialLink(process);
  const copy=async()=>{try{await navigator.clipboard.writeText([process.title,...fields.map(([label,value])=>`${label}: ${value}`),...(link?[link]:[])].join('\n'));showToast(en?'Summary copied.':'Resumen copiado.','success');}catch{showToast(en?'Could not copy the summary.':'No se pudo copiar el resumen.','error');}};
  return <Dialog open onOpenChange={open=>{if(!open && !saving)onClose();}}><DialogContent className="web-opportunity-dialog"><DialogTitle>{process.title||process.id}</DialogTitle><DialogDescription>{process.reference||process.id}</DialogDescription>
    {loading && <p role="status">{en?'Loading current process…':'Consultando el proceso actualizado…'}</p>}{detailError && <p role="status">{en?'Current details could not be loaded; showing search results.':'No se pudo actualizar el detalle; se muestran los datos de la búsqueda.'}</p>}
    <dl className="web-opportunity-fields">{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl>
    <section className="web-opportunity-docs"><h3>{en?'Official documents':'Documentos oficiales'}</h3><p>{en?'This index may be incomplete. Check the official record. Select files to import when creating the project. ZIP files need a local runner.':'Este índice puede estar incompleto. Verifica el expediente oficial. Selecciona archivos para importarlos al crear el proyecto. Los ZIP necesitan un runner local.'}</p>
    {docLoading && <p role="status">{en?'Loading documents…':'Consultando documentos…'}</p>}{docError && <p role="alert">{en?'Could not load documents.':'No se pudieron consultar los documentos.'}</p>}{docs?.partial && <p role="status">{en?'Some sources did not respond; the index may be incomplete.':'Algunas fuentes no respondieron; el índice puede estar incompleto.'}</p>}{!docLoading&&!process.portfolioId&&<p>{en?'The document index is not available for this process.':'El índice de documentos no está disponible para este proceso.'}</p>}{docs && !docs.items.length&&!docLoading&&<p>{en?'No documents found.':'No se encontraron documentos.'}</p>}
    {!!docs?.items.length && <OpportunityDocumentSelection documents={docs.items} selectedIds={selectedIds} onChange={setSelectedIds} language={language} saving={saving} />}{docs?.truncated && <Button variant="outline" size="sm" disabled={docLoading} onClick={()=>void loadMore()}>{en?'Load more documents':'Cargar más documentos'}</Button>}</section>
    <div className="web-opportunity-actions">{link && <a href={link} target="_blank" rel="noopener noreferrer">{en?'Open in SECOP':'Abrir en SECOP'}</a>}<Button icon={Copy} iconOnly variant="outline" size="sm" onClick={()=>void copy()}>{en?'Copy summary':'Copiar resumen'}</Button><Button size="sm" disabled={saving||loading||docLoading||!process.id||!process.title} onClick={()=>onSave(process,selectedIds)}>{saving?(selectedIds.length?(en?'Creating project and importing…':'Creando proyecto e importando…'):(en?'Creating project…':'Creando proyecto…')):selectedIds.length?(en?`Create project with ${selectedIds.length} document(s)`:`Crear proyecto con ${selectedIds.length} documento(s)`):(en?'Save as project':'Guardar como proyecto')}</Button></div>
  </DialogContent></Dialog>;
}


export function OpportunityDocumentSelection({documents,selectedIds,onChange,language,saving=false}: {
  documents: Document[]; selectedIds: string[]; onChange: (ids:string[])=>void; language:'es'|'en'; saving?:boolean;
}) {
  const en=language==='en';
  const atLimit=selectedIds.length>=MAX_OPPORTUNITY_DOCUMENTS;
  return <>
    <div className="web-inline web-opportunity-selection">
      <span role="status" className="font-medium">{selectedIds.length} {en?'selected':'seleccionados'}</span>
      <Button variant="outline" size="sm" disabled={saving||!documents.some(selectableDocument)} onClick={()=>onChange(selectLoadedDocuments(documents))}>{en?'Select loaded':'Seleccionar cargados'}</Button>
      <Button variant="ghost" size="sm" disabled={saving||!selectedIds.length} onClick={()=>onChange([])}>{en?'Clear selection':'Quitar selección'}</Button>
    </div>
    <p>{en?'Select up to 100 PDF, Word, Excel or ZIP files, up to 50 MB each.':'Selecciona hasta 100 archivos PDF, Word, Excel o ZIP de hasta 50 MB cada uno.'}</p>
    {atLimit && <p role="status">{en?'Selection limit reached. Uncheck a file to select another.':'Llegaste al límite de selección. Desmarca un archivo para seleccionar otro.'}</p>}
    <ul aria-label={en?'Documents to import':'Documentos para importar'}>
      {documents.map(doc=>{
        const checked=selectedIds.includes(doc.id), supported=selectableDocument(doc);
        const disabled=saving||!supported||(!checked&&atLimit);
        const reason=!supported?(doc.size!=null&&doc.size>50*1024*1024?(en?'Exceeds 50 MB':'Supera 50 MB'):(en?'Unsupported format or identifier':'Formato o identificador no compatible')):undefined;
        return <li key={doc.id} className={checked?'bg-accent/50':''}>
          <label className="w-full min-w-0 rounded-md px-2 py-1 cursor-pointer has-[:disabled]:cursor-default">
            <Checkbox className="mt-1" checked={checked} disabled={disabled} onCheckedChange={value=>onChange(value===true?[...selectedIds,doc.id]:selectedIds.filter(id=>id!==doc.id))} />
            <span className="min-w-0 flex-1 break-words"><span className="block text-sm font-medium">{doc.name}</span><small className="block mt-1">{doc.extension.toUpperCase()||'—'}{doc.size!=null?` · ${(doc.size/1024/1024).toFixed(1)} MB`:''}{reason?` · ${reason}`:''}</small></span>
          </label>
        </li>;
      })}
    </ul>
  </>;
}
