import {useState} from 'react';
import PresetEditor from './blind-check/components/PresetEditor';
import {localizedPresetTabs} from './blind-check/presetFields';
import type {BlindCheckProfile,BlindCheckPresetTab} from './blind-check/types';
import {useLanguage} from '@/shared/i18n';
export default function WebBlindProfileEditor({profile,disabled,onChange,onPendingChange}:{profile:BlindCheckProfile;disabled:boolean;onChange:(value:BlindCheckProfile)=>void;onPendingChange:()=>void}){
 const {language}=useLanguage(),[tab,setTab]=useState<BlindCheckPresetTab>('page');
 const tabs=localizedPresetTabs(language).filter(item=>item.id!=='source');
 return <div><label>{language==='en'?'Rule category':'Categoría de reglas'} <select value={tab} disabled={disabled} onChange={event=>setTab(event.target.value as BlindCheckPresetTab)}>{tabs.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div onInputCapture={onPendingChange}><PresetEditor tab={tab} profile={profile} readOnly={disabled} onCommit={onChange} hideCredentialWords credential={{enabled:false,words:[],busy:true,onToggle:()=>{}}} /></div></div>;
}
