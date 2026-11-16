import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: ReactNode;
  /** Description displayed below the title. */
  hint?: ReactNode;
  /** Optional action that guides the user to the next step. */
  children?: ReactNode;
  className?: string;
}

/** Shared centered empty-state card with a dashed border and optional action. */
export default function EmptyState({ title, hint, children, className }: EmptyStateProps) {
  return (
    <div className={`savia-empty-state${className ? ` ${className}` : ''}`}>
      <strong>{title}</strong>
      {hint != null ? <span>{hint}</span> : null}
      {children}
    </div>
  );
}
