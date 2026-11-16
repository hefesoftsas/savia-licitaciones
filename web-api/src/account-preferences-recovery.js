const allowed={language:['es','en'],theme:['light','dark','system'],colorTheme:['neutral','blue','green','violet','rose'],visualStyle:['vega','nova','maia','lyra','mira']};
const columns='savia_language AS language,savia_theme AS theme,savia_color_theme AS colorTheme,savia_visual_style AS visualStyle,savia_preferences_revision AS revision';
export async function runnerPreferencesSnapshot(request,env,runner){
 if(request.method==='GET'){
  const row=await env.DB.prepare(`SELECT ${columns} FROM "user" WHERE id=?`).bind(runner.ownerId).first();
  if(!row)return Response.json({error:'not_found'},{status:404});
  const {revision,...preferences}=row;return Response.json({revision,preferences});
 }
 if(request.method!=='PUT')return new Response('Method not allowed',{status:405});
 let body;try{body=await request.json();}catch{return Response.json({error:'invalid_json'},{status:400});}
 const prefs=body?.preferences;
 if(!Number.isSafeInteger(body?.expectedRevision)||body.expectedRevision<0||body.expectedRevision>=Number.MAX_SAFE_INTEGER||!prefs||typeof prefs!=='object'||Array.isArray(prefs)||Object.keys(prefs).length!==4||Object.entries(allowed).some(([key,values])=>!values.includes(prefs[key])))return Response.json({error:'invalid_preferences'},{status:400});
 const row=await env.DB.prepare(`UPDATE "user" SET savia_language=?,savia_theme=?,savia_color_theme=?,savia_visual_style=?,savia_preferences_revision=savia_preferences_revision+1 WHERE id=? AND savia_preferences_revision=? RETURNING savia_preferences_revision AS revision`).bind(prefs.language,prefs.theme,prefs.colorTheme,prefs.visualStyle,runner.ownerId,body.expectedRevision).first();
 return row?Response.json(row):Response.json({error:'preferences_changed'},{status:409});
}
