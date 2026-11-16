import { forwardRef, type ComponentProps, type ElementType } from 'react';
import { Button } from '@/shared/ui/primitives/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/primitives/tooltip';

type Props = ComponentProps<typeof Button> & { icon?: ElementType; iconOnly?: boolean };

/** Shared application actions retain their accessible name when presented as an icon. */
export const ActionButton = forwardRef<HTMLButtonElement, Props>(function ActionButton(
  { icon: Icon, iconOnly, children, ...props }, ref,
) {
  if (!Icon) return <Button ref={ref} {...props}>{children}</Button>;
  const label = props['aria-label'] || (typeof children === 'string' ? children : undefined);
  const button = <Button ref={ref} {...props} size={iconOnly ? 'icon' : props.size} aria-label={label} data-icon-action={iconOnly || undefined}>
    <Icon size={16} aria-hidden="true" />
    {iconOnly ? <span className="sr-only">{children}</span> : children}
  </Button>;
  return <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>{button}</TooltipTrigger>
    <TooltipContent>{label || children}</TooltipContent>
  </Tooltip></TooltipProvider>;
});
