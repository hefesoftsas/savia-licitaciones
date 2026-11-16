import type { ToastOptions, ToastType } from './ui';
import type { AppLocale } from './i18n';

type ShowToast = (message: string, type?: ToastType, options?: ToastOptions) => number;

let promptedUpdateVersion = '';

export function hasPromptedUpdate(version: string) {
  return Boolean(version) && promptedUpdateVersion === version;
}

const STR: Record<AppLocale, {
  installFailed: string; readyTitle: string; installRestart: string; later: string;
  newVersion: (v: string) => string; readyBody: string;
}> = {
  zh: {
    installFailed: '安装更新失败', readyTitle: '更新已准备好', installRestart: '安装并重启', later: '稍后',
    newVersion: (v) => `新版本 ${v}`, readyBody: '已下载完成，可重启应用安装。',
  },
  es: {
    installFailed: 'Falló la instalación', readyTitle: 'Actualización lista', installRestart: 'Instalar y reiniciar', later: 'Más tarde',
    newVersion: (v) => `Nueva versión ${v}`, readyBody: 'descargada; reinicia para instalar.',
  },
  en: {
    installFailed: 'Install failed', readyTitle: 'Update ready', installRestart: 'Install & restart', later: 'Later',
    newVersion: (v) => `New version ${v}`, readyBody: 'downloaded; restart to install.',
  },
};

export function showUpdateReadyToast(showToast: ShowToast, version: string, language: AppLocale = 'zh') {
  if (version) {
    promptedUpdateVersion = version;
  }
  const s = STR[language] ?? STR.zh;

  const installUpdate = async () => {
    const result = await window.savia?.quitAndInstall();
    if (result && !result.success) {
      showToast(result.message || s.installFailed, 'error');
    }
  };

  const versionText = version ? s.newVersion(version) : s.readyTitle;
  showToast(`${versionText} ${s.readyBody}`, 'info', {
    title: s.readyTitle,
    persistent: true,
    actions: [
      {
        label: s.installRestart,
        variant: 'primary',
        close: false,
        onClick: installUpdate,
      },
      { label: s.later },
    ],
  });
}
