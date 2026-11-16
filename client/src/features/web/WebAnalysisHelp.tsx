import {useState, type RefObject} from 'react';
import {CircleHelp, Play} from 'lucide-react';
import {Joyride, STATUS, type Step} from 'react-joyride';
import {Popover,PopoverContent,PopoverTrigger} from '@/shared/ui/primitives/popover';
import {Button} from '@/shared/ui/primitives/button';
import {ActionButton} from '@/shared/ui/ActionButton';

const explanation={
 es:[
  'Resumen: reúne el objeto, alcance, presupuesto, plazos y entregables para entender rápidamente el proyecto.',
  'Criterios: identifica cómo se evalúa la oferta y qué aspectos técnicos tienen puntaje. Si el proceso se decide por precio, puede no haber puntajes técnicos.',
  'Requisitos: identifica qué documentos, anexos, firmas y formatos exige la entidad para presentar la oferta.'
 ],
 en:[
  'Overview: brings together the purpose, scope, budget, deadlines and deliverables.',
  'Scoring: identifies how the bid is evaluated and which technical aspects receive points. A price-based process may have no technical scores.',
  'Requirements: identifies the documents, attachments, signatures and forms required for submission.'
 ]
};
export function WebAnalysisHelp({language,index,accepted,body}:{language:'es'|'en';index:number;accepted:boolean[];body:RefObject<HTMLDetailsElement|null>}){
 const en=language==='en',[open,setOpen]=useState(false),[run,setRun]=useState(false),[tourKey,setTourKey]=useState(0),[steps,setSteps]=useState<Step[]>([]);
 const missing=accepted.map((done,i)=>done?'':(en?['overview','scoring','requirements']:['resumen','criterios','requisitos'])[i]).filter(Boolean);
 const start=()=>{const buttons=body.current?.querySelectorAll<HTMLButtonElement>('.web-analysis-steps button');if(!buttons?.length)return;setSteps(Array.from(buttons).map((target,i)=>({target,title:(en?['Overview','Scoring','Requirements']:['Resumen','Criterios','Requisitos'])[i],content:explanation[language][i],placement:'bottom'})));setOpen(false);setTourKey(value=>value+1);setRun(true);};
 return <><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><ActionButton icon={CircleHelp} iconOnly size="sm" variant="ghost">{en?'Help with these analyses':'Ayuda sobre estos análisis'}</ActionButton></PopoverTrigger><PopoverContent align="end" className="web-wizard-help"><strong>{en?'What does this analysis do?':'¿Para qué sirve este análisis?'}</strong><p>{explanation[language][index]}</p><p>{missing.length?(en?`To continue, generate, review and accept: ${missing.join(', ')}.`:`Para continuar, genera, revisa y acepta: ${missing.join(', ')}.`):(en?'All three analyses are accepted. You can continue when no analysis is running.':'Los tres análisis están aceptados. Podrás continuar cuando no haya análisis en ejecución.')}</p><Button size="sm" variant="outline" onClick={start}><Play size={15}/>{en?'Explore the three analyses':'Conocer los tres análisis'}</Button></PopoverContent></Popover><Joyride key={tourKey} steps={steps} run={run} continuous options={{skipBeacon:true,showProgress:true,buttons:['back','close','primary'],closeButtonAction:'skip',zIndex:3000}} locale={en?{back:'Back',close:'Close guide',last:'Finish',next:'Next',nextWithProgress:'Next ({current} of {total})',open:'Open guide',skip:'Skip'}:{back:'Anterior',close:'Cerrar guía',last:'Terminar',next:'Siguiente',nextWithProgress:'Siguiente ({current} de {total})',open:'Abrir guía',skip:'Omitir'}} onEvent={event=>{if(event.status===STATUS.FINISHED||event.status===STATUS.SKIPPED)setRun(false);}}/></>;
}
