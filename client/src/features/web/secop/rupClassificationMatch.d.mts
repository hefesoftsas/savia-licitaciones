export function matchReviewedExperience(
  classificationCode: string | undefined,
  facts: Array<{ label: string; value: string; page: number }>,
  cpvCodes?: string[],
): Array<{ code: string; page: number; label: string; kind: 'UNSPSC' | 'CPV' }>;

export function prioritizeReviewed<T extends { classificationCode?: string; cpvCodes?: string[] }>(
  rows: T[],
  facts: Array<{ label: string; value: string; page: number }>,
): T[];
