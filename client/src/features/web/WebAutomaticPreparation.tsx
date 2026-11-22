import { useEffect, useRef, useState } from 'react';
import { request } from './api.mjs';
import { WizardActionButton as Button } from './WizardActionButton';
import WebWordDocument from './WebWordDocument';

type Preparation = { status:'running'|'paused'|'blocked'|'ready'; stage:string; reason:string|null; runId:string; wordId:string|null; economicId?:string };
type Props = {projectId:string;language:'es'|'en';fileIds:string[];credentialId:string;consent:boolean;dirty:boolean;enabled:boolean;onStep:(step:number)=>void};
const steps:Record<string,number> = {'project-overview':1,'technical-score':1,'response-requirements':1,chapters:2,outline:2,facts:3,draft:4,word:4,economic:4};
const stages:Record<string,[string,string]> = {
  'project-overview':['Resumen','Overview'], 'technical-score':['Criterios','Scoring'], 'response-requirements':['Requisitos','Requirements'],
  chapters:['Capítulos','Chapters'],outline:['Índice','Outline'],facts:['Hechos','Facts'],draft:['Redacción','Drafting'],word:['Memoria técnica','Technical proposal'],economic:['Oferta económica','Economic offer'],
};
const reasons:Record<string,[string,string]> = {
  technical_score_unknown:['Indica si el pliego tiene puntuación técnica para seguir preparando la oferta.','Choose whether the tender has technical scoring to continue.'],
  existing_draft:['Ya hay capítulos redactados. Revisa los hechos antes de actualizar el borrador.','Some chapters are already drafted. Review the facts before updating the draft.'],
  facts_need_input:['Completa los datos pendientes en Hechos.','Complete the missing information in Facts.'],
  facts_pending_replacements:['Completa los datos pendientes en Hechos.','Complete the missing information in Facts.'],
  task_failed:['La última tarea falló. Revisa su actividad o reintenta.','The last task failed. Review its activity or retry.'],
  rup_consent_required:['Revisa los hechos que usan datos del RUP antes de continuar.','Review the facts that use RUP data before continuing.'],
  template_selection_required:['Completa la configuración de la plantilla Word.','Complete the Word template configuration.'],
};

export function WebAutomaticPreparation({projectId,language,fileIds,credentialId,consent,dirty,enabled,onStep}:Props) {
  const en=language==='en',locale=en?1:0;
  const [state,setState]=useState<Preparation|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false);
  const base=`/api/projects/${encodeURIComponent(projectId)}/automatic-preparation`;
  const latest=useRef(0), handled=useRef('');
  const onStepRef=useRef(onStep);
  onStepRef.current=onStep;
  useEffect(()=>{
    if (!enabled) return;
    const controller=new AbortController();
    const poll=async()=>{
      const id=++latest.current;
      try {
        const result=await request<{preparation:Preparation|null}>(base,{signal:controller.signal});
        if(id===latest.current&&!controller.signal.aborted){setState(result.preparation);setLoaded(true);setFailed(false);}
      } catch { if(id===latest.current&&!controller.signal.aborted)setFailed(true); }
    };
    void poll();
    const timer=window.setInterval(poll,3000);
    return()=>{controller.abort();window.clearInterval(timer);};
  },[base,enabled]);
  useEffect(()=>{
    if (!enabled || dirty || !state || state.status==='paused') return;
    const key=`${state.runId}:${state.status}:${state.stage}`;
    if(handled.current===key)return;
    handled.current=key;
    onStepRef.current(steps[state.stage]??4);
  },[state,dirty,enabled]);
  const change=async(action:'start'|'pause'|'resume',technicalScore?:'present'|'none')=>{
    setBusy(true);
    latest.current++;
    try {
      const result=await request<{preparation:Preparation}>(base,{method:'POST',json:{
        action,...(action==='start'?{fileIds,credentialId,language,consent}:{}),technicalScore,
      }});
      latest.current++;
      setState(result.preparation);
      setFailed(false);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  };
  const available=!!fileIds.length&&fileIds.length<=50&&!!credentialId&&consent&&!dirty;
  if(!enabled)return null;
  return <div className="web-inline" aria-label={en?'Automatic preparation':'Preparación automática'}>
    {!state&&<Button size="sm" disabled={busy||!loaded||!available} onClick={()=>void change('start')}>{en?'Prepare automatically':'Preparar automáticamente'}</Button>}
    {state?.status==='running'&&<><span role="status">{en?'Preparing':'Preparando'} · {stages[state.stage]?.[locale]}</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>void change('pause')}>{en?'Pause':'Pausar'}</Button></>}
    {state?.status==='paused'&&<span role="status">{en?'Automatic preparation paused. Current work is kept.':'Preparación automática en pausa. El trabajo en curso se conserva.'}</span>}
    {state?.status==='blocked'&&<span role="status">{reasons[state.reason||'']?.[locale]||(en?'Review the current step before continuing.':'Revisa la etapa actual antes de continuar.')}</span>}
    {state?.status==='blocked'&&state.reason==='technical_score_unknown'&&<>
      <Button size="sm" disabled={busy||dirty} onClick={()=>void change('resume','present')}>{en?'Technical scoring applies':'Hay puntuación técnica'}</Button>
      <Button size="sm" variant="outline" disabled={busy||dirty} onClick={()=>void change('resume','none')}>{en?'No technical scoring':'Sin puntuación técnica'}</Button>
    </>}
    {(state?.status==='paused'||state?.status==='blocked'&&state.reason!=='technical_score_unknown')&&<Button size="sm" disabled={busy||dirty} onClick={()=>void change('resume')}>{en?'Resume':'Reanudar'}</Button>}
    {state?.status==='ready'&&state.wordId&&<><span role="status">{en?'Draft ready for final review.':'Borrador listo para la revisión final.'}</span><WebWordDocument language={language} saveToProject url={`/api/projects/${projectId}/jobs/${state.wordId}/artifact`} label={state.economicId?(en?'Review technical proposal':'Revisar memoria técnica'):(en?'Review draft':'Revisar borrador')} onSaveAndContinue={()=>window.dispatchEvent(new CustomEvent('savia:word-reviewed',{detail:{projectId,jobId:state.wordId}}))}/></>}
    {state?.status==='ready'&&state.economicId&&<a className="web-autopilot-download-link" href={`/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(state.economicId)}/artifact`} download>{en?'Download economic offer form':'Descargar formulario de oferta económica'}</a>}
    {failed&&<span role="alert">{en?'Could not update automatic preparation.':'No se pudo actualizar la preparación automática.'}</span>}
  </div>;
}
