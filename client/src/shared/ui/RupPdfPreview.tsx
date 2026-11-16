import { useEffect, useRef, useState } from 'react';
import { ActionButton as Button } from './ActionButton';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import { pdfPreviewAssets } from '../utils/pdfPreviewAssets';

type Highlight = { page: number; rect: [number, number, number, number] };
export default function RupPdfPreview({ bytes, en, initialPage=1, highlight, onPageChange }: {bytes:Uint8Array; en:boolean; initialPage?:number; highlight?: Highlight; onPageChange?: (page:number)=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [page,setPage]=useState(initialPage),[total,setTotal]=useState(0),[error,setError]=useState('');
  const [pageText,setPageText]=useState<string | null>(null);
  const [textError,setTextError]=useState(false);
  const [geometry,setGeometry]=useState<{width:number;left:number;top:number;highlightWidth:number;highlightHeight:number}|null>(null);
  useEffect(()=>setPage(initialPage),[initialPage]);
  useEffect(()=>{
    let active=true;let task:{destroy:()=>Promise<void>}|undefined;let rendering:{cancel:()=>void}|undefined;
    setError('');setGeometry(null);setPageText(null);setTextError(false);
    void import('pdfjs-dist').then(async pdfjs=>{
      if(!active)return;const {workerUrl,wasmUrl}=pdfPreviewAssets();pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
      const load=pdfjs.getDocument({data:new Uint8Array(bytes),wasmUrl});task=load;
      const pdf=await load.promise;if(!active)return;setTotal(pdf.numPages);
      const pdfPage=await pdf.getPage(page);if(!active||!canvas.current)return;
      try {
        const textContent=await pdfPage.getTextContent();if(!active)return;
        setPageText(textContent.items.map(item=>'str' in item ? item.str : '').join(' ').trim());
      } catch { if(!active)return;setTextError(true); }
      const viewport=pdfPage.getViewport({scale:1.25}),element=canvas.current;
      element.width=viewport.width;element.height=viewport.height;
      if(highlight?.page===page){
        const [x1,y1]=viewport.convertToViewportPoint(highlight.rect[0],highlight.rect[1]);
        const [x2,y2]=viewport.convertToViewportPoint(highlight.rect[2],highlight.rect[3]);
        const left=Math.max(0,Math.min(x1,x2)),top=Math.max(0,Math.min(y1,y2));
        const right=Math.min(viewport.width,Math.max(x1,x2)),bottom=Math.min(viewport.height,Math.max(y1,y2));
        if(right>left&&bottom>top)setGeometry({width:viewport.width,left:left/viewport.width*100,top:top/viewport.height*100,highlightWidth:(right-left)/viewport.width*100,highlightHeight:(bottom-top)/viewport.height*100});
        else setGeometry({width:viewport.width,left:0,top:0,highlightWidth:0,highlightHeight:0});
      } else setGeometry({width:viewport.width,left:0,top:0,highlightWidth:0,highlightHeight:0});
      const context=element.getContext('2d');if(!context)throw Error('Canvas unavailable');
      const render=pdfPage.render({canvas:element,canvasContext:context,viewport});rendering=render;await render.promise;
    }).catch(()=>{if(active)setError(en?'Could not display this PDF.':'No se pudo mostrar este PDF.');});
    return()=>{active=false;rendering?.cancel();void task?.destroy();};
  },[bytes,page,en,highlight]);
  const changePage=(next:number)=>{setPage(next);onPageChange?.(next);};
  return <div className="rup-preview"><div className="rup-preview-controls"><Button icon={ChevronLeft} iconOnly type="button" variant="ghost" disabled={page<=1} onClick={()=>changePage(page-1)}>{en?'Previous page':'Página anterior'}</Button><span aria-live="polite" aria-atomic="true">{en?`Page ${page} of ${total||'…'}`:`Página ${page} de ${total||'…'}`}</span><Button icon={ChevronRight} iconOnly type="button" variant="ghost" disabled={!total||page>=total} onClick={()=>changePage(page+1)}>{en?'Next page':'Página siguiente'}</Button></div>{error&&<p role="alert">{error}</p>}{!error&&textError&&<p role="status">{en?'Could not extract text from this page. The visual preview is still available.':'No se pudo extraer el texto de esta página. La vista visual sigue disponible.'}</p>}{pageText===''&&!error&&<p>{en?'No selectable text was found on this page.':'No se encontró texto seleccionable en esta página.'}</p>}<div className="rup-preview-scroll"><div className="rup-preview-page" style={{width:geometry?.width||'100%'}}><canvas ref={canvas} aria-label={en?`PDF page ${page}${geometry?.highlightWidth?', selected field highlighted':''}`:`Página ${page} del PDF${geometry?.highlightWidth?', campo seleccionado resaltado':''}`} />{Boolean(geometry?.highlightWidth)&&<span className="rup-preview-highlight" aria-hidden="true" style={{left:`${geometry!.left}%`,top:`${geometry!.top}%`,width:`${geometry!.highlightWidth}%`,height:`${geometry!.highlightHeight}%`}} />}</div></div>{pageText&&<div className="rup-preview-text" aria-label={en?`Extracted text from page ${page}`:`Texto extraído de la página ${page}`}>{pageText}</div>}</div>;
}
