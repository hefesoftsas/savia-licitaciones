import {useEffect,useState} from 'react';
import {Button} from '@/shared/ui/primitives/button';
import {Input} from '@/shared/ui/primitives/input';
import {request} from './api.mjs';
type Document={id:string;name:string};
type ViewProps={language:'es'|'en';selected:string[];documents:Document[];query:string;loading:boolean;failed:boolean;onQuery:(value:string)=>void;onSearch:()=>void;onChange:(ids:string[])=>void};
export function FeasibilityKnowledgeView({language,selected,documents,query,loading,failed,onQuery,onSearch,onChange}:ViewProps){
 const en=language==='en',known=new Set(documents.map(doc=>doc.id)),unknown=selected.filter(id=>!known.has(id));
 const toggle=(id:string,checked:boolean)=>onChange(checked?[...selected,id]:selected.filter(item=>item!==id));
 return <section><h3>{en?'Knowledge references':'Referencias de biblioteca'}</h3><p>{en?'Select library documents to use when drafting chapters. Imported references are preserved.':'Selecciona documentos de biblioteca para redactar capítulos. Se conservan las referencias importadas.'}</p><form onSubmit={event=>{event.preventDefault();onSearch();}}><label>{en?'Search library':'Buscar en la biblioteca'}<Input value={query} onChange={event=>onQuery(event.target.value)} /></label><Button size="sm" type="submit" variant="outline" disabled={loading}>{en?'Search':'Buscar'}</Button></form>{loading&&<p role="status">{en?'Loading library…':'Cargando biblioteca…'}</p>}{failed&&<p role="alert">{en?'Could not load the library.':'No se pudo cargar la biblioteca.'}</p>}{unknown.map(id=><label className="web-consent" key={id}><input type="checkbox" checked onChange={event=>toggle(id,event.target.checked)} />{en?'Saved reference':'Referencia guardada'}: {id}</label>)}{documents.map(doc=><label className="web-consent" key={doc.id}><input type="checkbox" checked={selected.includes(doc.id)} onChange={event=>toggle(doc.id,event.target.checked)} />{doc.name}</label>)}{!loading&&!failed&&!documents.length&&<p>{en?'No documents found.':'No se encontraron documentos.'}</p>}<p>{en?'The selected documents need imported items or an analyzed library index.':'Los documentos seleccionados deben tener contenido importado o un índice de biblioteca analizado.'}</p></section>;
}
export default function WebFeasibilityKnowledge({language,selected,onChange}:{language:'es'|'en';selected:string[];onChange:(ids:string[])=>void}){
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[documents,setDocuments]=useState<Document[]>([]),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;setLoading(true);void request<{documents:Document[]}>(`/api/knowledge/documents?q=${encodeURIComponent(search)}`).then(data=>{if(active){setDocuments(data.documents);setFailed(false);}}).catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[search]);
 return <FeasibilityKnowledgeView language={language} selected={selected} documents={documents} query={query} loading={loading} failed={failed} onQuery={setQuery} onSearch={()=>setSearch(query.trim())} onChange={onChange} />;
}
