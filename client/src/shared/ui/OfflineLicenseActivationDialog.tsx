import { Button } from './primitives/button';
import { Textarea } from './primitives/textarea';
import * as Dialog from '@/shared/ui/primitives/dialog';
import { useEffect, useState } from 'react';
import type { LicenseOfflineActivationResult, LicenseRuntimeStatus } from '../types';
import { useLanguage } from '../i18n';
import { useToast } from './ToastProvider';

interface OfflineLicenseActivationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActivated?: (status: LicenseRuntimeStatus) => void;
}

type BusyAction = 'file' | 'code' | null;

const STR = {
  zh: {
    noResult: '离线授权激活未返回结果',
    canceled: '已取消选择',
    activateFailed: '离线授权激活失败',
    activated: '离线授权已激活',
    pasteFirst: '请先粘贴离线授权码',
    importFailed: '导入离线授权文件失败',
    codeFailed: '离线授权码激活失败',
    clientLoading: '当前 Client ID 仍在读取中',
    clientCopied: 'Client ID 已复制',
    copyFailed: '复制失败，请手动选择 Client ID',
    title: '离线激活授权',
    clientLabel: '当前 Client ID',
    loading: '读取中...',
    copy: '复制',
    importFile: '导入授权文件',
    importing: '导入中...',
    codeLabel: '离线授权码',
    codePh: '粘贴 Dashboard 生成的离线授权码',
    cancel: '取消',
    activate: '激活授权码',
    activating: '激活中...',
  },
  es: {
    noResult: 'La activación offline no devolvió resultado',
    canceled: 'Selección cancelada',
    activateFailed: 'Falló la activación offline',
    activated: 'Licencia offline activada',
    pasteFirst: 'Pega primero el código de autorización offline',
    importFailed: 'No se pudo importar el archivo de licencia offline',
    codeFailed: 'No se pudo activar el código offline',
    clientLoading: 'El Client ID aún se está leyendo',
    clientCopied: 'Client ID copiado',
    copyFailed: 'No se pudo copiar, selecciona el Client ID manualmente',
    title: 'Activación offline',
    clientLabel: 'Client ID actual',
    loading: 'Leyendo...',
    copy: 'Copiar',
    importFile: 'Importar archivo',
    importing: 'Importando...',
    codeLabel: 'Código offline',
    codePh: 'Pega el código generado en el Dashboard',
    cancel: 'Cancelar',
    activate: 'Activar código',
    activating: 'Activando...',
  },
  en: {
    noResult: 'Offline activation returned no result',
    canceled: 'Selection canceled',
    activateFailed: 'Offline activation failed',
    activated: 'Offline license activated',
    pasteFirst: 'Paste the offline authorization code first',
    importFailed: 'Failed to import offline license file',
    codeFailed: 'Failed to activate offline code',
    clientLoading: 'Client ID is still loading',
    clientCopied: 'Client ID copied',
    copyFailed: 'Copy failed, please select the Client ID manually',
    title: 'Offline activation',
    clientLabel: 'Current Client ID',
    loading: 'Loading...',
    copy: 'Copy',
    importFile: 'Import file',
    importing: 'Importing...',
    codeLabel: 'Offline code',
    codePh: 'Paste the offline code generated in the Dashboard',
    cancel: 'Cancel',
    activate: 'Activate code',
    activating: 'Activating...',
  },
};

function OfflineLicenseActivationDialog({ open, onOpenChange, onActivated }: OfflineLicenseActivationDialogProps) {
  const [clientId, setClientId] = useState('');
  const [licenseCode, setLicenseCode] = useState('');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const { showToast } = useToast();
  const { language } = useLanguage();
  const s = STR[language];

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    void window.savia?.config.load()
      .then((config) => {
        if (!disposed) {
          setClientId(config?.analytics_client_id || '');
        }
      })
      .catch(() => {
        if (!disposed) {
          setClientId('');
        }
      });
    return () => {
      disposed = true;
    };
  }, [open]);

  const handleActivationResult = (result: LicenseOfflineActivationResult | undefined) => {
    if (!result) {
      throw new Error(s.noResult);
    }
    if (result.canceled) {
      showToast(result.message || s.canceled, 'info');
      return;
    }
    if (!result.success) {
      showToast(result.message || s.activateFailed, 'error');
      return;
    }
    showToast(result.message || s.activated, 'success');
    onActivated?.(result.status);
    onOpenChange(false);
    setLicenseCode('');
  };

  const importOfflineFile = async () => {
    if (busyAction) return;
    try {
      setBusyAction('file');
      const result = await window.savia?.license.importOfflineFile();
      handleActivationResult(result);
    } catch (error) {
      showToast(error instanceof Error ? error.message : s.importFailed, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const activateOfflineCode = async () => {
    if (busyAction) return;
    if (!licenseCode.trim()) {
      showToast(s.pasteFirst, 'info');
      return;
    }
    try {
      setBusyAction('code');
      const result = await window.savia?.license.activateOfflineCode(licenseCode);
      handleActivationResult(result);
    } catch (error) {
      showToast(error instanceof Error ? error.message : s.codeFailed, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const copyClientId = async () => {
    if (!clientId) {
      showToast(s.clientLoading, 'info');
      return;
    }
    try {
      await navigator.clipboard.writeText(clientId);
      showToast(s.clientCopied, 'success');
    } catch {
      showToast(s.copyFailed, 'error');
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content className="offline-license-dialog">
          <Dialog.Title>{s.title}</Dialog.Title>
          <div className="offline-license-client">
            <span>{s.clientLabel}</span>
            <code>{clientId || s.loading}</code>
            <Button variant="outline" type="button" className="secondary-action" onClick={copyClientId}>{s.copy}</Button>
          </div>
          <div className="offline-license-import">
            <Button variant="default" type="button" className="primary-action" onClick={importOfflineFile} disabled={Boolean(busyAction)}>
              {busyAction === 'file' ? s.importing : s.importFile}
            </Button>
          </div>
          <label className="offline-license-code-field">
            <span>{s.codeLabel}</span>
            <Textarea value={licenseCode} onChange={(event) => setLicenseCode(event.target.value)} placeholder={s.codePh} />
          </label>
          <div className="offline-license-actions">
            <Dialog.Close asChild>
              <Button variant="outline" type="button" className="secondary-action" disabled={Boolean(busyAction)}>{s.cancel}</Button>
            </Dialog.Close>
            <Button variant="default" type="button" className="primary-action" onClick={activateOfflineCode} disabled={Boolean(busyAction)}>
              {busyAction === 'code' ? s.activating : s.activate}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default OfflineLicenseActivationDialog;
