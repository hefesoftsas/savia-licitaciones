import { Award, BriefcaseBusiness, Building2, CheckCircle2, FileBadge2, Loader2, Sparkles, Square, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Checkbox } from '@/shared/ui/primitives/checkbox';
import { useToast } from '@/shared/ui/ToastProvider';
import type { ProcurementMarket } from '@/shared/types/secop';
import { request } from './api.mjs';
import { WebDocumentDropZone } from './WebDocumentDropZone';
import { WebJobProgress } from './WebJobProgress';
import { emptyCompanyProfile } from './WebCompanyProfile';

type Language = 'es' | 'en';
type CompanyTab = 'company-profile' | 'company-experience' | 'company-certificates' | 'rup';

const PROFILE_LABELS: Record<string, [string, string]> = {
  companyName: ['Nombre de la empresa', 'Company name'],
  unifiedSocialCreditCode: ['Identificación tributaria o NIT/CIF', 'Tax ID or registration code'],
  phone: ['Teléfono', 'Phone'],
  email: ['Correo electrónico', 'Email'],
  legalRepresentative: ['Representante legal', 'Legal representative'],
  registeredCapital: ['Capital registrado', 'Registered capital'],
  operatingPeriodStart: ['Inicio de operaciones', 'Operating from'],
  operatingPeriodEnd: ['Fin de operaciones', 'Operating until'],
  address: ['Dirección', 'Address'],
  industry: ['Sector', 'Industry'],
  companyType: ['Tipo de empresa', 'Company type'],
  insuredEmployeeCount: ['Personal asegurado', 'Insured employees'],
  businessScope: ['Actividad económica', 'Business activity'],
  companyIntro: ['Presentación de la empresa', 'Company overview'],
  bidBenchmarks: ['Referencias financieras y capacidad', 'Bid benchmarks & turnover'],
  taxCertificateDate: ['Fecha del certificado tributario', 'Tax certificate date'],
  taxCertificateNote: ['Nota tributaria', 'Tax certificate note'],
  auditReportDate: ['Fecha de auditoría', 'Audit report date'],
  auditReportNote: ['Nota de auditoría', 'Audit report note'],
  socialSecurityCertificateDate: ['Fecha seg. social', 'Social security date'],
  socialSecurityCertificateNote: ['Nota seg. social', 'Social security note'],
  bankAccountName: ['Titular de la cuenta', 'Account holder'],
  bankAccountNumber: ['Número de cuenta', 'Account number'],
  bankName: ['Banco', 'Bank'],
  bankRoutingNumber: ['Código bancario', 'Bank routing code'],
  watermarkContent: ['Marca de agua', 'Watermark text'],
};

const EXP_TYPE_LABELS: Record<string, [string, string]> = {
  service: ['Servicios', 'Services'],
  goods: ['Bienes', 'Goods'],
  construction: ['Obras', 'Construction'],
};

type ExtractedExperience = {
  projectName: string;
  projectNumber: string;
  customerName: string;
  projectType: '' | 'service' | 'goods' | 'construction';
  projectManager: string;
  contractAmount: string;
  startDate: string;
  endDate: string;
  projectStatus: string;
  introduction: string;
};

type ExtractedCertificate = {
  name: string;
  number: string;
  validityMode: '' | 'range' | 'long-term';
  validFrom: string;
  validTo: string;
};

type ExtractedRupFact = {
  label: string;
  value: string;
  page: number;
  sourceFileName?: string;
};

type DossierJob = {
  id: string;
  state: string;
  progress?: string | null;
  createdAt: string;
  result: {
    summary?: string;
    profile?: Record<string, string>;
    experiences?: ExtractedExperience[];
    certificates?: ExtractedCertificate[];
    rupFacts?: ExtractedRupFact[];
    sourceNames?: string[];
    unreadableSources?: { id: string; fileName: string; reason?: string }[];
    message?: string;
  } | null;
};

type ExistingExperience = ExtractedExperience & { id: string };
type ExistingCertificate = ExtractedCertificate & { id: string };
type RupCertificate = { id: string; name: string; pages: number; issuedOn: string };
type RupFact = { id: string; label: string; value: string; page: number };

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export function WebCompanyAutopilot({
  language,
  market,
  credentials,
  onOpenTab,
}: {
  language: Language;
  market: ProcurementMarket;
  credentials: { id: string; provider: string; model: string }[];
  onOpenTab: (tab: CompanyTab) => void;
}) {
  const en = language === 'en';
  const { showToast } = useToast();
  const credentialId = credentials[0]?.id || 'local-runner';
  const rupLabel = market === 'ES' ? 'ROLECE / DEUC' : market === 'CO' ? 'RUP' : 'RUP / ROLECE';

  const [loadingState, setLoadingState] = useState(true);
  const [profileSnapshot, setProfileSnapshot] = useState<{ profile: ReturnType<typeof emptyCompanyProfile> & Record<string, string | boolean>; version: number } | null>(null);
  const [experiences, setExperiences] = useState<ExistingExperience[]>([]);
  const [certificates, setCertificates] = useState<ExistingCertificate[]>([]);
  const [rupInfo, setRupInfo] = useState<{ certificate: RupCertificate | null; version: number }>({ certificate: null, version: 0 });
  const [rupFacts, setRupFacts] = useState<RupFact[]>([]);
  const [jobs, setJobs] = useState<DossierJob[]>([]);

  const [queuedFiles, setQueuedFiles] = useState<{ localId: string; file: File }[]>([]);
  const [rupPdfFile, setRupPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);

  const [selectedProfileKeys, setSelectedProfileKeys] = useState<string[]>([]);
  const [selectedExpIndices, setSelectedExpIndices] = useState<number[]>([]);
  const [selectedCertIndices, setSelectedCertIndices] = useState<number[]>([]);
  const [selectedRupIndices, setSelectedRupIndices] = useState<number[]>([]);

  const initializedJobRef = useRef('');
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadAccountDossier = useCallback(async () => {
    const [prof, exp, cert, rupCert, facts, jobList] = await Promise.all([
      request<{ profile: ReturnType<typeof emptyCompanyProfile>; version: number }>('/api/company-profile'),
      request<{ projects: ExistingExperience[] }>('/api/company-experience'),
      request<{ certificates: ExistingCertificate[] }>('/api/company-certificates'),
      request<{ certificate: RupCertificate | null; version: number }>('/api/rup/certificate'),
      request<{ facts: RupFact[] }>('/api/rup/facts'),
      request<{ jobs: DossierJob[] }>('/api/company-dossier/analyses'),
    ]);
    if (!mountedRef.current) return;
    setProfileSnapshot(prof);
    setExperiences(exp.projects || []);
    setCertificates(cert.certificates || []);
    setRupInfo(rupCert);
    setRupFacts(facts.facts || []);
    setJobs(jobList.jobs || []);
  }, []);

  const refreshJobsOnly = useCallback(async () => {
    const jobList = await request<{ jobs: DossierJob[] }>('/api/company-dossier/analyses');
    if (mountedRef.current) setJobs(jobList.jobs || []);
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingState(true);
    void loadAccountDossier()
      .catch(() => {
        if (active) showToast(en ? 'Could not load company dossier state.' : 'No se pudo cargar el expediente de empresa.', 'error');
      })
      .finally(() => {
        if (active) setLoadingState(false);
      });
    return () => {
      active = false;
    };
  }, [loadAccountDossier, en, showToast]);

  const activeJob = jobs.find(job => ['queued', 'running'].includes(job.state)) || null;
  const latestSucceededJob = jobs.find(job => job.state === 'succeeded' && job.result) || null;
  const latestJob = jobs[0] || null;

  useEffect(() => {
    if (!activeJob) return;
    const timer = window.setInterval(() => {
      void refreshJobsOnly().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeJob?.id, refreshJobsOnly]);

  const existingExpKeys = useMemo(
    () => new Set(experiences.map(item => `${norm(item.projectName)}|${norm(item.projectNumber || '')}`)),
    [experiences],
  );
  const existingCertKeys = useMemo(
    () => new Set(certificates.map(item => `${norm(item.name)}|${norm(item.number || '')}`)),
    [certificates],
  );
  const existingRupKeys = useMemo(
    () => new Set(rupFacts.map(item => `${norm(item.label)}|${norm(item.value)}`)),
    [rupFacts],
  );

  useEffect(() => {
    if (!latestSucceededJob || !latestSucceededJob.result || initializedJobRef.current === latestSucceededJob.id) return;
    initializedJobRef.current = latestSucceededJob.id;
    const res = latestSucceededJob.result;
    const profEntries = Object.entries(res.profile || {}).filter(([, val]) => typeof val === 'string' && val.trim());
    setSelectedProfileKeys(
      profEntries
        .filter(([key, val]) => {
          const cur = String((profileSnapshot?.profile as Record<string, unknown> | undefined)?.[key] || '').trim();
          return !cur && Boolean(val.trim());
        })
        .map(([key]) => key),
    );
    setSelectedExpIndices(
      (res.experiences || [])
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => !existingExpKeys.has(`${norm(item.projectName)}|${norm(item.projectNumber || '')}`))
        .map(({ idx }) => idx),
    );
    setSelectedCertIndices(
      (res.certificates || [])
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => !existingCertKeys.has(`${norm(item.name)}|${norm(item.number || '')}`))
        .map(({ idx }) => idx),
    );
    setSelectedRupIndices(
      (res.rupFacts || [])
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => !existingRupKeys.has(`${norm(item.label)}|${norm(item.value)}`))
        .map(({ idx }) => idx),
    );
  }, [latestSucceededJob?.id, profileSnapshot, existingExpKeys, existingCertKeys, existingRupKeys]);

  const addFiles = (incoming: File[]) => {
    const valid = incoming.filter(
      file =>
        /\.(pdf|docx?|xlsx?|txt|md|markdown)$/i.test(file.name) &&
        file.size > 0 &&
        file.size <= 25 * 1024 * 1024,
    );
    const rejected = incoming.length - valid.length;
    if (rejected > 0) {
      showToast(
        en
          ? `${rejected} file(s) skipped (supported: PDF, Word, Excel, TXT/MD up to 25 MB).`
          : `${rejected} archivo(s) omitido(s) (admitidos: PDF, Word, Excel, TXT/MD hasta 25 MB).`,
        'info',
      );
    }
    if (!valid.length) return;
    setQueuedFiles(current => {
      const next = [...current];
      for (const file of valid) {
        if (next.length >= 15) break;
        if (!next.some(item => item.file.name === file.name && item.file.size === file.size)) {
          next.push({ localId: crypto.randomUUID(), file });
        }
      }
      return next;
    });
    if (!rupPdfFile && !rupInfo.certificate) {
      const likelyRup = valid.find(file => /\.pdf$/i.test(file.name) && /rup|rolece|deuc|camara/i.test(file.name));
      if (likelyRup) setRupPdfFile(likelyRup);
    }
  };

  const handleAnalyze = async () => {
    if (uploading || applying || activeJob || !queuedFiles.length) return;
    setUploading(true);
    try {
      const sourceIds: string[] = [];
      const sourceNames: Record<string, string> = {};
      for (const entry of queuedFiles) {
        const res = await request<{ source: { id: string; fileName: string } }>('/api/company-dossier/uploads', {
          method: 'POST',
          headers: {
            'x-file-name': encodeURIComponent(entry.file.name),
            'content-type': entry.file.type || 'application/octet-stream',
          },
          body: entry.file,
        });
        sourceIds.push(res.source.id);
        sourceNames[res.source.id] = entry.file.name;
      }

      await request('/api/company-dossier/analyses', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        json: {
          sourceIds,
          sourceNames,
          language,
          market,
          credentialId,
          dataProcessingConsent: true,
        },
      });
      await refreshJobsOnly();
      showToast(en ? 'Company dossier analysis queued.' : 'Análisis del expediente en cola para el runner.', 'success');
    } catch {
      showToast(en ? 'Could not upload or queue dossier analysis.' : 'No se pudo subir o iniciar el análisis del expediente.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      await request(`/api/company-dossier/analyses/${encodeURIComponent(jobId)}/cancel`, { method: 'POST', json: {} });
      await refreshJobsOnly();
      showToast(en ? 'Analysis cancelled.' : 'Análisis cancelado.', 'info');
    } catch {
      showToast(en ? 'Could not cancel the analysis.' : 'No se pudo cancelar el análisis.', 'error');
    }
  };

  const handleRupPdfPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.currentTarget.files?.[0] || null;
    event.currentTarget.value = '';
    if (!picked) return;
    if (!/\.pdf$/i.test(picked.name) || picked.size <= 0 || picked.size > 25 * 1024 * 1024) {
      showToast(en ? 'Select a valid PDF file under 25 MB.' : 'Selecciona un archivo PDF válido de hasta 25 MB.', 'error');
      return;
    }
    setRupPdfFile(picked);
  };

  const applyExtracted = async () => {
    if (!latestSucceededJob?.result || !profileSnapshot || applying) return;
    const res = latestSucceededJob.result;
    setApplying(true);
    let savedProfileCount = 0;
    let savedExpCount = 0;
    let savedCertCount = 0;
    let savedRupCount = 0;
    let partialFailures = 0;

    try {
      if (selectedProfileKeys.length > 0) {
        const mergedProfile: Record<string, string | boolean> = {
          ...emptyCompanyProfile(),
          ...profileSnapshot.profile,
        };
        for (const key of selectedProfileKeys) {
          const val = res.profile?.[key];
          if (typeof val === 'string' && val.trim()) {
            mergedProfile[key] = key === 'bidBenchmarks' ? val.trim().slice(0, 4000) : val.trim();
            savedProfileCount += 1;
          }
        }
        if (savedProfileCount > 0) {
          await request('/api/company-profile', {
            method: 'PUT',
            json: { version: profileSnapshot.version, profile: mergedProfile },
          });
        }
      }

      for (const idx of selectedExpIndices) {
        const item = res.experiences?.[idx];
        if (!item) continue;
        try {
          await request('/api/company-experience', {
            method: 'POST',
            json: {
              projectName: item.projectName || '',
              projectNumber: item.projectNumber || '',
              customerName: item.customerName || '',
              projectType: item.projectType || '',
              projectManager: item.projectManager || '',
              contractAmount: item.contractAmount || '',
              startDate: item.startDate || '',
              endDate: item.endDate || '',
              projectStatus: item.projectStatus || '',
              introduction: item.introduction || '',
            },
          });
          savedExpCount += 1;
        } catch {
          partialFailures += 1;
        }
      }

      for (const idx of selectedCertIndices) {
        const item = res.certificates?.[idx];
        if (!item) continue;
        try {
          await request('/api/company-certificates', {
            method: 'POST',
            json: {
              name: item.name || '',
              number: item.number || '',
              validityMode: item.validityMode || '',
              validFrom: item.validFrom || '',
              validTo: item.validTo || '',
            },
          });
          savedCertCount += 1;
        } catch {
          partialFailures += 1;
        }
      }

      if (selectedRupIndices.length > 0 && (rupPdfFile || rupInfo.certificate)) {
        let certId = rupInfo.certificate?.id || '';
        let certPages = rupInfo.certificate?.pages || 1;
        let certVersion = rupInfo.version;

        if (rupPdfFile && (!rupInfo.certificate || rupPdfFile.name !== rupInfo.certificate.name)) {
          const uploadRes = await fetch('/api/rup/certificate', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: {
              'content-type': 'application/pdf',
              'x-file-name': encodeURIComponent(rupPdfFile.name),
              'x-rup-version': String(rupInfo.version),
            },
            body: rupPdfFile,
          });
          if (!uploadRes.ok) throw new Error('rup_upload_failed');
          const uploaded = (await uploadRes.json()) as { certificate: RupCertificate; version: number };
          certId = uploaded.certificate.id;
          certPages = uploaded.certificate.pages;
          certVersion = uploaded.version;
        }

        if (certId) {
          for (const idx of selectedRupIndices) {
            const fact = res.rupFacts?.[idx];
            if (!fact) continue;
            try {
              await request('/api/rup/facts', {
                method: 'POST',
                json: {
                  certificateId: certId,
                  certificateVersion: certVersion,
                  label: fact.label,
                  value: fact.value,
                  page: Math.min(Math.max(1, fact.page || 1), Math.max(1, certPages)),
                },
              });
              savedRupCount += 1;
            } catch {
              partialFailures += 1;
            }
          }
        }
      }

      await loadAccountDossier();
      setAppliedJobIds(current => [...new Set([...current, latestSucceededJob.id])]);
      showToast(
        en
          ? `Saved: ${savedProfileCount} profile fields, ${savedExpCount} contracts, ${savedCertCount} certificates, ${savedRupCount} accreditation facts.`
          : `Guardado: ${savedProfileCount} campo(s) de perfil, ${savedExpCount} experiencia(s), ${savedCertCount} certificado(s), ${savedRupCount} dato(s) RUP.${partialFailures ? ` (${partialFailures} no se pudieron guardar)` : ''}`,
        partialFailures ? 'info' : 'success',
      );
    } catch {
      showToast(
        en ? 'Could not save all selected dossier items.' : 'No se pudo completar el guardado en el expediente.',
        'error',
      );
    } finally {
      setApplying(false);
    }
  };

  const filledProfileCount = profileSnapshot
    ? Object.entries(profileSnapshot.profile).filter(([key, val]) => key !== 'watermarkEnabled' && typeof val === 'string' && val.trim()).length
    : 0;

  const extractedProfileEntries = Object.entries(latestSucceededJob?.result?.profile || {}).filter(
    ([key, val]) => typeof val === 'string' && val.trim() && key in PROFILE_LABELS,
  );
  const extractedExps = latestSucceededJob?.result?.experiences || [];
  const extractedCerts = latestSucceededJob?.result?.certificates || [];
  const extractedRupFacts = latestSucceededJob?.result?.rupFacts || [];
  const canSaveRupFacts = Boolean(rupInfo.certificate || rupPdfFile);
  const effectiveRupSelectedCount = canSaveRupFacts ? selectedRupIndices.length : 0;
  const totalSelectedToApply =
    selectedProfileKeys.length + selectedExpIndices.length + selectedCertIndices.length + effectiveRupSelectedCount;

  const alreadyApplied = Boolean(latestSucceededJob && appliedJobIds.includes(latestSucceededJob.id));

  return (
    <div className="web-module-autopilot">
      <div className="web-autopilot-kpi-strip" aria-label={en ? 'Current company dossier' : 'Estado actual del expediente'}>
        <button type="button" className="web-autopilot-kpi is-interactive" onClick={() => onOpenTab('company-profile')}>
          <span>
            <Building2 size={14} aria-hidden="true" /> {en ? 'Profile' : 'Perfil'}
          </span>
          <strong>
            {loadingState ? '…' : filledProfileCount} {en ? 'fields' : 'campos'}
          </strong>
          <small>{String((profileSnapshot?.profile as Record<string, unknown> | undefined)?.companyName || '') || (en ? 'Edit in advanced view' : 'Ver / editar en detalle')}</small>
        </button>

        <button type="button" className="web-autopilot-kpi is-interactive" onClick={() => onOpenTab('company-experience')}>
          <span>
            <BriefcaseBusiness size={14} aria-hidden="true" /> {en ? 'Experience' : 'Experiencia'}
          </span>
          <strong>
            {loadingState ? '…' : experiences.length} {en ? 'contracts' : 'contratos'}
          </strong>
          <small>{en ? 'Review contracts' : 'Gestionar contratos'}</small>
        </button>

        <button type="button" className="web-autopilot-kpi is-interactive" onClick={() => onOpenTab('company-certificates')}>
          <span>
            <Award size={14} aria-hidden="true" /> {en ? 'Certificates' : 'Certificados'}
          </span>
          <strong>
            {loadingState ? '…' : certificates.length} {en ? 'saved' : 'registrados'}
          </strong>
          <small>{en ? 'Review expiry dates' : 'Gestionar vigencias'}</small>
        </button>

        <button type="button" className="web-autopilot-kpi is-interactive" onClick={() => onOpenTab('rup')}>
          <span>
            <FileBadge2 size={14} aria-hidden="true" /> {rupLabel}
          </span>
          <strong>
            {loadingState ? '…' : rupFacts.length} {en ? 'facts' : 'datos'}
          </strong>
          <small>{rupInfo.certificate ? rupInfo.certificate.name : en ? 'No PDF yet' : 'Sin PDF cargado'}</small>
        </button>
      </div>

      <section className="web-review-autopilot-card">
        <div className="web-autopilot-card-header">
          <div className="web-autopilot-card-title">
            <span className="web-draft-step-number">1</span>
            <div>
              <h2>{en ? 'Upload company documents for automatic extraction' : 'Sube tus documentos corporativos para extraer datos'}</h2>
              <p className="web-review-hint">
                {en
                  ? `Drop your ${rupLabel}, ISO/quality certificates, past contracts, financial statements, or corporate brochure (up to 15 files, 25 MB each).`
                  : `Arrastra tu ${rupLabel}, certificados ISO, balances, contratos anteriores o presentación corporativa (hasta 15 archivos, 25 MB c/u).`}
              </p>
            </div>
          </div>
          {queuedFiles.length > 0 && (
            <span className="web-review-status-pill" data-state="succeeded">
              {queuedFiles.length}/15 {en ? 'ready' : 'listos'}
            </span>
          )}
        </div>

        <WebDocumentDropZone
          language={language}
          disabled={uploading || applying || Boolean(activeJob)}
          label={en ? 'Select files' : 'Elegir archivos'}
          onFiles={addFiles}
        />

        {queuedFiles.length > 0 && (
          <div className="web-autopilot-list">
            {queuedFiles.map(entry => {
              const isPdf = /\.pdf$/i.test(entry.file.name);
              const isChosenRup = Boolean(rupPdfFile && rupPdfFile.name === entry.file.name && rupPdfFile.size === entry.file.size);
              return (
                <div key={entry.localId} className="web-autopilot-item-row">
                  <div className="web-autopilot-item-body">
                    <strong>{entry.file.name}</strong>
                    <small className="web-review-hint">{(entry.file.size / 1024).toFixed(0)} KB</small>
                  </div>
                  <div className="web-inline">
                    {isPdf && (
                      <label className="web-consent">
                        <input
                          type="checkbox"
                          checked={isChosenRup}
                          disabled={uploading || applying || Boolean(activeJob)}
                          onChange={event => setRupPdfFile(event.target.checked ? entry.file : null)}
                        />
                        {en ? `Also save as active ${rupLabel}` : `Guardar como ${rupLabel} vigente`}
                      </label>
                    )}
                    <Button
                      icon={Trash2}
                      iconOnly
                      size="sm"
                      variant="ghost"
                      disabled={uploading || applying || Boolean(activeJob)}
                      onClick={() => {
                        setQueuedFiles(current => current.filter(item => item.localId !== entry.localId));
                        if (isChosenRup) setRupPdfFile(null);
                      }}
                    >
                      {en ? `Remove ${entry.file.name}` : `Quitar ${entry.file.name}`}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="web-inline">
          <Button
            icon={Sparkles}
            disabled={uploading || applying || Boolean(activeJob) || !queuedFiles.length}
            onClick={() => void handleAnalyze()}
          >
            {uploading
              ? en
                ? 'Uploading files…'
                : 'Subiendo archivos…'
              : activeJob
                ? en
                  ? 'Analyzing company dossier…'
                  : 'Analizando expediente…'
                : en
                  ? 'Analyze dossier with autopilot'
                  : 'Analizar expediente en piloto automático'}
          </Button>
          {activeJob && (
            <Button icon={Square} size="sm" variant="outline" onClick={() => void handleCancel(activeJob.id)}>
              {en ? 'Cancel analysis' : 'Cancelar análisis'}
            </Button>
          )}
        </div>

        {activeJob && (
          <div className="web-autopilot-progress-panel" role="status">
            <div className="web-inline">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              <span>{en ? 'Reading documents (including local OCR when needed)…' : 'Leyendo documentos (con OCR local si hace falta)…'}</span>
            </div>
            <WebJobProgress state={activeJob.state} progress={activeJob.progress} language={language} />
          </div>
        )}

        {latestJob && !activeJob && latestJob.state !== 'succeeded' && latestJob.result?.message && (
          <p className="web-review-hint" role="alert">
            {latestJob.result.message}
          </p>
        )}
      </section>

      {latestSucceededJob?.result && (
        <section className="web-review-autopilot-card">
          <div className="web-autopilot-card-header">
            <div className="web-autopilot-card-title">
              <span className="web-draft-step-number">2</span>
              <div>
                <h2>{en ? 'Extracted summary — review & save in one click' : 'Resumen extraído para confirmar con un clic'}</h2>
                <p className="web-review-hint">
                  {latestSucceededJob.result.summary ||
                    (en
                      ? 'Select which extracted items to save. Existing profile values remain unchecked by default so nothing is overwritten accidentally.'
                      : 'Marca los datos que deseas incorporar. Los campos que ya tienen un valor distinto quedan sin marcar por seguridad.')}
                </p>
              </div>
            </div>
            {alreadyApplied && (
              <span className="web-review-status-pill" data-state="succeeded">
                <CheckCircle2 size={13} aria-hidden="true" />
                {en ? 'Saved' : 'Aplicado'}
              </span>
            )}
          </div>

          {!!latestSucceededJob.result.unreadableSources?.length && (
            <p className="web-review-hint" role="status">
              {en ? 'Unreadable files skipped:' : 'Archivos sin texto legible omitidos:'}{' '}
              {latestSucceededJob.result.unreadableSources.map(item => item.fileName).join(', ')}
            </p>
          )}

          {extractedProfileEntries.length > 0 && (
            <div className="web-stack">
              <div className="web-autopilot-card-header">
                <strong>
                  {en ? `Company profile (${extractedProfileEntries.length})` : `Datos y perfil de empresa (${extractedProfileEntries.length})`}
                </strong>
                <div className="web-inline">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedProfileKeys(extractedProfileEntries.map(([key]) => key))}
                  >
                    {en ? 'Select all' : 'Marcar todos'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedProfileKeys([])}>
                    {en ? 'None' : 'Ninguno'}
                  </Button>
                </div>
              </div>
              <div className="web-autopilot-list">
                {extractedProfileEntries.map(([key, value]) => {
                  const currentVal = String((profileSnapshot?.profile as Record<string, unknown> | undefined)?.[key] || '').trim();
                  const same = currentVal === value.trim();
                  const checked = !same && selectedProfileKeys.includes(key);
                  return (
                    <div key={key} className="web-autopilot-item-row">
                      <Checkbox
                        checked={checked}
                        disabled={same || applying}
                        aria-label={PROFILE_LABELS[key][en ? 1 : 0]}
                        onCheckedChange={next =>
                          setSelectedProfileKeys(current =>
                            next === true ? [...new Set([...current, key])] : current.filter(item => item !== key),
                          )
                        }
                      />
                      <div className="web-autopilot-item-body">
                        <div className="web-inline">
                          <strong>{PROFILE_LABELS[key][en ? 1 : 0]}</strong>
                          {same ? (
                            <span className="web-review-status-pill">{en ? 'Matches saved' : 'Ya guardado'}</span>
                          ) : currentVal ? (
                            <span className="web-autopilot-diff-tag">
                              {en ? `Current: ${currentVal}` : `Actual: ${currentVal}`}
                            </span>
                          ) : (
                            <span className="web-review-status-pill" data-state="succeeded">
                              {en ? 'New' : 'Nuevo'}
                            </span>
                          )}
                        </div>
                        <small>{value}</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {extractedExps.length > 0 && (
            <div className="web-stack">
              <div className="web-autopilot-card-header">
                <strong>
                  {en ? `Contract experience (${extractedExps.length})` : `Experiencia contractual (${extractedExps.length})`}
                </strong>
                <div className="web-inline">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedExpIndices(extractedExps.map((_, idx) => idx))}
                  >
                    {en ? 'Select all' : 'Marcar todos'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedExpIndices([])}>
                    {en ? 'None' : 'Ninguno'}
                  </Button>
                </div>
              </div>
              <div className="web-autopilot-list">
                {extractedExps.map((item, idx) => {
                  const exists = existingExpKeys.has(`${norm(item.projectName)}|${norm(item.projectNumber || '')}`);
                  const typeText = EXP_TYPE_LABELS[item.projectType]?.[en ? 1 : 0] || item.projectType;
                  return (
                    <div key={`${item.projectName}-${idx}`} className="web-autopilot-item-row">
                      <Checkbox
                        checked={selectedExpIndices.includes(idx)}
                        disabled={applying}
                        aria-label={item.projectName}
                        onCheckedChange={next =>
                          setSelectedExpIndices(current =>
                            next === true ? [...new Set([...current, idx])] : current.filter(i => i !== idx),
                          )
                        }
                      />
                      <div className="web-autopilot-item-body">
                        <div className="web-inline">
                          <strong>{item.projectName}</strong>
                          {typeText && <span className="web-review-status-pill">{typeText}</span>}
                          {exists && <span className="web-autopilot-diff-tag">{en ? 'Similar record exists' : 'Ya registrada'}</span>}
                        </div>
                        <small className="web-review-hint">
                          {[item.projectNumber, item.customerName, item.contractAmount, [item.startDate, item.endDate].filter(Boolean).join(' – ')]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {extractedCerts.length > 0 && (
            <div className="web-stack">
              <div className="web-autopilot-card-header">
                <strong>
                  {en ? `Certificates & validity dates (${extractedCerts.length})` : `Certificados y vigencias (${extractedCerts.length})`}
                </strong>
                <div className="web-inline">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedCertIndices(extractedCerts.map((_, idx) => idx))}
                  >
                    {en ? 'Select all' : 'Marcar todos'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedCertIndices([])}>
                    {en ? 'None' : 'Ninguno'}
                  </Button>
                </div>
              </div>
              <div className="web-autopilot-list">
                {extractedCerts.map((item, idx) => {
                  const exists = existingCertKeys.has(`${norm(item.name)}|${norm(item.number || '')}`);
                  const validityText =
                    item.validityMode === 'long-term'
                      ? en
                        ? 'No expiry'
                        : 'Sin vencimiento'
                      : item.validityMode === 'range'
                        ? [item.validFrom, item.validTo].filter(Boolean).join(' – ')
                        : en
                          ? 'Unspecified validity'
                          : 'Vigencia sin especificar';
                  return (
                    <div key={`${item.name}-${idx}`} className="web-autopilot-item-row">
                      <Checkbox
                        checked={selectedCertIndices.includes(idx)}
                        disabled={applying}
                        aria-label={item.name}
                        onCheckedChange={next =>
                          setSelectedCertIndices(current =>
                            next === true ? [...new Set([...current, idx])] : current.filter(i => i !== idx),
                          )
                        }
                      />
                      <div className="web-autopilot-item-body">
                        <div className="web-inline">
                          <strong>{item.name}</strong>
                          <span className="web-review-status-pill">{validityText}</span>
                          {exists && <span className="web-autopilot-diff-tag">{en ? 'Similar exists' : 'Ya registrado'}</span>}
                        </div>
                        {item.number && <small className="web-review-hint">{item.number}</small>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {extractedRupFacts.length > 0 && (
            <div className="web-stack">
              <div className="web-autopilot-card-header">
                <strong>
                  {rupLabel} ({extractedRupFacts.length})
                </strong>
                <div className="web-inline">
                  {!canSaveRupFacts && (
                    <label className="web-upload">
                      <Upload size={14} aria-hidden="true" />
                      {en ? `Attach ${rupLabel} PDF to save` : `Adjuntar PDF de ${rupLabel}`}
                      <input type="file" accept="application/pdf,.pdf" onChange={handleRupPdfPick} />
                    </label>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedRupIndices(extractedRupFacts.map((_, idx) => idx))}
                  >
                    {en ? 'Select all' : 'Marcar todos'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedRupIndices([])}>
                    {en ? 'None' : 'Ninguno'}
                  </Button>
                </div>
              </div>
              {!canSaveRupFacts && (
                <p className="web-review-hint">
                  {en
                    ? `To save ${rupLabel} metrics, either mark one of your uploaded PDFs above or attach the ${rupLabel} PDF here.`
                    : `Para guardar datos de ${rupLabel}, marca arriba el PDF correspondiente o adjúntalo aquí.`}
                </p>
              )}
              <div className="web-autopilot-list">
                {extractedRupFacts.map((item, idx) => {
                  const exists = existingRupKeys.has(`${norm(item.label)}|${norm(item.value)}`);
                  return (
                    <div key={`${item.label}-${idx}`} className="web-autopilot-item-row">
                      <Checkbox
                        checked={selectedRupIndices.includes(idx)}
                        disabled={applying}
                        aria-label={item.label}
                        onCheckedChange={next =>
                          setSelectedRupIndices(current =>
                            next === true ? [...new Set([...current, idx])] : current.filter(i => i !== idx),
                          )
                        }
                      />
                      <div className="web-autopilot-item-body">
                        <div className="web-inline">
                          <strong>{item.label}</strong>
                          <span className="web-review-status-pill">
                            {en ? `p. ${item.page}` : `pág. ${item.page}`}
                          </span>
                          {exists && <span className="web-autopilot-diff-tag">{en ? 'Already saved' : 'Ya registrado'}</span>}
                        </div>
                        <small>{item.value}</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="web-inline">
            <Button icon={CheckCircle2} disabled={applying || totalSelectedToApply === 0} onClick={() => void applyExtracted()}>
              {applying
                ? en
                  ? 'Saving to dossier…'
                  : 'Guardando en el expediente…'
                : en
                  ? `Confirm and save (${totalSelectedToApply})`
                  : `Confirmar y guardar en el expediente (${totalSelectedToApply})`}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
