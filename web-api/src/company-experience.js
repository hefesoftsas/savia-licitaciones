import {cleanExperienceImageDeletions} from './company-experience-images.js';
export const experienceFields=['projectName','projectNumber','customerName','projectType','projectManager','contractAmount','startDate','endDate','projectStatus','introduction'];
const bad=()=>Response.json({error:'invalid_experience'},{status:400}),missing=()=>Response.json({error:'not_found'},{status:404}),conflict=()=>Response.json({error:'version_conflict'},{status:409});
export function normalizeExperience(input,extraKeys=[]){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!experienceFields.includes(key)&&!extraKeys.includes(key))||experienceFields.some(key=>typeof input[key]!=='string'||input[key].length>20000))return null;
 return Object.fromEntries(experienceFields.map(key=>[key,input[key]]));
}
const view=row=>({id:row.id,...JSON.parse(row.details_json),version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,...(row.deleting?{deleting:true}:{})});
export async function companyExperience(request,env,owner,id){
 if(request.method==='GET'&&!id){const rows=await env.DB.prepare('SELECT * FROM company_experience_projects WHERE owner_id=? ORDER BY updated_at DESC,created_at DESC,id').bind(owner).all();return Response.json({projects:rows.results.map(view)});}
 if(!['POST','PUT','DELETE'].includes(request.method)||(request.method==='POST')===Boolean(id))return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return bad();}
 if(id&&(!Number.isSafeInteger(input?.version)||input.version<1))return bad();
 if(request.method==='DELETE'){
  const result=await env.DB.batch([
   env.DB.prepare('UPDATE company_experience_projects SET deleting=1 WHERE id=? AND owner_id=? AND version=?').bind(id,owner,input.version),
   env.DB.prepare('INSERT OR IGNORE INTO company_experience_image_deletions(id,project_id,owner_id,name,field_key,content_type,object_key,size,sort_order,created_at) SELECT i.id,i.project_id,i.owner_id,i.name,i.field_key,i.content_type,i.object_key,i.size,i.sort_order,i.created_at FROM company_experience_images i JOIN company_experience_projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE p.id=? AND p.owner_id=? AND p.version=? AND p.deleting=1').bind(id,owner,input.version),
   env.DB.prepare('DELETE FROM company_experience_images WHERE project_id=? AND owner_id=? AND EXISTS (SELECT 1 FROM company_experience_projects WHERE id=? AND owner_id=? AND version=? AND deleting=1)').bind(id,owner,id,owner,input.version),
  ]);
  if(!result[0].meta.changes)return await env.DB.prepare('SELECT id FROM company_experience_projects WHERE id=? AND owner_id=?').bind(id,owner).first()?conflict():missing();
  if(!await cleanExperienceImageDeletions(env,owner,id))return Response.json({error:'file_cleanup_pending'},{status:503});
  await env.DB.prepare('DELETE FROM company_experience_projects WHERE id=? AND owner_id=? AND version=? AND deleting=1 AND NOT EXISTS (SELECT 1 FROM company_experience_image_deletions WHERE project_id=? AND owner_id=? AND storage_deleted_at IS NULL)').bind(id,owner,input.version,id,owner).run();
  return new Response(null,{status:204});
 }
 const details=request.method==='DELETE'?null:normalizeExperience(input,id?['version']:[]);if(request.method!=='DELETE'&&!details)return bad();
 let row;const now=new Date().toISOString();
 if(request.method==='POST')row=await env.DB.prepare('INSERT INTO company_experience_projects(id,owner_id,details_json,version,created_at,updated_at) VALUES(?,?,?,1,?,?) RETURNING *').bind(crypto.randomUUID(),owner,JSON.stringify(details),now,now).first();
 else if(request.method==='PUT')row=await env.DB.prepare('UPDATE company_experience_projects SET details_json=?,version=version+1,updated_at=? WHERE id=? AND owner_id=? AND version=? AND deleting=0 RETURNING *').bind(JSON.stringify(details),now,id,owner,input.version).first();
 if(!row)return await env.DB.prepare('SELECT id FROM company_experience_projects WHERE id=? AND owner_id=?').bind(id,owner).first()?conflict():missing();
 return request.method==='DELETE'?new Response(null,{status:204}):Response.json({project:view(row)},{status:request.method==='POST'?201:200});
}
