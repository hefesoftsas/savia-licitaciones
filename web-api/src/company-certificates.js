import { cleanCertificateImageDeletions } from './certificate-images.js';
const bad = () => Response.json({error:'invalid_input'}, {status:400});
const missing = () => Response.json({error:'not_found'}, {status:404});
const conflict = () => Response.json({error:'version_conflict'}, {status:409});
const view = row => ({id:row.id,name:row.name,number:row.number,validityMode:row.validity_mode,validFrom:row.valid_from,validTo:row.valid_to,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,deleting:!!row.deleting});
const validDate = value => value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value);
export async function companyCertificates(request, env, ownerId, id) {
 if (!id && request.method === 'GET') {
  const rows = await env.DB.prepare('SELECT * FROM company_certificates WHERE owner_id = ? ORDER BY updated_at DESC, created_at DESC, id').bind(ownerId).all();
  return Response.json({certificates:rows.results.map(view)});
 }
 if (!['POST','PUT','DELETE'].includes(request.method) || (request.method === 'POST') === Boolean(id)) return new Response('Method not allowed',{status:405});
 if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({error:'invalid_origin'},{status:403});
 let input; try { input = await request.json(); } catch { return bad(); }
 if (!input || (id && (!Number.isSafeInteger(input.version) || input.version < 1))) return bad();
 if (request.method !== 'DELETE' && (typeof input.name !== 'string' || input.name.length > 300 || typeof input.number !== 'string' || input.number.length > 300 || !['','range','long-term'].includes(input.validityMode) || !validDate(input.validFrom) || !validDate(input.validTo))) return bad();
 if (request.method === 'DELETE') {
  const results = await env.DB.batch([
   env.DB.prepare('UPDATE company_certificates SET deleting = 1 WHERE id = ? AND owner_id = ? AND version = ?').bind(id,ownerId,input.version),
   env.DB.prepare('INSERT OR IGNORE INTO company_certificate_image_deletions (id, certificate_id, owner_id, object_key, name, content_type, size, sort_order, created_at) SELECT i.id, i.certificate_id, i.owner_id, i.object_key, i.name, i.content_type, i.size, i.sort_order, i.created_at FROM company_certificate_images i JOIN company_certificates c ON c.id = i.certificate_id AND c.owner_id = i.owner_id WHERE c.id = ? AND c.owner_id = ? AND c.version = ? AND c.deleting = 1').bind(id,ownerId,input.version),
   env.DB.prepare('DELETE FROM company_certificate_images WHERE certificate_id = ? AND owner_id = ? AND EXISTS (SELECT 1 FROM company_certificates WHERE id = ? AND owner_id = ? AND version = ? AND deleting = 1)').bind(id,ownerId,id,ownerId,input.version),
  ]);
  if (!results[0].meta.changes) return await env.DB.prepare('SELECT id FROM company_certificates WHERE id = ? AND owner_id = ?').bind(id,ownerId).first() ? conflict() : missing();
  if (!await cleanCertificateImageDeletions(env,ownerId,id)) return Response.json({error:'file_cleanup_pending'},{status:503});
  await env.DB.prepare('DELETE FROM company_certificates WHERE id = ? AND owner_id = ? AND version = ? AND deleting = 1 AND NOT EXISTS (SELECT 1 FROM company_certificate_image_deletions WHERE certificate_id = ? AND owner_id = ? AND storage_deleted_at IS NULL)').bind(id,ownerId,input.version,id,ownerId).run();
  return new Response(null,{status:204});
 }
 const now = new Date().toISOString(); let row;
 if (request.method === 'POST') {
  row = await env.DB.prepare('INSERT INTO company_certificates (id, owner_id, name, number, validity_mode, valid_from, valid_to, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?) RETURNING *').bind(crypto.randomUUID(), ownerId, input.name.trim(), input.number.trim(), input.validityMode, input.validityMode === 'range' ? input.validFrom : '', input.validityMode === 'range' ? input.validTo : '', now, now).first();
 } else if (request.method === 'PUT') {
  row = await env.DB.prepare('UPDATE company_certificates SET name = ?, number = ?, validity_mode = ?, valid_from = ?, valid_to = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND version = ? AND deleting = 0 RETURNING *').bind(input.name.trim(), input.number.trim(), input.validityMode, input.validityMode === 'range' ? input.validFrom : '', input.validityMode === 'range' ? input.validTo : '', now, id, ownerId, input.version).first();
 }
 if (!row) return await env.DB.prepare('SELECT id FROM company_certificates WHERE id = ? AND owner_id = ?').bind(id,ownerId).first() ? conflict() : missing();
 return request.method === 'DELETE' ? new Response(null,{status:204}) : Response.json({certificate:view(row)},{status:request.method === 'POST' ? 201 : 200});
}
