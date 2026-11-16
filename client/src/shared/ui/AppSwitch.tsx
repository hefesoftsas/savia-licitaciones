import { Switch } from './primitives/switch';

export interface AppSwitchProps {
  checked: boolean;
  /** Optional for switches with a fixed state, such as required options. */
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
  id?: string;
}

/** Shared Radix switch replacing checkbox-based and feature-specific switches. */
export default function AppSwitch({ checked, onCheckedChange, disabled = false, 'aria-label': ariaLabel, id }: AppSwitchProps) {
  return (
    <Switch
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  );
}
