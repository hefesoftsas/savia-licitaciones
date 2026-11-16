import { Button } from './primitives/button';
import * as Dialog from '@/shared/ui/primitives/dialog';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AiHttpErrorPayload } from '../types';
import { useLanguage } from '../i18n';
import { useToast } from './ToastProvider';

const STR = {
  zh: {
    titleNoStatus: 'AI 服务商返回错误',
    titleWithStatus: (status: number, statusText: string) => `AI 服务商返回 HTTP ${status}${statusText ? ` ${statusText}` : ''} 错误`,
    sourceAi: 'AI 服务',
    sourceText: '文本模型',
    sourceGoogleImage: 'Google 生图模型',
    sourceImage: '生图模型',
    noBody: '当前错误没有原始返回内容',
    copied: '原始返回内容已复制',
    copyFailed: '复制失败，请手动选择内容复制',
    closeDetail: '关闭错误详情',
    description: '这是 AI 服务商返回的原始错误内容。HTTP 请求未成功，客户端没有继续解析该响应。',
    moreErrors: (n: number) => `还有 ${n} 个错误待查看`,
    rawPageTitle: 'AI 服务商原始错误页',
    emptyBody: '服务商未返回响应正文。',
    copyRaw: '复制原始返回',
    close: '关闭',
  },
  es: {
    titleNoStatus: 'El proveedor de IA devolvió un error',
    titleWithStatus: (status: number, statusText: string) => `El proveedor de IA devolvió el error HTTP ${status}${statusText ? ` ${statusText}` : ''}`,
    sourceAi: 'Servicio de IA',
    sourceText: 'Modelo de texto',
    sourceGoogleImage: 'Modelo de imágenes de Google',
    sourceImage: 'Modelo de imágenes',
    noBody: 'Este error no tiene contenido original',
    copied: 'Contenido original copiado',
    copyFailed: 'No se pudo copiar, selecciona el contenido manualmente',
    closeDetail: 'Cerrar detalle del error',
    description: 'Este es el contenido original devuelto por el proveedor de IA. La petición HTTP falló y el cliente no lo procesó.',
    moreErrors: (n: number) => `${n} error(es) más por ver`,
    rawPageTitle: 'Página de error original del proveedor de IA',
    emptyBody: 'El proveedor no devolvió cuerpo de respuesta.',
    copyRaw: 'Copiar respuesta original',
    close: 'Cerrar',
  },
  en: {
    titleNoStatus: 'AI provider returned an error',
    titleWithStatus: (status: number, statusText: string) => `AI provider returned HTTP ${status}${statusText ? ` ${statusText}` : ''} error`,
    sourceAi: 'AI service',
    sourceText: 'Text model',
    sourceGoogleImage: 'Google image model',
    sourceImage: 'Image model',
    noBody: 'This error has no raw body',
    copied: 'Raw response copied',
    copyFailed: 'Copy failed, please select the content manually',
    closeDetail: 'Close error details',
    description: 'This is the raw error content returned by the AI provider. The HTTP request failed and the client did not parse the response.',
    moreErrors: (n: number) => `${n} more error(s) to review`,
    rawPageTitle: 'AI provider raw error page',
    emptyBody: 'The provider returned no response body.',
    copyRaw: 'Copy raw response',
    close: 'Close',
  },
};

function isHtmlPayload(error: AiHttpErrorPayload | null) {
  if (!error?.body) return false;
  const contentType = String(error.contentType || '').toLowerCase();
  if (contentType.includes('html')) return true;
  return /<!doctype\s+html|<html[\s>]/i.test(error.body);
}

export function AiHttpErrorDialogProvider({ children }: { children: ReactNode }) {
  const [errors, setErrors] = useState<AiHttpErrorPayload[]>([]);
  const currentError = errors[0] || null;
  const { showToast } = useToast();
  const { language } = useLanguage();
  const s = STR[language];
  const htmlPayload = useMemo(() => isHtmlPayload(currentError), [currentError]);

  const formatTitle = (error: AiHttpErrorPayload | null) => {
    if (!error?.status) return s.titleNoStatus;
    return s.titleWithStatus(error.status, error.statusText || '');
  };

  const formatSource = (source?: string) => {
    if (!source) return s.sourceAi;
    if (source === 'text-model') return s.sourceText;
    if (source === 'google-image-model') return s.sourceGoogleImage;
    if (source === 'openai-compatible-image-model') return s.sourceImage;
    return source;
  };

  useEffect(() => {
    const unsubscribe = window.savia?.ai?.onHttpError?.((event) => {
      setErrors((prev) => [...prev, { ...event, body: String(event.body || '') }]);
    });

    return () => unsubscribe?.();
  }, []);

  const closeCurrent = useCallback(() => {
    setErrors((prev) => prev.slice(1));
  }, []);

  const copyRawBody = useCallback(() => {
    const body = currentError?.body || '';
    if (!body) {
      showToast(s.noBody, 'info');
      return;
    }

    void navigator.clipboard.writeText(body)
      .then(() => showToast(s.copied, 'success'))
      .catch(() => showToast(s.copyFailed, 'error'));
  }, [currentError?.body, showToast, s]);

  return (
    <>
      {children}
      <Dialog.Root open={Boolean(currentError)} onOpenChange={(open) => { if (!open) closeCurrent(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="ai-http-error-modal" />
          <Dialog.Content className="ai-http-error-card">
            <div className="ai-http-error-head">
              <div>
                <span>{formatSource(currentError?.source)}</span>
                <Dialog.Title>{formatTitle(currentError)}</Dialog.Title>
              </div>
              <Dialog.Close className="ai-http-error-close" type="button" aria-label={s.closeDetail}>×</Dialog.Close>
            </div>
            <Dialog.Description className="ai-http-error-description">
              {s.description}
            </Dialog.Description>
            <div className="ai-http-error-meta">
              {currentError?.contentType && <span>{currentError.contentType}</span>}
              {currentError?.createdAt && <span>{new Date(currentError.createdAt).toLocaleString(language === 'en' ? 'en-US' : language === 'es' ? 'es-ES' : 'zh-CN')}</span>}
              {errors.length > 1 && <span>{s.moreErrors(errors.length - 1)}</span>}
            </div>
            <div className="ai-http-error-preview">
              {htmlPayload ? (
                <iframe
                  title={s.rawPageTitle}
                  sandbox=""
                  referrerPolicy="no-referrer"
                  srcDoc={currentError?.body || ''}
                />
              ) : (
                <pre>{currentError?.body || s.emptyBody}</pre>
              )}
            </div>
            <div className="ai-http-error-actions">
              <Button variant="outline" type="button" className="secondary-action" onClick={copyRawBody}>{s.copyRaw}</Button>
              <Dialog.Close type="button" className="primary-action">{s.close}</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

export default AiHttpErrorDialogProvider;
