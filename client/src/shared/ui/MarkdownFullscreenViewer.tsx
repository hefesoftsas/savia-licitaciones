import { Button } from './primitives/button';
import * as Dialog from '@/shared/ui/primitives/dialog';
import type { CSSProperties, ReactNode } from 'react';
import { useLanguage } from '../i18n';

export interface MarkdownFullscreenViewerProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  title?: string;
  description?: string;
  buttonLabel?: string;
  disabled?: boolean;
  showFullscreen?: boolean;
  fullscreenClassName?: string;
  fullscreenStyle?: CSSProperties;
  fullscreenChildren?: ReactNode;
}

const STR = {
  zh: {
    title: 'Markdown 全屏预览',
    description: '全屏查看当前 Markdown 内容。',
    button: '全屏',
    exit: '退出全屏',
  },
  es: {
    title: 'Vista previa Markdown a pantalla completa',
    description: 'Ver el contenido Markdown actual a pantalla completa.',
    button: 'Pantalla completa',
    exit: 'Salir de pantalla completa',
  },
  en: {
    title: 'Markdown fullscreen preview',
    description: 'View the current Markdown content fullscreen.',
    button: 'Fullscreen',
    exit: 'Exit fullscreen',
  },
};

function MarkdownFullscreenViewer({
  children,
  className = 'markdown-viewer',
  style,
  title,
  description,
  buttonLabel,
  disabled = false,
  showFullscreen = true,
  fullscreenClassName,
  fullscreenStyle,
  fullscreenChildren,
}: MarkdownFullscreenViewerProps) {
  const { language } = useLanguage();
  const s = STR[language];
  const effectiveTitle = title ?? s.title;
  const effectiveDescription = description ?? s.description;
  const effectiveButtonLabel = buttonLabel ?? s.button;
  const normalClassName = className;
  const dialogContentClassName = fullscreenClassName || className || 'markdown-viewer';
  const dialogStyle = fullscreenStyle || style;

  return (
    <Dialog.Root>
      <div className="markdown-fullscreen-frame">
        <div className={normalClassName} style={style}>{children}</div>
        {showFullscreen && (
          <Dialog.Trigger asChild>
            <Button size="content" variant="ghost" type="button" className="markdown-fullscreen-trigger" disabled={disabled} aria-label={effectiveButtonLabel} title={effectiveButtonLabel}>
              {effectiveButtonLabel}
            </Button>
          </Dialog.Trigger>
        )}
      </div>
      {showFullscreen && (
        <Dialog.Portal>
          <Dialog.Overlay className="markdown-fullscreen-overlay" />
          <Dialog.Content className="markdown-fullscreen-dialog">
            <Dialog.Title className="markdown-fullscreen-title">{effectiveTitle}</Dialog.Title>
            <Dialog.Description className="markdown-fullscreen-description">{effectiveDescription}</Dialog.Description>
            <Dialog.Close className="markdown-fullscreen-close" type="button">{s.exit}</Dialog.Close>
            <div className="markdown-fullscreen-content">
              <div className={dialogContentClassName} style={dialogStyle}>{fullscreenChildren || children}</div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}

export default MarkdownFullscreenViewer;
