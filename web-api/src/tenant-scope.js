export async function ensureUserTenant(env,userId) {
 const find=()=>env.DB.prepare('SELECT t.id,t.name,t.owner_user_id AS ownerId FROM tenant_members m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=?').bind(userId).first();
 let tenant=await find();
 if (tenant) {
  if (!tenant.ownerId) throw new Error('Tenant has no workspace owner');
  return tenant;
 }
 const createdAt=new Date().toISOString();
 await env.DB.batch([
  env.DB.prepare('INSERT INTO tenants(id,name,owner_user_id,created_at) SELECT ?,name,id,? FROM "user" WHERE id=? AND NOT EXISTS(SELECT 1 FROM tenant_members WHERE user_id=?) ON CONFLICT DO NOTHING').bind(`legacy:${userId}`,createdAt,userId,userId),
  env.DB.prepare('INSERT INTO tenant_members(tenant_id,user_id,created_at) SELECT id,owner_user_id,? FROM tenants WHERE owner_user_id=? AND NOT EXISTS(SELECT 1 FROM tenant_members WHERE user_id=?) ON CONFLICT DO NOTHING').bind(createdAt,userId,userId),
 ]);
 tenant=await find();
 if (!tenant?.ownerId) throw new Error('Unable to establish tenant membership');
 return tenant;
}
