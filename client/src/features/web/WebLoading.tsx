import {LoaderCircle} from 'lucide-react';

export function WebLoading({message,detail,centered=false}:{message:string;detail?:string;centered?:boolean}) {
 return <div className={`web-loading${centered?' web-loading-centered':''}`} role="status" aria-live="polite">
  <LoaderCircle className="web-loading-icon" aria-hidden="true" size={20}/>
  <span><strong>{message}</strong>{detail&&<small>{detail}</small>}</span>
 </div>;
}
