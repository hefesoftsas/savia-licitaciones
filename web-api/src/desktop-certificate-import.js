const bad = () => Response.json({ error: 'invalid_certificate_import' }, { status: 400 });
const conflict = () => Response.json({ error: 'certificate_import_conflict' }, { status: 409 });
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2,'0')).join('');
export async function importDesktopCertificate(request, env, runner, requestId, sourceKey) {
 if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
 if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId) || !/^[a-f0-9]{64}$/.test(sourceKey)) return bad();
 let input; try { input = await request.json(); } catch { return bad(); }
 if (!input || typeof input.sourceId !== 'string' || !input.sourceId || input.sourceId.length > 256 || await hash(input.sourceId) !== sourceKey || ['name','number','validityMode','validFrom','validTo','createdAt','updatedAt'].some(key => typeof input[key] !== 'string' || input[key].length > 20000)) return bad();
 const body=JSON.stringify({sourceId:input.sourceId,name:input.name,number:input.number,validityMode:input.validityMode,validFrom:input.validFrom,validTo:input.validTo,createdAt:input.createdAt,updatedAt:input.updatedAt}), contentHash=await hash(body);
 const lookup=()=>env.DB.prepare('SELECT i.certificate_id, i.content_hash, c.id AS present FROM desktop_certificate_imports i LEFT JOIN company_certificates c ON c.id = i.certificate_id AND c.owner_id = i.owner_id AND c.deleting = 0 WHERE i.owner_id = ? AND i.request_id = ? AND i.source_key = ?').bind(runner.ownerId,requestId,sourceKey).first();
 const responseFor=row=>!row || row.content_hash !== contentHash ? conflict() : row.present ? Response.json({certificateId:row.certificate_id}) : Response.json({error:'removed'}, {status:410});
 const previous=await lookup(); if(previous) return responseFor(previous);
 const id=crypto.randomUUID(), mutation=crypto.randomUUID(), now=new Date().toISOString();
 const result=await env.DB.batch([
  env.DB.prepare('INSERT INTO company_certificates (id, owner_id, name, number, validity_mode, valid_from, valid_to, version, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM desktop_certificate_imports WHERE owner_id = ? AND request_id = ? AND source_key = ?)').bind(id,runner.ownerId,input.name,input.number,input.validityMode,input.validFrom,input.validTo,input.createdAt,input.updatedAt,runner.ownerId,requestId,sourceKey),
  env.DB.prepare('INSERT INTO desktop_certificate_imports (owner_id, request_id, source_key, certificate_id, content_hash, mutation_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM company_certificates WHERE id = ? AND owner_id = ?) ON CONFLICT(owner_id, request_id, source_key) DO NOTHING').bind(runner.ownerId,requestId,sourceKey,id,contentHash,mutation,now,id,runner.ownerId),
  env.DB.prepare('DELETE FROM company_certificates WHERE id = ? AND owner_id = ? AND NOT EXISTS (SELECT 1 FROM desktop_certificate_imports WHERE owner_id = ? AND request_id = ? AND source_key = ? AND mutation_id = ?)').bind(id,runner.ownerId,runner.ownerId,requestId,sourceKey,mutation),
 ]);
 return result[1].meta.changes ? Response.json({certificateId:id},{status:201}) : responseFor(await lookup());
}
