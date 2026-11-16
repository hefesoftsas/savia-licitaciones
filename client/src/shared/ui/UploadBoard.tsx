import { Button } from './primitives/button';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useLanguage } from '../i18n';

export interface UploadBoardProps {
  /** Step label above the title, such as STEP 01. */
  kicker?: string;
  title: string;
  /** Description below the title. */
  subtitle?: ReactNode;
  /** Additional content beside the title, such as a file-count summary. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Shared upload card with a header and stacked file rows for initial workflow steps. */
export function UploadBoard({ kicker, title, subtitle, aside, children, className }: UploadBoardProps) {
  return (
    <section className={`upload-board${className ? ` ${className}` : ''}`}>
      <div className="upload-page-title">
        <div>
          {kicker ? <span className="section-kicker">{kicker}</span> : null}
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {aside}
      </div>
      <div className="upload-stack">{children}</div>
    </section>
  );
}

export interface UploadRowProps {
  /** Row number label, such as 01. */
  index?: string;
  title: string;
  /** Additional instructions, such as "Required; multiple files allowed". */
  note?: string;
  /** Action buttons on the right. */
  actions: ReactNode;
  children: ReactNode;
  className?: string;
  /** Enable file dropping: highlight on drag-over and invoke the callback on drop. */
  onDropFiles?: (files: FileList) => void;
  dropDisabled?: boolean;
}

/** Upload row with an optional number, file or empty-state content, and actions. */
export function UploadRow({ index, title, note, actions, children, className, onDropFiles, dropDisabled = false }: UploadRowProps) {
  const [dragOver, setDragOver] = useState(false);
  // Count drag entries and exits to prevent highlight flicker across child elements.
  const dragDepthRef = useRef(0);
  const droppable = Boolean(onDropFiles) && !dropDisabled;

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!droppable || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragOver(true);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!droppable || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!droppable) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragOver(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!droppable) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragOver(false);
    if (event.dataTransfer.files.length > 0) {
      onDropFiles?.(event.dataTransfer.files);
    }
  };

  return (
    <article
      className={`upload-row${className ? ` ${className}` : ''}${dragOver ? ' is-drag-over' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="upload-label">
        {index ? <span>{index}</span> : null}
        <strong>{title}</strong>
        {note ? <small>{note}</small> : null}
      </div>
      <div className="upload-content">{children}</div>
      <div className="upload-actions">{actions}</div>
    </article>
  );
}

export interface UploadFilePillProps {
  /** File-type badge, such as MD or DOCX. */
  badge: string;
  name: string;
  /** Metadata below the name, such as size, parsing method, or word count. */
  meta?: string;
  onRemove?: () => void;
  removeLabel?: string;
  removeAriaLabel?: string;
  removeDisabled?: boolean;
}

/** Uploaded file pill with a badge, name, metadata, and optional remove action. */
export function UploadFilePill({ badge, name, meta, onRemove, removeLabel, removeAriaLabel, removeDisabled = false }: UploadFilePillProps) {
  const { t } = useLanguage();
  const effectiveRemoveLabel = removeLabel ?? t('common.delete');
  return (
    <article className="upload-file-pill">
      <div className="upload-file-icon">{badge}</div>
      <div className="upload-file-info">
        <strong title={name}>{name}</strong>
        {meta ? <span>{meta}</span> : null}
      </div>
      {onRemove ? (
        <Button size="content" variant="ghost" type="button" onClick={onRemove} aria-label={removeAriaLabel || `${effectiveRemoveLabel} ${name}`} disabled={removeDisabled}>
          {effectiveRemoveLabel}
        </Button>
      ) : null}
    </article>
  );
}

export interface UploadEmptyProps {
  title: string;
  hint?: string;
  /** Optional next-step action, such as an upload button. */
  children?: ReactNode;
}

/** Empty upload row with a title, guidance, and optional action. */
export function UploadEmpty({ title, hint, children }: UploadEmptyProps) {
  return (
    <div className="upload-empty">
      <strong>{title}</strong>
      {hint ? <span>{hint}</span> : null}
      {children}
    </div>
  );
}
