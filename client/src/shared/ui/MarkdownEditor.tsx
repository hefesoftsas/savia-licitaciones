import { Button } from './primitives/button';
import { Textarea } from './primitives/textarea';
import * as Dialog from '@/shared/ui/primitives/dialog';
import { useRef, type ReactNode, type RefObject } from 'react';
import { useLanguage } from '../i18n';

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  fullscreenTitle?: string;
  fullscreenDescription?: string;
  fullscreenSidebar?: ReactNode;
}

const STR = {
  es: {
    bold: 'Negrita',
    italic: 'Cursiva',
    heading: 'Título',
    quote: 'Cita',
    unorderedList: 'Lista sin orden',
    orderedList: 'Lista ordenada',
    placeholder: 'Escribe contenido Markdown...',
    fullscreenTitle: 'Edición Markdown a pantalla completa',
    fullscreenDescription: 'Edita el contenido Markdown actual a pantalla completa.',
    selectedFallback: 'texto',
    toolbarLabel: 'Barra de edición Markdown',
    fullscreenToolbarLabel: 'Barra de edición Markdown a pantalla completa',
    fullscreenTrigger: 'Editar a pantalla completa',
    fullscreenButton: 'Pantalla completa',
    exitFullscreen: 'Salir de pantalla completa',
  },
  en: {
    bold: 'Bold',
    italic: 'Italic',
    heading: 'Heading',
    quote: 'Quote',
    unorderedList: 'Bulleted list',
    orderedList: 'Numbered list',
    placeholder: 'Enter Markdown content...',
    fullscreenTitle: 'Markdown fullscreen editing',
    fullscreenDescription: 'Edit the current Markdown content fullscreen.',
    selectedFallback: 'text',
    toolbarLabel: 'Markdown editing toolbar',
    fullscreenToolbarLabel: 'Markdown fullscreen editing toolbar',
    fullscreenTrigger: 'Edit fullscreen',
    fullscreenButton: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
  },
};

function MarkdownEditor({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
  fullscreenTitle,
  fullscreenDescription,
  fullscreenSidebar,
}: MarkdownEditorProps) {
  const { language } = useLanguage();
  const s = STR[language === 'en' ? 'en' : 'es'];
  const effectivePlaceholder = placeholder ?? s.placeholder;
  const effectiveFullscreenTitle = fullscreenTitle ?? s.fullscreenTitle;
  const effectiveFullscreenDescription = fullscreenDescription ?? s.fullscreenDescription;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fullscreenTextareaRef = useRef<HTMLTextAreaElement>(null);

  const toolbarActions = [
    { id: 'bold', label: s.bold, title: s.bold, prefix: '**', suffix: '**', content: <strong>B</strong> },
    { id: 'italic', label: s.italic, title: s.italic, prefix: '*', suffix: '*', content: <em>I</em> },
    { id: 'heading', label: s.heading, title: s.heading, prefix: '## ', suffix: '', content: 'H' },
    { id: 'quote', label: s.quote, title: s.quote, prefix: '> ', suffix: '', content: '❝' },
    { id: 'unordered-list', label: s.unorderedList, title: s.unorderedList, prefix: '- ', suffix: '', content: '•' },
    { id: 'ordered-list', label: s.orderedList, title: s.orderedList, prefix: '1. ', suffix: '', content: '1.' },
  ];

  function insertMarkdown(targetRef: RefObject<HTMLTextAreaElement | null>, prefix: string, suffix = '') {
    const textarea = targetRef.current;
    if (!textarea || disabled) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const scrollTop = textarea.scrollTop;
    const selected = value.slice(start, end) || s.selectedFallback;
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    onChange(next);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.scrollTop = scrollTop;
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = start + prefix.length + selected.length;
    });
  }

  function renderToolbarButtons(targetRef: RefObject<HTMLTextAreaElement | null>) {
    return toolbarActions.map((action) => (
      <Button size="content" variant="ghost"
        type="button"
        title={action.title}
        aria-label={action.label}
        disabled={disabled}
        onClick={() => insertMarkdown(targetRef, action.prefix, action.suffix)}
        key={action.id}
      >
        {action.content}
      </Button>
    ));
  }

  return (
    <Dialog.Root>
      <div className={`markdown-editor${className ? ` ${className}` : ''}`}>
        <div className="markdown-editor-toolbar" aria-label={s.toolbarLabel}>
          {renderToolbarButtons(textareaRef)}
          <span className="markdown-editor-toolbar-spacer" />
          <Dialog.Trigger asChild>
            <Button size="content" variant="ghost" type="button" className="markdown-editor-fullscreen-trigger" disabled={disabled} aria-label={s.fullscreenTrigger} title={s.fullscreenTrigger}>
              {s.fullscreenButton}
            </Button>
          </Dialog.Trigger>
        </div>
        <Textarea
          ref={textareaRef}
          className="markdown-editor-textarea"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={effectivePlaceholder}
          disabled={disabled}
        />
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="markdown-fullscreen-overlay" />
        <Dialog.Content
          className="markdown-editor-fullscreen-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => fullscreenTextareaRef.current?.focus());
          }}
        >
          <Dialog.Title className="markdown-fullscreen-title">{effectiveFullscreenTitle}</Dialog.Title>
          <Dialog.Description className="markdown-fullscreen-description">{effectiveFullscreenDescription}</Dialog.Description>
          <Dialog.Close className="markdown-fullscreen-close" type="button">{s.exitFullscreen}</Dialog.Close>
          <div className={fullscreenSidebar ? 'markdown-editor-fullscreen-layout has-assistant' : 'markdown-editor-fullscreen-layout'}>
          {fullscreenSidebar}
          <div className="markdown-editor markdown-editor-fullscreen-body">
            <div className="markdown-editor-toolbar" aria-label={s.fullscreenToolbarLabel}>
              {renderToolbarButtons(fullscreenTextareaRef)}
            </div>
            <Textarea
              ref={fullscreenTextareaRef}
              className="markdown-editor-textarea"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={effectivePlaceholder}
              disabled={disabled}
            />
          </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default MarkdownEditor;
