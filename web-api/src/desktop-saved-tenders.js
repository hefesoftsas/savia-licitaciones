const bad=()=>Response.json({error:'invalid_saved_tender'},{status:400});
const missing=()=>Response.json({error:'not_found'},{status:404});
const conflict=()=>Response.json({error:'saved_tender_conflict'},{status:409});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function importSavedTender(request,env,runner,requestId){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId))return bad();
 let input;try{input=await request.json();}catch{return bad();}
 const record=input?.record,process=record?.process,watch=input?.secop;
 if(!record||typeof record.sourceId!=='string'||!record.sourceId.trim()||record.sourceId.length>200||!object(process)||process.id!==record.sourceId||!['local','secop-i','secop-ii'].includes(process.source)||typeof record.title!=='string'||!record.title.trim()||record.title.length>300||typeof record.summary!=='string'||!object(record.analysis)||!Array.isArray(record.importedDocuments)||!Array.isArray(record.officialDocuments)||typeof record.createdAt!=='string'||record.createdAt.length>100||typeof record.updatedAt!=='string'||record.updatedAt.length>100)return bad();
 const isSecop=process.source!=='local';
 if(isSecop&&(!object(watch)||watch.sourceId!==record.sourceId||!object(watch.process)||watch.process.id!==process.id||watch.process.source!==process.source||(watch.process.portfolioId||'')!==(process.portfolioId||'')||!Array.isArray(watch.alerts)||watch.alerts.length>1000))return bad();
 if(!isSecop&&watch!==null)return bad();
 if(isSecop&&watch.baseline!==null&&(!object(watch.baseline)||!object(watch.baseline.process)||!(watch.baseline.documents===null||Array.isArray(watch.baseline.documents))||watch.baseline.documents?.length>5000||watch.baseline.documents?.some(item=>!object(item)||typeof item.id!=='string'||typeof item.name!=='string')||typeof watch.baseline.checkedAt!=='string'||watch.baseline.checkedAt.length>100||typeof watch.baseline.error!=='string'||watch.baseline.error.length>20000))return bad();
 const ids=new Set();for(const alert of watch?.alerts||[]){if(!alert||typeof alert.id!=='string'||!alert.id||alert.id.length>256||ids.has(alert.id)||typeof alert.title!=='string'||alert.title.length>5000||typeof alert.kind!=='string'||!alert.kind||alert.kind.length>100||typeof alert.createdAt!=='string'||alert.createdAt.length>100||typeof alert.reviewed!=='boolean'||alert.previous===undefined||alert.current===undefined)return bad();ids.add(alert.id);}
 const normalized={record:{sourceId:record.sourceId,title:record.title,process,summary:record.summary,analysis:record.analysis,importedDocuments:record.importedDocuments,officialDocuments:record.officialDocuments,createdAt:record.createdAt,updatedAt:record.updatedAt},secop:watch},body=JSON.stringify(normalized);if(body.length>3_000_000)return Response.json({error:'too_large'},{status:413});const contentHash=await hash(body),planHash=await hash(JSON.stringify({title:record.title.trim(),nodes:[]}));
 const lookup=()=>env.DB.prepare('SELECT i.project_id,i.content_hash,p.id AS present FROM desktop_saved_tender_imports i LEFT JOIN projects p ON p.id = i.project_id AND p.owner_id = i.owner_id WHERE i.owner_id = ? AND i.request_id = ?').bind(runner.ownerId,requestId).first();
 const responseFor=row=>!row||row.content_hash!==contentHash?conflict():row.present?Response.json({projectId:row.project_id}):Response.json({error:'removed'},{status:410});
 const existing=await lookup();if(existing)return responseFor(existing);
 const id=crypto.randomUUID(),token=crypto.randomUUID(),now=new Date().toISOString(),alerts=JSON.stringify((watch?.alerts||[]).map(item=>({...item,newId:crypto.randomUUID()}))),own='EXISTS (SELECT 1 FROM desktop_saved_tender_imports WHERE owner_id = ? AND request_id = ? AND mutation_id = ?)';
 const result=await env.DB.batch([
  env.DB.prepare("INSERT INTO desktop_saved_tender_imports (owner_id,request_id,source_id,project_id,content_hash,record_json,mutation_id,created_at) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM project_secop WHERE owner_id = ? AND source = ? AND external_id = ?) AND NOT EXISTS (SELECT 1 FROM desktop_saved_tender_imports WHERE owner_id = ? AND source_id = ?) ON CONFLICT(owner_id,request_id) DO NOTHING").bind(runner.ownerId,requestId,record.sourceId,id,contentHash,JSON.stringify(normalized.record),token,now,runner.ownerId,process.source,record.sourceId,runner.ownerId,record.sourceId),
  env.DB.prepare(`INSERT INTO projects (id,owner_id,title,created_at) SELECT ?,?,?,? WHERE ${own}`).bind(id,runner.ownerId,record.title.trim(),now,runner.ownerId,requestId,token),
  env.DB.prepare(`INSERT INTO desktop_plan_imports (owner_id,request_id,request_hash,project_id,mutation_id,created_at) SELECT ?,?,?,?,?,? WHERE ${own}`).bind(runner.ownerId,requestId,planHash,id,token,now,runner.ownerId,requestId,token),
  env.DB.prepare(`INSERT INTO project_technical_plans (project_id,version,updated_at) SELECT ?,1,? WHERE ${own}`).bind(id,now,runner.ownerId,requestId,token),
  env.DB.prepare(`INSERT INTO project_secop (project_id,owner_id,source,external_id,process_json) SELECT ?,?,?,?,? WHERE ? = 1 AND ${own}`).bind(id,runner.ownerId,process.source,record.sourceId,JSON.stringify(process),isSecop?1:0,runner.ownerId,requestId,token),
  env.DB.prepare(`INSERT INTO secop_watch_baselines_web (project_id,owner_id,process_json,documents_json,checked_at,error,revision,mutation_token) SELECT ?,?,?,?,?,?,1,? WHERE ? = 1 AND ${own}`).bind(id,runner.ownerId,JSON.stringify(watch?.baseline?.process||{}),!watch?.baseline||watch.baseline.documents===null?null:JSON.stringify(watch.baseline.documents),watch?.baseline?.checkedAt||'',watch?.baseline?.error||'',token,watch?.baseline?1:0,runner.ownerId,requestId,token),
  env.DB.prepare(`INSERT INTO secop_watch_alerts_web (id,project_id,owner_id,title,kind,previous_json,current_json,created_at,reviewed) SELECT json_extract(value,'$.newId'),?,?,json_extract(value,'$.title'),json_extract(value,'$.kind'),json_quote(json_extract(value,'$.previous')),json_quote(json_extract(value,'$.current')),json_extract(value,'$.createdAt'),json_extract(value,'$.reviewed') FROM json_each(?) WHERE ${own}`).bind(id,runner.ownerId,alerts,runner.ownerId,requestId,token),
 ]);
 if(result[0].meta.changes)return Response.json({projectId:id},{status:201});return responseFor(await lookup());
}
export async function importedSavedTender(request,env,ownerId,projectId){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 const project=await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId,ownerId).first();if(!project)return missing();
 const row=await env.DB.prepare('SELECT record_json FROM desktop_saved_tender_imports WHERE project_id = ? AND owner_id = ?').bind(projectId,ownerId).first();return Response.json({record:row?JSON.parse(row.record_json):null});
}
