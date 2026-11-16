import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, RefreshCw, RotateCcw, Save, Search, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { ActionButton } from '@/shared/ui/ActionButton';
import AppDialog from '@/shared/ui/AppDialog';
import { SelectField } from '@/shared/ui/SelectField';
import { useToast } from '@/shared/ui/ToastProvider';
import { Button } from '@/shared/ui/primitives/button';
import { Input } from '@/shared/ui/primitives/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/primitives/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/primitives/table';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/primitives/tabs';
import { request } from './api.mjs';
import { WebLoading } from './WebLoading';

type Language = 'es' | 'en';
export type RunnerConfigCategory = 'skill' | 'hook' | 'prompt';
export type RunnerConfigFilter = 'all' | RunnerConfigCategory;

export type RunnerConfigItem = {
  id: string;
  category: RunnerConfigCategory;
  title: string;
  description?: string;
  sourcePath?: string;
  content: string;
  defaultContent?: string;
  enabled: boolean;
  isBuiltIn?: boolean;
  isCustomized?: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

type CreateFormState = {
  id: string;
  category: RunnerConfigCategory;
  title: string;
  description: string;
  content: string;
  enabled: boolean;
};

type EditFormState = {
  title: string;
  description: string;
  content: string;
  enabled: boolean;
};

const CATEGORY_LABELS: Record<RunnerConfigCategory, { es: string; en: string }> = {
  skill: { es: 'Skill', en: 'Skill' },
  hook: { es: 'Hook', en: 'Hook' },
  prompt: { es: 'Prompt', en: 'Prompt' },
};

function createItemSchema(en: boolean) {
  return z.object({
    id: z
      .string()
      .trim()
      .min(2, en ? 'Enter at least 2 characters.' : 'Introduce al menos 2 caracteres.')
      .max(120, en ? 'ID is too long.' : 'El ID es demasiado largo.')
      .regex(/^[a-z0-9:-]+$/, en ? 'Use only lowercase letters, numbers, ":" or "-".' : 'Usa solo minúsculas, números, ":" o "-".'),
    category: z.enum(['skill', 'hook', 'prompt']),
    title: z
      .string()
      .trim()
      .min(2, en ? 'Enter a title (at least 2 characters).' : 'Introduce un título (al menos 2 caracteres).')
      .max(200, en ? 'Title is too long.' : 'El título es demasiado largo.'),
    description: z.string().max(500, en ? 'Description is too long.' : 'La descripción es demasiado larga.'),
    content: z.string().trim().min(1, en ? 'Content cannot be empty.' : 'El contenido no puede estar vacío.'),
    enabled: z.boolean(),
  });
}

function editItemSchema(en: boolean) {
  return z.object({
    title: z
      .string()
      .trim()
      .min(2, en ? 'Enter a title (at least 2 characters).' : 'Introduce un título (al menos 2 caracteres).')
      .max(200, en ? 'Title is too long.' : 'El título es demasiado largo.'),
    description: z.string().max(500, en ? 'Description is too long.' : 'La descripción es demasiado larga.'),
    content: z.string().trim().min(1, en ? 'Content cannot be empty.' : 'El contenido no puede estar vacío.'),
    enabled: z.boolean(),
  });
}

const MONOSPACE_TEXTAREA_STYLE = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  minHeight: '220px',
  fontSize: '12.5px',
  lineHeight: 1.5,
};

export function RunnerConfigList({
  language,
  items,
  busy = false,
  onEdit,
}: {
  language: Language;
  items: RunnerConfigItem[];
  busy?: boolean;
  onEdit: (item: RunnerConfigItem) => void;
}) {
  const en = language === 'en';

  if (!items.length) {
    return (
      <p className="web-mfa-lead">
        {en ? 'No configuration items match the current filter.' : 'No hay elementos de configuración que coincidan con el filtro actual.'}
      </p>
    );
  }

  return (
    <div className="web-admin-users-table-wrap">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{en ? 'Category' : 'Categoría'}</TableHead>
            <TableHead>{en ? 'Name & identifier' : 'Nombre e identificador'}</TableHead>
            <TableHead>{en ? 'Status' : 'Estado'}</TableHead>
            <TableHead className="web-admin-actions-col">{en ? 'Actions' : 'Acciones'}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const categoryLabel = CATEGORY_LABELS[item.category]?.[en ? 'en' : 'es'] ?? item.category;
            const customized = !!item.isCustomized || !item.isBuiltIn;
            return (
              <TableRow key={item.id}>
                <TableCell>
                  <span className="web-market-badge">{categoryLabel}</span>
                </TableCell>
                <TableCell>
                  <div className="web-admin-user-cell-text">
                    <strong>{item.title}</strong>
                    <span>
                      <code>{item.id}</code>
                      {item.sourcePath ? ` · ${item.sourcePath}` : ''}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="web-admin-badges-cell">
                    <span className={`web-market-badge ${customized ? '' : 'is-subtle'}`}>
                      {customized ? (en ? 'Custom' : 'Personalizado') : (en ? 'Default' : 'Por defecto')}
                    </span>
                    <span className={`web-market-badge ${item.enabled ? 'is-subtle' : 'is-accent'}`}>
                      {item.enabled ? (en ? 'Active' : 'Activo') : (en ? 'Inactive' : 'Inactivo')}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="web-admin-actions-col">
                  <ActionButton
                    icon={Pencil}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onEdit(item)}
                  >
                    {en ? 'View / Edit' : 'Ver / Editar'}
                  </ActionButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function WebRunnerConfig({
  language,
  onChanged,
}: {
  language: Language;
  onChanged?: () => void;
}) {
  const en = language === 'en';
  const { showToast } = useToast();

  const [items, setItems] = useState<RunnerConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState<RunnerConfigFilter>('all');
  const [query, setQuery] = useState('');

  const [editingItem, setEditingItem] = useState<RunnerConfigItem | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    title: '',
    description: '',
    content: '',
    enabled: true,
  });
  const [editErrors, setEditErrors] = useState<Partial<Record<keyof EditFormState, string>>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    id: '',
    category: 'skill',
    title: '',
    description: '',
    content: '',
    enabled: true,
  });
  const [createErrors, setCreateErrors] = useState<Partial<Record<keyof CreateFormState, string>>>({});

  const [confirmDeleteItem, setConfirmDeleteItem] = useState<RunnerConfigItem | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await request<{ items?: RunnerConfigItem[] }>('/api/admin/runner-config');
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : (en ? 'Could not load runner configuration.' : 'No se pudo cargar la configuración del runner.');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [en]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const openEditor = (item: RunnerConfigItem) => {
    setEditingItem(item);
    setEditForm({
      title: item.title,
      description: item.description || '',
      content: item.content ?? item.defaultContent ?? '',
      enabled: item.enabled,
    });
    setEditErrors({});
  };

  const openCreate = () => {
    setCreateForm({
      id: '',
      category: categoryFilter === 'all' ? 'skill' : categoryFilter,
      title: '',
      description: '',
      content: '',
      enabled: true,
    });
    setCreateErrors({});
    setCreateOpen(true);
  };

  const handleSaveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingItem || busy) return;
    const parsed = editItemSchema(en).safeParse(editForm);
    if (!parsed.success) {
      const next: Partial<Record<keyof EditFormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof EditFormState | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setEditErrors(next);
      return;
    }
    setEditErrors({});
    setBusy(true);
    try {
      await request(`/api/admin/runner-config/${encodeURIComponent(editingItem.id)}`, {
        method: 'PUT',
        json: parsed.data,
      });
      setEditingItem(null);
      await loadItems();
      onChanged?.();
      showToast(en ? 'Configuration saved.' : 'Configuración guardada.', 'success');
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : (en ? 'Could not save configuration.' : 'No se pudo guardar la configuración.');
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const parsed = createItemSchema(en).safeParse(createForm);
    if (!parsed.success) {
      const next: Partial<Record<keyof CreateFormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof CreateFormState | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setCreateErrors(next);
      return;
    }
    setCreateErrors({});
    setBusy(true);
    try {
      await request('/api/admin/runner-config', {
        method: 'POST',
        json: parsed.data,
      });
      setCreateOpen(false);
      await loadItems();
      onChanged?.();
      showToast(en ? 'Item created.' : 'Elemento creado.', 'success');
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : (en ? 'Could not create item.' : 'No se pudo crear el elemento.');
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDeleteOrReset = async () => {
    if (!confirmDeleteItem || busy) return;
    const target = confirmDeleteItem;
    setBusy(true);
    try {
      await request(`/api/admin/runner-config/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
      });
      setConfirmDeleteItem(null);
      setEditingItem(null);
      await loadItems();
      onChanged?.();
      showToast(
        target.isBuiltIn
          ? (en ? 'Reset to default.' : 'Restaurado por defecto.')
          : (en ? 'Item deleted.' : 'Elemento eliminado.'),
        'success',
      );
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : (en ? 'Could not complete the operation.' : 'No se pudo completar la operación.');
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const filtered = items.filter((item) => {
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return (
      item.title.toLowerCase().includes(needle) ||
      item.id.toLowerCase().includes(needle) ||
      (item.sourcePath || '').toLowerCase().includes(needle) ||
      (item.description || '').toLowerCase().includes(needle)
    );
  });

  return (
    <div className="web-admin-tenant-stack">
      <div className="web-agenda-toolbar">
        <div className="web-agenda-filters">
          <Tabs value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as RunnerConfigFilter)}>
            <TabsList aria-label={en ? 'Filter by category' : 'Filtrar por categoría'}>
              <TabsTrigger value="all">{en ? 'All' : 'Todos'}</TabsTrigger>
              <TabsTrigger value="skill">{CATEGORY_LABELS.skill[en ? 'en' : 'es']}</TabsTrigger>
              <TabsTrigger value="hook">{CATEGORY_LABELS.hook[en ? 'en' : 'es']}</TabsTrigger>
              <TabsTrigger value="prompt">{CATEGORY_LABELS.prompt[en ? 'en' : 'es']}</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="web-agenda-search">
            <Search size={15} aria-hidden="true" />
            <Input
              aria-label={en ? 'Search configuration' : 'Buscar configuración'}
              placeholder={en ? 'Search by title, ID or path…' : 'Buscar por título, ID o ruta…'}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="web-inline">
            <ActionButton
              icon={RefreshCw}
              iconOnly
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || busy}
              onClick={() => void loadItems()}
            >
              {en ? 'Refresh' : 'Actualizar'}
            </ActionButton>
            <ActionButton
              icon={Plus}
              type="button"
              size="sm"
              disabled={busy}
              onClick={openCreate}
            >
              {en ? 'New' : 'Nuevo'}
            </ActionButton>
          </div>
        </div>
      </div>

      {loading ? (
        <WebLoading message={en ? 'Loading runner configuration…' : 'Cargando configuración del runner…'} />
      ) : error ? (
        <div className="web-inline" role="alert">
          <p className="web-admin-field-error">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadItems()}>
            {en ? 'Retry' : 'Reintentar'}
          </Button>
        </div>
      ) : (
        <RunnerConfigList language={language} items={filtered} busy={busy} onEdit={openEditor} />
      )}

      <Sheet open={!!editingItem} onOpenChange={(open) => { if (!open && !busy) setEditingItem(null); }}>
        <SheetContent side="right" className="web-admin-sheet">
          <SheetHeader>
            <SheetTitle>{editingItem?.title || (en ? 'Edit configuration' : 'Editar configuración')}</SheetTitle>
            <SheetDescription>
              {editingItem
                ? `${CATEGORY_LABELS[editingItem.category]?.[en ? 'en' : 'es'] ?? editingItem.category} · ${editingItem.id}${editingItem.sourcePath ? ` · ${editingItem.sourcePath}` : ''}`
                : ''}
            </SheetDescription>
          </SheetHeader>
          {editingItem && (
            <form className="web-admin-sheet-form" noValidate onSubmit={(event) => void handleSaveEdit(event)}>
              <label className="web-admin-sheet-field">
                <span>{en ? 'Title' : 'Título'}</span>
                <Input
                  name="title"
                  value={editForm.title}
                  onChange={(event) => {
                    setEditForm((current) => ({ ...current, title: event.target.value }));
                    if (editErrors.title) setEditErrors((current) => ({ ...current, title: undefined }));
                  }}
                  aria-invalid={!!editErrors.title}
                  disabled={busy}
                />
                {editErrors.title && <p className="web-admin-field-error" role="alert">{editErrors.title}</p>}
              </label>

              <label className="web-admin-sheet-field">
                <span>{en ? 'Description' : 'Descripción'}</span>
                <Input
                  name="description"
                  value={editForm.description}
                  onChange={(event) => {
                    setEditForm((current) => ({ ...current, description: event.target.value }));
                    if (editErrors.description) setEditErrors((current) => ({ ...current, description: undefined }));
                  }}
                  aria-invalid={!!editErrors.description}
                  disabled={busy}
                />
                {editErrors.description && <p className="web-admin-field-error" role="alert">{editErrors.description}</p>}
              </label>

              <label className="web-consent">
                <input
                  type="checkbox"
                  checked={editForm.enabled}
                  disabled={busy}
                  onChange={(event) => setEditForm((current) => ({ ...current, enabled: event.target.checked }))}
                />
                <span>{en ? 'Enabled for runner execution' : 'Activo para ejecución del runner'}</span>
              </label>

              <label className="web-admin-sheet-field">
                <span>{en ? 'Content' : 'Contenido'}</span>
                <textarea
                  name="content"
                  style={MONOSPACE_TEXTAREA_STYLE}
                  value={editForm.content}
                  onChange={(event) => {
                    setEditForm((current) => ({ ...current, content: event.target.value }));
                    if (editErrors.content) setEditErrors((current) => ({ ...current, content: undefined }));
                  }}
                  aria-invalid={!!editErrors.content}
                  disabled={busy}
                />
                {editErrors.content && <p className="web-admin-field-error" role="alert">{editErrors.content}</p>}
              </label>

              <div className="web-admin-sheet-actions">
                {editingItem.isBuiltIn && editingItem.isCustomized && (
                  <ActionButton
                    icon={RotateCcw}
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setConfirmDeleteItem(editingItem)}
                  >
                    {en ? 'Reset to default' : 'Restaurar por defecto'}
                  </ActionButton>
                )}
                {!editingItem.isBuiltIn && (
                  <ActionButton
                    icon={Trash2}
                    type="button"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setConfirmDeleteItem(editingItem)}
                  >
                    {en ? 'Delete' : 'Eliminar'}
                  </ActionButton>
                )}
                <Button type="button" variant="outline" disabled={busy} onClick={() => setEditingItem(null)}>
                  {en ? 'Cancel' : 'Cancelar'}
                </Button>
                <ActionButton icon={Save} type="submit" disabled={busy}>
                  {en ? 'Save' : 'Guardar'}
                </ActionButton>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={createOpen} onOpenChange={(open) => { if (!busy) setCreateOpen(open); }}>
        <SheetContent side="right" className="web-admin-sheet">
          <SheetHeader>
            <SheetTitle>{en ? 'New configuration item' : 'Nuevo elemento de configuración'}</SheetTitle>
            <SheetDescription>
              {en ? 'Create a custom skill, hook, or prompt for the runner.' : 'Crea un skill, hook o prompt personalizado para el runner.'}
            </SheetDescription>
          </SheetHeader>
          <form className="web-admin-sheet-form" noValidate onSubmit={(event) => void handleCreate(event)}>
            <div className="web-admin-sheet-field">
              <span>{en ? 'Category' : 'Categoría'}</span>
              <SelectField
                aria-label={en ? 'Category' : 'Categoría'}
                value={createForm.category}
                disabled={busy}
                options={[
                  { value: 'skill', label: CATEGORY_LABELS.skill[en ? 'en' : 'es'] },
                  { value: 'hook', label: CATEGORY_LABELS.hook[en ? 'en' : 'es'] },
                  { value: 'prompt', label: CATEGORY_LABELS.prompt[en ? 'en' : 'es'] },
                ]}
                onChange={(next) => setCreateForm((current) => ({ ...current, category: next as RunnerConfigCategory }))}
              />
            </div>

            <label className="web-admin-sheet-field">
              <span>{en ? 'Identifier (ID)' : 'Identificador (ID)'}</span>
              <Input
                name="id"
                placeholder={`${createForm.category}:custom-name`}
                value={createForm.id}
                onChange={(event) => {
                  setCreateForm((current) => ({ ...current, id: event.target.value }));
                  if (createErrors.id) setCreateErrors((current) => ({ ...current, id: undefined }));
                }}
                aria-invalid={!!createErrors.id}
                disabled={busy}
              />
              {createErrors.id && <p className="web-admin-field-error" role="alert">{createErrors.id}</p>}
            </label>

            <label className="web-admin-sheet-field">
              <span>{en ? 'Title' : 'Título'}</span>
              <Input
                name="title"
                placeholder={en ? 'Descriptive title…' : 'Título descriptivo…'}
                value={createForm.title}
                onChange={(event) => {
                  setCreateForm((current) => ({ ...current, title: event.target.value }));
                  if (createErrors.title) setCreateErrors((current) => ({ ...current, title: undefined }));
                }}
                aria-invalid={!!createErrors.title}
                disabled={busy}
              />
              {createErrors.title && <p className="web-admin-field-error" role="alert">{createErrors.title}</p>}
            </label>

            <label className="web-admin-sheet-field">
              <span>{en ? 'Description' : 'Descripción'}</span>
              <Input
                name="description"
                placeholder={en ? 'Optional summary…' : 'Resumen opcional…'}
                value={createForm.description}
                onChange={(event) => {
                  setCreateForm((current) => ({ ...current, description: event.target.value }));
                  if (createErrors.description) setCreateErrors((current) => ({ ...current, description: undefined }));
                }}
                aria-invalid={!!createErrors.description}
                disabled={busy}
              />
              {createErrors.description && <p className="web-admin-field-error" role="alert">{createErrors.description}</p>}
            </label>

            <label className="web-consent">
              <input
                type="checkbox"
                checked={createForm.enabled}
                disabled={busy}
                onChange={(event) => setCreateForm((current) => ({ ...current, enabled: event.target.checked }))}
              />
              <span>{en ? 'Enabled for runner execution' : 'Activo para ejecución del runner'}</span>
            </label>

            <label className="web-admin-sheet-field">
              <span>{en ? 'Content' : 'Contenido'}</span>
              <textarea
                name="content"
                style={MONOSPACE_TEXTAREA_STYLE}
                placeholder={en ? 'Instructions or JSON config…' : 'Instrucciones o configuración JSON…'}
                value={createForm.content}
                onChange={(event) => {
                  setCreateForm((current) => ({ ...current, content: event.target.value }));
                  if (createErrors.content) setCreateErrors((current) => ({ ...current, content: undefined }));
                }}
                aria-invalid={!!createErrors.content}
                disabled={busy}
              />
              {createErrors.content && <p className="web-admin-field-error" role="alert">{createErrors.content}</p>}
            </label>

            <div className="web-admin-sheet-actions">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setCreateOpen(false)}>
                {en ? 'Cancel' : 'Cancelar'}
              </Button>
              <ActionButton icon={Plus} type="submit" disabled={busy}>
                {en ? 'Create' : 'Crear'}
              </ActionButton>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <AppDialog
        open={!!confirmDeleteItem}
        preventClose={busy}
        onOpenChange={(open) => { if (!open && !busy) setConfirmDeleteItem(null); }}
        title={
          confirmDeleteItem?.isBuiltIn
            ? (en ? 'Reset to default?' : '¿Restaurar por defecto?')
            : (en ? 'Delete custom item?' : '¿Eliminar elemento personalizado?')
        }
        description={
          confirmDeleteItem?.isBuiltIn
            ? (en
              ? `Custom changes to “${confirmDeleteItem.title}” will be discarded and the built-in default will be restored.`
              : `Se descartarán los cambios personalizados de «${confirmDeleteItem.title}» y se restaurará el valor por defecto.`)
            : (en
              ? `“${confirmDeleteItem?.title || ''}” will be permanently removed.`
              : `Se eliminará permanentemente «${confirmDeleteItem?.title || ''}».`)
        }
        actions={
          <>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmDeleteItem(null)}>
              {en ? 'Cancel' : 'Cancelar'}
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleConfirmDeleteOrReset()}>
              {confirmDeleteItem?.isBuiltIn
                ? (en ? 'Reset to default' : 'Restaurar por defecto')
                : (en ? 'Delete' : 'Eliminar')}
            </Button>
          </>
        }
      />
    </div>
  );
}
