import type { AppLocale } from '../../shared/i18n';
import type { ProcurementMarket } from '../../shared/types/secop';

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
    'tpl-es-memoria-tecnica': 'España · Memoria técnica LCSP (A4)',
    'tpl-es-sobre-a-administrativo': 'España · Sobre A y anexos LCSP (A4)',
    'tpl-es-matrices': 'España · Matrices horizontales LCSP (A4)',
    'tpl-system-standard-bid': 'Licitación estándar (versión breve)',
    'tpl-system-a4-visual': 'A4 con gráficos',
    'tpl-system-a3-landscape-visual': 'A3 horizontal con gráficos',
  },
  en: {
    'tpl-co-propuesta': 'Colombia · Technical proposal',
    'tpl-co-anexos': 'Colombia · Attachments and letters',
    'tpl-co-matrices': 'Colombia · Landscape schedules',
    'tpl-es-memoria-tecnica': 'Spain · Technical proposal LCSP (A4)',
    'tpl-es-sobre-a-administrativo': 'Spain · Envelope A & LCSP attachments (A4)',
    'tpl-es-matrices': 'Spain · Landscape schedules LCSP (A4)',
    'tpl-system-standard-bid': 'Standard bid (brief)',
    'tpl-system-a4-visual': 'A4 visual',
    'tpl-system-a3-landscape-visual': 'A3 landscape visual',
  },
};

export function getLocalizedTemplateName(templateId: string, fallbackZh: string, language: AppLocale): string {
  return STR[language]?.[templateId] ?? fallbackZh;
}

/** Filters and orders system export presets according to the active procurement market. */
export function filterSystemTemplatesByMarket<T extends { id: string }>(
  items: T[],
  market: ProcurementMarket = 'ALL',
): T[] {
  if (market === 'ES') {
    const visible = items.filter(item => !item.id.startsWith('tpl-co-'));
    return [
      ...visible.filter(item => item.id.startsWith('tpl-es-')),
      ...visible.filter(item => !item.id.startsWith('tpl-es-')),
    ];
  }
  if (market === 'CO') {
    const visible = items.filter(item => !item.id.startsWith('tpl-es-'));
    return [
      ...visible.filter(item => item.id.startsWith('tpl-co-')),
      ...visible.filter(item => !item.id.startsWith('tpl-co-')),
    ];
  }
  return items;
}

/** Filters document working templates according to the active procurement market. */
export function filterDocumentTemplatesByMarket<T extends { market?: ProcurementMarket }>(
  items: T[],
  market: ProcurementMarket = 'ALL',
): T[] {
  if (market === 'ES' || market === 'CO') {
    return items.filter(item => !item.market || item.market === market);
  }
  return items;
}
