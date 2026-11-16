const bad=()=>Response.json({error:'invalid_paa_import'},{status:400});
const conflict=()=>Response.json({error:'paa_import_conflict'},{status:409});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
export async function importDesktopPaa(request,env,runner,requestId,sourceKey){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)||!/^[a-f0-9]{64}$/.test(sourceKey))return bad();
 let input;try{input=await request.json();}catch{return bad();}
 if(!input||typeof input.planId!=='string'||!input.planId.trim()||input.planId.length>200||await hash(input.planId)!==sourceKey||!object(input.header)||input.header.planId!==input.planId||typeof input.checkedAt!=='string'||input.checkedAt.length>100||typeof input.error!=='string'||input.error.length>20000||!Array.isArray(input.alerts)||input.alerts.length>1000)return bad();
 const ids=new Set();for(const alert of input.alerts){if(!alert||typeof alert.id!=='string'||!alert.id||alert.id.length>256||ids.has(alert.id)||!object(alert.previous)||!object(alert.current)||typeof alert.createdAt!=='string'||alert.createdAt.length>100||typeof alert.reviewed!=='boolean')return bad();ids.add(alert.id);}
 const details={planId:input.planId,header:input.header,checkedAt:input.checkedAt,error:input.error,alerts:input.alerts.map(({id,previous,current,createdAt,reviewed})=>({id,previous,current,createdAt,reviewed}))},body=JSON.stringify(details);if(body.length>3_000_000)return Response.json({error:'too_large'},{status:413});const contentHash=await hash(body);
 const lookup=()=>env.DB.prepare('SELECT i.watch_id,i.content_hash,w.id AS present FROM desktop_paa_imports i LEFT JOIN paa_watches w ON w.id = i.watch_id AND w.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ? AND i.source_key = ?').bind(runner.ownerId,requestId,sourceKey).first();
 const responseFor=row=>!row||row.content_hash!==contentHash?conflict():row.present?Response.json({watchId:row.watch_id}):Response.json({error:'removed'},{status:410});
 const previous=await lookup();if(previous)return responseFor(previous);
 const id=crypto.randomUUID(),mutation=crypto.randomUUID(),now=new Date().toISOString(),alerts=JSON.stringify(details.alerts.map(alert=>({...alert,newId:crypto.randomUUID()})));
 const own='EXISTS (SELECT 1 FROM desktop_paa_imports WHERE owner_id = ? AND request_id = ? AND source_key = ? AND mutation_id = ?)';
 const result=await env.DB.batch([
  env.DB.prepare('INSERT INTO paa_watches (id,owner_id,plan_id,header_json,checked_at,error,revision,mutation_token) SELECT ?,?,?,?,?,?,1,? WHERE NOT EXISTS (SELECT 1 FROM paa_watches WHERE owner_id = ? AND plan_id = ?) AND NOT EXISTS (SELECT 1 FROM desktop_paa_imports WHERE owner_id = ? AND request_id = ? AND source_key = ?)').bind(id,runner.ownerId,input.planId,JSON.stringify(input.header),input.checkedAt,input.error,mutation,runner.ownerId,input.planId,runner.ownerId,requestId,sourceKey),
  env.DB.prepare('INSERT INTO desktop_paa_imports (owner_id,request_id,source_key,watch_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM paa_watches WHERE id = ? AND owner_id = ? AND mutation_token = ?) ON CONFLICT(owner_id,request_id,source_key) DO NOTHING').bind(runner.ownerId,requestId,sourceKey,id,contentHash,mutation,now,id,runner.ownerId,mutation),
  env.DB.prepare(`INSERT INTO paa_alerts (id,watch_id,owner_id,previous_json,current_json,created_at,reviewed) SELECT json_extract(value,'$.newId'),?,?,json_extract(value,'$.previous'),json_extract(value,'$.current'),json_extract(value,'$.createdAt'),json_extract(value,'$.reviewed') FROM json_each(?) WHERE ${own}`).bind(id,runner.ownerId,alerts,runner.ownerId,requestId,sourceKey,mutation),
  env.DB.prepare(`DELETE FROM paa_watches WHERE id = ? AND owner_id = ? AND NOT ${own}`).bind(id,runner.ownerId,runner.ownerId,requestId,sourceKey,mutation),
 ]);
 if(result[1].meta.changes)return Response.json({watchId:id},{status:201});const after=await lookup();return after?responseFor(after):conflict();
}
