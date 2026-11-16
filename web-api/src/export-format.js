import exportDefaults from '../../client/electron/services/exportFormatDefaults.cjs';
const bad=()=>Response.json({error:'invalid_format'},{status:400});
const conflict=()=>Response.json({error:'version_conflict'},{status:409});
export async function exportFormat(request,env,owner){
 if(request.method==='GET'){
  const row=await env.DB.prepare('SELECT format_json,version,updated_at FROM export_format_settings WHERE owner_id=?').bind(owner).first();
  return Response.json({format:row?JSON.parse(row.format_json):exportDefaults.cloneDefaultExportFormat(),version:row?.version||0,updatedAt:row?.updated_at||null});
 }
 if(request.method!=='PUT')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return bad();}
 if(!Number.isSafeInteger(input?.version)||input.version<0||!input.format||typeof input.format!=='object'||Array.isArray(input.format)||JSON.stringify(input.format).length>100000)return bad();
 const format=exportDefaults.normalizeExportFormat(input.format),json=JSON.stringify(format),now=new Date().toISOString();
 const row=input.version===0?await env.DB.prepare('INSERT INTO export_format_settings(owner_id,format_json,version,updated_at) VALUES(?,?,1,?) ON CONFLICT(owner_id) DO NOTHING RETURNING version').bind(owner,json,now).first():await env.DB.prepare('UPDATE export_format_settings SET format_json=?,version=version+1,updated_at=? WHERE owner_id=? AND version=? RETURNING version').bind(json,now,owner,input.version).first();
 return row?Response.json({format,version:row.version,updatedAt:now}):conflict();
}
