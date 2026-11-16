import {useEffect,useState} from 'react';
import {ActionButton} from '@/shared/ui/ActionButton';
import {SelectField} from '@/shared/ui/SelectField';
import {request} from './api.mjs';
import catalog from './pi-model-catalog.json';

type Props={language:'es'|'en';onSelected:()=>Promise<void>};
export default function WebLocalModel({language,onSelected}:Props){
 const en=language==='en', [model,setModel]=useState('muse-spark-1.3-contributor'),[saved,setSaved]=useState<string|null>(null),[active,setActive]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let live=true;void request<{model:string|null;active:boolean}>('/api/provider-credentials/local-model').then(data=>{if(live){setSaved(data.model);setActive(data.active);if(data.model)setModel(data.model);}}).catch(()=>{if(live)setMessage(en?'Could not load the connector model.':'No se pudo consultar el modelo del conector.');});return()=>{live=false;};},[en]);
 const save=async()=>{setBusy(true);setMessage('');try{await request('/api/provider-credentials/local-model',{method:'PUT',json:{model}});setSaved(model);setActive(true);await onSelected();setMessage(en?'Model selected. New tasks use it with the connector’s local key.':'Modelo seleccionado. Las tareas nuevas lo usarán con la clave local del conector.');}catch{setMessage(en?'Could not save the model.':'No se pudo guardar el modelo.');}finally{setBusy(false);}};
 const modelOptions=[{value:'muse-spark-1.3-contributor',label:'Muse Spark 1.3 Contributor'},...catalog['opencode-go'].filter(item=>item.id!=='muse-spark-1.3-contributor').map(item=>({value:item.id,label:item.name})),...(saved&&!catalog['opencode-go'].some(item=>item.id===saved)&&saved!=='muse-spark-1.3-contributor'?[{value:saved,label:saved}]:[])];
 return <section className="web-stack"><h3>{en?'Model for your connector':'Modelo del conector'}</h3><p>{en?'Choose the OpenCode Go model for new tasks. Your API key stays on your computer.':'Elige el modelo de OpenCode Go para las tareas nuevas. Tu clave permanece en tu equipo.'}</p><div className="web-admin-sheet-field"><span>{en?'Model':'Modelo'}</span><SelectField value={model} aria-label={en?'Model':'Modelo'} options={modelOptions} onChange={setModel}/></div><ActionButton type="button" disabled={busy||(active&&model===saved)} onClick={()=>void save()}>{en?'Use this model':'Usar este modelo'}</ActionButton><p>{en?'Requires an updated connector. Model access depends on your OpenCode account.':'Requiere un conector actualizado. El acceso al modelo depende de tu cuenta de OpenCode.'}</p>{message&&<p role="status">{message}</p>}</section>;
}
