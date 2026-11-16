import {useEffect,useState} from 'react';
import {Button} from '@/shared/ui/primitives/button';
import {Input} from '@/shared/ui/primitives/input';
import {Textarea} from '@/shared/ui/primitives/textarea';
import {useToast} from '@/shared/ui/ToastProvider';
import {request} from './api.mjs';

type Language='es'|'en';
type Tracking={decision:'review'|'participate'|'discarded';owner:string;notes:string;version:number;updatedAt:string|null};
type ViewProps={language:Language;value:Tracking;busy:boolean;onChange:(value:Tracking)=>void;onSave:()=>void};

export function OpportunityTrackingView({language,value,busy,onChange,onSave}:ViewProps){
 const en=language==='en';
 return <form className="web-stack" onSubmit={event=>{event.preventDefault();onSave();}}>
  <h3>{en?'Opportunity tracking':'Seguimiento de oportunidad'}</h3>
  <p>{en?'Your decision is separate from the status published in SECOP.':'Tu decisión es independiente del estado publicado en SECOP.'}</p>
  <label>{en?'Decision':'Decisión'}<select value={value.decision} disabled={busy} onChange={event=>onChange({...value,decision:event.target.value as Tracking['decision']})}><option value="review">{en?'To review':'Por revisar'}</option><option value="participate">{en?'Participate':'Participar'}</option><option value="discarded">{en?'Discarded':'Descartada'}</option></select></label>
  <label>{en?'Responsible person':'Responsable'}<Input value={value.owner} maxLength={120} disabled={busy} onChange={event=>onChange({...value,owner:event.target.value})}/></label>
  <label>{en?'Notes':'Notas'}<Textarea value={value.notes} maxLength={4000} disabled={busy} onChange={event=>onChange({...value,notes:event.target.value})}/></label>
  <Button type="submit" size="sm" variant="outline" disabled={busy}>{busy?(en?'Saving…':'Guardando…'):(en?'Save tracking':'Guardar seguimiento')}</Button>
 </form>;
}

export default function WebOpportunityTracking({projectId,language,onDirty}:{projectId:string;language:Language;onDirty:(dirty:boolean)=>void}){
 const en=language==='en',{showToast}=useToast(),[saved,setSaved]=useState<Tracking|null>(null),[draft,setDraft]=useState<Tracking|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;setSaved(null);setDraft(null);setFailed(false);void request<Tracking>(`/api/projects/${encodeURIComponent(projectId)}/opportunity-tracking`).then(value=>{if(active){setSaved(value);setDraft(value);}}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[projectId]);
 const dirty=!!saved&&!!draft&&(saved.decision!==draft.decision||saved.owner!==draft.owner||saved.notes!==draft.notes);
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
 const save=async()=>{if(!draft||busy)return;setBusy(true);try{const value=await request<Tracking>(`/api/projects/${encodeURIComponent(projectId)}/opportunity-tracking`,{method:'PUT',json:draft});setSaved(value);setDraft(value);showToast(en?'Tracking saved.':'Seguimiento guardado.','success');}catch(error){const conflict=(error as {status?:number}).status===409;showToast(conflict?(en?'Tracking changed elsewhere. Copy your changes, then reload the page.':'El seguimiento cambió en otra sesión. Copia tus cambios y vuelve a cargar la página.'):(en?'Could not save tracking. Try again.':'No se pudo guardar el seguimiento. Inténtalo de nuevo.'),'error');}finally{setBusy(false);}};
 if(failed)return <p role="alert">{en?'Could not load opportunity tracking. Reload the page.':'No se pudo cargar el seguimiento de oportunidad. Vuelve a cargar la página.'}</p>;
 if(!draft)return <p role="status">{en?'Loading tracking…':'Cargando seguimiento…'}</p>;
 return <OpportunityTrackingView language={language} value={draft} busy={busy} onChange={setDraft} onSave={()=>void save()}/>;
}
