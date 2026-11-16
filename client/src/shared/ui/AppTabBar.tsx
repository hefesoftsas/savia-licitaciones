import type { ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger } from './primitives/tabs';
import { cn } from '../utils/cn';

export interface AppTab<T extends string> {
  id: T;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
  className?: string;
  triggerId?: string;
}

/** Controlled tab navigation for panels whose lifecycle is owned by their workflow. */
export default function AppTabBar<T extends string>({ value, onValueChange, items, label, className, panelId }: {
  value: T;
  onValueChange: (value: T) => void;
  items: AppTab<T>[];
  label: string;
  className?: string;
  panelId?: string;
}) {
  return <Tabs value={value} onValueChange={next => onValueChange(next as T)} className="app-tab-bar">
    <TabsList aria-label={label} className={cn('app-tab-list', className)}>
      {items.map(item => <TabsTrigger key={item.id} value={item.id} id={item.triggerId}
        disabled={item.disabled} title={item.title} aria-controls={panelId}
        className={cn('document-switch-tab', item.className, value === item.id && 'is-active')}>
        {item.label}
      </TabsTrigger>)}
    </TabsList>
  </Tabs>;
}
