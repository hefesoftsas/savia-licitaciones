import {matchReviewedExperience, prioritizeReviewed} from './secop/rupClassificationMatch.mjs';

export async function loadOpportunityRup(request) {
  const data = await request('/api/rup/facts');
  return data.certificateId && Array.isArray(data.facts) ? data.facts : [];
}
export function opportunityMatch(item, facts) {
  return matchReviewedExperience(item.classificationCode, facts);
}
export function opportunityRows(rows, facts, prioritize) {
  return prioritize ? prioritizeReviewed(rows, facts) : rows;
}
