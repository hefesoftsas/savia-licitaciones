import type { ProcurementMarket, SecopProcess } from '@/shared/types/secop';

export interface FormatLocaleOptions {
  currency?: string;
  country?: string | null;
  source?: string | null;
  market?: ProcurementMarket;
  empty?: string;
}

export interface FormatDateOptions extends FormatLocaleOptions {
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
  timeStyle?: 'full' | 'long' | 'medium' | 'short';
  timeZone?: string;
}

export function isSpainMarket(source?: string | null, country?: string | null, market?: ProcurementMarket): boolean;
export function numberLocaleFor(language: string, options?: FormatLocaleOptions): string;
export function dateLocaleFor(language: string, options?: FormatLocaleOptions): string;
export function formatSecopValue(process: { value?: number | null; currency?: string; currencyVerified?: boolean; country?: string | null; source?: string | null }, language: string, empty?: string): string;
export function formatNumberValue(value: number | null | undefined, language: string, options?: FormatLocaleOptions): string;
export function formatDateValue(value: string | null | undefined, language: string, options?: FormatDateOptions): string;
export function formatDeadline(process: Partial<SecopProcess>, language: string): string;
export function officialTenderUrl(process: Partial<SecopProcess> | null | undefined): string | undefined;
export function sourceDisplayName(source?: string | null, language?: string): string;
