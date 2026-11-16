import { Button } from './primitives/button';
import * as Dialog from '@/shared/ui/primitives/dialog';
import { useLanguage } from '../i18n';

export interface PreviewImage {
  src: string;
  alt: string;
}

export interface ImagePreviewDialogProps {
  image: PreviewImage | null;
  onClose: () => void;
}

const STR = {
  zh: {
    fallbackTitle: '公告图片预览',
    description: '查看公告中的图片大图。',
    closeLabel: '关闭图片预览',
  },
  es: {
    fallbackTitle: 'Vista previa de la imagen del aviso',
    description: 'Ver la imagen del aviso en grande.',
    closeLabel: 'Cerrar vista previa',
  },
  en: {
    fallbackTitle: 'Notice image preview',
    description: 'View the large notice image.',
    closeLabel: 'Close image preview',
  },
};

/** Full-size Markdown image preview displayed above regular dialogs. */
export default function ImagePreviewDialog({ image, onClose }: ImagePreviewDialogProps) {
  const { language } = useLanguage();
  const pick = (zh: string, es: string, en: string) => language === 'es' ? es : language === 'en' ? en : zh;
  return (
    <Dialog.Root open={Boolean(image)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="remote-notice-preview-modal" />
        <Dialog.Content className="remote-notice-preview-card">
          <Dialog.Title className="sr-only">{image?.alt || pick(STR.zh.fallbackTitle, STR.es.fallbackTitle, STR.en.fallbackTitle)}</Dialog.Title>
          <Dialog.Description className="sr-only">{pick(STR.zh.description, STR.es.description, STR.en.description)}</Dialog.Description>
          <Button size="content" variant="ghost" className="remote-notice-preview-close" type="button" aria-label={pick(STR.zh.closeLabel, STR.es.closeLabel, STR.en.closeLabel)} onClick={onClose}>×</Button>
          {image ? <img src={image.src} alt={image.alt} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
