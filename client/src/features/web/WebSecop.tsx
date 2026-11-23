import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/shared/ui/primitives/table';
import {FileDown,FileSpreadsheet,SlidersHorizontal,ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, Columns3, ListFilter, Search as SearchIcon} from 'lucide-react';
import WebSecopWatch from './WebSecopWatch';
import {WebLoading} from './WebLoading';
import { WebCategoryFilter } from './WebCategoryFilter';
import { WebOpportunityDetail } from './WebOpportunityDetail';
import { WebSelectedSecopImports, type Selection } from './WebSelectedSecopImports';
import {createOpportunityProject} from './opportunity-import.mjs';
import { loadOpportunityRup, opportunityRows, opportunityMatch } from './opportunity-rup.mjs';
import { formatDeadline, formatDateValue, formatSecopValue, isSpainMarket, officialTenderUrl, sourceDisplayName } from './secop/secopValue.mjs';
import type { ProcurementMarket, SecopColumn, SecopDataset, SecopSearchParams } from '@/shared/types/secop';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SecopProcess } from '@/shared/types/secop';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import AppDialog from '@/shared/ui/AppDialog';
import { Input } from '@/shared/ui/primitives/input';
import { SelectField } from '@/shared/ui/SelectField';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';

type Locale = 'es' | 'en';
type ZipJob = { id: string; state: string; result: { message?: string; imported?: number; skipped?: number } | null };
type OfficialDocument = { id: string; name: string; extension: string; imported: boolean; zipJob?: ZipJob };
type ProjectJob = ZipJob & { kind: string };
const opportunitySearchPolicies: Partial<Record<SecopDataset, { defaultOpenOnly: boolean }>> = {
  placsp: { defaultOpenOnly: true },
  ted: { defaultOpenOnly: true },
};
const SEARCH_PAGE_SIZE = 10;
type Search = { dataset: SecopDataset; keyword: string; cpvCode: string; entity: string; reference: string; contractType: string; euFunded: string; department: string[]; modality: string[]; status: string[]; publicationYear: string; fromDate: string; minValue: string; maxValue: string };
const blank = (market: ProcurementMarket = 'ALL'): Search => ({ dataset: market === 'ES' ? 'placsp' : 'secop-ii', keyword: '', cpvCode: '', entity: '', reference: '', contractType: '', euFunded: '', department: [], modality: [], status: [], publicationYear: '', fromDate: '', minValue: '', maxValue: '' });
function officialLink(process: SecopProcess) {
  try {
    const url = new URL(process.url || '');
    if (url.protocol === 'https:' && url.hostname === 'community.secop.gov.co' && url.pathname === '/Public/Tendering/OpportunityDetail/Index' && /^CO1\.NTC\.\d+$/.test(url.searchParams.get('noticeUID') || '')) return url.href;
  } catch { /* No verified link available. */ }
  return undefined;
}
function Fields({ process, language }: { process: SecopProcess; language: Locale }) {
  const en = language === 'en', link = officialLink(process);
  return <><p>{process.entity}{process.reference ? ` · ${process.reference}` : ''}</p><p>{[process.status, process.modality, process.department].filter(Boolean).join(' · ')}</p>{process.value != null && <p>{en ? 'Value' : 'Valor'}: {new Intl.NumberFormat(en ? 'en-US' : 'es-CO').format(process.value)}{process.currency ? ` ${process.currency}` : ''}</p>}{process.deadline && <p>{en ? 'Deadline' : 'Cierre'}: {process.deadline}</p>}{link && <a href={link} target="_blank" rel="noopener noreferrer">{en ? 'Open in SECOP' : 'Abrir en SECOP'}</a>}</>;
}
export function OfficialDocumentsView({ documents, language, partial, importing, onImport, onCancel }: { documents: OfficialDocument[]; language: Locale; partial: boolean; importing: string; onImport: (id: string) => void; onCancel: (id: string, jobId: string) => void }) {
  const en = language === 'en';
  return <div className="web-official-documents">
    <p>{en ? 'The index can omit documents. Check the official record. ZIP files require a local runner; files over 50 MB cannot be imported here.' : 'El índice puede omitir documentos. Verifica el expediente oficial. Los ZIP requieren un runner local; los archivos de más de 50 MB no se pueden importar aquí.'}</p>
    {partial && <p role="status">{en ? 'The index is incomplete or truncated.' : 'El índice está incompleto o truncado.'}</p>}
    {documents.length ? documents.map(doc => {
      const downloading=importing===doc.id;
      const job = doc.zipJob, active = job && ['queued', 'running'].includes(job.state), failed = job && ['failed', 'cancelled', 'interrupted'].includes(job.state);
      const unsupported = !['pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip'].includes(doc.extension);
      return <div className="web-official-document" key={doc.id}>
        <div className="web-official-document-body"><strong>{doc.name}</strong>{downloading&&<div className="web-import-progress" role="status" aria-live="polite"><span>{en?'Downloading…':'Descargando…'}</span><progress aria-label={en?`Downloading ${doc.name}`:`Descargando ${doc.name}`}/></div>}{job && <div aria-live="polite">
          {job.state === 'queued' && <p>{en ? 'Waiting for a local runner.' : 'En espera de un runner local.'}</p>}
          {job.state === 'running' && <p>{en ? 'In progress on the local runner.' : 'En proceso en el runner local.'}</p>}
          {failed && <p>{job.state === 'cancelled' ? (en ? 'Import cancelled.' : 'Importación cancelada.') : job.state === 'interrupted' ? (en ? 'Import interrupted.' : 'Importación interrumpida.') : (en ? 'Import failed.' : 'Falló la importación.')}{job.result?.message ? ` ${job.result.message}` : ''}</p>}
          {job.state === 'succeeded' && typeof job.result?.imported === 'number' && <p>{en ? `${job.result.imported} ${job.result.imported === 1 ? 'document' : 'documents'} imported; ${job.result.skipped || 0} skipped.` : `${job.result.imported} ${job.result.imported === 1 ? 'documento importado' : 'documentos importados'}; ${job.result.skipped || 0} ${job.result.skipped === 1 ? 'omitido' : 'omitidos'}.`}</p>}
        </div>}</div>
        <div className="web-inline">{active && <Button size="sm" variant="ghost" disabled={!!importing} onClick={() => onCancel(doc.id, job.id)}>{en ? 'Cancel' : 'Cancelar'}</Button>}
          <Button icon={RefreshCw} iconOnly size="sm" variant="outline" disabled={!!importing || doc.imported || !!active || unsupported} onClick={() => onImport(doc.id)}>{doc.imported ? (en ? 'Imported' : 'Importado') : importing === doc.id ? (en ? 'Importing…' : 'Importando…') : failed || job?.state === 'succeeded' ? (en ? 'Retry' : 'Reintentar') : (en ? 'Import' : 'Importar')}</Button></div>
      </div>;
    }) : <p>{en ? 'No documents found.' : 'No se encontraron documentos.'}</p>}
  </div>;
}
export function WebProjectSecop({ projectId, language, jobs, onRefresh }: { projectId: string; language: Locale; jobs: ProjectJob[]; onRefresh: () => Promise<void> }) {
  const [process, setProcess] = useState<SecopProcess | null>(null);
  const [documents, setDocuments] = useState<OfficialDocument[] | null>(null);
  const [partial, setPartial] = useState(false), [loading, setLoading] = useState(false), [importing, setImporting] = useState('');
  const [selectedActivity,setSelectedActivity]=useState<{items:Selection[];busy:string}>({items:[],busy:''});
  const [documentOffset,setDocumentOffset]=useState(0),[moreDocuments,setMoreDocuments]=useState(false);
  const [captchaDoc, setCaptchaDoc] = useState<{ id: string; name: string; officialUrl?: string } | null>(null);
  const refreshed = useRef(new Set<string>());
  const en = language === 'en', { showToast } = useToast();
  useEffect(() => { let active = true; setProcess(null); void request<{process: SecopProcess}>(`/api/projects/${projectId}/secop`).then(data => { if (active) setProcess(data.process); }).catch(() => undefined); return () => { active = false; }; }, [projectId]);
  const loadDocuments = async (offset=0) => { setLoading(true); try { const data = await request<{ items: OfficialDocument[]; partial: boolean; truncated: boolean }>(`/api/projects/${projectId}/secop/documents?language=${language}&offset=${offset}`); setDocuments(current=>offset?Array.from(new Map([...(current||[]),...data.items].map(doc=>[doc.id,doc])).values()):data.items); setPartial(current=>offset?current||data.partial:data.partial);setMoreDocuments(data.truncated);setDocumentOffset(offset); } catch { const src = sourceDisplayName(process?.source, language); showToast(en ? `Could not load ${src} documents.` : `No se pudieron consultar los documentos de ${src}.`, 'error'); } finally { setLoading(false); } };
  useEffect(() => {
    const completed = documents?.find(doc => doc.zipJob && doc.zipJob.state !== 'succeeded' && jobs.some(job => job.id === doc.zipJob?.id && job.state === 'succeeded') && !refreshed.current.has(doc.zipJob.id));
    if (completed?.zipJob) { refreshed.current.add(completed.zipJob.id); void loadDocuments(); }
  }, [jobs, documents]);
  const importDocument = async (id: string) => {
    setImporting(id);
    try {
      const response = await request<{file?: unknown; imported?: boolean; fallback?: string; job?: {id: string; state: string}}>(`/api/projects/${projectId}/secop/documents/${id}/import`, { method: 'POST' });
      setDocuments(current => current?.map(doc => doc.id !== id ? doc : response.job ? { ...doc, zipJob: { ...response.job, result: null } } : { ...doc, imported: true }) || null);
      showToast(response.job ? (response.fallback === 'runner' ? (en ? 'SECOP requested verification. Download queued on your Savia Connector.' : 'SECOP solicitó verificación. Descarga enviada a tu Savia Conector.') : (en ? 'ZIP queued. Start your local runner to import it.' : 'ZIP en espera. Inicia tu runner local para importarlo.')) : (en ? 'Document imported. The file list will refresh shortly.' : 'Documento importado. La lista de archivos se actualizará en unos segundos.'), 'success');
      if (response.job) void onRefresh().catch(() => undefined);
    } catch (error) {
      const err = error as Error & { status?: number; details?: { officialUrl?: unknown } };
      if (err.message === 'secop_captcha_required' || err.message === 'portal_captcha_required') {
        const doc = documents?.find(item => item.id === id);
        const rawOfficialUrl = typeof err.details?.officialUrl === 'string' ? err.details.officialUrl : undefined;
        setCaptchaDoc({ id, name: doc?.name || id, officialUrl: rawOfficialUrl });
      } else {
        const src = sourceDisplayName(process?.source, language);
        showToast(err.status === 413 ? (en ? 'The document exceeds 50 MB.' : 'El documento supera 50 MB.') : (en ? `Could not import the document. Download it from ${src} and upload it manually.` : `No se pudo importar el documento. Descárgalo de ${src} y súbelo manualmente.`), 'error');
      }
    } finally { setImporting(''); }
  };
  const cancel = async (id: string, jobId: string) => { setImporting(id); try { await request(`/api/projects/${projectId}/jobs/${jobId}/cancel`, { method: 'POST' }); setDocuments(current => current?.map(doc => doc.id === id && doc.zipJob?.id === jobId ? { ...doc, zipJob: { ...doc.zipJob, state: 'cancelled' } } : doc) || null); void onRefresh().catch(() => undefined); } catch { showToast(en ? 'Could not cancel the import. Refresh its status.' : 'No se pudo cancelar la importación. Actualiza su estado.', 'error'); } finally { setImporting(''); } };
  const visibleDocuments = documents?.map(doc => { const imported=selectedActivity.items.some(item=>item.id===doc.id&&item.state==='imported');const live = jobs.find(job => job.id === doc.zipJob?.id); return live ? { ...doc, imported:doc.imported||imported, zipJob: live } : {...doc,imported:doc.imported||imported}; });
  const link = officialTenderUrl(process);
  const captchaHref = (() => {
    if (!captchaDoc) return '';
    if (captchaDoc.officialUrl) {
      try {
        const u = new URL(captchaDoc.officialUrl);
        if (u.protocol === 'https:' && ['ted.europa.eu', 'community.secop.gov.co'].includes(u.hostname.toLowerCase())) return u.href;
      } catch { /* fallback below */ }
    }
    return `https://community.secop.gov.co/Public/Archive/RetrieveFile/Index?DocumentId=${encodeURIComponent(captchaDoc.id)}&InCommunity=False&InPaymentGateway=False&DocUniqueIdentifier=`;
  })();
  return process ? <div className="web-secop-project"><div className="web-tender-heading"><div><h3>{en?'Tender overview':'Ficha de la licitación'}</h3><p>{process.entity || (en?'Entity not specified':'Entidad sin especificar')}{process.reference ? ` · ${process.reference}` : ''}</p></div>{link&&<a href={link} target="_blank" rel="noopener noreferrer">{en?`Open in ${sourceDisplayName(process.source, language)} ↗`:`Abrir en ${sourceDisplayName(process.source, language)} ↗`}</a>}</div><dl className="web-tender-facts">{[{label:en?'Value':'Valor',value:process.value!=null?formatSecopValue(process, language):null},{label:en?'Status':'Estado',value:process.status},{label:en?'Deadline':'Cierre',value:process.deadline},{label:en?'Procedure':'Modalidad',value:process.modality},{label:isSpainMarket(process.source,process.country)?(en?'Territory':'Territorio'):(en?'Department':'Departamento'),value:process.territory||process.department}].map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value||(en?'Not specified':'Sin especificar')}</dd></div>)}</dl><WebSelectedSecopImports projectId={projectId} language={language} onRefresh={onRefresh} onActivity={setSelectedActivity} /><details className="web-project-monitor"><summary>{en ? 'Track tender changes' : 'Seguimiento de cambios de la licitación'}</summary><WebSecopWatch projectId={projectId} language={language} /></details>{(process.portfolioId || process.source === 'placsp' || process.source === 'ted') && <details className="web-project-official"><summary>{en?'Find more official documents':'Buscar más documentos oficiales'}</summary><Button variant="outline" size="sm" disabled={loading} onClick={() => void loadDocuments()}>{loading ? (en ? 'Loading…' : 'Consultando…') : documents ? (en ? 'Refresh official documents' : 'Actualizar documentos oficiales') : (en ? 'Find official documents' : 'Consultar documentos oficiales')}</Button>{visibleDocuments && <><OfficialDocumentsView documents={visibleDocuments} language={language} partial={partial} importing={importing||selectedActivity.busy} onImport={id => void importDocument(id)} onCancel={(id, jobId) => void cancel(id, jobId)} />{moreDocuments && <Button variant="outline" size="sm" disabled={loading} onClick={()=>void loadDocuments(documentOffset+100)}>{en?'Load more documents':'Cargar más documentos'}</Button>}</>}</details>}<AppDialog open={!!captchaDoc} onOpenChange={open => { if (!open) setCaptchaDoc(null); }} title={en ? 'Portal verification required' : 'Verificación requerida en el portal'} description={en ? 'The portal blocked automated download for this file (possible CAPTCHA). Open the official link to complete the verification and upload it manually, or connect Savia Connector.' : 'El portal bloqueó la descarga automática de este archivo (posible CAPTCHA). Abre el enlace oficial para resolver la verificación y subirlo manualmente, o conecta Savia Conector.'} actions={<><Button variant="outline" onClick={() => setCaptchaDoc(null)}>{en ? 'Close' : 'Cerrar'}</Button>{captchaDoc && captchaHref && <Button onClick={() => { window.open(captchaHref, '_blank', 'noopener,noreferrer'); setCaptchaDoc(null); }}>{en ? 'Open official link ↗' : 'Abrir enlace oficial ↗'}</Button>}</>}><p>{captchaDoc?.name}</p></AppDialog></div> : null;
}
const columns: SecopColumn[] = ['title','entity','modality','status','value','publicationDate','deadline','department'];
const labels = {es:{title:'Objeto',entity:'Entidad',modality:'Modalidad',status:'Estado',value:'Valor',publicationDate:'Publicación',deadline:'Cierre',department:'Departamento'},en:{title:'Subject',entity:'Entity',modality:'Procedure',status:'Status',value:'Value',publicationDate:'Published',deadline:'Deadline',department:'Department'}};
function formatCell(item: SecopProcess, key: SecopColumn, language: Locale) {
  if (key === 'department') return item.territory || item.department || '—';
  const value = item[key];
  if (value == null || value === '') return '—';
  if (key === 'value' && typeof value === 'number') return formatSecopValue(item, language);
  if (key === 'deadline') return formatDeadline(item, language);
  if (key === 'publicationDate') {
    return formatDateValue(String(value), language, { country: item.country, source: item.source, timeZone: 'UTC' });
  }
  return String(value);
}
export default function WebSecop({ language, market = 'ALL', onCreated }: { language: Locale; market?: ProcurementMarket; onCreated: (id: string) => void }) {
  const en = language === 'en', { showToast } = useToast();
  const [form,setForm] = useState<Search>(() => blank(market));
  const [results,setResults] = useState<SecopProcess[] | null>(null);
  const [query,setQuery] = useState<SecopSearchParams>({sortBy:'publicationDate',sortDirection:'desc'});
  const [active,setActive] = useState<SecopSearchParams | null>(null);
  const [draft,setDraft] = useState<Partial<Record<SecopColumn,string>>>({});
  const [showColumns,setShowColumns] = useState(false), [showFilters,setShowFilters] = useState(false);
  const [columnOrder,setColumnOrder] = useState<SecopColumn[]>(columns);
  const [showOrder,setShowOrder] = useState(false);
  const [truncated,setTruncated] = useState(false), [loading,setLoading] = useState(false), [pageError,setPageError] = useState<'timeout'|'failed'|null>(null), [searchError,setSearchError] = useState<'timeout'|'failed'|null>(null), [saving,setSaving] = useState('');
  const [selected,setSelected] = useState<SecopProcess | null>(null);
  const [rupFacts,setRupFacts] = useState<Array<{label:string;value:string;page:number}>>([]);
  const [rupFailed,setRupFailed] = useState(false), [prioritize,setPrioritize] = useState(false);
  const hasExperience = rupFacts.some(fact=>/^(?:UNSPSC experiencia #\d+|CPV(?:\s+#?\d+)?|Código CPV(?:\s+#?\d+)?)(?:\s|$)/i.test(fact.label));
  const displayed = opportunityRows(results || [],rupFacts,prioritize);
  const requestId = useRef(0), appendInFlight = useRef(false);
  const marketRef = useRef(market), prevMarketRef = useRef(market), formDatasetRef = useRef(form.dataset);
  marketRef.current = market;
  formDatasetRef.current = form.dataset;
  const scrollRoot = useRef<HTMLDivElement>(null), sentinel = useRef<HTMLDivElement>(null), dragged = useRef<SecopColumn | null>(null);
  useEffect(() => {
    let live = true;
    request<Pick<Search, 'dataset' | 'department' | 'modality' | 'status'>>('/api/secop/preferences')
      .then(data => {
        if (!live || new URLSearchParams(window.location.search).has('search')) return;
        const activeMarket = marketRef.current;
        const dataset: SecopDataset =
          activeMarket === 'ES'
            ? (data.dataset === 'ted' ? 'ted' : 'placsp')
            : activeMarket === 'CO' && (data.dataset === 'placsp' || data.dataset === 'ted')
              ? 'secop-ii'
              : data.dataset;
        setForm(current => ({
          ...current,
          ...data,
          dataset,
          ...(dataset !== data.dataset ? { department: dataset === 'ted' ? ['España (ESP)'] : [], modality: [], status: [], cpvCode: '', entity: '', reference: '', contractType: '', euFunded: '' } : {}),
        }));
      })
      .catch(() => showToast(en ? 'Could not load saved filters.' : 'No se pudieron cargar los filtros guardados.', 'error'));
    return () => { live = false; requestId.current++; };
  }, []);
  useEffect(() => {
    if (prevMarketRef.current === market) return;
    prevMarketRef.current = market;
    if (
      (market === 'ES' && formDatasetRef.current !== 'placsp' && formDatasetRef.current !== 'ted') ||
      (market === 'CO' && (formDatasetRef.current === 'placsp' || formDatasetRef.current === 'ted'))
    ) {
      const nextDataset: SecopDataset = market === 'ES' ? 'placsp' : 'secop-ii';
      requestId.current++;
      appendInFlight.current = false;
      setPageError(null);
      setSearchError(null);
      setLoading(false);
      setResults(null);
      setActive(null);
      setTruncated(false);
      setForm(current => ({ ...current, dataset: nextDataset, department: [], modality: [], status: [], cpvCode: '', entity: '', reference: '', contractType: '', euFunded: '' }));
    }
  }, [market]);
  useEffect(()=>{let live=true;void loadOpportunityRup(request).then(facts=>{if(live)setRupFacts(facts);}).catch(()=>{if(live)setRupFailed(true);});return()=>{live=false;};},[]);
  const tedDataset = form.dataset === 'ted';
  const spainDataset = isSpainMarket(form.dataset, undefined, market);
  const showSpainEuFilters = form.dataset === 'placsp' || tedDataset;
  const columnLabel = (key: SecopColumn) => key === 'department'
    ? tedDataset
      ? (en ? 'Country (EU)' : 'País (UE)')
      : spainDataset
        ? (en ? 'Territory' : 'Territorio')
        : labels[language][key]
    : labels[language][key];
  const datasetOptions = market === 'ES'
    ? [{ value: 'placsp', label: 'PLACSP (España)' }, { value: 'ted', label: 'TED Europa' }, { value: 'secop-ii', label: 'SECOP II' }, { value: 'contratos', label: en ? 'Contracts (SECOP II)' : 'Contratos (SECOP II)' }, { value: 'secop-i', label: 'SECOP I' }]
    : [{ value: 'secop-ii', label: 'SECOP II' }, { value: 'placsp', label: 'PLACSP (España)' }, { value: 'ted', label: 'TED Europa' }, { value: 'contratos', label: en ? 'Contracts' : 'Contratos' }, { value: 'secop-i', label: 'SECOP I' }];
  const tedContractTypeOptions = [
    { value: '', label: en ? 'All' : 'Todos' },
    { value: '1', label: en ? 'Supplies' : 'Suministros' },
    { value: '2', label: en ? 'Services' : 'Servicios' },
    { value: '3', label: en ? 'Works' : 'Obras' },
  ];
  const contractTypeOptions = [
    { value: '', label: en ? 'All' : 'Todos' },
    { value: '1', label: en ? 'Supplies' : 'Suministros' },
    { value: '2', label: en ? 'Services' : 'Servicios' },
    { value: '3', label: en ? 'Works' : 'Obras' },
    { value: '22', label: en ? 'Service concession' : 'Concesión de servicios' },
    { value: '32', label: en ? 'Works concession' : 'Concesión de obras' },
    { value: '7', label: en ? 'Special administrative' : 'Administrativo especial' },
    { value: '8', label: en ? 'Private' : 'Privado' },
    { value: '50', label: en ? 'Patrimonial' : 'Patrimonial' },
  ];
  const euFundedOptions = [
    { value: '', label: en ? 'All' : 'Todas' },
    { value: 'EU', label: en ? 'Yes (EU funds)' : 'Sí (fondos UE)' },
    { value: 'NO-EU', label: 'No' },
  ];
  const persist = (value:Search) => request('/api/secop/preferences',{method:'PUT',json:{dataset:value.dataset,department:value.department,modality:value.modality,status:value.status}}).catch(()=>showToast(en?'Could not save filters.':'No se pudieron guardar los filtros.','error'));
  const secopTimeoutMessage = en?'SECOP took too long to respond. Retry the search.':'SECOP tardó demasiado en responder. Vuelve a intentar la búsqueda.';
  const execute = async (search:SecopSearchParams, append=false, fresh=false) => { if(append&&appendInFlight.current)return; const id=++requestId.current; appendInFlight.current=append; setPageError(null); if(!append)setSearchError(null); setLoading(true); const limit=search.limit ?? SEARCH_PAGE_SIZE; const activeSearch={...search,limit}; const policy=opportunitySearchPolicies[activeSearch.dataset ?? form.dataset]; try { const result=await request<{data:{items:SecopProcess[];truncated:boolean}}>('/api/secop/search',{method:'POST',signal:AbortSignal.timeout(['placsp','ted'].includes(activeSearch.dataset || form.dataset) ? 45_000 : 35_000),json:{...activeSearch,openOnly:policy ? (activeSearch.openOnly ?? policy.defaultOpenOnly) : undefined,language,fresh}}); if(id!==requestId.current)return; setResults(previous=>append?Array.from(new Map([...(previous||[]),...result.data.items].map(item=>[`${item.source}:${item.id}`,item])).values()):result.data.items);setTruncated(result.data.truncated && result.data.items.length>0);setActive(activeSearch);setShowFilters(false); } catch (error) {if(id===requestId.current){const failure=error as { name?:string; details?:{error?:string} } | null;const type=failure?.details?.error==='secop_source_timeout'||(!['placsp','ted'].includes(activeSearch.dataset||form.dataset)&&failure?.name==='TimeoutError')?'timeout':'failed';if(append)setPageError(type);else {setSearchError(type);setShowFilters(true);}}} finally {if(id===requestId.current){appendInFlight.current=false;setLoading(false);}} };
  useEffect(()=>{if(!truncated || loading || pageError || !active || !sentinel.current || !scrollRoot.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void execute({...active,offset:(active.offset||0)+(active.limit||SEARCH_PAGE_SIZE)},true);},{root:scrollRoot.current,rootMargin:'160px'});observer.observe(sentinel.current);return()=>observer.disconnect();},[truncated,loading,pageError,active,results]);
  const saveSearchLink=(search:SecopSearchParams)=>{const url=new URL(window.location.href),params=url.searchParams;for(const key of ['dataset','keyword','cpvCode','entity','reference','contractType','euFunded','department','modality','status','fromDate','publicationYear','minValue','maxValue','sortBy','sortDirection','openOnly','filters'])params.delete(key);params.set('search','1');for(const key of ['dataset','keyword','cpvCode','entity','reference','contractType','euFunded','fromDate','publicationYear','minValue','maxValue','sortBy','sortDirection','openOnly'] as const){const value=search[key];if(value!==undefined&&value!==null&&String(value)!=='')params.set(key,String(value));}for(const key of ['department','modality','status'] as const){const value=search[key];if(Array.isArray(value))value.forEach(item=>params.append(key,item));}if(search.columnFilters&&Object.keys(search.columnFilters).length)params.set('filters',JSON.stringify(search.columnFilters));window.history.pushState(null,'',url);window.dispatchEvent(new Event('savia:route-detail'));};
  useEffect(()=>{const restore=()=>{const p=new URLSearchParams(window.location.search);if(p.get('view')!=='secop'||p.get('opportunity')==='suggestions'||!p.has('search'))return;const dataset=(['secop-ii','secop-i','contratos','placsp','ted'].includes(p.get('dataset')||'')?p.get('dataset'):(market==='ES'?'placsp':'secop-ii')) as SecopDataset;const safe=(key:string)=>(p.get(key)||'').slice(0,300);const next:Search={dataset,keyword:safe('keyword'),cpvCode:safe('cpvCode'),entity:safe('entity'),reference:safe('reference'),contractType:safe('contractType'),euFunded:safe('euFunded'),department:p.getAll('department').slice(0,50),modality:p.getAll('modality').slice(0,50),status:p.getAll('status').slice(0,50),publicationYear:dataset==='ted'?safe('publicationYear'):'',fromDate:safe('fromDate'),minValue:safe('minValue'),maxValue:safe('maxValue')};let columnFilters={};try{const parsed=JSON.parse(p.get('filters')||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))columnFilters=Object.fromEntries(Object.entries(parsed).filter(([key,value])=>columns.includes(key as SecopColumn)&&typeof value==='string').slice(0,columns.length));}catch{/* Ignore malformed link filters. */}const sortBy=columns.includes(p.get('sortBy') as SecopColumn)?p.get('sortBy') as SecopColumn:'publicationDate';const sortDirection=p.get('sortDirection')==='asc'?'asc':'desc';const order:SecopSearchParams={sortBy,sortDirection,columnFilters,openOnly:p.get('openOnly')==='false'?false:undefined};setForm(next);setQuery(order);setDraft(columnFilters);void execute({...next,...order,cpvCode:next.cpvCode||undefined,entity:next.entity||undefined,reference:next.reference||undefined,contractType:next.contractType||undefined,euFunded:next.euFunded||undefined,minValue:next.minValue?Number(next.minValue):undefined,maxValue:next.maxValue?Number(next.maxValue):undefined,limit:SEARCH_PAGE_SIZE,offset:0});};restore();window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[]);
  const runSearch=(nextForm=form)=>{ const search:SecopSearchParams={dataset:nextForm.dataset,keyword:nextForm.keyword,...(nextForm.cpvCode.trim()?{cpvCode:nextForm.cpvCode.trim()}:{}),...(nextForm.entity.trim()?{entity:nextForm.entity.trim()}:{}),...(nextForm.reference.trim()?{reference:nextForm.reference.trim()}:{}),...(nextForm.contractType?{contractType:nextForm.contractType}:{}),...(nextForm.euFunded?{euFunded:nextForm.euFunded}:{}),department:nextForm.department,modality:nextForm.modality,status:nextForm.status,fromDate:nextForm.fromDate,...(nextForm.dataset==='ted'&&nextForm.publicationYear?{publicationYear:nextForm.publicationYear}:{}),...(nextForm.minValue?{minValue:Number(nextForm.minValue)}:{}),...(nextForm.maxValue?{maxValue:Number(nextForm.maxValue)}:{}),...query,limit:SEARCH_PAGE_SIZE,offset:0};void persist(nextForm);saveSearchLink(search);void execute(search); };
  const submit=(event:FormEvent)=>{event.preventDefault(); runSearch();};
  const changeQuery=(patch:Partial<SecopSearchParams>)=>{const next={...query,...patch};setQuery(next);if(active){const updated={...active,...next,limit:SEARCH_PAGE_SIZE,offset:0};saveSearchLink(updated);void execute(updated);}};
  const reset=()=>{const url=new URL(window.location.href);for(const key of ['search','dataset','keyword','cpvCode','entity','reference','contractType','euFunded','department','modality','status','fromDate','publicationYear','minValue','maxValue','sortBy','sortDirection','openOnly','filters'])url.searchParams.delete(key);window.history.pushState(null,'',url);window.dispatchEvent(new Event('savia:route-detail'));const next=blank(market);requestId.current++;appendInFlight.current=false;setPageError(null);setSearchError(null);setLoading(false);setForm(next);setResults(null);setActive(null);setQuery({sortBy:'publicationDate',sortDirection:'desc'});setDraft({});setShowFilters(true);void persist(next);};
  const exportRows=async(format:'csv'|'xlsx')=>{ if(!results?.length)return; try { const XLSX=await import('xlsx'); const rows=displayed.map(item=>Object.fromEntries(columnOrder.map(key=>[columnLabel(key),item[key] ?? '']))); const sheet=XLSX.utils.json_to_sheet(rows); const book=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,sheet,'Oportunidades'); XLSX.writeFile(book,`oportunidades.${format}`,{bookType:format}); } catch {showToast(en?'Could not export results.':'No se pudieron exportar los resultados.','error');} };
  const moveColumn=(key:SecopColumn,delta:number)=>setColumnOrder(current=>{const next=[...current],index=next.indexOf(key),target=index+delta;if(target<0||target>=next.length)return current;[next[index],next[target]]=[next[target],next[index]];return next;});
  const save=async(process:SecopProcess,ids:string[])=>{setSaving(process.id);try{const result=await createOpportunityProject(request,process,ids);setSelected(null);if(result.existing){showToast(en?'Opened the saved project.':'Abriste el proyecto guardado.','info');onCreated(result.project.id);return;}showToast(ids.length?(en?`Project created. Downloading ${ids.length} document(s)…`:`Proyecto creado. Descargando ${ids.length} documento(s)…`):(en?'Project created.':'Proyecto creado.'),'success');onCreated(result.project.id);}catch(error){const conflict=(error as Error & {status?:number}).status===409;showToast(conflict?(en?'This opportunity is already saved in your projects.':'Esta oportunidad ya está guardada en tus proyectos.'):(en?'Could not create the project.':'No se pudo crear el proyecto.'),'error');}finally{setSaving('');}};
  const activeFilterCount = (form.dataset !== (market === 'ES' ? 'placsp' : 'secop-ii') ? 1 : 0) + (form.cpvCode.trim() ? 1 : 0) + (form.entity.trim() ? 1 : 0) + (form.reference.trim() ? 1 : 0) + (form.contractType ? 1 : 0) + (form.euFunded ? 1 : 0) + form.department.length + form.modality.length + form.status.length + (form.minValue ? 1 : 0) + (form.maxValue ? 1 : 0) + (form.publicationYear ? 1 : 0) + (form.fromDate ? 1 : 0);
  const searchPolicy = opportunitySearchPolicies[form.dataset];
  const hasAnyInput = Boolean(form.keyword.trim() || activeFilterCount || results);
  return <section className="web-secop-search">
  <form onSubmit={submit} className="web-secop-search-form">
    <div className="web-secop-searchbar">
      <div className="web-secop-keyword-wrap">
        <SearchIcon size={16} aria-hidden="true" />
        <Input value={form.keyword} maxLength={300} aria-label={en?'Keyword':'Palabra clave'} placeholder={en?'Search by keyword, entity, or process…':'Buscar por palabra clave, entidad o proceso…'} onChange={e=>setForm({...form,keyword:e.target.value})}/>
      </div>
      <Button type="submit" icon={SearchIcon} disabled={loading}>{loading?(en?'Searching…':'Buscando…'):(en?'Search':'Buscar')}</Button>
      <Button type="button" variant="outline" icon={SlidersHorizontal} aria-expanded={showFilters} onClick={()=>setShowFilters(value=>!value)}>
        {showFilters?(en?'Hide filters':'Ocultar filtros'):activeFilterCount?(en?`Show filters (${activeFilterCount})`:`Mostrar filtros (${activeFilterCount})`):(en?'Show filters':'Mostrar filtros')}
      </Button>
      {hasAnyInput && <Button type="button" variant="ghost" onClick={reset}>{en?'Clear':'Limpiar'}</Button>}
    </div>
    {searchPolicy && <label className="web-inline">
      <input type="checkbox" checked={query.openOnly ?? searchPolicy.defaultOpenOnly} disabled={loading} onChange={event=>changeQuery({openOnly:event.target.checked})}/>
      {en?'Open for bids only':'Solo abiertas para presentar oferta'}
    </label>}
    {showFilters && <div className="web-secop-filters"><div className="web-admin-sheet-field"><span>{en?'Dataset':'Fuente'}</span><SelectField value={form.dataset} aria-label={en?'Dataset':'Fuente'} options={datasetOptions} onChange={value=>{const nextDataset=value as SecopDataset;const nextContractType=nextDataset==='ted'?(['','1','2','3'].includes(form.contractType)?form.contractType:''):nextDataset==='placsp'?form.contractType:'';setForm({...form,dataset:nextDataset,publicationYear:'',department:nextDataset==='ted'?['España (ESP)']:[],modality:[],status:[],...(nextDataset==='placsp'||nextDataset==='ted'?{contractType:nextContractType}:{cpvCode:'',entity:'',reference:'',contractType:'',euFunded:''})});}}/></div>{(['department','modality','status'] as const).map(key=><WebCategoryFilter key={`${form.dataset}-${key}`} label={columnLabel(key)} category={key} dataset={form.dataset} value={form[key]} onChange={value=>setForm({...form,[key]:value})} language={language}/>)}{showSpainEuFilters && <><label>{en?'CPV code':'Código CPV'}<Input value={form.cpvCode} maxLength={20} placeholder={en?'e.g. 72000000':'Ej. 72000000'} onChange={e=>setForm({...form,cpvCode:e.target.value})}/></label><label>{en?'Contracting authority':'Órgano de contratación'}<Input value={form.entity} maxLength={300} placeholder={en?'e.g. Ministry, city council…':'Ej. Ministerio, ayuntamiento…'} onChange={e=>setForm({...form,entity:e.target.value})}/></label><label>{en?'Reference':'Expediente'}<Input value={form.reference} maxLength={300} placeholder={en?'e.g. 2026/001':'Ej. 2026/001'} onChange={e=>setForm({...form,reference:e.target.value})}/></label><div className="web-admin-sheet-field"><span>{en?'Contract type':'Tipo de contrato'}</span><SelectField value={form.contractType} aria-label={en?'Contract type':'Tipo de contrato'} options={tedDataset?tedContractTypeOptions:contractTypeOptions} onChange={value=>setForm({...form,contractType:value})}/></div><div className="web-admin-sheet-field"><span>{en?'EU funding':'Financiación UE'}</span><SelectField value={form.euFunded} aria-label={en?'EU funding':'Financiación UE'} options={euFundedOptions} onChange={value=>setForm({...form,euFunded:value})}/></div></>}<label>{en?'Minimum value':'Valor mínimo'}<Input type="number" min="0" value={form.minValue} onChange={e=>setForm({...form,minValue:e.target.value})}/></label><label>{en?'Maximum value':'Valor máximo'}<Input type="number" min="0" value={form.maxValue} onChange={e=>setForm({...form,maxValue:e.target.value})}/></label>{tedDataset && <label>{en?'Publication year':'Año de publicación'}<Input type="text" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" placeholder={en?'YYYY':'AAAA'} value={form.publicationYear} onChange={e=>setForm({...form,publicationYear:e.target.value})}/></label>}<label>{en?'Published from':'Publicado desde'}<Input type="date" value={form.fromDate} onChange={e=>setForm({...form,fromDate:e.target.value})}/></label><p className="web-secop-note">{en?'Values are compared without currency conversion. Verify the currency in the source.':'Los valores se comparan sin convertir monedas. Verifica la moneda en la fuente.'}</p></div>}
  </form>
  {searchError && <p role="alert" className="web-secop-search-error">{searchError==='timeout'?secopTimeoutMessage:(en?'Could not retrieve opportunities. Check your connection and try Search again.':'No se pudieron consultar las oportunidades. Revisa tu conexión y vuelve a pulsar Buscar.')}</p>}
  {loading&&!appendInFlight.current&&<WebLoading message={en?`Searching ${sourceDisplayName(form.dataset, language)}…`:`Buscando en ${sourceDisplayName(form.dataset, language)}…`} detail={en?'Retrieving opportunities matching your filters.':'Consultamos las oportunidades que coinciden con tus filtros.'}/>}
  {!results && !loading && !searchError && <div className="web-secop-empty"><div className="web-secop-empty-icon" aria-hidden="true"><SearchIcon size={22}/></div><h3>{en?`Explore ${sourceDisplayName(form.dataset, language)} opportunities`:`Explora licitaciones en ${sourceDisplayName(form.dataset, language)}`}</h3><p>{en?'Enter a keyword, entity, or process number, or open filters to narrow your search.':'Escribe una palabra clave, entidad o número de expediente, o abre los filtros para acotar tu búsqueda.'}</p><div className="web-secop-empty-actions"><Button type="button" variant="outline" icon={SearchIcon} onClick={()=>runSearch()}>{en?'View recent processes':'Ver procesos recientes'}</Button>{!showFilters && <Button type="button" variant="ghost" icon={SlidersHorizontal} onClick={()=>setShowFilters(true)}>{en?'Show filters':'Mostrar filtros'}</Button>}</div></div>}
  {results && <div className="web-secop-grid"><div className="web-secop-toolbar"><div><strong>{results.length} {en?'opportunities loaded':'oportunidades cargadas'}</strong><small className="web-secop-export-note">{en?'Export includes loaded rows only.':'La exportación incluye solo las filas cargadas.'}</small>{rupFailed?<small className="web-secop-export-note" role="status">{en?'Reviewed accreditation data could not be loaded.':'No se pudieron consultar los datos revisados de acreditación.'}</small>:hasExperience?<small className="web-secop-export-note">{en?'Matches are indicative and do not determine eligibility.':'Las coincidencias son orientativas y no determinan habilitación.'}</small>:null}</div><div className="web-inline">{hasExperience && <Button variant="outline" size="sm" aria-pressed={prioritize} onClick={()=>setPrioritize(value=>!value)}>{prioritize?(en?'Original order':'Orden original'):(en?'Prioritize loaded matches':'Priorizar coincidencias cargadas')}</Button>}<Button icon={RefreshCw} iconOnly variant="outline" size="sm" disabled={loading || !active} onClick={()=>active && void execute({...active,limit:SEARCH_PAGE_SIZE,offset:0},false,true)}>{en?'Refresh results':'Actualizar resultados'}</Button><Button icon={Columns3} iconOnly variant="outline" size="sm" onClick={()=>setShowOrder(!showOrder)} aria-expanded={showOrder}>{en?'Columns':'Columnas'}</Button><Button icon={FileDown} iconOnly variant="outline" disabled={!results.length} onClick={()=>void exportRows('csv')}>{en?'Export loaded rows as CSV':'Exportar filas cargadas a CSV'}</Button><Button icon={FileSpreadsheet} iconOnly variant="outline" disabled={!results.length} onClick={()=>void exportRows('xlsx')}>{en?'Export loaded rows to Excel':'Exportar filas cargadas a Excel'}</Button><Button icon={ListFilter} iconOnly variant="outline" size="sm" onClick={()=>setShowColumns(!showColumns)} aria-expanded={showColumns}>{en?'Column filters':'Filtros de columna'}</Button></div></div>{showOrder && <div className="web-secop-order">{columnOrder.map((key,index)=><div key={key}><span>{columnLabel(key)}</span><Button variant="ghost" size="sm" disabled={!index} aria-label={`${en?'Move earlier':'Mover antes'}: ${columnLabel(key)}`} onClick={()=>moveColumn(key,-1)}>↑</Button><Button variant="ghost" size="sm" disabled={index===columnOrder.length-1} aria-label={`${en?'Move later':'Mover después'}: ${columnLabel(key)}`} onClick={()=>moveColumn(key,1)}>↓</Button></div>)}</div>}{showColumns && <form className="web-secop-filters" onSubmit={e=>{e.preventDefault();changeQuery({columnFilters:draft});}}>{columns.map(key=><label key={key}>{columnLabel(key)}<Input type={key==='value'?'number':key==='publicationDate'||key==='deadline'?'date':'text'} value={draft[key]||''} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}<div className="web-inline"><Button size="sm" type="submit">{en?'Apply':'Aplicar'}</Button><Button size="sm" variant="ghost" type="button" onClick={()=>{setDraft({});changeQuery({columnFilters:{}});}}>{en?'Clear':'Limpiar'}</Button></div></form>}<div className="web-secop-responsive-sort"><div className="web-admin-sheet-field"><span>{en?'Sort by':'Ordenar por'}</span><SelectField value={query.sortBy || 'publicationDate'} aria-label={en?'Sort by':'Ordenar por'} options={columnOrder.map(key=>({value:key,label:columnLabel(key)}))} onChange={value=>changeQuery({sortBy:value as SecopColumn})}/></div><Button icon={query.sortDirection==='asc'?ArrowUp:ArrowDown} iconOnly variant="outline" size="sm" onClick={()=>changeQuery({sortDirection:query.sortDirection==='asc'?'desc':'asc'})}>{query.sortDirection==='asc'?(en?'Ascending order':'Orden ascendente'):(en?'Descending order':'Orden descendente')}</Button></div><div className="web-secop-table-scroll" ref={scrollRoot}><Table aria-label={en ? 'Search results' : 'Resultados de búsqueda'}><TableHeader><TableRow>{columnOrder.map(key=><TableHead data-column={key} key={key} draggable onDragStart={()=>{dragged.current=key;}} onDragOver={e=>e.preventDefault()} onDragEnd={()=>{dragged.current=null;}} onDrop={e=>{e.preventDefault();const draggedKey=dragged.current;if(draggedKey && draggedKey!==key)setColumnOrder(current=>{const next=current.filter(column=>column!==draggedKey);next.splice(next.indexOf(key),0,draggedKey);return next;});dragged.current=null;}} aria-sort={query.sortBy===key?(query.sortDirection==='asc'?'ascending':'descending'):'none'}><Button variant="ghost" size="sm" onClick={()=>changeQuery({sortBy:key,sortDirection:query.sortBy===key&&query.sortDirection==='asc'?'desc':'asc'})}>{columnLabel(key)} {query.sortBy===key?(query.sortDirection==='asc'?<ArrowUp aria-hidden="true"/>:<ArrowDown aria-hidden="true"/>):<ArrowUpDown aria-hidden="true"/>}</Button></TableHead>)}</TableRow></TableHeader><TableBody>{displayed.map(item=><TableRow key={`${item.source}:${item.id}`} tabIndex={0} onClick={()=>setSelected(item)} onKeyDown={e=>{if(e.key==='Enter')setSelected(item);}}>{columnOrder.map(key=><TableCell data-column={key} key={key}>{key === 'title' ? <button className="web-secop-title" onClick={event=>{event.stopPropagation();setSelected(item);}} title={item.title}>{item.title}</button> : <span className="web-secop-cell-text" title={String((key==='department'?(item.territory||item.department):item[key]) ?? '')}>{formatCell(item, key, language)}</span>}{key==='title' && opportunityMatch(item,rupFacts).slice(0,1).map(match=><small className="web-secop-rup-match" key={`${match.code}:${match.page}`} title={match.label}>{match.kind==='CPV'?(en?'CPV match; review ROLECE':'CPV coincide; revisar ROLECE'):(en?'Class match; review RUP':'Clase coincide; revisar RUP')} · {match.code} · {en?'p.':'pág.'} {match.page}</small>)}</TableCell>)}</TableRow>)}</TableBody></Table><ul className="web-secop-responsive-list" aria-label={en?'Search results':'Resultados de búsqueda'}>{displayed.map(item=><li key={`${item.source}:${item.id}`}><button type="button" className="web-secop-list-entry" onClick={()=>setSelected(item)}><span className="web-secop-list-title">{item.title || (en?'Untitled opportunity':'Oportunidad sin título')}</span>{item.entity&&<span className="web-secop-list-entity">{item.entity}</span>}{opportunityMatch(item,rupFacts).slice(0,1).map(match=><small className="web-secop-rup-match" key={`${match.code}:${match.page}`}>{match.kind==='CPV'?(en?'CPV match; review ROLECE':'CPV coincide; revisar ROLECE'):(en?'Class match; review RUP':'Clase coincide; revisar RUP')} · {match.code} · {en?'p.':'pág.'} {match.page}</small>)}<span className="web-secop-list-facts">{columnOrder.filter(key=>key!=='title'&&key!=='entity'&&((key==='department'?(item.territory||item.department):item[key])!=null&&(key==='department'?(item.territory||item.department):item[key])!=='')).map(key=><span className="web-secop-list-fact" key={key}><span>{columnLabel(key)}</span><strong>{formatCell(item,key,language)}</strong></span>)}</span></button></li>)}</ul>{!results.length && <p>{en?'No results. Try different filters.':'Sin resultados. Prueba otros filtros.'}</p>}<div ref={sentinel}></div></div>{truncated && active && (loading?<div className="web-secop-loading-dots" role="status" aria-label={en?'Loading more opportunities':'Cargando más oportunidades'}><span/><span/><span/></div>:<div className="web-secop-pagination">{pageError&&<span role="status">{pageError==='timeout'?secopTimeoutMessage:(en?'Could not load more results.':'No se pudieron cargar más resultados.')}</span>}<Button variant="outline" onClick={()=>void execute({...active,offset:(active.offset||0)+(active.limit||SEARCH_PAGE_SIZE)},true)}>{pageError?(en?'Retry':'Reintentar'):(en?'Load more':'Cargar más')}</Button></div>)}</div>}
  {selected && <WebOpportunityDetail key={`${selected.source}:${selected.id}`} item={selected} language={language} saving={!!saving} onClose={()=>setSelected(null)} onSave={(item,ids)=>void save(item,ids)}/>}</section>;
}
