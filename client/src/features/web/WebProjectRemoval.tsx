import {RefreshCw} from 'lucide-react';
import {ActionButton as Button} from '@/shared/ui/ActionButton';

export type PendingProjectDeletion = {projectId:string; title:string; cleanupPending:number};
type Props = {language:'es'|'en'; project:{id:string;title:string}|null; pending:PendingProjectDeletion[]; busy:boolean; onRemove:()=>void; onRetry:(id:string)=>void};
export function ProjectRemovalControls({language,project,pending,busy,onRemove,onRetry}:Props) {
 const en=language==='en';
 return <div className="web-stack">
  {project && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRemove}>{en?'Delete project':'Eliminar proyecto'}</Button>}
  {pending.length>0 && <section aria-label={en?'Pending cleanup':'Limpieza pendiente'}><h3>{en?'Pending cleanup':'Limpieza pendiente'}</h3><p>{en?'These projects are no longer available. Retry removing their remaining stored files.':'Estos proyectos ya no están disponibles. Reintenta eliminar sus archivos pendientes del almacenamiento.'}</p>{pending.map(item=><div className="web-project-file" key={item.projectId}><span>{item.title} · {item.cleanupPending} {en?'files pending':'archivos pendientes'}</span><Button icon={RefreshCw} iconOnly type="button" size="sm" variant="outline" disabled={busy} onClick={()=>onRetry(item.projectId)}>{en?'Retry cleanup':'Reintentar limpieza'}</Button></div>)}</section>}
 </div>;
}
