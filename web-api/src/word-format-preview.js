import {accountView,expireAccountJobs} from './account-jobs.js';
import exportDefaults from '../../client/electron/services/exportFormatDefaults.cjs';
import {previewWakeStub} from './preview-wake.js';
const kind='word-format.preview';
export async function wordFormatPreview(request,env,owner,id,action){
 if(request.method!=='GET'&&request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 await expireAccountJobs(env,owner);
 if(request.method==='POST'&&!id){
  let input;try{input=await request.json();}catch{return Response.json({error:'invalid_request'},{status:400});}
  if(!input?.format||typeof input.format!=='object'||Array.isArray(input.format)||JSON.stringify(input.format).length>100000||!['es','en'].includes(input.language))return Response.json({error:'invalid_request'},{status:400});
  let format;try{format=exportDefaults.normalizeExportFormat(input.format);}catch{return Response.json({error:'invalid_request'},{status:400});}
  const now=new Date().toISOString(), cutoff=new Date(Date.now()-86400000).toISOString();
  await env.DB.prepare("DELETE FROM account_jobs WHERE owner_id=? AND kind=? AND updated_at<? AND state!='running'").bind(owner,kind,cutoff).run();
  const job=await env.DB.prepare("INSERT INTO account_jobs(id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at) VALUES(?,?,?,?,?,'queued',?,?) RETURNING *").bind(crypto.randomUUID(),owner,kind,crypto.randomUUID(),JSON.stringify({format,language:input.language}),now,now).first();
  try{await previewWakeStub(env,owner)?.fetch('https://preview-wake/notify',{method:'POST'});}catch{/* Polling remains available if notifications are temporarily unavailable. */}
  return Response.json({job:accountView(job)},{status:201});
 }
 if(id&&request.method==='GET'&&!action){const job=await env.DB.prepare('SELECT * FROM account_jobs WHERE id=? AND owner_id=? AND kind=?').bind(id,owner,kind).first();return job?Response.json({job:accountView(job)}):Response.json({error:'not_found'},{status:404});}
 if(id&&request.method==='POST'&&action==='cancel'){await env.DB.prepare("UPDATE account_jobs SET state='cancelled',updated_at=? WHERE id=? AND owner_id=? AND kind=? AND state IN ('queued','running')").bind(new Date().toISOString(),id,owner,kind).run();return Response.json({ok:true});}
 if(id&&request.method==='DELETE'&&!action){await env.DB.prepare("DELETE FROM account_jobs WHERE id=? AND owner_id=? AND kind=? AND state NOT IN ('queued','running')").bind(id,owner,kind).run();return new Response(null,{status:204});}
 return new Response('Method not allowed',{status:405});
}
