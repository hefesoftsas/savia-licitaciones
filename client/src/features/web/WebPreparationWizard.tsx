import { WebAutomaticPreparation } from './WebAutomaticPreparation';
import {useWebRouteDetail} from './useWebRouteDetail';
import WebWordDocument from './WebWordDocument';
import {createPreparationRefresh,preparationProgress,preparationBlocker} from './preparation-progress.mjs';
import {request} from './api.mjs';
import WebJobQuestions, {type Question} from './WebJobQuestions';
import {WebPreparationHelp} from './WebPreparationHelp';
import RupPdfPreview from '@/shared/ui/RupPdfPreview';
import {lazy,Suspense,cloneElement,useEffect,useRef,useState,type ReactElement,type ReactNode} from 'react';
import { ArrowLeft, ArrowRight, Eye, FileText, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Pencil, RefreshCw, Settings, Upload } from 'lucide-react';
import {WizardActionButton as Button} from './WizardActionButton';
import {Input} from '@/shared/ui/primitives/input';

const WordCanvas = lazy(() => import('./WebWordCanvas'));
type File={id:string;name:string;deleting?:number|boolean};
type Props={automaticConsent?:boolean;automaticDirty?:boolean;onAutomaticPlanChange?:()=>void;projectId:string;language:'es'|'en';files:File[];selectedFiles:string[];onFiles:(ids:string[])=>void;credentials:{id:string;provider:string;model:string}[];credential:string;onCredential:(id:string)=>void;onDocuments:()=>void;analysis:ReactNode;outline:ReactNode;facts:ReactNode;plan:ReactNode;enabled:boolean;deliveryRequest:number;routeStep:number|null;onRouteStep:(step:number)=>void;jobs:{kind:string;state:string;artifactState?:string;payload:unknown}[]};
function SourceReader({projectId,file,en}:{projectId:string;file:File|undefined;en:boolean}){
 const [source,setSource]=useState<{bytes?:Uint8Array;text?:string}>({}),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const extension=file?.name.split('.').pop()?.toLowerCase(),supported=['pdf','txt','md','markdown','docx'].includes(extension||'');
 useEffect(()=>{setSource({});setFailed(false);setLoading(false);if(!file||!supported)return;const controller=new AbortController();setLoading(true);void(async()=>{try{const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(file.id)}`,{signal:controller.signal});if(!response.ok)throw Error();const buffer=await response.arrayBuffer();if(controller.signal.aborted)return;if(extension==='pdf'){setSource({bytes:new Uint8Array(buffer)});}else if(extension==='docx'){setSource({bytes:new Uint8Array(buffer)});}else setSource({text:new TextDecoder().decode(buffer)});}catch{if(!controller.signal.aborted)setFailed(true);}finally{if(!controller.signal.aborted)setLoading(false);}})();return()=>{controller.abort();};},[projectId,file?.id,extension,supported,retry]);
 if(!file)return <p className="web-wizard-reader-empty">{en?'Choose a document to read it here.':'Elige un documento para leerlo aquí.'}</p>;
 return <div className="web-wizard-reader-body">{loading&&<p role="status">{en?'Opening document…':'Abriendo documento…'}</p>}{failed&&<div role="alert"><p>{en?'Could not open this document.':'No se pudo abrir este documento.'}</p><Button icon={RefreshCw} iconOnly variant="outline" onClick={()=>setRetry(value=>value+1)}>{en?'Retry':'Reintentar'}</Button></div>}{!supported&&<p>{en?'Preview is not available for this format. Download it to read it.':'Este formato no tiene vista previa. Descárgalo para leerlo.'}</p>}{source.bytes&&extension==='pdf'&&<RupPdfPreview key={file.id} bytes={source.bytes} en={en}/>}{source.bytes&&extension==='docx'&&<div className="web-source-word"><WebWordDocument key={file.id} language={en?'en':'es'} name={file.name} url={`/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(file.id)}`} label={en?'View Word document':'Ver documento Word'}/><div className="web-source-word-preview"><Suspense fallback={<p>{en?'Opening Word…':'Abriendo Word…'}</p>}><WordCanvas bytes={source.bytes} name={file.name} language={en?'en':'es'}/></Suspense></div></div>}{source.text!==undefined&&<><small>{en?'Text preview; original formatting is available in the download.':'Vista de texto; el formato original se conserva en la descarga.'}</small><pre>{source.text|| (en?'No readable text found.':'No se encontró texto legible.')}</pre></>}{(!supported||failed)&&<a href={`/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(file.id)}`}>{en?'Download document':'Descargar documento'}</a>}</div>;
}
export function WebPreparationWizard({automaticConsent=false,automaticDirty=false,onAutomaticPlanChange,projectId,language,files,selectedFiles,onFiles,credentials,credential,onCredential,onDocuments,analysis,outline,facts,plan,enabled,deliveryRequest,routeStep,onRouteStep,jobs}:Props){
 const en=language==='en',[step,setStep]=useState(routeStep??0),[preview,setPreview]=useState(''),[sourceByStep,setSourceByStep]=useState<Record<number,boolean>>({}),[query,setQuery]=useState('');const root=useRef<HTMLDivElement>(null),lastDeliveryRequest=useRef(deliveryRequest);
 const available=files.filter(file=>!file.deleting&&!/\.zip$/i.test(file.name)),file=available.find(file=>file.id===preview)||available.find(file=>selectedFiles.includes(file.id))||available[0];
 const [linkedExpanded,linkExpanded]=useWebRouteDetail('expanded',['yes','no'],'no');
 const [narrow,setNarrow]=useState(false),[expandedWizard,setExpandedWizard]=useState(linkedExpanded==='yes'),[guideMessage,setGuideMessage]=useState('');
 useEffect(()=>setExpandedWizard(linkedExpanded==='yes'),[linkedExpanded]);
 useEffect(()=>{setGuideMessage('');},[step,projectId]);
 const showSource=sourceByStep[step]??(!narrow&&step<2);
 const setShowSource=(value:boolean|((previous:boolean)=>boolean))=>setSourceByStep(current=>({...current,[step]:typeof value==='function'?value(showSource):value}));
 useEffect(()=>setSourceByStep({}),[projectId]);
 useEffect(()=>{const media=window.matchMedia('(max-width:700px)');const update=()=>{setNarrow(media.matches);};update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const [pendingQuestions,setPendingQuestions]=useState<Question[]>([]);
 const [snapshot,setSnapshot]=useState<any>(null),[progressError,setProgressError]=useState(false),[resumeKey,setResumeKey]=useState(0);
 const touched=useRef(false),liveInputs=useRef({selectedFiles,jobs});liveInputs.current={selectedFiles,jobs};
 useEffect(()=>{
  if(!enabled)return;
  let live=true,first=true;
  touched.current=routeStep!==null;
  const load=createPreparationRefresh(async isCurrent=>{
   if(!live)return;
   try{
    const [analysis,outline,facts,plan]=await Promise.all([
     request<any>(`/api/projects/${projectId}/technical-analyses`),
     request<any>(`/api/projects/${projectId}/technical-outline`),
     request<any>(`/api/projects/${projectId}/technical-facts`),
     request<any>(`/api/projects/${projectId}/technical-plan`),
    ]);
    if(!live||!isCurrent())return;
    const value={analyses:analysis.analyses,outline,facts,plan};
    setSnapshot(value);
    setProgressError(false);
    if(first&&!touched.current){
     setStep(preparationProgress({...value,...liveInputs.current}).resume);
     setResumeKey(value=>value+1);
    }
    first=false;
   }catch{
    if(live&&isCurrent())setProgressError(true);
   }
  });
  const changed=(event:Event)=>{
   if((event as CustomEvent).detail?.projectId===projectId)void load(true);
  };
  window.addEventListener('savia:preparation-changed',changed);
  void load();
  const timer=window.setInterval(()=>void load(),10000);
  return()=>{
   live=false;
   window.clearInterval(timer);
   window.removeEventListener('savia:preparation-changed',changed);
  };
 },[projectId,enabled]);
 useEffect(()=>{const reviewed=(event:Event)=>{if((event as CustomEvent).detail?.projectId===projectId){touched.current=true;setStep(5);onRouteStep(5);}};window.addEventListener('savia:word-reviewed',reviewed);return()=>window.removeEventListener('savia:word-reviewed',reviewed);},[projectId]);
 const progress=snapshot?preparationProgress({...snapshot,selectedFiles,jobs}):null;
 const chooseStep=(value:number)=>{touched.current=true;setStep(value);onRouteStep(value);};
 useEffect(()=>{if(routeStep!==null&&routeStep!==step){touched.current=true;setStep(routeStep);}},[routeStep]);
 useEffect(()=>{if(enabled&&routeStep===null&&snapshot)onRouteStep(step);},[enabled,routeStep,snapshot,step,onRouteStep]);
 const labels=en?['Documents','Analysis','Outline','Facts','Draft','Delivery']:['Pliegos','Análisis','Índice','Hechos','Redacción','Entrega'];
 const descriptions=en?['Choose the tender documents and read them before continuing.','Review and accept the project summary, scoring criteria and response requirements.','Review the chapter selection, then develop the complete outline.','Confirm the company and project facts before drafting.','Generate, review and save the content of each chapter.','Review the saved proposal and download it as a Word document.']:['Elige los pliegos y anexos que usarás para preparar la oferta.','Revisa y acepta el resumen, los criterios técnicos y los requisitos de respuesta.','Revisa los capítulos y desarrolla el índice completo.','Confirma los datos de la empresa y del proyecto antes de redactar.','Genera, revisa y guarda el contenido de cada capítulo.','Revisa la propuesta guardada y descárgala en Word.'];
 useEffect(()=>{root.current?.querySelectorAll<HTMLElement>('.web-wizard-step:not([hidden]) > details:not([data-optional]), .web-wizard-step:not([hidden]) > fieldset > details').forEach(node=>node.setAttribute('open',''));},[step,enabled]);
 useEffect(()=>{if(deliveryRequest!==lastDeliveryRequest.current){lastDeliveryRequest.current=deliveryRequest;setStep(5);onRouteStep(5);}},[deliveryRequest]);
 const ready=preparationBlocker(step,snapshot?{...snapshot,jobs}:null,selectedFiles)===null;
 const blocker=preparationBlocker(step,snapshot?{...snapshot,jobs}:null,selectedFiles);
 const canGuideAnalysis=blocker==='analyses'&&snapshot&&['project-overview','technical-score','response-requirements'].some(category=>!snapshot.analyses?.some((item:{category:string;current:boolean})=>item.category===category&&item.current));
 const blockerText:Record<string,string>=en?{
  analyses:'Generate and accept the three analyses: overview, scoring and requirements.', documents:'Select at least one document to continue.', 'document-limit':'Select up to 50 documents.', loading:'Checking the saved proposal…', facts:'Complete and confirm the facts before continuing.', 'facts-before-draft':'There are facts still pending. Complete and confirm them first.', outline:'Create and apply the outline before drafting.', drafts:'Review your Word draft and choose “Save and continue” in the editor.', 'pending-values':'Some chapters still contain pending values. Complete and save them before delivery.'
 }:{
  analyses:'Genera y acepta los tres análisis: resumen, criterios y requisitos.', documents:'Selecciona al menos un documento para continuar.', 'document-limit':'Selecciona un máximo de 50 documentos.', loading:'Comprobando la propuesta guardada…', facts:'Completa y confirma los datos antes de continuar.', 'facts-before-draft':'Hay datos pendientes. Complétalos y confírmalos primero.', outline:'Crea y aplica el índice antes de redactar.', drafts:'Revisa el borrador Word y pulsa «Guardar y continuar» en el editor.', 'pending-values':'Hay capítulos con datos pendientes. Complétalos y guárdalos antes de la entrega.'
 };
 if(blocker==='drafts'&&jobs.find(job=>job.kind==='technical-plan.generate-batch'&&['failed','interrupted','cancelled'].includes(job.state)))blockerText.drafts=en?'Resume drafting to complete the remaining chapters.':'Reanuda la redacción para completar los capítulos pendientes.';
 if(blocker==='outline'&&pendingQuestions.length)blockerText.outline=en?'Answer the runner’s question to continue.':'Responde la pregunta del runner para continuar.';
 if(blocker==='analyses'&&snapshot){
  const missing=['project-overview','technical-score','response-requirements'].map((category,index)=>snapshot.analyses?.some((item:{category:string;current:boolean})=>item.category===category&&item.current)?'':(en?['overview','scoring','requirements']:['resumen','criterios','requisitos'])[index]).filter(Boolean);
  const running=jobs.some(job=>job.kind==='technical-plan.analyze'&&['queued','running'].includes(job.state));
  blockerText.analyses=missing.length?(en?`To continue, generate, review and accept: ${missing.join(', ')}.`:`Para continuar, genera, revisa y acepta: ${missing.join(', ')}.`):(running?(en?'The three analyses are accepted. Wait for the analysis in progress to finish.':'Los tres análisis están aceptados. Espera a que termine el análisis en curso.'):(en?'Checking the analyses…':'Comprobando los análisis…'));
 }
 const revealPending=()=>{
  if(narrow&&showSource)setShowSource(false);
  if(blocker==='analyses'&&snapshot){
   const category=['project-overview','technical-score','response-requirements'].find(name=>!snapshot.analyses?.some((item:{category:string;current:boolean})=>item.category===name&&item.current));
   if(category)window.dispatchEvent(new CustomEvent('savia:guide-analysis',{detail:{projectId,category}}));
   return;
  }
  if(blocker==='facts-before-draft'){chooseStep(3);return;}
  if(step===4&&jobs.some(job=>job.kind==='technical-plan.generate-batch'&&['queued','running'].includes(job.state))){const activity=root.current?.querySelector<HTMLElement>('.web-wizard-batch .web-batch-job');activity?.scrollIntoView({block:'center'});setGuideMessage(en?'Wait for the runner to finish drafting the chapters.':'Espera a que el runner termine de redactar los capítulos.');return;}
  if(blocker==='outline'){if(step!==2)chooseStep(2);else window.dispatchEvent(new CustomEvent('savia:guide-outline',{detail:{projectId}}));return;}
  if(blocker==='facts'&&jobs.some(job=>job.kind==='technical-plan.generate-facts'&&['queued','running'].includes(job.state))){setGuideMessage(en?'Wait for the runner to finish preparing the facts.':'Espera a que el runner termine de preparar los datos.');return;}
  const findTarget=()=>{
   const scope=root.current?.querySelector<HTMLElement>('.web-wizard-step:not([hidden])');if(!scope)return null;
   if(step===4){const freshBatch=scope.querySelector<HTMLDetailsElement>('.web-batch-new');const hasWord=Array.from(scope.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).some(button=>/abrir y editar word|open and edit word/i.test(button.textContent||'')&&button.getClientRects().length>0);if(freshBatch&&!hasWord)freshBatch.open=true;}
   const controls=Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')).filter(element=>element.getClientRects().length>0&&!element.closest('[hidden]'));
   if(blocker==='documents'||blocker==='document-limit')return controls.find(element=>element.matches('input[type="checkbox"]'))||controls.find(element=>/subir|upload/i.test(element.textContent||''))||null;
   const priorities=blocker==='facts'?[/siguiente pendiente|next pending/i,/guardar hechos|save facts/i,/confirmar datos|confirm data/i,/editar datos|edit data|escribir manualmente|enter manually/i,/generar datos|generate data|volver a generar|generate again/i]:[/reanudar redacción|resume drafting/i,/abrir y editar word|open and edit word/i,/abrir.*word|open.*word/i,/generar capítulos|generate chapters/i,/generar borrador|generate.*draft/i,/siguiente pendiente|next pending/i];
   for(const pattern of priorities){const target=controls.find(element=>pattern.test(`${element.getAttribute('aria-label')||''} ${element.textContent||''}`));if(target)return target;}
   return null;
  };
  window.setTimeout(()=>{const target=findTarget();if(!target){setGuideMessage(blocker?blockerText[blocker]:'');return;}const name=target.getAttribute('aria-label')||target.textContent?.trim();setGuideMessage(name?(en?`Next: ${name}.`:`Siguiente paso: ${name}.`):(blocker?blockerText[blocker]:''));target.scrollIntoView({block:'center',inline:'nearest'});target.focus({preventScroll:true});},100);
 };
 return <div className={`web-preparation-wizard${expandedWizard?' web-wizard-fullscreen':''}`} data-step={step} ref={root}>
  <nav className="web-wizard-steps" aria-label={en?'Bid preparation steps':'Pasos para preparar la oferta'}>{labels.map((label,index)=><button key={label} type="button" data-status={progress?.states[index]||'unknown'} aria-current={step===index?'step':undefined} title={progress?.states[index]==='complete'?(en?'Completed':'Completado'):progress?.states[index]==='running'?(index===step&&pendingQuestions.length?(en?'Waiting for your answer':'Esperando tu respuesta'):(en?'Runner working':'Runner trabajando')):progress?.states[index]==='current'?(en?'Next pending step':'Paso pendiente actual'):(en?'Pending':'Pendiente')} onClick={()=>chooseStep(index)}><span>{progress?.states[index]==='complete'?'✓':index+1}</span>{label}</button>)}</nav>
  <WebAutomaticPreparation projectId={projectId} language={language} fileIds={selectedFiles} credentialId={credential}
    consent={automaticConsent} dirty={automaticDirty} enabled={enabled} onStep={value=>{chooseStep(value);if(value>=3)onAutomaticPlanChange?.();
      window.dispatchEvent(new CustomEvent('savia:preparation-changed',{detail:{projectId}}));}}/>
  {progressError&&<p role="status">{en?'Could not refresh progress. You can still navigate the steps.':'No se pudo actualizar el progreso. Puedes seguir navegando por los pasos.'}</p>}
  <div className="web-wizard-heading"><div><h3>{labels[step]}</h3><p>{descriptions[step]}</p></div><div className="web-wizard-heading-actions">{(expandedWizard||![1,2].includes(step))&&<Button icon={expandedWizard?Minimize2:Maximize2} iconOnly variant="ghost" onClick={()=>{const next=!expandedWizard;setExpandedWizard(next);linkExpanded(next?'yes':'no');}}>{expandedWizard?(en?'Exit expanded view':'Cerrar vista ampliada'):(en?'Expand workspace':'Ampliar espacio de trabajo')}</Button>}<WebPreparationHelp step={step} labels={labels} language={language} blocker={blocker ? blockerText[blocker] : undefined}/><Button icon={showSource?PanelLeftClose:PanelLeftOpen} iconOnly variant="ghost" aria-expanded={showSource} onClick={()=>setShowSource(value=>!value)}>{showSource?(en?'Hide tender document':'Ocultar pliego'):(en?'Show tender document':'Mostrar pliego')}</Button></div></div>
  {!credential&&<p role="status">{en?'Configure your account model to use AI.':'Configura el modelo de la cuenta para usar la IA.'} <Button icon={Settings} variant="link" onClick={()=>onCredential('')}>{en?'Settings':'Configuración'}</Button></p>}
  <div className={`web-wizard-columns${showSource?'':' without-reader'}`}>
   {showSource&&<aside className="web-wizard-reader"><label><FileText size={16}/><span className="sr-only">{en?'Visible document':'Documento visible'}</span><select value={file?.id||''} onChange={event=>setPreview(event.target.value)}>{!available.length&&<option value="">{en?'No documents':'Sin documentos'}</option>}{available.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{enabled&&<SourceReader projectId={projectId} file={file} en={en}/>}</aside>}
   <div className="web-wizard-work" inert={narrow&&showSource?true:undefined}>
    {enabled&&<WebJobQuestions key={projectId} projectId={projectId} language={language} onQuestionsChange={setPendingQuestions}/>}
    <section className="web-wizard-step" hidden={step!==0}><Input aria-label={en?'Find tender document':'Buscar pliego'} placeholder={en?'Find a document…':'Buscar documento…'} value={query} onChange={event=>setQuery(event.target.value)}/><p>{en?`${selectedFiles.length} selected · up to 50`:`${selectedFiles.length} seleccionados · máximo 50`}</p><div className="web-wizard-source-list">{available.filter(file=>file.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item=><div key={item.id}><label><input type="checkbox" checked={selectedFiles.includes(item.id)} onChange={event=>onFiles(event.target.checked?[...selectedFiles,item.id]:selectedFiles.filter(id=>id!==item.id))}/><span>{item.name}</span></label><Button icon={Eye} iconOnly size="sm" variant="ghost" aria-label={`${en?'Read':'Leer'} ${item.name}`} onClick={()=>{setPreview(item.id);setShowSource(true);}}>{en?'Read':'Leer'}</Button></div>)}</div>{!available.length&&<p>{en?'Upload your tender documents to start.':'Sube los pliegos para comenzar.'}</p>}<Button icon={Upload} variant="outline" onClick={onDocuments}>{en?'Upload or manage documents':'Subir o gestionar documentos'}</Button></section>
    <section className="web-wizard-step" hidden={step!==1}>{cloneElement(analysis as ReactElement<{resumeKey?:number}>,{resumeKey})}</section><section className="web-wizard-step" hidden={step!==2}>{cloneElement(outline as ReactElement<{resumeKey?:number;pendingQuestions?:Question[]}>,{resumeKey,pendingQuestions})}</section><section className="web-wizard-step" hidden={step!==3}>{facts}</section>
    {step===5&&<div className="web-delivery-guide"><div className="web-draft-step-heading"><span className="web-draft-step-number">1</span><div><strong>{en?'Review your Word':'Revisa tu Word'}</strong><p>{en?'Open the proposal, complete the pending information and save your changes.':'Abre la propuesta, completa los datos pendientes y guarda los cambios.'}</p></div></div><div className="web-draft-step-heading"><span className="web-draft-step-number">2</span><div><strong>{en?'Download the proposal':'Descarga la propuesta'}</strong><p>{en?'Use the download button next to the Word document.':'Usa el botón de descarga junto al documento Word.'}</p></div></div></div>}<section className="web-wizard-step" hidden={step!==4&&step!==5}>{plan}</section>
   </div>
  </div>
  <footer className="web-wizard-footer">{!ready&&blocker&&<div className="web-wizard-blocker" id="wizard-continue-reason" role="status"><span>{guideMessage||blockerText[blocker]}</span></div>}<Button variant="outline" disabled={step===0} onClick={()=>chooseStep(step-1)}><ArrowLeft size={16}/>{en?'Previous':'Anterior'}</Button><span>{en?`Step ${step+1} of 6`:`Paso ${step+1} de 6`}</span>{step<5?<Button disabled={!ready&&(blocker==='loading'||blocker==='analyses'&&!canGuideAnalysis)} aria-describedby={!ready?"wizard-continue-reason":undefined} onClick={()=>ready?chooseStep(step+1):revealPending()}>{en?'Continue':'Continuar'}<ArrowRight size={16}/></Button>:<Button icon={Pencil} variant="outline" onClick={()=>chooseStep(4)}>{en?'Back to editing':'Volver a editar'}</Button>}</footer>
 </div>;
}
