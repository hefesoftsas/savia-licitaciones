import { WebLoading } from './WebLoading';
import { FileCheck2, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import WebCertificateImages from './WebCertificateImages';
import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import AppDialog from '@/shared/ui/AppDialog';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { SelectField } from '@/shared/ui/SelectField';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/primitives/sheet';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';

type Fields = { name: string; number: string; validityMode: '' | 'range' | 'long-term'; validFrom: string; validTo: string };
type Certificate = Fields & { id: string; version: number; deleting?: boolean };
const validDate = (value: string) =>
  !value ||
  (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
const blank = (): Fields => ({ name: '', number: '', validityMode: '', validFrom: '', validTo: '' });

const certificateSchema = (en: boolean) =>
  z
    .object({
      name: z.string().max(300, en ? 'Maximum 300 characters.' : 'Máximo 300 caracteres.'),
      number: z.string().max(300, en ? 'Maximum 300 characters.' : 'Máximo 300 caracteres.'),
      validityMode: z.string(),
      validFrom: z.string(),
      validTo: z.string(),
    })
    .superRefine((data, ctx) => {
      if (data.validityMode === 'range' && data.validFrom && data.validTo && validDate(data.validFrom) && validDate(data.validTo)) {
        if (data.validTo < data.validFrom) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['validTo'],
            message: en ? 'End date cannot be earlier than start date.' : 'La fecha de vencimiento no puede ser anterior a la inicial.',
          });
        }
      }
    });

export default function WebCompanyCertificates({
  language,
  onDirtyChange,
}: {
  language: 'es' | 'en';
  onDirtyChange: (dirty: boolean) => void;
}) {
  const en = language === 'en';
  const { showToast } = useToast();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<Certificate | null>(null);
  const [draft, setDraft] = useState<Fields | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [removing, setRemoving] = useState<Certificate | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void request<{ certificates: Certificate[] }>('/api/company-certificates')
      .then((data) => {
        if (active) setCertificates(data.certificates);
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
    onDirtyChange(!!draft);
    return () => onDirtyChange(false);
  }, [draft, onDirtyChange]);

  const start = (item?: Certificate) => {
    setFieldErrors({});
    setEditing(item || null);
    setDraft(
      item
        ? {
            name: item.name,
            number: item.number,
            validityMode: item.validityMode,
            validFrom: item.validFrom,
            validTo: item.validTo,
          }
        : blank(),
    );
  };
  const stop = () => {
    setDraft(null);
    setEditing(null);
    setFieldErrors({});
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || busy) return;
    const parsed = certificateSchema(en).safeParse(draft);
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
      await request(editing ? `/api/company-certificates/${encodeURIComponent(editing.id)}` : '/api/company-certificates', {
        method: editing ? 'PUT' : 'POST',
        json: editing ? { ...draft, version: editing.version } : draft,
      });
      stop();
      setRefresh((value) => value + 1);
      showToast(en ? 'Certificate saved.' : 'Certificado guardado.', 'success');
    } catch (error) {
      showToast(
        (error as Error & { status?: number }).status === 409
          ? en
            ? 'This certificate changed in another session. Copy your changes and refresh.'
            : 'El certificado cambió en otra sesión. Copia tus cambios y actualiza.'
          : en
            ? 'Could not save the certificate.'
            : 'No se pudo guardar el certificado.',
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
      await request(`/api/company-certificates/${encodeURIComponent(removing.id)}`, {
        method: 'DELETE',
        json: { version: removing.version },
      });
      setRemoving(null);
      setRefresh((value) => value + 1);
      showToast(en ? 'Certificate removed.' : 'Certificado eliminado.', 'success');
    } catch (error) {
      showToast(
        (error as Error & { status?: number }).status === 409
          ? en
            ? 'The certificate changed. Refresh before deleting.'
            : 'El certificado cambió. Actualiza antes de eliminarlo.'
          : (error as Error & { status?: number }).status === 503
            ? en
              ? 'Removal is pending. Retry from the list.'
              : 'La eliminación está pendiente. Reintenta desde la lista.'
            : en
              ? 'Could not remove the certificate.'
              : 'No se pudo eliminar el certificado.',
        'error',
      );
      setRemoving(null);
      setRefresh((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="web-company-section web-company-certificates">
      <div className="web-secop-heading web-company-heading">
        <div>
          <h2>{en ? 'Company certificates & validity dates' : 'Certificados de la empresa y fechas de vigencia'}</h2>
          <p>{en ? 'Manage validity dates, supporting files and expiration reminders.' : 'Administra vigencias, soportes y recordatorios de vencimiento.'}</p>
        </div>
        <div className="web-inline">
          <Button icon={Plus} size="sm" disabled={busy || loading} onClick={() => start()}>
            {en ? 'Add certificate' : 'Agregar certificado'}
          </Button>
          <Button icon={RefreshCw} iconOnly variant="outline" size="sm" disabled={busy || loading} onClick={() => setRefresh((value) => value + 1)}>
            {en ? 'Refresh' : 'Actualizar'}
          </Button>
        </div>
      </div>

      <details className="web-profile-group">
        <summary>
          <strong>{en ? 'Import from desktop' : 'Importar desde escritorio'}</strong>
        </summary>
        <p style={{ marginTop: 8 }}>
          {en
            ? 'Import certificates and their images from a desktop backup with the local runner.'
            : 'Importa los certificados y sus imágenes desde un respaldo con el runner local.'}
        </p>
      </details>

      {loading && <WebLoading message={en ? 'Loading certificates…' : 'Cargando certificados…'} />}
      {failed && <p role="alert">{en ? 'Could not load certificates. Try refreshing.' : 'No se pudieron cargar los certificados. Intenta actualizar.'}</p>}
      {!loading && !failed && !certificates.length && (
        <div className="web-agenda-empty">
          <FileCheck2 size={24} aria-hidden="true" />
          <p>{en ? 'No certificates yet.' : 'Aún no hay certificados.'}</p>
        </div>
      )}
      {!loading && !failed && !!certificates.length && (
        <div className="web-certificate-list">
          {certificates.map((item) => (
            <article key={item.id} className="web-company-card">
              <div className="web-company-card-main">
                <div className="web-company-card-title-row">
                  <strong>{item.name || (en ? 'Unnamed certificate' : 'Certificado sin nombre')}</strong>
                  <span className="web-market-badge is-subtle">
                    {item.validityMode === 'long-term'
                      ? en
                        ? 'No expiry'
                        : 'Sin vencimiento'
                      : item.validityMode === 'range'
                        ? [item.validFrom, item.validTo].filter(Boolean).join(' – ') || '—'
                        : '—'}
                  </span>
                </div>
                {item.number && <p>{item.number}</p>}
                {item.deleting && <p>{en ? 'Removal pending' : 'Eliminación pendiente'}</p>}
              </div>
              <div className="web-inline">
                <Button icon={Pencil} iconOnly variant="outline" size="sm" disabled={busy || !!item.deleting} onClick={() => start(item)}>
                  {en ? 'Edit' : 'Editar'}
                </Button>
                <Button icon={item.deleting ? RefreshCw : Trash2} iconOnly variant="outline" size="sm" disabled={busy} onClick={() => setRemoving(item)}>
                  {item.deleting ? (en ? 'Retry' : 'Reintentar') : en ? 'Delete' : 'Eliminar'}
                </Button>
              </div>
              {!item.deleting && <WebCertificateImages certificateId={item.id} language={language} />}
            </article>
          ))}
        </div>
      )}

      <Sheet
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) stop();
        }}
      >
        <SheetContent side="right" className="web-admin-sheet">
          <SheetHeader>
            <SheetTitle>{editing ? (en ? 'Edit certificate' : 'Editar certificado') : en ? 'New certificate' : 'Nuevo certificado'}</SheetTitle>
            <SheetDescription>
              {en ? 'Record certificate details and validity dates. All fields are optional.' : 'Registra los datos y vigencias del certificado. Todos los campos son opcionales.'}
            </SheetDescription>
          </SheetHeader>
          {draft && (
            <form className="web-admin-sheet-form" onSubmit={(event) => void save(event)} noValidate>
              <label className="web-admin-sheet-field">
                <span>{en ? 'Name' : 'Nombre'}</span>
                <Input
                  maxLength={300}
                  disabled={busy}
                  value={draft.name}
                  placeholder={en ? 'E.g., ISO 9001 Quality Management' : 'Ej. Certificado ISO 9001'}
                  onChange={(event) => {
                    setDraft({ ...draft, name: event.target.value });
                    if (fieldErrors.name) setFieldErrors((current) => ({ ...current, name: undefined }));
                  }}
                />
                {fieldErrors.name && <p className="web-admin-field-error" role="alert">{fieldErrors.name}</p>}
              </label>
              <label className="web-admin-sheet-field">
                <span>{en ? 'Number' : 'Número'}</span>
                <Input
                  maxLength={300}
                  disabled={busy}
                  value={draft.number}
                  placeholder={en ? 'Certificate or registration number' : 'Número de certificado o registro'}
                  onChange={(event) => {
                    setDraft({ ...draft, number: event.target.value });
                    if (fieldErrors.number) setFieldErrors((current) => ({ ...current, number: undefined }));
                  }}
                />
                {fieldErrors.number && <p className="web-admin-field-error" role="alert">{fieldErrors.number}</p>}
              </label>
              <div className="web-admin-sheet-field">
                <span>{en ? 'Validity' : 'Vigencia'}</span>
                <SelectField
                  aria-label={en ? 'Validity' : 'Vigencia'}
                  disabled={busy}
                  value={draft.validityMode}
                  options={[
                    ...(!['', 'range', 'long-term'].includes(draft.validityMode)
                      ? [{ value: draft.validityMode, label: `${en ? 'Historical value' : 'Valor histórico'}: ${draft.validityMode}` }]
                      : []),
                    { value: '', label: en ? 'Not specified' : 'Sin especificar' },
                    { value: 'range', label: en ? 'Date range' : 'Intervalo de fechas' },
                    { value: 'long-term', label: en ? 'No expiry' : 'Sin vencimiento' },
                  ]}
                  onChange={(next) => {
                    const validityMode = next as Fields['validityMode'];
                    setDraft({ ...draft, validityMode, ...(validityMode === 'range' ? {} : { validFrom: '', validTo: '' }) });
                    setFieldErrors((current) => ({ ...current, validTo: undefined }));
                  }}
                />
              </div>
              {draft.validityMode === 'range' && (
                <>
                  <label className="web-admin-sheet-field">
                    <span>{en ? 'Valid from' : 'Válido desde'}</span>
                    <Input
                      disabled={busy}
                      type={validDate(draft.validFrom) ? 'date' : 'text'}
                      value={draft.validFrom}
                      onChange={(event) => {
                        setDraft({ ...draft, validFrom: event.target.value });
                        if (fieldErrors.validTo) setFieldErrors((current) => ({ ...current, validTo: undefined }));
                      }}
                    />
                  </label>
                  <label className="web-admin-sheet-field">
                    <span>{en ? 'Valid until' : 'Válido hasta'}</span>
                    <Input
                      disabled={busy}
                      type={validDate(draft.validTo) ? 'date' : 'text'}
                      value={draft.validTo}
                      onChange={(event) => {
                        setDraft({ ...draft, validTo: event.target.value });
                        if (fieldErrors.validTo) setFieldErrors((current) => ({ ...current, validTo: undefined }));
                      }}
                    />
                    {fieldErrors.validTo && <p className="web-admin-field-error" role="alert">{fieldErrors.validTo}</p>}
                  </label>
                </>
              )}
              {(!['', 'range', 'long-term'].includes(draft.validityMode) || !validDate(draft.validFrom) || !validDate(draft.validTo)) && (
                <p role="status">{en ? 'Review historical validity values before saving.' : 'Revisa los valores históricos de vigencia antes de guardar.'}</p>
              )}
              {!['', 'range', 'long-term'].includes(draft.validityMode) && (
                <p>
                  {en ? 'Previous dates' : 'Fechas anteriores'}: {[draft.validFrom, draft.validTo].filter(Boolean).join(' – ') || '—'}
                </p>
              )}
              <div className="web-admin-sheet-actions">
                <Button type="button" variant="outline" disabled={busy} onClick={stop}>
                  {en ? 'Cancel' : 'Cancelar'}
                </Button>
                <Button icon={Save} type="submit" disabled={busy}>
                  {busy ? (en ? 'Saving…' : 'Guardando…') : en ? 'Save' : 'Guardar'}
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>

      <AppDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoving(null);
        }}
        title={en ? 'Delete certificate?' : '¿Eliminar certificado?'}
        description={en ? 'This also removes its expiry from the agenda.' : 'También se retirará su vencimiento de la agenda.'}
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
