import { useEffect, useState } from 'react';
import { request } from './api.mjs';

type HistoricalComparison = { id: string; requirementId: string | null; title: string; source: string; label: string; value: string; interpretedValue: string; page: number; operator: string; threshold: string; certificateName: string; issuedOn: string; updatedAt: string; hasSource: boolean; missingReason: string | null };

export default function WebImportedRupComparisons({ projectId, language }: { projectId: string; language: 'es' | 'en' }) {
  const en = language === 'en', [opened, setOpened] = useState(false), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false), [items, setItems] = useState<HistoricalComparison[]>([]);
  useEffect(() => {
    if (!opened) return;
    let active = true; setLoading(true); setFailed(false);
    void request<{ comparisons: HistoricalComparison[] }>(`/api/projects/${encodeURIComponent(projectId)}/imported-rup-comparisons`)
      .then(data => { if (active) setItems(data.comparisons); }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [opened, projectId]);
  return <details className="web-imported-comparisons" onToggle={event => setOpened(event.currentTarget.open)}><summary>{en ? 'Comparisons imported from desktop' : 'Comparaciones importadas del escritorio'}</summary>
    <p>{en ? 'These are historical records. Review the original sources and current data before using them; they do not change the current assessment.' : 'Son registros históricos. Revisa las fuentes originales y los datos actuales antes de utilizarlos; no modifican la valoración actual.'}</p>
    {loading ? <p role="status">{en ? 'Loading…' : 'Cargando…'}</p> : failed ? <p role="alert">{en ? 'Could not load comparisons. Close and reopen to retry.' : 'No se pudieron cargar las comparaciones. Cierra y vuelve a abrir para reintentar.'}</p> : items.length ? items.map(item => <article key={item.id}>
      <strong>{item.title}</strong>{!item.requirementId && <p>{en ? 'The original requirement is not linked to a current requirement.' : 'El requisito original no está vinculado a un requisito actual.'}</p>}
      {item.updatedAt && <p>{en ? 'Recorded' : 'Registrada'}: {item.updatedAt}</p>}
      <p>{en ? 'Tender source' : 'Fuente del pliego'}: {item.source || (en ? 'Not recorded' : 'No registrada')}</p>
      <p>{item.label}: {item.value} · {item.certificateName} · {en ? 'page' : 'página'} {item.page}{item.issuedOn && ` · ${en ? 'issued' : 'expedido'} ${item.issuedOn}`}</p>
      {item.interpretedValue && <p>{en ? 'Recorded interpretation' : 'Interpretación registrada'}: {item.interpretedValue}</p>}
      <p>{en ? 'Recorded rule' : 'Regla registrada'}: {item.operator === 'gte' ? '≥' : item.operator === 'lte' ? '≤' : item.operator} {item.threshold}</p>
      {item.hasSource ? <a className="web-link" href={`/api/projects/${encodeURIComponent(projectId)}/imported-rup-comparisons/${encodeURIComponent(item.id)}/pdf`}>{en ? 'Download historical RUP' : 'Descargar RUP histórico'}</a> : <p role="status">{en ? 'The source PDF was not available in the backup.' : 'El PDF de origen no estaba disponible en el respaldo.'}</p>}
    </article>) : <p>{en ? 'No imported comparisons.' : 'No hay comparaciones importadas.'}</p>}
  </details>;
}
