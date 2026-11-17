import { useState } from 'react';
import { Bell, BookmarkCheck, Check, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import AppDialog from '@/shared/ui/AppDialog';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { request } from './api.mjs';
import { formatDateValue } from './secop/secopValue.mjs';

export type PaaHeader = { planId: string; entity: string; year: number | null; version: string; modifiedAt: string; status: string };
export type PaaWatchItem = PaaHeader & { id: string; checkedAt: string; error: string };
export type PaaAlert = { id: string; planId: string; previous: PaaHeader; current: PaaHeader; createdAt: string; reviewed: boolean };
export type PaaState = { items: PaaWatchItem[]; alerts: PaaAlert[]; unreadCount: number };

export default function WebPaaWatch({
  language,
  state,
  showEmpty = false,
  onRefresh,
}: {
  language: 'es' | 'en';
  state: PaaState | null;
  showEmpty?: boolean;
  onRefresh: () => Promise<void>;
}) {
  const en = language === 'en';
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<PaaWatchItem | null>(null);

  const hasContent = !!state && (state.items.length > 0 || state.alerts.length > 0);
  if (!hasContent && !showEmpty) return null;

  const fmt = (value: string) => formatDateValue(value, language, { country: 'CO', dateStyle: 'medium', timeStyle: 'short' });

  const act = async (path: string, method: 'POST' | 'DELETE') => {
    setBusy(path);
    setError('');
    try {
      await request(path, { method, json: {} });
      await onRefresh();
    } catch (err) {
      setError(
        (err as Error & { status?: number }).status === 502
          ? en
            ? 'The public data source could not be checked.'
            : 'No se pudo consultar la fuente pública.'
          : en
            ? 'Could not complete the action. Refresh and try again.'
            : 'No se pudo completar la acción. Actualiza e inténtalo de nuevo.',
      );
      await onRefresh().catch(() => undefined);
    } finally {
      setBusy('');
      setRemoving(null);
    }
  };

  const source = (id: string) => {
    const params = new URLSearchParams({ $where: `id_plan_anual_de_adquisiciones='${id.replace(/'/g, "''")}'` });
    return `https://www.datos.gov.co/resource/b6m4-qgqv.json?${params}`;
  };

  return (
    <section className="web-paa-watch" aria-label={en ? 'Followed acquisition plans' : 'Planes de adquisiciones seguidos'}>
      <div className="web-paa-watch-head">
        <div>
          <h2>
            <BookmarkCheck size={16} aria-hidden="true" />
            <span>{en ? 'Followed acquisition plans (PAA)' : 'Planes de adquisiciones seguidos (PAA)'}</span>
            {state && state.items.length > 0 && <small className="web-paa-watch-count">{state.items.length}</small>}
          </h2>
          <p>
            {en
              ? 'Versions are checked every six hours while this app is open. A change does not identify a particular purchase.'
              : 'Se revisan las versiones cada seis horas mientras esta aplicación está abierta. Un cambio no identifica una compra concreta.'}
          </p>
        </div>
        <Button
          icon={RefreshCw}
          iconOnly
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() => {
            setBusy('refresh');
            void onRefresh().finally(() => setBusy(''));
          }}
        >
          {en ? 'Refresh list' : 'Actualizar lista'}
        </Button>
      </div>

      {error && <p role="alert" className="web-market-alert">{error}</p>}

      {!hasContent ? (
        <p className="web-paa-watch-empty">
          {en
            ? 'You are not following any Annual Procurement Plans yet. Use the “Follow plan” button on any PAA search result below to monitor version changes.'
            : 'Aún no sigues ningún Plan Anual de Adquisiciones. Usa el botón «Seguir plan» en cualquier resultado de búsqueda del PAA para monitorear cambios de versión.'}
        </p>
      ) : (
        <>
          <div className="web-paa-watch-list">
            {state!.items.map(item => (
              <article key={item.id} className="web-paa-watch-item">
                <div className="web-paa-watch-item-body">
                  <div className="web-paa-watch-item-title">
                    <strong>{item.entity || item.planId}</strong>
                    <span className="web-market-badge">{item.year || '—'}</span>
                    <span className="web-market-badge is-subtle">
                      {en ? 'Version' : 'Versión'} {item.version}
                    </span>
                  </div>
                  <p>
                    {en ? 'Last checked' : 'Última consulta'}: {fmt(item.checkedAt)}
                    {' · '}
                    <a href={source(item.planId)} target="_blank" rel="noreferrer" className="web-link">
                      {en ? 'View official plan' : 'Ver plan oficial'} <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  </p>
                  {item.error && <p role="alert" className="web-market-alert">{en ? 'Last check failed.' : 'La última revisión falló.'}</p>}
                </div>
                <div className="web-inline">
                  <Button
                    icon={RefreshCw}
                    iconOnly
                    size="sm"
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => void act(`/api/paa-watches/${encodeURIComponent(item.id)}/check`, 'POST')}
                  >
                    {en ? 'Check now' : 'Revisar ahora'}
                  </Button>
                  <Button
                    icon={Trash2}
                    iconOnly
                    size="sm"
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => setRemoving(item)}
                  >
                    {en ? 'Unfollow' : 'Dejar de seguir'}
                  </Button>
                </div>
              </article>
            ))}
          </div>

          {state!.alerts.length > 0 && (
            <div className="web-paa-watch-alerts">
              <h3>
                <Bell size={15} aria-hidden="true" />
                <span>
                  {en ? 'Plan changes' : 'Cambios en planes'} {state!.unreadCount > 0 && `(${state!.unreadCount})`}
                </span>
              </h3>
              {state!.alerts.map(alert => (
                <article key={alert.id} className="web-paa-watch-item">
                  <div className="web-paa-watch-item-body">
                    <div className="web-paa-watch-item-title">
                      <strong>{alert.current.entity || alert.planId}</strong>
                      <span className="web-market-badge">{alert.current.year || '—'}</span>
                      <span className={`web-market-badge${alert.reviewed ? ' is-subtle' : ' is-accent'}`}>
                        {alert.reviewed ? (en ? 'Reviewed' : 'Revisado') : (en ? 'New' : 'Nuevo')}
                      </span>
                    </div>
                    {(['version', 'modifiedAt', 'status'] as const).map(
                      key =>
                        alert.previous[key] !== alert.current[key] && (
                          <p key={key}>
                            {({ version: en ? 'Version' : 'Versión', modifiedAt: en ? 'Modified' : 'Modificación', status: en ? 'Status' : 'Estado' })[key]}:{' '}
                            {alert.previous[key] || '—'} → <strong>{alert.current[key] || '—'}</strong>
                          </p>
                        ),
                    )}
                    <p>{fmt(alert.createdAt)}</p>
                  </div>
                  {!alert.reviewed && (
                    <Button
                      icon={Check}
                      size="sm"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => void act(`/api/paa-alerts/${encodeURIComponent(alert.id)}/review`, 'POST')}
                    >
                      {en ? 'Mark reviewed' : 'Marcar revisado'}
                    </Button>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}

      <AppDialog
        open={!!removing}
        onOpenChange={open => {
          if (!open && !busy) setRemoving(null);
        }}
        title={en ? 'Unfollow plan?' : '¿Dejar de seguir el plan?'}
        description={en ? 'Its change alerts will also be removed.' : 'También se eliminarán sus avisos de cambios.'}
        actions={
          <>
            <Button variant="outline" disabled={!!busy} onClick={() => setRemoving(null)}>
              {en ? 'Cancel' : 'Cancelar'}
            </Button>
            <Button
              variant="destructive"
              disabled={!!busy}
              onClick={() => removing && void act(`/api/paa-watches/${encodeURIComponent(removing.id)}`, 'DELETE')}
            >
              {en ? 'Unfollow' : 'Dejar de seguir'}
            </Button>
          </>
        }
      />
    </section>
  );
}
