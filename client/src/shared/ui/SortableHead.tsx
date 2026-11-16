import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TableHead } from '@/shared/ui/primitives/table';
import { cn } from '@/shared/utils/cn';

/**
 * Clickable table header cell with ascending/descending sort indicator and aria-sort.
 */
export function SortableHead({
  label,
  active,
  direction,
  onToggle,
  className,
}: {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onToggle: () => void;
  className?: string;
}) {
  return (
    <TableHead
      className={className}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={cn('web-sort-head-btn', active && 'is-active')}
        onClick={onToggle}
      >
        <span>{label}</span>
        {active ? (
          direction === 'asc' ? (
            <ArrowUp size={13} aria-hidden="true" />
          ) : (
            <ArrowDown size={13} aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown size={13} aria-hidden="true" />
        )}
      </button>
    </TableHead>
  );
}
