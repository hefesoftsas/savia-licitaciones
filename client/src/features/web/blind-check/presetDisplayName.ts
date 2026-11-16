import type { BlindCheckPreset } from './types';
export function presetDisplayName(preset: BlindCheckPreset | null | undefined, language: string): string {
  if (!preset) return '';
  const names: Record<string, [string, string]> = {
    'builtin-general': ['General', 'General'],
    'builtin-neimenggu': ['Mongolia Interior (referencia)', 'Inner Mongolia (reference)'],
    'builtin-hebei': ['Hebei (referencia)', 'Hebei (reference)'],
    'builtin-sichuan': ['Sichuan (referencia)', 'Sichuan (reference)'],
  };
  return names[preset.id]?.[language === 'es' ? 0 : 1] || preset.name;
}
