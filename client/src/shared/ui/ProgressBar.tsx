import type { CSSProperties } from 'react';

export type ProgressBarTone = 'primary' | 'success' | 'warning' | 'sky' | 'violet';

export interface ProgressBarProps {
  /** Progress percentage, clamped internally to 0–100. */
  value: number;
  /** Accessible description, such as "Parsing progress: 40%". */
  label?: string;
  /** Semantic tone: primary by default, success for planning, warning for length adjustment, sky for audit, violet for images. */
  tone?: ProgressBarTone;
  /** Show a shimmer animation while the task is running. */
  active?: boolean;
  className?: string;
}

/** Shared progress track whose width is controlled by the --progress CSS variable.
 * A span root keeps the markup valid inside buttons such as tab triggers. */
export default function ProgressBar({ value, label, tone = 'primary', active = false, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <span
      className={`savia-progress-track${tone !== 'primary' ? ` is-${tone}` : ''}${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      style={{ '--progress': `${clamped}%` } as CSSProperties}
    >
      <span />
    </span>
  );
}
