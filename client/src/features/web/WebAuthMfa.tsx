import { useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui/primitives/button';
import { Input } from '@/shared/ui/primitives/input';

type Language = 'es' | 'en';
type MfaMethod = 'totp' | 'backup' | 'otp';

type Props = {
  language: Language;
  busy: boolean;
  emailEnabled: boolean;
  onVerify: (method: MfaMethod, code: string, trustDevice: boolean) => void;
  onSendOtp: () => Promise<void>;
  onCancel: () => void;
};

export function WebAuthMfa({ language, busy, emailEnabled, onVerify, onSendOtp, onCancel }: Props) {
  const en = language === 'en';
  const [method, setMethod] = useState<MfaMethod>('totp');
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim() || busy) return;
    onVerify(method, code.trim(), trustDevice);
  };

  const switchMethod = (next: MfaMethod) => {
    setMethod(next);
    setCode('');
  };

  const requestEmailOtp = () => {
    switchMethod('otp');
    void onSendOtp().then(() => setOtpSent(true)).catch(() => undefined);
  };

  return (
    <>
      <header className="web-auth-heading">
        <h1>{en ? 'Two-factor verification' : 'Verificación en dos pasos'}</h1>
        <p>
          {method === 'totp'
            ? (en ? 'Enter the 6-digit code from your authenticator app.' : 'Introduce el código de 6 dígitos de tu aplicación de autenticación.')
            : method === 'backup'
              ? (en ? 'Enter one of your single-use backup codes.' : 'Introduce uno de tus códigos de respaldo de un solo uso.')
              : (en ? 'Enter the verification code sent to your email.' : 'Introduce el código de verificación enviado a tu correo.')}
        </p>
      </header>
      {method === 'otp' && otpSent && (
        <p className="web-auth-notice" role="status">
          {en ? 'We sent a verification code to your email.' : 'Enviamos un código de verificación a tu correo.'}
        </p>
      )}
      <form onSubmit={submit} className="web-auth-form">
        <label htmlFor="auth-mfa-code">
          {method === 'backup' ? (en ? 'Backup code' : 'Código de respaldo') : (en ? 'Verification code' : 'Código de verificación')}
          <Input
            id="auth-mfa-code"
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode={method === 'backup' ? 'text' : 'numeric'}
            placeholder={method === 'backup' ? 'xxxx-xxxx' : '000000'}
            disabled={busy}
          />
        </label>
        <label className="web-consent">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(event) => setTrustDevice(event.target.checked)}
            disabled={busy}
          />
          {en ? 'Trust this device for 30 days' : 'Confiar en este dispositivo durante 30 días'}
        </label>
        <Button type="submit" className="web-auth-submit" disabled={busy || !code.trim()}>
          {busy ? (en ? 'Verifying…' : 'Verificando…') : (en ? 'Verify' : 'Verificar')}
        </Button>
      </form>
      <div className="web-auth-mfa-methods">
        {method !== 'totp' && (
          <button className="web-auth-inline-link" type="button" onClick={() => switchMethod('totp')} disabled={busy}>
            {en ? 'Use authenticator app' : 'Usar app de autenticación'}
          </button>
        )}
        {method !== 'backup' && (
          <button className="web-auth-inline-link" type="button" onClick={() => switchMethod('backup')} disabled={busy}>
            {en ? 'Use a backup code' : 'Usar código de respaldo'}
          </button>
        )}
        {emailEnabled && method !== 'otp' && (
          <button className="web-auth-inline-link" type="button" onClick={requestEmailOtp} disabled={busy}>
            {en ? 'Send code by email' : 'Enviar código por correo'}
          </button>
        )}
      </div>
      <p className="web-auth-verification">
        <button className="web-auth-inline-link" type="button" onClick={onCancel} disabled={busy}>
          {en ? 'Back to sign in' : 'Volver al inicio de sesión'}
        </button>
      </p>
    </>
  );
}
