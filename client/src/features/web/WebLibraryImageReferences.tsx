import {useState} from 'react';
import {request} from './api.mjs';
type Item={id:string;name:string;missingReason:string|null;deleting:boolean};
type Props={language:'es'|'en';open:boolean;loading:boolean;failed:boolean;images:Item[];onOpen:(value:boolean)=>void};
export function LibraryImageReferencesView({language,open,loading,failed,images,onOpen}:Props){
 const en=language==='en',available=images.filter(item=>!item.missingReason&&!item.deleting);return <details open={open} onToggle={event=>onOpen(event.currentTarget.open)}><summary>{en?'Images from your library':'Imágenes de tu biblioteca'}</summary>{loading?<p role="status">{en?'Loading images…':'Cargando imágenes…'}</p>:failed?<p role="alert">{en?'Could not load images. Close and reopen to retry.':'No se pudieron cargar las imágenes. Cierra y vuelve a abrir para reintentar.'}</p>:available.length?available.map(item=>{const url=`/api/image-library/${encodeURIComponent(item.id)}/file`;return <div key={item.id}><img src={url} alt={item.name} loading="lazy" style={{maxWidth:160,maxHeight:120,objectFit:'contain'}} /><p>{item.name}</p><label>{en?'Copy this reference into a chapter':'Copia esta referencia en un capítulo'}<textarea readOnly rows={2} value={`![${en?'Image':'Imagen'}](${url})`} onFocus={event=>event.currentTarget.select()}/></label></div>;}):<p>{en?'No available images. Add them in Images.':'No hay imágenes disponibles. Agrégalas en Imágenes.'}</p>}</details>;
}
export default function WebLibraryImageReferences({language}:{language:'es'|'en'}){
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[images,setImages]=useState<Item[]>([]);
 const toggle=(value:boolean)=>{setOpen(value);if(!value)return;setLoading(true);void request<{images:Item[]}>('/api/image-library').then(data=>{setImages(data.images);setFailed(false);}).catch(()=>setFailed(true)).finally(()=>setLoading(false));};
 return <LibraryImageReferencesView language={language} open={open} loading={loading} failed={failed} images={images} onOpen={toggle}/>;
}
