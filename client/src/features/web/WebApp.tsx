import WebLocalModel from './WebLocalModel';
import {WebLoading} from './WebLoading';
import {WebConnectionHeader} from './WebConnectionHeader';
import {WebProjectHelp} from './WebProjectHelp';
import {authErrorMessage} from './auth-errors.mjs';
import {readNavigation,navigationSearch} from './web-navigation.mjs';
import {WebPreparationWizard} from './WebPreparationWizard';
import {WebProjectHistory} from './WebProjectHistory';
import {WebProjectChat} from './WebProjectChat';
import {WebProjectList} from './WebProjectList';
import {WebRunnerSetup} from './WebRunnerSetup';
import WebSecopWatch from './WebSecopWatch';
import {SelectField} from '@/shared/ui/SelectField';
import {Sheet,SheetTrigger,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/shared/ui/primitives/sheet';
import {z} from 'zod';
import {WebNavigation} from './WebNavigation';
import {WebUserMenu} from './WebUserMenu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/primitives/tabs';
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from '@/shared/ui/primitives/tooltip';
import {ProjectRemovalControls, type PendingProjectDeletion} from './WebProjectRemoval';
import {uploadLargeProjectFile} from './project-multipart-upload.mjs';
import {bindWebTheme} from './web-theme.mjs';
import type {WebTheme, ColorTheme, VisualStyle} from './WebAppearance';
import {COLOR_THEMES, VISUAL_STYLES} from '@/shared/theme/ThemeProvider';
import WebCredentialModel, {findCatalogModel} from './WebCredentialModel';
import {type ChatUsage} from './WebChatUsage';
import {WebAssistant} from './WebAssistant';
import WebAuthRecovery from './WebAuthRecovery';
import {WebAuthMfa} from './WebAuthMfa';
import {WebAuthScreen} from './WebAuthScreen';
import WebAccount from './WebAccount';
import WebAdmin from './WebAdmin';
import WebExportFormat from './WebExportFormat';
import WebAgendaReminders from './WebAgendaReminders';
import WebRunnerActivity from './WebRunnerActivity';
import WebFeasibility from './WebFeasibility';
import WebBidEvaluation from './WebBidEvaluation';
import WebBlindCheck from './WebBlindCheck';
import WebRejectionCheck from './WebRejectionCheck';
import WebDuplicateCheck from './WebDuplicateCheck';
import WebDuplicateReviews from './WebDuplicateReviews';
import WebImageLibrary from './WebImageLibrary';
import WebImportedSavedTender from './WebImportedSavedTender';
import WebMarket from './WebMarket';
import WebCompanyCertificates from './WebCompanyCertificates';
import WebCompanyProfile from './WebCompanyProfile';
import WebCompanyExperience from './WebCompanyExperience';
import WebAgenda from './WebAgenda';
import WebImportedChat from './WebImportedChat';
import WebKnowledgeLibrary from './WebKnowledgeLibrary';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {ArrowLeft, BriefcaseBusiness, Building2, CalendarDays, FileCheck2, FolderOpen, Images, KeyRound, Leaf, Library, MessageCircle, MonitorCog, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Save, Search, ShieldCheck, TrendingUp} from 'lucide-react';
import { ControlledLanguageProvider, type AppLocale } from '@/shared/i18n';
import type { ProcurementMarket } from '@/shared/types/secop';
import { ToastProvider, useToast } from '@/shared/ui/ToastProvider';
import MarkdownRenderer from '@/shared/ui/MarkdownRenderer';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import AppDialog from '@/shared/ui/AppDialog';
import { request } from './api.mjs';
import WebWorkflow from './WebWorkflow';
import WebPreflight from './WebPreflight';
import WebTechnicalPlan from './WebTechnicalPlan';
import WebTechnicalAnalysis from './WebTechnicalAnalysis';
import WebTechnicalOutline from './WebTechnicalOutline';
import WebGlobalFacts from './WebGlobalFacts';
import WebRup from './WebRup';
import WebJobQuestions from './WebJobQuestions';
import WebSecop, { WebProjectSecop } from './WebSecop';
import WebAddendumHistory from './WebAddendumHistory';
import WebOpportunitySuggestions from './WebOpportunitySuggestions';
import {rotateAccountCredentials} from './credential-rotation.mjs';
import './web.css';
import './web-appearance.css';

type User = { id: string; name: string; email: string; role?: string; twoFactorEnabled?: boolean; tenant?: {id:string;name:string} };
type Project = { id: string; title: string; hasOffer?: number | boolean; fileCount?: number; tenderSummary?: { contractingEntity?: string; object?: string; location?: string; budget?: string; deadline?: string; modality?: string } | null };
type FileItem = { id: string; name: string; size: number; deleting?: number | boolean };
type Credential = { id: string; provider: string; model: string; contextTokens: number; outputTokens: number };
type Runner = { id: string; name: string; lastSeenAt: string | null };
type Job = { id: string; wordRevision?: number; kind: string; state: string; progress?: 'preparing' | 'reading' | 'ocr' | 'generating' | null; artifactState?: 'none' | 'stored' | 'deletion_pending' | 'deleted'; payload: { question?: string; fileIds?: string[]; tenderFileIds?: string[]; bidFileIds?: string[]; nodeId?: string; planVersion?: number }; result: { answer?: string; followUps?: string[]; usage?: ChatUsage; content?: string; error?: string; message?: string; analysisStatus?: string; criteria?: string; imported?: number; skipped?: number } | null };
// Enable only after all project-scoped runner endpoints have passed end-to-end verification.
const PROJECT_FEASIBILITY_ENABLED = true;
type View = 'account' | 'admin' | 'export-format' | 'company-experience' | 'company-profile' | 'feasibility' | 'projects' | 'runners' | 'credentials' | 'rup' | 'secop' | 'knowledge' | 'agenda' | 'company-certificates' | 'market' | 'images' | 'duplicate-reviews' | 'rejection-reviews';
type Locale = 'es' | 'en';
const labels = {
  es: { assistant: 'Asistente de oferta', account: 'Cuenta', admin: 'Administración', 'export-format': 'Formato Word', 'company-experience': 'Experiencia empresarial', 'company-profile': 'Perfil de empresa', feasibility: 'Informe de viabilidad', 'rejection-reviews': 'Revisiones importadas', 'duplicate-reviews': 'Revisiones importadas', images: 'Imágenes', market: 'Inteligencia de mercado', 'company-certificates': 'Certificados', rup: 'RUP', agenda: 'Agenda', knowledge: 'Recursos', secop: 'Oportunidades', projects: 'Proyectos', runners: 'Conexión e IA', credentials: 'Conexión e IA', logout: 'Cerrar sesión', signIn: 'Iniciar sesión', signUp: 'Crear cuenta', name: 'Nombre', email: 'Correo electrónico', password: 'Contraseña', create: 'Crear', loading: 'Cargando…', refresh: 'Actualizar', files: 'Documentos', upload: 'Subir documento', question: 'Consulta tus documentos', ask: 'Enviar consulta', waiting: 'Aún no hay consultas.', empty: 'Todavía no hay proyectos. Crea uno para empezar.', newProject: 'Nombre del proyecto', choose: 'Selecciona un proyecto', runnerHelp: 'Conecta una máquina para ejecutar las tareas de este espacio. Esta versión de prueba requiere la carpeta de distribución del runner y Node.js 22.13 o posterior.', pair: 'Generar código de conexión', code: 'Código de un solo uso (válido cinco minutos)', command: 'En la máquina del runner, abre Iniciar-Savia.command (macOS) o Iniciar-Savia.cmd (Windows). En Linux ejecuta ./Iniciar-Savia.sh desde una terminal. Introduce la dirección y el código; mantén la ventana abierta. También puedes usar estos comandos:', noRunner: 'Todavía no hay runners conectados.', credentialHelp: 'Opcional: agrega una credencial para usar un modelo de la cuenta. Si no seleccionas una, puedes usar el modelo configurado en el conector. La clave se cifra en el servidor.', model: 'Identificador del modelo', secret: 'Clave de API', save: 'Guardar credencial', noCredential: 'No hay credenciales configuradas.', selectCredential: 'Selecciona una credencial', consent: 'Autorizo el envío de las preguntas, instrucciones, hechos globales aprobados y documentos seleccionados al proveedor y al modelo configurados.', questionPlaceholder: 'Escribe una pregunta sobre los documentos seleccionados', preview: 'Vista previa de Savia web', previewText: 'Este espacio está en desarrollo. Las consultas pueden continuar con los mismos documentos seleccionados.', registered: '¿Ya tienes cuenta?', needAccount: '¿No tienes cuenta?', connected: 'Última conexión', never: 'Sin actividad', noFiles: 'Sube documentos de texto, Word, Excel o PDF con texto para comenzar. DOC y WPS pueden requerir un conversor local.', cancel: 'Cancelar', error: 'No se pudo completar la acción. Revisa los datos e inténtalo de nuevo.', saved: 'Cambios guardados.', sent: 'Consulta enviada al runner.', missing: 'Selecciona documentos y un modelo.' },
  en: { assistant: 'Bid assistant', account: 'Account', admin: 'Administration', 'export-format': 'Word format', 'company-experience': 'Company experience', 'company-profile': 'Company profile', feasibility: 'Feasibility report', 'rejection-reviews': 'Imported reviews', 'duplicate-reviews': 'Imported reviews', images: 'Images', market: 'Market intelligence', 'company-certificates': 'Certificates', rup: 'RUP', agenda: 'Agenda', knowledge: 'Resources', secop: 'Opportunities', projects: 'Projects', runners: 'Connection & AI', credentials: 'Connection & AI', logout: 'Sign out', signIn: 'Sign in', signUp: 'Create account', name: 'Name', email: 'Email', password: 'Password', create: 'Create', loading: 'Loading…', refresh: 'Refresh', files: 'Documents', upload: 'Upload document', question: 'Ask about your documents', ask: 'Send question', waiting: 'No questions yet.', empty: 'No projects yet. Create one to get started.', newProject: 'Project name', choose: 'Choose a project', runnerHelp: 'Connect a machine to run tasks for this workspace. This preview requires the runner distribution folder and Node.js 22.13 or later.', pair: 'Generate connection code', code: 'One-time code (valid for five minutes)', command: 'On the runner machine, open Iniciar-Savia.command (macOS) or Iniciar-Savia.cmd (Windows). On Linux run ./Iniciar-Savia.sh in a terminal. Enter the address and code, then keep the window open. You can also use these commands:', noRunner: 'No runners connected yet.', credentialHelp: 'Optionally add a credential to use an account model. Without one, you can use the model configured in the connector. The key is encrypted on the server.', model: 'Model identifier', secret: 'API key', save: 'Save credential', noCredential: 'No credentials configured.', selectCredential: 'Choose a credential', consent: 'I authorize sending questions, instructions, approved global facts and selected documents to the configured provider and model.', questionPlaceholder: 'Ask a question about the selected documents', preview: 'Savia web preview', previewText: 'This workspace is under development. Questions can continue with the same selected documents.', registered: 'Already have an account?', needAccount: 'Need an account?', connected: 'Last connected', never: 'No activity', noFiles: 'Upload text, Word, Excel or searchable PDF files to get started. DOC and WPS may require a local converter.', cancel: 'Cancel', error: 'No se pudo completar la acción. Revisa los datos e inténtalo de nuevo.', saved: 'Changes saved.', sent: 'Question sent to the runner.', missing: 'Select documents and a credential and authorize processing.' },
};

function Workspace({locale, setLocale, market, changeMarket, user, setUser, changeLanguage, theme, changeTheme, colorTheme, changeColorTheme, visualStyle, changeVisualStyle, preferenceBusy, preferenceError}: {locale: Locale; setLocale: (value: Locale) => void; market: ProcurementMarket; changeMarket: (value: ProcurementMarket) => void; user: User | null; setUser: (value: User | null) => void; changeLanguage: (value: Locale) => void; theme: WebTheme; changeTheme: (value: WebTheme) => void; colorTheme: ColorTheme; changeColorTheme: (value: ColorTheme) => void; visualStyle: VisualStyle; changeVisualStyle: (value: VisualStyle) => void; preferenceBusy: boolean; preferenceError: boolean}) {
  const t = labels[locale];
  const accreditationLabel = market === 'ES' ? 'ROLECE / DEUC' : market === 'CO' ? 'RUP' : 'RUP / ROLECE';
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const { showToast } = useToast();
  const [checking, setChecking] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [register, setRegister] = useState(false);
  const [mfaPending, setMfaPending] = useState(false);
  const [recovery, setRecovery] = useState<'reset' | 'verify' | null>(() => window.location.pathname === '/reset-password' ? 'reset' : null);
  const [authCapabilities, setAuthCapabilities] = useState({email:false,registration:false,passwordRecovery:false,requireVerification:false});
  const [authNotice, setAuthNotice] = useState('');
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => { void request<{email:boolean;registration:boolean;passwordRecovery:boolean;requireVerification:boolean}>('/api/auth-capabilities').then(data => {setAuthCapabilities(data);setAuthReady(true);}).catch(() => undefined); }, []);
  const [busy, setBusy] = useState(false);
  const [assistantOpen,setAssistantOpen]=useState(false);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const initialRoute=useRef(readNavigation(window.location.search)).current;
  const [view, setView] = useState<View>(initialRoute.view as View);
  const [opportunityTab,setOpportunityTab] = useState(initialRoute.opportunity);
  const [projects, setProjects] = useState<Project[]>([]);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountLoadFailed, setAccountLoadFailed] = useState(false);
  const [projectDataReady, setProjectDataReady] = useState('');
  const [projectDataFailed, setProjectDataFailed] = useState('');
  const [projectToRemove, setProjectToRemove] = useState<Project | null>(null);
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectError, setNewProjectError] = useState('');
  const [pendingProjectDeletions, setPendingProjectDeletions] = useState<PendingProjectDeletion[]>([]);
  const [selected, setSelected] = useState(initialRoute.project);
  const [selectionLoaded,setSelectionLoaded]=useState(false);
  const selectionWrites=useRef<Promise<unknown>>(Promise.resolve());
  const [projectTab, setProjectTab] = useState(initialRoute.tab);
  const [reviewFocus, setReviewFocus] = useState<'duplicates' | 'rejection' | null>(null);
  const [routeStep,setRouteStep]=useState<number|null>(initialRoute.step);
  const applyingRoute=useRef(false),lastUrl=useRef(window.location.pathname+window.location.search+window.location.hash),historyDepth=useRef(0);
  const [deliveryRequest,setDeliveryRequest]=useState(0);
  const [projectFileSearch, setProjectFileSearch] = useState('');
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const [files, setFiles] = useState<FileItem[]>([]);
  const [fileToRemove, setFileToRemove] = useState<FileItem | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{projectId: string; file: File; key: string} | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credential, setCredential] = useState('');
  const [localModel, setLocalModel] = useState<{model:string|null;active:boolean}>({model:null,active:false});
  const [credentialFormVersion, setCredentialFormVersion] = useState(0);
  const projectCredential=credential||'local-runner';
  const activeCredentials=credentials.filter(item=>item.id===credential);
  const aiCredentials=activeCredentials.length?activeCredentials:[{id:'local-runner',provider:'opencode-go',model:locale==='es'?'Modelo del runner':'Runner model'}];
  const selectAccountModel=(id:string)=>void run(async()=>{await request('/api/provider-credentials/default',{method:'PUT',json:{credentialId:id}});setCredential(id);});
  const [runners, setRunners] = useState<Runner[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [revoke, setRevoke] = useState<{ kind: 'runner' | 'credential'; id: string; name: string } | null>(null);
  const [question, setQuestion] = useState('');
  const [consent, setConsent] = useState(true);
  const [continueChat, setContinueChat] = useState(true);
  const [certificatesDirty, setCertificatesDirty] = useState(false), [rejectionDirty, setRejectionDirty] = useState(false), [blindDirty, setBlindDirty] = useState(false), [evaluationDirty, setEvaluationDirty] = useState(false);
  const [feasibilityDirty, setFeasibilityDirty] = useState(false), [profileDirty, setProfileDirty] = useState(false), [experienceDirty, setExperienceDirty] = useState(false), [exportFormatDirty, setExportFormatDirty] = useState(false);
  const [planDirty, setPlanDirty] = useState(false), [rupDirty, setRupDirty] = useState(false), [workflowDirty, setWorkflowDirty] = useState(false), [outlineDirty, setOutlineDirty] = useState(false), [templateValuesDirty, setTemplateValuesDirty] = useState(false), [factsDirty, setFactsDirty] = useState(false);
  const [planReload, setPlanReload] = useState(0);
  const [factsStatus, setFactsStatus] = useState<{ revision: number; current: boolean; includesRup: boolean } | undefined>(undefined);
  useEffect(() => { setFactsStatus(undefined); }, [selected]);
  const [templateSelection] = useState<{ jobId: string; revision: number; current: boolean } | null | undefined>(undefined);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const navigateSafely = (action: () => void) => { if (planDirty || rupDirty || workflowDirty || outlineDirty || templateValuesDirty || factsDirty || certificatesDirty || rejectionDirty || blindDirty || evaluationDirty || feasibilityDirty || profileDirty || experienceDirty || exportFormatDirty) setPendingNavigation(() => action); else action(); };
  useEffect(() => { if (!planDirty && !rupDirty && !workflowDirty && !outlineDirty && !templateValuesDirty && !factsDirty && !certificatesDirty && !rejectionDirty && !blindDirty && !evaluationDirty && !feasibilityDirty && !profileDirty && !experienceDirty && !exportFormatDirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [planDirty, rupDirty, workflowDirty, outlineDirty, templateValuesDirty, factsDirty, certificatesDirty, rejectionDirty, blindDirty, evaluationDirty, feasibilityDirty, profileDirty, experienceDirty, exportFormatDirty]);
  useEffect(()=>{
    if(!user||!selectionLoaded||recovery)return;
    const search=navigationSearch({view,project:selected,tab:projectTab,step:routeStep,opportunity:opportunityTab});
    const next=window.location.pathname+search+window.location.hash;
    if(applyingRoute.current){applyingRoute.current=false;lastUrl.current=next;return;}
    if(next!==lastUrl.current){window.history.pushState(null,'',next);historyDepth.current++;lastUrl.current=next;}
  },[user,selectionLoaded,recovery,view,selected,projectTab,routeStep,opportunityTab]);
  useEffect(()=>{const changed=()=>{const next=window.location.pathname+window.location.search+window.location.hash;if(next!==lastUrl.current)historyDepth.current++;lastUrl.current=next;};window.addEventListener('savia:route-detail',changed);return()=>window.removeEventListener('savia:route-detail',changed);},[]);
  useEffect(()=>{
    const pop=()=>{historyDepth.current=Math.max(0,historyDepth.current-1);const destination=window.location.pathname+window.location.search+window.location.hash;const route=readNavigation(window.location.search);
      const apply=()=>{applyingRoute.current=true;lastUrl.current=destination;setView(route.view as View);setSelected(route.project);setProjectTab(route.tab);setRouteStep(route.step);setOpportunityTab(route.opportunity);};
      if(planDirty||rupDirty||workflowDirty||outlineDirty||templateValuesDirty||factsDirty||certificatesDirty||rejectionDirty||blindDirty||evaluationDirty||feasibilityDirty||profileDirty||experienceDirty||exportFormatDirty){window.history.pushState(null,'',lastUrl.current);setPendingNavigation(()=>()=>{window.history.pushState(null,'',destination);apply();});}else apply();
    };window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);
  },[planDirty,rupDirty,workflowDirty,outlineDirty,templateValuesDirty,factsDirty,certificatesDirty,rejectionDirty,blindDirty,evaluationDirty,feasibilityDirty,profileDirty,experienceDirty,exportFormatDirty]);
  const failure = useCallback(() => showToast(t.error, 'error'), [showToast, t.error]);
  useEffect(()=>{
    setSelectionLoaded(false);
    if(!user)return;
    let active=true;
    void request<{projectId:string|null}>('/api/project-selection').then(data=>{if(active){setSelectionLoaded(true);}}).catch(()=>{if(active){setSelectionLoaded(true);failure();}});
    return()=>{active=false;};
  },[user?.id,failure]);
  useEffect(()=>{
    if(!selectionLoaded||!user||!selected)return;
    const projectId=selected;
    selectionWrites.current=selectionWrites.current.catch(()=>undefined).then(async()=>{
      if(selectedRef.current!==projectId)return;
      try{await request('/api/project-selection',{method:'PUT',json:{projectId}});}catch{if(selectedRef.current===projectId)failure();}
    });
  },[selected,selectionLoaded,user?.id,failure]);
  const loadAccount = useCallback(async () => {
    const [p, c, r, local] = await Promise.all([request<{ projects: Project[] }>('/api/projects'), request<{ credentials: Credential[]; defaultCredentialId:string|null }>('/api/provider-credentials'), request<{ runners: Runner[] }>('/api/runners'), request<{model:string|null;active:boolean}>('/api/provider-credentials/local-model')]);
    setLocalModel(local);
    setProjects(p.projects); setCredentials(c.credentials); setRunners(r.runners);
    setCredential(c.defaultCredentialId||'');
  }, []);
  useEffect(() => { void request<{ user: User }>('/api/me').then(data => setUser(data.user)).catch((error: Error & { status?: number }) => { if (error.status === 403 && error.message === 'email_not_verified') setAuthNotice(locale === 'es' ? 'Verifica tu correo antes de continuar; puedes solicitar otro enlace.' : 'Verify your email to continue; you can request another link.'); else if (error.status !== 401) setConnectionError(true); }).finally(() => setChecking(false)); }, []);
  useEffect(() => { if (!user) return; let active=true;setAccountLoading(true);setAccountLoadFailed(false);void loadAccount().catch(()=>{if(active){setAccountLoadFailed(true);failure();}}).finally(()=>{if(active)setAccountLoading(false);});return()=>{active=false;}; }, [user, loadAccount, failure]);
  useEffect(() => {
    if (!user?.id) return;
    const controller = new AbortController();
    void rotateAccountCredentials({ownerId:user.id,signal:controller.signal,send:json => request<{rotated:number;failed:number;nextCursor?:string}>('/api/provider-credentials/rotate',{method:'POST',json,signal:controller.signal})}).catch(() => undefined);
    return () => controller.abort();
  }, [user?.id]);
  const loadProjectDeletions = useCallback(async () => { const result=await request<{deletions:PendingProjectDeletion[]}>('/api/project-deletions');setPendingProjectDeletions(result.deletions); }, []);
  useEffect(() => { if(user && view==='projects') void loadProjectDeletions().catch(failure); },[user,view,loadProjectDeletions,failure]);
  useEffect(() => { if (!user) return; let running=false; const check=async()=>{if(running)return;running=true;try{await request('/api/paa-watches/check-due',{method:'POST',json:{}});}catch{/* Retry on the next interval. */}finally{running=false;}}; void check(); const timer=window.setInterval(()=>void check(),60000); return()=>window.clearInterval(timer); },[user]);
  useEffect(() => { if (!user) return; let running=false; const check=async()=>{if(running)return;running=true;try{await request('/api/secop-watch/check-due',{method:'POST',json:{}});}catch{/* Retry on the next interval. */}finally{running=false;}}; void check(); const timer=window.setInterval(()=>void check(),60000); return()=>window.clearInterval(timer); },[user]);
  useEffect(() => {
    setFiles([]); setJobs([]); setSelectedFiles([]);
    setProjectDataReady(''); setProjectDataFailed('');
    if (!user || !selected) return;
    let active = true, initialized = false;
    const load = async () => {
      const [f, j] = await Promise.all([request<{ files: FileItem[] }>(`/api/projects/${selected}/files`), request<{ jobs: Job[] }>(`/api/projects/${selected}/jobs`)]);
      if (active) {
        const available = f.files.filter(file=>!file.deleting&&!/\.zip$/i.test(file.name)).map(file=>file.id);
        const previous = j.jobs.find(job=>job.kind==='tender-chat.send'&&!(job.payload as {wordAssistance?:boolean}).wordAssistance&&job.payload.fileIds?.some(id=>available.includes(id)));
        const initialFiles = previous?.payload.fileIds?.filter(id=>available.includes(id)) || (available.length<=50?available:[]);
        const firstLoad = !initialized; initialized = true;
        setFiles(f.files); setSelectedFiles(current=>firstLoad?initialFiles:current.filter(id=>available.includes(id))); setJobs(j.jobs);
        setProjectDataReady(selected); setProjectDataFailed('');
      }
    };
    void load().catch(()=>{if(active){setProjectDataFailed(selected);failure();}});
    const wordReviewed = (event: Event) => {
      const detail = (event as CustomEvent<{projectId:string;jobId:string}>).detail;
      if (detail?.projectId !== selected) return;
      setJobs(current => current.map(job => job.id === detail.jobId ? {...job, wordRevision: (job.wordRevision || 0) + 1} : job));
      void load().catch(() => undefined);
    };
    window.addEventListener('savia:word-reviewed', wordReviewed);
    const timer = window.setInterval(() => void load().catch(() => undefined), 5000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('savia:word-reviewed', wordReviewed); };
  }, [selected, user, failure]);
  const run = async (action: () => Promise<void>, onError?: (error:unknown)=>void) => { setBusy(true); try { await action(); } catch (error) { if(onError)onError(error);else failure(); } finally { setBusy(false); } };
  const removeFile = async () => {
    if (!fileToRemove || !selected || busy) return;
    const file = fileToRemove;
    setBusy(true);
    try {
      try { await request(`/api/projects/${encodeURIComponent(selected)}/files/${encodeURIComponent(file.id)}`, { method: 'DELETE' }); }
      catch (error) { if ((error as Error & { status?: number }).status !== 404) throw error; }
      setFiles(current => current.filter(item => item.id !== file.id));
      setSelectedFiles(current => current.filter(id => id !== file.id));
      setConsent(true); setFileToRemove(null);
      showToast(locale === 'es' ? 'Documento retirado.' : 'Document removed.', 'success');
    } catch (error) {
      if ((error as Error & { status?: number }).status === 503) {
        setFiles(current => current.map(item => item.id === file.id ? { ...item, deleting: true } : item));
        setSelectedFiles(current => current.filter(id => id !== file.id));
        setConsent(true); setFileToRemove(null);
        showToast(locale === 'es' ? 'El documento ya no está disponible. Reintenta eliminar el archivo pendiente.' : 'The document is no longer available. Retry deleting the pending file.', 'error');
      } else failure();
    } finally { setBusy(false); }
  };
  const removeProject = async () => {
    if(!projectToRemove || busy)return;const project=projectToRemove;setBusy(true);
    try {const result=await request<{deleted:boolean;cleanupPending:number}|null>(`/api/projects/${encodeURIComponent(project.id)}`,{method:'DELETE'});setProjectToRemove(null);setProjects(current=>current.filter(item=>item.id!==project.id));if(selectedRef.current===project.id)setSelected('');setPendingUpload(current=>current?.projectId===project.id?null:current);if(result?.cleanupPending)setPendingProjectDeletions(current=>[...current.filter(item=>item.projectId!==project.id),{projectId:project.id,title:project.title,cleanupPending:result.cleanupPending}]);showToast(result?.cleanupPending?(locale==='es'?'Proyecto eliminado; quedan archivos pendientes de limpieza.':'Project deleted; some stored files still need cleanup.'):(locale==='es'?'Proyecto eliminado.':'Project deleted.'),'success');}
    catch(error){if((error as Error & {status?:number}).status===409)showToast(locale==='es'?'Hay tareas en cola o en ejecución. Cancélalas o espera a que terminen.':'Tasks are queued or running. Cancel them or wait until they finish.','error');else failure();}finally{setBusy(false);}
  };
  const retryProjectDeletion = async (id:string) => {if(busy)return;setBusy(true);try{const result=await request<{deleted:boolean;cleanupPending:number}|null>(`/api/projects/${encodeURIComponent(id)}`,{method:'DELETE'});setPendingProjectDeletions(current=>result?.cleanupPending?current.map(item=>item.projectId===id?{...item,cleanupPending:result.cleanupPending}:item):current.filter(item=>item.projectId!==id));showToast(result?.cleanupPending?(locale==='es'?'Quedan archivos pendientes de limpieza.':'Some files still need cleanup.'):(locale==='es'?'Limpieza completada.':'Cleanup complete.'),result?.cleanupPending?'info':'success');}catch{failure();}finally{setBusy(false);}};
  const confirmRevoke = async () => {
    if (!revoke || busy) return;
    const item = revoke;
    setBusy(true);
    try {
      try { await request(`/api/${item.kind === 'runner' ? 'runners' : 'provider-credentials'}/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); }
      catch (error) { if ((error as Error & { status?: number }).status !== 404) throw error; }
      if (item.kind === 'runner') setRunners(current => current.filter(value => value.id !== item.id));
      else {
        setCredentials(current => current.filter(value => value.id !== item.id));
        if (credential === item.id) { setCredential(''); setConsent(true); }
      }
      setRevoke(null);
      showToast(locale === 'es' ? 'Conexión retirada.' : 'Connection removed.', 'success');
    } catch { failure(); } finally { setBusy(false); }
  };
  const authenticate = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); let stage:'signin'|'register'|'session'|'mfa'=register?'register':'signin'; void run(async () => {
    const authResult = await request<{ twoFactorRedirect?: boolean }>(`/api/auth/${register ? 'sign-up' : 'sign-in'}/email`, { method: 'POST', json: { email: data.get('email'), password: data.get('password'), ...(register ? { name: data.get('name') } : {}) } });
    if (!register && authResult?.twoFactorRedirect) { setMfaPending(true); return; }
    if (register && authCapabilities.requireVerification) { setRegister(false); setAuthNotice(locale === 'es' ? 'Revisa tu correo para verificar la cuenta antes de iniciar sesión.' : 'Check your email to verify your account before signing in.'); return; }
    stage='session'; const result = await request<{ user: User }>('/api/me'); setUser(result.user);
  }, error=>showToast(authErrorMessage(error,locale,stage),'error')); };
  const verifyMfa = (method: 'totp' | 'backup' | 'otp', code: string, trustDevice: boolean) => { void run(async () => {
    const endpoint = method === 'backup' ? '/api/auth/two-factor/verify-backup-code' : method === 'otp' ? '/api/auth/two-factor/verify-otp' : '/api/auth/two-factor/verify-totp';
    await request(endpoint, { method: 'POST', json: { code, trustDevice } });
    setMfaPending(false);
    const result = await request<{ user: User }>('/api/me');
    setUser(result.user);
  }, error=>showToast(authErrorMessage(error,locale,'mfa'),'error')); };
  const sendMfaOtp = async () => {
    await request('/api/auth/two-factor/send-otp', { method: 'POST', json: {} });
  };
  const refreshMe = async () => {
    const result = await request<{ user: User }>('/api/me');
    setUser(result.user);
  };
  const logout = () => void run(async () => { await request('/api/auth/sign-out', { method: 'POST', json: {} }); setUser(null); setLocale('es'); setSelected(''); setProjects([]); setPendingProjectDeletions([]); setProjectToRemove(null); setFiles([]); setJobs([]); setCredentials([]); setRunners([]); });
  const createProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (planDirty || workflowDirty || rupDirty || outlineDirty || templateValuesDirty || factsDirty || rejectionDirty || blindDirty || evaluationDirty) return;
    const en = locale === 'en';
    const parsed = z.object({
      title: z.string().trim()
        .min(2, en ? 'Enter at least 2 characters.' : 'Ingresa al menos 2 caracteres.')
        .max(300, en ? 'Maximum 300 characters.' : 'Máximo 300 caracteres.'),
    }).safeParse({ title: newProjectTitle });
    if (!parsed.success) {
      setNewProjectError(parsed.error.issues[0]?.message || (en ? 'Invalid title.' : 'Nombre inválido.'));
      return;
    }
    setNewProjectError('');
    void run(async () => {
      const data = await request<{ project: Project }>('/api/projects', { method: 'POST', json: { title: parsed.data.title } });
      await loadAccount();
      setSelected(data.project.id);
      setNewProjectTitle('');
      setProjectCreateOpen(false);
    });
  };
  const sendUpload = (pending: {projectId: string; file: File; key: string}) => { void run(async () => { if (pending.file.size > 50 * 1024 * 1024) { setUploadProgress(0); try { await uploadLargeProjectFile({projectId:pending.projectId,file:pending.file,key:pending.key,request,onProgress:(uploaded,total)=>setUploadProgress(Math.floor(uploaded/total*100))}); } finally { setUploadProgress(null); } } else await request(`/api/projects/${pending.projectId}/files`, { method: 'POST', body: pending.file, headers: { 'content-type': pending.file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(pending.file.name), 'idempotency-key': pending.key } }); const data = await request<{ files: FileItem[] }>(`/api/projects/${pending.projectId}/files`); if (selectedRef.current === pending.projectId) setFiles(data.files); setPendingUpload(current => current?.key === pending.key ? null : current); showToast(t.saved, 'success'); }); };
  const upload = (event: FormEvent<HTMLInputElement>) => { const input = event.currentTarget; const file = input.files?.[0]; input.value = ''; if (!file || !selected) return; if (file.size > 1024 * 1024 * 1024) { showToast(locale === 'es' ? 'El documento supera el límite de 1 GiB.' : 'The document exceeds the 1 GiB limit.', 'error'); return; } const pending = {projectId: selected, file, key: crypto.randomUUID()}; setPendingUpload(pending); sendUpload(pending); };
  const saveCredential = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const contextTokens = data.get('contextTokens') ? Number(data.get('contextTokens')) : 400000; const outputTokens = data.get('outputTokens') ? Number(data.get('outputTokens')) : 16384; if (data.get('provider') === 'xiaomi-api' && /^\s*t?tp-/.test(String(data.get('secret') || ''))) { showToast(locale === 'es' ? 'Usa una clave de la API estándar de Xiaomi; las claves Token Plan son para programación.' : 'Use a standard Xiaomi API key; Token Plan keys are for coding.', 'error'); return; } if (['fireworks-api', 'ant-ling-api', 'opencode-zen'].includes(String(data.get('provider'))) && !findCatalogModel(String(data.get('provider')), String(data.get('model') || '').trim())) { showToast(locale === 'es' ? 'Elige un modelo de este proveedor del catálogo de Pi.' : 'Choose a model for this provider from the Pi catalog.', 'error'); return; } if (outputTokens > contextTokens) { showToast(locale === 'es' ? 'La salida no puede superar el contexto.' : 'Output cannot exceed the context window.', 'error'); return; } if (['xai-api', 'azure-openai-api'].includes(String(data.get('provider'))) && outputTokens < 16) { showToast(locale === 'es' ? 'Este proveedor requiere al menos 16 tokens de salida.' : 'This provider requires at least 16 output tokens.', 'error'); return; } void run(async () => { await request('/api/provider-credentials', { method: 'POST', json: { provider: data.get('provider'), model: data.get('model'), secret: data.get('secret'), ...(data.get('provider') === 'azure-openai-api' ? { resource: data.get('resource') } : {}), contextTokens, outputTokens } }); form.reset(); setCredentialFormVersion(value => value + 1); await loadAccount(); showToast(t.saved, 'success'); }); };
  const previousJob = jobs.find(job => job.kind === 'tender-chat.send' && !(job.payload as {wordAssistance?:boolean}).wordAssistance && job.state === 'succeeded' && job.result?.answer && job.payload.fileIds?.length === selectedFiles.length && job.payload.fileIds.every(id => selectedFiles.includes(id)));
  const clearChat = async () => {
    const projectId = selected;
    if (!projectId || busy) return false;
    setBusy(true);
    try {
      await request(`/api/projects/${encodeURIComponent(projectId)}/chat-history`, { method: 'DELETE' });
      if (selectedRef.current === projectId) { setJobs(current => current.filter(job => job.kind !== 'tender-chat.send')); setQuestion(''); }
      showToast(locale === 'es' ? 'Conversación eliminada.' : 'Conversation deleted.', 'success');
      return true;
    } catch (error) {
      if ((error as Error & { status?: number }).status === 409) showToast(locale === 'es' ? 'Espera o cancela las consultas activas antes de iniciar otra conversación.' : 'Wait for or cancel active queries before starting a new conversation.', 'error');
      else failure();
      return false;
    } finally { setBusy(false); }
  };
  const send = (text: string) => { if (busy || !text.trim() || !selectedFiles.length || selectedFiles.length > 50 || jobs.some(job=>job.kind==='tender-chat.send'&&!(job.payload as {wordAssistance?:boolean}).wordAssistance&&['queued','running'].includes(job.state))) return; const projectId=selected; void run(async () => { await request(`/api/projects/${projectId}/jobs`, { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, json: { kind: 'tender-chat.send', ...(credential&&credential!=='local-runner'?{credentialId:credential}:{}), payload: { ...(!credential||credential==='local-runner'?{localRunner:true}:{}), question: text, fileIds: selectedFiles, language: locale, dataProcessingConsent: true, ...(continueChat && previousJob ? { previousJobId: previousJob.id } : {}) } } }); if(selectedRef.current!==projectId)return; setQuestion(''); const data = await request<{ jobs: Job[] }>(`/api/projects/${projectId}/jobs`); if(selectedRef.current===projectId)setJobs(data.jobs); }); };
  if (checking) return <div className="web-center"><WebLoading centered message={locale==='es'?'Abriendo Savia…':'Opening Savia…'} detail={locale==='es'?'Estamos preparando tu espacio de trabajo.':'Preparing your workspace.'}/></div>;
  if (connectionError) return <main className="web-center"><div><p>{t.error}</p><Button icon={RefreshCw} iconOnly variant="outline" onClick={() => window.location.reload()}>{t.refresh}</Button></div></main>;
  if (!user || recovery) return <WebAuthScreen language={locale} register={register} busy={busy} authReady={authReady} emailEnabled={authCapabilities.email} registrationEnabled={authCapabilities.registration} passwordRecoveryEnabled={authCapabilities.passwordRecovery} requireVerification={authCapabilities.requireVerification} notice={authNotice} onSubmit={authenticate} onToggleRegister={()=>{setAuthNotice('');setRegister(!register);}} onRecovery={setRecovery} onToggleLanguage={()=>setLocale(locale==='es'?'en':'es')} recovery={recovery&&(recovery==='verify'||authCapabilities.passwordRecovery)?<WebAuthRecovery language={locale} verification={recovery==='verify'} onBack={()=>{setRecovery(null);setUser(null);}}/>:undefined} mfa={mfaPending?<WebAuthMfa language={locale} busy={busy} emailEnabled={authCapabilities.email} onVerify={verifyMfa} onSendOtp={sendMfaOtp} onCancel={()=>setMfaPending(false)}/>:undefined}/>;
  const isSuperadmin = (user.role || '').split(',').map(role => role.trim()).includes('superadmin');
  return <div className={`web-shell${view==='projects'&&selected?(projectTab==='chat'?' web-chat-shell':(projectTab==='prepare'||projectTab==='feasibility'||projectTab==='tracking')?' web-preparation-shell':''):''}`}><AppDialog open={!!projectToRemove} preventClose={busy} onOpenChange={open=>{if(!open&&!busy)setProjectToRemove(null);}} title={locale==='es'?`¿Eliminar «${projectToRemove?.title}»?`:`Delete “${projectToRemove?.title}”?`} description={locale==='es'?'Se eliminarán definitivamente el proyecto, sus documentos y resultados. Las tareas en cola o en ejecución impiden la eliminación. Esta acción no se puede deshacer.':'The project, its documents and results will be permanently deleted. Queued or running tasks prevent deletion. This cannot be undone.'} actions={<><Button variant="outline" disabled={busy} onClick={()=>setProjectToRemove(null)}>{locale==='es'?'Cancelar':'Cancel'}</Button><Button variant="destructive" disabled={busy} onClick={()=>void removeProject()}>{locale==='es'?'Eliminar proyecto':'Delete project'}</Button></>} /><AppDialog open={!!fileToRemove} preventClose={busy} onOpenChange={open => { if (!open && !busy) setFileToRemove(null); }} title={locale === 'es' ? `¿Retirar «${fileToRemove?.name}»?` : `Remove “${fileToRemove?.name}”?`} description={locale === 'es' ? 'El archivo dejará de estar disponible y se eliminará del almacenamiento. Los análisis pueden quedar desactualizados; el texto y las tareas guardadas se conservan. Una tarea que ya descargó el archivo podría continuar.' : 'The file will become unavailable and be removed from storage. Analyses may become outdated; saved text and tasks remain. A task that has already downloaded the file may continue.'} actions={<><Button variant="outline" disabled={busy} onClick={() => setFileToRemove(null)}>{locale === 'es' ? 'Cancelar' : 'Cancel'}</Button><Button variant="destructive" disabled={busy} onClick={() => void removeFile()}>{locale === 'es' ? 'Retirar documento' : 'Remove document'}</Button></>} /><AppDialog open={!!revoke} preventClose={busy} onOpenChange={open => { if (!open && !busy) setRevoke(null); }} title={revoke?.kind === 'runner' ? (locale === 'es' ? `¿Desconectar «${revoke.name}»?` : `Disconnect “${revoke.name}”?`) : (locale === 'es' ? `¿Retirar «${revoke?.name}»?` : `Remove “${revoke?.name}”?`)} description={revoke?.kind === 'runner' ? (locale === 'es' ? 'Este equipo perderá acceso al espacio y las tareas en curso pueden interrumpirse. Puedes volver a conectarlo con un código nuevo.' : 'This machine will lose access to the workspace and running tasks may be interrupted. You can connect it again with a new code.') : (locale === 'es' ? 'Las nuevas tareas no podrán usar esta credencial. Una tarea que ya recibió la clave podría continuar.' : 'New tasks cannot use this credential. A task that has already received the key may continue.')} actions={<><Button variant="outline" disabled={busy} onClick={() => setRevoke(null)}>{locale === 'es' ? 'Cancelar' : 'Cancel'}</Button><Button variant="destructive" disabled={busy} onClick={() => void confirmRevoke()}>{revoke?.kind === 'runner' ? (locale === 'es' ? 'Desconectar' : 'Disconnect') : (locale === 'es' ? 'Retirar credencial' : 'Remove credential')}</Button></>} /><AppDialog open={!!pendingNavigation} onOpenChange={open => { if (!open) setPendingNavigation(null); }} title={locale === 'es' ? 'Cambios sin guardar' : 'Unsaved changes'} description={locale === 'es' ? '¿Descartar los cambios sin guardar?' : 'Discard unsaved changes?'} actions={<><Button variant="outline" onClick={() => setPendingNavigation(null)}>{locale === 'es' ? 'Cancelar' : 'Cancel'}</Button><Button variant="destructive" onClick={() => { const action = pendingNavigation; setPendingNavigation(null); setPlanDirty(false); setRupDirty(false); setWorkflowDirty(false); setOutlineDirty(false); setTemplateValuesDirty(false); setFactsDirty(false); setCertificatesDirty(false); setBlindDirty(false); setEvaluationDirty(false); setFeasibilityDirty(false); setProfileDirty(false); setExperienceDirty(false); setExportFormatDirty(false); action?.(); }}>{locale === 'es' ? 'Descartar' : 'Discard'}</Button></>} /><aside className={`web-sidebar${sidebarCollapsed?' is-collapsed':''}`}><div className="web-sidebar-heading"><div className="web-brand"><Leaf size={22} /><span> Savia</span></div><Button variant="ghost" size="icon" className="web-sidebar-toggle" aria-label={sidebarCollapsed?(locale==='es'?'Expandir menú lateral':'Expand sidebar'):(locale==='es'?'Contraer menú lateral':'Collapse sidebar')} title={sidebarCollapsed?(locale==='es'?'Expandir menú lateral':'Expand sidebar'):(locale==='es'?'Contraer menú lateral':'Collapse sidebar')} aria-expanded={!sidebarCollapsed} onClick={()=>setSidebarCollapsed(value=>!value)}>{sidebarCollapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</Button></div><WebNavigation key={user.id} collapsed={sidebarCollapsed} onExpand={()=>setSidebarCollapsed(false)} language={locale} active={['knowledge','images','export-format'].includes(view)?'knowledge':['company-profile','company-experience','company-certificates','rup'].includes(view)?'company-profile':['duplicate-reviews','rejection-reviews'].includes(view)?'projects':['runners','credentials'].includes(view)?'runners':view} items={([{ id: 'projects', icon: FolderOpen }, { id: 'feasibility', icon: FileCheck2 }, { id: 'secop', icon: Search }, { id: 'market', icon: TrendingUp }, { id: 'agenda', icon: CalendarDays }, { id: 'company-profile', icon: Building2 }, { id: 'knowledge', icon: Library }, { id: 'runners', icon: MonitorCog }, ...(isSuperadmin ? [{ id: 'admin' as const, icon: ShieldCheck }] : [])] as const).filter(item=>!PROJECT_FEASIBILITY_ENABLED||item.id!=='feasibility').map(item=>({...item,label:t[item.id]}))} onSelect={id=>{if(id==='projects')navigateSafely(()=>{setSelected('');setView('projects');setProjectTab('documents');setRouteStep(null);void loadAccount().catch(failure);});else if(view!==id)navigateSafely(()=>setView(id as View));}}/><WebUserMenu user={user} language={locale} market={market} theme={theme} colorTheme={colorTheme} visualStyle={visualStyle} busy={preferenceBusy} error={preferenceError} onChange={changeTheme} onColorChange={changeColorTheme} onStyleChange={changeVisualStyle} onLanguage={changeLanguage} onMarket={changeMarket} onAccount={()=>navigateSafely(()=>setView('account'))} onAdmin={isSuperadmin?()=>navigateSafely(()=>setView('admin')):undefined} onLogout={()=>navigateSafely(logout)}/></aside><main className="web-main"><header><div className="web-header-title"><Button icon={ArrowLeft} iconOnly variant="ghost" onClick={()=>{if(historyDepth.current>0)window.history.back();else if(view==='projects'&&selected)navigateSafely(()=>{setSelected('');setProjectTab('documents');setRouteStep(null);});else if(view!=='secop')navigateSafely(()=>setView('secop'));}}>{locale==='es'?'Volver atrás':'Go back'}</Button><h1>{['knowledge','images','export-format'].includes(view)?t.knowledge:['company-profile','company-experience','company-certificates','rup'].includes(view)?t['company-profile']:t[view]}</h1>{view==='projects'&&selected&&projects.find(project=>project.id===selected)?.title&&<><span className="web-header-separator" aria-hidden="true">/</span><TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><span className="web-header-project" tabIndex={0}>{projects.find(project=>project.id===selected)?.title}</span></TooltipTrigger><TooltipContent className="web-project-title-tooltip">{projects.find(project=>project.id===selected)?.title}</TooltipContent></Tooltip></TooltipProvider></>}</div><div className="web-header-actions">{['knowledge','images','export-format'].includes(view)&&<WebProjectHelp language={locale} area="resources" step={view==='images'?1:view==='export-format'?2:0}/>}{view==='secop'&&<WebProjectHelp language={locale} area="secop" step={opportunityTab==='suggestions'?1:opportunityTab==='changes'?2:0}/>}{view==='projects'&&!selected&&<WebProjectHelp language={locale} area="projects-list"/>}{view==='agenda'&&<WebProjectHelp language={locale} area="agenda"/>}{['runners','credentials'].includes(view)&&<WebProjectHelp language={locale} area="connection" step={view==='credentials'?1:0}/>}{view==='admin'&&isSuperadmin&&<WebProjectHelp language={locale} area="admin"/>}{(view==='account'||(view==='admin'&&!isSuperadmin))&&<WebProjectHelp language={locale} area="account"/>}{['duplicate-reviews','rejection-reviews'].includes(view)&&<WebProjectHelp language={locale} area="cross-reviews"/>}{view==='projects'&&selected&&['documents','chat','reviews','history'].includes(projectTab)&&<WebProjectHelp language={locale} area={projectTab}/>}<WebRunnerActivity compact language={locale} onOpen={()=>navigateSafely(()=>setView('runners'))}/><WebAgendaReminders language={locale} showSettings={false} onOpenAgenda={()=>navigateSafely(()=>setView('agenda'))} /><Sheet open={assistantOpen} onOpenChange={setAssistantOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" className="web-assistant-trigger" aria-label={t.assistant} title={t.assistant}><MessageCircle size={19} aria-hidden="true"/></Button></SheetTrigger><SheetContent side="right" className="web-assistant-panel" overlayClassName="web-assistant-overlay"><SheetHeader><SheetTitle>{t.assistant}</SheetTitle><SheetDescription>{locale==='es'?'Ayuda para preparar tu oferta, paso a paso.':'Help preparing your bid, step by step.'}</SheetDescription></SheetHeader><WebAssistant language={locale} market={market} project={projects.find(project=>project.id===selected)||null} onSearch={()=>{setAssistantOpen(false);navigateSafely(()=>setView('secop'));}} onProjects={()=>{setAssistantOpen(false);navigateSafely(()=>setView('projects'));}}/></SheetContent></Sheet></div></header><div className="web-content">
    {view === 'projects' && <div className="web-project-workspace"><section className="web-detail">{!selected && accountLoading ? <WebLoading message={locale==='es'?'Cargando proyectos…':'Loading projects…'}/> : !selected && accountLoadFailed ? <div role="alert"><p>{locale==='es'?'No se pudieron cargar los proyectos.':'Could not load projects.'}</p><Button variant="outline" onClick={()=>window.location.reload()}>{locale==='es'?'Reintentar':'Retry'}</Button></div> : !selected ? <WebProjectList feasibilityEnabled={PROJECT_FEASIBILITY_ENABLED} projects={projects} language={locale} market={market} onOpenReviews={mode=>navigateSafely(()=>setView(mode==='rejection'?'rejection-reviews':'duplicate-reviews'))} onRemove={id=>{const project=projects.find(item=>item.id===id);if(project)navigateSafely(()=>setProjectToRemove(project));}} onOpen={(id,tab,focus)=>navigateSafely(()=>{if(tab==='tracking'&&(focus==='prepare'||focus==='submit'||focus==='after')){const url=new URL(window.location.href);url.search='';url.searchParams.set('view','projects');url.searchParams.set('project',id);url.searchParams.set('tab','tracking');url.searchParams.set('tracking',focus);window.history.pushState(null,'',url);window.dispatchEvent(new Event('savia:route-detail'));}setReviewFocus(tab==='reviews'&&(focus==='duplicates'||focus==='rejection')?focus:null);setSelected(id);setProjectTab(tab);setRouteStep(null);setProjectFileSearch('');})}><Button icon={Plus} size="sm" type="button" disabled={busy} onClick={() => { setNewProjectError(''); setProjectCreateOpen(true); }}>{locale === 'es' ? 'Nuevo proyecto' : 'New project'}</Button><Sheet open={projectCreateOpen} onOpenChange={open => { if (!busy) { setProjectCreateOpen(open); if (!open) setNewProjectError(''); } }}><SheetContent side="right" className="web-admin-sheet"><SheetHeader><SheetTitle>{locale === 'es' ? 'Nuevo proyecto' : 'New project'}</SheetTitle><SheetDescription>{locale === 'es' ? 'Crea un proyecto para cargar pliegos, analizar el RUP y redactar tu oferta.' : 'Create a project to upload tender documents, analyze requirements and draft your bid.'}</SheetDescription></SheetHeader><form className="web-admin-sheet-form" onSubmit={createProject} noValidate><label className="web-admin-sheet-field"><span>{t.newProject}</span><Input value={newProjectTitle} onChange={event => { setNewProjectTitle(event.target.value); if (newProjectError) setNewProjectError(''); }} placeholder={locale === 'es' ? 'Ej. Licitación pública 014 de 2026' : 'E.g., Public tender 014-2026'} maxLength={300} disabled={busy} />{newProjectError && <p className="web-admin-field-error" role="alert">{newProjectError}</p>}</label><div className="web-admin-sheet-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => setProjectCreateOpen(false)}>{locale === 'es' ? 'Cancelar' : 'Cancel'}</Button><Button icon={Plus} type="submit" disabled={busy}>{t.create}</Button></div></form></SheetContent></Sheet>{pendingProjectDeletions.length>0&&<ProjectRemovalControls language={locale} project={null} pending={pendingProjectDeletions} busy={busy} onRemove={()=>{}} onRetry={id=>void retryProjectDeletion(id)}/>}</WebProjectList> : projectDataFailed===selected ? <div role="alert"><p>{locale==='es'?'No se pudo cargar el proyecto.':'Could not load the project.'}</p><Button variant="outline" onClick={()=>window.location.reload()}>{locale==='es'?'Reintentar':'Retry'}</Button></div> : projectDataReady!==selected ? <WebLoading message={locale==='es'?'Cargando proyecto…':'Loading project…'} detail={locale==='es'?'Consultamos sus documentos y tareas.':'Retrieving its documents and tasks.'}/> : <>{projectTab!=='chat'&&projectTab!=='prepare'&&projectTab!=='feasibility'&&<WebJobQuestions key={`WebJobQuestions-${selected}`} projectId={selected} language={locale} />}<Tabs value={projectTab} onValueChange={next => navigateSafely(() => { setReviewFocus(null); setProjectTab(next); })} className="web-project-tabs"><div className="web-project-ai-setup" hidden={projectTab!=='reviews'}><div><strong>{locale==='es'?'Documentos seleccionados':'Selected documents'}</strong><p>{locale==='es'?`${selectedFiles.length} disponibles para las revisiones. Puedes cambiarlos en Documentos.`:`${selectedFiles.length} available for reviews. Change them in Documents.`}</p></div><></><></></div><TabsContent value="feasibility" className="web-project-panel">{PROJECT_FEASIBILITY_ENABLED && <WebFeasibility key={selected} projectId={selected} projectDefaults={(() => { const current = projects.find(item => item.id === selected); return current ? { projectName: current.title, contractingEntity: current.tenderSummary?.contractingEntity || '', constructionContent: current.tenderSummary?.object || '', location: current.tenderSummary?.location || '' } : null; })()} projectFiles={files.filter(file=>!file.deleting).map(file=>({id:file.id,name:file.name}))} onOpenProjectFiles={()=>{setProjectTab('documents');requestAnimationFrame(()=>document.querySelector('.web-document-library')?.setAttribute('open',''));}} language={locale} credentials={aiCredentials} onDirtyChange={setFeasibilityDirty} />}</TabsContent><TabsContent forceMount value="documents" className="web-project-panel"><div id="web-preflight-details"><WebProjectSecop key={`WebProjectSecop-${selected}`} projectId={selected} language={locale} jobs={jobs} onRefresh={async () => { const data = await request<{ jobs: Job[] }>(`/api/projects/${selected}/jobs`); setJobs(data.jobs); }} /></div><details className="web-document-library" open><summary><span>{locale==='es'?'Gestionar documentos':'Manage documents'}</span><span>{files.length} {locale==='es'?'archivos':'files'}{selectedFiles.length!==files.length && ` · ${selectedFiles.length} ${locale==='es'?'seleccionados':'selected'}`}</span></summary><div className="web-project-documents-heading"><div><p>{locale==='es'?'Selecciona los documentos que quieres consultar o usar para preparar la oferta.':'Select the documents to ask questions or prepare your bid.'}</p></div><Button variant="outline" disabled={!selectedFiles.length} onClick={()=>setProjectTab('chat')}>{locale==='es'?'Consultar selección':'Ask selection'}</Button></div><Input className="web-project-file-search" aria-label={locale==='es'?'Buscar documento':'Find document'} placeholder={locale==='es'?'Buscar documento por nombre…':'Find document by name…'} value={projectFileSearch} onChange={event=>setProjectFileSearch(event.target.value)}/><label className="web-upload web-project-upload">{t.upload}<input type="file" accept=".txt,.md,.markdown,.doc,.docx,.wps,.pdf,.xls,.xlsx,.zip" onChange={upload} disabled={busy} /></label>{pendingUpload?.projectId === selected && uploadProgress !== null && <p role="status">{uploadProgress < 100 ? (locale === 'es' ? `Subiendo: ${uploadProgress}%` : `Uploading: ${uploadProgress}%`) : (locale === 'es' ? 'Verificando el documento…' : 'Verifying the document…')}</p>}{pendingUpload?.projectId === selected && !busy && <Button size="sm" variant="outline" onClick={() => sendUpload(pendingUpload)}>{locale === 'es' ? `Reintentar carga: ${pendingUpload.file.name}` : `Retry upload: ${pendingUpload.file.name}`}</Button>}{files.length ? <div className="web-files">{!files.some(file=>file.name.toLocaleLowerCase().includes(projectFileSearch.toLocaleLowerCase())) && <p role="status">{locale==='es'?'No hay documentos con ese nombre.':'No documents match that name.'}</p>}{files.filter(file=>file.name.toLocaleLowerCase().includes(projectFileSearch.toLocaleLowerCase())).map(file => <div className="web-project-file" key={file.id}><label><input type="checkbox" disabled={!!file.deleting || /\.zip$/i.test(file.name)} checked={!file.deleting && !/\.zip$/i.test(file.name) && selectedFiles.includes(file.id)} onChange={e => setSelectedFiles(e.target.checked ? [...selectedFiles, file.id] : selectedFiles.filter(id => id !== file.id))} /><span>{file.name}{/\.zip$/i.test(file.name) && <small className="web-file-pending">{locale === 'es' ? 'Paquete: no se analiza como documento' : 'Package: not analyzed as a document'}</small>}{!!file.deleting && <small className="web-file-pending">{locale === 'es' ? 'Eliminación pendiente' : 'Deletion pending'}</small>}</span></label><div className="web-file-actions">{!file.deleting && <a className="web-link" href={`/api/projects/${encodeURIComponent(selected)}/files/${encodeURIComponent(file.id)}`}>{locale === 'es' ? 'Descargar' : 'Download'}</a>}<Button icon={RefreshCw} iconOnly size="sm" variant="ghost" disabled={busy} aria-label={locale === 'es' ? `Retirar ${file.name}` : `Remove ${file.name}`} onClick={() => setFileToRemove(file)}>{file.deleting ? (locale === 'es' ? 'Reintentar' : 'Retry') : (locale === 'es' ? 'Retirar' : 'Remove')}</Button></div></div>)}</div> : <p>{t.noFiles}</p>}</details></TabsContent><TabsContent forceMount value="chat" className="web-project-panel"><WebProjectChat key={`chat-${selected}`} language={locale} files={files} selectedFiles={selectedFiles} onFiles={setSelectedFiles} credentials={activeCredentials} credential={projectCredential} onCredential={()=>navigateSafely(()=>setView('credentials'))} question={question} onQuestion={setQuestion} continueChat={continueChat} onContinue={setContinueChat} hasPrevious={!!previousJob} jobs={jobs} busy={busy} onSend={send} onClear={clearChat} onCredentials={()=>navigateSafely(()=>setView('credentials'))} onCancel={id=>void run(async()=>{await request(`/api/projects/${selected}/jobs/${id}/cancel`,{method:'POST'});const data=await request<{jobs:Job[]}>(`/api/projects/${selected}/jobs`);setJobs(data.jobs);})}>{projectTab==='chat'&&<WebJobQuestions key={`WebJobQuestions-${selected}`} projectId={selected} language={locale} />}<WebImportedChat key={`WebImportedChat-${selected}`} projectId={selected} language={locale}/></WebProjectChat></TabsContent><TabsContent forceMount value="prepare" className="web-project-panel"><WebPreparationWizard key={`wizard-${selected}`} projectId={selected} language={locale} files={files} selectedFiles={selectedFiles} onFiles={setSelectedFiles} credentials={activeCredentials} credential={projectCredential} onCredential={()=>navigateSafely(()=>setView('credentials'))} enabled={projectTab==='prepare'} deliveryRequest={deliveryRequest} routeStep={routeStep} onRouteStep={setRouteStep} jobs={jobs} onDocuments={()=>{setProjectTab('documents');requestAnimationFrame(()=>document.querySelector('.web-document-library')?.setAttribute('open',''));}} analysis={<WebTechnicalAnalysis key={`WebTechnicalAnalysis-${selected}`} projectId={selected} language={locale} fileIds={selectedFiles} files={files.filter(file => !file.deleting)} credentialId={projectCredential} consent={consent} />} outline={<WebTechnicalOutline key={`WebTechnicalOutline-${selected}`} projectId={selected} language={locale} fileIds={selectedFiles} credentialId={projectCredential} consent={consent} onDirtyChange={setOutlineDirty} planDirty={planDirty || factsDirty} outlineDirty={outlineDirty} onApplied={() => setPlanReload(value => value + 1)} />} facts={<WebGlobalFacts key={`WebGlobalFacts-${selected}`} projectId={selected} language={locale} fileIds={selectedFiles} credentialId={projectCredential} consent={consent} otherPlanDirty={planDirty || outlineDirty} onDirtyChange={setFactsDirty} onPlanChanged={() => setPlanReload(value => value + 1)} onFactsStatusChange={setFactsStatus} />} plan={<fieldset disabled={busy}><WebTechnicalPlan key={`${selected}-${planReload}`} projectId={selected} language={locale} onDirtyChange={setPlanDirty} credentialId={projectCredential} fileIds={selectedFiles} consent={consent} jobs={jobs} templateSelection={templateSelection} templateValuesDirty={templateValuesDirty} factsDirty={factsDirty} factsStatus={factsStatus} /></fieldset>}/></TabsContent><TabsContent forceMount value="tracking" className="web-project-panel"><section className="web-tracking-page"><WebWorkflow key={`WebWorkflow-${selected}`} projectId={selected} language={locale} onDirtyChange={setWorkflowDirty} fileIds={selectedFiles} projectFiles={files} credentialId={projectCredential} credentialLabel={credentials.find(item => item.id === credential)?.model || ''} /></section></TabsContent><TabsContent forceMount value="reviews" className="web-project-panel web-review-page"><h1>{locale==='es'?'Revisa tu oferta':'Review your bid'}</h1><p>{locale==='es'?'Revisa tu oferta antes de presentarla: rechazo, anonimato, evaluación y duplicados.':'Review your bid before submission: rejection risks, anonymity, evaluation and duplicates.'}</p><WebRejectionCheck key={`WebRejectionCheck-${selected}-${reviewFocus==='rejection'?'open':'closed'}`} defaultOpen={reviewFocus==='rejection'} projectId={selected} language={locale} files={files} jobs={jobs} credentialId={projectCredential} onDirtyChange={setRejectionDirty} onRefresh={async () => { const data = await request<{ jobs: Job[] }>(`/api/projects/${selected}/jobs`); setJobs(data.jobs); }} /><WebBlindCheck key={`WebBlindCheck-${selected}`} projectId={selected} language={locale} files={files} jobs={jobs} credentialId={projectCredential} onDirtyChange={setBlindDirty} onRefresh={async () => { const data = await request<{ jobs: Job[] }>(`/api/projects/${selected}/jobs`); setJobs(data.jobs); }} /><WebBidEvaluation key={`WebBidEvaluation-${selected}`} projectId={selected} language={locale} files={files} jobs={jobs} credentialId={projectCredential} onDirtyChange={setEvaluationDirty} onRefresh={async () => { const data = await request<{ jobs: Job[] }>(`/api/projects/${selected}/jobs`); setJobs(data.jobs); }} /><WebDuplicateCheck key={`WebDuplicateCheck-${selected}-${reviewFocus==='duplicates'?'open':'closed'}`} defaultOpen={reviewFocus==='duplicates'} projectId={selected} language={locale} files={files} jobs={jobs} onRefresh={async () => { const data = await request<{ jobs: Job[] }>(`/api/projects/${selected}/jobs`); setJobs(data.jobs); }} /><WebPreflight key={`WebPreflight-${selected}`} projectId={selected} language={locale} onNavigate={target=>{setProjectTab(target==='details'?'documents':'prepare');if(target!=='details')setDeliveryRequest(value=>value+1);}} /></TabsContent><TabsContent value="history" className="web-project-panel"><WebProjectHistory key={`history-${selected}`} projectId={selected} language={locale} jobs={jobs}/><WebImportedSavedTender key={`WebImportedSavedTender-${selected}`} projectId={selected} language={locale} /><WebAddendumHistory key={`WebAddendumHistory-${selected}`} projectId={selected} language={locale} /></TabsContent></Tabs></>}</section></div>}
    {view === 'account' && <WebAccount user={user} language={locale} onUserUpdated={refreshMe} />}
    {view === 'admin' && (isSuperadmin ? <WebAdmin language={locale} currentUserId={user.id} /> : <WebAccount user={user} language={locale} onUserUpdated={refreshMe} />)}
    {view === 'market' && <WebMarket language={locale} market={market} />}
    {view === 'agenda' && <WebAgenda language={locale} projects={projects} remindersSlot={<WebAgendaReminders language={locale} showSettings={true} onOpenAgenda={() => navigateSafely(() => setView('agenda'))} />} onOpenProject={(id, tab = 'documents', focus) => navigateSafely(() => { if (tab === 'tracking' && focus) { const url = new URL(window.location.href); url.search = ''; url.searchParams.set('view', 'projects'); url.searchParams.set('project', id); url.searchParams.set('tab', 'tracking'); url.searchParams.set('tracking', focus); window.history.pushState(null, '', url); window.dispatchEvent(new Event('savia:route-detail')); } setSelected(id); setProjectTab(tab); setRouteStep(null); setView('projects'); })} onOpenCertificates={() => navigateSafely(() => setView('company-certificates'))} />}
    {['company-profile','company-experience','company-certificates','rup'].includes(view) && <section className="web-resources web-company-workspace"><div className="web-resources-intro web-company-intro"><WebProjectHelp language={locale} area={view} companyDirty={profileDirty||experienceDirty||certificatesDirty||rupDirty} onCompanyNavigate={value=>setView(value as View)}/><h2>{locale==='es'?'Expediente y credenciales de la empresa':'Company profile & credentials'}</h2><p>{locale==='es'?`Define los datos corporativos, experiencia contractual, certificados y ${accreditationLabel} para reutilizarlos en tus ofertas.`:`Define corporate information, contract experience, certificates and ${accreditationLabel} to reuse across your bids.`}</p></div><Tabs value={view} onValueChange={value=>navigateSafely(()=>setView(value as View))}><TabsList className="web-resources-tabs" aria-label={locale==='es'?'Secciones de la empresa':'Company sections'}><TabsTrigger value="company-profile" data-company-tab="profile">{locale==='es'?'Datos y perfil':'Profile & details'}</TabsTrigger><TabsTrigger value="company-experience" data-company-tab="experience">{locale==='es'?'Experiencia empresarial':'Company experience'}</TabsTrigger><TabsTrigger value="company-certificates" data-company-tab="certificates">{locale==='es'?'Certificados':'Certificates'}</TabsTrigger><TabsTrigger value="rup" data-company-tab="rup">{accreditationLabel}</TabsTrigger></TabsList><TabsContent value="company-profile"><WebCompanyProfile language={locale} onDirtyChange={setProfileDirty} /></TabsContent><TabsContent value="company-experience"><WebCompanyExperience language={locale} onDirtyChange={setExperienceDirty} /></TabsContent><TabsContent value="company-certificates"><WebCompanyCertificates language={locale} onDirtyChange={setCertificatesDirty} /></TabsContent><TabsContent value="rup"><WebRup language={locale} market={market} onDirtyChange={setRupDirty} credentials={aiCredentials} /></TabsContent></Tabs></section>}
    {view === 'secop' && <Tabs value={opportunityTab} onValueChange={setOpportunityTab} className="web-opportunity-tabs"><TabsList aria-label={locale === 'es' ? 'Explorar oportunidades' : 'Explore opportunities'}><TabsTrigger value="search">{market === 'ES' ? (locale === 'es' ? 'Búsqueda PLACSP' : 'PLACSP search') : market === 'CO' ? (locale === 'es' ? 'Búsqueda SECOP' : 'SECOP search') : (locale === 'es' ? 'Búsqueda de licitaciones' : 'Tender search')}</TabsTrigger><TabsTrigger value="suggestions">{locale === 'es' ? 'Recomendaciones para ti' : 'Recommended for you'}</TabsTrigger><TabsTrigger value="changes">{locale === 'es' ? 'Cambios en licitaciones' : 'Tender updates'}</TabsTrigger></TabsList><TabsContent value="search" forceMount><WebSecop language={locale} market={market} onCreated={id => { void loadAccount().then(() => { setSelected(id); setView('projects'); }).catch(failure); }} /></TabsContent><TabsContent value="suggestions" forceMount><WebOpportunitySuggestions onSearch={()=>setOpportunityTab('search')} onModel={()=>navigateSafely(()=>setView('credentials'))} language={locale} credentials={activeCredentials} onOpen={id => { void loadAccount().then(() => { setSelected(id); setView('projects'); }).catch(failure); }} /></TabsContent><TabsContent value="changes" forceMount><WebSecopWatch language={locale} market={market} showEmpty onOpenProject={id => { void loadAccount().then(() => { setSelected(id); setView('projects'); }).catch(failure); }} /></TabsContent></Tabs>}
    {view === 'duplicate-reviews' && <WebDuplicateReviews language={locale} onModeChange={next => navigateSafely(() => setView(next === 'rejection' ? 'rejection-reviews' : 'duplicate-reviews'))} />}
    {view === 'rejection-reviews' && <WebDuplicateReviews language={locale} mode="rejection" onModeChange={next => navigateSafely(() => setView(next === 'rejection' ? 'rejection-reviews' : 'duplicate-reviews'))} />}
    {['knowledge','images','export-format'].includes(view) && <section className="web-resources"><div className="web-resources-intro"><h2>{locale==='es'?'Tus recursos reutilizables':'Your reusable resources'}</h2><p>{view==='knowledge'?(locale==='es'?'Guarda documentos y conocimiento para reutilizarlos al preparar ofertas.':'Save documents and knowledge to reuse when preparing bids.'):view==='images'?(locale==='es'?'Guarda imágenes para utilizarlas en tus documentos.':'Keep images to use in your documents.'):(locale==='es'?'Edita documentos Word y configura el formato de futuras exportaciones.':'Edit Word documents and set the format for future exports.')}</p></div><Tabs value={view} onValueChange={value=>navigateSafely(()=>setView(value as View))}><TabsList className="web-resources-tabs" aria-label={locale==='es'?'Tipos de recursos':'Resource types'}><TabsTrigger value="knowledge" data-resource-tab="documents">{locale==='es'?'Documentos':'Documents'}</TabsTrigger><TabsTrigger value="images" data-resource-tab="images">{locale==='es'?'Imágenes':'Images'}</TabsTrigger><TabsTrigger value="export-format" data-resource-tab="word">{locale==='es'?'Formato Word':'Word format'}</TabsTrigger></TabsList><TabsContent value="knowledge"><WebKnowledgeLibrary language={locale} credentials={aiCredentials} /></TabsContent><TabsContent value="images"><WebImageLibrary language={locale} /></TabsContent><TabsContent value="export-format"><WebExportFormat language={locale} onDirtyChange={setExportFormatDirty} /></TabsContent></Tabs></section>}
    {['runners','credentials'].includes(view) && <WebConnectionHeader language={locale} view={view as 'runners'|'credentials'} onChange={value=>navigateSafely(()=>setView(value))} accountModel={credentials.find(item=>item.id===credential)?.model || (localModel.active ? localModel.model || '' : '')} />}
    {view === 'runners' && <WebRunnerSetup language={locale} onDisconnect={r=>setRevoke({kind:'runner',id:r.id,name:r.name})} />}
    {view === 'credentials' && <section className="web-narrow"><WebLocalModel key={credential||'local'} language={locale} onSelected={loadAccount}/><h2>{locale==='es'?'Modelo de la cuenta':'Account model'}</h2><p>{locale==='es'?'Selecciona un modelo de la cuenta o usa el configurado en tu conector.':'Select an account model or use the one configured in your connector.'}</p><div className="web-admin-sheet-field"><span>{locale==='es'?'Modelo predeterminado':'Default model'}</span><SelectField value={credential} disabled={busy} aria-label={locale==='es'?'Modelo predeterminado':'Default model'} placeholder={locale==='es'?'Selecciona un modelo':'Choose a model'} options={[{value:'',label:locale==='es'?'Selecciona un modelo':'Choose a model'},...credentials.map(item=>({value:item.id,label:`${item.provider} · ${item.model}`}))]} onChange={selectAccountModel}/></div><p>{t.credentialHelp}</p><form className="web-stack" onSubmit={saveCredential}><WebCredentialModel key={credentialFormVersion} language={locale} /><Button icon={Save} type="submit" disabled={busy}>{t.save}</Button></form><div className="web-list">{credentials.length ? credentials.map(c => <div key={c.id}><strong>{c.provider}</strong><p>{c.model}</p><p>{locale === 'es' ? 'Contexto' : 'Context'}: {(c.contextTokens ?? 400000).toLocaleString(locale)} · {locale === 'es' ? 'Salida' : 'Output'}: {(c.outputTokens ?? 16384).toLocaleString(locale)}</p><Button variant="outline" size="sm" disabled={busy} aria-label={locale === 'es' ? `Retirar credencial ${c.provider} · ${c.model}` : `Remove credential ${c.provider} · ${c.model}`} onClick={() => setRevoke({ kind: 'credential', id: c.id, name: `${c.provider} · ${c.model}` })}>{locale === 'es' ? 'Retirar credencial' : 'Remove credential'}</Button></div>) : <p>{t.noCredential}</p>}</div></section>}
  </div></main></div>;
}

export default function WebApp() {
  const [locale, setLocale] = useState<Locale>('es');
  const [market, setMarket] = useState<ProcurementMarket>('ALL');
  const [theme, setTheme] = useState<WebTheme>('system');
  const [colorTheme, setColorTheme] = useState<ColorTheme>('neutral');
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('vega');
  useEffect(() => { document.documentElement.dataset.colorTheme = colorTheme; document.documentElement.dataset.uiStyle = visualStyle; }, [colorTheme, visualStyle]);
  useEffect(() => bindWebTheme(theme, document.documentElement, window.matchMedia('(prefers-color-scheme: dark)')), [theme]);
  const [user, setUser] = useState<User | null>(null);
  const [preferenceReadyFor, setPreferenceReadyFor] = useState<User | null>(null);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const preferenceSavingRef = useRef(false);
  const [preferenceError, setPreferenceError] = useState(false);
  const userRef = useRef(user); userRef.current = user;
  useEffect(() => {
    preferenceSavingRef.current = false; setPreferenceSaving(false);
    if (!user) { setMarket('ALL'); setTheme('system'); setColorTheme('neutral'); setVisualStyle('vega'); setPreferenceReadyFor(null); setPreferenceError(false); return; }
    const controller = new AbortController(), sessionUser = user;
    setPreferenceReadyFor(null); setPreferenceError(false);
    void request<{language: Locale; market?: ProcurementMarket; theme: WebTheme; colorTheme: ColorTheme; visualStyle: VisualStyle}>('/api/preferences', {signal: controller.signal}).then(data => {
      if (!controller.signal.aborted && userRef.current === sessionUser) { setLocale(data.language === 'en' ? 'en' : 'es'); setMarket(data.market === 'CO' || data.market === 'ES' ? data.market : 'ALL'); setTheme(['light', 'dark', 'system'].includes(data.theme) ? data.theme : 'system'); setColorTheme(COLOR_THEMES.includes(data.colorTheme) ? data.colorTheme : 'neutral'); setVisualStyle(VISUAL_STYLES.includes(data.visualStyle) ? data.visualStyle : 'vega'); }
    }).catch(() => { if (!controller.signal.aborted && userRef.current === sessionUser) setPreferenceError(true); }).finally(() => {
      if (!controller.signal.aborted && userRef.current === sessionUser) setPreferenceReadyFor(sessionUser);
    });
    return () => controller.abort();
  }, [user]);
  const preferenceBusy = preferenceSaving || (!!user && preferenceReadyFor !== user);
  const savePreferences = useCallback((update: {language?: Locale; market?: ProcurementMarket; theme?: WebTheme; colorTheme?: ColorTheme; visualStyle?: VisualStyle}) => {
    if (!user) { if (update.language) setLocale(update.language); if (update.market) setMarket(update.market); if (update.theme) setTheme(update.theme); if (update.colorTheme) setColorTheme(update.colorTheme); if (update.visualStyle) setVisualStyle(update.visualStyle); return; }
    if (preferenceBusy || preferenceSavingRef.current) return;
    const sessionUser = user;
    preferenceSavingRef.current = true; setPreferenceSaving(true); setPreferenceError(false);
    void request<{language: Locale; market?: ProcurementMarket; theme: WebTheme; colorTheme: ColorTheme; visualStyle: VisualStyle}>('/api/preferences', {method: 'PUT', json: update}).then(data => {
      if (userRef.current === sessionUser) { setLocale(data.language === 'en' ? 'en' : 'es'); if (data.market) setMarket(data.market === 'CO' || data.market === 'ES' ? data.market : 'ALL'); setTheme(['light', 'dark', 'system'].includes(data.theme) ? data.theme : 'system'); setColorTheme(COLOR_THEMES.includes(data.colorTheme) ? data.colorTheme : 'neutral'); setVisualStyle(VISUAL_STYLES.includes(data.visualStyle) ? data.visualStyle : 'vega'); }
    }).catch(() => { if (userRef.current === sessionUser) setPreferenceError(true); }).finally(() => { if (userRef.current === sessionUser) { preferenceSavingRef.current = false; setPreferenceSaving(false); } });
  }, [user, preferenceBusy]);
  const changeLanguage = useCallback((requested: AppLocale) => savePreferences({language: requested === 'en' ? 'en' : 'es'}), [savePreferences]);
  const changeMarket = useCallback((next: ProcurementMarket) => savePreferences({market: next}), [savePreferences]);
  const changeTheme = useCallback((next: WebTheme) => savePreferences({theme: next}), [savePreferences]);
  const changeColorTheme = useCallback((next: ColorTheme) => savePreferences({colorTheme: next}), [savePreferences]);
  const changeVisualStyle = useCallback((next: VisualStyle) => savePreferences({visualStyle: next}), [savePreferences]);
  return <ControlledLanguageProvider language={locale} onLanguageChange={changeLanguage}><ToastProvider><Workspace locale={locale} setLocale={setLocale} market={market} changeMarket={changeMarket} user={user} setUser={setUser} changeLanguage={changeLanguage} theme={theme} changeTheme={changeTheme} colorTheme={colorTheme} changeColorTheme={changeColorTheme} visualStyle={visualStyle} changeVisualStyle={changeVisualStyle} preferenceBusy={preferenceBusy} preferenceError={preferenceError} /></ToastProvider></ControlledLanguageProvider>;
}
