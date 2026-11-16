import { Check, ChevronDown } from 'lucide-react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Close as PopoverClose, Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/primitives/popover';
import { cn } from '@/shared/utils/cn';

export type SelectOption = {
  value: string;
  label: string;
};

/**
 * Styled dropdown selector built on Radix Popover so forms and toolbars avoid
 * inconsistent native OS <select> rendering.
 */
export function SelectField({
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
  fullWidth = true,
  align = 'start',
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  fullWidth?: boolean;
  align?: 'start' | 'center' | 'end';
  className?: string;
  'aria-label'?: string;
}) {
  const active = options.find((item) => item.value === value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn('web-select-trigger', fullWidth && 'is-full', className)}
        >
          <span className="web-select-trigger-label">{active?.label ?? placeholder ?? ''}</span>
          <ChevronDown size={14} className="web-select-trigger-icon" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn('web-select-menu', fullWidth && 'is-full')}
        style={{ pointerEvents: 'auto' }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <PopoverClose asChild key={option.value}>
              <button
                type="button"
                className={cn('web-select-option', selected && 'is-selected')}
                onClick={() => onChange(option.value)}
              >
                <span className="web-select-option-label">{option.label}</span>
                {selected && <Check size={14} className="web-select-option-check" aria-hidden="true" />}
              </button>
            </PopoverClose>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
