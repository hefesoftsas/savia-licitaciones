import secop from '../../client/electron/services/secopService.cjs';
const missing=()=>Response.json({error:'not_found'},{status:404});
const conflict=()=>Response.json({error:'version_conflict'},{status:409});
const view=row=>({...JSON.parse(row.header_json),id:row.id,checkedAt:row.checked_at,error:row.error});
const api=language=>secop.createSecopService({configStore:{load:()=>({ui_language:language==='en'?'en':'es'})}});
async function read(env,owner,id){return env.DB.prepare('SELECT * FROM paa_watches WHERE id = ? AND owner_id = ?').bind(id,owner).first();}
async function check(env,owner,row,language) {
 const result=await api(language).getProcurementPlanHeader(row.plan_id),now=new Date().toISOString(),token=crypto.randomUUID();
 if(!result.success || !result.data){const changed=await env.DB.prepare('UPDATE paa_watches SET checked_at = ?, error = ?, revision = revision + 1, mutation_token = ? WHERE id = ? AND owner_id = ? AND revision = ?').bind(now,String(result.message||'No se pudo consultar el plan.').slice(0,1000),token,row.id,owner,row.revision).run();if(!changed.meta.changes)return conflict();return Response.json({error:'source_unavailable'},{status:502});}
 const previous=JSON.parse(row.header_json),current={...previous};for(const [key,value] of Object.entries(result.data))if(value!==null&&value!==undefined&&value!=='')current[key]=value;
 const changed=['version','modifiedAt','status'].some(key=>previous[key]&&current[key]&&previous[key]!==current[key]);
 const results=await env.DB.batch([
  env.DB.prepare('UPDATE paa_watches SET header_json = ?, checked_at = ?, error = ?, revision = revision + 1, mutation_token = ? WHERE id = ? AND owner_id = ? AND revision = ?').bind(JSON.stringify(current),now,'',token,row.id,owner,row.revision),
  env.DB.prepare('INSERT INTO paa_alerts (id,watch_id,owner_id,previous_json,current_json,created_at,reviewed) SELECT ?,?,?,?,?,?,0 WHERE ? = 1 AND EXISTS (SELECT 1 FROM paa_watches WHERE id = ? AND owner_id = ? AND mutation_token = ?)').bind(crypto.randomUUID(),row.id,owner,JSON.stringify(previous),JSON.stringify(current),now,changed?1:0,row.id,owner,token),
 ]);
 if(!results[0].meta.changes)return conflict();return Response.json({watch:{...current,id:row.id,checkedAt:now,error:''}});
}
export async function paaWatch(request,env,owner,kind,id) {
 if(request.method!=='GET' && request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 if(kind==='watches'&&!id&&request.method==='GET'){
  const [items,alerts]=await Promise.all([env.DB.prepare('SELECT * FROM paa_watches WHERE owner_id = ? ORDER BY checked_at DESC,id').bind(owner).all(),env.DB.prepare('SELECT a.*,w.plan_id FROM paa_alerts a JOIN paa_watches w ON w.id = a.watch_id AND w.owner_id = a.owner_id WHERE a.owner_id = ? ORDER BY a.created_at DESC,a.id DESC').bind(owner).all()]);
  const rows=alerts.results.map(row=>({id:row.id,planId:row.plan_id,previous:JSON.parse(row.previous_json),current:JSON.parse(row.current_json),createdAt:row.created_at,reviewed:!!row.reviewed}));return Response.json({items:items.results.map(view),alerts:rows,unreadCount:rows.filter(row=>!row.reviewed).length});
 }
 if(kind==='watches'&&!id&&request.method==='POST'){
  let input;try{input=await request.json();}catch{return Response.json({error:'invalid_input'},{status:400});}const planId=typeof input?.planId==='string'?input.planId.trim():'';if(!planId||planId.length>200||!['es','en',undefined].includes(input.language))return Response.json({error:'invalid_input'},{status:400});
  const existing=await env.DB.prepare('SELECT * FROM paa_watches WHERE owner_id = ? AND plan_id = ?').bind(owner,planId).first();if(existing)return Response.json({watch:view(existing)});
  await env.DB.prepare('INSERT INTO paa_watch_generations (owner_id,plan_id,generation) VALUES (?,?,0) ON CONFLICT(owner_id,plan_id) DO NOTHING').bind(owner,planId).run();const generation=await env.DB.prepare('SELECT generation FROM paa_watch_generations WHERE owner_id = ? AND plan_id = ?').bind(owner,planId).first();
  const result=await api(input.language).getProcurementPlanHeader(planId);if(!result.success||!result.data)return Response.json({error:'source_unavailable'},{status:502});
  const watchId=crypto.randomUUID(),now=new Date().toISOString();const inserted=await env.DB.prepare('INSERT INTO paa_watches (id,owner_id,plan_id,header_json,checked_at,error,revision,mutation_token) SELECT ?,?,?,?,?,?,1,? WHERE EXISTS (SELECT 1 FROM paa_watch_generations WHERE owner_id = ? AND plan_id = ? AND generation = ?) ON CONFLICT(owner_id,plan_id) DO NOTHING RETURNING *').bind(watchId,owner,planId,JSON.stringify(result.data),now,'',crypto.randomUUID(),owner,planId,generation.generation).first();
  if(inserted)return Response.json({watch:view(inserted)},{status:201});const row=await env.DB.prepare('SELECT * FROM paa_watches WHERE owner_id = ? AND plan_id = ?').bind(owner,planId).first();return row?Response.json({watch:view(row)}):conflict();
 }
 if(kind==='due'&&request.method==='POST'){
  const now=Date.now(),normal=new Date(now-6*60*60*1000).toISOString(),failed=new Date(now-15*60*1000).toISOString();const due=await env.DB.prepare("SELECT * FROM paa_watches WHERE owner_id = ? AND ((error = '' AND checked_at <= ?) OR (error <> '' AND checked_at <= ?)) ORDER BY checked_at,id LIMIT 3").bind(owner,normal,failed).all();
  let checked=0;for(const row of due.results){await check(env,owner,row,'es');checked++;}return Response.json({checked});
 }
 if(kind==='review'&&id&&request.method==='POST'){const row=await env.DB.prepare('UPDATE paa_alerts SET reviewed = 1 WHERE id = ? AND owner_id = ? RETURNING id').bind(id,owner).first();return row?Response.json({reviewed:true}):missing();}
 if(kind==='watches'&&id&&request.method==='DELETE'){
  const row=await read(env,owner,id);if(!row)return missing();await env.DB.batch([env.DB.prepare('INSERT INTO paa_watch_generations (owner_id,plan_id,generation) VALUES (?,?,1) ON CONFLICT(owner_id,plan_id) DO UPDATE SET generation = generation + 1').bind(owner,row.plan_id),env.DB.prepare('DELETE FROM paa_watches WHERE id = ? AND owner_id = ?').bind(id,owner)]);return new Response(null,{status:204});
 }
 if(kind==='check'&&id&&request.method==='POST'){const row=await read(env,owner,id);return row?check(env,owner,row,'es'):missing();}
 return new Response('Method not allowed',{status:405});
}
