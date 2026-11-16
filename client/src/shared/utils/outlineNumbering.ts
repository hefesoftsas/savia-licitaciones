/**
 * Outline numbering utilities. Each heading level independently selects Word multilevel numbering or a
 * custom template.
 */

import type { TechnicalPlanOutlineItem } from '../types/outline';
import type { HeadingStyleConfig } from '../types/exportFormat';

/**
 * Convert Arabic numbers 1-9999 into Chinese numerals: examples include one, ten, eleven, twenty-one, and
 * one hundred and one.
 */
export function numberToChinese(num: number): string {
  const n = Math.max(1, Math.min(9999, Math.floor(num)));
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const tens = ['', '十', '二十', '三十', '四十', '五十', '六十', '七十', '八十', '九十'];
  if (n <= 9) return digits[n];
  if (n <= 19) return `十${n === 10 ? '' : digits[n - 10]}`;
  if (n <= 99) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return `${tens[t]}${o ? digits[o] : ''}`;
  }
  if (n <= 999) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    if (r === 0) return `${digits[h]}百`;
    if (r <= 9) return `${digits[h]}百零${digits[r]}`;
    return `${digits[h]}百${numberToChinese(r)}`;
  }
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  if (r === 0) return `${digits[th]}千`;
  if (r < 100) return `${digits[th]}千零${numberToChinese(r)}`;
  return `${digits[th]}千${numberToChinese(r)}`;
}

function numberToCircled(num: number): string {
  const circled = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
  return circled[num - 1] || String(num);
}

function numberToAlpha(num: number, upper = false): string {
  let n = Math.max(1, Math.floor(num));
  let value = '';
  while (n > 0) {
    n -= 1;
    value = String.fromCharCode(97 + (n % 26)) + value;
    n = Math.floor(n / 26);
  }
  return upper ? value.toUpperCase() : value;
}

function numberToRoman(num: number, upper = false): string {
  let n = Math.max(1, Math.min(3999, Math.floor(num)));
  const pairs: Array<[number, string]> = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
    [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let value = '';
  pairs.forEach(([amount, symbol]) => {
    while (n >= amount) {
      value += symbol;
      n -= amount;
    }
  });
  return upper ? value.toUpperCase() : value;
}

/**
 * Split an outline display number into valid numeric levels.
 */
export function outlineNumberParts(number: string): number[] {
  return String(number || '')
    .split('.')
    .map((part) => parseInt(part, 10))
    .filter((part) => Number.isFinite(part) && part > 0);
}

type HeadingNumberingConfig = Pick<HeadingStyleConfig, 'numbering_format' | 'numbering_template'>;

/**
 * Generate a numbering prefix from the outline display number and heading-numbering configuration.
 */
export function formatOutlineNumber(number: string, heading: HeadingNumberingConfig | null | undefined): string {
  const parts = outlineNumberParts(number);
  if (!parts.length) return '';

  if (heading?.numbering_format === 'outline-decimal') {
    return parts.join('.');
  }

  if (heading?.numbering_format !== 'custom') return '';

  const lastPart = parts[parts.length - 1];
  const cn = numberToChinese(lastPart);
  const tail = (parts.length >= 3 ? parts.slice(2) : [lastPart]).join('.');
  return String(heading.numbering_template || '')
    .replace(/\{tail(\d+)\}/g, (_, level: string) => {
      const startLevel = Number(level);
      if (!Number.isFinite(startLevel) || startLevel < 1 || startLevel > 6 || startLevel > parts.length) return '';
      return parts.slice(startLevel - 1).join('.');
    })
    .replace(/\{zh\}/g, cn)
    .replace(/\{num\}/g, String(lastPart))
    .replace(/\{tail\}/g, tail)
    .replace(/\{full\}/g, parts.join('.'))
    .replace(/\{circled\}/g, numberToCircled(lastPart))
    .replace(/\{alpha\}/g, numberToAlpha(lastPart))
    .replace(/\{ALPHA\}/g, numberToAlpha(lastPart, true))
    .replace(/\{roman\}/g, numberToRoman(lastPart))
    .replace(/\{ROMAN\}/g, numberToRoman(lastPart, true))
    .trim();
}

function shouldInsertSpaceAfterNumber(prefix: string): boolean {
  return !/[、，。；：）)】\]》〉]$/.test(prefix);
}

/**
 * Combine outline number and title into the full heading using the specified numbering format.
 */
export function formatOutlineTitle(number: string, title: string, heading: HeadingNumberingConfig | null | undefined, language?: string): string {
  const legacyTemplate = (language === 'es' || language === 'en') && heading?.numbering_format === 'custom'
    ? (heading.numbering_template === '第{zh}章' ? (language === 'en' ? 'Chapter {num}' : 'Capítulo {num}') : heading.numbering_template === '第{zh}节' ? (language === 'en' ? 'Section {num}' : 'Sección {num}') : undefined)
    : undefined;
  const displayHeading = legacyTemplate && heading ? { ...heading, numbering_template: legacyTemplate } : heading;
  const prefix = formatOutlineNumber(number, displayHeading);
  if (!prefix) return String(title || '');
  return `${prefix}${shouldInsertSpaceAfterNumber(prefix) ? ' ' : ''}${title || ''}`;
}

/** Sorting drafts immediately update display numbering while preserving node IDs and selection. */
export function numberTechnicalPlanOutline(items: TechnicalPlanOutlineItem[], prefix = ''): TechnicalPlanOutlineItem[] {
  return items.map((item, index) => {
    const number = prefix ? `${prefix}.${index + 1}` : String(index + 1);
    return { ...item, number, ...(item.children?.length ? { children: numberTechnicalPlanOutline(item.children, number) } : {}) };
  });
}
