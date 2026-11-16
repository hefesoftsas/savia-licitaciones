import {X, Plus} from 'lucide-react';
import {useEffect,useState} from 'react';
import AppDialog from '@/shared/ui/AppDialog';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import {Input} from '@/shared/ui/primitives/input';
import {useToast} from '@/shared/ui/ToastProvider';
import {request} from './api.mjs';

type Language='es'|'en';
type LinkType='none'|'certificate'|'rup'|'unresolved'|'unresolved-certificate'|'unresolved-rup';
type Support={id:string;title:string;status:'missing'|'pending'|'reviewed';linkType:LinkType;linkId:string;linkAvailable:boolean;version:number};
type Candidate={type:'certificate'|'rup';id:string;name:string};
type Props={language:Language;items:Support[];candidates:Candidate[];busy:boolean;title:string;onTitle:(value:string)=>void;onAdd:()=>void;onUpdate:(item:Support,patch:Partial<Support>)=>void;onRemove:(item:Support)=>void};
const linkValue=(type:LinkType,id:string)=>type==='none'?'':`${type}:${id}`;

export function RequirementSupportsView({language,items,candidates,busy,title,onTitle,onAdd,onUpdate,onRemove}:Props){
 const en=language==='en';
 return <div className="web-stack"><p>{en?'Link a credential or RUP and review it yourself. A linked document does not prove compliance.':'Vincula una credencial o el RUP y revísalo. El documento vinculado no demuestra cumplimiento.'}</p>
  {items.map(item=><div className="web-workflow-row web-stack" key={item.id}><strong>{item.title}</strong>
   <label>{en?'Status':'Estado'}<select value={item.status} disabled={busy||(!item.linkAvailable&&item.linkType!=='none')} onChange={event=>onUpdate(item,{status:event.target.value as Support['status']})}><option value="missing">{en?'Missing':'Faltante'}</option><option value="pending">{en?'Pending review':'Por revisar'}</option><option value="reviewed">{en?'Reviewed':'Revisado'}</option></select></label>
   <label>{en?'Credential or RUP':'Credencial o RUP'}<select value={linkValue(item.linkType,item.linkId)} disabled={busy} onChange={event=>{const value=event.target.value,index=value.indexOf(':');onUpdate(item,value?{linkType:value.slice(0,index) as LinkType,linkId:value.slice(index+1)}:{linkType:'none',linkId:''});}}><option value="">{en?'None':'Sin vincular'}</option>{item.linkType!=='none'&&!item.linkAvailable&&<option value={linkValue(item.linkType,item.linkId)}>{en?'Unavailable':'No disponible'}</option>}{candidates.map(candidate=><option key={`${candidate.type}:${candidate.id}`} value={linkValue(candidate.type,candidate.id)}>{candidate.type==='rup'?'RUP · ':''}{candidate.name}</option>)}</select></label>
   {item.linkType!=='none'&&!item.linkAvailable&&<p role="status">{en?'This linked document is no longer available. Choose another or unlink it to change the status.':'Este documento vinculado ya no está disponible. Elige otro o desvincúlalo para cambiar el estado.'}</p>}
   <Button icon={X} iconOnly type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>onRemove(item)}>{en?'Remove':'Quitar'} {item.title}</Button>
  </div>)}
  <label>{en?'Required document name':'Nombre del documento requerido'}<Input value={title} maxLength={300} disabled={busy} onChange={event=>onTitle(event.target.value)}/></label><Button icon={Plus} type="button" variant="outline" size="sm" disabled={busy||!title.trim()} onClick={onAdd}>{en?'Add document':'Agregar documento'}</Button>
 </div>;
}

export default function WebRequirementSupports({projectId,requirementId,language,onDirty}:{projectId:string;requirementId:string;language:Language;onDirty:(id:string,dirty:boolean)=>void}){
 const en=language==='en',{showToast}=useToast(),[opened,setOpened]=useState(false),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[items,setItems]=useState<Support[]>([]),[candidates,setCandidates]=useState<Candidate[]>([]),[title,setTitle]=useState(''),[busy,setBusy]=useState(false),[removeTarget,setRemoveTarget]=useState<Support|null>(null);
 const base=`/api/projects/${encodeURIComponent(projectId)}/workflow/requirements/${encodeURIComponent(requirementId)}/supports`;
 useEffect(()=>{onDirty(`support:${requirementId}`,!!title.trim());return()=>onDirty(`support:${requirementId}`,false);},[title,requirementId,onDirty]);
 useEffect(()=>{if(!opened)return;let active=true;setLoading(true);setFailed(false);void Promise.all([request<{items:Support[]}>(base),request<{certificates:{id:string;name:string;deleting:boolean}[]}>('/api/company-certificates'),request<{certificate:{id:string;name:string}|null}>('/api/rup/certificate')]).then(([supports,certificates,rup])=>{if(!active)return;setItems(supports.items);setCandidates([...certificates.certificates.filter(item=>!item.deleting).map(item=>({type:'certificate' as const,id:item.id,name:item.name})),...(rup.certificate?[{type:'rup' as const,id:rup.certificate.id,name:rup.certificate.name}]:[])]);}).catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[base,opened]);
 const run=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);try{await action();}catch(error){const conflict=(error as {status?:number}).status===409;showToast(conflict?(en?'The document changed elsewhere. Close and reopen this section.':'El documento cambió en otra sesión. Cierra y vuelve a abrir esta sección.'):(en?'Could not update the document. Try again.':'No se pudo actualizar el documento. Inténtalo de nuevo.'),'error');}finally{setBusy(false);}};
 const add=()=>void run(async()=>{const data=await request<{item:Support}>(base,{method:'POST',json:{title}});setItems(current=>[...current,data.item]);setTitle('');});
 const update=(item:Support,patch:Partial<Support>)=>void run(async()=>{const value={status:item.status,linkType:item.linkType,linkId:item.linkId,version:item.version,...patch},data=await request<{item:Support}>(`${base}/${encodeURIComponent(item.id)}`,{method:'PATCH',json:value});setItems(current=>current.map(row=>row.id===item.id?data.item:row));});
 return <details onToggle={event=>setOpened(event.currentTarget.open)}><summary>{en?'Required documents':'Documentos requeridos'}</summary>{loading?<p role="status">{en?'Loading documents…':'Cargando documentos…'}</p>:failed?<p role="alert">{en?'Could not load documents. Close and reopen this section to retry.':'No se pudieron cargar los documentos. Cierra y vuelve a abrir esta sección para reintentar.'}</p>:opened&&<RequirementSupportsView language={language} items={items} candidates={candidates} busy={busy} title={title} onTitle={setTitle} onAdd={add} onUpdate={update} onRemove={setRemoveTarget}/>}<AppDialog open={!!removeTarget} onOpenChange={open=>{if(!open&&!busy)setRemoveTarget(null);}} title={en?'Remove required document':'Quitar documento requerido'} description={en?`Remove “${removeTarget?.title||''}”?`:`¿Quitar «${removeTarget?.title||''}»?`} actions={<><Button variant="outline" disabled={busy} onClick={()=>setRemoveTarget(null)}>{en?'Cancel':'Cancelar'}</Button><Button icon={X} variant="destructive" disabled={busy} onClick={()=>{if(removeTarget)void run(async()=>{await request(`${base}/${encodeURIComponent(removeTarget.id)}`,{method:'DELETE',json:{version:removeTarget.version}});setItems(current=>current.filter(item=>item.id!==removeTarget.id));setRemoveTarget(null);});}}>{en?'Remove':'Quitar'}</Button></>}/></details>;
}
