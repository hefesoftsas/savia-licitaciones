export interface EconomicOfferItem {
  id: string;
  name: string;
  quantity: string;
  cost: string;
  price: string;
  rate: string;
  discount?: string;
}

export interface EconomicOfferDraft {
  currency: string;
  budget: string;
  items: EconomicOfferItem[];
}

export interface EconomicOfferCalculation {
  items: Array<{
    id: string;
    gross: string;
    discount: string;
    net: string;
    tax: string;
    total: string;
    cost: string | null;
  }>;
  gross: string;
  discount: string;
  net: string;
  tax: string;
  total: string;
  cost: string | null;
  margin: string | null;
  budgetDifference: string | null;
}

export interface EconomicOfferSaved {
  draft: EconomicOfferDraft;
  calculation: EconomicOfferCalculation | null;
  error: string;
  updatedAt: string;
}
