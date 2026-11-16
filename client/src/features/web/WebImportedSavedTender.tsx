import {RefreshCw} from 'lucide-react';
import { useEffect, useState } from 'react';
import MarkdownRenderer from '@/shared/ui/MarkdownRenderer';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import { request } from './api.mjs';
type Analysis = {status?:unknown;content?:unknown;error?:unknown};
type Document = {id?:unknown;name?:unknown;text?:unknown};
type RecordData = {summary:string;analysis:Record<string,Analysis>;importedDocuments:Document[];officialDocuments:Document[]};
const value=(input:unknown)=>typeof input==='string'?input:'';
function officialUrl(id:string){const params=new URLSearchParams({DocumentId:id,InCommunity:'False',InPaymentGateway:'False',DocUniqueIdentifier:''});return `https://community.secop.gov.co/Public/Archive/RetrieveFile/Index?${params}`;}
export default function WebImportedSavedTender({projectId,language}:{projectId:string;language:'es'|'en'}) {
 const en=language==='en',[record,setRecord]=useState<RecordData|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setFailed(false);void request<{record:RecordData|null}>(`/api/projects/${encodeURIComponent(projectId)}/imported-saved-tender`).then(data=>{if(active)setRecord(data.record);}).catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[projectId,refresh]);
 if(!loading&&!failed&&!record)return null;
 return <details className="web-imported-tender"><summary>{en?'Saved tender from desktop':'Licitación guardada del escritorio'}</summary>
  <p>{en?'Historical copy. Extracted text may differ from the original, and saved official references may omit later documents.':'Copia histórica. El texto extraído puede diferir del original y las referencias oficiales guardadas pueden omitir documentos posteriores.'}</p>
  {loading&&<p role="status">{en?'Loading…':'Cargando…'}</p>}{failed&&<div role="alert"><p>{en?'Could not load the saved copy.':'No se pudo cargar la copia guardada.'}</p><Button icon={RefreshCw} iconOnly variant="outline" size="sm" onClick={()=>setRefresh(value=>value+1)}>{en?'Retry':'Reintentar'}</Button></div>}
  {!loading&&!failed&&record&&<><h4>{en?'Summary':'Resumen'}</h4>{record.summary?<MarkdownRenderer allowRawHtml={false}>{record.summary.replaceAll('![','[')}</MarkdownRenderer>:<p>{en?'No saved summary.':'No hay resumen guardado.'}</p>}
   {Object.entries(record.analysis).map(([key,item])=><details key={key}><summary>{key} · {value(item?.status)||'—'}</summary>{value(item?.content)?<MarkdownRenderer allowRawHtml={false}>{value(item.content).replaceAll('![','[')}</MarkdownRenderer>:<p>{value(item?.error)||(en?'No result.':'Sin resultado.')}</p>}</details>)}
   <h4>{en?'Extracted documents':'Documentos extraídos'}</h4>{record.importedDocuments.length?record.importedDocuments.map((doc,index)=><details key={`${value(doc?.id)}:${index}`}><summary>{value(doc?.name)||(en?'Document':'Documento')}</summary><pre>{value(doc?.text)}</pre></details>):<p>{en?'No extracted documents in this copy.':'No hay documentos extraídos en esta copia.'}</p>}
   <h4>{en?'Saved official references':'Referencias oficiales guardadas'}</h4>{record.officialDocuments.length?<ul>{record.officialDocuments.map((doc,index)=>{const id=value(doc?.id),name=value(doc?.name)||(en?'Document':'Documento');return <li key={`${id}:${index}`}>{/^\d+$/.test(id)?<a href={officialUrl(id)} target="_blank" rel="noreferrer">{name}</a>:name}</li>;})}</ul>:<p>{en?'No saved official references.':'No hay referencias oficiales guardadas.'}</p>}
  </>}
 </details>;
}
