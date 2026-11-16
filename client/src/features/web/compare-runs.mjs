export function compareRuns(runs) {
  const entries = runs.map(run => (run.result?.criteria || []).map(criterion => {
    const source = run.tenderSources.find(item => item.id === criterion.tenderSourceId);
    const key = source?.text && criterion.tenderQuote ? JSON.stringify([criterion.tenderSourceId, source.text, criterion.tenderQuote]) : '';
    return { criterion, key, review: run.reviews.find(item => item.criterionId === criterion.id) || null };
  }));
  const ambiguous = new Set();
  for (const list of entries) {
    const seen = new Set();
    for (const entry of list) if (entry.key) { if (seen.has(entry.key)) ambiguous.add(entry.key); seen.add(entry.key); }
  }
  const groups = new Map(), rows = [];
  entries.forEach((list, index) => list.forEach(entry => {
    const key = entry.key && !ambiguous.has(entry.key) ? entry.key : null;
    let row = key && groups.get(key);
    if (!row) { row = { criterion: entry.criterion, cells: Array(runs.length).fill(null) }; rows.push(row); if (key) groups.set(key, row); }
    row.cells[index] = { criterion: entry.criterion, review: entry.review };
  }));
  return rows;
}
