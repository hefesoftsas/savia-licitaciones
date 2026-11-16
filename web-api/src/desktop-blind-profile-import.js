import presets from '../../client/electron/services/blindCheckPresets.cjs';
import {digest} from './runners.js';
const bad=()=>Response.json({error:'invalid_profile'},{status:400});
export async function importDesktopBlindProfile(request,env,runner,requestId){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 let input;try{input=await request.json();}catch{return bad();}
 if(!input?.profile||typeof input.profile!=='object'||Array.isArray(input.profile)||typeof input.updatedAt!=='string'||!input.updatedAt||input.updatedAt.length>100)return bad();
 const json=JSON.stringify(input.profile);if(json.length>100000)return bad();
 try{if(JSON.stringify(presets.normalizeProfile(input.profile))!==json)return bad();}catch{return bad();}
 const hash=await digest(JSON.stringify({profile:input.profile,updatedAt:input.updatedAt}));
 const project=await env.DB.prepare('SELECT i.project_id FROM desktop_plan_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=?').bind(runner.ownerId,requestId).first();
 if(!project)return Response.json({error:'not_found'},{status:404});
 const mutation=crypto.randomUUID(),now=new Date().toISOString();
 const result=await env.DB.batch([
  env.DB.prepare('INSERT INTO desktop_blind_profile_imports(owner_id,request_id,project_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM project_blind_profiles WHERE project_id=?) ON CONFLICT(owner_id,request_id) DO NOTHING').bind(runner.ownerId,requestId,project.project_id,hash,mutation,now,project.project_id),
  env.DB.prepare('INSERT INTO project_blind_profiles(project_id,profile_json,version,updated_at) SELECT ?,?,1,? WHERE EXISTS (SELECT 1 FROM desktop_blind_profile_imports WHERE owner_id=? AND request_id=? AND mutation_id=?)').bind(project.project_id,json,input.updatedAt,runner.ownerId,requestId,mutation),
 ]);
 if(result[0].meta.changes)return Response.json({imported:true},{status:201});
 const previous=await env.DB.prepare('SELECT content_hash FROM desktop_blind_profile_imports WHERE owner_id=? AND request_id=?').bind(runner.ownerId,requestId).first();
 return previous?.content_hash===hash?Response.json({imported:true}):Response.json({error:'profile_conflict'},{status:409});
}
