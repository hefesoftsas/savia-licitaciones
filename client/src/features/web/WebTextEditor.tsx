import { Eye, Pencil } from 'lucide-react';
import { useState } from 'react';
import MarkdownEditor from '@/shared/ui/MarkdownEditor';
import MarkdownRenderer from '@/shared/ui/MarkdownRenderer';
import { WizardActionButton as Button } from './WizardActionButton';
import type { ReactNode } from 'react';
import './web-document-editors.css';

export default function WebTextEditor({ value, onChange, disabled, language, title, maxLength, preview }: { value: string; onChange: (value: string) => void; disabled?: boolean; language: 'es' | 'en'; title: string; maxLength: number; preview?: ReactNode }) {
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const en = language === 'en';
  return <section className="web-text-editor" aria-label={title}>
    <div className="web-editor-mode" role="group" aria-label={en ? 'Editor view' : 'Vista del editor'}>
      <strong>{title}</strong>
      <Button icon={Pencil} iconOnly size="sm" variant={view === 'edit' ? 'secondary' : 'ghost'} aria-pressed={view === 'edit'} onClick={() => setView('edit')}>{en ? 'Edit text' : 'Editar texto'}</Button>
      <Button icon={Eye} iconOnly size="sm" variant={view === 'preview' ? 'secondary' : 'ghost'} aria-pressed={view === 'preview'} onClick={() => setView('preview')}>{en ? 'Preview' : 'Vista previa'}</Button>
    </div>
    <div hidden={view !== 'edit'}><MarkdownEditor value={value} onChange={next => { if (next.length <= maxLength) onChange(next); }} disabled={disabled} fullscreenTitle={title} /></div>
    {view === 'preview' && <div className="web-text-preview">{preview || (value.trim() ? <MarkdownRenderer allowRawHtml={false}>{value.replaceAll('![', '[')}</MarkdownRenderer> : <p>{en ? 'Write some text to preview it.' : 'Escribe un texto para ver su formato.'}</p>)}</div>}
  </section>;
}
