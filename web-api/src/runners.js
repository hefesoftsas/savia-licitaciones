function secret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function handleRunnerAgent(request, env) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (path === '/api/runners/pair') {
    let input;
    try { input = await request.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 120 || (input?.executionMode !== undefined && input.executionMode !== 'local') || typeof input?.code !== 'string' || !/^[a-f0-9]{64}$/.test(input.code)) {
      return Response.json({ error: 'invalid_pairing' }, { status: 400 });
    }
    const now = Date.now();
    const row = await env.DB.prepare('UPDATE runner_pairings SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ? AND (? = 0 OR EXISTS (SELECT 1 FROM "user" WHERE "user".id = runner_pairings.owner_id AND "user".emailVerified = 1)) RETURNING owner_id')
      .bind(now, await digest(input.code), now, env.AUTH_REQUIRE_VERIFIED_EMAIL === 'true' ? 1 : 0).first();
    if (!row) return Response.json({ error: 'invalid_pairing' }, { status: 401 });
    const token = secret();
    const runner = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), executionMode: 'local' };
    await env.DB.prepare('INSERT INTO runners (id, owner_id, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(runner.id, row.owner_id, runner.name, await digest(token), runner.createdAt).run();
    return Response.json({ runner, token }, { status: 201 });
  }
  if (path === '/api/runners/heartbeat') {
    const row = await authenticateRunner(request, env);
    if(!row)return Response.json({ error: 'unauthorized' }, { status: 401 });
    let input={};try{input=await request.json();}catch{}
    if(input?.supportsConcurrency===true)await env.DB.prepare('UPDATE runners SET supports_concurrency=1 WHERE id=? AND owner_id=?').bind(row.id,row.ownerId).run();
    const settings=await env.DB.prepare('SELECT max_agents AS maxAgents FROM runners WHERE id=? AND owner_id=?').bind(row.id,row.ownerId).first();
    return Response.json({ok:true,maxAgents:settings?.maxAgents??1});
  }
  return new Response('Not found', { status: 404 });
}

export async function handleRunnerUser(request, env, userId) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) {
    return Response.json({ error: 'invalid_origin' }, { status: 403 });
  }
  if (path === '/api/runners/preferences') {
    if(request.method==='GET') { const row=await env.DB.prepare('SELECT interval_seconds FROM runner_poll_preferences WHERE owner_id=?').bind(userId).first();return Response.json({pollSeconds:row?.interval_seconds??10}); }
    if(request.method==='PUT') { let body;try{body=await request.json();}catch{return Response.json({error:'invalid_request'},{status:400});} if(!Number.isInteger(body?.pollSeconds)||body.pollSeconds<10||body.pollSeconds>300)return Response.json({error:'invalid_interval'},{status:400});await env.DB.prepare('INSERT INTO runner_poll_preferences(owner_id,interval_seconds) VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET interval_seconds=excluded.interval_seconds').bind(userId,body.pollSeconds).run();return Response.json({pollSeconds:body.pollSeconds}); }
    return new Response('Method not allowed',{status:405});
  }
  if (path === '/api/runner-pairings' && request.method === 'POST') {
    const code = secret();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    await env.DB.prepare('INSERT INTO runner_pairings (id, owner_id, code_hash, expires_at) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userId, await digest(code), expiresAt).run();
    return Response.json({ code, expiresAt }, { status: 201 });
  }
  if (path === '/api/runners' && request.method === 'GET') {
    const now = Date.now();
    const result = await env.DB.prepare(`SELECT r.id, r.name, r.created_at AS createdAt, r.last_seen_at AS lastSeenAt, r.execution_mode AS executionMode,r.max_agents AS maxAgents,r.supports_concurrency AS supportsConcurrency,
      ((SELECT COUNT(*) FROM jobs j WHERE j.runner_id=r.id AND j.owner_id=r.owner_id AND j.state='running' AND j.lease_expires_at>?) +
       (SELECT COUNT(*) FROM account_jobs j WHERE j.runner_id=r.id AND j.owner_id=r.owner_id AND j.state='running' AND j.lease_expires_at>?)) AS runningJobs,
      ((SELECT COUNT(*) FROM jobs j WHERE j.runner_id=r.id AND j.owner_id=r.owner_id AND j.state='succeeded') + (SELECT COUNT(*) FROM account_jobs j WHERE j.runner_id=r.id AND j.owner_id=r.owner_id AND j.state='succeeded')) AS completedJobs,
      ((SELECT COUNT(*) FROM jobs j WHERE j.runner_id=r.id AND j.owner_id=r.owner_id) + (SELECT COUNT(*) FROM account_jobs j WHERE j.runner_id=r.id AND j.owner_id=r.owner_id)) AS assignedJobs
      FROM runners r WHERE r.owner_id=? AND r.revoked_at IS NULL ORDER BY r.created_at DESC,r.id`)
      .bind(now,now,userId).all();
    const active = await env.DB.prepare(`SELECT j.id,j.project_id AS projectId,p.title AS projectTitle,j.kind,j.state,j.progress,r.name AS runnerName
      FROM jobs j JOIN projects p ON p.id=j.project_id AND p.owner_id=j.owner_id JOIN runners r ON r.id=j.runner_id AND r.owner_id=j.owner_id
      WHERE j.owner_id=? AND j.state='running' AND j.lease_expires_at>? AND r.revoked_at IS NULL AND r.execution_mode='local'
      ORDER BY j.created_at,j.id`).bind(userId,now).all();
    const activeAccount=await env.DB.prepare(`SELECT j.id,NULL AS projectId,NULL AS projectTitle,j.kind,j.state,j.progress,r.name AS runnerName FROM account_jobs j JOIN runners r ON r.id=j.runner_id AND r.owner_id=j.owner_id WHERE j.owner_id=? AND j.state='running' AND j.lease_expires_at>? AND r.revoked_at IS NULL AND r.execution_mode='local' ORDER BY j.created_at,j.id`).bind(userId,now).all();
    const queued=await env.DB.prepare("SELECT (SELECT COUNT(*) FROM jobs WHERE owner_id=? AND state='queued')+(SELECT COUNT(*) FROM account_jobs WHERE owner_id=? AND state='queued') AS count").bind(userId,userId).first();
    return Response.json({ runners: result.results.map(r=>({...r,supportsConcurrency:!!r.supportsConcurrency})), queuedJobs:queued?.count??0, activeJobs:[...active.results,...activeAccount.results], serverTime: new Date().toISOString() });
  }
  const settings=/^\/api\/runners\/([^/]+)\/settings$/.exec(path);
  if(settings&&request.method==='PUT'){
    let input;try{input=await request.json();}catch{return Response.json({error:'invalid_request'},{status:400});}
    if(!Number.isInteger(input?.maxAgents)||input.maxAgents<1||input.maxAgents>4)return Response.json({error:'invalid_limit'},{status:400});
    const row=await env.DB.prepare('UPDATE runners SET max_agents=? WHERE id=? AND owner_id=? AND revoked_at IS NULL AND execution_mode=\'local\' RETURNING max_agents AS maxAgents').bind(input.maxAgents,settings[1],userId).first();
    return row?Response.json(row):Response.json({error:'not_found'},{status:404});
  }
  const match = /^\/api\/runners\/([^/]+)$/.exec(path);
  if (match && request.method === 'DELETE') {
    const row = await env.DB.prepare('UPDATE runners SET revoked_at = ? WHERE id = ? AND owner_id = ? AND revoked_at IS NULL RETURNING id')
      .bind(new Date().toISOString(), match[1], userId).first();
    return row ? new Response(null, { status: 204 }) : Response.json({ error: 'not_found' }, { status: 404 });
  }
  return new Response('Not found', { status: 404 });
}

export async function authenticateRunner(request, env) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') || '');
  if (!match) return null;
  return env.DB.prepare(`UPDATE runners SET last_seen_at = ? WHERE token_hash = ? AND revoked_at IS NULL AND execution_mode = 'local' AND (? = 0 OR EXISTS (SELECT 1 FROM "user" WHERE "user".id = runners.owner_id AND "user".emailVerified = 1)) RETURNING id, owner_id AS ownerId`)
    .bind(new Date().toISOString(), await digest(match[1]), env.AUTH_REQUIRE_VERIFIED_EMAIL === 'true' ? 1 : 0).first();
}
