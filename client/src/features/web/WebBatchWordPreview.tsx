import {useEffect,useState} from 'react';
import {WordIcon} from './WordIcon';
import {Button} from '@/shared/ui/primitives/button';
import {request} from './api.mjs';
import WebWordDocument from './WebWordDocument';
import {WebAnalysisActivity} from './WebAnalysisActivity';

type Job = {
 id:string;
 kind:string;
 state:string;
 artifactState?:string;
 wordRevision?:number;
 payload:{draftBatchId?:string;planVersion:number;draftBatchFingerprint?:string};
 result?:{message?:string;warnings?:string[]}|null;
};

export default function WebBatchWordPreview({projectId,batchId,version,draftCount,language,disabled}:{projectId:string;batchId:string;version:number;draftCount:number;language:'es'|'en';disabled:boolean}){
 const en=language==='en';
 const [jobs,setJobs]=useState<Job[]>(),[fingerprint,setFingerprint]=useState<string>();
 const [busy,setBusy]=useState(false),[error,setError]=useState(false),[snapshotError,setSnapshotError]=useState(false);
 const [autoOpenId,setAutoOpenId]=useState<string>(),[refresh,setRefresh]=useState(0);
 const base=`/api/projects/${encodeURIComponent(projectId)}`;
 useEffect(()=>{
  const controller=new AbortController();
  setSnapshotError(false);
  setFingerprint(undefined);
  void request<{fingerprint:string}>(`${base}/technical-batches/${encodeURIComponent(batchId)}/word-preview`,{signal:controller.signal})
   .then(snapshot=>{if(!controller.signal.aborted)setFingerprint(snapshot.fingerprint);})
   .catch(()=>{if(!controller.signal.aborted)setSnapshotError(true);});
  return()=>controller.abort();
 },[base,batchId,version,draftCount,refresh]);
 useEffect(()=>{
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>, poll=!!autoOpenId;
  const load=async()=>{
   try{
    const data=await request<{jobs:Job[]}>(`${base}/jobs`,{signal:controller.signal});
    if(controller.signal.aborted)return;
    const exports=data.jobs.filter(job=>job.kind==='technical-plan.export-word'&&job.payload.draftBatchId===batchId&&job.payload.planVersion===version);
    setJobs(exports);
    setError(false);
    poll=exports[0]?.state==='queued'||exports[0]?.state==='running';
   }catch{if(!controller.signal.aborted)setError(true);}
   if(poll&&!controller.signal.aborted)timer=setTimeout(load,2000);
  };
  void load();
  return()=>{controller.abort();clearTimeout(timer);};
 },[base,batchId,version,refresh,autoOpenId]);

 const prepare=async()=>{
  setBusy(true);
  setError(false);
  try{
   const next=await request<{job:Job}>(`${base}/jobs`,{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},json:{kind:'technical-plan.export-word',payload:{planVersion:version,language,draftBatchId:batchId}}});
   setJobs(previous=>[next.job,...(previous||[]).filter(job=>job.id!==next.job.id)]);
   setAutoOpenId(next.job.id);
  }catch{setError(true);}
  finally{setBusy(false);}
 };

 const latest=jobs?.[0],running=latest&&(latest.state==='queued'||latest.state==='running');
 const stored=(jobs||[]).filter(job=>job.state==='succeeded'&&job.artifactState==='stored');
 const current=fingerprint?stored.find(job=>job.payload.draftBatchFingerprint===fingerprint):undefined;
 const previous=stored.find(job=>job.id!==current?.id&&((job.wordRevision??0)>0||job===stored[0]));
 const warnings=(current||previous||latest)?.result?.warnings||[];
 const missing=warnings.filter(warning=>/contenido aún no generado/i.test(warning)), otherWarnings=warnings.filter(warning=>!/contenido aún no generado/i.test(warning));

 return <div className="web-batch-word-preview">
 {!current&&<Button disabled={disabled||busy||!!running||!fingerprint||!jobs} onClick={()=>void prepare()}><WordIcon/>{busy||running?(en?'Preparing Word…':'Preparando Word…'):previous?(en?'Prepare updated Word':'Preparar Word actualizado'):(en?'Open and edit Word':'Abrir y editar Word')}</Button>}
 {[current,previous].map(job=>job&&<WebWordDocument saveToProject allowContinue={job===current} onSaveAndContinue={()=>window.dispatchEvent(new CustomEvent('savia:word-reviewed',{detail:{projectId,jobId:job.id}}))} key={job.id} language={language} initiallyOpen={autoOpenId===job.id} name="borrador-de-oferta.docx" url={`${base}/jobs/${job.id}/artifact`} label={job===current?(en?'Open and edit Word':'Abrir y editar Word'):fingerprint?(en?'Open previous Word':'Abrir Word anterior'):(en?'Open Word':'Abrir Word')}/>)}
 {fingerprint&&!current&&previous&&!running&&<p role="status">{en?'The drafted chapters changed since this Word was prepared. You can still open the previous file.':'Los capítulos redactados cambiaron desde que se preparó este Word. Todavía puedes abrir el archivo anterior.'}</p>}
 {running&&<WebAnalysisActivity projectId={projectId} jobId={latest.id} language={language} state={latest.state}/>}
 {(error||snapshotError)&&<p role="alert">{en?'Could not prepare or load the Word. Check the connection and retry.':'No se pudo preparar o cargar el Word. Comprueba la conexión y reintenta.'}<Button variant="ghost" onClick={()=>setRefresh(v=>v+1)}>{en?'Refresh':'Actualizar'}</Button></p>}
 {latest?.state==='failed'&&<p role="alert">{latest.result?.message||(en?'Could not create Word. Check the runner and retry.':'No se pudo crear el Word. Revisa el runner y reintenta.')}</p>}
 {!!missing.length&&<p role="status">{en?`This Word is incomplete: ${missing.length} ${missing.length===1?'chapter has':'chapters have'} not been generated yet. Resume drafting to complete it.`:`Este Word está incompleto: ${missing.length} ${missing.length===1?'capítulo aún no se ha generado':'capítulos aún no se han generado'}. Reanuda la redacción para completarlo.`}</p>}
 {!!otherWarnings.length&&<details><summary>{en?'Other Word notices':'Otros avisos del Word'}</summary>{otherWarnings.map((warning,i)=><p key={i}>{warning}</p>)}</details>}
 </div>;
}
