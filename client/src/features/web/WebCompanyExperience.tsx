import { WebLoading } from './WebLoading';
import { BriefcaseBusiness, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import AppDialog from '@/shared/ui/AppDialog';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { SelectField } from '@/shared/ui/SelectField';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/primitives/sheet';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import WebCompanyExperienceImages from './WebCompanyExperienceImages';

type Language = 'es' | 'en';
const fields = [
  'projectName',
  'projectNumber',
  'customerName',
  'projectType',
  'projectManager',
  'contractAmount',
  'startDate',
  'endDate',
  'projectStatus',
  'introduction',
] as const;
type Fields = Record<(typeof fields)[number], string>;
type Experience = Fields & { id: string; version: number; createdAt: string; updatedAt: string; deleting?: boolean };

const isoDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const experienceSchema = (en: boolean) =>
  z
    .object({
      projectName: z.string().max(20000),
      projectNumber: z.string().max(20000),
      customerName: z.string().max(20000),
      projectType: z.string(),
      projectManager: z.string().max(20000),
      contractAmount: z.string().max(20000),
      startDate: z.string().max(20000),
      endDate: z.string().max(20000),
      projectStatus: z.string().max(20000),
      introduction: z.string().max(20000),
    })
    .superRefine((data, ctx) => {
      const start = data.startDate.trim();
      const end = data.endDate.trim();
      if (start && end && isoDate(start) && isoDate(end) && end < start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endDate'],
          message: en ? 'End date cannot be earlier than start date.' : 'La fecha de fin no puede ser anterior a la de inicio.',
        });
      }
    });

export function emptyExperience(): Fields {
  return Object.fromEntries(fields.map((field) => [field, ''])) as Fields;
}

function values(item: Experience): Fields {
  return Object.fromEntries(fields.map((field) => [field, item[field]])) as Fields;
}

const labels: Record<Exclude<keyof Fields, 'projectType' | 'introduction'>, [string, string]> = {
  projectName: ['Nombre del proyecto', 'Project name'],
  projectNumber: ['Número de contrato o proyecto', 'Contract or project number'],
  customerName: ['Cliente o entidad', 'Client or entity'],
  projectManager: ['Responsable', 'Manager'],
  contractAmount: ['Importe del contrato', 'Contract amount'],
  startDate: ['Fecha de inicio', 'Start date'],
  endDate: ['Fecha de fin', 'End date'],
  projectStatus: ['Estado', 'Status'],
};

const typeLabels: Record<string, [string, string]> = {
  service: ['Servicios', 'Services'],
  goods: ['Bienes', 'Goods'],
  construction: ['Obras', 'Construction'],
};

export function ExperienceEditor({
  language,
  draft,
  busy,
  editing,
  dirty,
  errors = {},
  onChange,
  onSave,
  onCancel,
}: {
  language: Language;
  draft: Fields;
  busy: boolean;
  editing: boolean;
  dirty: boolean;
  errors?: Partial<Record<keyof Fields, string>>;
  onChange: (draft: Fields) => void;
  onSave: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  const en = language === 'en';
  const known = ['', 'service', 'goods', 'construction'].includes(draft.projectType);
  return (
    <form className="web-admin-sheet-form" onSubmit={onSave} noValidate>
      {(Object.keys(labels) as Array<keyof typeof labels>).map((field) => (
        <label key={field} className="web-admin-sheet-field">
          <span>{labels[field][en ? 1 : 0]}</span>
          <Input
            disabled={busy}
            maxLength={20000}
            value={draft[field]}
            placeholder={['startDate', 'endDate'].includes(field) ? (en ? 'YYYY-MM-DD or historical value' : 'AAAA-MM-DD o valor histórico') : undefined}
            onChange={(event) => onChange({ ...draft, [field]: event.target.value })}
          />
          {errors[field] && (
            <p className="web-admin-field-error" role="alert">
              {errors[field]}
            </p>
          )}
        </label>
      ))}
      <div className="web-admin-sheet-field">
        <span>{en ? 'Project type' : 'Tipo de proyecto'}</span>
        <SelectField
          aria-label={en ? 'Project type' : 'Tipo de proyecto'}
          disabled={busy}
          value={draft.projectType}
          options={[
            ...(!known ? [{ value: draft.projectType, label: `${en ? 'Historical value' : 'Valor histórico'}: ${draft.projectType}` }] : []),
            { value: '', label: en ? 'Not specified' : 'Sin especificar' },
            { value: 'service', label: en ? 'Services' : 'Servicios' },
            { value: 'goods', label: en ? 'Goods' : 'Bienes' },
            { value: 'construction', label: en ? 'Construction' : 'Obras' },
          ]}
          onChange={(next) => onChange({ ...draft, projectType: next })}
        />
      </div>
      <label className="web-admin-sheet-field">
        <span>{en ? 'Description' : 'Descripción'}</span>
        <textarea
          disabled={busy}
          maxLength={20000}
          value={draft.introduction}
          onChange={(event) => onChange({ ...draft, introduction: event.target.value })}
        />
      </label>
      {dirty && <p role="status">{en ? 'Unsaved changes' : 'Cambios sin guardar'}</p>}
      <div className="web-admin-sheet-actions">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          {en ? 'Cancel' : 'Cancelar'}
        </Button>
        <Button icon={Save} type="submit" disabled={busy || (editing && !dirty)}>
          {busy ? (en ? 'Saving…' : 'Guardando…') : en ? 'Save' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}

export function ExperienceList({
  language,
  projects,
  busy,
  onEdit,
  onDelete,
}: {
  language: Language;
  projects: Experience[];
  busy: boolean;
  onEdit: (item: Experience) => void;
  onDelete: (item: Experience) => void;
}) {
  const en = language === 'en';
  return (
    <div className="web-certificate-list">
      {projects.map((item) => {
        const typeLabel = typeLabels[item.projectType]?.[en ? 1 : 0] || item.projectType;
        return (
          <article key={item.id} className="web-company-card">
            <div className="web-company-card-main">
              <div className="web-company-card-title-row">
                <strong>{item.projectName || (en ? 'Unnamed experience' : 'Experiencia sin nombre')}</strong>
                {typeLabel && <span className="web-market-badge is-subtle">{typeLabel}</span>}
                {item.projectStatus && <span className="web-market-badge">{item.projectStatus}</span>}
              </div>
              <p>
                {[
                  item.projectNumber,
                  item.customerName,
                  item.contractAmount ? `${en ? 'Amount' : 'Importe'}: ${item.contractAmount}` : '',
                  [item.startDate, item.endDate].filter(Boolean).join(' – '),
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
              {item.introduction && <p className="web-company-card-desc">{item.introduction}</p>}
              {item.deleting && <p role="status">{en ? 'Removal pending' : 'Eliminación pendiente'}</p>}
            </div>
            <div className="web-inline">
              <Button
                icon={Pencil}
                iconOnly
                variant="outline"
                size="sm"
                disabled={busy || !!item.deleting}
                aria-label={`${en ? 'Edit' : 'Editar'}: ${item.projectName || (en ? 'Unnamed experience' : 'Experiencia sin nombre')}`}
                onClick={() => onEdit(item)}
              >
                {en ? 'Edit' : 'Editar'}
              </Button>
              <Button
                icon={item.deleting ? RefreshCw : Trash2}
                iconOnly
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label={`${
                  item.deleting ? (en ? 'Retry removal' : 'Reintentar eliminación') : en ? 'Delete' : 'Eliminar'
                }: ${item.projectName || (en ? 'Unnamed experience' : 'Experiencia sin nombre')}`}
                onClick={() => onDelete(item)}
              >
                {item.deleting ? (en ? 'Retry' : 'Reintentar') : en ? 'Delete' : 'Eliminar'}
              </Button>
            </div>
            {!item.deleting && <WebCompanyExperienceImages projectId={item.id} language={language} disabled={busy} />}
          </article>
        );
      })}
    </div>
  );
}

export default function WebCompanyExperience({
  language,
  onDirtyChange,
}: {
  language: Language;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const en = language === 'en';
  const { showToast } = useToast();
  const [projects, setProjects] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Experience | null>(null);
  const [draft, setDraft] = useState<Fields | null>(null);
  const [initial, setInitial] = useState<Fields | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [removing, setRemoving] = useState<Experience | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [conflict, setConflict] = useState(false);
  const dirty = !!draft && !!initial && JSON.stringify(draft) !== JSON.stringify(initial);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void request<{ projects: Experience[] }>('/api/company-experience')
      .then((data) => {
        if (active) setProjects(data.projects);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    onDirtyChange(dirty || (!!draft && busy));
    return () => onDirtyChange(false);
  }, [dirty, draft, busy, onDirtyChange]);

  const start = (item?: Experience) => {
    const next = item ? values(item) : emptyExperience();
    setFieldErrors({});
    setEditing(item || null);
    setInitial(next);
    setDraft(next);
    setConflict(false);
  };
  const stop = () => {
    setDraft(null);
    setInitial(null);
    setEditing(null);
    setFieldErrors({});
    setConflict(false);
    setDiscarding(false);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || busy || (editing && !dirty)) return;
    const parsed = experienceSchema(en).safeParse(draft);
    if (!parsed.success) {
      const next: Partial<Record<keyof Fields, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Fields | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await request(editing ? `/api/company-experience/${encodeURIComponent(editing.id)}` : '/api/company-experience', {
        method: editing ? 'PUT' : 'POST',
        json: editing ? { ...draft, version: editing.version } : draft,
      });
      stop();
      setRefresh((value) => value + 1);
      showToast(en ? 'Experience saved.' : 'Experiencia guardada.', 'success');
    } catch (error) {
      const stale = (error as Error & { status?: number }).status === 409;
      setConflict(stale);
      showToast(
        stale
          ? en
            ? 'Changed in another session. Copy your edits before refreshing.'
            : 'Cambió en otra sesión. Copia tus cambios antes de actualizar.'
          : en
            ? 'Could not save experience.'
            : 'No se pudo guardar la experiencia.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try {
      await request(`/api/company-experience/${encodeURIComponent(removing.id)}`, {
        method: 'DELETE',
        json: { version: removing.version },
      });
      showToast(en ? 'Experience deleted.' : 'Experiencia eliminada.', 'success');
    } catch (error) {
      showToast(
        (error as Error & { status?: number }).status === 409
          ? en
            ? 'The experience changed. Refresh and try again.'
            : 'La experiencia cambió. Actualiza e inténtalo de nuevo.'
          : (error as Error & { status?: number }).status === 503
            ? en
              ? 'Removal is pending. Retry from the list.'
              : 'La eliminación está pendiente. Reintenta desde la lista.'
            : en
              ? 'Could not delete experience.'
              : 'No se pudo eliminar la experiencia.',
        'error',
      );
    } finally {
      setRemoving(null);
      setRefresh((value) => value + 1);
      setBusy(false);
    }
  };

  const query = search.trim().toLocaleLowerCase(language);
  const visible = projects.filter((item) =>
    [item.projectName, item.projectNumber, item.customerName, item.projectManager].some((value) =>
      value.toLocaleLowerCase(language).includes(query),
    ),
  );

  return (
    <section className="web-company-section">
      <div className="web-secop-heading web-company-heading">
        <div>
          <h2>{en ? 'Company experience & executed contracts' : 'Experiencia empresarial y contratos ejecutados'}</h2>
          <p>
            {en
              ? 'Record company projects and contracts as experience for future opportunities.'
              : 'Registra proyectos y contratos de la empresa como experiencia para futuras oportunidades.'}
          </p>
        </div>
        <div className="web-inline">
          <Button icon={Plus} size="sm" type="button" disabled={busy || loading || failed} onClick={() => start()}>
            {en ? 'Add experience' : 'Agregar experiencia'}
          </Button>
          <Button
            icon={RefreshCw}
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            {en ? 'Refresh' : 'Actualizar'}
          </Button>
        </div>
      </div>

      {loading && <WebLoading message={en ? 'Loading experience…' : 'Cargando experiencia…'} />}
      {failed && <p role="alert">{en ? 'Could not load experience. Refresh to retry.' : 'No se pudo cargar la experiencia. Actualiza para reintentar.'}</p>}
      {!loading && !failed && (
        <>
          {projects.length > 0 && (
            <label className="web-experience-search">
              <span>{en ? 'Search experience' : 'Buscar experiencia'}</span>
              <Input
                type="search"
                value={search}
                placeholder={en ? 'Search by project, contract number, client or manager…' : 'Buscar por proyecto, número de contrato, cliente o responsable…'}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          )}
          {visible.length ? (
            <ExperienceList language={language} projects={visible} busy={busy} onEdit={start} onDelete={setRemoving} />
          ) : (
            <div className="web-agenda-empty">
              <BriefcaseBusiness size={24} aria-hidden="true" />
              <p>{projects.length ? (en ? 'No matching experience.' : 'No hay coincidencias.') : en ? 'No experience recorded yet.' : 'Aún no hay experiencia registrada.'}</p>
            </div>
          )}
        </>
      )}

      <Sheet
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) {
            if (dirty) setDiscarding(true);
            else stop();
          }
        }}
      >
        <SheetContent side="right" className="web-admin-sheet">
          <SheetHeader>
            <SheetTitle>{editing ? (en ? 'Edit experience' : 'Editar experiencia') : en ? 'New experience' : 'Nueva experiencia'}</SheetTitle>
            <SheetDescription>
              {en ? 'Record contract details and dates. All fields are optional.' : 'Registra los datos del contrato y fechas. Todos los campos son opcionales.'}
            </SheetDescription>
          </SheetHeader>
          {conflict && (
            <p className="web-admin-field-error" role="alert">
              {en ? 'Copy your edits, cancel and refresh to load the latest version.' : 'Copia tus cambios, cancela y actualiza para cargar la versión actual.'}
            </p>
          )}
          {draft && (
            <ExperienceEditor
              language={language}
              draft={draft}
              busy={busy}
              editing={!!editing}
              dirty={dirty}
              errors={fieldErrors}
              onChange={(next) => {
                setDraft(next);
                if (fieldErrors.endDate) setFieldErrors((current) => ({ ...current, endDate: undefined }));
              }}
              onSave={(event) => void save(event)}
              onCancel={() => (dirty ? setDiscarding(true) : stop())}
            />
          )}
        </SheetContent>
      </Sheet>

      <AppDialog
        open={discarding}
        onOpenChange={(open) => {
          if (!open && !busy) setDiscarding(false);
        }}
        title={en ? 'Discard changes?' : '¿Descartar cambios?'}
        description={en ? 'Your unsaved edits will be lost.' : 'Se perderán los cambios sin guardar.'}
        actions={
          <>
            <Button variant="outline" disabled={busy} onClick={() => setDiscarding(false)}>
              {en ? 'Keep editing' : 'Seguir editando'}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={stop}>
              {en ? 'Discard' : 'Descartar'}
            </Button>
          </>
        }
      />
      <AppDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoving(null);
        }}
        title={en ? 'Delete experience?' : '¿Eliminar experiencia?'}
        description={`${removing?.projectName || (en ? 'Unnamed experience' : 'Experiencia sin nombre')}. ${
          en ? 'Its supporting images will also be removed.' : 'También se eliminarán sus imágenes de soporte.'
        }`}
        actions={
          <>
            <Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>
              {en ? 'Cancel' : 'Cancelar'}
            </Button>
            <Button icon={Trash2} variant="destructive" disabled={busy} onClick={() => void remove()}>
              {en ? 'Delete' : 'Eliminar'}
            </Button>
          </>
        }
      />
    </section>
  );
}
