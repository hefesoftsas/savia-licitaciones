import {defaultNavigation,validNavigation,migrateNavigation} from '../../client/src/features/web/navigation-layout.mjs';
export async function navigationPreferences(request,env,ownerId){
 if(request.method==='GET'){
  const row=await env.DB.prepare('SELECT layout_json FROM navigation_preferences WHERE owner_id=?').bind(ownerId).first();
  return Response.json({groups:row?migrateNavigation(JSON.parse(row.layout_json)):defaultNavigation()});
 }
 if(request.method!=='PUT')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_json'},{status:400});}
 if(input)input.groups=migrateNavigation(input.groups);
 if(!validNavigation(input?.groups))return Response.json({error:'invalid_navigation'},{status:400});
 const groups=input.groups.map(({id,name,items})=>({id,name:name.trim(),items}));
 await env.DB.prepare('INSERT INTO navigation_preferences(owner_id,layout_json) VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET layout_json=excluded.layout_json').bind(ownerId,JSON.stringify(groups)).run();
 return Response.json({groups});
}
