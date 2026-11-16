import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/shared/ui/primitives/button';
import { request } from './api.mjs';
import { buildPlanPreview, type LibraryImage, type PlanAsset } from './plan-preview.mjs';
import { renderPreviewNodes } from './plan-preview-view.mjs';

export default function WebPlanPreview({ projectId, content, language, expanded = false }: { projectId: string; content: string; language: 'es' | 'en'; expanded?: boolean }) {
  const en = language === 'en';
  const [assets, setAssets] = useState<PlanAsset[]>([]), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false), [open, setOpen] = useState(expanded), [renderRevision, setRenderRevision] = useState(0);
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const requestVersion = useRef(0);
  useEffect(() => { setAssets([]); setLibrary([]); setFailed(false); setLoading(false); return () => { requestVersion.current++; }; }, [projectId]);
  const deferredContent = useDeferredValue(content);
  const tree = useMemo(() => open ? buildPlanPreview(deferredContent, assets, projectId, library) : [], [open, deferredContent, assets, projectId, library]);
  const refresh = async () => {
    const version = ++requestVersion.current; setLoading(true);
    try { const [project, images] = await Promise.allSettled([request<{ assets: PlanAsset[] }>(`/api/projects/${encodeURIComponent(projectId)}/plan-assets`), request<{images: LibraryImage[]}>('/api/image-library')]); if (version === requestVersion.current) { setAssets(project.status === 'fulfilled' ? project.value.assets : []); setLibrary(images.status === 'fulfilled' ? images.value.images : []); setFailed(project.status === 'rejected' || images.status === 'rejected'); setRenderRevision(value => value + 1); } }
    finally { if (version === requestVersion.current) setLoading(false); }
  };
  return <details open={expanded || undefined} className="web-plan-preview" onToggle={event => { const isOpen = event.currentTarget.open; setOpen(isOpen); if (isOpen) void refresh(); }}>
    <summary>{en ? 'Chapter preview' : 'Vista previa del capítulo'}</summary>
    <p>{en ? 'Includes unsaved edits. External images are not loaded.' : 'Incluye los cambios sin guardar. Las imágenes externas no se cargan.'}</p>
    <Button size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>{en ? 'Refresh images' : 'Actualizar imágenes'}</Button>
    {loading && <p role="status">{en ? 'Loading images…' : 'Cargando imágenes…'}</p>}
    {failed && <p role="alert">{en ? 'Some images could not be loaded. Retry.' : 'No se pudieron cargar algunas imágenes. Inténtalo de nuevo.'}</p>}
    <div className="web-plan-preview-content" aria-busy={loading}>{tree.length ? renderPreviewNodes(tree, en, `preview-${renderRevision}`) : <p>{en ? 'No chapter content.' : 'El capítulo está vacío.'}</p>}</div>
  </details>;
}
