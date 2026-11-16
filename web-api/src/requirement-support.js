const missing=()=>Response.json({error:'not_found'},{status:404});
const bad=()=>Response.json({error:'invalid_input'},{status:400});
const conflict=()=>Response.json({error:'version_conflict'},{status:409});
const view=row=>({id:row.id,title:row.title,status:row.status,linkType:row.link_type,linkId:row.link_id,linkAvailable:!!row.link_available,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at});
const selection=`SELECT s.*, CASE WHEN s.link_type='certificate' THEN EXISTS(SELECT 1 FROM company_certificates c WHERE c.id=s.link_id AND c.owner_id=p.owner_id AND c.deleting=0) WHEN s.link_type='rup' THEN EXISTS(SELECT 1 FROM rup_current r JOIN rup_certificates c ON c.id=r.certificate_id AND c.owner_id=r.owner_id WHERE r.owner_id=p.owner_id AND c.id=s.link_id) ELSE 0 END AS link_available FROM project_requirement_supports s JOIN projects p ON p.id=s.project_id`;
export async function requirementSupports(request,env,ownerId,projectId,requirementId,itemId){
 const requirement=await env.DB.prepare('SELECT r.id FROM project_requirements r JOIN projects p ON p.id=r.project_id WHERE r.id=? AND p.id=? AND p.owner_id=?').bind(requirementId,projectId,ownerId).first();
 if(!requirement)return missing();
 const get=async id=>env.DB.prepare(`${selection} WHERE s.project_id=? AND s.requirement_id=? AND s.id=?`).bind(projectId,requirementId,id).first();
 if(request.method==='GET'&&!itemId){const rows=await env.DB.prepare(`${selection} WHERE s.project_id=? AND s.requirement_id=? ORDER BY s.created_at,s.id`).bind(projectId,requirementId).all();return Response.json({items:rows.results.map(view)});}
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return bad();}
 if(request.method==='POST'&&!itemId){
  if(typeof input?.title!=='string'||!input.title.trim()||input.title.length>300)return bad();
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const row=await env.DB.prepare("INSERT INTO project_requirement_supports (id,project_id,requirement_id,title,status,link_type,link_id,version,created_at,updated_at) SELECT ?,?,?,?,'missing','none','',1,?,? WHERE EXISTS (SELECT 1 FROM project_requirements r JOIN projects p ON p.id=r.project_id WHERE r.id=? AND p.id=? AND p.owner_id=?) RETURNING id").bind(id,projectId,requirementId,input.title.trim(),now,now,requirementId,projectId,ownerId).first();
  return row?Response.json({item:view(await get(id))},{status:201}):missing();
 }
 if(itemId&&['PATCH','DELETE'].includes(request.method)){
  if(!Number.isSafeInteger(input?.version)||input.version<1)return bad();
  if(request.method==='DELETE'){
   const row=await env.DB.prepare('DELETE FROM project_requirement_supports WHERE id=? AND project_id=? AND requirement_id=? AND version=? RETURNING id').bind(itemId,projectId,requirementId,input.version).first();
   return row?Response.json({deleted:true}):(await get(itemId)?conflict():missing());
  }
  if(!['missing','pending','reviewed'].includes(input.status)||!['none','certificate','rup'].includes(input.linkType)||typeof input.linkId!=='string'||input.linkId.length>256||(input.linkType==='none')!==(input.linkId===''))return bad();
  const eligible=input.linkType==='none'?true:input.linkType==='certificate'?await env.DB.prepare('SELECT id FROM company_certificates WHERE id=? AND owner_id=? AND deleting=0').bind(input.linkId,ownerId).first():await env.DB.prepare('SELECT c.id FROM rup_current r JOIN rup_certificates c ON c.id=r.certificate_id AND c.owner_id=r.owner_id WHERE r.owner_id=? AND c.id=?').bind(ownerId,input.linkId).first();
  if(!eligible)return bad();
  const row=await env.DB.prepare("UPDATE project_requirement_supports SET status=?,link_type=?,link_id=?,version=version+1,updated_at=? WHERE id=? AND project_id=? AND requirement_id=? AND version=? AND (?='none' OR (?='certificate' AND EXISTS(SELECT 1 FROM company_certificates WHERE id=? AND owner_id=? AND deleting=0)) OR (?='rup' AND EXISTS(SELECT 1 FROM rup_current r JOIN rup_certificates c ON c.id=r.certificate_id AND c.owner_id=r.owner_id WHERE r.owner_id=? AND c.id=?))) RETURNING id").bind(input.status,input.linkType,input.linkId,new Date().toISOString(),itemId,projectId,requirementId,input.version,input.linkType,input.linkType,input.linkId,ownerId,input.linkType,ownerId,input.linkId).first();
  return row?Response.json({item:view(await get(itemId))}):(await get(itemId)?conflict():missing());
 }
 return new Response('Method not allowed',{status:405});
}
