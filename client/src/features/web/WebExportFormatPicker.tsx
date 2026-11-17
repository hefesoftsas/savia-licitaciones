import {useEffect,useState} from 'react';
import type {ExportFormatConfig} from '@/shared/types/exportFormat';
import type {ProcurementMarket} from '@/shared/types/secop';
import {filterSystemTemplatesByMarket,getLocalizedTemplateName} from './systemTemplateNames';
import {localizeTemplateDefaults} from './localizeTemplateDefaults';
import {request} from './api.mjs';
type Language='es'|'en';
type Template={id:string;name:string;format:ExportFormatConfig};
type SystemTemplate={id:string;format:ExportFormatConfig};
type ViewProps={language:Language;market?:ProcurementMarket;value:string;disabled:boolean;templates:Template[];systemTemplates:SystemTemplate[];onChange:(value:string)=>void};
export function ExportFormatPickerView({language,market='ALL',value,disabled,templates,systemTemplates,onChange}:ViewProps){
 const en=language==='en';
 const visibleSystem=filterSystemTemplatesByMarket(systemTemplates,market);
 return <label>{en?'Format for this export':'Formato para esta exportación'}<select value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}><option value="">{en?'Account format':'Formato de la cuenta'}</option><optgroup label={en?'Saved templates':'Plantillas guardadas'}>{templates.map(item=><option key={item.id} value={`user:${item.id}`}>{item.name}</option>)}</optgroup><optgroup label={en?'System presets':'Plantillas del sistema'}>{visibleSystem.map(item=><option key={item.id} value={`system:${item.id}`}>{getLocalizedTemplateName(item.id,item.format.template_name,language)}</option>)}</optgroup></select></label>;
}
export default function WebExportFormatPicker({language,market='ALL',disabled,onChange}:{language:Language;market?:ProcurementMarket;disabled:boolean;onChange:(format:ExportFormatConfig|null)=>void}){
 const [value,setValue]=useState(''),[templates,setTemplates]=useState<Template[]>([]),[systemTemplates,setSystemTemplates]=useState<SystemTemplate[]>([]),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;void request<{templates:Template[];systemTemplates:SystemTemplate[]}>('/api/export-templates').then(data=>{if(active){setTemplates(data.templates);setSystemTemplates(data.systemTemplates);}}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[]);
 const choose=(next:string)=>{setValue(next);if(!next){onChange(null);return;}if(next.startsWith('user:')){onChange(templates.find(item=>`user:${item.id}`===next)?.format||null);return;}const item=systemTemplates.find(item=>`system:${item.id}`===next);onChange(item?{...localizeTemplateDefaults(item.format,language),template_name:getLocalizedTemplateName(item.id,item.format.template_name,language)}:null);};
 return <><ExportFormatPickerView language={language} market={market} value={value} disabled={disabled} templates={templates} systemTemplates={systemTemplates} onChange={choose}/>{failed&&<p role="alert">{language==='en'?'Could not load templates; the account format is available.':'No se pudieron cargar las plantillas; puedes usar el formato de la cuenta.'}</p>}</>;
}
