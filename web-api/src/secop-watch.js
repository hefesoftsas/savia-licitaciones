import { isLicitTenderId } from './licit.js';
import secop from '../../client/electron/services/secopService.cjs';
import { getPlacspDetail, syncPlacspFeed } from './secop.js';
const missing=()=>Response.json({error:'not_found'},{status:404});
const conflict=()=>Response.json({error:'version_conflict'},{status:409});
const service=()=>secop.createSecopService({configStore:{load:()=>({ui_language:'es'})}});
const lookup=(env,owner,id)=>env.DB.prepare('SELECT project_id,process_json,source,external_id FROM project_secop WHERE project_id = ? AND owner_id = ?').bind(id,owner).first();
function diffDocuments(oldDocs,collected,changes){
 const next=[...new Map(collected.map(({id,name})=>[id,{id,name}])).values()];
 if(oldDocs){const known=new Set(oldDocs.map(doc=>doc.id));for(const doc of next)if(!known.has(doc.id))changes.push({kind:'document',previous:null,current:doc});}
 return next;
}
async function check(env,owner,record){
 const project=record.project_id,source=JSON.parse(record.process_json);
 await env.DB.prepare("INSERT INTO secop_watch_baselines_web (project_id,owner_id,process_json,documents_json,checked_at,error,revision,mutation_token) SELECT project_id,owner_id,'{}',NULL,'','',0,'' FROM project_secop WHERE project_id = ? AND owner_id = ? ON CONFLICT(project_id) DO NOTHING").bind(project,owner).run();
 const previous=await env.DB.prepare('SELECT * FROM secop_watch_baselines_web WHERE project_id = ? AND owner_id = ?').bind(project,owner).first();if(!previous)return missing();
 const oldProcess=JSON.parse(previous.process_json),oldDocs=previous.documents_json?JSON.parse(previous.documents_json):null;
 const isPlacsp=record.source==='placsp';
 const api=isPlacsp?null:service();
 const isLicit=isPlacsp&&isLicitTenderId(record.external_id);
 const sync=isPlacsp&&!isLicit?await syncPlacspFeed(env,{force:true}).catch(err=>({synced:false,error:err?.message||'No se pudo sincronizar PLACSP.'})):null;
 const result=isPlacsp
  ?await getPlacspDetail(env,record.external_id,{fresh:isLicit})
  :await api.getProcessDetail(record.external_id,record.source,{fresh:true});
 const isCurrent=async()=>{const [current,revision]=await Promise.all([lookup(env,owner,project),env.DB.prepare('SELECT revision FROM secop_watch_baselines_web WHERE project_id = ? AND owner_id = ?').bind(project,owner).first()]);return current?.process_json===record.process_json && revision?.revision===previous.revision;};
 if(!await isCurrent())return conflict();
 let process={...oldProcess},docs=oldDocs,issues=[];const changes=[];
 if(result.success&&result.data){
  for(const field of ['status','phase','deadline','value']){const value=result.data[field];if(value===undefined||value===null||value==='')continue;if(oldProcess[field]!==undefined&&oldProcess[field]!==value&&(field!=='deadline'||oldProcess.deadlineVerified===true))changes.push({kind:field,previous:oldProcess[field],current:value});process[field]=value;if(field==='deadline')process.deadlineVerified=result.data.deadlineVerified===true;}
  if(isPlacsp){
   docs=diffDocuments(oldDocs,Array.isArray(result.data.documents)?result.data.documents:[],changes);
   if(sync?.synced===false&&sync.error)issues.push(sync.error);
  }
 }
 else issues.push(result.message||sync?.error||'No se pudo consultar el proceso.');
 const portfolio=result.data?.portfolioId||source.portfolioId;
 if(record.source==='secop-ii'&&portfolio){let offset=0,docResult,complete=false;const collected=[];while(offset<=5000){docResult=await api.getProcessDocuments(portfolio,{offset,fresh:true});if(!await isCurrent())return conflict();if(!docResult.success||!docResult.data||docResult.data.partial)break;collected.push(...docResult.data.items);if(!docResult.data.truncated){complete=true;break;}if(!docResult.data.items.length)break;offset+=100;}
  if(complete)docs=diffDocuments(oldDocs,collected,changes);
  else issues.push(docResult?.success?'La lista de documentos está incompleta; consulta el expediente oficial.':(docResult?.message||'No se pudieron consultar los documentos.'));
 }
 const now=new Date().toISOString(),token=crypto.randomUUID(),pending=JSON.stringify(changes.map(change=>({...change,id:crypto.randomUUID()})));
 const results=await env.DB.batch([
  env.DB.prepare('UPDATE secop_watch_baselines_web SET process_json = ?, documents_json = ?, checked_at = ?, error = ?, revision = revision + 1, mutation_token = ? WHERE project_id = ? AND owner_id = ? AND revision = ? AND EXISTS (SELECT 1 FROM project_secop WHERE project_id = ? AND owner_id = ? AND process_json = ?)').bind(JSON.stringify(process),docs===null?null:JSON.stringify(docs),now,issues.join(' ').slice(0,2000),token,project,owner,previous.revision,project,owner,record.process_json),
  env.DB.prepare("INSERT INTO secop_watch_alerts_web (id,project_id,owner_id,title,kind,previous_json,current_json,created_at,reviewed) SELECT json_extract(value,'$.id'),?,?,?,json_extract(value,'$.kind'),json_quote(json_extract(value,'$.previous')),json_quote(json_extract(value,'$.current')),?,0 FROM json_each(?) WHERE EXISTS (SELECT 1 FROM secop_watch_baselines_web WHERE project_id = ? AND owner_id = ? AND mutation_token = ?)").bind(project,owner,source.title||record.external_id,now,pending,project,owner,token),
 ]);
 return results[0].meta.changes?Response.json({checked:true}):conflict();
}
export async function secopWatch(request,env,owner,kind,id){
 if(request.method!=='GET'&&request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 if(kind==='overview'&&request.method==='GET'){
  const result=await env.DB.prepare('SELECT a.* FROM secop_watch_alerts_web a JOIN project_secop s ON s.project_id = a.project_id AND s.owner_id = a.owner_id WHERE a.owner_id = ? ORDER BY a.created_at DESC,a.id DESC').bind(owner).all();
  const alerts=result.results.map(row=>({id:row.id,projectId:row.project_id,title:row.title,kind:row.kind,previous:JSON.parse(row.previous_json||'null'),current:JSON.parse(row.current_json||'null'),createdAt:row.created_at,reviewed:!!row.reviewed}));return Response.json({alerts,unreadCount:alerts.filter(row=>!row.reviewed).length});
 }
 if(kind==='review'&&request.method==='POST'){const row=await env.DB.prepare('UPDATE secop_watch_alerts_web SET reviewed = 1 WHERE id = ? AND owner_id = ? RETURNING id').bind(id,owner).first();return row?Response.json({reviewed:true}):missing();}
 if(kind==='due'&&request.method==='POST'){
  const now=Date.now(),normal=new Date(now-6*60*60*1000).toISOString(),failed=new Date(now-15*60*1000).toISOString();const rows=await env.DB.prepare("SELECT s.project_id,s.process_json,s.source,s.external_id FROM project_secop s LEFT JOIN secop_watch_baselines_web b ON b.project_id = s.project_id AND b.owner_id = s.owner_id WHERE s.owner_id = ? AND (b.project_id IS NULL OR b.checked_at = '' OR (b.error = '' AND b.checked_at <= ?) OR (b.error <> '' AND b.checked_at <= ?)) ORDER BY COALESCE(b.checked_at,''),s.project_id LIMIT 1").bind(owner,normal,failed).all();for(const row of rows.results)await check(env,owner,row);return Response.json({checked:rows.results.length});
 }
 if(kind==='project'){
  const record=await lookup(env,owner,id);if(!record)return missing();
  if(request.method==='POST')return check(env,owner,record);
  if(request.method==='GET'){
   const [baseline,alerts]=await Promise.all([env.DB.prepare('SELECT * FROM secop_watch_baselines_web WHERE project_id = ? AND owner_id = ?').bind(id,owner).first(),env.DB.prepare('SELECT * FROM secop_watch_alerts_web WHERE project_id = ? AND owner_id = ? ORDER BY created_at DESC,id DESC').bind(id,owner).all()]);
   const rows=alerts.results.map(row=>({id:row.id,title:row.title,kind:row.kind,previous:JSON.parse(row.previous_json||'null'),current:JSON.parse(row.current_json||'null'),createdAt:row.created_at,reviewed:!!row.reviewed}));return Response.json({baseline:baseline?JSON.parse(baseline.process_json):null,checkedAt:baseline?.checked_at||'',error:baseline?.error||'',alerts:rows,unreadCount:rows.filter(row=>!row.reviewed).length});
  }
 }
 return new Response('Method not allowed',{status:405});
}
