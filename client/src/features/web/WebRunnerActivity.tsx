import {Popover,PopoverTrigger,PopoverContent,Close as PopoverClose} from '@/shared/ui/primitives/popover';
import WebJobActivity from './WebJobActivity';
import type {ReactNode} from 'react';
import {CircleHelp, MonitorCheck, MonitorOff, Play} from 'lucide-react';
import {Button} from '@/shared/ui/primitives/button';
import {useEffect,useState} from 'react';
import {request} from './api.mjs';

type Runner={lastSeenAt:string|null;executionMode?:string;runningJobs?:number};
type ActiveJob={id:string;projectId:string|null;projectTitle:string|null;kind:string;state:string;progress:string|null;runnerName:string};
type Props={menu?:ReactNode;onMenuOpenChange?:(open:boolean)=>void;language:'es'|'en';runners:Runner[]|null;now:number;onOpen:()=>void;compact?:boolean};
const recentWindow=6*60*1000;
export function RunnerActivityView({language,runners,now,onOpen,compact=false,menu,onMenuOpenChange}:Props){
 if(compact){
  const en=language==='en',local=runners?.filter(r=>r.executionMode===undefined||r.executionMode==='local');
  const online=local?.filter(r=>{const last=Date.parse(r.lastSeenAt||'');return Number.isFinite(last)&&now-last<recentWindow;})||[];
  const running=local?.reduce((total,r)=>total+(r.runningJobs||0),0)||0;
  const state=!runners?'unknown':running?'running':online.length?'online':'offline';
  const label=state==='unknown'?(en?'Runner status unavailable · open connection settings':'Estado del runner sin confirmar · abrir conexión'):state==='running'?(en?`Runner executing ${running} task(s)`:`Runner ejecutando ${running} tarea(s)`):state==='online'?(en?'Runner active · no tasks running':'Runner activo · sin tareas en ejecución'):(en?'Runner inactive · install or connect':'Runner sin actividad · instalar o conectar');
  const Icon=state==='unknown'?CircleHelp:state==='running'?Play:state==='online'?MonitorCheck:MonitorOff;
  const trigger=<Button variant="ghost" size="icon" className="web-runner-indicator" data-state={state} aria-label={label} title={label} onClick={menu?undefined:onOpen}><Icon size={18} aria-hidden="true"/><span className="web-runner-indicator-dot" aria-hidden="true"/></Button>;
  return menu?<Popover onOpenChange={onMenuOpenChange}><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent align="end" className="web-runner-menu">{menu}</PopoverContent></Popover>:trigger;
 }
 if(!runners)return null;
 const localRunners=runners.filter(runner=>runner.executionMode===undefined||runner.executionMode==='local');
 const en=language==='en',recent=localRunners.some(runner=>{const time=Date.parse(runner.lastSeenAt||'');return Number.isFinite(time)&&now-time<recentWindow;});
 if(recent)return null;
 return <aside className="web-notice web-runner-notice" role="status"><strong>{localRunners.length?(en?'No recent runner activity':'Sin actividad reciente del runner'):(en?'Connect a runner':'Conecta un runner')}</strong><p>{localRunners.length?(en?'No activity has been reported in the last six minutes. Tasks wait for a compatible runner.':'No se ha registrado actividad en los últimos seis minutos. Las tareas esperan un runner compatible.'):(en?'Tasks need a compatible runner on your machine.':'Las tareas necesitan un runner compatible en tu máquina.')}</p><button type="button" className="web-link" onClick={onOpen}>{en?'View runners':'Ver runners'}</button></aside>;
}
export default function WebRunnerActivity({language,onOpen,compact=false}:{compact?:boolean;language:'es'|'en';onOpen:()=>void}){
 const [selectedJob,setSelectedJob]=useState<ActiveJob|null>(null);
 const [menuOpen,setMenuOpen]=useState(false),[activeJobs,setActiveJobs]=useState<ActiveJob[]>([]),[queuedJobs,setQueuedJobs]=useState(0);
 const [runners,setRunners]=useState<Runner[]|null>(null),[now,setNow]=useState(0);
 useEffect(()=>{let active=true,running=false;const refresh=async()=>{if(running)return;running=true;try{const data=await request<{runners:Runner[];queuedJobs?:number;activeJobs?:ActiveJob[];serverTime:string}>('/api/runners'),serverNow=Date.parse(data.serverTime);if(active){setRunners(Number.isFinite(serverNow)?data.runners:null);setNow(serverNow);setActiveJobs(data.activeJobs||[]);setQueuedJobs(data.queuedJobs??0);}}catch{if(active)setRunners(null);}finally{running=false;}};void refresh();const timer=window.setInterval(()=>void refresh(),menuOpen?3000:compact?15000:60000);return()=>{active=false;window.clearInterval(timer);};},[compact,menuOpen]);
 const en=language==='en';
 const taskName=(kind:string)=>({ 'technical-plan.generate-batch':en?'Drafting chapters':'Redacción de capítulos','technical-plan.generate-section':en?'Drafting a chapter':'Redacción de un capítulo','technical-plan.generate-facts':en?'Preparing project facts':'Preparación de hechos','technical-plan.analyze':en?'Analyzing tender documents':'Análisis del pliego','technical-plan.export-word':en?'Preparing Word':'Preparación de Word','tender-chat.send':en?'Document query':'Consulta de documentos'} as Record<string,string>)[kind]||(en?'Task':'Tarea');
 const menu=compact?<div><strong>{en?'Runner activity':'Actividad del runner'}</strong><p role="status">{runners?(en?`${activeJobs.length} running · ${queuedJobs} in the shared queue`:`${activeJobs.length} en ejecución · ${queuedJobs} en la cola compartida`):(en?'Status unavailable':'Estado no disponible')}</p><div className="web-runner-menu-tasks">{activeJobs.length?activeJobs.map(job=><section key={job.id}><strong>{taskName(job.kind)}</strong><p>{job.projectTitle||(en?'Account task':'Tarea de la cuenta')}</p><small>{job.runnerName}{job.progress==='ocr'?(en?' · Reading scanned documents':' · Leyendo documentos escaneados'):''}</small>{job.projectId&&<Button variant="outline" size="sm" onClick={()=>setSelectedJob(job)}>{en?'View activity':'Ver actividad'}</Button>}</section>):<p role="status">{en?'No tasks running.':'No hay tareas en ejecución.'}</p>}</div><PopoverClose asChild><Button variant="ghost" size="sm" onClick={onOpen}>{en?'Connect or configure runner':'Conectar o configurar runner'}</Button></PopoverClose></div>:undefined;
 return <><RunnerActivityView menu={menu} onMenuOpenChange={setMenuOpen} language={language} runners={runners} now={now} onOpen={onOpen} compact={compact}/>{selectedJob?.projectId&&<WebJobActivity key={selectedJob.id} projectId={selectedJob.projectId} jobId={selectedJob.id} language={language} initiallyOpen hideTrigger onClose={()=>setSelectedJob(null)}/>}</>;
}
