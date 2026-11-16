import {WebLoading} from './WebLoading';
import {WebProjectHelp} from './WebProjectHelp';
import {ArrowLeft, ArrowRight, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, RotateCcw, Save, Trash2} from 'lucide-react';
import RupPdfPreview from '@/shared/ui/RupPdfPreview';
import WebWordDocument from './WebWordDocument';
import WebTextEditor from './WebTextEditor';
import WebLibraryImageReferences from './WebLibraryImageReferences';
import WebJobQuestions from './WebJobQuestions';
import WebFeasibilitySourceImages from './WebFeasibilitySourceImages';
import WebFeasibilityKnowledge from './WebFeasibilityKnowledge';
import WebFeasibilityContent from './WebFeasibilityContent';
import WebFeasibilityParameters from './WebFeasibilityParameters';
import WebFeasibilityOutlineGeneration from './WebFeasibilityOutlineGeneration';
import WebFeasibilityAnalysis from './WebFeasibilityAnalysis';
import WebFeasibilityExtractions from './WebFeasibilityExtractions';
import WebFeasibilitySources from './WebFeasibilitySources';
import WebFeasibilityExports from './WebFeasibilityExports';
import {lazy,Suspense,useCallback,useEffect,useState} from 'react';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import {Input} from '@/shared/ui/primitives/input';
import AppDialog from '@/shared/ui/AppDialog';
import {useToast} from '@/shared/ui/ToastProvider';
import {useFeasibilityRequest,useFeasibilityPath,FeasibilityScope} from './FeasibilityScope';
import {editOutline,prepareOutlineSave} from './feasibility-outline.mjs';

const WordCanvas=lazy(()=>import('./WebWordCanvas'));

type Step='materials'|'sources'|'analysis'|'outline'|'parameters'|'content';
type StepStatus='complete'|'running'|'current'|'pending';
type Node={id:string;title:string;description?:string;content?:string;children?:Node[];[key:string]:unknown};
type Source={id:string;fileName:string;sourceType?:'original';sourceKey?:string;expected?:boolean;reason?:string};
export type FeasibilityState={step:Step;projectInfo:Record<string,string>;sourceFiles:Source[];analysisMarkdown:string;outlineTemplate:string;targetWords:number;referenceDocumentIds:string[];keyParametersMarkdown:string;outlineData:{outline:Node[];[key:string]:unknown}|null;importedTasks?:{type:string;status:string}[];[key:string]:unknown};
type State=FeasibilityState;
type Availability={sourceKey:string;available:boolean;deleted?:boolean;textAvailable?:boolean};
type ProjectDefaults={projectName?:string;location?:string;constructionContent?:string;contractingEntity?:string};
const steps:Step[]=['materials','sources','analysis','outline','parameters','content'];
const labels={es:['Datos del proyecto','Archivos del proyecto','Análisis','Índice','Parámetros clave','Contenido'],en:['Project info','Project files','Analysis','Outline','Key parameters','Content']};
const stepDescriptions:Record<Step,{es:string;en:string}>={
 materials:{es:'Revisa o completa la información base del proyecto; reutilizamos por defecto los datos disponibles de la oferta.',en:'Review or complete the project baseline details; available offer details are reused by default.'},
 sources:{es:'Reutiliza automáticamente los documentos cargados en la oferta o añade fuentes adicionales con extracción y OCR en el runner local.',en:'Automatically reuse the documents uploaded to the offer or add extra sources with extraction and OCR on the local runner.'},
 analysis:{es:'Analiza las fuentes y documentos de la oferta con el runner local y edita el diagnóstico de viabilidad.',en:'Analyze the offer documents and sources with the local runner and edit the feasibility diagnosis.'},
 outline:{es:'Define la plantilla, genera o ajusta la estructura con IA en el runner y organiza los capítulos.',en:'Choose the template, generate or adjust the structure with AI on the runner, and organize chapters.'},
 parameters:{es:'Consolida los parámetros técnicos, operativos y de inversión antes de redactar los capítulos.',en:'Consolidate technical, operational and investment parameters before drafting chapters.'},
 content:{es:'Genera, revisa y edita el contenido de cada capítulo y exporta el informe final en Word.',en:'Generate, review and edit each chapter and export the final Word report.'},
};
const templates=[['government','Inversión pública','Government investment'],['enterprise','Inversión empresarial','Enterprise investment'],['industrial','Industrial y manufactura','Industrial and manufacturing'],['hi_tech','Alta tecnología y digitalización','High-tech and digital'],['infrastructure','Infraestructura y servicios','Infrastructure and utilities'],['eco_environmental','Agroambiental y ecológico','Agriculture and environment'],['commercial_realestate','Comercial e inmobiliario','Commercial and real estate']] as const;
const fields=[['projectName','Nombre del proyecto','Project name'],['industry','Sector','Industry'],['constructionUnit','Entidad ejecutora','Implementing entity'],['location','Ubicación','Location'],['constructionContent','Descripción del proyecto','Project description'],['constructionPeriodYears','Años de construcción','Construction years'],['operationPeriodYears','Años de operación','Operation years'],['totalInvestment','Inversión total','Total investment'],['fundingSource','Fuente de financiación','Funding source']] as const;
const emptyState=():State=>({step:'materials',projectInfo:{projectName:'',projectType:'government',industry:'',constructionUnit:'',location:'',constructionContent:'',constructionPeriodYears:'',operationPeriodYears:'',totalInvestment:'',fundingSource:''},sourceFiles:[],analysisMarkdown:'',outlineTemplate:'government',targetWords:30000,referenceDocumentIds:[],keyParametersMarkdown:'',outlineData:null});
export function initialFeasibilityState(report:{state:State;version:number}|null,defaults?:ProjectDefaults){
 if(report)return {state:report.state,saved:report.state};
 const saved=emptyState();
 const projectInfo={...saved.projectInfo,...(defaults?.projectName?{projectName:defaults.projectName}:{}),...(defaults?.location?{location:defaults.location}:{}),...(defaults?.constructionContent?{constructionContent:defaults.constructionContent}:{})};
 return {state:{...saved,projectInfo},saved};
}
const validTitles=(nodes:Node[]):boolean=>nodes.every(node=>!!node.title.trim()&&validTitles(node.children||[]));
const hasContent=(nodes:Node[]):boolean=>nodes.some(node=>!!node.content||hasContent(node.children||[]));
const hasLeafContent=(nodes:Node[]):boolean=>nodes.some(node=>node.children?.length?hasLeafContent(node.children):!!String(node.content||'').trim());
const allLeavesHaveContent=(nodes:Node[]):boolean=>nodes.length>0&&nodes.every(node=>node.children?.length?allLeavesHaveContent(node.children):!!String(node.content||'').trim());
const clearContent=(nodes:Node[]):Node[]=>nodes.map(node=>({...node,content:'',...(node.children?{children:clearContent(node.children)}:{})}));
const updateNode=(nodes:Node[],id:string,content:string):Node[]=>nodes.map(node=>node.id===id?{...node,content}:node.children?{...node,children:updateNode(node.children,id,content)}:node);
export function prepareFeasibilitySave(state:State,saved:State):{kind:string;state:State}{
 if(JSON.stringify(state.projectInfo)!==JSON.stringify(saved.projectInfo)&&(!!state.analysisMarkdown||!!state.keyParametersMarkdown||!!state.outlineData))return {kind:'materials',state:{...state,analysisMarkdown:'',keyParametersMarkdown:'',outlineData:null,importedTasks:[]}};
 if(state.analysisMarkdown!==saved.analysisMarkdown&&(!!state.keyParametersMarkdown||!!state.outlineData))return {kind:'analysis',state:{...state,keyParametersMarkdown:'',outlineData:null,importedTasks:[]}};
 const outline=prepareOutlineSave(saved.outlineData?.outline||[],state.outlineData?.outline||[]);
 if(outline.kind==='edit')return {kind:'outline',state:{...state,keyParametersMarkdown:'',outlineData:state.outlineData?{...state.outlineData,outline:outline.nodes}:null,importedTasks:state.importedTasks?.filter(task=>!['feasibility-parameters','feasibility-content','feasibility-human-writing'].includes(task.type))}};
 if(state.keyParametersMarkdown!==saved.keyParametersMarkdown&&hasContent(state.outlineData?.outline||[]))return {kind:'parameters',state:{...state,outlineData:state.outlineData?{...state.outlineData,outline:clearContent(state.outlineData.outline)}:null,importedTasks:[]}};
 return {kind:'',state};
}

function statusLabel(status:StepStatus,en:boolean){
 if(status==='complete')return en?'Completed':'Completado';
 if(status==='running')return en?'Running':'En ejecución';
 if(status==='current')return en?'Current step':'Paso actual';
 return en?'Pending':'Pendiente';
}

function FeasibilitySourceReader({projectId,files,selectedId,onSelect,language}:{projectId:string;files:{id:string;name:string}[];selectedId:string;onSelect:(id:string)=>void;language:'es'|'en'}){
 const en=language==='en';
 const file=files.find(item=>item.id===selectedId)||files[0];
 const [source,setSource]=useState<{bytes?:Uint8Array;text?:string}>({}),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const extension=file?.name.split('.').pop()?.toLowerCase(),supported=['pdf','txt','md','markdown','docx'].includes(extension||'');
 const url=file?`/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(file.id)}`:'';
 useEffect(()=>{
  setSource({});setFailed(false);setLoading(false);
  if(!file||!supported)return;
  const controller=new AbortController();
  setLoading(true);
  void(async()=>{
   try{
    const response=await fetch(url,{signal:controller.signal});
    if(!response.ok)throw new Error();
    const buffer=await response.arrayBuffer();
    if(controller.signal.aborted)return;
    if(extension==='pdf'||extension==='docx')setSource({bytes:new Uint8Array(buffer)});
    else setSource({text:new TextDecoder().decode(buffer)});
   }catch{if(!controller.signal.aborted)setFailed(true);}
   finally{if(!controller.signal.aborted)setLoading(false);}
  })();
  return()=>controller.abort();
 },[projectId,file?.id,extension,supported,url,retry]);
 if(!file)return <aside className="web-wizard-reader"><p className="web-wizard-reader-empty">{en?'Choose a document to read it here.':'Elige un documento para leerlo aquí.'}</p></aside>;
 return <aside className="web-wizard-reader" aria-label={en?'Offer document reader':'Lector de documentos de la oferta'}>
  <div className="web-wizard-reader-head">
   <strong>{en?'Offer documents':'Documentos de la oferta'}</strong>
   <select value={file.id} aria-label={en?'Document to read':'Documento para leer'} onChange={event=>onSelect(event.target.value)}>
    {files.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
   </select>
  </div>
  <div className="web-wizard-reader-body">
   {loading&&<WebLoading message={en?'Opening document…':'Abriendo documento…'}/>}
   {failed&&<div role="alert"><p>{en?'Could not open this document.':'No se pudo abrir este documento.'}</p><Button icon={RefreshCw} iconOnly variant="outline" onClick={()=>setRetry(value=>value+1)}>{en?'Retry':'Reintentar'}</Button></div>}
   {!supported&&<p>{en?'Preview is not available for this format. Download it to read it.':'Este formato no tiene vista previa. Descárgalo para leerlo.'}</p>}
   {source.bytes&&extension==='pdf'&&<RupPdfPreview key={file.id} bytes={source.bytes} en={en}/>}
   {source.bytes&&extension==='docx'&&<div className="web-source-word"><WebWordDocument key={file.id} language={language} name={file.name} url={url} label={en?'View Word document':'Ver documento Word'}/><div className="web-source-word-preview"><Suspense fallback={<p>{en?'Opening Word…':'Abriendo Word…'}</p>}><WordCanvas bytes={source.bytes} name={file.name} language={language}/></Suspense></div></div>}
   {source.text!==undefined&&<><small>{en?'Text preview; original formatting is available in the download.':'Vista de texto; el formato original se conserva en la descarga.'}</small><pre>{source.text||(en?'No readable text found.':'No se encontró texto legible.')}</pre></>}
   {(!supported||failed)&&<a className="web-link" href={url}>{en?'Download document':'Descargar documento'}</a>}
  </div>
 </aside>;
}

export function FeasibilityEditor({state,language,sources,onChange,defaults,stepStatuses,hideNavigation=false}:{state:State;language:'es'|'en';sources:Availability[];onChange:(value:State)=>void;defaults?:ProjectDefaults;stepStatuses?:StepStatus[];hideNavigation?:boolean}){
 const feasibilityPath=useFeasibilityPath();
 const en=language==='en',set=(patch:Partial<State>)=>onChange({...state,...patch});
 const changeOutline=(operation:Parameters<typeof editOutline>[1])=>{const existing=state.outlineData||{outline:[]};set({outlineData:{...existing,outline:editOutline(existing.outline,operation)}});};
 const chapters=(nodes:Node[],depth=1):React.ReactNode=>nodes.map((node,index)=><section key={node.id} className="web-feasibility-chapter" style={{marginInlineStart:`${(depth-1)*16}px`}}>{state.step==='outline'?<><div className="web-feasibility-grid"><label>{en?'Title':'Título'}<Input value={node.title} onChange={event=>changeOutline({type:'edit',id:node.id,patch:{title:event.target.value}})} /></label><label>{en?'Writing focus':'Enfoque de redacción'}<textarea rows={2} value={node.description||''} onChange={event=>changeOutline({type:'edit',id:node.id,patch:{description:event.target.value}})} /></label></div><div className="web-feasibility-node-actions"><Button size="sm" type="button" variant="outline" disabled={index===0} onClick={()=>changeOutline({type:'move',id:node.id,delta:-1})} aria-label={`${en?'Move up':'Subir'} ${node.title}`}>↑</Button><Button size="sm" type="button" variant="outline" disabled={index===nodes.length-1} onClick={()=>changeOutline({type:'move',id:node.id,delta:1})} aria-label={`${en?'Move down':'Bajar'} ${node.title}`}>↓</Button>{depth<3&&<Button icon={Plus} size="sm" type="button" variant="outline" onClick={()=>changeOutline({type:'add-child',id:node.id,node:{id:crypto.randomUUID(),title:en?'New section':'Nueva sección',content:''}})}>{en?'Add subsection':'Añadir subsección'}</Button>}<Button icon={Trash2} iconOnly size="sm" type="button" variant="ghost" aria-label={`${en?'Remove':'Eliminar'} ${node.title}`} onClick={()=>changeOutline({type:'delete',id:node.id})}>{en?'Remove':'Eliminar'}</Button></div></>:<><div className="web-inline"><h3>{node.title}</h3><small className="web-feasibility-badge">{String(node.content||'').trim()?(en?'Drafted':'Redactado'):(en?'Pending':'Pendiente')}</small></div>{node.description&&<p className="web-feasibility-chapter-desc">{node.description}</p>}<WebTextEditor language={language} title={en?`Chapter content: ${node.title}`:`Contenido del capítulo: ${node.title}`} value={node.content||''} maxLength={200000} onChange={value=>state.outlineData&&set({outlineData:{...state.outlineData,outline:updateNode(state.outlineData.outline,node.id,value)}})} /></>}{chapters(node.children||[],depth+1)}</section>);
 return <div className="web-feasibility">{!hideNavigation&&<nav aria-label={en?'Report stages':'Etapas del informe'} className="web-wizard-steps web-feasibility-steps">{steps.map((step,index)=>{const status=stepStatuses?.[index]||(state.step===step?'current':'pending');return <button type="button" key={step} data-status={status} aria-current={state.step===step?'step':undefined} onClick={()=>set({step})}><span>{status==='complete'?'✓':index+1}</span><div><strong>{labels[language][index]}</strong><small>{statusLabel(status,en)}</small></div></button>;})}</nav>}<div className="web-stack web-feasibility-body">
 {state.step==='materials'&&<><h2>{labels[language][0]}</h2><p>{en?'We use the project details already available. Add other information only when you know it.':'Usamos los datos disponibles del proyecto. Completa los demás solo si los conoces.'}</p>{defaults?.contractingEntity&&<p className="web-feasibility-callout">{en?'Contracting entity in SECOP:':'Entidad contratante en SECOP:'} <strong>{defaults.contractingEntity}</strong>. {en?'Confirm whether it is also the implementing entity.':'Confirma si también es la entidad ejecutora.'}{!state.projectInfo.constructionUnit.trim()&&<Button type="button" size="sm" variant="link" onClick={()=>set({projectInfo:{...state.projectInfo,constructionUnit:defaults.contractingEntity||''}})}>{en?'Use as implementing entity':'Usar como entidad ejecutora'}</Button>}</p>}{defaults&&(['projectName','location','constructionContent'] as const).some(key=>!state.projectInfo[key]?.trim()&&defaults[key])&&<div className="web-inline"><Button type="button" size="sm" variant="outline" onClick={()=>set({projectInfo:{...state.projectInfo,...Object.fromEntries((['projectName','location','constructionContent'] as const).filter(key=>!state.projectInfo[key]?.trim()&&defaults[key]).map(key=>[key,defaults[key]||'']))}})}>{en?'Fill missing project details':'Completar datos disponibles'}</Button></div>}<div className="web-feasibility-grid">{fields.map(([key,es,english])=><label key={key} className={key==='constructionContent'?'web-feasibility-span-2':undefined}>{en?english:es}{key==='constructionContent'&&defaults?.constructionContent&&<small> {en?'(initially the SECOP contract purpose)':'(inicialmente, el objeto de SECOP)'}</small>}<Input value={state.projectInfo[key]||''} onChange={event=>set({projectInfo:{...state.projectInfo,[key]:event.target.value}})} /></label>)}<label>{en?'Project type':'Tipo de proyecto'}<select value={state.projectInfo.projectType} onChange={event=>set({projectInfo:{...state.projectInfo,projectType:event.target.value}})}><option value="government">{en?'Government':'Público'}</option><option value="enterprise">{en?'Enterprise':'Empresarial'}</option></select></label></div></>}
 {state.step==='sources'&&<><h2>{labels[language][1]}</h2><p>{en?'Downloaded files may be originals or extracted desktop texts.':'Los archivos descargables pueden ser originales o textos extraídos del escritorio.'}</p>{state.sourceFiles.length?state.sourceFiles.map(source=>{const availability=sources.find(item=>item.sourceKey===source.sourceKey),available=availability?.available;return <div className="web-feasibility-source" key={source.id}><span>{source.fileName}</span><div className="web-inline">{available?<a className="web-link" href={feasibilityPath(`/api/feasibility-report/sources/${encodeURIComponent(source.sourceKey||'')}`)} download>{source.sourceType==='original'?(en?'Download original':'Descargar original'):(en?'Download text':'Descargar texto')}</a>:<span>{en?'Unavailable':'No disponible'}</span>}{source.sourceType==='original'&&availability?.textAvailable&&<a className="web-link" href={feasibilityPath(`/api/feasibility-report/sources/${encodeURIComponent(source.sourceKey||'')}/text`)} download>{en?'Download extracted text':'Descargar texto extraído'}</a>}</div>{source.sourceType==='original'&&source.sourceKey&&availability?.textAvailable&&<WebFeasibilitySourceImages language={language} sourceKey={source.sourceKey} />}</div>}):<p>{en?'No additional feasibility sources imported yet.':'Aún no hay fuentes adicionales importadas en el informe.'}</p>}</>}
 {state.step==='analysis'&&<><h2>{labels[language][2]}</h2><WebTextEditor language={language} title={en?'Source analysis':'Análisis de las fuentes'} value={state.analysisMarkdown} maxLength={200000} onChange={analysisMarkdown=>set({analysisMarkdown})} /></>}
 {state.step==='outline'&&<><h2>{labels[language][3]}</h2><div className="web-feasibility-grid"><label>{en?'Outline template':'Plantilla de índice'}<select value={state.outlineTemplate} onChange={event=>set({outlineTemplate:event.target.value})}>{templates.map(([id,es,english])=><option key={id} value={id}>{en?english:es}</option>)}</select></label><label>{en?'Target words (minimum 1,000)':'Palabras objetivo (mínimo 1.000)'}<Input type="number" min={1000} step={1000} value={state.targetWords} onChange={event=>set({targetWords:Number(event.target.value)})} /></label></div><WebFeasibilityKnowledge language={language} selected={state.referenceDocumentIds} onChange={referenceDocumentIds=>set({referenceDocumentIds})} /><p>{en?'Changes to a chapter clear its content and the key parameters when saved. Reordering preserves them.':'Cambiar un capítulo borra su contenido y los parámetros clave al guardar. Ordenar los conserva.'}</p><div className="web-inline"><Button icon={Plus} size="sm" type="button" variant="outline" onClick={()=>changeOutline({type:'add-root',node:{id:crypto.randomUUID(),title:en?'New chapter':'Nuevo capítulo',content:''}})}>{en?'Add chapter':'Añadir capítulo'}</Button></div>{state.outlineData?.outline.length?chapters(state.outlineData.outline):<p>{en?'No outline yet.':'Aún no hay índice.'}</p>}</>}
 {state.step==='parameters'&&<><h2>{labels[language][4]}</h2><WebTextEditor language={language} title={en?'Key parameters':'Parámetros clave'} value={state.keyParametersMarkdown} maxLength={200000} onChange={keyParametersMarkdown=>set({keyParametersMarkdown})} /></>}
 {state.step==='content'&&<><h2>{labels[language][5]}</h2><WebLibraryImageReferences language={language}/>{state.outlineData?.outline.length?chapters(state.outlineData.outline):<p>{en?'Add an outline to edit chapters.':'Agrega un índice para editar capítulos.'}</p>}</>}
 </div></div>;
}
function WebFeasibilityInner({language,onDirtyChange,credentials,projectId,projectFiles=[],projectDefaults,onOpenProjectFiles}:{language:'es'|'en';onDirtyChange:(dirty:boolean)=>void;credentials:{id:string;provider:string;model:string}[];projectId?:string;projectFiles?:{id:string;name:string}[];projectDefaults?:ProjectDefaults|null;onOpenProjectFiles?:()=>void}){
 const request=useFeasibilityRequest();
 const feasibilityPath=useFeasibilityPath();
 const en=language==='en',{showToast}=useToast(),[state,setState]=useState<State|null>(null),[saved,setSaved]=useState<State|null>(null),[version,setVersion]=useState(0),[sources,setSources]=useState<Availability[]>([]),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[sourceBusy,setSourceBusy]=useState(false),[analysisBusy,setAnalysisBusy]=useState(false),[confirm,setConfirm]=useState(false),[prefilled,setPrefilled]=useState(false),[defaults,setDefaults]=useState<ProjectDefaults|undefined>(projectDefaults||undefined),[readerOpen,setReaderOpen]=useState(false),[readerFileId,setReaderFileId]=useState(''),[fullscreen,setFullscreen]=useState(false);
 const dirty=!!state&&JSON.stringify(state)!==JSON.stringify(saved);
 useEffect(()=>{onDirtyChange(dirty||sourceBusy||analysisBusy);return()=>onDirtyChange(false);},[dirty,sourceBusy,analysisBusy,onDirtyChange]);
 useEffect(()=>{let active=true;void request<{report:{state:State;version:number}|null;projectDefaults?:ProjectDefaults;sources?:Availability[]}>('/api/feasibility-report').then(data=>{if(!active)return;const mergedDefaults={...projectDefaults,...data.projectDefaults};const initial=initialFeasibilityState(data.report,mergedDefaults);setDefaults(mergedDefaults);setState(initial.state);setSaved(initial.saved);setPrefilled(!data.report&&!!(mergedDefaults?.projectName||mergedDefaults?.location));setVersion(data.report?.version||0);setSources(data.sources||[]);}).catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[request]);
 useEffect(()=>{if(projectFiles.length&&!projectFiles.some(file=>file.id===readerFileId))setReaderFileId(projectFiles[0].id);},[projectFiles,readerFileId]);
 useEffect(()=>{if(!fullscreen)return;const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')setFullscreen(false);};window.addEventListener('keydown',onKeyDown);return()=>window.removeEventListener('keydown',onKeyDown);},[fullscreen]);
 const refreshSources=useCallback(()=>{void request<{sources?:Availability[]}>('/api/feasibility-report').then(data=>setSources(data.sources||[])).catch(()=>undefined);},[request]);
 const consequence=()=>state&&saved?prepareFeasibilitySave(state,saved).kind:'';
 const save=async()=>{if(!state||!saved||busy)return;if(!Number.isSafeInteger(state.targetWords)||state.targetWords<1000){showToast(en?'Enter at least 1,000 target words.':'Introduce al menos 1.000 palabras objetivo.','error');setConfirm(false);return;}if(!validTitles(state.outlineData?.outline||[])){showToast(en?'Enter a title for every chapter.':'Escribe un título para cada capítulo.','error');setConfirm(false);return;}const next=prepareFeasibilitySave(state,saved).state;setBusy(true);try{const result=await request<{report:{state:State;version:number}}>('/api/feasibility-report',{method:'PUT',json:{report:next,version}});setState(result.report.state);setSaved(result.report.state);setVersion(result.report.version);showToast(en?'Report saved.':'Informe guardado.','success');}catch(error){showToast((error as Error & {status?:number}).status===409?(en?'Another session changed this report. Copy your edits before reloading.':'Otra sesión modificó el informe. Copia tus cambios antes de recargar.'):(en?'Could not save the report.':'No se pudo guardar el informe.'),'error');}finally{setBusy(false);setConfirm(false);}};
 if(loading)return <WebLoading message={en?'Loading report…':'Cargando informe…'}/>;if(failed||!state)return <p role="alert">{en?'Could not load the report. Reload to try again.':'No se pudo cargar el informe. Recarga para intentarlo de nuevo.'}</p>;
 const stepIndex=Math.max(0,steps.indexOf(state.step));
 const hasOfferFiles=Boolean(projectId&&projectFiles.length);
 const hasExtractedSources=Boolean(state.sourceFiles.length)&&state.sourceFiles.every(item=>sources.find(src=>src.sourceKey===item.sourceKey)?.textAvailable??item.expected);
 const stepStatuses:StepStatus[]=steps.map((item,index)=>{
  if(item==='sources'&&sourceBusy)return 'running';
  if(item===state.step&&analysisBusy)return 'running';
  const done=item==='materials'?Boolean(state.projectInfo.projectName?.trim()&&version>0):item==='sources'?(hasOfferFiles||hasExtractedSources):item==='analysis'?Boolean(state.analysisMarkdown.trim()):item==='outline'?Boolean(state.outlineData?.outline?.length):item==='parameters'?Boolean(state.keyParametersMarkdown.trim()):allLeavesHaveContent(state.outlineData?.outline||[]);
  if(done)return 'complete';
  if(index===stepIndex)return 'current';
  return 'pending';
 });
 const selectStep=(nextStep:Step)=>setState(current=>current?{...current,step:nextStep}:current);
 const reloadReport=async()=>{const data=await request<{report:{state:State;version:number}|null;sources?:Availability[]}>('/api/feasibility-report');if(!data.report)throw new Error('Report unavailable');setState(data.report.state);setSaved(data.report.state);setVersion(data.report.version);setSources(data.sources||[]);};
 return <div className={`web-preparation-wizard web-feasibility-wizard${fullscreen?' web-wizard-fullscreen':''}`} data-step={stepIndex}>
  <nav aria-label={en?'Report stages':'Etapas del informe'} className="web-wizard-steps web-feasibility-steps">
   {steps.map((step,index)=>{
    const status=stepStatuses[index];
    return <button type="button" key={step} data-status={status} aria-current={state.step===step?'step':undefined} onClick={()=>selectStep(step)}><span>{status==='complete'?'✓':index+1}</span><div><strong>{labels[language][index]}</strong><small>{statusLabel(status,en)}</small></div></button>;
   })}
  </nav>
  <div className="web-wizard-heading">
   <div>
    <h3>{labels[language][stepIndex]}</h3>
    <p>{stepDescriptions[state.step][language]}</p>
   </div>
   <div className="web-wizard-heading-actions">
    <WebProjectHelp language={language} area="feasibility" step={stepIndex} labels={labels[language]} />
    <Button data-icon-action icon={fullscreen?Minimize2:Maximize2} iconOnly size="sm" variant="outline" aria-pressed={fullscreen} title={fullscreen?(en?'Restore workspace size':'Restaurar tamaño del área de trabajo'):(en?'Expand workspace':'Ampliar área de trabajo')} onClick={()=>setFullscreen(value=>!value)}>{fullscreen?(en?'Restore workspace size':'Restaurar tamaño del área de trabajo'):(en?'Expand workspace':'Ampliar área de trabajo')}</Button>
    <WebJobQuestions language={language} basePath={feasibilityPath("/api/feasibility-report/questions")} />
    {projectId&&<Button icon={readerOpen?PanelLeftClose:PanelLeftOpen} size="sm" variant="outline" disabled={!projectFiles.length} onClick={()=>setReaderOpen(value=>!value)}>{readerOpen?(en?'Hide tender':'Ocultar pliego'):(en?'Show tender':'Mostrar pliego')}</Button>}
   </div>
  </div>
  <div className={`web-wizard-columns${readerOpen&&projectId&&projectFiles.length?'':' without-reader'}`}>
   {readerOpen&&projectId&&projectFiles.length>0&&<FeasibilitySourceReader projectId={projectId} files={projectFiles} selectedId={readerFileId} onSelect={setReaderFileId} language={language} />}
   <div className="web-wizard-work">
    <section className="web-wizard-step">
     {prefilled&&version===0&&<p className="web-feasibility-callout">{en?'We filled in available project details from the offer. Review them and save the report.':'Completamos los datos disponibles del proyecto a partir de la oferta. Revísalos y guarda el informe.'}</p>}
     {state.step==='sources'&&<WebFeasibilitySources projectId={projectId} projectFiles={projectFiles} onOpenProjectFiles={onOpenProjectFiles} onPreviewProjectFile={id=>{setReaderFileId(id);setReaderOpen(true);}} language={language} version={version} disabled={busy||dirty||!version} selectedKeys={(saved?.sourceFiles||[]).flatMap(source=>source.sourceKey?[source.sourceKey]:[])} onReload={reloadReport} onBusyChange={setSourceBusy} onImported={(report,keys)=>{setState(report.state);setSaved(report.state);setVersion(report.version);setSources(current=>[...current.filter(item=>!keys.includes(item.sourceKey)),...keys.map(sourceKey=>({sourceKey,available:true}))]);}} />}
     {state.step==='sources'&&<WebFeasibilityExtractions language={language} version={version} dirty={dirty||sourceBusy||analysisBusy} hasOriginals={!!saved?.sourceFiles.some(source=>source.sourceType==='original')} onCompleted={refreshSources} />}
     {state.step==='analysis'&&<WebFeasibilityAnalysis language={language} version={version} dirty={dirty||sourceBusy||analysisBusy} hasProjectName={!!saved?.projectInfo.projectName.trim()} credentials={credentials} onBusyChange={setAnalysisBusy} onApplied={reloadReport} />}
     {state.step==='outline'&&<WebFeasibilityOutlineGeneration language={language} version={version} dirty={dirty||sourceBusy||analysisBusy} hasAnalysis={!!saved?.analysisMarkdown.trim()} hasOutline={!!saved?.outlineData?.outline.length} hasReferences={!!saved?.referenceDocumentIds.length} credentials={credentials} onBusyChange={setAnalysisBusy} onApplied={reloadReport} />}
     {state.step==='parameters'&&<WebFeasibilityParameters language={language} version={version} dirty={dirty||sourceBusy||analysisBusy} hasOutline={!!saved?.outlineData?.outline.length&&!!saved?.projectInfo.projectName.trim()} hasReferences={!!saved?.referenceDocumentIds.length} credentials={credentials} onBusyChange={setAnalysisBusy} onApplied={reloadReport} />}
     {state.step==='content'&&<WebFeasibilityContent language={language} version={version} dirty={dirty||sourceBusy||analysisBusy} ready={!!saved?.outlineData?.outline.length&&!!saved?.keyParametersMarkdown.trim()} reviewReady={hasLeafContent(saved?.outlineData?.outline||[])} chapterTitles={Object.fromEntries((function flat(nodes:Node[]):[string,string][]{return nodes.flatMap(node=>[[node.id,node.title] as [string,string],...flat(node.children||[])]);})(saved?.outlineData?.outline||[]))} hasReferences={!!saved?.referenceDocumentIds.length} credentials={credentials} onBusyChange={setAnalysisBusy} onApplied={reloadReport} />}
     <fieldset className="web-feasibility-fieldset" disabled={busy||sourceBusy||analysisBusy}><FeasibilityEditor hideNavigation state={state} language={language} sources={sources} defaults={defaults} stepStatuses={stepStatuses} onChange={setState} /></fieldset>
     {state.step==='content'&&<WebFeasibilityExports language={language} version={version} dirty={dirty||sourceBusy||analysisBusy} hasOutline={!!saved?.outlineData?.outline.length} />}
    </section>
   </div>
  </div>
  <footer className="web-wizard-footer web-feasibility-actions">
   {dirty&&<div className="web-wizard-blocker" role="status"><span>{en?'You have unsaved changes in the feasibility report. Save before starting runner tasks.':'Tienes cambios sin guardar en el informe de viabilidad. Guarda antes de iniciar tareas en el runner.'}</span><div className="web-inline">{saved&&<Button icon={RotateCcw} size="sm" type="button" variant="ghost" disabled={busy||sourceBusy||analysisBusy} onClick={()=>setState({...saved,step:state.step})}>{en?'Discard changes':'Descartar cambios'}</Button>}<Button icon={Save} size="sm" type="button" disabled={busy||sourceBusy||analysisBusy||!dirty} onClick={()=>consequence()?setConfirm(true):void save()}>{en?'Save report':'Guardar informe'}</Button></div></div>}
   <Button icon={ArrowLeft} variant="outline" disabled={stepIndex===0} onClick={()=>selectStep(steps[Math.max(0,stepIndex-1)])}>{en?'Previous':'Anterior'}</Button>
   <span>{en?`Step ${stepIndex+1} of ${steps.length}`:`Paso ${stepIndex+1} de ${steps.length}`}</span>
   <div className="web-inline">
    {!dirty&&<Button icon={Save} variant="outline" disabled={busy||sourceBusy||analysisBusy||!dirty} onClick={()=>consequence()?setConfirm(true):void save()}>{en?'Save report':'Guardar informe'}</Button>}
    <Button icon={ArrowRight} disabled={stepIndex===steps.length-1} onClick={()=>selectStep(steps[Math.min(steps.length-1,stepIndex+1)])}>{en?'Continue':'Continuar'}</Button>
   </div>
  </footer>
  <AppDialog open={confirm} onOpenChange={setConfirm} title={en?'Update the report?':'¿Actualizar el informe?'} description={en?'This change clears dependent analysis, outline, parameters or chapter content, as in the desktop workflow.':'Este cambio eliminará el análisis, índice, parámetros o contenido dependiente, igual que en el flujo de escritorio.'} actions={<><Button variant="outline" onClick={()=>setConfirm(false)}>{en?'Cancel':'Cancelar'}</Button><Button variant="destructive" disabled={busy} onClick={()=>void save()}>{en?'Save and clear':'Guardar y limpiar'}</Button></>} />
 </div>;
}

export default function WebFeasibility(props:{language:'es'|'en';onDirtyChange:(dirty:boolean)=>void;credentials:{id:string;provider:string;model:string}[];projectId?:string;projectFiles?:{id:string;name:string}[];projectDefaults?:ProjectDefaults|null;onOpenProjectFiles?:()=>void}){return <FeasibilityScope projectId={props.projectId}><WebFeasibilityInner key={props.projectId||'account'} {...props}/></FeasibilityScope>;}
