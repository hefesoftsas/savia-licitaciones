import { AlertCircle, Check, Loader2, Pause } from 'lucide-react';
import {
  buildAutopilotTimeline,
  computeAutopilotProgress,
  getStageLabel,
  type AutopilotPreparation,
} from './autopilot-state.mjs';

export interface WebAutopilotTimelineProps {
  preparation: AutopilotPreparation | null;
  language: 'es' | 'en';
}

/** 4-milestone progress bar and overall stage progress indicator translating the 8 backend stages. */
export function WebAutopilotTimeline({ preparation, language }: WebAutopilotTimelineProps) {
  const en = language === 'en';
  const steps = buildAutopilotTimeline(preparation, language);
  const progress = computeAutopilotProgress(preparation);

  return (
    <nav className="web-autopilot-timeline-nav" aria-label={en ? 'Offer preparation progress' : 'Progreso de preparación de la oferta'}>
      <ol className="web-autopilot-timeline">
        {steps.map(step => {
          const isCurrent = step.status === 'active' || step.status === 'blocked' || step.status === 'paused';
          return (
            <li
              key={step.id}
              className="web-autopilot-step"
              data-status={step.status}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="web-autopilot-step-badge" aria-hidden="true">
                {step.status === 'completed' ? (
                  <Check size={14} />
                ) : step.status === 'active' ? (
                  <Loader2 size={14} className="web-loading-icon" />
                ) : step.status === 'blocked' ? (
                  <AlertCircle size={14} />
                ) : step.status === 'paused' ? (
                  <Pause size={13} />
                ) : (
                  step.stepNumber
                )}
              </span>
              <span className="web-autopilot-step-label">
                {step.stepNumber}. {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {preparation && (
        <div className="web-autopilot-progress">
          <div className="web-autopilot-progress-meta">
            <span>
              {progress.state === 'ready'
                ? (en
                    ? `Completed (${progress.totalStages} of ${progress.totalStages} stages)`
                    : `Completado (${progress.totalStages} de ${progress.totalStages} etapas)`)
                : (en
                    ? `Stage ${progress.stageNumber} of ${progress.totalStages} · ${getStageLabel(preparation.stage, language)}`
                    : `Etapa ${progress.stageNumber} de ${progress.totalStages} · ${getStageLabel(preparation.stage, language)}`)}
            </span>
            <strong>{progress.percent}%</strong>
          </div>
          <div
            className="web-autopilot-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-label={en ? 'Overall preparation progress' : 'Progreso general de la preparación'}
          >
            <div
              className="web-autopilot-progress-fill"
              data-state={progress.state}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}
    </nav>
  );
}
