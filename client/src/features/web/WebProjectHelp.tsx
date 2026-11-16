import {useState} from 'react';
import {CircleHelp,Play} from 'lucide-react';
import {Joyride,STATUS,type Step} from 'react-joyride';
import {Popover,PopoverContent,PopoverTrigger} from '@/shared/ui/primitives/popover';
import {ActionButton} from '@/shared/ui/ActionButton';
import {Button} from '@/shared/ui/primitives/button';
type Language='es'|'en';
type GuideItem={target:string;title:string;content:string;companyArea?:string};
const guides:Record<string,Record<Language,GuideItem[]>>={
"company-profile":{es:[{target:"[data-company-tab=\"profile\"]",title:"Datos y perfil",content:"Guarda los datos de tu empresa y sus cambios para reutilizarlos en tus ofertas."}],en:[{target:"[data-company-tab=\"profile\"]",title:"Profile & details",content:"Save your company details for reuse in bids."}]},
"company-experience":{es:[{target:"[data-company-tab=\"experience\"]",title:"Experiencia empresarial",content:"Registra contratos y proyectos de tu empresa con sus soportes."}],en:[{target:"[data-company-tab=\"experience\"]",title:"Company experience",content:"Record company contracts and projects with their supporting documents."}]},
"company-certificates":{es:[{target:"[data-company-tab=\"certificates\"]",title:"Certificados",content:"Organiza los certificados de tu empresa y sus fechas de vigencia."}],en:[{target:"[data-company-tab=\"certificates\"]",title:"Certificates",content:"Organize company certificates and their validity dates."}]},
"rup":{es:[{target:"[data-company-tab=\"rup\"]",title:"RUP",content:"Selecciona un PDF de hasta 25 MiB y guárdalo; después puedes analizarlo y revisar los datos extraídos."}],en:[{target:"[data-company-tab=\"rup\"]",title:"Bidder registration",content:"Choose and save a PDF up to 25 MiB, then analyze it and review the extracted data."}]},
 resources:{es:[{target:'[data-resource-tab="documents"]',title:'Documentos',content:'Guarda documentos de referencia y reutiliza su conocimiento al preparar una oferta.'},{target:'[data-resource-tab="images"]',title:'Imágenes',content:'Guarda imágenes para utilizarlas en tus documentos.'},{target:'[data-resource-tab="word"]',title:'Formato Word',content:'Edita un Word o configura el formato que usarán las futuras exportaciones.'}],en:[{target:'[data-resource-tab="documents"]',title:'Documents',content:'Keep reference documents and reuse their knowledge when preparing a bid.'},{target:'[data-resource-tab="images"]',title:'Images',content:'Keep images to use in your documents.'},{target:'[data-resource-tab="word"]',title:'Word format',content:'Edit a Word document or set the format used by future exports.'}]},
 documents:{es:[{target:'#web-preflight-details',title:'Ficha de la licitación',content:'Consulta los datos de SECOP y busca nuevos documentos oficiales.'},{target:'.web-document-library',title:'Gestionar documentos',content:'Sube, busca y selecciona los archivos que utilizarás en el proyecto.'}],en:[{target:'#web-preflight-details',title:'Tender details',content:'Review SECOP details and find official documents.'},{target:'.web-document-library',title:'Manage documents',content:'Upload, find and select the files used in your project.'}]},
 chat:{es:[{target:'.web-chat-heading',title:'Opciones del chat',content:'Elige los documentos que servirán de fuente y comienza una conversación nueva cuando la necesites.'},{target:'.web-chat-composer',title:'Pregunta a Savia',content:'Escribe una pregunta sobre los documentos. Pulsa Enter para enviarla o Mayús + Enter para otra línea.'}],en:[{target:'.web-chat-heading',title:'Chat options',content:'Choose source documents and start a new conversation when needed.'},{target:'.web-chat-composer',title:'Ask Savia',content:'Ask about your documents. Press Enter to send or Shift + Enter for a new line.'}]},
 reviews:{es:[{target:'.web-project-ai-setup',title:'Documentos seleccionados',content:'Las revisiones usan los documentos del proyecto. Cambia la selección en Documentos cuando sea necesario.'},{target:'.web-review-page > details:nth-of-type(1) > summary',title:'Causales de rechazo',content:'Identifica posibles causales de rechazo y revisa los hallazgos antes de actuar.'},{target:'.web-review-page > details:nth-of-type(2) > summary',title:'Anonimato',content:'Busca información que pueda revelar la identidad del oferente.'},{target:'.web-review-page > details:nth-of-type(3) > summary',title:'Evaluar una oferta',content:'Compara una oferta con los requisitos del pliego y revisa la evidencia.'},{target:'.web-review-page > details:nth-of-type(4) > summary',title:'Duplicados',content:'Compara ofertas para encontrar contenido duplicado.'},{target:'.web-review-page > details:nth-of-type(5) > summary',title:'Antes de presentar',content:'Comprueba los pendientes del proyecto antes de presentar la oferta.'}],en:[{target:'.web-project-ai-setup',title:'Selected documents',content:'Reviews use project documents. Change the selection in Documents when needed.'},{target:'.web-review-page > details:nth-of-type(1) > summary',title:'Rejection risks',content:'Identify potential rejection risks and review the findings.'},{target:'.web-review-page > details:nth-of-type(2) > summary',title:'Anonymity',content:'Find information that could reveal the bidder’s identity.'},{target:'.web-review-page > details:nth-of-type(3) > summary',title:'Evaluate an offer',content:'Compare an offer against tender requirements and review the evidence.'},{target:'.web-review-page > details:nth-of-type(4) > summary',title:'Duplicates',content:'Compare offers for duplicate content.'},{target:'.web-review-page > details:nth-of-type(5) > summary',title:'Before submission',content:'Review outstanding project items before submitting.'}]},
 history:{es:[{target:'.web-project-history',title:'Historial del proyecto',content:'Consulta importaciones, tareas anteriores y su actividad. Revisa los resultados antes de volver a utilizarlos.'}],en:[{target:'.web-project-history',title:'Project history',content:'Review imports, previous tasks and their activity before reusing results.'}]},
  market:{
  es:[
   {target:'[data-market-tab="paa"]',title:'Compras planeadas · PAA',content:'Consulta el Plan Anual de Adquisiciones de entidades públicas, filtra por año o palabra clave y sigue planes para detectar cambios de versión.'},
   {target:'[data-market-tab="history"]',title:'Histórico de contratos',content:'Analiza contratos firmados en SECOP II, proveedores adjudicados y estadísticas de valor mínimo, máximo y promedio.'},
   {target:'[data-market-tab="tvec"]',title:'Órdenes · Tienda Virtual',content:'Explora órdenes de compra de la Tienda Virtual del Estado Colombiano (acuerdos marco) por entidad, proveedor o palabra clave.'}
  ],
  en:[
   {target:'[data-market-tab="paa"]',title:'Planned purchases · PAA',content:'Explore Annual Procurement Plans (PAA) from public entities, filter by year or keyword, and follow plans to track version updates.'},
   {target:'[data-market-tab="history"]',title:'Contract history',content:'Analyze signed SECOP II contracts, awarded suppliers, and minimum, maximum and average value statistics.'},
   {target:'[data-market-tab="tvec"]',title:'Virtual store orders',content:'Browse Colombian State Virtual Store purchase orders (framework agreements) by entity, supplier or keyword.'}
  ]
 },
 secop:{
  es:[
   {target:'.web-secop-searchbar',title:'Búsqueda SECOP',content:'Busca procesos públicos por palabra clave y despliega los filtros avanzados para acotar por fuente, departamento, modalidad, estado o valor.'},
   {target:'.web-opportunity-tabs [role="tablist"]',title:'Recomendaciones para ti',content:'Descubre oportunidades sugeridas según el perfil, la experiencia y el RUP registrados de tu empresa.'},
   {target:'.web-opportunity-tabs [role="tablist"]',title:'Cambios en licitaciones',content:'Revisa adendas, cambios de estado o documentos nuevos detectados en los procesos de tus proyectos.'}
  ],
  en:[
   {target:'.web-secop-searchbar',title:'SECOP search',content:'Search public tenders by keyword and expand advanced filters to narrow by dataset, department, procedure, status or value.'},
   {target:'.web-opportunity-tabs [role="tablist"]',title:'Recommended for you',content:'Discover opportunities matched against your company profile, contract experience and RUP.'},
   {target:'.web-opportunity-tabs [role="tablist"]',title:'Tender updates',content:'Review addenda, status changes or new official documents detected for your project tenders.'}
  ]
 },
 'projects-list':{
  es:[
   {target:'.web-project-list-filters',title:'Tus proyectos',content:'Filtra por nombre o estado, consulta el avance de cada oferta y accede directo a documentos, chat, preparación o seguimiento.'},
   {target:'.web-project-list-header-actions',title:'Nuevo proyecto',content:'Crea un proyecto manualmente para subir pliegos y trabajar en tu oferta desde cero.'}
  ],
  en:[
   {target:'.web-project-list-filters',title:'Your projects',content:'Filter by name or status, review each bid’s progress and jump straight to documents, chat, preparation or tracking.'},
   {target:'.web-project-list-header-actions',title:'New project',content:'Create a project manually to upload tender documents and prepare your bid from scratch.'}
  ]
 },
 agenda:{
  es:[
   {target:'.web-agenda-header',title:'Agenda y plazos',content:'Visualiza fechas de cierre, vencimientos de certificados y tareas pendientes en calendario mensual o vista semanal.'},
   {target:'.web-agenda-header-actions',title:'Personalizar agenda',content:'Activa recordatorios, organiza los paneles visibles o agrega nuevos hitos y notas.'}
  ],
  en:[
   {target:'.web-agenda-header',title:'Schedule & deadlines',content:'Track tender deadlines, certificate expirations and pending tasks in monthly calendar or weekly view.'},
   {target:'.web-agenda-header-actions',title:'Customize schedule',content:'Enable reminders, arrange visible panels or add new milestones and notes.'}
  ]
 },
 connection:{
  es:[
   {target:'.web-connection-header',title:'Conector local',content:'Descarga Savia Conector y vincúlalo con el código de conexión para procesar documentos y ejecutar análisis desde tu equipo.'},
   {target:'.web-connection-header',title:'Modelo de IA',content:'Elige el modelo predeterminado del conector o configura una credencial de API para tu cuenta.'}
  ],
  en:[
   {target:'.web-connection-header',title:'Local connector',content:'Download Savia Connector and pair it with a connection code to process documents and run analyses on your computer.'},
   {target:'.web-connection-header',title:'AI model',content:'Choose the connector’s default model or configure an API credential for your account.'}
  ]
 },
 admin:{
  es:[
   {target:'.web-admin-workspace .web-resources-tabs',title:'Administración',content:'Crea organizaciones aisladas, gestiona usuarios y asigna roles de acceso o superadministrador.'}
  ],
  en:[
   {target:'.web-admin-workspace .web-resources-tabs',title:'Administration',content:'Create isolated organizations, manage user accounts and assign access roles or superadmin permissions.'}
  ]
 },
 account:{
  es:[
   {target:'.web-account-shell .web-resources-tabs',title:'Mi cuenta',content:'Actualiza tu contraseña y configura la verificación en dos pasos (2FA) por aplicación o correo electrónico.'}
  ],
  en:[
   {target:'.web-account-shell .web-resources-tabs',title:'My account',content:'Update your password and configure two-factor authentication (2FA) via authenticator app or email.'}
  ]
 },
 'cross-reviews':{
  es:[
   {target:'.web-duplicate-reviews',title:'Revisiones importadas',content:'Consulta revisiones históricas de duplicados o causales de rechazo importadas desde Savia de escritorio.'}
  ],
  en:[
   {target:'.web-duplicate-reviews',title:'Imported reviews',content:'Inspect historical duplicate or rejection-risk reviews imported from Savia desktop.'}
  ]
 }
};
const companyDetails: Record<Language, GuideItem[]> = {
 es: [
  {companyArea:'company-profile',target:'.web-company-profile [role="tablist"]',title:'Secciones del perfil',content:'Cambia entre datos básicos, actividad, información financiera, marca de agua e imágenes de la empresa.'},
  {companyArea:'company-profile',target:'.web-company-heading .web-inline',title:'Editar y actualizar',content:'Pulsa Editar para modificar la sección actual en el panel lateral o Actualizar perfil para recargar los datos.'},
  {companyArea:'company-experience',target:'.web-company-heading .web-inline',title:'Experiencia empresarial',content:'Agrega contratos y proyectos de tu empresa. Puedes actualizarlos y conservar sus soportes.'},
  {companyArea:'company-certificates',target:'.web-company-certificates .web-company-heading .web-inline',title:'Certificados',content:'Agrega certificados y registra sus fechas de vigencia para mantenerlos organizados.'},
  {companyArea:'company-certificates',target:'.web-company-certificates .web-profile-group',title:'Importar certificados',content:'Si tienes un respaldo de Savia de escritorio, puedes importar sus certificados mediante el runner.'},
  {companyArea:'rup',target:'.web-rup-upload-card',title:'Certificado RUP',content:'Selecciona un PDF de hasta 25 MiB y pulsa Guardar PDF. Luego podrás analizarlo y revisar los datos extraídos.'}
 ],
 en: [
  {companyArea:'company-profile',target:'.web-company-profile [role="tablist"]',title:'Profile sections',content:'Switch between basic information, business activity, financial information, watermark settings and company images.'},
  {companyArea:'company-profile',target:'.web-company-heading .web-inline',title:'Edit and refresh',content:'Click Edit to update the active section in the side panel or Refresh profile to reload saved data.'},
  {companyArea:'company-experience',target:'.web-company-heading .web-inline',title:'Company experience',content:'Add your company’s contracts and projects. You can update them and keep supporting documents.'},
  {companyArea:'company-certificates',target:'.web-company-certificates .web-company-heading .web-inline',title:'Certificates',content:'Add certificates and record their validity dates to keep them organized.'},
  {companyArea:'company-certificates',target:'.web-company-certificates .web-profile-group',title:'Import certificates',content:'If you have a Savia desktop backup, you can import its certificates using the runner.'},
  {companyArea:'rup',target:'.web-rup-upload-card',title:'Bidder registration certificate',content:'Choose a PDF up to 25 MiB and save it. Then analyze it and review the extracted data.'}
 ]
};
const feasibility={es:[
 'Revisa los datos disponibles del proyecto y completa lo que conozcas.',
 'Consulta los documentos del proyecto y añade otras fuentes si las necesitas.',
 'Inicia el análisis con el runner. Revisa la propuesta antes de aplicarla.',
 'Organiza o genera el índice y revisa sus capítulos.',
 'Revisa los parámetros clave que se usarán para redactar el informe.',
 'Genera y revisa los capítulos; guarda los cambios antes de exportar Word.'
],en:[
 'Review the available project details and fill in what you know.',
 'Review project documents and add other sources when needed.',
 'Start analysis with the runner. Review its proposal before applying it.',
 'Organize or generate the outline and review its chapters.',
 'Review the key parameters used to draft the report.',
 'Generate and review the chapters; save changes before exporting Word.'
]};
export function WebProjectHelp({language,area,step,labels,onCompanyNavigate,companyDirty=false}:{language:Language;area:string;step?:number;labels?:string[];onCompanyNavigate?:(area:string)=>void;companyDirty?:boolean}){
 const en=language==='en',[open,setOpen]=useState(false),[run,setRun]=useState(false),[key,setKey]=useState(0);
 const companyAreas=['company-profile','company-experience','company-certificates','rup'];
 const isCompany=companyAreas.includes(area);
 const items:GuideItem[]=area==='feasibility'?(labels||[]).map((title,index)=>({target:`.web-feasibility-wizard .web-wizard-steps button:nth-child(${index+1})`,title,content:feasibility[language][index]})):isCompany?companyAreas.flatMap(name=>[...guides[name][language].map(item=>({...item,companyArea:name})),...companyDetails[language].filter(item=>item.companyArea===name)]):(guides[area]?.[language]||[]);
 if(!items.length)return null;
 const current=isCompany?guides[area][language][0]:(['feasibility','resources','market','secop','connection'].includes(area))?items[step||0]:items[0];
 const tour:Step[]=items.map(({companyArea,...item})=>({...item,placement:'bottom',...(companyArea&&onCompanyNavigate?{before:async()=>{onCompanyNavigate(companyArea); await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));}}:{})}));
 return <><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><ActionButton icon={CircleHelp} iconOnly variant="ghost">{en?'Help with this screen':'Ayuda de esta pantalla'}</ActionButton></PopoverTrigger><PopoverContent align="end" className="web-wizard-help"><strong>{en?'What can I do here?':'¿Qué puedo hacer aquí?'}</strong><p>{current.content}</p>{isCompany&&companyDirty&&<p role="status">{en?'Save or discard your changes before starting the guide.':'Guarda o descarta tus cambios antes de iniciar la guía.'}</p>}<Button size="sm" variant="outline" disabled={isCompany&&companyDirty} onClick={()=>{setOpen(false);setKey(value=>value+1);setRun(true);}}><Play size={15}/>{en?'Start guide':'Ver guía'}</Button></PopoverContent></Popover><Joyride key={key} steps={tour} run={run} continuous options={{skipBeacon:true,showProgress:true,buttons:['back','close','primary'],closeButtonAction:'skip',zIndex:3000}} locale={en?{back:'Back',close:'Close guide',last:'Finish',next:'Next',nextWithProgress:'Next ({current} of {total})',open:'Open guide',skip:'Skip'}:{back:'Anterior',close:'Cerrar guía',last:'Terminar',next:'Siguiente',nextWithProgress:'Siguiente ({current} de {total})',open:'Abrir guía',skip:'Omitir'}} onEvent={event=>{if(event.status===STATUS.FINISHED||event.status===STATUS.SKIPPED)setRun(false);}}/></>;
}
