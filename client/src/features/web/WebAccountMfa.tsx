import { useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, Download, KeyRound, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import { generateQrSvgPath } from './qr-svg';

type Language = 'es' | 'en';
type Props = {
  language: Language;
  twoFactorEnabled: boolean;
  onUpdated: () => Promise<void>;
};

export function WebAccountMfa({ language, twoFactorEnabled, onUpdated }: Props) {
  const en = language === 'en';
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [setupData, setSetupData] = useState<{ totpURI: string; secret: string; backupCodes: string[] } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const qrSvg = useMemo(() => (setupData?.totpURI ? generateQrSvgPath(setupData.totpURI) : null), [setupData?.totpURI]);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      window.setTimeout(() => setCopiedValue((current) => (current === value ? null : current)), 1800);
      showToast(en ? `${label} copied.` : `${label} copiado.`, 'success');
    } catch {
      showToast(en ? 'Could not copy to clipboard.' : 'No se pudo copiar al portapapeles.', 'error');
    }
  };

  const downloadBackupCodes = (codes: string[]) => {
    const content = [
      en ? 'Savia — Two-factor authentication backup codes' : 'Savia — Códigos de respaldo para verificación en dos pasos',
      en ? 'Each code can be used once.' : 'Cada código puede utilizarse una sola vez.',
      '',
      ...codes,
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'savia-mfa-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  const startEnable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const password = String(new FormData(form).get('password') || '');
    setBusy(true);
    try {
      const result = await request<{ totpURI: string; backupCodes: string[] }>('/api/auth/two-factor/enable', {
        method: 'POST',
        json: { password, issuer: 'Savia' },
      });
      let secret = '';
      try {
        secret = new URL(result.totpURI).searchParams.get('secret') || '';
      } catch {
        secret = '';
      }
      setSetupData({ totpURI: result.totpURI, secret, backupCodes: result.backupCodes || [] });
      form.reset();
    } catch {
      showToast(en ? 'Could not start 2FA setup. Check your password.' : 'No se pudo iniciar la configuración de MFA. Comprueba tu contraseña.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const code = String(new FormData(form).get('code') || '').replace(/\s+/g, '').trim();
    setBusy(true);
    try {
      await request('/api/auth/two-factor/verify-totp', {
        method: 'POST',
        json: { code },
      });
      setSetupData(null);
      form.reset();
      await onUpdated();
      showToast(en ? 'Two-factor authentication enabled.' : 'Verificación en dos pasos activada.', 'success');
    } catch {
      showToast(en ? 'Invalid verification code. Try again.' : 'Código de verificación no válido. Inténtalo de nuevo.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const regenerateBackupCodes = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const password = String(new FormData(form).get('password') || '');
    setBusy(true);
    try {
      const result = await request<{ backupCodes: string[] }>('/api/auth/two-factor/generate-backup-codes', {
        method: 'POST',
        json: { password },
      });
      setBackupCodes(result.backupCodes || []);
      form.reset();
      showToast(en ? 'New backup codes generated.' : 'Nuevos códigos de respaldo generados.', 'success');
    } catch {
      showToast(en ? 'Could not generate backup codes. Check your password.' : 'No se pudieron generar los códigos. Comprueba tu contraseña.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const disableMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const password = String(new FormData(form).get('password') || '');
    setBusy(true);
    try {
      await request('/api/auth/two-factor/disable', {
        method: 'POST',
        json: { password },
      });
      setBackupCodes(null);
      setSetupData(null);
      form.reset();
      await onUpdated();
      showToast(en ? 'Two-factor authentication disabled.' : 'Verificación en dos pasos desactivada.', 'success');
    } catch {
      showToast(en ? 'Could not disable 2FA. Check your password.' : 'No se pudo desactivar MFA. Comprueba tu contraseña.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const renderBackupCodesBox = (codes: string[], title: string) => (
    <div className="web-mfa-backup-box">
      <div className="web-mfa-backup-header">
        <strong>{title}</strong>
        <div className="web-mfa-backup-actions">
          <Button
            icon={copiedValue === codes.join('\n') ? Check : Copy}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void copyText(codes.join('\n'), en ? 'Backup codes' : 'Códigos de respaldo')}
          >
            {en ? 'Copy all' : 'Copiar todos'}
          </Button>
          <Button
            icon={Download}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => downloadBackupCodes(codes)}
          >
            {en ? 'Download .txt' : 'Descargar .txt'}
          </Button>
        </div>
      </div>
      <div className="web-mfa-backup-grid">
        {codes.map((code) => (
          <button
            key={code}
            type="button"
            className="web-mfa-backup-item"
            title={en ? 'Click to copy code' : 'Haz clic para copiar el código'}
            onClick={() => void copyText(code, en ? 'Backup code' : 'Código de respaldo')}
          >
            <span>{code}</span>
            {copiedValue === code ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <section className="web-profile-group">
      <div className="web-mfa-summary">
        <strong>{en ? 'Two-factor authentication (MFA)' : 'Verificación en dos pasos (MFA)'}</strong>
        <span className={`web-market-badge ${twoFactorEnabled ? '' : 'is-subtle'}`}>
          {twoFactorEnabled ? (en ? 'Enabled' : 'Activada') : (en ? 'Disabled' : 'Desactivada')}
        </span>
      </div>

      <div className="web-mfa-body">
        {!twoFactorEnabled && !setupData && (
          <form className="web-stack" onSubmit={(event) => void startEnable(event)}>
            <p className="web-mfa-lead">
              {en
                ? 'Protect your account with an authenticator app (TOTP) and single-use backup codes.'
                : 'Protege tu cuenta con una aplicación de autenticación (TOTP) y códigos de respaldo de un solo uso.'}
            </p>
            <div className="web-profile-fields">
              <label>
                <span>{en ? 'Current password' : 'Contraseña actual'}</span>
                <Input name="password" type="password" required autoComplete="current-password" disabled={busy} />
              </label>
            </div>
            <div className="web-inline">
              <Button icon={ShieldCheck} type="submit" disabled={busy}>
                {en ? 'Enable MFA' : 'Activar MFA'}
              </Button>
            </div>
          </form>
        )}

        {!twoFactorEnabled && setupData && (
          <>
            <p className="web-mfa-lead">
              {en
                ? 'Scan this QR code with your authenticator app (Google Authenticator, 1Password, Bitwarden, etc.) or copy the setup key, then enter the 6-digit code to confirm.'
                : 'Escanea este código QR con tu aplicación de autenticación (Google Authenticator, 1Password, Bitwarden, etc.) o copia la clave manualmente, e introduce el código de 6 dígitos para confirmar.'}
            </p>
            <div className="web-mfa-setup-grid">
              {qrSvg && (
                <div className="web-mfa-qr-frame">
                  <svg
                    width={176}
                    height={176}
                    viewBox={`0 0 ${qrSvg.viewBoxSize} ${qrSvg.viewBoxSize}`}
                    role="img"
                    aria-label={en ? 'QR code for two-factor authentication setup' : 'Código QR para configurar la verificación en dos pasos'}
                    shapeRendering="crispEdges"
                  >
                    <rect width={qrSvg.viewBoxSize} height={qrSvg.viewBoxSize} fill="#ffffff" />
                    <path d={qrSvg.path} fill="#000000" />
                  </svg>
                </div>
              )}
              <div className="web-mfa-setup-details">
                {setupData.secret && (
                  <div>
                    <span className="web-mfa-field-label">{en ? 'Manual setup key' : 'Clave de configuración manual'}</span>
                    <div className="web-mfa-secret-row">
                      <code className="web-mfa-secret-code">{setupData.secret}</code>
                      <Button
                        icon={copiedValue === setupData.secret ? Check : Copy}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void copyText(setupData.secret, en ? 'Secret key' : 'Clave secreta')}
                      >
                        {en ? 'Copy key' : 'Copiar clave'}
                      </Button>
                      <Button
                        icon={copiedValue === setupData.totpURI ? Check : Copy}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void copyText(setupData.totpURI, 'URI otpauth')}
                      >
                        {en ? 'Copy URI' : 'Copiar URI'}
                      </Button>
                    </div>
                  </div>
                )}
                <form className="web-stack" onSubmit={(event) => void confirmEnable(event)}>
                  <div className="web-profile-fields">
                    <label>
                      <span>{en ? '6-digit verification code' : 'Código de verificación de 6 dígitos'}</span>
                      <Input name="code" required inputMode="numeric" autoComplete="one-time-code" placeholder="000000" disabled={busy} />
                    </label>
                  </div>
                  <div className="web-inline">
                    <Button icon={KeyRound} type="submit" disabled={busy}>
                      {en ? 'Confirm and activate' : 'Confirmar y activar'}
                    </Button>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => setSetupData(null)}>
                      {en ? 'Cancel' : 'Cancelar'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
            {setupData.backupCodes.length > 0 && renderBackupCodesBox(
              setupData.backupCodes,
              en ? 'Backup codes (save them in a safe place)' : 'Códigos de respaldo (guárdalos en un lugar seguro)',
            )}
          </>
        )}

        {twoFactorEnabled && (
          <>
            <p className="web-mfa-lead">
              {en
                ? 'Two-factor authentication is active on your account. You can regenerate single-use backup codes or disable MFA below.'
                : 'La verificación en dos pasos está activa en tu cuenta. Puedes regenerar tus códigos de respaldo de un solo uso o desactivar MFA.'}
            </p>
            {backupCodes && backupCodes.length > 0 && renderBackupCodesBox(
              backupCodes,
              en ? 'New backup codes' : 'Nuevos códigos de respaldo',
            )}
            <form className="web-stack" onSubmit={(event) => void regenerateBackupCodes(event)}>
              <div className="web-profile-fields">
                <label>
                  <span>{en ? 'Password to regenerate backup codes' : 'Contraseña para regenerar códigos de respaldo'}</span>
                  <Input name="password" type="password" required autoComplete="current-password" disabled={busy} />
                </label>
              </div>
              <div className="web-inline">
                <Button icon={RefreshCw} type="submit" variant="outline" disabled={busy}>
                  {en ? 'Regenerate backup codes' : 'Regenerar códigos de respaldo'}
                </Button>
              </div>
            </form>
            <form className="web-stack web-mfa-divider" onSubmit={(event) => void disableMfa(event)}>
              <div className="web-profile-fields">
                <label>
                  <span>{en ? 'Password to disable MFA' : 'Contraseña para desactivar MFA'}</span>
                  <Input name="password" type="password" required autoComplete="current-password" disabled={busy} />
                </label>
              </div>
              <div className="web-inline">
                <Button icon={ShieldOff} type="submit" variant="destructive" disabled={busy}>
                  {en ? 'Disable MFA' : 'Desactivar MFA'}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
