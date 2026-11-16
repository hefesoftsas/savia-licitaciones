import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {Search,Check,Plus,Trash2,X} from 'lucide-react';
import {Input} from '@/shared/ui/primitives/input';
import {Button} from '@/shared/ui/primitives/button';
import {ActionButton} from '@/shared/ui/ActionButton';

type Props={projects:{id:string;title:string;hasOffer?:number|boolean}[];onOpen?:()=>void;selected:string;language:'es'|'en';onSelect:(id:string)=>void;onRemove:(id:string)=>void;children:ReactNode};
export function WebProjectPicker({projects,selected,language,onSelect,onRemove,onOpen,children}:Props){
 const en=language==='en',[open,setOpen]=useState(false),[search,setSearch]=useState(''),[active,setActive]=useState(0),[creating,setCreating]=useState(false),[offersOnly,setOffersOnly]=useState(false);
 const id=useId(),root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),create=useRef<HTMLDivElement>(null),title=projects.find(project=>project.id===selected)?.title||'';
 const normalize=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();
 const matches=projects.filter(project=>(!offersOnly||project.hasOffer)&&normalize(project.title).includes(normalize(search))).slice(0,20);
 useEffect(()=>{setSearch(title);setOpen(false);setCreating(false);},[selected,title]);
 const choose=(project:{id:string;title:string})=>{onSelect(project.id);setOpen(false);setSearch(title);};
 useEffect(()=>{if(open)document.getElementById(`${id}-option-${active}`)?.scrollIntoView({block:'nearest'});},[active,open,id]);
 return <section className="web-project-picker" aria-label={en?'Your projects':'Tus proyectos'}>
  <div className="web-project-picker-bar"><div className="web-project-autocomplete" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node)){setOpen(false);setSearch(title);}}}>
   <Search size={16} aria-hidden="true"/><Input ref={input} role="combobox" aria-label={en?'Find a project':'Buscar un proyecto'} aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open&&matches[active]?`${id}-option-${active}`:undefined} autoComplete="off" placeholder={en?'Find a project…':'Buscar un proyecto…'} value={search} onFocus={event=>{event.target.select();onOpen?.();}} onChange={event=>{setSearch(event.target.value);setOpen(true);setActive(0);}} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(current=>Math.max(0,Math.min(matches.length-1,open?current+(event.key==='ArrowDown'?1:-1):0)));}else if(event.key==='Enter'&&open){event.preventDefault();if(matches[active])choose(matches[active]);}else if(event.key==='Escape'){event.preventDefault();setOpen(false);setSearch(title);}}}/>
   {search&&<button type="button" className="web-project-clear" aria-label={en?'Clear project search':'Limpiar búsqueda de proyectos'} title={en?'Clear search':'Limpiar búsqueda'} onMouseDown={event=>event.preventDefault()} onClick={()=>{setSearch('');setOpen(true);setActive(0);input.current?.focus();}}><X size={16} aria-hidden="true"/></button>}
   {open&&<div className="web-project-picker-results"><button type="button" className="web-project-offer-filter" aria-pressed={offersOnly} onMouseDown={event=>event.preventDefault()} onClick={()=>{setOffersOnly(value=>!value);setActive(0);}}>{en?'Only projects with bid drafts or submissions':'Solo proyectos con borradores o presentaciones'}</button><div id={`${id}-list`} className="web-project-suggestions" role="listbox" aria-label={en?'Matching projects':'Proyectos encontrados'}>{matches.map((project,index)=><div id={`${id}-option-${index}`} role="option" aria-selected={index===active} key={project.id} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(project)}><span>{project.title}{!!project.hasOffer&&<small className="web-project-offer-badge">{en?'Bid activity':'Actividad de oferta'}</small>}</span>{selected===project.id&&<Check size={16} aria-label={en?'Current project':'Proyecto actual'}/>}</div>)}{!matches.length&&<p role="status">{en?'No projects found.':'No se encontraron proyectos.'}</p>}</div></div>}
  </div>{selected&&<ActionButton type="button" icon={Trash2} iconOnly variant="ghost" onClick={()=>onRemove(selected)}>{en?'Delete current project':'Eliminar proyecto actual'}</ActionButton>}<Button variant="ghost" aria-expanded={creating} onClick={()=>{setCreating(value=>!value);requestAnimationFrame(()=>create.current?.querySelector<HTMLInputElement>('input')?.focus());}}><Plus size={16}/>{en?'New project':'Nuevo proyecto'}</Button></div>
  {creating&&<div ref={create} className="web-project-create"><strong>{en?'Create a project':'Crear un proyecto'}</strong>{children}</div>}
 </section>;
}
