import { WebLoading } from './WebLoading';
import { Pencil, RefreshCw, Save } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import AppDialog from '@/shared/ui/AppDialog';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/primitives/sheet';
import { Switch } from '@/shared/ui/primitives/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/primitives/tabs';
import { Textarea } from '@/shared/ui/primitives/textarea';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import WebCompanyProfileImages from './WebCompanyProfileImages';

type Language = 'es' | 'en';
const groups = [
  {
    es: 'Datos básicos',
    en: 'Basic information',
    fields: [
      ['companyName', 'Nombre de la empresa', 'Company name'],
      ['unifiedSocialCreditCode', 'Identificación tributaria o código', 'Tax ID or registration code'],
      ['phone', 'Teléfono', 'Phone'],
      ['email', 'Correo electrónico', 'Email'],
      ['legalRepresentative', 'Representante legal', 'Legal representative'],
      ['registeredCapital', 'Capital registrado', 'Registered capital'],
      ['operatingPeriodStart', 'Inicio de operaciones', 'Operating from'],
      ['operatingPeriodEnd', 'Fin de operaciones', 'Operating until'],
      ['address', 'Dirección', 'Address'],
      ['industry', 'Sector', 'Industry'],
      ['companyType', 'Tipo de empresa', 'Company type'],
      ['insuredEmployeeCount', 'Personal asegurado', 'Insured employees'],
    ],
  },
  {
    es: 'Actividad y presentación',
    en: 'Business activity and overview',
    fields: [
      ['businessScope', 'Actividad económica', 'Business activity'],
      ['companyIntro', 'Presentación de la empresa', 'Company overview'],
    ],
  },
  {
    es: 'Información financiera',
    en: 'Financial information',
    fields: [
      ['bidBenchmarks', 'Referencias para licitar (facturación por ejercicio, costes por unidad y margen objetivo)', 'Bid benchmarks (turnover by year, unit costs and target margin)'],
      ['taxCertificateDate', 'Fecha del certificado tributario', 'Tax certificate date'],
      ['taxCertificateNote', 'Nota del certificado tributario', 'Tax certificate note'],
      ['auditReportDate', 'Fecha del informe de auditoría', 'Audit report date'],
      ['auditReportNote', 'Nota del informe de auditoría', 'Audit report note'],
      ['socialSecurityCertificateDate', 'Fecha del certificado de seguridad social', 'Social security certificate date'],
      ['socialSecurityCertificateNote', 'Nota de seguridad social', 'Social security certificate note'],
      ['bankAccountName', 'Titular de la cuenta', 'Account holder'],
      ['bankAccountNumber', 'Número de cuenta', 'Account number'],
      ['bankName', 'Banco', 'Bank'],
      ['bankRoutingNumber', 'Código bancario', 'Bank routing code'],
    ],
  },
  { es: 'Marca de agua', en: 'Watermark', fields: [['watermarkContent', 'Texto de la marca de agua', 'Watermark text']] },
] as const;

type Field = (typeof groups)[number]['fields'][number][0];
type Profile = Record<Field, string> & { watermarkEnabled: boolean };
type Snapshot = { profile: Profile; version: number; updatedAt: string | null };

export function emptyCompanyProfile(): Profile {
  return {
    ...(Object.fromEntries(groups.flatMap(group => group.fields.map(([key]) => [key, '']))) as Record<Field, string>),
    watermarkEnabled: false,
  };
}

const longFields = new Set<Field>([
  'bidBenchmarks',
  'businessScope',
  'companyIntro',
  'taxCertificateNote',
  'auditReportNote',
  'socialSecurityCertificateNote',
  'watermarkContent',
]);

const groupDescriptions = (en: boolean) =>
  en
    ? [
        'Identify your company and provide contact information.',
        'Describe what your company does and how you present it.',
        'Keep banking and certificate details together.',
        'Set the watermark preference for your documents.',
      ]
    : [
        'Identifica tu empresa y agrega sus datos de contacto.',
        'Describe la actividad y la presentación de tu empresa.',
        'Reúne los datos bancarios y de tus certificados.',
        'Configura la preferencia de marca de agua para tus documentos.',
      ];

export function CompanyProfileForm({
  profile,
  language,
  dirty,
  busy,
  activeGroup,
  onChange,
  onSave,
  onCancel,
}: {
  profile: Profile;
  language: Language;
  dirty: boolean;
  busy: boolean;
  activeGroup: number;
  onChange: (profile: Profile) => void;
  onSave: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  const en = language === 'en';
  const group = groups[activeGroup];
  if (!group) return null;
  return (
    <form className="web-admin-sheet-form" onSubmit={onSave}>
      {group.es === 'Marca de agua' && (
        <p className="web-notice">
          {en
            ? 'The preference is saved, but the watermark is not applied automatically in the web version yet.'
            : 'La preferencia se guarda, pero la marca de agua aún no se aplica automáticamente en la versión web.'}
        </p>
      )}
      {group.fields.map(([field, esLabel, enLabel]) => (
        <label key={field} className="web-admin-sheet-field">
          <span>{en ? enLabel : esLabel}</span>
          {longFields.has(field) ? (
            <Textarea
              placeholder={field==='bidBenchmarks'?(en?'For opportunity screening, include year, currency and unit.':'Para revisar oportunidades, indica el ejercicio, la moneda y la unidad.'):undefined}
              maxLength={field==='bidBenchmarks'?4000:100000}
              disabled={busy}
              value={profile[field] ?? ''}
              onChange={event => onChange({ ...profile, [field]: event.target.value })}
            />
          ) : (
            <Input
              maxLength={100000}
              disabled={busy}
              value={profile[field] ?? ''}
              onChange={event => onChange({ ...profile, [field]: event.target.value })}
            />
          )}
        </label>
      ))}
      {group.es === 'Marca de agua' && (
        <label className="web-consent">
          <Switch
            disabled={busy}
            checked={profile.watermarkEnabled}
            onCheckedChange={checked => onChange({ ...profile, watermarkEnabled: checked })}
          />
          {en ? 'Enable watermark preference' : 'Activar preferencia de marca de agua'}
        </label>
      )}
      <div className="web-admin-sheet-actions">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          {en ? 'Cancel' : 'Cancelar'}
        </Button>
        <Button icon={Save} type="submit" disabled={busy || !dirty}>
          {busy ? (en ? 'Saving…' : 'Guardando…') : en ? 'Save changes' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}

export default function WebCompanyProfile({
  language,
  onDirtyChange,
}: {
  language: Language;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const en = language === 'en';
  const { showToast } = useToast();
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [activeGroup, setActiveGroup] = useState(0);
  const [editingGroup, setEditingGroup] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [reload, setReload] = useState(0);
  const descriptions = groupDescriptions(en);
  const dirty = editingGroup !== null && !!saved && !!draft && JSON.stringify(saved.profile) !== JSON.stringify(draft);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void request<Snapshot>('/api/company-profile')
      .then(data => {
        if (active) {
          setSaved(data);
          setConflict(false);
        }
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
  }, [reload]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const openEdit = (index = activeGroup) => {
    if (!saved) return;
    setDraft(saved.profile);
    setConflict(false);
    setEditingGroup(index);
  };

  const closeEdit = () => {
    setEditingGroup(null);
    setDraft(null);
    setConflict(false);
    setDiscarding(false);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!saved || !draft || busy || !dirty) return;
    setBusy(true);
    try {
      const result = await request<Snapshot>('/api/company-profile', {
        method: 'PUT',
        json: { version: saved.version, profile: draft },
      });
      setSaved(result);
      closeEdit();
      showToast(en ? 'Company profile saved.' : 'Perfil de empresa guardado.', 'success');
    } catch (error) {
      const stale = (error as Error & { status?: number }).status === 409;
      setConflict(stale);
      showToast(
        stale
          ? en
            ? 'The profile changed in another session. Copy your edits before refreshing.'
            : 'El perfil cambió en otra sesión. Copia tus cambios antes de actualizar.'
          : en
            ? 'Could not save the profile.'
            : 'No se pudo guardar el perfil.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const currentGroup = editingGroup !== null ? groups[editingGroup] : null;
  const isImagesTab = activeGroup === groups.length;

  return (
    <section className="web-company-section">
      <div className="web-secop-heading web-company-heading">
        <div>
          <h2>{en ? 'Company profile & corporate information' : 'Datos y perfil de la empresa'}</h2>
          <p>{en ? 'Maintain the information used in your company profile.' : 'Mantén los datos del perfil de tu empresa.'}</p>
        </div>
        <div className="web-inline">
          {!isImagesTab && (
            <Button icon={Pencil} type="button" disabled={loading || failed || !saved} onClick={() => openEdit(activeGroup)}>
              {en ? 'Edit' : 'Editar'}
            </Button>
          )}
          <Button icon={RefreshCw} iconOnly variant="outline" size="sm" disabled={loading || busy} onClick={() => setReload(value => value + 1)}>
            {en ? 'Refresh profile' : 'Actualizar perfil'}
          </Button>
        </div>
      </div>
      {loading && <WebLoading message={en ? 'Loading profile…' : 'Cargando perfil…'} />}
      {failed && <p role="alert">{en ? 'Could not load the profile.' : 'No se pudo cargar el perfil.'}</p>}
      {!loading && saved && !failed && (
        <div className="web-company-profile web-stack">
          <p>
            {en
              ? 'All fields are optional. Your saved profile belongs to your account.'
              : 'Todos los campos son opcionales. El perfil guardado pertenece a tu cuenta.'}
          </p>
          <Tabs value={String(activeGroup)} onValueChange={value => setActiveGroup(Number(value))}>
            <TabsList
              aria-label={en ? 'Profile sections' : 'Secciones del perfil'}
              className="h-auto max-w-full flex-wrap justify-start"
            >
              {groups.map((group, index) => (
                <TabsTrigger key={group.es} value={String(index)}>
                  {en ? group.en : group.es}
                </TabsTrigger>
              ))}
              <TabsTrigger value={String(groups.length)}>
                {en ? 'Company images' : 'Imágenes de la empresa'}
              </TabsTrigger>
            </TabsList>
            {groups.map((group, index) => (
              <TabsContent key={group.es} value={String(index)} forceMount hidden={index !== activeGroup}>
                <section className="web-company-profile-panel">
                  <h3>{en ? group.en : group.es}</h3>
                  <p>{descriptions[index]}</p>
                  {group.es === 'Marca de agua' && (
                    <p className="web-notice">
                      {en
                        ? 'The preference is saved, but the watermark is not applied automatically in the web version yet.'
                        : 'La preferencia se guarda, pero la marca de agua aún no se aplica automáticamente en la versión web.'}
                    </p>
                  )}
                  <dl className="web-profile-readonly-grid">
                    {group.es === 'Marca de agua' && (
                      <div className="web-profile-readonly-item">
                        <dt>{en ? 'Watermark preference' : 'Preferencia de marca de agua'}</dt>
                        <dd>{saved.profile.watermarkEnabled ? (en ? 'Enabled' : 'Activada') : en ? 'Disabled' : 'Desactivada'}</dd>
                      </div>
                    )}
                    {group.fields.map(([field, esLabel, enLabel]) => {
                      const value = saved.profile[field]?.trim();
                      return (
                        <div key={field} className={longFields.has(field) ? 'web-profile-readonly-item web-profile-field-wide' : 'web-profile-readonly-item'}>
                          <dt>{en ? enLabel : esLabel}</dt>
                          <dd className={value ? undefined : 'web-profile-readonly-empty'}>{value || '—'}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              </TabsContent>
            ))}
            <TabsContent value={String(groups.length)}>
              <section className="web-company-profile-panel">
                <WebCompanyProfileImages language={language} embedded />
              </section>
            </TabsContent>
          </Tabs>
        </div>
      )}

      <Sheet
        open={editingGroup !== null && !!draft}
        onOpenChange={open => {
          if (!open && !busy) {
            if (dirty) setDiscarding(true);
            else closeEdit();
          }
        }}
      >
        <SheetContent side="right" className="web-admin-sheet">
          {currentGroup && editingGroup !== null && (
            <SheetHeader>
              <SheetTitle>{en ? `Edit ${currentGroup.en.toLowerCase()}` : `Editar ${currentGroup.es.toLowerCase()}`}</SheetTitle>
              <SheetDescription>{descriptions[editingGroup]}</SheetDescription>
            </SheetHeader>
          )}
          {conflict && (
            <p className="web-admin-field-error" role="alert">
              {en
                ? 'The saved profile changed. Copy your changes, cancel, and refresh to load the current version.'
                : 'El perfil guardado cambió. Copia tus cambios, cancela y actualiza para cargar la versión actual.'}
            </p>
          )}
          {editingGroup !== null && draft && (
            <CompanyProfileForm
              profile={draft}
              language={language}
              dirty={dirty}
              busy={busy}
              activeGroup={editingGroup}
              onChange={setDraft}
              onSave={event => void save(event)}
              onCancel={() => (dirty ? setDiscarding(true) : closeEdit())}
            />
          )}
        </SheetContent>
      </Sheet>

      <AppDialog
        open={discarding}
        onOpenChange={open => {
          if (!open && !busy) setDiscarding(false);
        }}
        title={en ? 'Discard changes?' : '¿Descartar cambios?'}
        description={en ? 'Your unsaved edits will be lost.' : 'Se perderán los cambios sin guardar.'}
        actions={
          <>
            <Button variant="outline" disabled={busy} onClick={() => setDiscarding(false)}>
              {en ? 'Keep editing' : 'Seguir editando'}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={closeEdit}>
              {en ? 'Discard' : 'Descartar'}
            </Button>
          </>
        }
      />
    </section>
  );
}
