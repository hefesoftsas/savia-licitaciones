import suggestions from '../../client/electron/services/opportunitySuggestionsService.cjs';
import {digest} from './runners.js';
const bad=()=>Response.json({error:'invalid_settings'},{status:400}),conflict=()=>Response.json({error:'version_conflict'},{status:409});
export async function suggestionSources(env,owner,keywords,includeRup=false){
 const [company,facts,experience]=await Promise.all([
  env.DB.prepare('SELECT profile_json FROM company_profiles WHERE owner_id=?').bind(owner).first(),
  env.DB.prepare('SELECT f.label,f.value,f.page FROM rup_current c JOIN rup_reviewed_facts f ON f.certificate_id=c.certificate_id WHERE c.owner_id=? ORDER BY f.created_at,f.id').bind(owner).all(),
  env.DB.prepare('SELECT details_json FROM company_experience_projects WHERE owner_id=? AND deleting=0 ORDER BY updated_at DESC,created_at DESC,id LIMIT 12').bind(owner).all(),
 ]);
 const fullProfile=suggestions.profileData({profile:company?JSON.parse(company.profile_json):{},projects:experience.results.map(row=>JSON.parse(row.details_json))},facts.results);
 const cpvCodes=[...new Set(facts.results.filter(fact=>/\bCPV\b/i.test(fact.label)&&/^\d{8}$/.test(fact.value)).map(fact=>fact.value))].slice(0,50);
 const profile=includeRup?{...fullProfile,...(cpvCodes.length?{cpvCodes}:{})}:{...fullProfile,reviewedRup:[]};
 return {profile,terms:suggestions.getTerms(profile,keywords),hasRup:fullProfile.reviewedRup.length>0||cpvCodes.length>0,sourceFingerprint:await digest(JSON.stringify({profile,keywords,includeRup}))};
}
export async function opportunitySuggestionSettings(request,env,owner){
 if(request.method==='GET'){
  const row=await env.DB.prepare("SELECT s.refresh_hours,s.enabled,s.auto_enabled,s.runner_auto_enabled,s.runner_language,s.keywords,s.version,s.updated_at,s.credential_id,s.local_runner,s.include_rup,s.consented_at,CASE WHEN c.id IS NOT NULL AND c.revoked_at IS NULL AND c.provider IN ('opencode-go','openai-api','anthropic-api','google-api','google-vertex-api','groq-api','xai-api','deepseek-api','mistral-api','cerebras-api','together-api','nvidia-api','fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen') THEN 1 ELSE 0 END AS credential_available FROM opportunity_suggestion_settings s LEFT JOIN provider_credentials c ON c.id=s.credential_id AND c.owner_id=s.owner_id WHERE s.owner_id=?").bind(owner).first(),keywords=row?.keywords||'',sources=await suggestionSources(env,owner,keywords,!!row?.include_rup);
  return Response.json({refreshHours:row?.refresh_hours??6,enabled:!!row?.enabled,autoEnabled:!!row?.auto_enabled,runnerAutoEnabled:!!row?.runner_auto_enabled,runnerLanguage:row?.runner_language||'es',keywords,version:row?.version||0,updatedAt:row?.updated_at||null,terms:sources.terms,hasRup:sources.hasRup,credentialId:row?.credential_id||null,includeRup:!!row?.include_rup,consentedAt:row?.consented_at||null,localRunner:!!row?.local_runner,credentialAvailable:!!row?.credential_available,sourceFingerprint:sources.sourceFingerprint});
 }
 if(request.method!=='PUT')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return bad();}
 if(!input||!Number.isSafeInteger(input.version)||input.version<0||typeof input.enabled!=='boolean'||typeof input.keywords!=='string'||input.keywords.length>400||input.keywords.split(',').filter(term=>term.trim()).length>4)return bad();
 if(input.refreshHours!==undefined&&![6,12,24,48,168].includes(input.refreshHours))return bad();
 if(input.includeRup!==undefined&&typeof input.includeRup!=='boolean')return bad();
 if(input.autoEnabled!==undefined&&typeof input.autoEnabled!=='boolean')return bad();
 if(input.runnerAutoEnabled!==undefined&&typeof input.runnerAutoEnabled!=='boolean')return bad();
 if(input.language!==undefined&&!['es','en'].includes(input.language))return bad();
 if(input.runnerAutoEnabled===true&&(!input.autoEnabled||!input.enabled||input.dataProcessingConsent!==true))return bad();
 if(input.autoEnabled===true&&(!input.enabled||input.dataProcessingConsent!==true))return bad();
 if(input.localRunner!==undefined&&typeof input.localRunner!=='boolean')return bad();
 const localRunner=input.enabled&&input.localRunner===true;
 if(input.enabled&&(input.dataProcessingConsent!==true||(!localRunner&&(typeof input.credentialId!=='string'||!input.credentialId))))return bad();
 const credentialId=input.enabled&&!localRunner?input.credentialId:null,includeRup=input.includeRup===true;
 if(input.enabled&&!localRunner&&!await env.DB.prepare("SELECT id FROM provider_credentials WHERE id=? AND owner_id=? AND provider IN ('opencode-go','openai-api','anthropic-api','google-api','google-vertex-api','groq-api','xai-api','deepseek-api','mistral-api','cerebras-api','together-api','nvidia-api','fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen') AND revoked_at IS NULL").bind(credentialId,owner).first())return Response.json({error:'not_found'},{status:404});
 const keywords=input.keywords.replace(/\s+/g,' ').trim(),now=new Date().toISOString();
 const guard="(?=0 OR EXISTS (SELECT 1 FROM provider_credentials WHERE id=? AND owner_id=? AND provider IN ('opencode-go','openai-api','anthropic-api','google-api','google-vertex-api','groq-api','xai-api','deepseek-api','mistral-api','cerebras-api','together-api','nvidia-api','fireworks-api','huggingface-api','minimax-api','minimax-cn-api','moonshot-api','moonshot-cn-api','xiaomi-api','azure-openai-api','zai-api','ant-ling-api','opencode-zen') AND revoked_at IS NULL))",enabled=input.enabled?1:0;
 const refreshHours=input.refreshHours??6,runnerAuto=input.runnerAutoEnabled===true?1:0,language=input.language||'es';
 const row=input.version===0?await env.DB.prepare(`INSERT INTO opportunity_suggestion_settings(owner_id,enabled,keywords,version,updated_at,credential_id,include_rup,consented_at,auto_enabled,runner_auto_enabled,runner_language,local_runner,refresh_hours) SELECT ?,?,?,1,?,?,?,?,?,?,?,?,? WHERE (${guard} OR ?) ON CONFLICT(owner_id) DO NOTHING RETURNING version`).bind(owner,enabled,keywords,now,credentialId,includeRup?1:0,input.enabled?now:null,input.autoEnabled===true?1:0,runnerAuto,language,localRunner?1:0,refreshHours,enabled,credentialId,owner,localRunner?1:0).first():await env.DB.prepare(`UPDATE opportunity_suggestion_settings SET enabled=?,keywords=?,version=version+1,updated_at=?,credential_id=?,include_rup=?,consented_at=?,auto_enabled=?,runner_auto_enabled=?,runner_language=?,local_runner=?,refresh_hours=? WHERE owner_id=? AND version=? AND (${guard} OR ?) RETURNING version`).bind(enabled,keywords,now,credentialId,includeRup?1:0,input.enabled?now:null,input.autoEnabled===true?1:0,runnerAuto,language,localRunner?1:0,refreshHours,owner,input.version,enabled,credentialId,owner,localRunner?1:0).first();
 return row?Response.json({enabled:input.enabled,keywords,version:row.version,updatedAt:now}):conflict();
}
