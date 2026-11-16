import {useEffect,useState} from 'react';
import {WordIcon} from './WordIcon';
import {Button} from '@/shared/ui/primitives/button';
import {request} from './api.mjs';
import WebWordDocument from './WebWordDocument';
import {WebAnalysisActivity} from './WebAnalysisActivity';
type Job={id:string;kind:string;state:string;artifactState?:string;payload:{draftBatchId?:string;planVersion:number};result?:{message?:string;warnings?:string[]}|null};
export default function WebBatchWordPreview({projectId,batchId,version,language,disabled}:{projectId:string;batchId:string;version:number;language:'es'|'en';disabled:boolean}){
 const en=language==='en',[job,setJob]=useState<Job>(),[busy,setBusy]=useState(false),[error,setError]=useState(false),[autoOpen,setAutoOpen]=useState(false),[refresh,setRefresh]=useState(0);
 const base=`/api/projects/${encodeURIComponent(projectId)}`;
 useEffect(()=>{let alive=true,timer:ReturnType<typeof setTimeout>;const load=async()=>{try{const data=await request<{jobs:Job[]}>(`${base}/jobs`);if(!alive)return;const latest=data.jobs.find(j=>j.kind==='technical-plan.export-word'&&j.payload.draftBatchId===batchId&&j.payload.planVersion===version);setJob(latest);setError(false);if(latest&&['queued','running'].includes(latest.state))timer=setTimeout(load,2000);}catch{if(alive)setError(true);}};void load();return()=>{alive=false;clearTimeout(timer);};},[base,batchId,version,refresh]);
 const prepare=async()=>{setBusy(true);setError(false);try{const next=await request<{job:Job}>(`${base}/jobs`,{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},json:{kind:'technical-plan.export-word',payload:{planVersion:version,language,draftBatchId:batchId}}});setJob(next.job);setAutoOpen(true);setRefresh(v=>v+1);}catch{setError(true);}finally{setBusy(false);}};
 const running=job&&['queued','running'].includes(job.state),ready=job?.state==='succeeded'&&job.artifactState==='stored';
 const warnings=job?.result?.warnings||[], missing=warnings.filter(warning=>/contenido aún no generado/i.test(warning)), otherWarnings=warnings.filter(warning=>!/contenido aún no generado/i.test(warning));
 return <div className="web-batch-word-preview">
 {ready?<WebWordDocument saveToProject onSaveAndContinue={()=>window.dispatchEvent(new CustomEvent('savia:word-reviewed',{detail:{projectId,jobId:job.id}}))} key={job.id} language={language} initiallyOpen={autoOpen} name="borrador-de-oferta.docx" url={`${base}/jobs/${job.id}/artifact`} label={en?'Open and edit Word':'Abrir y editar Word'}/>:<Button disabled={disabled||busy||!!running} onClick={()=>void prepare()}><WordIcon/>{busy||running?(en?'Preparing Word…':'Preparando Word…'):(en?'Open and edit Word':'Abrir y editar Word')}</Button>}
 {running&&<WebAnalysisActivity projectId={projectId} jobId={job.id} language={language} state={job.state}/>}
 {error&&<p role="alert">{en?'Could not prepare or load the Word. Check the connection and retry.':'No se pudo preparar o cargar el Word. Comprueba la conexión y reintenta.'}<Button variant="ghost" onClick={()=>setRefresh(v=>v+1)}>{en?'Refresh':'Actualizar'}</Button></p>}
 {job?.state==='failed'&&<p role="alert">{job.result?.message||(en?'Could not create Word. Check the runner and retry.':'No se pudo crear el Word. Revisa el runner y reintenta.')}</p>}
 {!!missing.length&&<p role="status">{en?`This Word is incomplete: ${missing.length} ${missing.length===1?'chapter has':'chapters have'} not been generated yet. Resume drafting to complete it.`:`Este Word está incompleto: ${missing.length} ${missing.length===1?'capítulo aún no se ha generado':'capítulos aún no se han generado'}. Reanuda la redacción para completarlo.`}</p>}
 {!!otherWarnings.length&&<details><summary>{en?'Other Word notices':'Otros avisos del Word'}</summary>{otherWarnings.map((warning,i)=><p key={i}>{warning}</p>)}</details>}
 </div>;
}
