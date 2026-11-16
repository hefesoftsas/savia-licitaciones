import { PRODUCT_REPOSITORY_URL } from '../product';
import { useCallback } from 'react';
import type { AppMenuNotice } from '../types/navigation';
import { useLanguage } from '../i18n';
import { useToast } from './ToastProvider';

// Keep source strings as stable markers for callers such as menuConfig.
const GITHUB_STAR_ZH = '正在开发中，在github给作者点个star，可以加速开发。';
const OPEN_LINK_ZH = '点此直达';

export const githubStarNotice: AppMenuNotice = {
  message: GITHUB_STAR_ZH,
  actionLabel: OPEN_LINK_ZH,
  externalUrl: PRODUCT_REPOSITORY_URL,
};

// Explain unavailable features in a toast with an optional external link.
// Resolve the default source strings through the selected language dictionary.
export function useNoticeToast() {
  const { showToast, t } = useToastWithT();

  return useCallback((notice: AppMenuNotice) => {
    const { externalUrl } = notice;
    const message = notice.message === GITHUB_STAR_ZH ? t('notice.wip') : notice.message;
    const fallbackLabel = t('notice.openLinkFallback');
    const defaultLabel = notice.actionLabel === OPEN_LINK_ZH ? t('notice.openLink') : (notice.actionLabel || fallbackLabel);
    showToast(message, 'info', {
      duration: 7000,
      actions: externalUrl ? [
        {
          label: defaultLabel,
          variant: 'primary',
          onClick: () => openExternalUrl(externalUrl),
        },
      ] : undefined,
    });
  }, [showToast, t]);
}

function useToastWithT() {
  const { showToast } = useToast();
  const { t } = useLanguage();
  return { showToast, t };
}

async function openExternalUrl(url: string) {
  if (window.savia?.openExternal) {
    await window.savia.openExternal(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
