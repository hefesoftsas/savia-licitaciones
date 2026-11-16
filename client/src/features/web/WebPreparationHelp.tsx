import { useState } from 'react';
import { CircleHelp, Play } from 'lucide-react';
import { Joyride, STATUS, type Step } from 'react-joyride';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/primitives/popover';
import { Button } from '@/shared/ui/primitives/button';
import { ActionButton } from '@/shared/ui/ActionButton';

const explanations = {
 es:[
  'Selecciona los pliegos y anexos de la licitación. Serán las fuentes que usará Savia en los siguientes pasos.',
  'Savia revisa los documentos y prepara tres análisis: resumen del proyecto, criterios de evaluación y requisitos de la respuesta. Revísalos y acepta cada uno.',
  'Con los análisis aceptados, organiza los capítulos que tendrá tu propuesta. Revisa el índice antes de aplicarlo.',
  'Completa y confirma los datos que deben mantenerse coherentes en toda la propuesta, como plazos, alcance y datos de tu empresa.',
  'Genera los capítulos y revisa el borrador en el editor de Word. Completa los campos pendientes y guarda los cambios.',
  'Revisa la propuesta final. Desde aquí puedes abrir o descargar el Word para presentarlo.',
  'Este paso es opcional. Puedes utilizar plantillas, preparar la oferta económica y registrar el seguimiento.'
 ],
 en:[
  'Select the tender documents and attachments. Savia will use them as sources in the following steps.',
  'Savia prepares three analyses: project overview, evaluation criteria and response requirements. Review and accept each one.',
  'Using the accepted analyses, organize the chapters of your proposal. Review the outline before applying it.',
  'Complete and confirm facts that must remain consistent throughout your proposal, such as dates, scope and company details.',
  'Generate the chapters and review the draft in the Word editor. Complete missing fields and save your changes.',
  'Review the final proposal. You can open or download the Word document from here.',
  'This optional step provides templates, price preparation and submission tracking.'
 ]
};
export function WebPreparationHelp({step, labels, language, blocker}:{step:number;labels:string[];language:'es'|'en';blocker?:string}) {
 const en=language==='en', [open,setOpen]=useState(false),[run,setRun]=useState(false),[key,setKey]=useState(0);
 const steps:Step[]=labels.map((label,index)=>({target:`.web-wizard-steps button:nth-child(${index+1})`,title:label,content:explanations[language][index],placement:'bottom'}));
 return <><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><ActionButton icon={CircleHelp} iconOnly variant="ghost">{en?'Help with this step':'Ayuda de este paso'}</ActionButton></PopoverTrigger><PopoverContent align="end" className="web-wizard-help"><strong>{en?'What do I do here?':'¿Qué hago en este paso?'}</strong><p>{explanations[language][step]}</p>{blocker&&<p><strong>{en?'To continue:':'Para continuar:'}</strong> {blocker}</p>}<Button size="sm" variant="outline" onClick={()=>{setOpen(false);setKey(value=>value+1);setRun(true);}}><Play size={15}/>{en?'See all steps':'Conocer todos los pasos'}</Button></PopoverContent></Popover>
 <Joyride key={key} steps={steps} run={run} continuous options={{skipBeacon:true,showProgress:true,buttons:['back','close','primary'],closeButtonAction:'skip',zIndex:3000}} locale={en?{back:'Back',close:'Close guide',last:'Finish',next:'Next',nextWithProgress:'Next ({current} of {total})',open:'Open guide',skip:'Skip'}:{back:'Anterior',close:'Cerrar guía',last:'Terminar',next:'Siguiente',nextWithProgress:'Siguiente ({current} de {total})',open:'Abrir guía',skip:'Omitir'}} onEvent={event=>{if(event.status===STATUS.FINISHED||event.status===STATUS.SKIPPED)setRun(false);}}/></>;
}
