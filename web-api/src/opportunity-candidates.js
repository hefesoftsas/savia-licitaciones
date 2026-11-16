import {opportunitySourceState} from './opportunity-source-state.js';
import secop from '../../client/electron/services/secopService.cjs';
const clean = (value, max = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const normalize = value => clean(value, 100).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function isOpenOpportunity(item, now = Date.now()) {
  if (!/^(publicad[oa]|convocad[oa])$/.test(normalize(item.status))) return false;
  if (/evaluacion|adjudic|cerrad|terminad|cancelad|desiert|liquidad/.test(normalize(item.phase))) return false;
  const rawDeadline = item.source === 'secop-ii' && item.deadlineVerified === true ? String(item.deadline || '') : '';
  const deadline = rawDeadline.slice(0, 10);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? new Date(`${deadline}T00:00:00Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== deadline) return true;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(part => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (deadline !== today) return deadline > today;
  const time = rawDeadline.match(/T(\d{2}:\d{2}:\d{2})/)?.[1];
  return !time || time === '00:00:00' || time > `${parts.hour}:${parts.minute}:${parts.second}`;
}

// Reviewed entries remain in the archive; only pending recommendations need live checks.
export async function refreshOpportunityStatuses(items, getDetail) {
  const output = [], pending = items.filter(item => !item.reviewed);
  let verificationUnavailable = false;
  for (let i = 0; i < pending.length; i += 4) {
    const results = await Promise.all(pending.slice(i, i + 4).map(async item => {
      try {
        const result = await getDetail(item.process);
        if (!result?.success || result.data?.id !== item.process.id || result.data?.source !== item.process.source || !result.data?.status) return null;
        const process = {...item.process, ...result.data};
        return isOpenOpportunity(process) ? {...item, process} : false;
      } catch { return null; }
    }));
    for (const result of results) if (result === null) verificationUnavailable = true; else if (result) output.push(result);
  }
  return {items: [...output, ...items.filter(item => item.reviewed)], verificationUnavailable};
}

// Returns the original processes separately from the limited summaries sent to Pi.
export async function searchOpportunityCandidates({ profile, terms, searchProcesses, now = Date.now(), language = 'es' }) {
  const facts = profile.reviewedRup || [];
  const classes = [...new Set(facts.map(fact => fact.value.slice(0, 6)))].slice(0, 4);
  const queries = [...terms.map(keyword => ({ keyword })), ...classes.map(classificationClass => ({ classificationClass }))];
  if (!queries.length) throw new Error(language === 'en' ? 'No search sources are available.' : 'No hay fuentes de búsqueda disponibles.');
  const since = new Date(now - 45 * 86400000).toISOString().slice(0, 10);
  const candidates = new Map();
  for (const dataset of ['secop-ii', 'secop-i']) for (const query of queries) {
    const response = await searchProcesses({dataset, ...query, fromDate:since, limit:50, fresh:true});
    if (!response?.success || !Array.isArray(response.data?.items) || response.data.partial) throw new Error(language === 'en' ? 'The SECOP search did not finish.' : 'No se completó la consulta SECOP.');
    for (const item of response.data.items) {
      if (!item.id || !item.source) continue;
      if (!isOpenOpportunity(item, now)) continue;
      candidates.set(`${item.source}:${item.id}`, item);
    }
  }
  const classSet = new Set(classes);
  const ranked = [...candidates.entries()].sort((a,b) => Number(classSet.has(String(b[1].classificationCode || '').replace(/^V1\./i,'').slice(0,6))) - Number(classSet.has(String(a[1].classificationCode || '').replace(/^V1\./i,'').slice(0,6)))).slice(0,60);
  const shortlist = ranked.map(([id,item]) => ({id, title:clean(item.title,500), entity:clean(item.entity,160), classificationCode:clean(item.classificationCode,20), department:clean(item.department,100), status:clean(item.status,100), value:item.value ?? null, currency:item.currencyVerified === true ? item.currency || null : null, deadline:item.source === 'secop-ii' && item.deadlineVerified === true ? item.deadline : undefined}));
  return {candidates:ranked.map(([id,process]) => ({id,process})), shortlist};
}

// The caller is authenticated by the router; source data always comes from its account.
export async function opportunitySearch(request, env, owner, searchProcesses) {
  if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
  if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({error:'invalid_origin'},{status:403});
  let input; try { input = await request.json(); } catch { return Response.json({error:'invalid_search'},{status:400}); }
  if (!input || !['es','en'].includes(input.language)) return Response.json({error:'invalid_search'},{status:400});
  const settings = async () => env.DB.prepare("SELECT s.version,s.keywords,s.include_rup,s.credential_id FROM opportunity_suggestion_settings s LEFT JOIN provider_credentials c ON c.id=s.credential_id AND c.owner_id=s.owner_id WHERE s.owner_id=? AND s.enabled=1 AND s.consented_at IS NOT NULL AND (s.local_runner=1 OR (c.provider IN ('opencode-go','openai-api','anthropic-api','google-api','google-vertex-api','groq-api','xai-api','deepseek-api','mistral-api','cerebras-api','together-api','nvidia-api','fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen') AND c.revoked_at IS NULL))").bind(owner).first();
  const before = await settings();
  if (!before) return Response.json({error:'settings_unavailable'},{status:409});
  const {suggestionSources} = await import('./opportunity-suggestion-settings.js');
  const sources = await suggestionSources(env,owner,before.keywords,!!before.include_rup);
  if (!sources.terms.length && !sources.profile.reviewedRup.length) return Response.json({error:'sources_unavailable'},{status:409});
  if (!searchProcesses) searchProcesses = secop.createSecopService({configStore:{load:()=>({ui_language:input.language})}}).searchProcesses;
  let result;
  try { result = await searchOpportunityCandidates({profile:sources.profile,terms:sources.terms,searchProcesses,language:input.language}); }
  catch { return Response.json({error:'secop_unavailable'},{status:502}); }
  const after = await settings();
  if (!after || before.version !== after.version || before.credential_id !== after.credential_id) return Response.json({error:'sources_changed'},{status:409});
  const current = await suggestionSources(env,owner,after.keywords,!!after.include_rup);
  if (sources.sourceFingerprint !== current.sourceFingerprint) return Response.json({error:'sources_changed'},{status:409});
  const state=await env.DB.prepare(`SELECT ${opportunitySourceState("s.owner_id","s.include_rup")} AS value FROM opportunity_suggestion_settings s WHERE s.owner_id=? AND s.version=?`).bind(owner,before.version).first();
  if (!state) return Response.json({error:'sources_changed'},{status:409});
  const snapshotId=crypto.randomUUID(), now=Date.now();
  const inserted=await env.DB.prepare("INSERT INTO opportunity_search_snapshots(id,owner_id,settings_version,credential_id,source_fingerprint,profile_json,shortlist_json,candidates_json,created_at,expires_at,source_state) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM opportunity_suggestion_settings s LEFT JOIN provider_credentials c ON c.id=s.credential_id AND c.owner_id=s.owner_id WHERE s.owner_id=? AND s.version=? AND s.credential_id IS ? AND s.enabled=1 AND s.consented_at IS NOT NULL AND (s.local_runner=1 OR (c.provider IN ('opencode-go','openai-api','anthropic-api','google-api','google-vertex-api','groq-api','xai-api','deepseek-api','mistral-api','cerebras-api','together-api','nvidia-api','fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen') AND c.revoked_at IS NULL))) RETURNING id").bind(snapshotId,owner,before.version,before.credential_id,sources.sourceFingerprint,JSON.stringify(sources.profile),JSON.stringify(result.shortlist),JSON.stringify(result.candidates),new Date(now).toISOString(),now+86400000,state.value,owner,before.version,before.credential_id).first();
  if (!inserted) return Response.json({error:'sources_changed'},{status:409});
  return Response.json({...result,snapshotId,settingsVersion:before.version,sourceFingerprint:sources.sourceFingerprint});
}

export async function opportunityJobs(request,env,owner,jobId,action,options={}) {
  const {accountView,expireAccountJobs}=await import('./account-jobs.js');
  const missing=()=>Response.json({error:'not_found'},{status:404}), conflict=()=>Response.json({error:'sources_changed_or_active'},{status:409});
  if(request.method!=='GET'&&request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
  await expireAccountJobs(env,owner);
  if(request.method==='GET'&&!jobId){const rows=await env.DB.prepare("SELECT * FROM account_jobs WHERE owner_id=? AND kind='opportunity.analyze' ORDER BY created_at DESC,id").bind(owner).all();return Response.json({jobs:rows.results.map(accountView)});}
  if(request.method==='POST'&&jobId&&action==='cancel'){const row=await env.DB.prepare("UPDATE account_jobs SET state='cancelled',updated_at=? WHERE id=? AND owner_id=? AND kind='opportunity.analyze' AND state IN ('queued','running') RETURNING id").bind(new Date().toISOString(),jobId,owner).first();return row?Response.json({ok:true}):missing();}
  if(request.method!=='POST'||jobId)return new Response('Method not allowed',{status:405});
  let input;try{input=await request.json();}catch{return Response.json({error:'invalid_job'},{status:400});}
  const key=request.headers.get('idempotency-key')||'';
  if(!/^[A-Za-z0-9._:-]{1,128}$/.test(key)||typeof input?.snapshotId!=='string'||!['es','en'].includes(input.language)||input.dataProcessingConsent!==true)return Response.json({error:'invalid_job'},{status:400});
  const payload=JSON.stringify({snapshotId:input.snapshotId,language:input.language,dataProcessingConsent:true});
  const prior=await env.DB.prepare('SELECT * FROM account_jobs WHERE owner_id=? AND client_request_id=?').bind(owner,key).first();
  if(prior)return prior.kind==='opportunity.analyze'&&prior.payload_json===payload?Response.json({job:accountView(prior)}):conflict();
  const snapshot=await env.DB.prepare('SELECT * FROM opportunity_search_snapshots WHERE id=? AND owner_id=?').bind(input.snapshotId,owner).first();if(!snapshot)return missing();
  const settings=await env.DB.prepare("SELECT s.keywords,s.include_rup FROM opportunity_suggestion_settings s LEFT JOIN provider_credentials c ON c.id=s.credential_id AND c.owner_id=s.owner_id WHERE s.owner_id=? AND s.version=? AND s.credential_id IS ? AND s.enabled=1 AND s.consented_at IS NOT NULL AND (s.local_runner=1 OR (c.provider IN ('opencode-go','openai-api','anthropic-api','google-api','google-vertex-api','groq-api','xai-api','deepseek-api','mistral-api','cerebras-api','together-api','nvidia-api','fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen') AND c.revoked_at IS NULL))").bind(owner,snapshot.settings_version,snapshot.credential_id).first();
  if(!settings||snapshot.expires_at<=Date.now())return conflict();
  const {suggestionSources}=await import('./opportunity-suggestion-settings.js');
  const current=await suggestionSources(env,owner,settings.keywords,!!settings.include_rup);if(current.sourceFingerprint!==snapshot.source_fingerprint)return conflict();
  const now=new Date().toISOString();let inserted;
  try{inserted=await env.DB.prepare("INSERT INTO account_jobs(id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at,credential_id) SELECT ?,?,'opportunity.analyze',?,?,'queued',?,?,? WHERE EXISTS (SELECT 1 FROM opportunity_search_snapshots p JOIN opportunity_suggestion_settings s ON s.owner_id=p.owner_id AND s.version=p.settings_version AND s.credential_id IS p.credential_id LEFT JOIN provider_credentials c ON c.id=s.credential_id AND c.owner_id=s.owner_id WHERE p.id=? AND p.owner_id=? AND p.expires_at>? AND s.enabled=1 AND s.consented_at IS NOT NULL AND (s.local_runner=1 OR (c.provider IN ('opencode-go','openai-api','anthropic-api','google-api','google-vertex-api','groq-api','xai-api','deepseek-api','mistral-api','cerebras-api','together-api','nvidia-api','fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen') AND c.revoked_at IS NULL))) AND (? IS NULL OR EXISTS (SELECT 1 FROM opportunity_schedule_web l JOIN opportunity_suggestion_settings s ON s.owner_id=l.owner_id WHERE l.owner_id=? AND l.lease_token=? AND l.lease_until>? AND s.enabled=1 AND s.auto_enabled=1 AND (?=0 OR s.runner_auto_enabled=1))) ON CONFLICT DO NOTHING RETURNING *").bind(crypto.randomUUID(),owner,key,payload,now,now,snapshot.credential_id,snapshot.id,owner,Date.now(),options.scheduleToken||null,owner,options.scheduleToken||null,Date.now(),options.runnerSchedule?1:0).first();}catch(error){throw error;}
  if(inserted)return Response.json({job:accountView(inserted)},{status:201});
  const winner=await env.DB.prepare('SELECT * FROM account_jobs WHERE owner_id=? AND client_request_id=?').bind(owner,key).first();return winner?.kind==='opportunity.analyze'&&winner.payload_json===payload?Response.json({job:accountView(winner)}):conflict();
}

export async function runnerOpportunityContext(request,env,runner,jobId){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_request'},{status:400});}
 if(typeof input?.lease!=='string'||!/^[a-f0-9]{64}$/.test(input.lease))return Response.json({error:'invalid_request'},{status:400});
 const {digest}=await import('./runners.js'),hash=await digest(input.lease);
 const active=()=>env.DB.prepare("SELECT p.profile_json,p.shortlist_json,p.source_fingerprint,s.keywords,s.include_rup FROM account_jobs j JOIN opportunity_search_snapshots p ON p.id=json_extract(j.payload_json,'$.snapshotId') AND p.owner_id=j.owner_id AND p.credential_id IS j.credential_id JOIN opportunity_suggestion_settings s ON s.owner_id=p.owner_id AND s.version=p.settings_version AND s.credential_id IS p.credential_id LEFT JOIN provider_credentials c ON c.id=s.credential_id AND c.owner_id=s.owner_id WHERE j.id=? AND j.owner_id=? AND j.runner_id=? AND j.lease_hash=? AND j.state='running' AND j.lease_expires_at>? AND j.kind='opportunity.analyze' AND s.enabled=1 AND s.consented_at IS NOT NULL AND (s.local_runner=1 OR (c.provider IN ('opencode-go','openai-api','anthropic-api','google-api','google-vertex-api','groq-api','xai-api','deepseek-api','mistral-api','cerebras-api','together-api','nvidia-api','fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen') AND c.revoked_at IS NULL))").bind(jobId,runner.ownerId,runner.id,hash,Date.now()).first();
 const row=await active();if(!row)return Response.json({error:'sources_changed'},{status:409});
 const {suggestionSources}=await import('./opportunity-suggestion-settings.js');const current=await suggestionSources(env,runner.ownerId,row.keywords,!!row.include_rup);
 if(current.sourceFingerprint!==row.source_fingerprint||!await active())return Response.json({error:'sources_changed'},{status:409});
 return new URL(request.url).searchParams.get('check')==='1'?Response.json({ok:true}):Response.json({profile:JSON.parse(row.profile_json),shortlist:JSON.parse(row.shortlist_json)});
}

export async function opportunityResults(request,env,owner,action){
 const missing=()=>Response.json({error:'not_found'},{status:404});
 if(request.method!=='GET'&&request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 const findJob=async id=>env.DB.prepare(`SELECT j.id,j.result_json,p.candidates_json,p.source_fingerprint,p.settings_version FROM account_jobs j JOIN opportunity_search_snapshots p ON p.id=json_extract(j.payload_json,'$.snapshotId') AND p.owner_id=j.owner_id WHERE j.owner_id=? AND j.kind='opportunity.analyze' AND j.state='succeeded' ${id?'AND j.id=?':'ORDER BY j.updated_at DESC,j.id DESC LIMIT 1'}`).bind(...(id?[owner,id]:[owner])).first();
 const itemsOf=row=>{const candidates=new Map(JSON.parse(row.candidates_json).map(item=>[item.id,item.process]));return JSON.parse(row.result_json).recommendations.map(item=>({...item,process:candidates.get(item.id)})).filter(item=>item.process&&item.id===`${item.process.source}:${item.process.id}`);};
 if(request.method==='GET'&&!action&&new URL(request.url).searchParams.get('archive')==='1'){
  const [reviews,jobs,saved]=await Promise.all([
   env.DB.prepare('SELECT source,process_id,reviewed_at FROM opportunity_suggestion_reviews_web WHERE owner_id=? ORDER BY reviewed_at DESC').bind(owner).all(),
   env.DB.prepare("SELECT j.id,j.result_json,p.candidates_json FROM account_jobs j JOIN opportunity_search_snapshots p ON p.id=json_extract(j.payload_json,'$.snapshotId') AND p.owner_id=j.owner_id WHERE j.owner_id=? AND j.kind='opportunity.analyze' AND j.state='succeeded' ORDER BY j.updated_at DESC,j.id DESC").bind(owner).all(),
   env.DB.prepare('SELECT source,external_id,project_id FROM project_secop WHERE owner_id=?').bind(owner).all(),
  ]);
  const reviewed=new Map(reviews.results.map(item=>[JSON.stringify([item.source,item.process_id]),item.reviewed_at]));
  const projects=new Map(saved.results.map(item=>[JSON.stringify([item.source,item.external_id]),item.project_id]));
  const archived=new Map();
  for(const job of jobs.results)for(const item of itemsOf(job)){const key=JSON.stringify([item.process.source,item.process.id]);if(reviewed.has(key)&&!archived.has(key)){const projectId=projects.get(key)||null;archived.set(key,{...item,jobId:job.id,reviewed:true,reviewedAt:reviewed.get(key),saved:!!projectId,projectId});}}
  return Response.json({items:[...archived.values()].sort((a,b)=>b.reviewedAt.localeCompare(a.reviewedAt))});
 }
 if(request.method==='GET'&&!action){
  const row=await findJob();if(!row)return Response.json({jobId:null,items:[],unreadCount:0,stale:false});
  const [reviews,saved,settings]=await Promise.all([env.DB.prepare('SELECT source,process_id FROM opportunity_suggestion_reviews_web WHERE owner_id=?').bind(owner).all(),env.DB.prepare('SELECT source,external_id,project_id FROM project_secop WHERE owner_id=?').bind(owner).all(),env.DB.prepare('SELECT keywords,include_rup,version FROM opportunity_suggestion_settings WHERE owner_id=?').bind(owner).first()]);
  const reviewed=new Set(reviews.results.map(item=>JSON.stringify([item.source,item.process_id]))),projects=new Map(saved.results.map(item=>[JSON.stringify([item.source,item.external_id]),item.project_id]));
  let items=itemsOf(row).filter(item=>isOpenOpportunity(item.process)).map(item=>{const key=JSON.stringify([item.process.source,item.process.id]),projectId=projects.get(key)||null;return {...item,reviewed:reviewed.has(key),saved:!!projectId,projectId};});
  let verificationUnavailable=false;
  if(new URL(request.url).searchParams.get('verify')==='1'){
   const {secopDetail}=await import('./secop.js');
   const checked=await refreshOpportunityStatuses(items,async process=>{
    const url=new URL('/api/secop/detail',request.url);url.searchParams.set('id',process.id);url.searchParams.set('source',process.source);
    const response=await secopDetail(new Request(url),env);return response.ok?response.json():null;
   });
   items=checked.items;verificationUnavailable=checked.verificationUnavailable;
  }
  const {suggestionSources}=await import('./opportunity-suggestion-settings.js');const current=settings?await suggestionSources(env,owner,settings.keywords,!!settings.include_rup):null;
  return Response.json({jobId:row.id,items,unreadCount:items.filter(item=>!item.reviewed).length,verificationUnavailable,stale:!settings||settings.version!==row.settings_version||current.sourceFingerprint!==row.source_fingerprint});
 }
 if(request.method!=='POST'||!['review','save'].includes(action))return new Response('Method not allowed',{status:405});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_request'},{status:400});}
 if(typeof input?.jobId!=='string'||typeof input?.candidateId!=='string')return Response.json({error:'invalid_request'},{status:400});
 const row=await findJob(input.jobId);if(!row)return missing();const item=itemsOf(row).find(item=>item.id===input.candidateId);if(!item)return missing();
 const {process}=item,now=new Date().toISOString();
 if(action==='review'){await env.DB.prepare('INSERT INTO opportunity_suggestion_reviews_web(owner_id,source,process_id,reviewed_at) VALUES(?,?,?,?) ON CONFLICT(owner_id,source,process_id) DO NOTHING').bind(owner,process.source,process.id,now).run();return Response.json({reviewed:true});}
 if(!['secop-i','secop-ii'].includes(process.source)||typeof process.id!=='string'||!process.id||typeof process.title!=='string'||!process.title.trim())return Response.json({error:'invalid_process'},{status:400});
 const projectId=crypto.randomUUID();
 await env.DB.batch([
  env.DB.prepare('INSERT INTO projects(id,owner_id,title,created_at) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM project_secop WHERE owner_id=? AND source=? AND external_id=?)').bind(projectId,owner,process.title.trim().slice(0,300),now,owner,process.source,process.id),
  env.DB.prepare('INSERT INTO project_secop(project_id,owner_id,source,external_id,process_json) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND owner_id=?) ON CONFLICT(owner_id,source,external_id) DO NOTHING').bind(projectId,owner,process.source,process.id,JSON.stringify(process),projectId,owner),
  env.DB.prepare('INSERT INTO opportunity_suggestion_reviews_web(owner_id,source,process_id,reviewed_at) VALUES(?,?,?,?) ON CONFLICT(owner_id,source,process_id) DO NOTHING').bind(owner,process.source,process.id,now),
 ]);
 const project=await env.DB.prepare('SELECT project_id FROM project_secop WHERE owner_id=? AND source=? AND external_id=?').bind(owner,process.source,process.id).first();return project?Response.json({projectId:project.project_id,reviewed:true}):Response.json({error:'save_failed'},{status:409});
}

// The database lease coordinates browsers and authorized local runners.
export async function opportunityDue(request,env,owner,searchProcesses,options={}){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_request'},{status:400});}
 if(!['es','en'].includes(input?.language))return Response.json({error:'invalid_request'},{status:400});
 const {expireAccountJobs}=await import('./account-jobs.js');await expireAccountJobs(env,owner);
 const now=Date.now(),token=crypto.randomUUID(),runnerGuard=options.runnerSchedule?" AND s.runner_auto_enabled=1":"",eligible=`EXISTS (SELECT 1 FROM opportunity_suggestion_settings s LEFT JOIN provider_credentials c ON c.id=s.credential_id AND c.owner_id=s.owner_id WHERE s.owner_id=? AND s.enabled=1 AND s.auto_enabled=1 AND s.consented_at IS NOT NULL AND (s.local_runner=1 OR (c.provider IN ('opencode-go','openai-api','anthropic-api','google-api','google-vertex-api','groq-api','xai-api','deepseek-api','mistral-api','cerebras-api','together-api','nvidia-api','fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen') AND c.revoked_at IS NULL))${runnerGuard}) AND NOT EXISTS (SELECT 1 FROM account_jobs WHERE owner_id=? AND kind='opportunity.analyze' AND state IN ('queued','running'))`;
 const lock=await env.DB.prepare(`INSERT INTO opportunity_schedule_web(owner_id,last_attempt,lease_token,lease_until) SELECT ?,?,?,? WHERE ${eligible} ON CONFLICT(owner_id) DO UPDATE SET last_attempt=excluded.last_attempt,lease_token=excluded.lease_token,lease_until=excluded.lease_until WHERE opportunity_schedule_web.lease_until<=? AND opportunity_schedule_web.last_attempt<=? AND ${eligible} RETURNING owner_id`).bind(owner,now,token,now+900000,owner,owner,now,now-900000,owner,owner).first();
 if(!lock)return Response.json({started:false});
 let resetAttempt=false;
 try{
  const settings=await env.DB.prepare(`SELECT keywords,include_rup,version,runner_language,refresh_hours FROM opportunity_suggestion_settings s WHERE owner_id=? AND enabled=1 AND auto_enabled=1${runnerGuard}`).bind(owner).first();if(!settings)return Response.json({started:false});
  const language=options.runnerSchedule?settings.runner_language:input.language;if(!['es','en'].includes(language))return Response.json({error:'invalid_settings'},{status:409});
  const {suggestionSources}=await import('./opportunity-suggestion-settings.js');const current=await suggestionSources(env,owner,settings.keywords,!!settings.include_rup);
  if(!current.terms.length&&!current.profile.reviewedRup.length){resetAttempt=true;return Response.json({started:false});}
  const recent=await env.DB.prepare("SELECT j.state,j.updated_at,p.source_fingerprint,p.settings_version FROM account_jobs j LEFT JOIN opportunity_search_snapshots p ON p.id=json_extract(j.payload_json,'$.snapshotId') AND p.owner_id=j.owner_id WHERE j.owner_id=? AND j.kind='opportunity.analyze' ORDER BY j.created_at DESC,j.id DESC LIMIT 1").bind(owner).first();
  const age=now-(Date.parse(recent?.updated_at)||0);
  if(recent?.state==='succeeded'&&age<settings.refresh_hours*3600000&&recent.settings_version===settings.version&&recent.source_fingerprint===current.sourceFingerprint){resetAttempt=true;return Response.json({started:false});}
  if(recent&&['failed','cancelled','interrupted'].includes(recent.state)&&age<900000)return Response.json({started:false});
  const origin=new URL(env.BETTER_AUTH_URL).origin,internal=(path,body,headers={})=>new Request(`${origin}${path}`,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
  const search=await opportunitySearch(internal('/api/opportunity-suggestions/search',{language}),env,owner,searchProcesses);if(!search.ok)return Response.json({error:'search_failed'},{status:search.status});
  const {snapshotId}=await search.json();
  const response=await opportunityJobs(internal('/api/opportunity-suggestions/jobs',{snapshotId,language,dataProcessingConsent:true},{'idempotency-key':`auto:${token}`}),env,owner,undefined,undefined,{scheduleToken:token,runnerSchedule:!!options.runnerSchedule});
  if(!response.ok)return response.status===409?Response.json({started:false}):Response.json({error:'queue_failed'},{status:response.status});
  const {job}=await response.json();return Response.json({started:true,jobId:job.id});
 }finally{await env.DB.prepare('UPDATE opportunity_schedule_web SET lease_token=NULL,lease_until=0,last_attempt=CASE WHEN ?=1 THEN 0 ELSE last_attempt END WHERE owner_id=? AND lease_token=?').bind(resetAttempt?1:0,owner,token).run();}
}

export async function runnerOpportunityDue(request,env,runner,searchProcesses){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 const row=await env.DB.prepare("SELECT runner_language FROM opportunity_suggestion_settings WHERE owner_id=? AND enabled=1 AND auto_enabled=1 AND runner_auto_enabled=1 AND consented_at IS NOT NULL").bind(runner.ownerId).first();
 if(!row)return Response.json({started:false});
 if(!['es','en'].includes(row.runner_language))return Response.json({error:'invalid_settings'},{status:409});
 const origin=new URL(env.BETTER_AUTH_URL).origin,internal=new Request(`${origin}/api/opportunity-suggestions/due`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({language:row.runner_language})});
 return opportunityDue(internal,env,runner.ownerId,searchProcesses,{runnerSchedule:true});
}
