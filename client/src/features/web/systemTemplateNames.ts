import type { AppLocale } from '../../shared/i18n';

const STR: Record<AppLocale, Record<string, string>> = {
  zh: {
    'tpl-system-standard-bid': '标准投标简版',
    'tpl-system-a4-visual': 'A4 图文版',
    'tpl-system-a3-landscape-visual': 'A3 横版图文',
  },
  es: {
    'tpl-co-propuesta': 'Colombia · Propuesta técnica',
    'tpl-co-anexos': 'Colombia · Anexos y cartas',
    'tpl-co-matrices': 'Colombia · Matrices horizontales',
    'tpl-system-standard-bid': 'Licitación estándar (versión breve)',
    'tpl-system-a4-visual': 'A4 con gráficos',
    'tpl-system-a3-landscape-visual': 'A3 horizontal con gráficos',
  },
  en: {
    'tpl-co-propuesta': 'Colombia · Technical proposal',
    'tpl-co-anexos': 'Colombia · Attachments and letters',
    'tpl-co-matrices': 'Colombia · Landscape schedules',
    'tpl-system-standard-bid': 'Standard bid (brief)',
    'tpl-system-a4-visual': 'A4 visual',
    'tpl-system-a3-landscape-visual': 'A3 landscape visual',
  },
};

export function getLocalizedTemplateName(templateId: string, fallbackZh: string, language: AppLocale): string {
  return STR[language]?.[templateId] ?? fallbackZh;
}
