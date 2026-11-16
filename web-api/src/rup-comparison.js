import { requiresRupInterpretation } from '../../client/src/features/web/secop/rupComparison.mjs';

const bad = () => Response.json({ error: 'invalid_input' }, { status: 400 });
const missing = () => Response.json({ error: 'not_found' }, { status: 404 });
const conflict = () => Response.json({ error: 'version_conflict' }, { status: 409 });
const version = value => Number.isSafeInteger(value) && value >= 0;
const numeric = value => typeof value === 'string' && value.length <= 80 && /^[+-]?\d+(?:[.,]\d+)?$/.test(value);
const documentsSql = 'SELECT json_group_array(id) AS fingerprint FROM (SELECT id FROM project_files WHERE project_id = ? ORDER BY id)';
async function documents(env, projectId) { return (await env.DB.prepare(documentsSql).bind(projectId).first()).fingerprint; }
function snapshot(row, fingerprint) {
  return { factId: row.fact_id, certificateId: row.certificate_id, certificateName: row.certificate_name, issuedOn: row.issued_on, label: row.fact_label, value: row.fact_value, interpretedValue: row.interpreted_value, page: row.fact_page, title: row.requirement_title, source: row.requirement_source, operator: row.operator, threshold: row.threshold, updatedAt: row.updated_at, version: row.version,
    stale: row.documents_fingerprint !== fingerprint || row.current_certificate_id !== row.certificate_id || row.current_issued_on !== row.issued_on || row.current_fact_id !== row.fact_id || row.current_label !== row.fact_label || row.current_value !== row.fact_value || row.current_page !== row.fact_page || row.current_title !== row.requirement_title || row.current_source !== row.requirement_source };
}
export async function comparisonsForProject(env, ownerId, projectId) {
  const [files, result] = await env.DB.batch([env.DB.prepare(documentsSql).bind(projectId), env.DB.prepare(`SELECT c.*, r.title AS current_title, r.source AS current_source, rc.certificate_id AS current_certificate_id, cert.issued_on AS current_issued_on,
    f.id AS current_fact_id, f.label AS current_label, f.value AS current_value, f.page AS current_page
    FROM rup_requirement_comparisons c JOIN project_requirements r ON r.id = c.requirement_id AND r.project_id = c.project_id
    LEFT JOIN rup_current rc ON rc.owner_id = ? LEFT JOIN rup_certificates cert ON cert.id = rc.certificate_id
    LEFT JOIN rup_reviewed_facts f ON f.id = c.fact_id AND f.certificate_id = rc.certificate_id
    WHERE c.project_id = ?`).bind(ownerId, projectId)]);
  const fingerprint = files.results[0].fingerprint;
  return new Map(result.results.map(row => [row.requirement_id, snapshot(row, fingerprint)]));
}
export async function rupComparison(request, env, ownerId, projectId, requirementId) {
  const requirement = await env.DB.prepare('SELECT r.* FROM project_requirements r JOIN projects p ON p.id = r.project_id WHERE r.id = ? AND r.project_id = ? AND p.owner_id = ?').bind(requirementId, projectId, ownerId).first();
  if (!requirement) return missing();
  if (request.method === 'GET') return Response.json({ comparison: (await comparisonsForProject(env, ownerId, projectId)).get(requirementId) || null });
  if (request.method !== 'PUT') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  let input; try { input = await request.json(); } catch { return bad(); }
  if (!input || typeof input.factId !== 'string' || !version(input.factVersion) || !version(input.certificateVersion) || !version(input.requirementVersion) || !version(input.version) || !['gte', 'lte'].includes(input.operator) || (typeof input.threshold !== 'string' || !numeric(input.threshold.trim())) || typeof input.interpretedValue !== 'undefined' && typeof input.interpretedValue !== 'string' || !requirement.source.trim()) return bad();
  const source = await env.DB.prepare(`SELECT c.certificate_id, c.version AS certificate_version, p.name, p.issued_on, f.id AS fact_id, f.label, f.value, f.page, f.version AS fact_version
    FROM rup_current c JOIN rup_certificates p ON p.id = c.certificate_id AND p.owner_id = c.owner_id
    JOIN rup_reviewed_facts f ON f.certificate_id = p.id WHERE c.owner_id = ? AND f.id = ?`).bind(ownerId, input.factId).first();
  if (!source) return missing();
  if (source.certificate_version !== input.certificateVersion || source.fact_version !== input.factVersion || requirement.version !== input.requirementVersion) return conflict();
  const interpretation = requiresRupInterpretation(source.value) ? (input.interpretedValue || '').trim() : '';
  if (requiresRupInterpretation(source.value) && !numeric(interpretation)) return bad();
  const fingerprint = await documents(env, projectId), now = new Date().toISOString();
  const saved = await env.DB.prepare(`INSERT INTO rup_requirement_comparisons (requirement_id, project_id, fact_id, certificate_id, certificate_name, issued_on, fact_label, fact_value, fact_page, requirement_title, requirement_source, operator, threshold, interpreted_value, documents_fingerprint, version, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ? WHERE EXISTS (SELECT 1 FROM project_requirements WHERE id = ? AND project_id = ? AND version = ?)
      AND EXISTS (SELECT 1 FROM rup_current c JOIN rup_reviewed_facts f ON f.certificate_id = c.certificate_id WHERE c.owner_id = ? AND c.certificate_id = ? AND c.version = ? AND f.id = ? AND f.version = ?)
      AND (${documentsSql}) = ? AND (? = 0 OR EXISTS (SELECT 1 FROM rup_requirement_comparisons WHERE requirement_id = ? AND version = ?))
    ON CONFLICT(requirement_id) DO UPDATE SET fact_id = excluded.fact_id, certificate_id = excluded.certificate_id, certificate_name = excluded.certificate_name, issued_on = excluded.issued_on, fact_label = excluded.fact_label, fact_value = excluded.fact_value, fact_page = excluded.fact_page, requirement_title = excluded.requirement_title, requirement_source = excluded.requirement_source, operator = excluded.operator, threshold = excluded.threshold, interpreted_value = excluded.interpreted_value, documents_fingerprint = excluded.documents_fingerprint, version = rup_requirement_comparisons.version + 1, updated_at = excluded.updated_at WHERE rup_requirement_comparisons.version = ? RETURNING version`)
    .bind(requirementId, projectId, source.fact_id, source.certificate_id, source.name, source.issued_on, source.label, source.value, source.page, requirement.title, requirement.source, input.operator, input.threshold.trim(), interpretation, fingerprint, now, requirementId, projectId, input.requirementVersion, ownerId, source.certificate_id, input.certificateVersion, source.fact_id, input.factVersion, projectId, fingerprint, input.version, requirementId, input.version, input.version).first();
  if (!saved) return conflict();
  return Response.json({ comparison: (await comparisonsForProject(env, ownerId, projectId)).get(requirementId) || null });
}
