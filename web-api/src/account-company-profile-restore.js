import {normalizeCompanyProfile} from './company-profile.js';
const bad=()=>Response.json({error:'invalid_profile'},{status:400}),conflict=()=>Response.json({error:'profile_conflict'},{status:409});
export async function importAccountCompanyProfileSnapshot(request,env,runner,requestId){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId))return bad();
 let input;try{input=await request.json();}catch{return bad();}
 if(!input||!Object.hasOwn(input,'profile'))return bad();
 let value=null;
 if(input.profile!==null){const profile=normalizeCompanyProfile(input.profile?.profile),updatedAt=input.profile?.updatedAt;if(!profile||typeof updatedAt!=='string'||!updatedAt||updatedAt.length>100)return bad();value={profile,updatedAt};}
 const json=JSON.stringify(value),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json)),hash=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
 const lookup=()=>env.DB.prepare('SELECT content_hash FROM account_company_profile_snapshot_imports WHERE owner_id=? AND request_id=?').bind(runner.ownerId,requestId).first();
 const prior=await lookup();if(prior)return prior.content_hash===hash?Response.json({imported:true}):conflict();
 const mutation=crypto.randomUUID(),now=new Date().toISOString();
 const statements=[env.DB.prepare('INSERT INTO account_company_profile_snapshot_imports(owner_id,request_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,? WHERE (?=0 OR NOT EXISTS (SELECT 1 FROM company_profiles WHERE owner_id=?)) ON CONFLICT(owner_id,request_id) DO NOTHING').bind(runner.ownerId,requestId,hash,mutation,now,value?1:0,runner.ownerId)];
 if(value)statements.push(env.DB.prepare('INSERT INTO company_profiles(owner_id,profile_json,version,updated_at) SELECT ?,?,1,? WHERE EXISTS (SELECT 1 FROM account_company_profile_snapshot_imports WHERE owner_id=? AND request_id=? AND mutation_id=?)').bind(runner.ownerId,JSON.stringify(value.profile),value.updatedAt,runner.ownerId,requestId,mutation));
 const result=await env.DB.batch(statements);if(result[0].meta.changes)return Response.json({imported:true},{status:201});
 const existing=await lookup();return existing?.content_hash===hash?Response.json({imported:true}):conflict();
}
