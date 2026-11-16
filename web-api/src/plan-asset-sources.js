export const planAssetFingerprintSql = 'SELECT json_group_array(json_array(id, content_hash)) AS fingerprint FROM (SELECT id, content_hash FROM project_plan_assets WHERE project_id = ? ORDER BY id)';
export async function planAssetFingerprint(env, projectId) {
 const row = await env.DB.prepare(planAssetFingerprintSql).bind(projectId).first();
 return row.fingerprint;
}
