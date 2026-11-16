export const documentsSql = 'SELECT json_group_array(id) AS fingerprint FROM (SELECT id FROM project_files WHERE project_id = ? ORDER BY id)';
export const factsSql = 'SELECT json_group_array(json_array(id, version)) AS fingerprint FROM (SELECT id, version FROM rup_reviewed_facts WHERE certificate_id = ? ORDER BY id)';
export async function captureRequirementSources(env, ownerId, projectId, includeRup) {
  const requests = [env.DB.prepare(documentsSql).bind(projectId)];
  if (includeRup) requests.push(env.DB.prepare('SELECT c.certificate_id, c.version FROM rup_current c WHERE c.owner_id = ?').bind(ownerId), env.DB.prepare('SELECT f.id, f.label, f.value, f.page, f.version FROM rup_reviewed_facts f JOIN rup_current c ON c.certificate_id = f.certificate_id WHERE c.owner_id = ? ORDER BY f.id').bind(ownerId));
  const data = await env.DB.batch(requests);
  const documentsFingerprint = data[0].results[0].fingerprint;
  if (!includeRup) return { documentsFingerprint, includeRup: false, facts: [] };
  const current = data[1].results[0]; if (!current?.certificate_id) return null;
  const facts = data[2].results;
  return { documentsFingerprint, includeRup: true, rupCertificateId: current.certificate_id, rupCertificateVersion: current.version, rupFactsFingerprint: JSON.stringify(facts.map(fact => [fact.id, fact.version])), facts };
}
export function sameRequirementSources(saved, current) {
  return Boolean(saved && current && saved.documentsFingerprint === current.documentsFingerprint && saved.includeRup === current.includeRup && (!saved.includeRup || (saved.rupCertificateId === current.rupCertificateId && saved.rupCertificateVersion === current.rupCertificateVersion && saved.rupFactsFingerprint === current.rupFactsFingerprint)));
}
export function sourceGuard(snapshot, projectId, ownerId) {
  return { sql: `(${documentsSql}) = ? AND (? = 0 OR EXISTS (SELECT 1 FROM rup_current WHERE owner_id = ? AND certificate_id = ? AND version = ? AND (${factsSql}) = ?))`,
    args: [projectId, snapshot.documentsFingerprint, snapshot.includeRup ? 1 : 0, ownerId, snapshot.rupCertificateId || '', snapshot.rupCertificateVersion ?? 0, snapshot.rupCertificateId || '', snapshot.rupFactsFingerprint || '[]'] };
}
