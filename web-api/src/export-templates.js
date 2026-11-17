import defaults from '../../client/electron/services/exportFormatDefaults.cjs';
import systemPresets from '../../client/electron/services/systemExportTemplates.cjs';
import spainTemplates from '../../client/electron/services/spainTemplates.cjs';
import colombiaTemplates from '../../client/electron/services/colombiaTemplates.cjs';
const bad=()=>Response.json({error:'invalid_template'},{status:400}),missing=()=>Response.json({error:'not_found'},{status:404}),conflict=()=>Response.json({error:'template_conflict'},{status:409});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function userExportTemplates(request,env,owner,id){
 if(request.method!=='GET'&&request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 if(request.method==='GET'&&!id){const rows=await env.DB.prepare('SELECT * FROM export_format_templates WHERE owner_id=? ORDER BY updated_at DESC,id').bind(owner).all();return Response.json({templates:rows.results.map(row=>({id:row.id,name:row.name,format:JSON.parse(row.format_json),version:row.version,createdAt:row.created_at,updatedAt:row.updated_at})),systemTemplates:systemPresets.SYSTEM_EXPORT_TEMPLATES.map(item=>({id:item.template_id,format:item.config})),documentTemplates:[...spainTemplates.SPAIN_DOCUMENT_TEMPLATES.map(item=>({...item,market:'ES'})),...colombiaTemplates.COLOMBIA_DOCUMENT_TEMPLATES.map(item=>({...item,market:'CO'}))]});}
 if((request.method==='POST'&&!id)||(request.method==='PUT'&&id)){
  let input;try{input=await request.json();}catch{return bad();}
  if(typeof input?.name!=='string'||!input.name.trim()||input.name.length>300||!input.format||typeof input.format!=='object'||Array.isArray(input.format)||JSON.stringify(input.format).length>100000||(id&&(!Number.isSafeInteger(input.version)||input.version<1)))return bad();
  const name=input.name.trim(),format=defaults.normalizeExportFormat({...input.format,template_name:name}),now=new Date().toISOString(),newId=id||crypto.randomUUID();
  const row=id?await env.DB.prepare('UPDATE export_format_templates SET name=?,format_json=?,version=version+1,updated_at=? WHERE id=? AND owner_id=? AND version=? RETURNING *').bind(name,JSON.stringify(format),now,id,owner,input.version).first():await env.DB.prepare('INSERT INTO export_format_templates(id,owner_id,name,format_json,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?) RETURNING *').bind(newId,owner,name,JSON.stringify(format),now,now).first();
  if(!row){const owned=await env.DB.prepare('SELECT id FROM export_format_templates WHERE id=? AND owner_id=?').bind(id,owner).first();return owned?conflict():missing();}
  return Response.json({template:{id:row.id,name:row.name,format:JSON.parse(row.format_json),version:row.version,createdAt:row.created_at,updatedAt:row.updated_at}},{status:id?200:201});
 }
 if(request.method==='DELETE'&&id){const raw=new URL(request.url).searchParams.get('version');if(raw!==null&&!/^[1-9]\d*$/.test(raw))return bad();const row=await env.DB.prepare('DELETE FROM export_format_templates WHERE owner_id=? AND id=? AND (? IS NULL OR version=?) RETURNING id').bind(owner,id,raw,raw===null?null:Number(raw)).first();if(row)return new Response(null,{status:204});const exists=await env.DB.prepare('SELECT id FROM export_format_templates WHERE id=? AND owner_id=?').bind(id,owner).first();return exists?conflict():missing();}
 return new Response('Method not allowed',{status:405});
}
export async function importDesktopExportTemplate(request,env,runner,requestId,sourceKey){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)||!/^[a-f0-9]{64}$/.test(sourceKey))return bad();
 let input;try{input=await request.json();}catch{return bad();}
 if(typeof input?.sourceId!=='string'||!input.sourceId||input.sourceId.length>256||await hash(input.sourceId)!==sourceKey||typeof input.name!=='string'||!input.name.trim()||input.name.length>300||!input.config||typeof input.config!=='object'||Array.isArray(input.config)||JSON.stringify(input.config).length>100000||typeof input.createdAt!=='string'||input.createdAt.length>100||typeof input.updatedAt!=='string'||input.updatedAt.length>100)return bad();
 const format=defaults.normalizeExportFormat({...input.config,template_name:input.name}),body=JSON.stringify({sourceId:input.sourceId,name:input.name,format,createdAt:input.createdAt,updatedAt:input.updatedAt}),contentHash=await hash(body);
 const lookup=()=>env.DB.prepare('SELECT i.template_id,i.content_hash,t.id AS present FROM desktop_export_template_imports i LEFT JOIN export_format_templates t ON t.id=i.template_id AND t.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=? AND i.source_key=?').bind(runner.ownerId,requestId,sourceKey).first();
 const response=row=>!row||row.content_hash!==contentHash?conflict():row.present?Response.json({templateId:row.template_id}):Response.json({error:'removed'},{status:410});
 const prior=await lookup();if(prior)return response(prior);const id=crypto.randomUUID(),mutation=crypto.randomUUID(),now=new Date().toISOString();
 const result=await env.DB.batch([
  env.DB.prepare('INSERT INTO export_format_templates(id,owner_id,name,format_json,version,created_at,updated_at) SELECT ?,?,?,?,1,?,? WHERE NOT EXISTS (SELECT 1 FROM desktop_export_template_imports WHERE owner_id=? AND request_id=? AND source_key=?)').bind(id,runner.ownerId,input.name,JSON.stringify(format),input.createdAt,input.updatedAt,runner.ownerId,requestId,sourceKey),
  env.DB.prepare('INSERT INTO desktop_export_template_imports(owner_id,request_id,source_key,template_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM export_format_templates WHERE id=? AND owner_id=?) ON CONFLICT(owner_id,request_id,source_key) DO NOTHING').bind(runner.ownerId,requestId,sourceKey,id,contentHash,mutation,now,id,runner.ownerId),
  env.DB.prepare('DELETE FROM export_format_templates WHERE id=? AND owner_id=? AND NOT EXISTS (SELECT 1 FROM desktop_export_template_imports WHERE owner_id=? AND request_id=? AND source_key=? AND mutation_id=?)').bind(id,runner.ownerId,runner.ownerId,requestId,sourceKey,mutation),
 ]);
 return result[1].meta.changes?Response.json({templateId:id},{status:201}):response(await lookup());
}
