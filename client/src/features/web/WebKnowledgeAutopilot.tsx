import { CheckCircle2, FolderOpen, FolderTree, Loader2, Search, Sparkles, Square, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import { WebDocumentDropZone } from './WebDocumentDropZone';
import { WebJobProgress } from './WebJobProgress';

type Language = 'es' | 'en';
type Folder = { id: string; name: string };
type Doc = { id: string; folderId: string; name: string; size: number; deleting: boolean; sourceAvailable: boolean };
type Entry = { title: string; summary: string; quote: string };
type AnalysisJob = { id: string; state: string; progress?: string | null; result: { entries?: Entry[]; discardedCount?: number; message?: string } | null };
type AnalysisSnapshot = { jobs: AnalysisJob[]; revision: number; sourceJobId: string | null; entries: Entry[] };

type TrackedDoc = {
  docId: string;
  docName: string;
  folderId: string;
  folderName: string;
  state: string;
  progress: string | null;
  revision: number;
  jobId: string | null;
  sourceJobId: string | null;
  entries: Entry[];
  message?: string;
};

type SearchEntry = { id: string; documentId: string; documentName: string; folderId: string; title: string; summary: string; quote: string };

const SUPPORTED_KNOWLEDGE_EXT = /\.(pdf|docx?|wps|xlsx?|txt|md|markdown)$/i;

function suggestFolderName(fileName: string, en: boolean): string {
  const lower = fileName.toLowerCase();
  if (/iso|cert|acred|homolog|solvenc|poliz|segur|rup|rolece|deuc|tax|fiscal|ss\b|seguridad/.test(lower)) {
    return en ? 'Certifications & compliance' : 'Certificaciones y cumplimiento';
  }
  if (/experienc|contrat|obra|proyect|referenc|caso|success|client|act[ae]/.test(lower)) {
    return en ? 'Experience & case studies' : 'Experiencia y casos de éxito';
  }
  if (/metodolog|tecnic|arquitect|manual|ficha|especif|plan|calidad|seguridad|proceso|soporte|anexo/.test(lower)) {
    return en ? 'Methodology & technical docs' : 'Metodología y documentación técnica';
  }
  return en ? 'Corporate documents' : 'Documentos corporativos';
}

export function WebKnowledgeAutopilot({
  language,
  credentials,
  folders,
  onLibraryChanged,
  onOpenAdvanced,
}: {
  language: Language;
  credentials: { id: string; provider: string; model: string }[];
  folders: Folder[];
  onLibraryChanged: () => void;
  onOpenAdvanced: (folderId?: string, documentId?: string) => void;
}) {
  const en = language === 'en';
  const { showToast } = useToast();
  const credentialId = credentials[0]?.id || 'local-runner';

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [targetMode, setTargetMode] = useState<'auto' | 'folder' | 'new'>('auto');
  const [selectedFolderId, setSelectedFolderId] = useState(folders[0]?.id || '');
  const [newFolderName, setNewFolderName] = useState('');
  const [autoAccept, setAutoAccept] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [scanningPending, setScanningPending] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);

  const [trackedDocs, setTrackedDocs] = useState<TrackedDoc[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchEntry[] | null>(null);
  const [searching, setSearching] = useState(false);

  const applyingKeysRef = useRef(new Set<string>());
  const autoAcceptRef = useRef(autoAccept);
  autoAcceptRef.current = autoAccept;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedFolderId && folders.length) setSelectedFolderId(folders[0].id);
  }, [folders, selectedFolderId]);

  const addFiles = (incoming: File[]) => {
    const valid = incoming.filter(
      file => SUPPORTED_KNOWLEDGE_EXT.test(file.name) && file.size > 0 && file.size <= 25 * 1024 * 1024,
    );
    if (valid.length < incoming.length) {
      showToast(
        en
          ? 'Some files were skipped (PDF, Word, Excel, TXT/MD up to 25 MB).'
          : 'Algunos archivos se omitieron (admitidos: PDF, Word, Excel, TXT/MD hasta 25 MB).',
        'info',
      );
    }
    if (!valid.length) return;
    setPendingFiles(current => {
      const next = [...current];
      for (const file of valid) {
        if (next.length >= 20) break;
        if (!next.some(item => item.name === file.name && item.size === file.size)) {
          next.push(file);
        }
      }
      return next;
    });
  };

  const applyOne = useCallback(
    async (docId: string, jobId: string, revision: number) => {
      const key = `${docId}:${jobId}`;
      if (applyingKeysRef.current.has(key)) return false;
      applyingKeysRef.current.add(key);
      try {
        await request(`/api/knowledge/documents/${encodeURIComponent(docId)}/analyses/${encodeURIComponent(jobId)}/apply`, {
          method: 'POST',
          json: { revision },
        });
        onLibraryChanged();
        return true;
      } catch {
        return false;
      } finally {
        applyingKeysRef.current.delete(key);
      }
    },
    [onLibraryChanged],
  );

  const pollTracked = useCallback(async () => {
    const currentList = trackedDocs;
    if (!currentList.length) return;
    const updates = await Promise.all(
      currentList.map(async item => {
        try {
          const snap = await request<AnalysisSnapshot>(
            `/api/knowledge/documents/${encodeURIComponent(item.docId)}/analyses`,
          );
          const latest = snap.jobs[0] || null;
          let sourceJobId = snap.sourceJobId;
          let revision = snap.revision;
          let entries = snap.entries.length ? snap.entries : latest?.result?.entries || [];

          if (
            autoAcceptRef.current &&
            latest?.state === 'succeeded' &&
            latest.result?.entries?.length &&
            sourceJobId !== latest.id
          ) {
            const ok = await applyOne(item.docId, latest.id, revision);
            if (ok) {
              sourceJobId = latest.id;
              revision += 1;
              entries = latest.result.entries;
            }
          }

          const resolvedState =
            sourceJobId && latest?.id === sourceJobId
              ? 'indexed'
              : latest?.state || item.state;

          return {
            ...item,
            state: resolvedState,
            progress: latest?.progress || null,
            revision,
            jobId: latest?.id || item.jobId,
            sourceJobId,
            entries,
            message: latest?.result?.message,
          } satisfies TrackedDoc;
        } catch {
          return item;
        }
      }),
    );
    if (mountedRef.current) setTrackedDocs(updates);
  }, [trackedDocs, applyOne]);

  const hasPendingWatch = trackedDocs.some(
    item => ['queued', 'running'].includes(item.state) || (autoAccept && item.state === 'succeeded' && item.sourceJobId !== item.jobId),
  );

  useEffect(() => {
    if (!hasPendingWatch) return;
    const timer = window.setInterval(() => {
      void pollTracked();
    }, 3500);
    return () => window.clearInterval(timer);
  }, [hasPendingWatch, pollTracked]);

  const handleUploadBatch = async () => {
    if (submitting || scanningPending || !pendingFiles.length) return;
    if (targetMode === 'folder' && !selectedFolderId) {
      showToast(en ? 'Select a target folder.' : 'Selecciona una carpeta de destino.', 'error');
      return;
    }
    if (targetMode === 'new' && !newFolderName.trim()) {
      showToast(en ? 'Enter a folder name.' : 'Escribe un nombre para la nueva carpeta.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const folderCache = new Map<string, Folder>(folders.map(f => [f.name.trim().toLowerCase(), f]));
      let fixedFolder: Folder | null =
        targetMode === 'folder' ? folders.find(f => f.id === selectedFolderId) || null : null;

      if (targetMode === 'new') {
        const name = newFolderName.trim();
        const existing = folderCache.get(name.toLowerCase());
        if (existing) fixedFolder = existing;
        else {
          const created = await request<{ folder: Folder }>('/api/knowledge/folders', { method: 'POST', json: { name } });
          folderCache.set(name.toLowerCase(), created.folder);
          fixedFolder = created.folder;
        }
      }

      const newlyTracked: TrackedDoc[] = [];
      let uploadedCount = 0;

      for (const file of pendingFiles) {
        let folder = fixedFolder;
        if (!folder) {
          const suggested = suggestFolderName(file.name, en);
          folder = folderCache.get(suggested.toLowerCase()) || null;
          if (!folder) {
            const created = await request<{ folder: Folder }>('/api/knowledge/folders', {
              method: 'POST',
              json: { name: suggested },
            });
            folderCache.set(suggested.toLowerCase(), created.folder);
            folder = created.folder;
          }
        }

        const docRes = await request<{ document: Doc }>(
          `/api/knowledge/folders/${encodeURIComponent(folder.id)}/documents`,
          {
            method: 'POST',
            headers: {
              'x-file-name': encodeURIComponent(file.name),
              'content-type': file.type || 'application/octet-stream',
            },
            body: file,
          },
        );
        uploadedCount += 1;

        const jobRes = await request<{ job: AnalysisJob }>(
          `/api/knowledge/documents/${encodeURIComponent(docRes.document.id)}/analyses`,
          {
            method: 'POST',
            headers: { 'idempotency-key': crypto.randomUUID() },
            json: { credentialId, language, dataProcessingConsent: true },
          },
        );

        newlyTracked.push({
          docId: docRes.document.id,
          docName: docRes.document.name,
          folderId: folder.id,
          folderName: folder.name,
          state: jobRes.job.state,
          progress: null,
          revision: 0,
          jobId: jobRes.job.id,
          sourceJobId: null,
          entries: [],
        });
      }

      setTrackedDocs(current => [
        ...newlyTracked,
        ...current.filter(item => !newlyTracked.some(added => added.docId === item.docId)),
      ]);
      setPendingFiles([]);
      if (targetMode === 'new') setNewFolderName('');
      onLibraryChanged();
      showToast(
        en
          ? `${uploadedCount} document(s) uploaded and queued for analysis.`
          : `${uploadedCount} documento(s) subido(s) y enviado(s) a análisis.`,
        'success',
      );
    } catch {
      showToast(en ? 'Could not upload and queue all documents.' : 'No se pudieron subir o encolar todos los documentos.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnalyzePendingLibrary = async () => {
    if (scanningPending || submitting || !folders.length) return;
    setScanningPending(true);
    try {
      const newlyTracked: TrackedDoc[] = [];
      for (const folder of folders) {
        const docsRes = await request<{ documents: Doc[] }>(
          `/api/knowledge/folders/${encodeURIComponent(folder.id)}/documents`,
        );
        for (const doc of docsRes.documents) {
          if (!doc.sourceAvailable || doc.deleting) continue;
          const snap = await request<AnalysisSnapshot>(
            `/api/knowledge/documents/${encodeURIComponent(doc.id)}/analyses`,
          );
          const active = snap.jobs.find(j => ['queued', 'running'].includes(j.state));
          if (active) {
            newlyTracked.push({
              docId: doc.id,
              docName: doc.name,
              folderId: folder.id,
              folderName: folder.name,
              state: active.state,
              progress: active.progress || null,
              revision: snap.revision,
              jobId: active.id,
              sourceJobId: snap.sourceJobId,
              entries: snap.entries,
            });
            continue;
          }
          if (!snap.sourceJobId && !snap.entries.length) {
            const jobRes = await request<{ job: AnalysisJob }>(
              `/api/knowledge/documents/${encodeURIComponent(doc.id)}/analyses`,
              {
                method: 'POST',
                headers: { 'idempotency-key': crypto.randomUUID() },
                json: { credentialId, language, dataProcessingConsent: true },
              },
            );
            newlyTracked.push({
              docId: doc.id,
              docName: doc.name,
              folderId: folder.id,
              folderName: folder.name,
              state: jobRes.job.state,
              progress: null,
              revision: snap.revision,
              jobId: jobRes.job.id,
              sourceJobId: snap.sourceJobId,
              entries: [],
            });
          }
        }
      }

      if (newlyTracked.length) {
        setTrackedDocs(current => [
          ...newlyTracked,
          ...current.filter(item => !newlyTracked.some(added => added.docId === item.docId)),
        ]);
        showToast(
          en ? `${newlyTracked.length} library document(s) queued.` : `${newlyTracked.length} documento(s) de la biblioteca en análisis.`,
          'success',
        );
      } else {
        showToast(en ? 'All existing library documents are already indexed.' : 'Todos los documentos de tu biblioteca ya están indexados.', 'info');
      }
    } catch {
      showToast(en ? 'Could not check pending library documents.' : 'No se pudieron revisar los documentos pendientes de la biblioteca.', 'error');
    } finally {
      setScanningPending(false);
    }
  };

  const handleApplyAllReady = async () => {
    const ready = trackedDocs.filter(item => item.state === 'succeeded' && item.jobId && item.sourceJobId !== item.jobId && item.entries.length);
    if (!ready.length || applyingAll) return;
    setApplyingAll(true);
    let count = 0;
    try {
      for (const item of ready) {
        if (item.jobId && (await applyOne(item.docId, item.jobId, item.revision))) count += 1;
      }
      await pollTracked();
      if (count > 0) showToast(en ? `${count} document(s) indexed.` : `${count} documento(s) indexado(s).`, 'success');
    } finally {
      setApplyingAll(false);
    }
  };

  const handleCancelJob = async (item: TrackedDoc) => {
    if (!item.jobId) return;
    try {
      await request(
        `/api/knowledge/documents/${encodeURIComponent(item.docId)}/analyses/${encodeURIComponent(item.jobId)}/cancel`,
        { method: 'POST', json: {} },
      );
      await pollTracked();
    } catch {
      showToast(en ? 'Could not cancel the analysis.' : 'No se pudo cancelar el análisis.', 'error');
    }
  };

  const runSearch = async (queryText: string) => {
    const q = queryText.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await request<{ entries: SearchEntry[] }>(`/api/knowledge/entries?q=${encodeURIComponent(q)}`);
      setSearchResults(res.entries);
    } catch {
      showToast(en ? 'Could not search knowledge entries.' : 'No se pudieron buscar las entradas.', 'error');
    } finally {
      setSearching(false);
    }
  };

  const readyToAcceptCount = trackedDocs.filter(
    item => item.state === 'succeeded' && item.jobId && item.sourceJobId !== item.jobId && item.entries.length,
  ).length;

  return (
    <div className="web-module-autopilot">
      <section className="web-review-autopilot-card">
        <div className="web-autopilot-card-header">
          <div className="web-autopilot-card-title">
            <span className="web-draft-step-number">1</span>
            <div>
              <h2>{en ? 'Batch upload & automatic classification' : 'Carga por lotes y análisis automático'}</h2>
              <p className="web-review-hint">
                {en
                  ? 'Drop multiple corporate documents (brochures, technical manuals, methodologies, contracts) to classify, analyze, and index them for your bids.'
                  : 'Arrastra varios documentos (manuales, metodologías, fichas técnicas, certificados) para clasificarlos por carpeta y dejarlos listos para redactar ofertas.'}
              </p>
            </div>
          </div>
          <span className="web-review-status-pill">
            {folders.length} {en ? 'folder(s)' : 'carpeta(s)'}
          </span>
        </div>

        <WebDocumentDropZone
          language={language}
          disabled={submitting || scanningPending}
          label={en ? 'Select up to 20 files' : 'Elegir hasta 20 archivos'}
          onFiles={addFiles}
        />

        {pendingFiles.length > 0 && (
          <div className="web-autopilot-list">
            {pendingFiles.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="web-autopilot-item-row">
                <div className="web-autopilot-item-body">
                  <strong>{file.name}</strong>
                  <small className="web-review-hint">
                    {targetMode === 'auto' ? `${en ? 'Suggested folder:' : 'Carpeta sugerida:'} ${suggestFolderName(file.name, en)} · ` : ''}
                    {(file.size / 1024).toFixed(0)} KB
                  </small>
                </div>
                <Button
                  icon={Trash2}
                  iconOnly
                  size="sm"
                  variant="ghost"
                  disabled={submitting}
                  onClick={() => setPendingFiles(current => current.filter((_, i) => i !== idx))}
                >
                  {en ? `Remove ${file.name}` : `Quitar ${file.name}`}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="web-feasibility-grid">
          <label>
            {en ? 'Destination folder' : 'Destino en biblioteca'}
            <select value={targetMode} disabled={submitting} onChange={event => setTargetMode(event.target.value as 'auto' | 'folder' | 'new')}>
              <option value="auto">{en ? 'Classify automatically into suggested folders' : 'Clasificar automáticamente en carpetas sugeridas'}</option>
              {folders.length > 0 && <option value="folder">{en ? 'Existing folder' : 'Usar carpeta existente'}</option>}
              <option value="new">{en ? 'Create a new folder' : 'Crear una nueva carpeta'}</option>
            </select>
          </label>
          {targetMode === 'folder' && (
            <label>
              {en ? 'Folder' : 'Carpeta'}
              <select value={selectedFolderId} disabled={submitting} onChange={event => setSelectedFolderId(event.target.value)}>
                {folders.map(folder => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {targetMode === 'new' && (
            <label>
              {en ? 'New folder name' : 'Nombre de la carpeta'}
              <Input
                disabled={submitting}
                maxLength={300}
                placeholder={en ? 'E.g., Technical methodologies' : 'Ej. Metodologías técnicas'}
                value={newFolderName}
                onChange={event => setNewFolderName(event.target.value)}
              />
            </label>
          )}
        </div>

        <label className="web-consent">
          <input type="checkbox" checked={autoAccept} onChange={event => setAutoAccept(event.target.checked)} />
          {en
            ? 'Automatically accept and index verified entries when each analysis completes'
            : 'Aceptar e indexar automáticamente las entradas verificadas al terminar cada análisis'}
        </label>

        <div className="web-inline">
          <Button icon={Sparkles} disabled={submitting || scanningPending || !pendingFiles.length} onClick={() => void handleUploadBatch()}>
            {submitting
              ? en
                ? 'Uploading & queueing…'
                : 'Subiendo y encolando…'
              : en
                ? `Upload & analyze (${pendingFiles.length})`
                : `Subir y analizar todos (${pendingFiles.length})`}
          </Button>
          {folders.length > 0 && (
            <Button
              icon={FolderTree}
              size="sm"
              variant="outline"
              disabled={submitting || scanningPending}
              onClick={() => void handleAnalyzePendingLibrary()}
            >
              {scanningPending
                ? en
                  ? 'Checking library…'
                  : 'Revisando biblioteca…'
                : en
                  ? 'Analyze unindexed library files'
                  : 'Analizar documentos pendientes de la biblioteca'}
            </Button>
          )}
        </div>
      </section>

      {trackedDocs.length > 0 && (
        <section className="web-review-autopilot-card">
          <div className="web-autopilot-card-header">
            <div className="web-autopilot-card-title">
              <span className="web-draft-step-number">2</span>
              <div>
                <h2>{en ? 'Batch progress & extracted entries' : 'Progreso del lote y conocimiento extraído'}</h2>
                <p className="web-review-hint">
                  {en
                    ? 'The local runner indexes each file and keeps exact source excerpts for technical plans and feasibility reports.'
                    : 'El runner local extrae y verifica fragmentos exactos de cada archivo para reutilizarlos en tus propuestas.'}
                </p>
              </div>
            </div>
            {readyToAcceptCount > 0 && !autoAccept && (
              <Button icon={CheckCircle2} size="sm" disabled={applyingAll} onClick={() => void handleApplyAllReady()}>
                {en ? `Index all ready (${readyToAcceptCount})` : `Aceptar todas las listas (${readyToAcceptCount})`}
              </Button>
            )}
          </div>

          <div className="web-autopilot-list">
            {trackedDocs.map(item => {
              const statusText =
                item.state === 'indexed'
                  ? en
                    ? `Indexed (${item.entries.length})`
                    : `Indexado (${item.entries.length})`
                  : item.state === 'succeeded'
                    ? en
                      ? `Ready (${item.entries.length})`
                      : `Listo (${item.entries.length})`
                    : item.state === 'running'
                      ? en
                        ? 'Analyzing'
                        : 'Analizando'
                      : item.state === 'queued'
                        ? en
                          ? 'Queued'
                          : 'En cola'
                        : item.state === 'failed'
                          ? en
                            ? 'Failed'
                            : 'Falló'
                          : item.state;
              return (
                <div key={item.docId} className="web-autopilot-item-row">
                  <div className="web-autopilot-item-body">
                    <div className="web-inline">
                      <strong>{item.docName}</strong>
                      <span className="web-review-status-pill">{item.folderName}</span>
                      <span className="web-review-status-pill" data-state={item.state === 'indexed' || item.state === 'succeeded' ? 'succeeded' : item.state === 'failed' ? 'failed' : 'pending'}>
                        {['queued', 'running'].includes(item.state) && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                        {statusText}
                      </span>
                    </div>
                    {['queued', 'running'].includes(item.state) && (
                      <WebJobProgress state={item.state} progress={item.progress} language={language} />
                    )}
                    {item.message && <small className="web-review-hint">{item.message}</small>}
                  </div>
                  <div className="web-inline">
                    {['queued', 'running'].includes(item.state) && (
                      <Button icon={Square} size="sm" variant="ghost" onClick={() => void handleCancelJob(item)}>
                        {en ? 'Cancel' : 'Cancelar'}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onOpenAdvanced(item.folderId, item.docId)}>
                      {en ? 'Inspect' : 'Ver detalle'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="web-review-autopilot-card">
        <div className="web-autopilot-card-header">
          <div className="web-autopilot-card-title">
            <span className="web-draft-step-number">{trackedDocs.length > 0 ? 3 : 2}</span>
            <div>
              <h2>{en ? 'Quick search in indexed knowledge' : 'Consulta rápida en tu biblioteca'}</h2>
              <p className="web-review-hint">
                {en
                  ? 'Verify what Savia already has indexed across folders or switch to folder management.'
                  : 'Comprueba rápidamente los fragmentos ya indexados o abre la vista por carpetas.'}
              </p>
            </div>
          </div>
          <Button icon={FolderOpen} size="sm" variant="outline" onClick={() => onOpenAdvanced()}>
            {en ? 'Manage folders' : 'Gestionar carpetas'}
          </Button>
        </div>

        <form
          className="web-knowledge-search"
          role="search"
          onSubmit={event => {
            event.preventDefault();
            void runSearch(searchQuery);
          }}
        >
          <div className="web-knowledge-search-input">
            <Search size={17} aria-hidden="true" />
            <Input
              aria-label={en ? 'Search indexed knowledge' : 'Buscar conocimiento indexado'}
              placeholder={en ? 'Search indexed topics or excerpts…' : 'Buscar metodologías, certificaciones o textos…'}
              value={searchQuery}
              maxLength={255}
              onChange={event => setSearchQuery(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={searching}>
            {searching ? (en ? 'Searching…' : 'Buscando…') : en ? 'Search' : 'Buscar'}
          </Button>
        </form>

        {searchResults !== null && (
          <div className="web-autopilot-list">
            {searchResults.length ? (
              searchResults.slice(0, 20).map(entry => (
                <div key={entry.id} className="web-autopilot-item-row">
                  <div className="web-autopilot-item-body">
                    <strong>{entry.title}</strong>
                    <small className="web-review-hint">
                      {entry.documentName} · {entry.summary}
                    </small>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onOpenAdvanced(entry.folderId, entry.documentId)}>
                    {en ? 'Open' : 'Abrir'}
                  </Button>
                </div>
              ))
            ) : (
              <p className="web-review-hint">{en ? 'No indexed entries matched your query.' : 'No se encontraron entradas indexadas para esa búsqueda.'}</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
