import {useState} from 'react';
import {CircleHelp, Play} from 'lucide-react';
import {Joyride, STATUS, type Step} from 'react-joyride';
import {Popover, PopoverContent, PopoverTrigger} from '@/shared/ui/primitives/popover';
import {ActionButton} from '@/shared/ui/ActionButton';
import {Button} from '@/shared/ui/primitives/button';

const help={
 es:[
  'Decide si participarás, asigna un responsable y organiza tareas, documentos y requisitos. Marca las tareas a medida que las completes.',
  'Después de presentar la oferta, registra la fecha y el radicado. Adjunta el paquete presentado y su comprobante para conservarlos en el proyecto.',
  'Registra observaciones o solicitudes de subsanación, sus fechas y archivos. Actualiza su estado y registra el resultado cuando lo conozcas.'
 ],
 en:[
  'Decide whether to participate, assign an owner, and organize tasks, documents and requirements. Mark tasks as you complete them.',
  'After submitting the offer, record the date and filing reference. Attach the submitted package and receipt to keep them in the project.',
  'Record observations or correction requests, their dates and files. Update their status and record the outcome when known.'
 ]
};
export function WebWorkflowHelp({step,labels,language}:{step:number;labels:string[];language:'es'|'en'}){
 const en=language==='en',[open,setOpen]=useState(false),[run,setRun]=useState(false),[key,setKey]=useState(0);
 const steps:Step[]=labels.map((label,index)=>({target:`.web-workflow .web-wizard-steps button:nth-child(${index+1})`,title:label,content:help[language][index],placement:'bottom'}));
 return <><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><ActionButton icon={CircleHelp} iconOnly variant="ghost">{en?'Help with this step':'Ayuda de este paso'}</ActionButton></PopoverTrigger><PopoverContent align="end" className="web-wizard-help"><strong>{en?'What do I do here?':'¿Qué hago en este paso?'}</strong><p>{help[language][step]}</p><p>{en?'These records stay in Savia; they are not sent to SECOP.':'Estos registros quedan en Savia; no se envían a SECOP.'}</p><Button size="sm" variant="outline" onClick={()=>{setOpen(false);setKey(value=>value+1);setRun(true);}}><Play size={15}/>{en?'See all steps':'Conocer todos los pasos'}</Button></PopoverContent></Popover><Joyride key={key} steps={steps} run={run} continuous options={{skipBeacon:true,showProgress:true,buttons:['back','close','primary'],closeButtonAction:'skip',zIndex:3000}} locale={en?{back:'Back',close:'Close guide',last:'Finish',next:'Next',nextWithProgress:'Next ({current} of {total})',open:'Open guide',skip:'Skip'}:{back:'Anterior',close:'Cerrar guía',last:'Terminar',next:'Siguiente',nextWithProgress:'Siguiente ({current} de {total})',open:'Abrir guía',skip:'Omitir'}} onEvent={event=>{if(event.status===STATUS.FINISHED||event.status===STATUS.SKIPPED)setRun(false);}}/></>;
}
