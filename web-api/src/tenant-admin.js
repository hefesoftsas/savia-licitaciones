import {hashPassword} from 'better-auth/crypto';

async function assignUserToTenant(env, userId, tenantId) {
  const user = await env.DB.prepare('SELECT id,name,email,role,banned FROM "user" WHERE id=?').bind(userId).first();
  if (!user) return Response.json({error:'user_not_found'},{status:404});
  const targetTenant = await env.DB.prepare('SELECT id,name,owner_user_id AS ownerUserId FROM tenants WHERE id=?').bind(tenantId).first();
  if (!targetTenant) return Response.json({error:'not_found'},{status:404});
  const ownedTenant = await env.DB.prepare('SELECT id,(SELECT COUNT(*) FROM tenant_members m WHERE m.tenant_id=tenants.id AND m.user_id!=?) AS otherMembers FROM tenants WHERE owner_user_id=? AND id!=?').bind(userId,userId,tenantId).first();
  if (!targetTenant.ownerUserId && ownedTenant && Number(ownedTenant.otherMembers) > 0) {
    return Response.json({error:'owner_has_active_members'},{status:409});
  }
  const createdAt = new Date().toISOString();
  const statements = [];
  if (ownedTenant && Number(ownedTenant.otherMembers) === 0 && (!targetTenant.ownerUserId || String(ownedTenant.id).startsWith('legacy:'))) {
    statements.push(env.DB.prepare('UPDATE tenants SET owner_user_id=NULL WHERE id=?').bind(ownedTenant.id));
  }
  statements.push(
    env.DB.prepare('INSERT INTO tenant_members(tenant_id,user_id,created_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET tenant_id=excluded.tenant_id').bind(tenantId,userId,createdAt),
    env.DB.prepare('DELETE FROM project_selection WHERE owner_id=?').bind(userId),
  );
  if (!targetTenant.ownerUserId) {
    statements.push(env.DB.prepare('UPDATE tenants SET owner_user_id=? WHERE id=? AND owner_user_id IS NULL').bind(userId,tenantId));
  }
  if (ownedTenant && Number(ownedTenant.otherMembers) === 0 && String(ownedTenant.id).startsWith('legacy:')) {
    statements.push(env.DB.prepare('DELETE FROM tenants WHERE id=? AND NOT EXISTS(SELECT 1 FROM tenant_members WHERE tenant_id=?)').bind(ownedTenant.id,ownedTenant.id));
  }
  await env.DB.batch(statements);
  return Response.json({
    user: {...user, tenantId: targetTenant.id, tenantName: targetTenant.name},
    tenant: {id: targetTenant.id, name: targetTenant.name},
  });
}

async function createTenantUser(env, tenantId, input) {
  const name=typeof input.name==='string'?input.name.trim():'',email=typeof input.email==='string'?input.email.trim().toLowerCase():'',password=input.password;
  const role=input.role==='superadmin'?'superadmin':'user';
  if (!name || name.length>300 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || typeof password!=='string' || password.length<8 || password.length>128) return Response.json({error:'invalid_user'},{status:400});
  let targetTenantId = tenantId;
  const id=crypto.randomUUID(),now=Date.now(),createdAt=new Date(now).toISOString(),passwordHash=await hashPassword(password);
  const statements = [
    env.DB.prepare('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",role,banned) SELECT ?,?,?,1,?,?,?,0 WHERE NOT EXISTS(SELECT 1 FROM "user" WHERE lower(email)=?)').bind(id,name,email,now,now,role,email),
    env.DB.prepare('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES(?,?,\'credential\',?,?,?,?)').bind(crypto.randomUUID(),id,id,passwordHash,now,now),
  ];
  if (targetTenantId) {
    if (!await env.DB.prepare('SELECT id FROM tenants WHERE id=?').bind(targetTenantId).first()) return Response.json({error:'not_found'},{status:404});
    statements.push(
      env.DB.prepare('INSERT INTO tenant_members(tenant_id,user_id,created_at) VALUES(?,?,?)').bind(targetTenantId,id,createdAt),
      env.DB.prepare('UPDATE tenants SET owner_user_id=? WHERE id=? AND owner_user_id IS NULL').bind(id,targetTenantId),
    );
  } else {
    targetTenantId = `legacy:${id}`;
    statements.push(
      env.DB.prepare('INSERT INTO tenants(id,name,owner_user_id,created_at) VALUES(?,?,?,?)').bind(targetTenantId,name,id,createdAt),
      env.DB.prepare('INSERT INTO tenant_members(tenant_id,user_id,created_at) VALUES(?,?,?)').bind(targetTenantId,id,createdAt),
    );
  }
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (await env.DB.prepare('SELECT id FROM "user" WHERE lower(email)=?').bind(email).first()) return Response.json({error:'email_in_use'},{status:409});
    throw error;
  }
  return Response.json({user:{id,name,email,role,tenantId:targetTenantId}},{status:201});
}

function normalizeCountry(value) {
  if (value === undefined) return undefined;
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return ['CO', 'ES', 'ALL'].includes(code) ? code : null;
}

export async function tenantAdmin(request, env, session) {
  if (!session) return Response.json({error:'unauthorized'}, {status:401});
  if (env.AUTH_REQUIRE_VERIFIED_EMAIL==='true' && !session.user.emailVerified) return Response.json({error:'email_not_verified'},{status:403});
  if (!(session.user.role || '').split(',').map(x=>x.trim()).includes('superadmin')) return Response.json({error:'forbidden'}, {status:403});
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({error:'invalid_origin'}, {status:403});
  const path = new URL(request.url).pathname;
  if (path === '/api/admin/tenants' && request.method === 'GET') {
    const {results} = await env.DB.prepare('SELECT t.id,t.name,t.country,t.owner_user_id AS ownerUserId,t.created_at AS createdAt,COUNT(m.user_id) AS memberCount FROM tenants t LEFT JOIN tenant_members m ON m.tenant_id=t.id GROUP BY t.id ORDER BY t.name,t.id').all();
    return Response.json({tenants:results.map(t=>({...t,country:['CO','ES','ALL'].includes(t.country)?t.country:'ALL'}))});
  }
  if (path === '/api/admin/users' && request.method === 'GET') {
    const {results} = await env.DB.prepare('SELECT u.id,u.name,u.email,u.role,u.banned,m.tenant_id AS tenantId,t.name AS tenantName,CASE WHEN t.owner_user_id=u.id THEN 1 ELSE 0 END AS isWorkspaceOwner FROM "user" u LEFT JOIN tenant_members m ON m.user_id=u.id LEFT JOIN tenants t ON t.id=m.tenant_id ORDER BY u.name,u.id').all();
    return Response.json({users:results,total:results.length});
  }
  let input;
  if (['POST','PUT','PATCH'].includes(request.method)) {
    try { input=await request.json(); } catch { return Response.json({error:'invalid_json'},{status:400}); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return Response.json({error:'invalid_request'},{status:400});
  }
  if (path === '/api/admin/tenants' && request.method === 'POST') {
    const name=typeof input.name==='string'?input.name.trim():'';
    if (!name || name.length>200) return Response.json({error:'invalid_name'},{status:400});
    const parsedCountry=normalizeCountry(input.country);
    if (parsedCountry===null) return Response.json({error:'invalid_country'},{status:400});
    const country=parsedCountry || 'ALL';
    const tenant={id:crypto.randomUUID(),name,country,ownerUserId:null,createdAt:new Date().toISOString(),memberCount:0};
    await env.DB.prepare('INSERT INTO tenants(id,name,country,created_at) VALUES(?,?,?,?)').bind(tenant.id,tenant.name,tenant.country,tenant.createdAt).run();
    return Response.json({tenant},{status:201});
  }
  const tenantEditMatch=/^\/api\/admin\/tenants\/([^/]+)$/.exec(path);
  if (tenantEditMatch && (request.method==='PATCH' || request.method==='PUT')) {
    const tenantId=decodeURIComponent(tenantEditMatch[1]);
    const hasName=input.name!==undefined;
    const name=hasName?(typeof input.name==='string'?input.name.trim():''):null;
    if (hasName && (!name || name.length>200)) return Response.json({error:'invalid_name'},{status:400});
    const parsedCountry=normalizeCountry(input.country);
    if (parsedCountry===null) return Response.json({error:'invalid_country'},{status:400});
    if (!hasName && parsedCountry===undefined) return Response.json({error:'invalid_request'},{status:400});
    const updated=await env.DB.prepare('UPDATE tenants SET name=COALESCE(?,name),country=COALESCE(?,country) WHERE id=? RETURNING id,name,country,owner_user_id AS ownerUserId,created_at AS createdAt').bind(name,parsedCountry??null,tenantId).first();
    if (!updated) return Response.json({error:'not_found'},{status:404});
    return Response.json({tenant:{...updated,country:['CO','ES','ALL'].includes(updated.country)?updated.country:'ALL'}});
  }
  const userTenantMatch=/^\/api\/admin\/users\/([^/]+)\/tenant$/.exec(path);
  if (userTenantMatch && (request.method==='PUT' || request.method==='POST')) {
    const userId=decodeURIComponent(userTenantMatch[1]);
    const tenantId=typeof input.tenantId==='string'?input.tenantId.trim():'';
    if (!tenantId) return Response.json({error:'invalid_tenant'},{status:400});
    return assignUserToTenant(env,userId,tenantId);
  }
  const memberAssignMatch=/^\/api\/admin\/tenants\/([^/]+)\/members$/.exec(path);
  if (memberAssignMatch && request.method==='POST') {
    const tenantId=decodeURIComponent(memberAssignMatch[1]);
    const userId=typeof input.userId==='string'?input.userId.trim():'';
    if (!userId) return Response.json({error:'invalid_user'},{status:400});
    return assignUserToTenant(env,userId,tenantId);
  }
  const match=/^\/api\/admin\/tenants\/([^/]+)\/users$/.exec(path);
  if (match && request.method==='GET') {
    const tenantId=decodeURIComponent(match[1]);
    if (!await env.DB.prepare('SELECT id FROM tenants WHERE id=?').bind(tenantId).first()) return Response.json({error:'not_found'},{status:404});
    const {results}=await env.DB.prepare('SELECT u.id,u.name,u.email,u.role,u.banned,m.tenant_id AS tenantId,t.name AS tenantName,CASE WHEN t.owner_user_id=u.id THEN 1 ELSE 0 END AS isWorkspaceOwner FROM tenant_members m JOIN "user" u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=? ORDER BY u.name,u.id').bind(tenantId).all();
    return Response.json({users:results});
  }
  if (path === '/api/admin/users' && request.method === 'POST') {
    const requestedTenantId = typeof input.tenantId === 'string' ? input.tenantId.trim() : '';
    return createTenantUser(env, requestedTenantId || null, input);
  }
  if (match && request.method==='POST') {
    const tenantId=decodeURIComponent(match[1]);
    if (typeof input.userId === 'string' && input.userId.trim() && !input.email) {
      return assignUserToTenant(env, input.userId.trim(), tenantId);
    }
    return createTenantUser(env, tenantId, input);
  }
  return new Response('Not found',{status:404});
}
