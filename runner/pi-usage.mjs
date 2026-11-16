const fields = ['input', 'output', 'cacheRead', 'cacheWrite'];
export function createPiUsageCollector() {
  const totals = {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reportedCalls: 0, unreportedCalls: 0};
  return {
    add(usage) {
      const values = fields.map(field => usage?.[field]);
      const valid = values.every(value => Number.isSafeInteger(value) && value >= 0);
      const sum = valid ? values.reduce((total, value) => total + value, 0) : NaN;
      if (!valid || !Number.isSafeInteger(sum) || sum === 0 || usage?.totalTokens !== sum || fields.some((field, index) => !Number.isSafeInteger(totals[field] + values[index]))) { totals.unreportedCalls++; return; }
      fields.forEach((field, index) => { totals[field] += values[index]; });
      totals.reportedCalls++;
    },
    snapshot() { return {...totals}; },
  };
}
