import {normalizeExperience} from './company-experience.js';
const bad=()=>Response.json({error:'invalid_experience_import'},{status:400}),conflict=()=>Response.json({error:'experience_import_conflict'},{status:409});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function importDesktopCompanyExperience(request,env,runner,requestId,sourceKey){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)||!/^[a-f0-9]{64}$/.test(sourceKey))return bad();
 let input;try{input=await request.json();}catch{return bad();}
 if(!input||typeof input.sourceId!=='string'||!input.sourceId||input.sourceId.length>256||await hash(input.sourceId)!==sourceKey||typeof input.createdAt!=='string'||input.createdAt.length>20000||typeof input.updatedAt!=='string'||input.updatedAt.length>20000)return bad();
 const details=normalizeExperience(input,['sourceId','createdAt','updatedAt']);if(!details)return bad();
 const body=JSON.stringify({sourceId:input.sourceId,...details,createdAt:input.createdAt,updatedAt:input.updatedAt}),contentHash=await hash(body);
 const lookup=()=>env.DB.prepare('SELECT i.project_id,i.content_hash,p.id AS present FROM desktop_company_experience_imports i LEFT JOIN company_experience_projects p ON p.id=i.project_id AND p.owner_id=i.owner_id AND p.deleting=0 WHERE i.owner_id=? AND i.request_id=? AND i.source_key=?').bind(runner.ownerId,requestId,sourceKey).first();
 const responseFor=row=>!row||row.content_hash!==contentHash?conflict():row.present?Response.json({projectId:row.project_id}):Response.json({error:'removed'},{status:410});
 const previous=await lookup();if(previous)return responseFor(previous);
 const id=crypto.randomUUID(),mutation=crypto.randomUUID(),now=new Date().toISOString(),own='EXISTS (SELECT 1 FROM desktop_company_experience_imports WHERE owner_id=? AND request_id=? AND source_key=? AND mutation_id=?)';
 const result=await env.DB.batch([
  env.DB.prepare('INSERT INTO company_experience_projects(id,owner_id,details_json,version,created_at,updated_at) SELECT ?,?,?,1,?,? WHERE NOT EXISTS (SELECT 1 FROM desktop_company_experience_imports WHERE owner_id=? AND request_id=? AND source_key=?)').bind(id,runner.ownerId,JSON.stringify(details),input.createdAt,input.updatedAt,runner.ownerId,requestId,sourceKey),
  env.DB.prepare('INSERT INTO desktop_company_experience_imports(owner_id,request_id,source_key,project_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM company_experience_projects WHERE id=? AND owner_id=?) ON CONFLICT(owner_id,request_id,source_key) DO NOTHING').bind(runner.ownerId,requestId,sourceKey,id,contentHash,mutation,now,id,runner.ownerId),
  env.DB.prepare(`DELETE FROM company_experience_projects WHERE id=? AND owner_id=? AND NOT ${own}`).bind(id,runner.ownerId,runner.ownerId,requestId,sourceKey,mutation),
 ]);
 return result[1].meta.changes?Response.json({projectId:id},{status:201}):responseFor(await lookup());
}
