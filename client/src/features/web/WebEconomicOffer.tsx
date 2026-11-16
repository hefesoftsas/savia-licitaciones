import { useMemo } from 'react';
import EconomicOffer from './secop/EconomicOffer';
import { request } from './api.mjs';
import { createEconomicOfferAdapter } from './economic-offer-adapter.mjs';

export default function WebEconomicOffer({ projectId, language }: { projectId: string; language: 'es' | 'en' }) {
  const adapter = useMemo(() => createEconomicOfferAdapter(request, csv => {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'oferta-economica.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }), []);
  return <EconomicOffer processId={projectId} adapter={adapter} languageOverride={language} />;
}
