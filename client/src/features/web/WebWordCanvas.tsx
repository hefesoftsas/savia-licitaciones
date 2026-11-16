import { DocxEditor, useEditorState, useFontFamily, useTranslation, type DocxEditorRef } from '@docx-editor.dev/react';
import WebWordPending from './WebWordPending';
import {createPortal} from 'react-dom';
import {fontDisplayName,wordEditorEs} from './word-editor-locale';
import { forwardRef, useRef, useState } from 'react';
import '@docx-editor.dev/core/styles/editor.css';

function Status({ en }: { en: boolean }) {
  const error = useEditorState(state => state.parseError);
  const loading = useEditorState(state => state.isLoading || !!state.isOpening);
  return error ? <p role="alert">{en ? 'This Word file could not be displayed. Download it to open it in your Word application.' : 'No se pudo mostrar este Word. Descárgalo para abrirlo en tu aplicación de Word.'}</p> : loading ? <p role="status">{en ? 'Opening Word…' : 'Abriendo Word…'}</p> : null;
}
function EditorTools({target,onSave}:{target:HTMLDivElement;onSave?:()=>void}){
 const font=useFontFamily(),{t}=useTranslation();
 const Family=DocxEditor.Toolbar.FontFamily;
 return createPortal(<div className="docx-editor web-word-editor-toolbar"><DocxEditor.Toolbar onSave={onSave}><Family><Family.Trigger>{fontDisplayName(font.value||'Arial')}</Family.Trigger><Family.Content>{font.options.map(name=><Family.Item key={name} value={name}>{fontDisplayName(name)}</Family.Item>)}</Family.Content></Family></DocxEditor.Toolbar><DocxEditor.FontNotice t={(key,params)=>t(key,params?Object.fromEntries(Object.entries(params).map(([k,v])=>[k,typeof v==='string'?fontDisplayName(v):v])):params)}/></div>,target);
}
export default forwardRef<DocxEditorRef, { projectId?:string; wordId?:string; bytes: Uint8Array; language: 'es' | 'en'; editing?: boolean; name: string; zoom?: number; onChange?: () => void; onSave?: () => void; onPendingCount?: (count:number)=>void }>(function WebWordCanvas({ projectId, wordId, bytes, language, editing = false, name, zoom, onChange, onSave, onPendingCount }, ref) {
  const [toolbar,setToolbar]=useState<HTMLDivElement|null>(null);
  const local = useRef<DocxEditorRef | null>(null);
  return <div className="web-word-workspace"><div ref={setToolbar}/><DocxEditor i18n={language==='es'?wordEditorEs:undefined} ref={value => { local.current = value; if (typeof ref === 'function') ref(value); else if (ref) ref.current = value; }} document={bytes} zoom={zoom} zoomMode={zoom ? { type: 'fixed' } : 'auto'} mode={editing ? 'edit' : 'view'} title={name} chrome={false} menu={false} navigation={false} rulers={false} locale={language === 'es' ? 'es-CO' : 'en-US'} onChange={() => { const snapshot = local.current?.snapshot(); if (snapshot?.canUndo || snapshot?.canRedo) onChange?.(); }} onSave={onSave}>{editing&&toolbar&&createPortal(<WebWordPending projectId={projectId} wordId={wordId} editor={local} en={language==='en'} onCount={onPendingCount}/>,toolbar)}{editing&&toolbar&&<EditorTools target={toolbar} onSave={onSave}/>}<DocxEditor.HeaderFooterChrome/><Status en={language === 'en'} /></DocxEditor></div>;
});
