import { Button } from './primitives/button';
import * as Dialog from '@/shared/ui/primitives/dialog';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useLanguage } from '../i18n';

export const LIBREOFFICE_DOWNLOAD_URL = 'https://www.libreoffice.org/download/download-libreoffice/';
// Preserve these source strings: isLibreOfficeRequiredMessage matches Main errors against them.
export const LIBREOFFICE_REQUIRED_MESSAGE = `.doc和.wps识别，需要安装 LibreOffice、WPS Office 或 Microsoft Word 任意一种本地转换组件（LibreOffice 下载：${LIBREOFFICE_DOWNLOAD_URL}），或者手动将文件转换为.docx格式再上传`;

const STR = {
  zh: {
    kicker: '本地转换组件缺失',
    title: '需要安装本地 Office 转换组件',
    closeLabel: '关闭提示',
    body: '.doc 和 .wps 识别需要安装 LibreOffice、WPS Office 或 Microsoft Word 任意一种，或者手动将文件转换为 .docx 格式再上传。',
    download: '下载 LibreOffice',
    gotIt: '我知道了',
  },
  es: {
    kicker: 'Falta el conversor local',
    title: 'Instala un conversor local de Office',
    closeLabel: 'Cerrar aviso',
    body: 'Para reconocer .doc y .wps instala LibreOffice, WPS Office o Microsoft Word, o convierte el archivo a .docx antes de subirlo.',
    download: 'Descargar LibreOffice',
    gotIt: 'Entendido',
  },
  en: {
    kicker: 'Local converter missing',
    title: 'Install a local Office converter',
    closeLabel: 'Dismiss notice',
    body: 'To parse .doc and .wps, install LibreOffice, WPS Office or Microsoft Word, or convert the file to .docx before uploading.',
    download: 'Download LibreOffice',
    gotIt: 'Got it',
  },
};

interface DocumentParseNoticeContextValue {
  showDocumentParseNotice: (message?: string) => void;
}

const DocumentParseNoticeContext = createContext<DocumentParseNoticeContextValue | null>(null);

export function isLibreOfficeRequiredMessage(value: unknown) {
  const message = String(value || '');
  return message.includes('需要安装')
    && (message.includes('本地转换组件') || message.includes('LibreOffice') || message.includes('WPS Office') || message.includes('Microsoft Word'))
    && message.includes('.wps');
}

export function DocumentParseNoticeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { language } = useLanguage();
  const pick = (zh: string, es: string, en: string) => language === 'es' ? es : language === 'en' ? en : zh;

  const showDocumentParseNotice = useCallback(() => {
    setOpen(true);
  }, []);

  const openDownload = useCallback(() => {
    void window.savia?.openExternal(LIBREOFFICE_DOWNLOAD_URL);
  }, []);

  const value = useMemo(() => ({ showDocumentParseNotice }), [showDocumentParseNotice]);

  return (
    <DocumentParseNoticeContext.Provider value={value}>
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="document-parse-notice-modal" />
          <Dialog.Content className="document-parse-notice-card">
            <div className="document-parse-notice-head">
              <div>
                <span>{pick(STR.zh.kicker, STR.es.kicker, STR.en.kicker)}</span>
                <Dialog.Title>{pick(STR.zh.title, STR.es.title, STR.en.title)}</Dialog.Title>
              </div>
              <Dialog.Close className="document-parse-notice-close" type="button" aria-label={pick(STR.zh.closeLabel, STR.es.closeLabel, STR.en.closeLabel)}>×</Dialog.Close>
            </div>
            <Dialog.Description className="document-parse-notice-body">
              {pick(STR.zh.body, STR.es.body, STR.en.body)}
            </Dialog.Description>
            <div className="document-parse-notice-actions">
              <Button variant="default" className="primary-action" type="button" onClick={openDownload}>{pick(STR.zh.download, STR.es.download, STR.en.download)}</Button>
              <Dialog.Close className="secondary-action" type="button">{pick(STR.zh.gotIt, STR.es.gotIt, STR.en.gotIt)}</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </DocumentParseNoticeContext.Provider>
  );
}

export function useDocumentParseNotice() {
  const context = useContext(DocumentParseNoticeContext);

  if (!context) {
    throw new Error('useDocumentParseNotice 必须在 DocumentParseNoticeProvider 内使用');
  }

  return context;
}
