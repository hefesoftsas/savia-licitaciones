import { Button } from './primitives/button';
import * as Tooltip from '@/shared/ui/primitives/tooltip';
import { useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { useLanguage } from '../i18n';

export type FloatingToolbarActionVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning' | 'success' | 'ai';

export interface FloatingToolbarAction {
  id: string;
  label: string;
  icon?: ReactNode;
  tooltip?: string;
  disabled?: boolean;
  variant?: FloatingToolbarActionVariant;
  className?: string;
  onClick: () => void;
}

export interface FloatingToolbarGroup {
  id: string;
  actions: FloatingToolbarAction[];
}

interface FloatingToolbarProps {
  groups: FloatingToolbarGroup[];
  label?: string;
  docked?: boolean;
}

function FloatingToolbar({ groups, label, docked = false }: FloatingToolbarProps) {
  const { t, language } = useLanguage();
  const resolvedLabel = label ?? t('toolbar.label');
  const dragLabel = t('toolbar.drag');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef({ startX: 0, startY: 0, left: 0, top: 0 });
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const overflowHintId = useId();
  const visibleGroups = groups.filter((group) => group.actions.length > 0);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar || !docked) return;
    const update = () => setOverflow(toolbar.scrollWidth > toolbar.clientWidth + 1);
    const observer = new ResizeObserver(update);
    observer.observe(toolbar);
    toolbar.querySelectorAll('.floating-toolbar-group').forEach(group => observer.observe(group));
    update();
    return () => observer.disconnect();
  }, [docked, groups]);

  if (visibleGroups.length === 0) {
    return null;
  }

  const clampPosition = (left: number, top: number) => {
    const toolbar = toolbarRef.current;
    const isFixed = toolbar ? window.getComputedStyle(toolbar).position === 'fixed' : false;
    const parent = toolbar?.offsetParent as HTMLElement | null;
    const parentRect = isFixed
      ? { width: window.innerWidth, height: window.innerHeight }
      : parent?.getBoundingClientRect();
    const toolbarRect = toolbar?.getBoundingClientRect();

    if (!parentRect || !toolbarRect) {
      return { left, top };
    }

    return {
      left: Math.min(Math.max(12, left), Math.max(12, parentRect.width - toolbarRect.width - 12)),
      top: Math.min(Math.max(12, top), Math.max(12, parentRect.height - toolbarRect.height - 12)),
    };
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const toolbar = toolbarRef.current;
    const isFixed = toolbar ? window.getComputedStyle(toolbar).position === 'fixed' : false;
    const parent = toolbar?.offsetParent as HTMLElement | null;

    if (!toolbar || (!isFixed && !parent)) {
      return;
    }

    const toolbarRect = toolbar.getBoundingClientRect();
    const parentRect = parent?.getBoundingClientRect();
    const currentPosition = position || {
      left: isFixed ? toolbarRect.left : toolbarRect.left - (parentRect?.left || 0),
      top: isFixed ? toolbarRect.top : toolbarRect.top - (parentRect?.top || 0),
    };

    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      ...currentPosition,
    };
    setPosition(clampPosition(currentPosition.left, currentPosition.top));
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragging) {
      return;
    }

    const nextLeft = dragStateRef.current.left + event.clientX - dragStateRef.current.startX;
    const nextTop = dragStateRef.current.top + event.clientY - dragStateRef.current.startY;
    setPosition(clampPosition(nextLeft, nextTop));
  };

  const stopDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragging) {
      return;
    }

    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const resetPosition = () => {
    setPosition(null);
  };

  return (
    <div
      className={`floating-toolbar${docked ? ' is-docked' : ''}${dragging && !docked ? ' is-dragging' : ''}`}
      role="toolbar"
      aria-label={resolvedLabel}
      aria-describedby={overflow && docked ? overflowHintId : undefined}
      tabIndex={overflow && docked ? 0 : undefined}
      ref={toolbarRef}
      style={!docked && position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : undefined}
    >
      {overflow && docked && <span id={overflowHintId} className="sr-only">{language === 'en' ? 'Use the arrow keys to scroll the toolbar.' : 'Usa las flechas para desplazar la barra de acciones.'}</span>}
      {!docked && <Button size="content" variant="ghost"
        type="button"
        className="floating-toolbar-drag-handle"
        aria-label={dragLabel}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onDoubleClick={resetPosition}
      >
        <ToolbarDragIcon />
      </Button>}
      {visibleGroups.map((group, groupIndex) => (
        <div className="floating-toolbar-group" key={group.id}>
          {group.actions.map((action) => (
            <ToolbarButton action={action} key={action.id} />
          ))}
          {groupIndex < visibleGroups.length - 1 && <span className="floating-toolbar-separator" />}
        </div>
      ))}
    </div>
  );
}

function ToolbarDragIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8" cy="7" r="1.35" fill="currentColor" />
      <circle cx="16" cy="7" r="1.35" fill="currentColor" />
      <circle cx="8" cy="12" r="1.35" fill="currentColor" />
      <circle cx="16" cy="12" r="1.35" fill="currentColor" />
      <circle cx="8" cy="17" r="1.35" fill="currentColor" />
      <circle cx="16" cy="17" r="1.35" fill="currentColor" />
    </svg>
  );
}

function ToolbarButton({ action }: { action: FloatingToolbarAction }) {
  const button = (
    <Button size="content" variant="ghost"
      type="button"
      data-help-description={action.tooltip}
      className={`floating-toolbar-button is-${action.variant || 'secondary'}${action.className ? ` ${action.className}` : ''}`}
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {action.icon && <span className="floating-toolbar-icon" aria-hidden="true">{action.icon}</span>}
      <span>{action.label}</span>
    </Button>
  );

  if (!action.tooltip) {
    return button;
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" side="top" align="center" sideOffset={10}>
          {action.tooltip}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function ToolbarArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18 9 12l6-6" />
    </svg>
  );
}

export function ToolbarArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ToolbarDocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3.75h6.7L18 8.05v12.2H7z" />
      <path d="M13.5 4v4.35h4.25" />
      <path d="M9.5 12.2h5" />
      <path d="M9.5 15.7h4" />
    </svg>
  );
}

export function ToolbarSparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 4.5 13.8 9.2 18.5 11 13.8 12.8 12 17.5 10.2 12.8 5.5 11 10.2 9.2z" />
      <path d="M18.6 4.4v3.2" />
      <path d="M17 6h3.2" />
      <path d="M6.2 16.6v2.8" />
      <path d="M4.8 18h2.8" />
    </svg>
  );
}

export function ToolbarOutlineIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6.5 7h11" />
      <path d="M6.5 12h11" />
      <path d="M6.5 17h7" />
      <path d="M3.75 7h.01" />
      <path d="M3.75 12h.01" />
      <path d="M3.75 17h.01" />
    </svg>
  );
}

export default FloatingToolbar;
