import {RefreshCw, Trash2, Upload} from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import AppDialog from '@/shared/ui/AppDialog';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import {SelectField} from '@/shared/ui/SelectField';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
export type Language='es'|'en';
export type ImageItem={id:string;name:string;customName?:string;fieldKey:string;deleting:boolean};
export type Categories=readonly (readonly [string,string,string])[];
export function CategorizedImagesView({language,images,field,loading,failed,busy,onField,onUpload,onRemove,onRefresh,path,categories}:{language:Language;images:ImageItem[];field:string;loading:boolean;failed:boolean;busy:boolean;onField:(field:string)=>void;onUpload:(event:ChangeEvent<HTMLInputElement>)=>void;onRemove:(image:ImageItem)=>void;onRefresh:()=>void;path:string;categories:Categories}){
 const en=language==='en',shown=images.filter(image=>image.fieldKey===field);
 return <div className="web-profile-images web-stack">
  <p>{en?'Image changes are saved immediately to your account. Watermarks are not applied automatically in the web version.':'Los cambios de imágenes se guardan inmediatamente en tu cuenta. La versión web no aplica marcas de agua automáticamente.'}</p>
  <div className="web-admin-sheet-field"><span>{en?'Category':'Categoría'}</span><SelectField value={field} disabled={busy} aria-label={en?'Category':'Categoría'} options={categories.map(([key,es,enLabel])=>{const count=images.filter(image=>image.fieldKey===key).length;return {value:key,label:`${en?enLabel:es}${count?` (${count})`:''}`};})} onChange={onField}/></div>
  <div className="web-image-toolbar"><label className="web-image-upload"><Upload size={15} aria-hidden="true"/><span>{en?'Add images':'Agregar imágenes'}</span><input className="sr-only" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" multiple disabled={busy||loading||failed} onChange={onUpload}/></label><Button icon={RefreshCw} iconOnly type="button" variant="outline" size="sm" disabled={busy||loading} onClick={onRefresh}>{en?'Refresh':'Actualizar'}</Button></div>
  {loading&&<p role="status">{en?'Loading images…':'Cargando imágenes…'}</p>}
  {failed&&<p role="alert">{en?'Could not load images. Refresh to retry.':'No se pudieron cargar las imágenes. Actualiza para reintentar.'}</p>}
  {!loading&&!failed&&!shown.length&&<p>{en?'No images in this category.':'No hay imágenes en esta categoría.'}</p>}
  {!loading&&!failed&&<div className="web-certificate-image-list">{shown.map(image=><div key={image.id}>{image.deleting?<span>{image.name} · {en?'Removal pending':'Eliminación pendiente'}</span>:<a href={`${path}/${encodeURIComponent(image.id)}`} target="_blank" rel="noreferrer"><img src={`${path}/${encodeURIComponent(image.id)}`} alt="" loading="lazy"/><span>{image.customName||image.name}{image.customName&&image.customName!==image.name&&<small> · {image.name}</small>}</span></a>}<Button icon={image.deleting?RefreshCw:Trash2} iconOnly type="button" variant="outline" size="sm" disabled={busy} aria-label={`${image.deleting?(en?'Retry removal':'Reintentar eliminación'):(en?'Remove':'Eliminar')}: ${image.customName||image.name}`} onClick={()=>onRemove(image)}>{image.deleting?(en?'Retry':'Reintentar'):(en?'Remove':'Eliminar')}</Button></div>)}</div>}
 </div>;
}
export default function WebCategorizedImages({language,path,categories,title,disabled=false,embedded=false}:{language:Language;path:string;categories:Categories;title:[string,string];disabled?:boolean;embedded?:boolean}){
 const en=language==='en',{showToast}=useToast();
 const [open,setOpen]=useState(embedded),[images,setImages]=useState<ImageItem[]>([]),[field,setField]=useState<string>(categories[0][0]),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0),[removing,setRemoving]=useState<ImageItem|null>(null);
 useEffect(()=>{if(!open&&!embedded)return;let active=true;setLoading(true);setFailed(false);void request<{images:ImageItem[]}>(path).then(data=>{if(active)setImages(data.images);}).catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[open,embedded,refresh,path]);
 const upload=async(event:ChangeEvent<HTMLInputElement>)=>{const input=event.currentTarget,files=Array.from(input.files||[]);input.value='';if(!files.length||busy||disabled)return;setBusy(true);try{for(const file of files)await request(path,{method:'POST',headers:{'x-file-name':encodeURIComponent(file.name),'x-field-key':field,'content-type':file.type||'application/octet-stream'},body:file});showToast(en?'Images added.':'Imágenes agregadas.','success');}catch{showToast(en?'Some images could not be added. Review the list and retry.':'No se pudieron agregar todas las imágenes. Revisa la lista y vuelve a intentar.','error');}finally{setRefresh(value=>value+1);setBusy(false);}};
 const remove=async()=>{if(!removing||busy||disabled)return;setBusy(true);try{await request(`${path}/${encodeURIComponent(removing.id)}`,{method:'DELETE'});showToast(en?'Image removed.':'Imagen eliminada.','success');}catch(error){showToast((error as Error&{status?:number}).status===503?(en?'Removal is pending. Retry from the list.':'La eliminación está pendiente. Reintenta desde la lista.'):(en?'Could not remove the image.':'No se pudo eliminar la imagen.'),'error');}finally{setRemoving(null);setRefresh(value=>value+1);setBusy(false);}};
 const content=<CategorizedImagesView path={path} categories={categories} language={language} images={images} field={field} loading={loading} failed={failed} busy={busy||disabled} onField={setField} onUpload={event=>void upload(event)} onRemove={setRemoving} onRefresh={()=>setRefresh(value=>value+1)}/>;
 const dialog=<AppDialog open={!!removing} onOpenChange={value=>{if(!value&&!busy)setRemoving(null);}} title={en?'Remove image?':'¿Eliminar imagen?'} description={removing?.name||''} actions={<><Button variant="outline" disabled={busy} onClick={()=>setRemoving(null)}>{en?'Cancel':'Cancelar'}</Button><Button icon={Trash2} variant="destructive" disabled={busy} onClick={()=>void remove()}>{en?'Remove':'Eliminar'}</Button></>} />;
 if(embedded)return <><h3>{title[en?1:0]}</h3>{content}{dialog}</>;
 return <details className="web-profile-image-section" onToggle={event=>setOpen(event.currentTarget.open)}><summary><strong>{title[en?1:0]}</strong></summary>{open&&content}{dialog}</details>;
}
