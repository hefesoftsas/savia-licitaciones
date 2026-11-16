import { useEffect, useState, type FormEvent } from 'react';
import { Building2, Check, Pencil, Plus, RefreshCw, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { z } from 'zod';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { SelectField } from '@/shared/ui/SelectField';
import { SortableHead } from '@/shared/ui/SortableHead';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/primitives/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/primitives/table';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';

type Language = 'es' | 'en';
export type Tenant = { id: string; name: string; ownerUserId?: string | null; createdAt?: string; memberCount?: number };
export type Member = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned: boolean | number | null;
  tenantId?: string | null;
  tenantName?: string | null;
  isWorkspaceOwner?: number | boolean;
};

type CreateTenantValues = { name: string };
type CreateTenantUserValues = { name: string; email: string; password: string; role: 'user' | 'superadmin' };

const createTenantSchema = (en: boolean) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(2, en ? 'Enter at least 2 characters.' : 'Ingresa al menos 2 caracteres.')
      .max(200, en ? 'Maximum 200 characters.' : 'Máximo 200 caracteres.'),
  });

const createTenantUserSchema = (en: boolean) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(2, en ? 'Enter at least 2 characters.' : 'Ingresa al menos 2 caracteres.')
      .max(300, en ? 'Maximum 300 characters.' : 'Máximo 300 caracteres.'),
    email: z
      .string()
      .trim()
      .email(en ? 'Enter a valid email address.' : 'Ingresa un correo electrónico válido.')
      .max(254, en ? 'Maximum 254 characters.' : 'Máximo 254 caracteres.'),
    password: z
      .string()
      .min(8, en ? 'Minimum 8 characters.' : 'Mínimo 8 caracteres.')
      .max(128, en ? 'Maximum 128 characters.' : 'Máximo 128 caracteres.'),
    role: z.enum(['user', 'superadmin']),
  });

type FormProps = {
  language: Language;
  tenants: Tenant[];
  selected: string;
  busy: boolean;
  tenantSheetOpen: boolean;
  onTenantSheetOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onCreateTenant: (values: CreateTenantValues) => Promise<boolean>;
  onCreateUser: (values: CreateTenantUserValues) => Promise<boolean>;
  availableUsers?: Member[];
  onAssignExisting?: (userId: string) => void;
  onRenameTenant?: (tenantId: string, name: string) => Promise<void>;
  children?: React.ReactNode;
};

export function TenantForms({
  language,
  tenants,
  selected,
  busy,
  tenantSheetOpen,
  onTenantSheetOpenChange,
  onSelect,
  onCreateTenant,
  onCreateUser,
  availableUsers = [],
  onAssignExisting,
  onRenameTenant,
  children,
}: FormProps) {
  const en = language === 'en';
  const [assignUserId, setAssignUserId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantError, setTenantError] = useState('');
  const [userSheetOpen, setUserSheetOpen] = useState(false);
  const [userValues, setUserValues] = useState<CreateTenantUserValues>({ name: '', email: '', password: '', role: 'user' });
  const [userErrors, setUserErrors] = useState<Partial<Record<keyof CreateTenantUserValues, string>>>({});
  const [tenantSortKey, setTenantSortKey] = useState<'name' | 'type' | 'members'>('name');
  const [tenantSortDir, setTenantSortDir] = useState<'asc' | 'desc'>('asc');
  const currentTenant = tenants.find((item) => item.id === selected) || null;

  const toggleTenantSort = (key: 'name' | 'type' | 'members') => {
    if (tenantSortKey === key) setTenantSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setTenantSortKey(key);
      setTenantSortDir('asc');
    }
  };

  const sortedTenants = [...tenants].sort((a, b) => {
    const factor = tenantSortDir === 'asc' ? 1 : -1;
    if (tenantSortKey === 'type') {
      const aType = String(a.id).startsWith('legacy:') ? 0 : 1;
      const bType = String(b.id).startsWith('legacy:') ? 0 : 1;
      if (aType !== bType) return (aType - bType) * factor;
    } else if (tenantSortKey === 'members') {
      const diff = (a.memberCount ?? 0) - (b.memberCount ?? 0);
      if (diff !== 0) return diff * factor;
    }
    return a.name.localeCompare(b.name, language, { sensitivity: 'base' }) * factor;
  });

  const submitTenant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const parsed = createTenantSchema(en).safeParse({ name: tenantName });
    if (!parsed.success) {
      setTenantError(parsed.error.issues[0]?.message || (en ? 'Invalid name.' : 'Nombre inválido.'));
      return;
    }
    setTenantError('');
    const ok = await onCreateTenant(parsed.data);
    if (ok) {
      setTenantName('');
      onTenantSheetOpenChange(false);
    }
  };

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const parsed = createTenantUserSchema(en).safeParse(userValues);
    if (!parsed.success) {
      const next: Partial<Record<keyof CreateTenantUserValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof CreateTenantUserValues | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setUserErrors(next);
      return;
    }
    setUserErrors({});
    const ok = await onCreateUser(parsed.data);
    if (ok) {
      setUserValues({ name: '', email: '', password: '', role: 'user' });
      setUserSheetOpen(false);
    }
  };

  return (
    <div className="web-admin-tenant-stack">
      {tenants.length ? (
        <div className="web-admin-users-table-wrap">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label={en ? 'Organization' : 'Organización'} active={tenantSortKey === 'name'} direction={tenantSortDir} onToggle={() => toggleTenantSort('name')} />
                <SortableHead label={en ? 'Type' : 'Tipo'} active={tenantSortKey === 'type'} direction={tenantSortDir} onToggle={() => toggleTenantSort('type')} />
                <SortableHead label={en ? 'Members' : 'Miembros'} active={tenantSortKey === 'members'} direction={tenantSortDir} onToggle={() => toggleTenantSort('members')} />
                <TableHead className="web-admin-actions-col">{en ? 'Status' : 'Estado'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTenants.map((tenant) => {
                const isSelected = selected === tenant.id;
                const isPersonal = String(tenant.id).startsWith('legacy:');
                return (
                  <TableRow
                    key={tenant.id}
                    className={`web-admin-tenant-row${isSelected ? ' is-selected' : ''}`}
                    onClick={() => !busy && onSelect(tenant.id)}
                  >
                    <TableCell>
                      <div className="web-admin-user-cell">
                        <span className="web-user-avatar" aria-hidden="true">
                          <Building2 size={15} />
                        </span>
                        <div className="web-admin-user-cell-text">
                          <strong>{tenant.name}</strong>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="web-market-badge is-subtle">
                        {isPersonal ? (en ? 'Personal' : 'Personal') : en ? 'Shared' : 'Compartida'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="web-market-badge is-subtle">
                        <Users size={12} /> {typeof tenant.memberCount === 'number' ? tenant.memberCount : 0}
                      </span>
                    </TableCell>
                    <TableCell className="web-admin-actions-col">
                      {isSelected ? (
                        <span className="web-market-badge">{en ? 'Selected' : 'Activa'}</span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(tenant.id);
                          }}
                        >
                          {en ? 'Open' : 'Ver'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="web-agenda-empty">
          <Building2 size={24} aria-hidden="true" />
          <p>{en ? 'No organizations yet. Create the first one to organize workspaces.' : 'Aún no hay organizaciones. Crea la primera para aislar espacios de trabajo.'}</p>
        </div>
      )}

      {currentTenant && (
        <section className="web-admin-tenant-card">
          <div className="web-secop-heading web-company-heading">
            <div>
              <h3>{currentTenant.name}</h3>
              <p>
                {String(currentTenant.id).startsWith('legacy:')
                  ? en
                    ? 'Personal workspace migrated from user account.'
                    : 'Espacio personal creado automáticamente para la cuenta.'
                  : en
                    ? 'Shared organization workspace for projects, documents, RUP and connectors.'
                    : 'Espacio de organización compartido para proyectos, documentos, RUP y conectores.'}
              </p>
            </div>
            <div className="web-inline">
              <Button
                icon={UserPlus}
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setUserErrors({});
                  setUserSheetOpen(true);
                }}
              >
                {en ? 'New user' : 'Nuevo usuario'}
              </Button>
              {onRenameTenant &&
                (editingId === currentTenant.id ? (
                  <div className="web-inline">
                    <Input
                      value={editingName}
                      maxLength={200}
                      disabled={busy}
                      onChange={(event) => setEditingName(event.target.value)}
                      aria-label={en ? 'New organization name' : 'Nuevo nombre de la organización'}
                    />
                    <Button
                      icon={Check}
                      type="button"
                      size="sm"
                      disabled={busy || !editingName.trim()}
                      onClick={() => {
                        void onRenameTenant(currentTenant.id, editingName.trim()).then(() => setEditingId(null));
                      }}
                    >
                      {en ? 'Save' : 'Guardar'}
                    </Button>
                    <Button icon={X} type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>
                      {en ? 'Cancel' : 'Cancelar'}
                    </Button>
                  </div>
                ) : (
                  <Button
                    icon={Pencil}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(currentTenant.id);
                      setEditingName(currentTenant.name);
                    }}
                  >
                    {en ? 'Rename' : 'Renombrar'}
                  </Button>
                ))}
            </div>
          </div>

          {onAssignExisting && availableUsers.length > 0 && (
            <div className="web-admin-assign-row">
              <select
                className="web-tenant-select"
                aria-label={en ? 'Assign existing user to this organization' : 'Asignar usuario existente a esta organización'}
                value={assignUserId}
                onChange={(event) => setAssignUserId(event.target.value)}
                disabled={busy}
              >
                <option value="">{en ? 'Assign an existing user to this organization…' : 'Asignar un usuario existente a esta organización…'}</option>
                {availableUsers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.email})
                    {item.tenantName ? ` — ${item.tenantName}` : ''}
                  </option>
                ))}
              </select>
              <Button
                icon={UserCheck}
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !assignUserId}
                onClick={() => {
                  if (!assignUserId) return;
                  const target = assignUserId;
                  setAssignUserId('');
                  onAssignExisting(target);
                }}
              >
                {en ? 'Assign' : 'Asignar'}
              </Button>
            </div>
          )}

          {children}
        </section>
      )}

      <Sheet
        open={tenantSheetOpen}
        onOpenChange={(next) => {
          if (!busy) {
            onTenantSheetOpenChange(next);
            if (!next) setTenantError('');
          }
        }}
      >
        <SheetContent side="right" className="web-admin-sheet">
          <SheetHeader>
            <SheetTitle>{en ? 'New organization' : 'Nueva organización'}</SheetTitle>
            <SheetDescription>
              {en
                ? 'Creates an isolated workspace for projects, documents, RUP and connectors.'
                : 'Crea un espacio aislado para proyectos, documentos, RUP y conectores.'}
            </SheetDescription>
          </SheetHeader>
          <form className="web-admin-sheet-form" onSubmit={(event) => void submitTenant(event)} noValidate>
            <label className="web-admin-sheet-field">
              <span>{en ? 'Organization name' : 'Nombre de la organización'}</span>
              <Input
                value={tenantName}
                onChange={(event) => {
                  setTenantName(event.target.value);
                  if (tenantError) setTenantError('');
                }}
                placeholder={en ? 'E.g., Ingeniería Norte S.A.S.' : 'Ej. Ingeniería Norte S.A.S.'}
                maxLength={200}
                disabled={busy}
              />
              {tenantError && (
                <p className="web-admin-field-error" role="alert">
                  {tenantError}
                </p>
              )}
            </label>
            <div className="web-admin-sheet-actions">
              <Button type="button" variant="outline" disabled={busy} onClick={() => onTenantSheetOpenChange(false)}>
                {en ? 'Cancel' : 'Cancelar'}
              </Button>
              <Button icon={Building2} type="submit" disabled={busy}>
                {busy ? (en ? 'Creating…' : 'Creando…') : en ? 'Create organization' : 'Crear organización'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={userSheetOpen}
        onOpenChange={(next) => {
          if (!busy) {
            setUserSheetOpen(next);
            if (!next) setUserErrors({});
          }
        }}
      >
        <SheetContent side="right" className="web-admin-sheet">
          <SheetHeader>
            <SheetTitle>{en ? 'New user in organization' : 'Nuevo usuario en la organización'}</SheetTitle>
            <SheetDescription>
              {currentTenant
                ? en
                  ? `The account will be linked immediately to «${currentTenant.name}».`
                  : `La cuenta quedará vinculada de inmediato a «${currentTenant.name}».`
                : ''}
            </SheetDescription>
          </SheetHeader>
          <form className="web-admin-sheet-form" onSubmit={(event) => void submitUser(event)} noValidate>
            <label className="web-admin-sheet-field">
              <span>{en ? 'Name' : 'Nombre'}</span>
              <Input
                value={userValues.name}
                onChange={(event) => {
                  setUserValues((current) => ({ ...current, name: event.target.value }));
                  if (userErrors.name) setUserErrors((current) => ({ ...current, name: undefined }));
                }}
                placeholder={en ? 'Full name…' : 'Nombre completo…'}
                maxLength={300}
                disabled={busy}
              />
              {userErrors.name && (
                <p className="web-admin-field-error" role="alert">
                  {userErrors.name}
                </p>
              )}
            </label>
            <label className="web-admin-sheet-field">
              <span>{en ? 'Email' : 'Correo electrónico'}</span>
              <Input
                type="email"
                value={userValues.email}
                onChange={(event) => {
                  setUserValues((current) => ({ ...current, email: event.target.value }));
                  if (userErrors.email) setUserErrors((current) => ({ ...current, email: undefined }));
                }}
                placeholder="usuario@empresa.co"
                maxLength={254}
                autoComplete="off"
                disabled={busy}
              />
              {userErrors.email && (
                <p className="web-admin-field-error" role="alert">
                  {userErrors.email}
                </p>
              )}
            </label>
            <label className="web-admin-sheet-field">
              <span>{en ? 'Temporary password' : 'Contraseña inicial'}</span>
              <Input
                type="password"
                value={userValues.password}
                onChange={(event) => {
                  setUserValues((current) => ({ ...current, password: event.target.value }));
                  if (userErrors.password) setUserErrors((current) => ({ ...current, password: undefined }));
                }}
                placeholder={en ? 'Minimum 8 characters' : 'Mínimo 8 caracteres'}
                maxLength={128}
                autoComplete="new-password"
                disabled={busy}
              />
              {userErrors.password && (
                <p className="web-admin-field-error" role="alert">
                  {userErrors.password}
                </p>
              )}
            </label>
            <div className="web-admin-sheet-field">
              <span>{en ? 'Role' : 'Rol'}</span>
              <SelectField
                aria-label={en ? 'Role' : 'Rol'}
                value={userValues.role}
                disabled={busy}
                options={[
                  { value: 'user', label: en ? 'User' : 'Usuario' },
                  { value: 'superadmin', label: en ? 'Superadmin' : 'Superadministrador' },
                ]}
                onChange={(next) => setUserValues((current) => ({ ...current, role: next === 'superadmin' ? 'superadmin' : 'user' }))}
              />
            </div>
            <div className="web-admin-sheet-actions">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setUserSheetOpen(false)}>
                {en ? 'Cancel' : 'Cancelar'}
              </Button>
              <Button icon={UserPlus} type="submit" disabled={busy}>
                {busy ? (en ? 'Creating…' : 'Creando…') : en ? 'Create user' : 'Crear usuario'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function TenantMembers({ language, members }: { language: Language; members: Member[] }) {
  const en = language === 'en';
  const [sortKey, setSortKey] = useState<'name' | 'role'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (key: 'name' | 'role') => {
    if (sortKey === key) setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedMembers = [...members].sort((a, b) => {
    const factor = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'role') {
      const aAdmin = (a.role || '').split(',').map((r) => r.trim()).includes('superadmin') ? 0 : 1;
      const bAdmin = (b.role || '').split(',').map((r) => r.trim()).includes('superadmin') ? 0 : 1;
      if (aAdmin !== bAdmin) return (aAdmin - bAdmin) * factor;
      const aOwner = a.isWorkspaceOwner ? 0 : 1;
      const bOwner = b.isWorkspaceOwner ? 0 : 1;
      if (aOwner !== bOwner) return (aOwner - bOwner) * factor;
      const aBanned = a.banned ? 1 : 0;
      const bBanned = b.banned ? 1 : 0;
      if (aBanned !== bBanned) return (aBanned - bBanned) * factor;
    }
    return (a.name || a.email).localeCompare(b.name || b.email, language, { sensitivity: 'base' }) * factor;
  });

  return (
    <div className="web-admin-members-section">
      <div className="web-secop-heading web-company-heading">
        <div>
          <h4>{en ? 'Users in this organization' : 'Usuarios de esta organización'}</h4>
        </div>
        <span className="web-market-badge is-subtle">
          <Users size={12} /> {members.length}
        </span>
      </div>
      {members.length ? (
        <div className="web-admin-users-table-wrap">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label={en ? 'User' : 'Usuario'} active={sortKey === 'name'} direction={sortDir} onToggle={() => toggleSort('name')} />
                <SortableHead label={en ? 'Role & status' : 'Rol y estado'} active={sortKey === 'role'} direction={sortDir} onToggle={() => toggleSort('role')} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMembers.map((member) => {
                const isSuperadmin = (member.role || '').split(',').map((r) => r.trim()).includes('superadmin');
                const initials = (member.name || member.email || 'U')
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase();
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="web-admin-user-cell">
                        <span className="web-user-avatar" aria-hidden="true">
                          {initials}
                        </span>
                        <div className="web-admin-user-cell-text">
                          <strong>{member.name}</strong>
                          <span>{member.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="web-admin-badges-cell">
                        <span className={`web-market-badge ${isSuperadmin ? '' : 'is-subtle'}`}>
                          {isSuperadmin ? (en ? 'Superadmin' : 'Superadministrador') : en ? 'User' : 'Usuario'}
                        </span>
                        {!!member.isWorkspaceOwner && (
                          <span className="web-market-badge is-subtle">{en ? 'Workspace owner' : 'Titular del espacio'}</span>
                        )}
                        <span className={`web-market-badge ${member.banned ? 'is-accent' : 'is-subtle'}`}>
                          {member.banned ? (en ? 'Suspended' : 'Suspendido') : en ? 'Active' : 'Activo'}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p>{en ? 'No users yet.' : 'Aún no hay usuarios.'}</p>
      )}
    </div>
  );
}

export default function WebTenantAdmin({
  language,
  defaultOpen = false,
  onChanged,
}: {
  language: Language;
  defaultOpen?: boolean;
  onChanged?: () => void;
}) {
  const en = language === 'en';
  const { showToast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [tenantSheetOpen, setTenantSheetOpen] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [allUsers, setAllUsers] = useState<Member[]>([]);
  const [selected, setSelected] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    setError(false);
    void Promise.all([
      request<{ tenants: Tenant[] }>('/api/admin/tenants'),
      request<{ users: Member[] }>('/api/admin/users').catch(() => ({ users: [] as Member[] })),
    ])
      .then(([tenantData, userData]) => {
        if (!live) return;
        setTenants(tenantData.tenants);
        setAllUsers(userData.users);
        setSelected((current) =>
          current && tenantData.tenants.some((item) => item.id === current) ? current : tenantData.tenants[0]?.id || '',
        );
      })
      .catch(() => {
        if (live) setError(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [open, revision]);

  useEffect(() => {
    setMembers([]);
    if (!open || !selected) return;
    let live = true;
    void request<{ users: Member[] }>(`/api/admin/tenants/${encodeURIComponent(selected)}/users`)
      .then((data) => {
        if (live) setMembers(data.users);
      })
      .catch(() => {
        if (live) showToast(en ? 'Could not load users.' : 'No se pudieron cargar los usuarios.', 'error');
      });
    return () => {
      live = false;
    };
  }, [open, selected, revision, en, showToast]);

  const createTenant = async ({ name }: CreateTenantValues) => {
    if (busy) return false;
    setBusy(true);
    try {
      const data = (await request('/api/admin/tenants', { method: 'POST', json: { name } })) as { tenant: Tenant };
      setSelected(data.tenant.id);
      setRevision((value) => value + 1);
      onChanged?.();
      showToast(en ? 'Organization created.' : 'Organización creada.', 'success');
      return true;
    } catch {
      showToast(en ? 'Could not create the organization.' : 'No se pudo crear la organización.', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const renameTenant = async (tenantId: string, name: string) => {
    if (!name || busy) return;
    setBusy(true);
    try {
      await request(`/api/admin/tenants/${encodeURIComponent(tenantId)}`, { method: 'PATCH', json: { name } });
      setRevision((value) => value + 1);
      onChanged?.();
      showToast(en ? 'Organization updated.' : 'Organización actualizada.', 'success');
    } catch {
      showToast(en ? 'Could not rename the organization.' : 'No se pudo renombrar la organización.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const createUser = async (values: CreateTenantUserValues) => {
    if (!selected || busy) return false;
    setBusy(true);
    try {
      await request(`/api/admin/tenants/${encodeURIComponent(selected)}/users`, {
        method: 'POST',
        json: values,
      });
      setRevision((value) => value + 1);
      onChanged?.();
      showToast(en ? 'User created.' : 'Usuario creado.', 'success');
      return true;
    } catch (err) {
      const duplicate = err instanceof Error && err.message === 'email_in_use';
      showToast(
        duplicate
          ? en
            ? 'This email is already in use.'
            : 'Este correo ya está registrado.'
          : en
            ? 'Could not create the user.'
            : 'No se pudo crear el usuario.',
        'error',
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const assignExistingUser = async (userId: string) => {
    if (!selected || !userId || busy) return;
    setBusy(true);
    try {
      await request(`/api/admin/users/${encodeURIComponent(userId)}/tenant`, {
        method: 'PUT',
        json: { tenantId: selected },
      });
      setRevision((value) => value + 1);
      onChanged?.();
      showToast(en ? 'User assigned to organization.' : 'Usuario asignado a la organización.', 'success');
    } catch (err) {
      const activeOwner = err instanceof Error && err.message === 'owner_has_active_members';
      showToast(
        activeOwner
          ? en
            ? 'Cannot move the primary owner of another organization with active members to an empty organization.'
            : 'No se puede mover el titular de otra organización con miembros activos a una organización vacía.'
          : en
            ? 'Could not assign the user.'
            : 'No se pudo asignar el usuario.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const availableUsers = allUsers.filter((user) => user.tenantId !== selected && !members.some((member) => member.id === user.id));

  const content = loading ? (
    <p role="status">{en ? 'Loading organizations…' : 'Cargando organizaciones…'}</p>
  ) : error ? (
    <p role="alert">
      {en
        ? 'Could not load organizations. Close and reopen to retry.'
        : 'No se pudieron cargar las organizaciones. Cierra y vuelve a abrir para reintentar.'}
    </p>
  ) : (
    open && (
      <TenantForms
        language={language}
        tenants={tenants}
        selected={selected}
        busy={busy}
        tenantSheetOpen={tenantSheetOpen}
        onTenantSheetOpenChange={setTenantSheetOpen}
        onSelect={setSelected}
        onCreateTenant={createTenant}
        onCreateUser={createUser}
        availableUsers={availableUsers}
        onAssignExisting={(userId) => void assignExistingUser(userId)}
        onRenameTenant={renameTenant}
      >
        {selected && <TenantMembers language={language} members={members} />}
      </TenantForms>
    )
  );

  if (defaultOpen) {
    return (
      <section className="web-company-section">
        <div className="web-secop-heading web-company-heading">
          <div>
            <h2>{en ? 'Organizations and users' : 'Organizaciones y usuarios'}</h2>
            <p>{en ? 'Each organization shares its projects and connector.' : 'Cada organización comparte sus proyectos y su conector.'}</p>
          </div>
          <div className="web-inline">
            <Button icon={Plus} type="button" size="sm" disabled={busy || loading} onClick={() => setTenantSheetOpen(true)}>
              {en ? 'New organization' : 'Nueva organización'}
            </Button>
            <Button icon={RefreshCw} type="button" variant="outline" size="sm" disabled={busy || loading} onClick={() => setRevision((v) => v + 1)}>
              {en ? 'Refresh' : 'Actualizar'}
            </Button>
          </div>
        </div>
        {content}
      </section>
    );
  }

  return (
    <details className="web-profile-group" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <strong>{en ? 'Organizations and users' : 'Organizaciones y usuarios'}</strong>
      </summary>
      <p style={{ marginTop: 8 }}>{en ? 'Each organization shares its projects and connector.' : 'Cada organización comparte sus proyectos y su conector.'}</p>
      {content}
    </details>
  );
}
