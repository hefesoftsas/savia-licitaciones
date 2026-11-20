import { Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { PROJECT_DOCUMENT_ACCEPT } from './zip-extract.mjs';

export interface WebDocumentDropZoneProps {
  language: 'es' | 'en';
  disabled?: boolean;
  label: string;
  onFiles: (files: File[]) => void;
}

/** Drop zone and multi-file picker for project documents and ZIP archives. */
export function WebDocumentDropZone({ language, disabled = false, label, onFiles }: WebDocumentDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);
  const en = language === 'en';

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragOver(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragOver(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragOver(false);
    const dropped = Array.from(event.dataTransfer.files || []);
    if (dropped.length > 0) {
      onFiles(dropped);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selected = Array.from(input.files || []);
    input.value = '';
    if (selected.length > 0) {
      onFiles(selected);
    }
  };

  return (
    <div
      className={`web-document-dropzone${dragOver ? ' is-drag-over' : ''}${disabled ? ' is-disabled' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="web-document-dropzone-icon" aria-hidden="true">
        <Upload size={20} />
      </div>
      <div className="web-document-dropzone-copy">
        <strong>
          {dragOver
            ? (en ? 'Drop files or ZIP archives here' : 'Suelta los archivos o paquetes ZIP aquí')
            : (en ? 'Drag and drop files or ZIP archives' : 'Arrastra y suelta archivos o paquetes ZIP')}
        </strong>
        <span>
          {en
            ? 'PDF, Word, Excel, text or .zip (unzipped automatically). Multiple files allowed.'
            : 'PDF, Word, Excel, texto o .zip (se descomprimen automáticamente). Puedes subir varios a la vez.'}
        </span>
      </div>
      <label className="web-upload web-project-upload">
        {label}
        <input
          type="file"
          multiple
          accept={PROJECT_DOCUMENT_ACCEPT}
          onChange={handleChange}
          disabled={disabled}
        />
      </label>
    </div>
  );
}
