import {useEffect,useState} from 'react';
export function useWebRouteDetail(key:string, allowed:readonly string[], fallback:string){
 const read=()=>{const value=new URLSearchParams(window.location.search).get(key);return value&&allowed.includes(value)?value:fallback;};
 const [value,setValue]=useState(read);
 useEffect(()=>{const restore=()=>setValue(read());window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[key,fallback]);
 const change=(next:string)=>{if(!allowed.includes(next))return;setValue(next);const url=new URL(window.location.href);if(url.searchParams.get(key)===next)return;url.searchParams.set(key,next);window.history.pushState(null,'',url);window.dispatchEvent(new Event('savia:route-detail'));};
 return [value,change] as const;
}
