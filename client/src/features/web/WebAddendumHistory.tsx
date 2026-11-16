import {useEffect,useState} from 'react';
import {request} from './api.mjs';

type Review = {impactId?:string;status?:string;note?:string};
type Impact = {id?:string;title?:string;category?:string;addendumQuote?:string;originalQuote?:string;offerQuote?:string;explanation?:string};
type Run = {id:string;status:string;sources?:{addendumName?:string}|null;result?:{impacts?:Impact[];discardedCount?:number;unreadableSources?:Array<{name?:string}>}|null;reviews?:Review[];orphanReviewCount?:number;issue?:string;createdAt?:string;error?:string};
const text=(value:unknown)=>typeof value==='string'?value:'';
export function AddendumHistoryView({runs,language}:{runs:Run[];language:'es'|'en'}) {
 const en=language==='en';
 return <section className="web-addendum-history"><h3>{en?'Historical addendum analyses':'Análisis históricos de adendas'}</h3><p>{en?'Imported from desktop. Source currency and citations have not been checked on the web. Review the original documents before relying on these findings.':'Importados del escritorio. No se ha comprobado en la web la vigencia de las fuentes ni sus citas. Revisa los documentos originales antes de usar estos hallazgos.'}</p>
 {runs.map((run,index)=>{const impacts=Array.isArray(run.result?.impacts)?run.result.impacts:[],reviews=Array.isArray(run.reviews)?run.reviews:[];return <details key={run.id||index}><summary><strong>{text(run.sources?.addendumName)||(en?'Addendum':'Adenda')}</strong><span>{text(run.createdAt)} · {run.status==='interrupted'?(en?'Interrupted':'Interrumpido'):run.status==='completed'?(en?'Completed':'Completado'):(en?'Error':'Error')}</span></summary>{run.issue&&<p role="status">{en?'Some historical data is unreadable.':'Algunos datos históricos no se pueden leer.'}</p>}{text(run.error)&&<p>{text(run.error)}</p>}{!!run.orphanReviewCount&&<p>{en?`${run.orphanReviewCount} review(s) have no matching finding.`:`${run.orphanReviewCount} revisión(es) no tienen un hallazgo asociado.`}</p>}{impacts.length>0?<ul>{impacts.map((impact,i)=>{const review=reviews.find(row=>row.impactId===impact.id);return <li key={text(impact.id)||i}><strong>{text(impact.title)||(en?'Finding':'Hallazgo')}</strong>{text(impact.category)&&<small> · {text(impact.category)}</small>}{text(impact.addendumQuote)&&<><p>{en?'Addendum quotation':'Cita de la adenda'}</p><blockquote>{text(impact.addendumQuote)}</blockquote></>}{text(impact.originalQuote)&&<><p>{en?'Reference quotation':'Cita de referencia'}</p><blockquote>{text(impact.originalQuote)}</blockquote></>}{text(impact.offerQuote)&&<><p>{en?'Offer quotation':'Cita de la oferta'}</p><blockquote>{text(impact.offerQuote)}</blockquote></>}{text(impact.explanation)&&<p>{text(impact.explanation)}</p>}{review&&<p><strong>{review.status==='reviewed'?(en?'Reviewed in desktop':'Revisado en escritorio'):(en?'Pending review in desktop':'Pendiente de revisión en escritorio')}</strong>{text(review.note)?`: ${text(review.note)}`:''}</p>}</li>;})}</ul>:!run.issue&&<p>{en?'No findings were recorded.':'No se registraron hallazgos.'}</p>}</details>;})}
 </section>;
}
export default function WebAddendumHistory({projectId,language}:{projectId:string;language:'es'|'en'}) {
 const [runs,setRuns]=useState<Run[]|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let active=true;setRuns(null);setError(false);void request<{runs:Run[]}>(`/api/projects/${encodeURIComponent(projectId)}/addenda`).then(data=>{if(active)setRuns(data.runs);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[projectId]);
 if(error)return <p role="alert">{language==='en'?'Could not load historical addendum analyses.':'No se pudo cargar el historial de adendas.'}</p>;
 return runs?.length?<AddendumHistoryView runs={runs} language={language}/>:null;
}
