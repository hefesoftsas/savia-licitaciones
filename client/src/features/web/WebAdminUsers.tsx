import { Building2, ChevronLeft, ChevronRight, Pencil, RefreshCw, Save, Search, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { SelectField } from '@/shared/ui/SelectField';
import { SortableHead } from '@/shared/ui/SortableHead';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/primitives/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/primitives/table';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import { WebLoading } from './WebLoading';
import type { Tenant } from './WebTenantAdmin';

type Language = 'es' | 'en';
export type AdminUser = { id: string; name: string; email: string; role: string; banned?: boolean; createdAt?: number | string; tenantId?: string; tenantName?: string };
type Action = { user: AdminUser; kind: 'ban' | 'unban' | 'promote' | 'demote' };
type CreateFields = { name: string; email: string; password: string; tenantId: string; role: 'user' | 'superadmin' };
type FieldErrors = Partial<Record<keyof CreateFields, string>>;
const pageSize = 20;

function createUserSchema(en: boolean) {
  return z.object({
    name: z.string().trim().min(2, en ? 'Enter at least 2 characters.' : 'Introduce al menos 2 caracteres.').max(300, en ? 'Name is too long.' : 'El nombre es demasiado largo.'),
    email: z.string().trim().email(en ? 'Enter a valid email address.' : 'Introduce un correo electrónico válido.').max(254, en ? 'Email is too long.' : 'El correo es demasiado largo.'),
    password: z.string().min(8, en ? 'Minimum 8 characters.' : 'Mínimo 8 caracteres.').max(128, en ? 'Maximum 128 characters.' : 'Máximo 128 caracteres.'),
    tenantId: z.string(),
    role: z.enum(['user', 'superadmin']),
  });
}

type UserSortKey = 'name' | 'role' | 'tenant';

export function AdminUsersList({
  language,
  users,
  currentUserId,
  busy,
  tenants = [],
  sortKey,
  sortDir,
  onSort,
  onEdit,
}: {
  language: Language;
  users: AdminUser[];
  currentUserId: string;
  busy: boolean;
  tenants?: Tenant[];
  sortKey: UserSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: UserSortKey) => void;
  onEdit: (user: AdminUser) => void;
}) {
  const en = language === 'en';

  if (!users.length) {
    return <p className="web-mfa-lead">{en ? 'No users found.' : 'No se encontraron usuarios.'}</p>;
  }

  return (
    <div className="web-admin-users-table-wrap">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead
              label={en ? 'User' : 'Usuario'}
              active={sortKey === 'name'}
              direction={sortDir}
              onToggle={() => onSort('name')}
            />
            <SortableHead
              label={en ? 'Role & status' : 'Rol y estado'}
              active={sortKey === 'role'}
              direction={sortDir}
              onToggle={() => onSort('role')}
            />
            {tenants.length > 0 && (
              <SortableHead
                label={en ? 'Organization' : 'Organización'}
                active={sortKey === 'tenant'}
                direction={sortDir}
                onToggle={() => onSort('tenant')}
              />
            )}
            <TableHead className="web-admin-actions-col">{en ? 'Actions' : 'Acciones'}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const self = user.id === currentUserId;
            const admin = (user.role || '').split(',').map((role) => role.trim()).includes('superadmin');
            const orgName = user.tenantName || tenants.find((tenant) => tenant.id === user.tenantId)?.name || (en ? 'Unassigned' : 'Sin asignar');
            const initials = (user.name || user.email || 'U').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
            return (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="web-admin-user-cell">
                    <span className="web-user-avatar" aria-hidden="true">{initials}</span>
                    <div className="web-admin-user-cell-text">
                      <div className="web-admin-user-name-row">
                        <strong>{user.name}</strong>
                        {self && <span className="web-market-badge is-subtle">{en ? 'You' : 'Tú'}</span>}
                      </div>
                      <span>{user.email}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="web-admin-badges-cell">
                    <span className={`web-market-badge ${admin ? '' : 'is-subtle'}`}>{admin ? (en ? 'Superadmin' : 'Superadministrador') : (en ? 'User' : 'Usuario')}</span>
                    <span className={`web-market-badge ${user.banned ? 'is-accent' : 'is-subtle'}`}>{user.banned ? (en ? 'Suspended' : 'Suspendido') : (en ? 'Active' : 'Activo')}</span>
                  </div>
                </TableCell>
                {tenants.length > 0 && (
                  <TableCell>
                    <span className="web-market-badge is-subtle">
                      <Building2 size={12} aria-hidden="true" /> {orgName}
                    </span>
                  </TableCell>
                )}
                <TableCell className="web-admin-actions-col">
                  <Button
                    icon={Pencil}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onEdit(user)}
                  >
                    {en ? 'Edit' : 'Editar'}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function WebAdminUsers({
  language,
  currentUserId,
  defaultOpen = false,
  userFilter = 'all',
  onUserFilterChange,
  onChanged,
}: {
  language: Language;
  currentUserId: string;
  defaultOpen?: boolean;
  userFilter?: 'all' | 'active' | 'superadmin';
  onUserFilterChange?: (filter: 'all' | 'active' | 'superadmin') => void;
  onChanged?: () => void;
}) {
  const en = language === 'en';
  const { showToast } = useToast();
  const [opened, setOpened] = useState(defaultOpen);
  const [createOpen, setCreateOpen] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [formState, setFormState] = useState<CreateFields>({ name: '', email: '', password: '', tenantId: '', role: 'user' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<{ tenantId: string; role: 'user' | 'superadmin'; banned: boolean }>({ tenantId: '', role: 'user', banned: false });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!opened) return;
    let active = true;
    setLoading(true);
    setFailed(false);
    void Promise.all([
      request<{ users: AdminUser[]; total: number }>('/api/admin/users').catch(() => request<{ users: AdminUser[]; total: number }>(`/api/auth/admin/list-users?limit=${pageSize}&offset=${offset}`)),
      request<{ tenants: Tenant[] }>('/api/admin/tenants').catch(() => ({ tenants: [] as Tenant[] })),
    ]).then(([userData, tenantData]) => {
      if (active) {
        setUsers(userData.users);
        setTotal(userData.total ?? userData.users.length);
        setTenants(tenantData.tenants);
        setFormState((current) => ({
          ...current,
          tenantId: current.tenantId && tenantData.tenants.some((item) => item.id === current.tenantId) ? current.tenantId : (tenantData.tenants[0]?.id || ''),
        }));
      }
    }).catch(() => {
      if (active) setFailed(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [opened, offset, refresh]);

  const openCreateDrawer = () => {
    setFieldErrors({});
    setFormState({
      name: '',
      email: '',
      password: '',
      tenantId: tenants[0]?.id || '',
      role: 'user',
    });
    setCreateOpen(true);
  };

  const createNewUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const parsed = createUserSchema(en).safeParse(formState);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof CreateFields | undefined;
        if (key && !nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setBusy(true);
    try {
      const { name, email, password, tenantId, role } = parsed.data;
      const endpoint = tenantId ? `/api/admin/tenants/${encodeURIComponent(tenantId)}/users` : '/api/admin/users';
      await request(endpoint, { method: 'POST', json: { name, email, password, role, tenantId: tenantId || undefined } });
      setCreateOpen(false);
      setRefresh((v) => v + 1);
      onChanged?.();
      showToast(en ? 'User created.' : 'Usuario creado.', 'success');
    } catch (err) {
      const duplicate = err instanceof Error && err.message === 'email_in_use';
      if (duplicate) {
        setFieldErrors({ email: en ? 'This email is already in use.' : 'Este correo ya está registrado.' });
      }
      showToast(duplicate ? (en ? 'This email is already in use.' : 'Este correo ya está registrado.') : (en ? 'Could not create the user.' : 'No se pudo crear el usuario.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const openEditDrawer = (user: AdminUser) => {
    const isAdmin = (user.role || '').split(',').map((r) => r.trim()).includes('superadmin');
    setEditForm({
      tenantId: user.tenantId || '',
      role: isAdmin ? 'superadmin' : 'user',
      banned: !!user.banned,
    });
    setEditingUser(user);
  };

  const saveEditedUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser || busy) return;
    const self = editingUser.id === currentUserId;
    const currentRole: 'user' | 'superadmin' = (editingUser.role || '').split(',').map((r) => r.trim()).includes('superadmin') ? 'superadmin' : 'user';
    const currentBanned = !!editingUser.banned;
    const currentTenantId = editingUser.tenantId || '';

    const parsed = z.object({
      tenantId: z.string(),
      role: z.enum(['user', 'superadmin']),
      banned: z.boolean(),
    }).safeParse(editForm);
    if (!parsed.success) return;

    const tenantChanged = !!parsed.data.tenantId && parsed.data.tenantId !== currentTenantId;
    const roleChanged = !self && parsed.data.role !== currentRole;
    const bannedChanged = !self && parsed.data.banned !== currentBanned;
    if (!tenantChanged && !roleChanged && !bannedChanged) {
      setEditingUser(null);
      return;
    }

    setBusy(true);
    try {
      if (tenantChanged) {
        await request(`/api/admin/users/${encodeURIComponent(editingUser.id)}/tenant`, {
          method: 'PUT',
          json: { tenantId: parsed.data.tenantId },
        });
      }
      if (roleChanged) {
        await request('/api/auth/admin/set-role', {
          method: 'POST',
          json: { userId: editingUser.id, role: parsed.data.role },
        });
      }
      if (bannedChanged) {
        await request(`/api/auth/admin/${parsed.data.banned ? 'ban-user' : 'unban-user'}`, {
          method: 'POST',
          json: { userId: editingUser.id },
        });
      }
      setEditingUser(null);
      setRefresh((v) => v + 1);
      onChanged?.();
      showToast(en ? 'User updated.' : 'Usuario actualizado.', 'success');
    } catch (err) {
      const activeOwner = err instanceof Error && err.message === 'owner_has_active_members';
      showToast(
        activeOwner
          ? (en ? 'Cannot move the primary owner of another organization with active members to an empty organization.' : 'No se puede mover el titular de otra organización con miembros activos a una organización vacía.')
          : (en ? 'Could not update the user.' : 'No se pudo actualizar el usuario.'),
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const apply = async (value: Action) => {
    if (busy) return;
    setBusy(true);
    try {
      const endpoint = value.kind === 'ban' ? 'ban-user' : value.kind === 'unban' ? 'unban-user' : 'set-role';
      const payload = value.kind === 'promote' || value.kind === 'demote' ? { userId: value.user.id, role: value.kind === 'promote' ? 'superadmin' : 'user' } : { userId: value.user.id };
      await request(`/api/auth/admin/${endpoint}`, { method: 'POST', json: payload });
      setAction(null);
      setRefresh((v) => v + 1);
      onChanged?.();
      showToast(en ? 'User updated.' : 'Usuario actualizado.', 'success');
    } catch {
      setAction(null);
      setRefresh((v) => v + 1);
      showToast(en ? 'Could not confirm the change. Review the user list.' : 'No se pudo confirmar el cambio. Revisa la lista de usuarios.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const assignTenant = async (userId: string, tenantId: string) => {
    if (busy || !tenantId) return;
    setBusy(true);
    try {
      await request(`/api/admin/users/${encodeURIComponent(userId)}/tenant`, { method: 'PUT', json: { tenantId } });
      setRefresh((v) => v + 1);
      onChanged?.();
      showToast(en ? 'Organization assigned.' : 'Organización asignada.', 'success');
    } catch (err) {
      const activeOwner = err instanceof Error && err.message === 'owner_has_active_members';
      showToast(activeOwner ? (en ? 'Cannot move the primary owner of another organization with active members to an empty organization.' : 'No se puede mover el titular de otra organización con miembros activos a una organización vacía.') : (en ? 'Could not assign the organization.' : 'No se pudo asignar la organización.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const descriptions = {
    ban: en ? 'Suspend access and close this user’s sessions?' : '¿Suspender el acceso y cerrar las sesiones de este usuario?',
    unban: en ? 'Restore this user’s access?' : '¿Restablecer el acceso de este usuario?',
    promote: en ? 'Grant this user super administrator permissions?' : '¿Conceder permisos de superadministrador a este usuario?',
    demote: en ? 'Remove this user’s super administrator permissions?' : '¿Quitar los permisos de superadministrador a este usuario?',
  };

  const [sortKey, setSortKey] = useState<UserSortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    setOffset(0);
  }, [userFilter]);

  const toggleSort = (key: UserSortKey) => {
    setOffset(0);
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filtered = users.filter((user) => {
    if (userFilter === 'active' && user.banned) return false;
    if (userFilter === 'superadmin' && !(user.role || '').split(',').map((role) => role.trim()).includes('superadmin')) return false;
    if (tenantFilter && user.tenantId !== tenantFilter) return false;
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle) || (user.tenantName || '').toLowerCase().includes(needle);
  });

  const sorted = [...filtered].sort((a, b) => {
    const factor = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'role') {
      const aAdmin = (a.role || '').split(',').map((r) => r.trim()).includes('superadmin') ? 0 : 1;
      const bAdmin = (b.role || '').split(',').map((r) => r.trim()).includes('superadmin') ? 0 : 1;
      if (aAdmin !== bAdmin) return (aAdmin - bAdmin) * factor;
      const aBanned = a.banned ? 1 : 0;
      const bBanned = b.banned ? 1 : 0;
      if (aBanned !== bBanned) return (aBanned - bBanned) * factor;
    } else if (sortKey === 'tenant') {
      const aOrg = (a.tenantName || tenants.find((t) => t.id === a.tenantId)?.name || '').trim();
      const bOrg = (b.tenantName || tenants.find((t) => t.id === b.tenantId)?.name || '').trim();
      const orgCmp = aOrg.localeCompare(bOrg, language, { sensitivity: 'base' });
      if (orgCmp !== 0) return orgCmp * factor;
    }
    const nameCmp = (a.name || a.email).localeCompare(b.name || b.email, language, { sensitivity: 'base' });
    return nameCmp * factor;
  });

  const paged = sorted.slice(offset, offset + pageSize);

  const createSheet = (
    <Sheet open={createOpen} onOpenChange={(open) => { if (!busy) setCreateOpen(open); }}>
      <SheetContent side="right" className="web-admin-sheet">
        <SheetHeader>
          <SheetTitle>{en ? 'Create new user' : 'Crear nuevo usuario'}</SheetTitle>
          <SheetDescription>
            {en ? 'Register a user account, assign its organization workspace and choose its role.' : 'Registra una cuenta de usuario, asígnale una organización y define su rol.'}
          </SheetDescription>
        </SheetHeader>
        <form className="web-admin-sheet-form" noValidate onSubmit={(event) => void createNewUser(event)}>
          <label className="web-admin-sheet-field">
            <span>{en ? 'Name' : 'Nombre'}</span>
            <Input
              name="name"
              placeholder={en ? 'Full name…' : 'Nombre completo…'}
              value={formState.name}
              onChange={(event) => {
                setFormState((current) => ({ ...current, name: event.target.value }));
                if (fieldErrors.name) setFieldErrors((current) => ({ ...current, name: undefined }));
              }}
              aria-invalid={!!fieldErrors.name}
              disabled={busy}
            />
            {fieldErrors.name && <p className="web-admin-field-error" role="alert">{fieldErrors.name}</p>}
          </label>
          <label className="web-admin-sheet-field">
            <span>{en ? 'Email' : 'Correo electrónico'}</span>
            <Input
              name="email"
              type="email"
              placeholder="usuario@empresa.co"
              autoComplete="off"
              value={formState.email}
              onChange={(event) => {
                setFormState((current) => ({ ...current, email: event.target.value }));
                if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
              aria-invalid={!!fieldErrors.email}
              disabled={busy}
            />
            {fieldErrors.email && <p className="web-admin-field-error" role="alert">{fieldErrors.email}</p>}
          </label>
          <label className="web-admin-sheet-field">
            <span>{en ? 'Initial password' : 'Contraseña inicial'}</span>
            <Input
              name="password"
              type="password"
              placeholder={en ? 'Minimum 8 characters' : 'Mínimo 8 caracteres'}
              autoComplete="new-password"
              value={formState.password}
              onChange={(event) => {
                setFormState((current) => ({ ...current, password: event.target.value }));
                if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
              }}
              aria-invalid={!!fieldErrors.password}
              disabled={busy}
            />
            {fieldErrors.password && <p className="web-admin-field-error" role="alert">{fieldErrors.password}</p>}
          </label>
          <div className="web-admin-sheet-field">
            <span>{en ? 'Organization' : 'Organización'}</span>
            <SelectField
              aria-label={en ? 'Organization' : 'Organización'}
              value={formState.tenantId}
              disabled={busy}
              options={[
                ...tenants.map((tenant) => ({ value: tenant.id, label: tenant.name })),
                { value: '', label: en ? 'New isolated personal workspace' : 'Nuevo espacio personal aislado' },
              ]}
              onChange={(next) => setFormState((current) => ({ ...current, tenantId: next }))}
            />
          </div>
          <div className="web-admin-sheet-field">
            <span>{en ? 'Role' : 'Rol'}</span>
            <SelectField
              aria-label={en ? 'Role' : 'Rol'}
              value={formState.role}
              disabled={busy}
              options={[
                { value: 'user', label: en ? 'User' : 'Usuario' },
                { value: 'superadmin', label: en ? 'Super administrator' : 'Superadministrador' },
              ]}
              onChange={(next) => setFormState((current) => ({ ...current, role: next === 'superadmin' ? 'superadmin' : 'user' }))}
            />
          </div>
          <div className="web-admin-sheet-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setCreateOpen(false)}>
              {en ? 'Cancel' : 'Cancelar'}
            </Button>
            <Button icon={UserPlus} type="submit" disabled={busy}>
              {en ? 'Create user' : 'Crear usuario'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );

  const content = (
    <>
      <div className="web-agenda-toolbar">
        <div className="web-agenda-filters">
          <div className="web-agenda-search">
            <Search size={15} aria-hidden="true" />
            <Input
              aria-label={en ? 'Search users' : 'Buscar usuarios'}
              placeholder={en ? 'Search by name, email or organization…' : 'Buscar por nombre, correo u organización…'}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setOffset(0); }}
            />
          </div>
          {onUserFilterChange && (
            <SelectField
              fullWidth={false}
              align="end"
              aria-label={en ? 'Filter by role or status' : 'Filtrar por rol o estado'}
              value={userFilter}
              options={[
                { value: 'all', label: en ? 'All users' : 'Todos los usuarios' },
                { value: 'active', label: en ? 'Active access' : 'Acceso activo' },
                { value: 'superadmin', label: en ? 'Superadministrators' : 'Superadministradores' },
              ]}
              onChange={(next) => {
                onUserFilterChange(next as 'all' | 'active' | 'superadmin');
                setOffset(0);
              }}
            />
          )}
          {tenants.length > 0 && (
            <SelectField
              fullWidth={false}
              align="end"
              aria-label={en ? 'Filter by organization' : 'Filtrar por organización'}
              value={tenantFilter}
              options={[
                { value: '', label: en ? 'All organizations' : 'Todas las organizaciones' },
                ...tenants.map((tenant) => ({ value: tenant.id, label: tenant.name })),
              ]}
              onChange={(next) => {
                setTenantFilter(next);
                setOffset(0);
              }}
            />
          )}
        </div>
      </div>
      <AdminUsersList
        language={language}
        users={paged}
        currentUserId={currentUserId}
        busy={busy}
        tenants={tenants}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
        onEdit={openEditDrawer}
      />
      <div className="web-inline">
        <Button icon={ChevronLeft} iconOnly type="button" size="sm" variant="outline" disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>{en ? 'Previous' : 'Anterior'}</Button>
        <span>{filtered.length ? `${offset + 1}–${Math.min(offset + paged.length, filtered.length)} / ${filtered.length || total}` : '0 / 0'}</span>
        <Button icon={ChevronRight} iconOnly type="button" size="sm" variant="outline" disabled={busy || offset + paged.length >= filtered.length} onClick={() => setOffset(offset + pageSize)}>{en ? 'Next' : 'Siguiente'}</Button>
      </div>
    </>
  );

  const editSheet = (
    <Sheet open={!!editingUser} onOpenChange={(open) => { if (!open && !busy) setEditingUser(null); }}>
      <SheetContent side="right" className="web-admin-sheet">
        <SheetHeader>
          <SheetTitle>{en ? 'Edit user' : 'Editar usuario'}</SheetTitle>
          <SheetDescription>
            {editingUser ? `${editingUser.name} · ${editingUser.email}` : ''}
          </SheetDescription>
        </SheetHeader>
        {editingUser && (
          <form className="web-admin-sheet-form" onSubmit={(event) => void saveEditedUser(event)}>
            {tenants.length > 0 && (
              <div className="web-admin-sheet-field">
                <span>{en ? 'Organization' : 'Organización'}</span>
                <SelectField
                  aria-label={en ? 'Organization' : 'Organización'}
                  value={editForm.tenantId}
                  disabled={busy}
                  options={[
                    ...(!editForm.tenantId ? [{ value: '', label: en ? 'Unassigned' : 'Sin asignar' }] : []),
                    ...tenants.map((tenant) => ({ value: tenant.id, label: tenant.name })),
                  ]}
                  onChange={(next) => setEditForm((current) => ({ ...current, tenantId: next }))}
                />
              </div>
            )}
            <div className="web-admin-sheet-field">
              <span>{en ? 'Role' : 'Rol'}</span>
              <SelectField
                aria-label={en ? 'Role' : 'Rol'}
                value={editForm.role}
                disabled={busy || editingUser.id === currentUserId}
                options={[
                  { value: 'user', label: en ? 'User' : 'Usuario' },
                  { value: 'superadmin', label: en ? 'Superadmin' : 'Superadministrador' },
                ]}
                onChange={(next) => setEditForm((current) => ({ ...current, role: next === 'superadmin' ? 'superadmin' : 'user' }))}
              />
            </div>
            <div className="web-admin-sheet-field">
              <span>{en ? 'Access status' : 'Estado de acceso'}</span>
              <SelectField
                aria-label={en ? 'Access status' : 'Estado de acceso'}
                value={editForm.banned ? 'suspended' : 'active'}
                disabled={busy || editingUser.id === currentUserId}
                options={[
                  { value: 'active', label: en ? 'Access active' : 'Acceso activo' },
                  { value: 'suspended', label: en ? 'Access suspended' : 'Acceso suspendido' },
                ]}
                onChange={(next) => setEditForm((current) => ({ ...current, banned: next === 'suspended' }))}
              />
            </div>
            {editingUser.id === currentUserId && (
              <p className="web-mfa-lead">
                {en ? 'You cannot change your own role or suspend your own account.' : 'No puedes cambiar tu propio rol ni suspender tu propia cuenta.'}
              </p>
            )}
            <div className="web-admin-sheet-actions">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setEditingUser(null)}>
                {en ? 'Cancel' : 'Cancelar'}
              </Button>
              <Button icon={Save} type="submit" disabled={busy}>
                {busy ? (en ? 'Saving…' : 'Guardando…') : (en ? 'Save changes' : 'Guardar cambios')}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );

  if (defaultOpen) {
    return (
      <section className="web-company-section">
        <div className="web-secop-heading web-company-heading">
          <div>
            <h2>{en ? 'User administration' : 'Administración de usuarios'}</h2>
            <p>{en ? 'Create accounts, manage access, identity roles and organization assignment.' : 'Crea cuentas y administra el acceso, los roles de identidad y la asignación de organización.'}</p>
          </div>
          <div className="web-inline">
            <Button icon={UserPlus} type="button" size="sm" disabled={busy} onClick={openCreateDrawer}>
              {en ? 'New user' : 'Nuevo usuario'}
            </Button>
            <Button icon={RefreshCw} iconOnly type="button" variant="outline" size="sm" disabled={busy || loading} onClick={() => setRefresh((v) => v + 1)}>{en ? 'Refresh' : 'Actualizar'}</Button>
          </div>
        </div>
        {loading ? <WebLoading message={en ? 'Loading users…' : 'Cargando usuarios…'} /> : failed ? <p role="alert">{en ? 'Could not load users. Retry to reload.' : 'No se pudieron cargar los usuarios. Vuelve a intentar.'}</p> : content}
        {createSheet}
        {editSheet}
      </section>
    );
  }

  return (
    <details className="web-profile-group" open={opened} onToggle={(event) => setOpened(event.currentTarget.open)}>
      <summary><strong>{en ? 'User administration' : 'Administración de usuarios'}</strong></summary>
      <p style={{ marginTop: 8 }}>{en ? 'Manage account access and identity roles.' : 'Administra el acceso y los roles de identidad.'}</p>
      {loading ? <WebLoading message={en ? 'Loading users…' : 'Cargando usuarios…'} /> : failed ? <p role="alert">{en ? 'Could not load users. Close and reopen to retry.' : 'No se pudieron cargar los usuarios. Cierra y vuelve a abrir para reintentar.'}</p> : opened && content}
      {createSheet}
      {editSheet}
    </details>
  );
}
