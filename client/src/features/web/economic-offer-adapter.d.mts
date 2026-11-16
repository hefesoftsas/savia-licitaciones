import type { EconomicOfferDraft, EconomicOfferSaved } from '../../shared/types/economicOffer';
export function createEconomicOfferAdapter(api: typeof import('./api.mjs').request, download: (csv: string) => void): {
  get(id: string): Promise<EconomicOfferSaved | null>;
  save(id: string, draft: EconomicOfferDraft): Promise<EconomicOfferSaved>;
  export(id: string, draft: EconomicOfferDraft, language: string): Promise<boolean>;
};
