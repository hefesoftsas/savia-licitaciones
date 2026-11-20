import {deleteProject} from './project-delete.js';
import {uploadProjectFile} from './project-web-upload.js';
import {projectWebMultipart} from './project-web-multipart.js';
import {cleanupDesktopUploads, uploadLeaseMs} from './desktop-file-cleanup.js';

export async function handleProjects(request, env, userId, tenantCountry) {
  const url = new URL(request.url);
  const fixedCountry = tenantCountry === 'ES' || tenantCountry === 'CO' ? tenantCountry : null;
  const multipart = /^\/api\/projects\/([^/]+)\/files\/multipart\/(start|complete|abort|part)(?:\/([^/]+))?$/.exec(url.pathname);
  if (multipart) return projectWebMultipart(request, env, userId, multipart[1], multipart[2], multipart[3]);
  const fileMatch = /^\/api\/projects\/([^/]+)\/files(?:\/([^/]+))?$/.exec(url.pathname);
  if (fileMatch) return handleFiles(request, env, userId, fileMatch[1], fileMatch[2]);
  const match = /^\/api\/projects(?:\/([^/]+))?$/.exec(url.pathname);
  if (!match) return null;

  if(request.method==='DELETE' && match[1])return deleteProject(request,env,userId,match[1]);

  if (request.method === 'POST' && !match[1]) {
    if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) {
      return Response.json({ error: 'invalid_origin' }, { status: 403 });
    }
    let payload;
    try { payload = await request.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
    const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
    if (!title || title.length > 300) return Response.json({ error: 'invalid_title' }, { status: 400 });
    const market = payload?.market ?? 'ALL';
    if (!['CO', 'ES', 'ALL'].includes(market)) return Response.json({ error: 'invalid_market' }, { status: 400 });
    const country = fixedCountry ?? (market === 'ALL' ? 'CO' : market);
    const project = { id: crypto.randomUUID(), title, createdAt: new Date().toISOString() };
    await env.DB.prepare('INSERT INTO projects (id, owner_id, title, created_at, country) VALUES (?, ?, ?, ?, ?)')
      .bind(project.id, userId, project.title, project.createdAt, country).run();
    return Response.json({ project }, { status: 201 });
  }
  if (request.method === 'GET' && !match[1]) {
    const market = url.searchParams.get('market') ?? 'ALL';
    if (!['CO', 'ES', 'ALL'].includes(market)) return Response.json({ error: 'invalid_market' }, { status: 400 });
    const country = fixedCountry ?? (market === 'ALL' ? null : market);
    const countryFilter = country ? `AND CASE
      WHEN opportunity.source IN ('placsp', 'ted') THEN 'ES'
      WHEN opportunity.source IN ('secop-i', 'secop-ii', 'contratos') THEN 'CO'
      WHEN json_extract(opportunity.process_json, '$.country') IN ('CO', 'ES')
        THEN json_extract(opportunity.process_json, '$.country')
      ELSE COALESCE(p.country, ?)
    END = ?` : '';
    const result = await env.DB.prepare(`SELECT p.id, p.title, p.created_at AS createdAt,
      (SELECT COUNT(*) FROM project_files f WHERE f.project_id=p.id) AS fileCount,
      (SELECT json_extract(s.process_json,'$.entity') FROM project_secop s WHERE s.project_id=p.id AND s.owner_id=p.owner_id) AS tenderEntity,
      (SELECT json_extract(s.process_json,'$.reference') FROM project_secop s WHERE s.project_id=p.id AND s.owner_id=p.owner_id) AS tenderReference,
      (SELECT json_extract(s.process_json,'$.status') FROM project_secop s WHERE s.project_id=p.id AND s.owner_id=p.owner_id) AS tenderStatus,
      (SELECT json_extract(s.process_json,'$.deadline') FROM project_secop s WHERE s.project_id=p.id AND s.owner_id=p.owner_id) AS tenderDeadline,
      (SELECT json_extract(s.process_json,'$.value') FROM project_secop s WHERE s.project_id=p.id AND s.owner_id=p.owner_id) AS tenderValue,
      (SELECT json_extract(s.process_json,'$.currency') FROM project_secop s WHERE s.project_id=p.id AND s.owner_id=p.owner_id) AS tenderCurrency,
      (SELECT json_extract(s.process_json,'$.department') FROM project_secop s WHERE s.project_id=p.id AND s.owner_id=p.owner_id) AS tenderDepartment,
      (SELECT json_extract(s.process_json,'$.source') FROM project_secop s WHERE s.project_id=p.id AND s.owner_id=p.owner_id) AS tenderSource,
      (SELECT json_extract(s.process_json,'$.country') FROM project_secop s WHERE s.project_id=p.id AND s.owner_id=p.owner_id) AS tenderCountry,
      (SELECT json_extract(s.process_json,'$.territory') FROM project_secop s WHERE s.project_id=p.id AND s.owner_id=p.owner_id) AS tenderTerritory,
      (EXISTS(SELECT 1 FROM project_technical_analyses a WHERE a.project_id=p.id)
       OR EXISTS(SELECT 1 FROM project_technical_plan_nodes n WHERE n.project_id=p.id)) AS hasPreparation,
      (EXISTS(SELECT 1 FROM project_technical_plan_nodes n WHERE n.project_id=p.id AND length(trim(n.content))>0)
       OR EXISTS(SELECT 1 FROM technical_batch_drafts d WHERE d.project_id=p.id AND d.owner_id=p.owner_id AND length(trim(d.content))>0)) AS hasDraft,
      EXISTS(SELECT 1 FROM jobs j JOIN job_artifacts a ON a.job_id=j.id JOIN project_technical_plans plan ON plan.project_id=p.id
        WHERE j.project_id=p.id AND j.owner_id=p.owner_id AND j.kind='technical-plan.export-word' AND j.state='succeeded'
          AND a.deleted_at IS NULL AND a.edit_revision>0 AND json_extract(j.payload_json,'$.planVersion')=plan.version) AS hasReviewedWord,
      EXISTS(SELECT 1 FROM project_submission_records s WHERE s.project_id=p.id) AS hasSubmission,
      (SELECT r.result FROM project_submission_results r WHERE r.project_id=p.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) AS latestResult,
      (EXISTS(SELECT 1 FROM project_technical_plan_nodes n WHERE n.project_id=p.id AND length(trim(n.content))>0)
       OR EXISTS(SELECT 1 FROM technical_batch_drafts d WHERE d.project_id=p.id AND length(trim(d.content))>0)
       OR EXISTS(SELECT 1 FROM economic_offer_drafts e WHERE e.project_id=p.id)
       OR EXISTS(SELECT 1 FROM project_submission_records s WHERE s.project_id=p.id)) AS hasOffer
      FROM projects p
      LEFT JOIN project_secop opportunity ON opportunity.project_id = p.id AND opportunity.owner_id = p.owner_id
      WHERE p.owner_id = ? ${countryFilter} ORDER BY p.created_at DESC, p.id`)
      .bind(userId, ...(country ? [fixedCountry ?? 'CO', country] : [])).all();
    return Response.json({ projects: result.results });
  }
  if (request.method === 'GET' && match[1]) {
    const project = await env.DB.prepare('SELECT id, title, created_at AS createdAt FROM projects WHERE id = ? AND owner_id = ?')
      .bind(match[1], userId).first();
    return project ? Response.json({ project }) : Response.json({ error: 'not_found' }, { status: 404 });
  }
  return new Response('Method not allowed', { status: 405 });
}

async function handleFiles(request, env, userId, projectId, fileId) {
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, userId).first();
  if (!project) return Response.json({ error: 'not_found' }, { status: 404 });
  if (request.method === 'POST' && !fileId) {
    if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
    let name;
    try { name = decodeURIComponent(request.headers.get('x-file-name') || '').trim(); }
    catch { return Response.json({ error: 'invalid_name' }, { status: 400 }); }
    if (!name || name.length > 255) return Response.json({ error: 'invalid_name' }, { status: 400 });
    const requestKey = request.headers.get('idempotency-key');
    if (requestKey !== null) {
      if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestKey)) return Response.json({ error: 'invalid_idempotency_key' }, { status: 400 });
      return uploadProjectFile(request, env, userId, projectId, name, requestKey);
    }
    // A previous interrupted writer may have left an unreferenced object.
    try { await cleanupDesktopUploads(env, userId); } catch { /* A later upload or explicit cleanup can retry. */ }
    const file = { id: crypto.randomUUID(), name, contentType: request.headers.get('content-type') || 'application/octet-stream', size: 0, createdAt: new Date().toISOString() };
    const key = `projects/${projectId}/${file.id}`, stagingId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO desktop_file_staging (id,owner_id,object_key,state,lease_until,created_at) VALUES (?,?,?,'writing',?,?)").bind(stagingId,userId,key,Date.now()+uploadLeaseMs,Date.now()).run();
    let published = false;
    try {
      const stored = await env.FILES.put(key, request.body);
      if (!stored || !Number.isSafeInteger(stored.size) || stored.size < 0) throw new Error('R2 did not return the stored object size.');
      file.size = stored.size;
      await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(stagingId,userId).run();
      const results = await env.DB.batch([
        env.DB.prepare("INSERT INTO project_files (id,project_id,name,content_type,object_key,size,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND owner_id=?) AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?)").bind(file.id,projectId,file.name,file.contentType,key,file.size,file.createdAt,projectId,userId,stagingId,userId,Date.now()),
        env.DB.prepare("DELETE FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND EXISTS (SELECT 1 FROM project_files WHERE id=? AND project_id=? AND object_key=?)").bind(stagingId,userId,file.id,projectId,key),
      ]);
      if (!results[0].meta.changes) throw new Error('Project upload expired or the project is no longer available.');
      published = true;
      return Response.json({ file }, { status: 201 });
    } finally {
      if (!published) {
        try { await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(stagingId,userId).run(); await cleanupDesktopUploads(env,userId); } catch { /* The staging record remains for later cleanup. */ }
      }
    }
  }
  if (request.method === 'GET' && !fileId) {
    const result = await env.DB.prepare('SELECT id, name, content_type AS contentType, size, created_at AS createdAt, 0 AS deleting FROM project_files WHERE project_id = ? UNION ALL SELECT id, name, content_type AS contentType, size, created_at AS createdAt, 1 AS deleting FROM project_file_deletions WHERE project_id = ? AND storage_deleted_at IS NULL ORDER BY createdAt DESC, id')
      .bind(projectId, projectId).all();
    return Response.json({ files: result.results });
  }
  if (request.method === 'DELETE' && fileId) {
    if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO project_file_deletions (id, project_id, name, content_type, object_key, size, created_at, deleted_at) SELECT id, project_id, name, content_type, object_key, size, created_at, ? FROM project_files WHERE id = ? AND project_id = ?').bind(new Date().toISOString(), fileId, projectId),
      env.DB.prepare('DELETE FROM project_files WHERE id = ? AND project_id = ? AND EXISTS (SELECT 1 FROM project_file_deletions WHERE id = ? AND project_id = ?)').bind(fileId, projectId, fileId, projectId),
    ]);
    const row = await env.DB.prepare('SELECT object_key, storage_deleted_at FROM project_file_deletions WHERE id = ? AND project_id = ?').bind(fileId, projectId).first();
    if (!row) return Response.json({ error: 'not_found' }, { status: 404 });
    if (!row.storage_deleted_at) {
      try { await env.FILES.delete(row.object_key); } catch { return Response.json({ error: 'file_cleanup_pending' }, { status: 503 }); }
      await env.DB.prepare('UPDATE project_file_deletions SET storage_deleted_at = COALESCE(storage_deleted_at, ?) WHERE id = ? AND project_id = ?').bind(new Date().toISOString(), fileId, projectId).run();
    }
    return new Response(null, { status: 204 });
  }
  if (request.method === 'GET' && fileId) {
    const file = await env.DB.prepare('SELECT object_key AS objectKey, content_type AS contentType, name FROM project_files WHERE id = ? AND project_id = ?')
      .bind(fileId, projectId).first();
    if (!file) return Response.json({ error: 'not_found' }, { status: 404 });
    const object = await env.FILES.get(file.objectKey);
    if (!object) return Response.json({ error: 'not_found' }, { status: 404 });
    return new Response(object.body, { headers: { 'content-type': file.contentType, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,  'x-content-type-options': 'nosniff' } });
  }
  return new Response('Method not allowed', { status: 405 });
}
