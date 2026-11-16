import {useState,type ReactNode} from 'react';
import {CircleHelp,FileText,Calculator} from 'lucide-react';
import {Joyride,STATUS,type Step} from 'react-joyride';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/shared/ui/primitives/tabs';
import {Button} from '@/shared/ui/primitives/button';

type Props={language:'es'|'en';templates:ReactNode;pricing:ReactNode};
type Tool='templates'|'pricing';
const guide={
 es:{
  templates:{title:'Usa formularios del pliego',purpose:'Solo lo necesitas si la licitación incluye una plantilla Word que debas completar.',steps:['Selecciona el archivo DOCX en Pliegos.','Extrae y revisa los campos de la plantilla.','Selecciona la plantilla para la exportación.']},
  pricing:{title:'Calcula tu oferta económica',purpose:'Úsala para organizar cantidades y precios; revisa los impuestos y las reglas del pliego.',steps:['Indica moneda y presupuesto si los conoces.','Agrega cada ítem y revisa los totales.','Espera a que se guarde y exporta el CSV.']}
 },
 en:{
  templates:{title:'Use tender forms',purpose:'Use this when the tender includes a Word template you need to complete.',steps:['Select the DOCX file in Documents.','Extract and review the template fields.','Select the template for export.']},
  pricing:{title:'Calculate your price offer',purpose:'Organize quantities and prices; check taxes and the tender rules.',steps:['Enter the currency and budget if known.','Add each item and review the totals.','Wait for it to save and export the CSV.']}
 }
} as const;
export function WebDeliveryTools({language,templates,pricing}:Props){
 const en=language==='en',[tab,setTab]=useState<Tool>('templates'),[run,setRun]=useState(false),[tourKey,setTourKey]=useState(0);
 const current=guide[language][tab],icons={templates:FileText,pricing:Calculator},Icon=icons[tab];
 const tour:Step[]=[{target:'.web-delivery-tools [role="tablist"]',title:en?'Choose a tool':'Elige una herramienta',content:en?'Each tab is a separate optional task.':'Cada pestaña corresponde a una tarea opcional diferente.',placement:'bottom'},{target:'.web-delivery-tool-guide',title:current.title,content:current.purpose,placement:'bottom'},{target:'.web-delivery-tools [role="tabpanel"][data-state="active"]',title:en?'Complete the task':'Completa la tarea',content:current.steps.join(' '),placement:'top'}];
 return <><Tabs value={tab} onValueChange={value=>{setRun(false);setTab(value as Tool);}} className="web-delivery-tools">
  <TabsList aria-label={en?'Optional delivery tools':'Herramientas opcionales de entrega'}>
   <TabsTrigger value="templates">{en?'Templates':'Plantillas'}</TabsTrigger><TabsTrigger value="pricing">{en?'Price offer':'Oferta económica'}</TabsTrigger>
  </TabsList>
  <section className="web-delivery-tool-guide" aria-label={en?'Quick guide':'Guía rápida'}><div className="web-delivery-guide-title"><Icon size={18} aria-hidden="true"/><div><strong>{current.title}</strong><p>{current.purpose}</p></div><Button size="sm" variant="ghost" onClick={()=>{setTourKey(value=>value+1);setRun(true);}}><CircleHelp size={16}/>{en?'Show guide':'Ver guía'}</Button></div><ol>{current.steps.map((step,index)=><li key={step}><span aria-hidden="true">{index+1}</span>{step}</li>)}</ol></section>
  <TabsContent value="templates" forceMount hidden={tab!=='templates'}>{templates}</TabsContent>
  <TabsContent value="pricing" forceMount hidden={tab!=='pricing'}>{pricing}</TabsContent>
 </Tabs><Joyride key={tourKey} steps={tour} run={run} continuous options={{skipBeacon:true,showProgress:true,buttons:['back','close','primary'],closeButtonAction:'skip',zIndex:3000}} locale={en?{back:'Back',close:'Close guide',last:'Finish',next:'Next',nextWithProgress:'Next ({current} of {total})',open:'Open guide',skip:'Skip'}:{back:'Anterior',close:'Cerrar guía',last:'Terminar',next:'Siguiente',nextWithProgress:'Siguiente ({current} de {total})',open:'Abrir guía',skip:'Omitir'}} onEvent={event=>{if(event.status===STATUS.FINISHED||event.status===STATUS.SKIPPED)setRun(false);}}/></>;
}
