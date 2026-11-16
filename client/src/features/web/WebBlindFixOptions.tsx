import {getFixGroups} from './blind-check/fixItems';
export default function WebBlindFixOptions({language,selected,disabled,onChange}:{language:'es'|'en';selected:string[];disabled:boolean;onChange:(value:string[])=>void}){
 return <div>{getFixGroups(language).map(group=><details key={group.id}><summary>{group.title}</summary><p>{group.description}</p>{group.items.map(item=><label className="web-consent" key={item.ruleId}><input type="checkbox" disabled={disabled} checked={selected.includes(item.ruleId)} onChange={event=>onChange(event.target.checked?[...selected,item.ruleId]:selected.filter(id=>id!==item.ruleId))} /><span><strong>{item.label}</strong> · {item.hint}</span></label>)}</details>)}</div>;
}
