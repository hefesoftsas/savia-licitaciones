import presets from '../../client/electron/services/blindCheckPresets.cjs';
const {findBuiltinPreset,normalizeProfile}=presets;
export async function getBlindProfile(env,projectId){
 const row=await env.DB.prepare('SELECT profile_json,version,updated_at FROM project_blind_profiles WHERE project_id=?').bind(projectId).first();
 return row?{profile:JSON.parse(row.profile_json),version:row.version,updatedAt:row.updated_at}:{profile:findBuiltinPreset('builtin-general').profile,version:0,updatedAt:null};
}
export async function blindProfile(request,env,owner,projectId){
 if(!await env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(projectId,owner).first())return Response.json({error:'not_found'},{status:404});
 if(request.method==='GET')return Response.json(await getBlindProfile(env,projectId));
 if(request.method!=='PUT')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let body;try{body=await request.json();}catch{return Response.json({error:'invalid_input'},{status:400});}
 if(!body?.profile||typeof body.profile!=='object'||Array.isArray(body.profile)||!Number.isSafeInteger(body.version)||body.version<0||JSON.stringify(body.profile).length>100000)return Response.json({error:'invalid_input'},{status:400});
 const profile=normalizeProfile(body.profile),json=JSON.stringify(profile),now=new Date().toISOString();
 const row=body.version===0?await env.DB.prepare('INSERT INTO project_blind_profiles(project_id,profile_json,version,updated_at) VALUES(?,?,1,?) ON CONFLICT(project_id) DO NOTHING RETURNING version,updated_at').bind(projectId,json,now).first():await env.DB.prepare('UPDATE project_blind_profiles SET profile_json=?,version=version+1,updated_at=? WHERE project_id=? AND version=? RETURNING version,updated_at').bind(json,now,projectId,body.version).first();
 return row?Response.json({profile,version:row.version,updatedAt:row.updated_at}):Response.json({error:'version_conflict'},{status:409});
}
