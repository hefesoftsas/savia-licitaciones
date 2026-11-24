import {WebLoading} from './WebLoading';
import WebKnowledgeAnalysis from './WebKnowledgeAnalysis';
import { WebKnowledgeAutopilot } from './WebKnowledgeAutopilot';
import WebImportedKnowledgeItems from './WebImportedKnowledgeItems';
import { useEffect, useState, type FormEvent } from 'react';
import {ArrowDown, ArrowUp, FileText, FolderOpen, FolderPlus, Search, Trash2, Upload} from 'lucide-react';
import AppDialog from '@/shared/ui/AppDialog';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';

type Folder = { id: string; name: string };
type Document = { id: string; folderId: string; name: string; size: number; deleting: boolean; sourceAvailable: boolean; missingReason?: string | null; attachedName?: string | null };

export default function WebKnowledgeLibrary({ language, credentials }: { language: 'es' | 'en'; credentials: { id: string; provider: string; model: string }[] }) {
  const en = language === 'en', { showToast } = useToast();
  const [folders, setFolders] = useState<Folder[]>([]), [folderId, setFolderId] = useState(''), [documents, setDocuments] = useState<Document[]>([]);
  const [viewMode, setViewMode] = useState<'autopilot' | 'advanced'>('autopilot');
  const [pendingDocId, setPendingDocId] = useState('');
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [failed, setFailed] = useState(false);
  const [activeDocument, setActiveDocument] = useState<Document | null>(null), [entries, setEntries] = useState<{ id: string; documentId: string; documentName: string; folderId: string; title: string; summary: string; quote: string }[]>([]);
  const [confirm, setConfirm] = useState<{ kind: 'folder' | 'document'; id: string; name: string } | null>(null);
  const [attachment, setAttachment] = useState<{ document: Document; file: File } | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  useEffect(() => { let active = true; setLoading(true); const path = search ? `/api/knowledge/documents?q=${encodeURIComponent(search)}` : folderId ? `/api/knowledge/folders/${folderId}/documents` : ''; void Promise.all([request<{ folders: Folder[] }>('/api/knowledge/folders'), path ? request<{ documents: Document[] }>(path) : Promise.resolve({ documents: [] }), search ? request<{ entries: typeof entries }>(`/api/knowledge/entries?q=${encodeURIComponent(search)}`) : Promise.resolve({ entries: [] })]).then(([f, d, found]) => { if (active) { setFolders(f.folders); setDocuments(d.documents); setEntries(found.entries); setFailed(false); } }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [folderId, search, refreshVersion]);
  const run = async (action: () => Promise<void>) => { setBusy(true); try { await action(); } catch { showToast(en ? 'The action could not be completed. Refresh and try again.' : 'No se pudo completar la acción. Actualiza e inténtalo de nuevo.', 'error'); } finally { setRefreshVersion(value => value + 1); setBusy(false); } };
  const move = async (kind: 'folder' | 'document', index: number, direction: -1 | 1) => {
    if (busy || loading || (kind === 'document' && (search || !folderId))) return;
    const items = kind === 'folder' ? folders : documents, next = index + direction;
    if (next < 0 || next >= items.length) return;
    const before = items.map(item => item.id), after = [...before]; [after[index], after[next]] = [after[next], after[index]];
    const path = kind === 'folder' ? '/api/knowledge/folders/order' : `/api/knowledge/folders/${encodeURIComponent(folderId)}/documents/order`;
    setBusy(true);
    try { await request(path, { method: 'PUT', json: { before, after } }); }
    catch (error) { showToast((error as Error & { status?: number }).status === 409 ? (en ? 'The order changed in another session. The list has been refreshed.' : 'El orden cambió en otra sesión. La lista se ha actualizado.') : (en ? 'Could not change the order.' : 'No se pudo cambiar el orden.'), 'error'); }
    finally { setRefreshVersion(value => value + 1); setBusy(false); }
  };
  const create = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget, name = String(new FormData(form).get('name') || '').trim(); if (!name) return; void run(async () => { const result = await request<{ folder: Folder }>('/api/knowledge/folders', { method: 'POST', json: { name } }); form.reset(); setSearch(''); setQuery(''); setFolderId(result.folder.id); }); };
  const upload = (event: FormEvent<HTMLInputElement>) => { const input = event.currentTarget, file = input.files?.[0]; if (!file || !folderId) return; void run(async () => { if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('size'); await request(`/api/knowledge/folders/${folderId}/documents`, { method: 'POST', headers: { 'x-file-name': encodeURIComponent(file.name), 'content-type': file.type || 'application/octet-stream' }, body: file }); input.value = ''; }); };
  const chooseAttachment = (event: FormEvent<HTMLInputElement>, document: Document) => {
    const input = event.currentTarget, file = input.files?.[0]; input.value = '';
    if (!file) return;
    if (!file.size || file.size > 25 * 1024 * 1024) { showToast(en ? 'Choose a nonempty file of up to 25 MB.' : 'Selecciona un archivo no vacío de hasta 25 MB.', 'error'); return; }
    setAttachment({ document, file });
  };
  const attach = async () => {
    if (!attachment || busy) return;
    const { document, file } = attachment; setBusy(true);
    try {
      await request(`/api/knowledge/documents/${encodeURIComponent(document.id)}/file`, { method: 'PUT', headers: { 'x-file-name': encodeURIComponent(file.name), 'content-type': file.type || 'application/octet-stream' }, body: file });
      const result = await request<{ document: Document }>(`/api/knowledge/documents/${encodeURIComponent(document.id)}`);
      setDocuments(current => current.map(item => item.id === document.id ? result.document : item));
      setActiveDocument(current => current?.id === document.id ? result.document : current);
      setAttachment(null); showToast(en ? 'File attached.' : 'Archivo adjuntado.', 'success');
    } catch (error) {
      showToast((error as Error & { status?: number }).status === 409 ? (en ? 'A different file was already attached. Refresh the library.' : 'Ya se adjuntó otro archivo. Actualiza la biblioteca.') : (en ? 'Could not attach the file. Please retry.' : 'No se pudo adjuntar el archivo. Inténtalo de nuevo.'), 'error');
    } finally { setBusy(false); setRefreshVersion(value => value + 1); }
  };
  const remove = () => { const item = confirm; setConfirm(null); if (!item) return; void run(async () => { await request(`/api/knowledge/${item.kind === 'folder' ? 'folders' : 'documents'}/${item.id}`, { method: 'DELETE' }); if (item.kind === 'folder' && item.id === folderId) setFolderId(''); if (item.kind === 'document' && item.id === activeDocument?.id) setActiveDocument(null); }); };
  useEffect(() => {
    if (!pendingDocId) return;
    const match = documents.find(doc => doc.id === pendingDocId);
    if (match) {
      setActiveDocument(match);
      setPendingDocId('');
    }
  }, [documents, pendingDocId]);
  const selectedFolder = folders.find(folder => folder.id === folderId);
  const missingReason = (reason?: string | null) => ({ not_found: en ? 'Original missing from backup' : 'Original ausente del respaldo', unsafe_path: en ? 'Original path outside backup' : 'Ruta del original fuera del respaldo', empty: en ? 'Original file is empty' : 'El archivo original está vacío', too_large: en ? 'Original exceeds 25 MB' : 'El original supera 25 MB' } as Record<string, string>)[reason || ''] || (en ? 'Original unavailable' : 'Original no disponible');
  return <section className="web-knowledge">
    <div className="web-project-mode-bar" role="group" aria-label={en ? 'Knowledge library mode' : 'Modo de la biblioteca'}>
      <button type="button" className={viewMode === 'autopilot' ? 'is-active' : ''} aria-pressed={viewMode === 'autopilot'} onClick={() => setViewMode('autopilot')}>{en ? 'Autopilot' : 'Piloto automático'}</button>
      <button type="button" className={viewMode === 'advanced' ? 'is-active' : ''} aria-pressed={viewMode === 'advanced'} onClick={() => setViewMode('advanced')}>{en ? 'Advanced view' : 'Vista avanzada'}</button>
    </div>
    {viewMode === 'autopilot' ? (
      <WebKnowledgeAutopilot
        language={language}
        credentials={credentials}
        folders={folders}
        onLibraryChanged={() => setRefreshVersion(value => value + 1)}
        onOpenAdvanced={(nextFolderId, nextDocumentId) => {
          setSearch('');
          setQuery('');
          if (nextFolderId) setFolderId(nextFolderId);
          if (nextDocumentId) setPendingDocId(nextDocumentId);
          setViewMode('advanced');
        }}
      />
    ) : (
      <>
    <form className="web-knowledge-search" role="search" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); }}><div className="web-knowledge-search-input"><Search size={17} aria-hidden="true"/><Input aria-label={en ? 'Search the library' : 'Buscar en la biblioteca'} value={query} maxLength={255} onChange={event => setQuery(event.target.value)} placeholder={en ? 'Search files and accepted entries' : 'Buscar archivos y entradas aceptadas'} /></div><Button type="submit" variant="outline">{en ? 'Search' : 'Buscar'}</Button>{search && <Button type="button" variant="ghost" onClick={() => { setSearch(''); setQuery(''); }}>{en ? 'Clear' : 'Limpiar'}</Button>}</form>
    <div className="web-knowledge-workspace"><section className="web-knowledge-folders"><div className="web-knowledge-folder-heading"><h2>{en ? 'Folders' : 'Carpetas'}</h2><span>{folders.length}</span></div><form className="web-knowledge-create" onSubmit={create}><Input name="name" aria-label={en ? 'Folder name' : 'Nombre de carpeta'} placeholder={en ? 'Folder name' : 'Nombre de carpeta'} required maxLength={300} /><Button icon={FolderPlus} iconOnly type="submit" disabled={busy}>{en ? 'Create' : 'Crear'}</Button></form><div className="web-list">{folders.map((folder, index) => <div className="web-folder-row" key={folder.id}><button type="button" disabled={busy || loading} className={folderId === folder.id && !search ? 'selected' : ''} onClick={() => { setFolderId(folder.id); setActiveDocument(null); setSearch(''); setQuery(''); }}><FolderOpen size={16} aria-hidden="true"/><span>{folder.name}</span></button><div className="web-order-actions"><Button type="button" variant="ghost" size="icon" disabled={busy || loading || index === 0} aria-label={en ? `Move ${folder.name} up` : `Subir ${folder.name}`} onClick={() => void move('folder', index, -1)}><ArrowUp aria-hidden="true" /></Button><Button type="button" variant="ghost" size="icon" disabled={busy || loading || index === folders.length - 1} aria-label={en ? `Move ${folder.name} down` : `Bajar ${folder.name}`} onClick={() => void move('folder', index, 1)}><ArrowDown aria-hidden="true" /></Button></div></div>)}{!folders.length && !loading && <p className="web-knowledge-folder-empty">{en ? 'Your folders will appear here.' : 'Aquí aparecerán tus carpetas.'}</p>}</div></section>
      <section className="web-detail web-knowledge-content"><div className="web-knowledge-content-heading"><div><h2>{search ? (en ? 'Search results' : 'Resultados de búsqueda') : selectedFolder?.name || (en ? 'Your documents' : 'Tus documentos')}</h2>{selectedFolder && !search && <p>{en?'Add files and analyze them to reuse their contents.':'Agrega archivos y analízalos para reutilizar su contenido.'}</p>}</div>{!search && selectedFolder && <><label className="web-upload"><Upload size={15} aria-hidden="true"/>{en ? 'Upload an original (up to 25 MB)' : 'Subir un original (hasta 25 MB)'}<input type="file" disabled={busy} onChange={upload} /></label><Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm({ kind: 'folder', id: selectedFolder.id, name: selectedFolder.name })}>{en ? 'Delete empty folder' : 'Eliminar carpeta vacía'}</Button></>}</div>{!selectedFolder && !search && !loading && !failed && <div className="web-knowledge-empty"><div className="web-knowledge-empty-icon"><FolderOpen size={24} aria-hidden="true"/></div><h3>{folders.length ? (en?'Choose a folder':'Selecciona una carpeta') : (en?'Start with a folder':'Empieza creando una carpeta')}</h3><p>{folders.length ? (en?'Choose a folder to view and add documents.':'Elige una carpeta para ver y agregar documentos.') : (en?'Create a folder to organize documents you can reuse in your bids.':'Crea una carpeta para organizar documentos que podrás reutilizar en tus ofertas.')}</p></div>}
      {loading ? <WebLoading message={en?'Loading…':'Cargando…'}/> : failed ? <p role="alert">{en ? 'Could not load the library. Reload the page.' : 'No se pudo cargar la biblioteca. Actualiza la página.'}</p> : <div className="web-knowledge-documents">{documents.map((doc, index) => <article key={doc.id}><div><strong>{doc.name}</strong><p>{search && `${folders.find(folder => folder.id === doc.folderId)?.name || ''} · `}{doc.sourceAvailable ? `${(doc.size / 1024).toFixed(1)} KB` : missingReason(doc.missingReason)}{doc.deleting && (en ? ' · deletion pending' : ' · eliminación pendiente')}</p>{doc.attachedName && <p>{en ? 'Attached file' : 'Archivo adjuntado'}: {doc.attachedName}</p>}</div><div className="web-inline">{!search && <div className="web-order-actions"><Button type="button" variant="ghost" size="icon" disabled={busy || loading || index === 0} aria-label={en ? `Move ${doc.name} up` : `Subir ${doc.name}`} onClick={() => void move('document', index, -1)}><ArrowUp aria-hidden="true" /></Button><Button type="button" variant="ghost" size="icon" disabled={busy || loading || index === documents.length - 1} aria-label={en ? `Move ${doc.name} down` : `Bajar ${doc.name}`} onClick={() => void move('document', index, 1)}><ArrowDown aria-hidden="true" /></Button></div>}{!doc.deleting && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setFolderId(doc.folderId); setSearch(''); setQuery(''); setActiveDocument(doc); }}>{doc.sourceAvailable ? (en ? 'Analyze / review' : 'Analizar / revisar') : (en ? 'Review entries' : 'Ver entradas')}</Button>}{!doc.deleting && !doc.sourceAvailable && <label className="web-upload web-attach-file">{en ? 'Attach file' : 'Adjuntar archivo'}<input type="file" disabled={busy} aria-label={en ? `Attach file for ${doc.name}` : `Adjuntar archivo para ${doc.name}`} onChange={event => chooseAttachment(event, doc)} /></label>}{!doc.deleting && doc.sourceAvailable && <a className="web-link" href={`/api/knowledge/documents/${encodeURIComponent(doc.id)}/file`}>{en ? 'Download' : 'Descargar'}</a>}<Button icon={Trash2} iconOnly size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm({ kind: 'document', id: doc.id, name: doc.name })}>{doc.deleting ? (en ? 'Retry deletion' : 'Reintentar eliminación') : (en ? 'Delete' : 'Eliminar')}</Button></div></article>)}{!documents.length && (search || selectedFolder) && <div className="web-knowledge-empty web-knowledge-empty-small"><FileText size={22} aria-hidden="true"/><h3>{search ? (en?'No results found':'Sin resultados') : (en?'No documents yet':'Aún no hay documentos')}</h3><p>{search ? (en?'Try another search.':'Prueba con otra búsqueda.') : (en?'Upload a file to start building this folder.':'Sube un archivo para comenzar a llenar esta carpeta.')}</p></div>}{search && documents.length === 200 && <p>{en ? 'Showing the first 200 matches. Refine the name to find more.' : 'Se muestran los primeros 200 resultados. Precisa el nombre para encontrar más.'}</p>}</div>}{search && !!entries.length && <div className="web-knowledge-documents"><h3>{en ? 'Accepted knowledge entries' : 'Entradas de conocimiento aceptadas'}</h3>{entries.map(entry => <article key={entry.id}><div><strong>{entry.title}</strong><p>{entry.documentName} · {entry.summary}</p><blockquote>{entry.quote}</blockquote></div><Button size="sm" variant="outline" onClick={() => { setFolderId(entry.folderId); setSearch(''); setQuery(''); setActiveDocument({ id: entry.documentId, name: entry.documentName, folderId: entry.folderId, size: 0, deleting: false, sourceAvailable: true }); }}>{en ? 'Open source' : 'Abrir fuente'}</Button></article>)}{entries.length === 200 && <p>{en ? 'Showing the first 200 entries. Refine your search.' : 'Se muestran las primeras 200 entradas. Precisa la búsqueda.'}</p>}</div>}{activeDocument && !search && (activeDocument.sourceAvailable ? <WebKnowledgeAnalysis key={activeDocument.id} documentId={activeDocument.id} name={activeDocument.name} language={language} credentials={credentials} onIndexed={() => setRefreshVersion(value => value + 1)} /> : <section><h3>{activeDocument.name}</h3><p role="status">{missingReason(activeDocument.missingReason)}</p><WebImportedKnowledgeItems key={activeDocument.id} documentId={activeDocument.id} language={language} /></section>)}</section></div>
    <AppDialog open={!!attachment} preventClose={busy} onOpenChange={open => { if (!open && !busy) setAttachment(null); }} title={en ? 'Attach this file?' : '¿Adjuntar este archivo?'} description={attachment ? (en ? `You selected “${attachment.file.name}” for “${attachment.document.name}”. Savia cannot verify that it is the original; check it against the historical entries before using it.` : `Seleccionaste «${attachment.file.name}» para «${attachment.document.name}». Savia no puede verificar que sea el original; compáralo con las entradas históricas antes de utilizarlo.`) : ''} actions={<><Button variant="outline" disabled={busy} onClick={() => setAttachment(null)}>{en ? 'Cancel' : 'Cancelar'}</Button><Button disabled={busy} onClick={() => void attach()}>{en ? 'Attach file' : 'Adjuntar archivo'}</Button></>} />
    <AppDialog open={!!confirm} onOpenChange={open => { if (!open) setConfirm(null); }} title={en ? `Delete “${confirm?.name}”?` : `¿Eliminar «${confirm?.name}»?`} description={confirm?.kind === 'folder' ? (en ? 'Only empty folders can be deleted.' : 'Solo se pueden eliminar carpetas vacías.') : (en ? 'The original, analyses and accepted entries will be deleted.' : 'Se eliminarán el original, sus análisis y las entradas aceptadas.')} actions={<><Button variant="outline" onClick={() => setConfirm(null)}>{en ? 'Cancel' : 'Cancelar'}</Button><Button icon={Trash2} variant="destructive" onClick={remove}>{en ? 'Delete' : 'Eliminar'}</Button></>} />
      </>
    )}
  </section>;
}
