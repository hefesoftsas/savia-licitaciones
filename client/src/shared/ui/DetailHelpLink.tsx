import { Button } from './primitives/button';
import * as Dialog from '@/shared/ui/primitives/dialog';
import type { ReactNode } from 'react';
import { useLanguage } from '../i18n';

export interface DetailHelpLinkProps {
  title: string;
  children: ReactNode;
  label?: string;
}

const STR = {
  zh: { label: '详细说明', closeLabel: '关闭详细说明', gotIt: '知道了' },
  es: { label: 'Detalles', closeLabel: 'Cerrar detalles', gotIt: 'Entendido' },
  en: { label: 'Details', closeLabel: 'Close details', gotIt: 'Got it' },
};

export default function DetailHelpLink({ title, children, label }: DetailHelpLinkProps) {
  const { language } = useLanguage();
  const pick = (zh: string, es: string, en: string) => language === 'es' ? es : language === 'en' ? en : zh;
  const effectiveLabel = label ?? pick(STR.zh.label, STR.es.label, STR.en.label);
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button size="content" variant="ghost" className="detail-help-link" type="button">{effectiveLabel}</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="detail-help-modal" />
        <Dialog.Content className="detail-help-card">
          <div className="detail-help-head">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="detail-help-close" type="button" aria-label={pick(STR.zh.closeLabel, STR.es.closeLabel, STR.en.closeLabel)}>×</Dialog.Close>
          </div>
          <Dialog.Description asChild>
            <div className="detail-help-body">{children}</div>
          </Dialog.Description>
          <div className="detail-help-actions">
            <Dialog.Close className="primary-action" type="button">{pick(STR.zh.gotIt, STR.es.gotIt, STR.en.gotIt)}</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
