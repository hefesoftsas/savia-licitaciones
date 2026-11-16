import { Button } from './primitives/button';
import type { ReactNode } from 'react';
import { ChevronRightIcon } from '@radix-ui/react-icons';

export interface OptionCardItem<T extends string> {
  value: T;
  title: ReactNode;
  /** Short description, such as duration or the reason an option is unavailable. */
  description?: ReactNode;
  /** Icon displayed in a rounded container on the left. */
  icon?: ReactNode;
  disabled?: boolean;
}

export interface OptionCardListProps<T extends string> {
  options: OptionCardItem<T>[];
  /** Run the action immediately when the card is clicked. */
  onSelect: (value: T) => void;
  /** Highlight a recommended or previously selected option with a primary border. */
  highlightedValue?: T;
  /** Badge beside the highlighted option title, such as "Last selected". */
  highlightLabel?: string;
  'aria-label'?: string;
  className?: string;
}

/** Action cards for dialogs where selecting an option starts it immediately. */
export default function OptionCardList<T extends string>({
  options,
  onSelect,
  highlightedValue,
  highlightLabel,
  'aria-label': ariaLabel,
  className,
}: OptionCardListProps<T>) {
  return (
    <div className={`savia-option-card-list${className ? ` ${className}` : ''}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const highlighted = option.value === highlightedValue;
        return (
          <Button size="content" variant="ghost"
            type="button"
            key={option.value}
            className={`savia-option-card${highlighted ? ' is-highlighted' : ''}`}
            disabled={option.disabled}
            onClick={() => onSelect(option.value)}
          >
            {option.icon != null ? <span className="savia-option-card-icon" aria-hidden="true">{option.icon}</span> : null}
            <span className="savia-option-card-body">
              <span className="savia-option-card-title">
                <strong>{option.title}</strong>
                {highlighted && highlightLabel ? <span className="savia-option-card-badge">{highlightLabel}</span> : null}
              </span>
              {option.description != null ? <span className="savia-option-card-description">{option.description}</span> : null}
            </span>
            <ChevronRightIcon className="savia-option-card-arrow" aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
}
