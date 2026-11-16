import {MessageCircle,FilePenLine,ClipboardCheck,LoaderCircle} from 'lucide-react';
import {Button} from '@/shared/ui/primitives/button';

type Props={language:'es'|'en';jobs:{id:string;kind:string;state:string}[];onNavigate:(tab:string)=>void};
export function WebProjectOverview({language,jobs,onNavigate}:Props){
 const en=language==='en',active=jobs.filter(job=>['running','queued'].includes(job.state));
 return <section className="web-project-overview" aria-label={en?'Project overview':'Resumen del proyecto'}>
  <div className="web-overview-heading"><div><h3>{en?'Your workspace':'Tu espacio de trabajo'}</h3></div></div>
  <div className="web-overview-actions"><Button onClick={()=>onNavigate('chat')}><MessageCircle size={16}/>{en?'Ask your documents':'Consultar documentos'}</Button><Button variant="outline" onClick={()=>onNavigate('prepare')}><FilePenLine size={16}/>{en?'Prepare bid':'Preparar oferta'}</Button><Button variant="outline" onClick={()=>onNavigate('reviews')}><ClipboardCheck size={16}/>{en?'Review bid':'Revisar oferta'}</Button></div>
  {active.length>0&&<div className="web-overview-status"><span><LoaderCircle size={14}/>{en?`${active.length} tasks in progress`:`${active.length} tareas en curso`}</span></div>}

 </section>;
}
