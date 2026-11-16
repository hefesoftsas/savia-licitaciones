// Historical desktop records are preserved verbatim, including review notes and parse issues.
export function validAddendumHistory(runs) {
  if (!Array.isArray(runs) || runs.length > 50) return false;
  const encoder = new TextEncoder();
  if (encoder.encode(JSON.stringify(runs)).length > 900000) return false;
  const ids = new Set();
  return runs.every(run => {
    if (!run || typeof run.id !== 'string' || !run.id || run.id.length > 200 || ids.has(run.id) || !['completed', 'error', 'interrupted'].includes(run.status) || run.historical !== true || !Array.isArray(run.reviews) || encoder.encode(JSON.stringify(run)).length > 262144) return false;
    ids.add(run.id);
    return true;
  });
}
export async function restoreAddendumHistory({runs, server, requestId, send}) {
  if (!validAddendumHistory(runs)) throw new Error('El historial de adendas no puede restaurarse sin pérdidas.');
  await send(`${server}/api/runner/imports/technical-plan/${encodeURIComponent(requestId)}/addenda`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({runs})});
}
