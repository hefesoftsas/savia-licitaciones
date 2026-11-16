import { Dialog, DialogContent, DialogTitle, DialogDescription } from './primitives/dialog';
import type { ReactNode } from 'react';

export interface AppDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Short contextual label displayed above the title. */
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Custom dialog content between the header and footer actions. */
  children?: ReactNode;
  /** Button elements displayed in the footer. */
  actions?: ReactNode;
  /** Additional card classes for dialog-specific width or layout adjustments. */
  cardClassName?: string;
  /** Prevent Escape or overlay dismissal during operations or required choices. */
  preventClose?: boolean;
}

/**
 * Shared application dialog with an overlay, card, descriptive header, and actions.
 * Uses the existing content-regenerate styles and shared-dialog.css transitions.
 */
export default function AppDialog({
  open,
  onOpenChange,
  kicker,
  title,
  description,
  children,
  actions,
  cardClassName,
  preventClose = false,
}: AppDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showClose={!preventClose}
          className={`app-shadcn-dialog${cardClassName ? ` ${cardClassName}` : ' app-shadcn-dialog-default'}`}
          onEscapeKeyDown={preventClose ? (event) => event.preventDefault() : undefined}
          onPointerDownOutside={preventClose ? (event) => event.preventDefault() : undefined}
        >
          <div className="app-dialog-card-head">
            {kicker ? <span className="section-kicker">{kicker}</span> : null}
            <DialogTitle>{title}</DialogTitle>
            {description != null ? <DialogDescription>{description}</DialogDescription> : null}
          </div>
          {children}
          {actions ? <div className="app-dialog-actions">{actions}</div> : null}
        </DialogContent>
    </Dialog>
  );
}
