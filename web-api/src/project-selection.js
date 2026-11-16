export async function projectSelection(request, env, ownerId, workspaceId = ownerId) {
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT s.project_id FROM project_selection s JOIN projects p ON p.id=s.project_id AND p.owner_id=? WHERE s.owner_id=?').bind(workspaceId,ownerId).first();
    return Response.json({projectId: row?.project_id || null});
  }
  if (request.method !== 'PUT') return new Response('Method not allowed', {status:405});
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({error:'invalid_origin'}, {status:403});
  let input;
  try { input = await request.json(); } catch { return Response.json({error:'invalid_json'}, {status:400}); }
  if (typeof input?.projectId !== 'string' || !input.projectId) return Response.json({error:'invalid_project'}, {status:400});
  const saved = await env.DB.prepare('INSERT INTO project_selection(owner_id,project_id) SELECT ?,id FROM projects WHERE id=? AND owner_id=? ON CONFLICT(owner_id) DO UPDATE SET project_id=excluded.project_id RETURNING project_id').bind(ownerId,input.projectId,workspaceId).first();
  return saved ? Response.json({projectId:saved.project_id}) : Response.json({error:'not_found'}, {status:404});
}
