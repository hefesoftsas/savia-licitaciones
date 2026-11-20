import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MonitorCheck, MonitorOff, Play, CircleHelp } from 'lucide-react';
import { Button } from '@/shared/ui/primitives/button';
import { request } from './api.mjs';
import WebJobActivity from './WebJobActivity';
import {
  formatActivityEventLabel,
  type JobActivityEvent,
  type RunnerConnectionSummary,
} from './autopilot-state.mjs';

interface ActivitySnapshot {
  state: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  runnerName: string | null;
  events: JobActivityEvent[];
}

export interface WebAutopilotRunnerFeedProps {
  projectId: string;
  activeJobId: string | null;
  activeJobState?: string | null;
  language: 'es' | 'en';
  runnerSummary: RunnerConnectionSummary;
  onOpenRunners: () => void;
}

/** Live runner connection indicator and inline task event feed for Autopilot mode. */
export function WebAutopilotRunnerFeed({
  projectId,
  activeJobId,
  activeJobState,
  language,
  runnerSummary,
  onOpenRunners,
}: WebAutopilotRunnerFeedProps) {
  const en = language === 'en';
  const [activity, setActivity] = useState<ActivitySnapshot | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  useEffect(() => {
    setActivity(null);
    setLoadFailed(false);
    followRef.current = true;
    if (!activeJobId) return;

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const load = async () => {
      try {
        const next = await request<ActivitySnapshot>(
          `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(activeJobId)}/activity`,
          { signal: controller.signal },
        );
        if (!alive || controller.signal.aborted) return;
        setActivity(next);
        setLoadFailed(false);
        if (['queued', 'running'].includes(next.state)) {
          timer = setTimeout(() => void load(), 2500);
        }
      } catch {
        if (!alive || controller.signal.aborted) return;
        setLoadFailed(true);
        if (!activeJobState || ['queued', 'running'].includes(activeJobState)) {
          timer = setTimeout(() => void load(), 4000);
        }
      }
    };

    void load();
    return () => {
      alive = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [projectId, activeJobId, activeJobState]);

  useLayoutEffect(() => {
    if (followRef.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [activity]);

  const StatusIcon =
    runnerSummary.state === 'busy'
      ? Play
      : runnerSummary.state === 'online'
        ? MonitorCheck
        : runnerSummary.state === 'offline'
          ? MonitorOff
          : CircleHelp;

  const statusText =
    runnerSummary.state === 'busy' || runnerSummary.state === 'online'
      ? (en
          ? `Runner connected${runnerSummary.runnerName ? `: ${runnerSummary.runnerName}` : ''}`
          : `Runner conectado${runnerSummary.runnerName ? `: ${runnerSummary.runnerName}` : ''}`)
      : runnerSummary.state === 'offline'
        ? (en ? 'No runner connected' : 'Sin runner conectado')
        : (en ? 'Checking runner…' : 'Comprobando runner…');

  const recentEvents = activity?.events?.slice(-40) || [];
  const effectiveState = activity?.state || activeJobState || '';
  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString(en ? 'en-US' : 'es-CO');
    } catch {
      return '';
    }
  };

  return (
    <div className="web-autopilot-runner-section">
      <div className="web-autopilot-runner-bar">
        <div className="web-autopilot-runner-pill" data-state={runnerSummary.state}>
          <span className="web-autopilot-runner-dot" aria-hidden="true" />
          <StatusIcon size={15} aria-hidden="true" />
          <span>{statusText}</span>
        </div>
        <div className="web-autopilot-runner-actions">
          {runnerSummary.state === 'offline' && (
            <Button size="sm" variant="outline" onClick={onOpenRunners}>
              {en ? 'Connect runner' : 'Conectar runner'}
            </Button>
          )}
          {activeJobId && (
            <WebJobActivity projectId={projectId} jobId={activeJobId} language={language} />
          )}
        </div>
      </div>

      {activeJobId && (
        <div
          ref={logRef}
          className="web-autopilot-live-feed"
          tabIndex={0}
          aria-label={en ? 'Live runner activity' : 'Actividad del runner en vivo'}
          onScroll={() => {
            const el = logRef.current;
            if (el) followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 36;
          }}
        >
          <div className="web-autopilot-live-feed-head">
            <strong>{en ? 'Live runner activity' : 'Actividad del runner en vivo'}</strong>
            {activity?.updatedAt && (
              <small>
                {en ? 'Updated' : 'Actualizado'}: {formatTime(activity.updatedAt)}
              </small>
            )}
          </div>

          {loadFailed && !activity && (
            <p className="web-autopilot-hint" role="status">
              {en ? 'Could not refresh task activity. Retrying…' : 'No se pudo consultar la actividad. Reintentando…'}
            </p>
          )}

          {!loadFailed && !activity && (
            <p className="web-autopilot-hint" role="status">
              {en ? 'Loading runner activity…' : 'Cargando actividad del runner…'}
            </p>
          )}

          {activity && recentEvents.length === 0 && (
            <p className="web-autopilot-hint" role="status">
              {effectiveState === 'queued'
                ? (en
                    ? 'Task queued, waiting for the runner to pick it up.'
                    : 'Tarea en cola, esperando a que el runner la recoja.')
                : (en ? 'Waiting for runner events…' : 'En espera de eventos del runner…')}
            </p>
          )}

          {recentEvents.length > 0 && (
            <ol className="web-autopilot-live-list">
              {recentEvents.map(event => (
                <li key={event.sequence} className="web-autopilot-live-item" data-code={event.code}>
                  <time>{formatTime(event.at)}</time>
                  <span>{formatActivityEventLabel(event, language)}</span>
                </li>
              ))}
            </ol>
          )}

          {activity?.errorMessage && (
            <p className="web-autopilot-live-error" role="alert">
              {activity.errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
