function unspscClassCode(raw) {
  const text = String(raw || '').trim().replace(/^V1\./i, '');
  if (!/^(?:\d{6}|\d{8})$/.test(text)) return '';
  const result = text.slice(0, 6);
  return result.slice(0, 2) !== '00' && result.slice(2, 4) !== '00' && result.slice(4, 6) !== '00' ? result : '';
}

function cpvPrefix(raw) {
  const text = String(raw || '').trim().replace(/-\d$/, '');
  if (!/^\d{4,8}$/.test(text)) return '';
  // Match at 6-digit or 4-digit significant prefix when trailing zeros are present.
  const trimmed = text.replace(/0+$/, '');
  return trimmed.length >= 4 ? text.slice(0, Math.min(6, Math.max(4, trimmed.length))) : text.slice(0, 4);
}

export function matchReviewedExperience(classificationCode, facts, cpvCodes) {
  const matches = [];
  const seen = new Set();

  const targetUnspsc = unspscClassCode(classificationCode);
  if (targetUnspsc) {
    for (const fact of facts) {
      if (
        /^UNSPSC experiencia #\d+(?:\s|$)/i.test(fact.label) &&
        /^\d{8}$/.test(fact.value) &&
        unspscClassCode(fact.value) === targetUnspsc &&
        Number.isInteger(fact.page) &&
        fact.page > 0
      ) {
        const key = `${fact.value}:${fact.page}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({ code: fact.value, page: fact.page, label: fact.label, kind: 'UNSPSC' });
        }
      }
    }
  }

  const candidateCpvs = [
    ...(Array.isArray(cpvCodes) ? cpvCodes : []),
    ...(classificationCode && (!targetUnspsc || /^\d{8}$/.test(String(classificationCode).trim())) ? [classificationCode] : []),
  ]
    .map(cpvPrefix)
    .filter(Boolean);

  if (candidateCpvs.length) {
    for (const fact of facts) {
      if (
        /^(?:CPV(?:\s+#?\d+)?|Código CPV(?:\s+#?\d+)?)(?:\s|$)/i.test(fact.label) &&
        Number.isInteger(fact.page) &&
        fact.page > 0
      ) {
        const factCpv = cpvPrefix(fact.value);
        if (factCpv && candidateCpvs.some(target => target.startsWith(factCpv) || factCpv.startsWith(target))) {
          const key = `${fact.value}:${fact.page}`;
          if (!seen.has(key)) {
            seen.add(key);
            matches.push({ code: fact.value, page: fact.page, label: fact.label, kind: 'CPV' });
          }
        }
      }
    }
  }

  return matches;
}

export function prioritizeReviewed(rows, facts) {
  const match = [];
  const rest = [];
  for (const row of rows) {
    (matchReviewedExperience(row.classificationCode, facts, row.cpvCodes).length ? match : rest).push(row);
  }
  return [...match, ...rest];
}
