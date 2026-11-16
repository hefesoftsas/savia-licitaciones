import { KeyRound } from 'lucide-react';
import { WebAccountMfa } from './WebAccountMfa';
import { useState, type FormEvent } from 'react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/primitives/tabs';
import { useToast } from '@/shared/ui/ToastProvider';
import { changeAccountPassword } from './account-password.mjs';

type Language = 'es' | 'en';

export function AccountPasswordForm({ language, busy, onSubmit }: { language: Language; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const en = language === 'en';
  return (
    <form className="web-account-password-form" onSubmit={onSubmit}>
      <label>
        <span>{en ? 'Current password' : 'Contraseña actual'}</span>
        <Input name="currentPassword" type="password" required autoComplete="current-password" disabled={busy} />
      </label>
      <label>
        <span>{en ? 'New password' : 'Nueva contraseña'}</span>
        <Input name="newPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" disabled={busy} />
      </label>
      <label>
        <span>{en ? 'Confirm new password' : 'Confirmar nueva contraseña'}</span>
        <Input name="confirmPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" disabled={busy} />
      </label>
      <label className="web-consent">
        <input type="checkbox" name="revokeOtherSessions" disabled={busy} />
        <span>{en ? 'Sign out other sessions' : 'Cerrar otras sesiones'}</span>
      </label>
      <div className="web-inline">
        <Button icon={KeyRound} type="submit" disabled={busy}>
          {en ? 'Change password' : 'Cambiar contraseña'}
        </Button>
      </div>
    </form>
  );
}

export default function WebAccount({
  language,
  user,
  onUserUpdated,
}: {
  user: { id: string; name?: string; email?: string; role?: string; twoFactorEnabled?: boolean };
  language: Language;
  onUserUpdated?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'password' | 'mfa'>('password');
  const { showToast } = useToast();
  const en = language === 'en';
  const isSuperadmin = (user.role || '').split(',').map((role) => role.trim()).includes('superadmin');
  const displayName = (user.name || user.email || 'U').trim();
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await changeAccountPassword({
        currentPassword: String(data.get('currentPassword') || ''),
        newPassword: String(data.get('newPassword') || ''),
        confirmPassword: String(data.get('confirmPassword') || ''),
        revokeOtherSessions: data.has('revokeOtherSessions'),
      });
      form.reset();
      showToast(en ? 'Password changed.' : 'Contraseña actualizada.', 'success');
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      showToast(
        code === 'password_mismatch'
          ? (en ? 'The new passwords do not match.' : 'Las contraseñas nuevas no coinciden.')
          : code === 'password_unchanged'
            ? (en ? 'Choose a different password.' : 'Elige una contraseña diferente.')
            : code === 'password_invalid'
              ? (en ? 'Enter a current password and a new password of 8 to 128 characters.' : 'Introduce la contraseña actual y una nueva de 8 a 128 caracteres.')
              : (en ? 'Could not change the password. Check your current password and try again.' : 'No se pudo cambiar la contraseña. Comprueba la contraseña actual e inténtalo de nuevo.'),
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="web-company-section web-account-shell">
      <Tabs value={tab} onValueChange={(value) => setTab(value === 'mfa' ? 'mfa' : 'password')}>
        <TabsList className="web-resources-tabs" aria-label={en ? 'Account sections' : 'Secciones de la cuenta'}>
          <TabsTrigger value="password">{en ? 'User & password' : 'Usuario y contraseña'}</TabsTrigger>
          <TabsTrigger value="mfa">{en ? 'MFA (Two-factor)' : 'MFA (2FA)'}</TabsTrigger>
        </TabsList>

        <TabsContent value="password" className="web-stack">
          <section className="web-account-card">
            <div className="web-account-identity">
              <div className="web-account-identity-main">
                <span className="web-user-avatar" aria-hidden="true">{initials}</span>
                <div className="web-account-identity-text">
                  <strong>{displayName}</strong>
                  {user.email && <span>{user.email}</span>}
                </div>
              </div>
              <span className={`web-market-badge ${isSuperadmin ? '' : 'is-subtle'}`}>
                {isSuperadmin ? (en ? 'Superadministrator' : 'Superadministrador') : (en ? 'Member' : 'Miembro')}
              </span>
            </div>
            <div className="web-account-section-head">
              <h2>{en ? 'Change password' : 'Cambiar contraseña'}</h2>
              <p>{en ? 'Use at least 8 characters. You can also sign out your other active sessions.' : 'Usa al menos 8 caracteres. También puedes cerrar tus otras sesiones activas.'}</p>
            </div>
            <AccountPasswordForm language={language} busy={busy} onSubmit={(event) => void submit(event)} />
          </section>
        </TabsContent>

        <TabsContent value="mfa" className="web-stack">
          <WebAccountMfa language={language} twoFactorEnabled={Boolean(user.twoFactorEnabled)} onUpdated={onUserUpdated ?? (async () => {})} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
