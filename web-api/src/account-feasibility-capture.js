import {digest} from './runners.js';
import {validFeasibilityState} from './feasibility-report.js';
class SnapshotError extends Error {}
const fail=()=>{throw new SnapshotError('Los datos de viabilidad cambiaron o no están disponibles.');};
const definitions={
 original:{table:'feasibility_web_sources',id:'source_key'},historical:{table:'desktop_feasibility_sources',id:'source_key'},
 asset:{table:'feasibility_assets',id:'id'},text:{table:'feasibility_extracted_texts',id:'id'},image:{table:'feasibility_extracted_images',id:'id'},
};
const clean=row=>{const {object_key,mutation_id,...rest}=row;return rest;};
const version=(row,etag)=>digest(JSON.stringify([row,etag]));
async function rowsFor(env,owner){
 const [reports,original,historical,assets,texts,images,jobs]=await env.DB.batch([
  env.DB.prepare('SELECT state_json,version,updated_at FROM feasibility_reports WHERE owner_id=?').bind(owner),
  env.DB.prepare('SELECT * FROM feasibility_web_sources WHERE owner_id=? ORDER BY source_key').bind(owner),
  env.DB.prepare('SELECT * FROM desktop_feasibility_sources WHERE owner_id=? ORDER BY source_key').bind(owner),
  env.DB.prepare('SELECT * FROM feasibility_assets WHERE owner_id=? ORDER BY id').bind(owner),
  env.DB.prepare("SELECT t.* FROM feasibility_extracted_texts t JOIN account_jobs j ON j.id=t.job_id AND j.owner_id=t.owner_id AND j.kind='feasibility.extract-sources' AND j.state='succeeded' WHERE t.owner_id=? ORDER BY t.id").bind(owner),
  env.DB.prepare("SELECT i.* FROM feasibility_extracted_images i JOIN account_jobs j ON j.id=i.job_id AND j.owner_id=i.owner_id AND j.kind='feasibility.extract-sources' AND j.state='succeeded' WHERE i.owner_id=? ORDER BY i.id").bind(owner),
  env.DB.prepare("SELECT id,kind,state,created_at,updated_at FROM account_jobs WHERE owner_id=? AND kind='feasibility.extract-sources' AND state='succeeded' ORDER BY id").bind(owner),
 ]);
 if(original.results.some(x=>x.deleting)||historical.results.some(x=>x.deleting))fail();
 const total=original.results.length+historical.results.length+assets.results.length+texts.results.length+images.results.length;if(total>10000)fail();
 return {report:reports.results[0]||null,original:original.results,historical:historical.results,asset:assets.results,text:texts.results,image:images.results,jobs:jobs.results};
}
async function entry(env,kind,row){
 if(!row.object_key)return null;if((kind==='original'||kind==='historical')&&row.deleted)return null;
 const object=await env.FILES.head(row.object_key);if(!object||!Number.isSafeInteger(object.size)||object.size<1||object.size>25*1024*1024||(row.size!==undefined&&object.size!==row.size)|| (row.content_hash!==null&&row.content_hash!==undefined&&!/^[a-f0-9]{64}$/.test(row.content_hash)))fail();
 return {kind,id:row[definitions[kind].id],size:object.size,etag:object.etag,version:await version(row,object.etag),...(row.content_hash?{sha256:row.content_hash}:{})};
}
async function lookup(env,owner,kind,id){
 const def=definitions[kind];if(!def)return null;
 const extra=kind==='text'||kind==='image'?" AND EXISTS (SELECT 1 FROM account_jobs j WHERE j.id=t.job_id AND j.owner_id=t.owner_id AND j.kind='feasibility.extract-sources' AND j.state='succeeded')":'';
 const row=await env.DB.prepare(`SELECT t.* FROM ${def.table} t WHERE t.owner_id=? AND t.${def.id}=?${extra}`).bind(owner,id).first();if(!row)return null;if(row.deleting)fail();if(row.deleted||!row.object_key)return null;return row;
}
export async function runnerFeasibilityCapture(request,env,runner,kind,id){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 try{
  if(kind){const row=await lookup(env,runner.ownerId,kind,id);if(!row)return Response.json({error:'not_found'},{status:404});const params=new URL(request.url).searchParams,etag=params.get('etag'),expected=params.get('version');if(!etag||!/^[a-f0-9]{64}$/.test(expected||'')||await version(row,etag)!==expected)fail();const object=await env.FILES.get(row.object_key,{onlyIf:{etagMatches:etag}});if(!object?.body||object.etag!==etag||(row.size!==undefined&&object.size!==row.size))fail();return new Response(object.body,{headers:{'content-type':'application/octet-stream','x-content-type-options':'nosniff'}});}
  const rows=await rowsFor(env,runner.ownerId);let report=null;if(rows.report){let state;try{state=JSON.parse(rows.report.state_json);}catch{fail();}if(!validFeasibilityState(state))fail();report={state,version:rows.report.version,updatedAt:rows.report.updated_at};}
  const objects=[],tracked=[];for(const kind of Object.keys(definitions))for(const row of rows[kind]){if(kind==='original'&&!row.deleted&&!row.object_key)fail();const item=await entry(env,kind,row);if(item){objects.push(item);tracked.push({row,item});}}
  if(JSON.stringify(await rowsFor(env,runner.ownerId))!==JSON.stringify(rows))fail();for(const {row,item} of tracked){const head=await env.FILES.head(row.object_key);if(!head||head.size!==item.size||head.etag!==item.etag)fail();}
  return Response.json({revision:await digest(JSON.stringify({rows,objects})),report,sources:{original:rows.original.map(clean),historical:rows.historical.map(clean)},assets:rows.asset.map(clean),extractions:{jobs:rows.jobs,texts:rows.text.map(clean),images:rows.image.map(clean)},objects});
 }catch(error){if(error instanceof SnapshotError)return Response.json({error:'source_unavailable'},{status:409});throw error;}
}
