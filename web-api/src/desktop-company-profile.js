import { normalizeCompanyProfile } from './company-profile.js';
const bad=()=>Response.json({error:'invalid_profile'},{status:400}),conflict=()=>Response.json({error:'profile_conflict'},{status:409});
export async function importDesktopCompanyProfile(request,env,runner,requestId){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId))return bad();
 let input;try{input=await request.json();}catch{return bad();}
 const profile=normalizeCompanyProfile(input?.profile);if(!profile)return bad();
 const json=JSON.stringify(profile),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json)),hash=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
 const lookup=()=>env.DB.prepare('SELECT content_hash FROM desktop_company_profile_imports WHERE owner_id=? AND request_id=?').bind(runner.ownerId,requestId).first();
 const prior=await lookup();if(prior)return prior.content_hash===hash?Response.json({imported:true}):conflict();
 const mutation=crypto.randomUUID(),now=new Date().toISOString();
 const result=await env.DB.batch([
  env.DB.prepare('INSERT INTO desktop_company_profile_imports(owner_id,request_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM company_profiles WHERE owner_id=?) ON CONFLICT(owner_id,request_id) DO NOTHING').bind(runner.ownerId,requestId,hash,mutation,now,runner.ownerId),
  env.DB.prepare('INSERT INTO company_profiles(owner_id,profile_json,version,updated_at) SELECT ?,?,1,? WHERE EXISTS (SELECT 1 FROM desktop_company_profile_imports WHERE owner_id=? AND request_id=? AND mutation_id=?)').bind(runner.ownerId,json,now,runner.ownerId,requestId,mutation),
 ]);
 if(result[0].meta.changes)return Response.json({imported:true},{status:201});
 const existing=await lookup();return existing?.content_hash===hash?Response.json({imported:true}):conflict();
}
