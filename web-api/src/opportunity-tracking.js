const missing = () => Response.json({error:'not_found'}, {status:404});
const bad = () => Response.json({error:'invalid_input'}, {status:400});
const conflict = () => Response.json({error:'version_conflict'}, {status:409});

export async function opportunityTracking(request, env, ownerId, projectId) {
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, ownerId).first();
  if (!project) return missing();
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT decision, owner, notes, version, updated_at AS updatedAt FROM project_opportunity_tracking WHERE project_id = ?').bind(projectId).first();
    return Response.json(row || {decision:'review',owner:'',notes:'',version:0,updatedAt:null});
  }
  if (request.method !== 'PUT') return new Response('Method not allowed', {status:405});
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({error:'invalid_origin'}, {status:403});
  let input;
  try { input = await request.json(); } catch { return bad(); }
  if (!['review','participate','discarded'].includes(input?.decision) || typeof input.owner !== 'string' || input.owner.length > 120 || typeof input.notes !== 'string' || input.notes.length > 4000 || !Number.isSafeInteger(input.version) || input.version < 0) return bad();
  const now = new Date().toISOString();
  const row = input.version === 0
    ? await env.DB.prepare('INSERT INTO project_opportunity_tracking (project_id,decision,owner,notes,version,updated_at) SELECT ?,?,?,?,1,? WHERE EXISTS (SELECT 1 FROM projects WHERE id = ? AND owner_id = ?) ON CONFLICT(project_id) DO NOTHING RETURNING decision,owner,notes,version,updated_at AS updatedAt').bind(projectId,input.decision,input.owner.trim(),input.notes.trim(),now,projectId,ownerId).first()
    : await env.DB.prepare('UPDATE project_opportunity_tracking SET decision = ?, owner = ?, notes = ?, version = version + 1, updated_at = ? WHERE project_id = ? AND version = ? AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND owner_id = ?) RETURNING decision,owner,notes,version,updated_at AS updatedAt').bind(input.decision,input.owner.trim(),input.notes.trim(),now,projectId,input.version,projectId,ownerId).first();
  if (row) return Response.json(row);
  const exists = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId,ownerId).first();
  return exists ? conflict() : missing();
}
