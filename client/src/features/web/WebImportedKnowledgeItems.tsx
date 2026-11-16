import { useEffect, useState } from 'react';
import { request } from './api.mjs';

type HistoricalItem = { id: string; title: string; summary: string; content: string; source: string };
export default function WebImportedKnowledgeItems({ documentId, language }: { documentId: string; language: 'es' | 'en' }) {
 const en = language === 'en', [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false), [items, setItems] = useState<HistoricalItem[]>([]);
 useEffect(() => {
  if (!open) return;
  let active = true; setLoading(true); setFailed(false);
  void request<{ items: HistoricalItem[] }>(`/api/knowledge/documents/${encodeURIComponent(documentId)}/imported-items`).then(data => { if (active) setItems(data.items); }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, [documentId, open]);
 return <details className="web-imported-knowledge" onToggle={event => setOpen(event.currentTarget.open)}><summary>{en ? 'Entries imported from desktop' : 'Entradas importadas del escritorio'}</summary>
  <p>{en ? 'These historical entries may contain generated text. Review the original document before using them; they are separate from accepted source excerpts.' : 'Estas entradas históricas pueden contener texto generado. Revisa el documento original antes de usarlas; están separadas de los fragmentos aceptados.'}</p>
  {loading ? <p role="status">{en ? 'Loading…' : 'Cargando…'}</p> : failed ? <p role="alert">{en ? 'Could not load entries. Close and reopen to retry.' : 'No se pudieron cargar las entradas. Cierra y vuelve a abrir para reintentar.'}</p> : items.length ? items.map(item => <article key={item.id}><strong>{item.title}</strong><p>{item.summary}</p><pre>{item.content}</pre></article>) : <p>{en ? 'No imported entries.' : 'No hay entradas importadas.'}</p>}
 </details>;
}
