import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import * as search from '../src/opportunity-candidates.js';
import {handleAgentJobs} from '../src/jobs.js';
import {digest} from '../src/runners.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('consulta las fuentes de la cuenta con consentimiento vigente y detecta cambios durante la búsqueda',async()=>{
 assert.equal(typeof search.opportunitySearch,'function');
 const dir=await mkdtemp(join(tmpdir(),'savia-opportunity-search-'));let worker;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'search'},r2Buckets:['FILES'],bindings:{BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const env={DB:db,BETTER_AUTH_URL:'http://localhost'};const req=()=>new Request('http://localhost/api/opportunity-suggestions/search',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({language:'es'})});
  let count=0;const lookup=async({dataset})=>{count++;return {success:true,data:{items:[{id:'123',source:dataset,title:'Proceso',status:'Convocado'}]}}};
  assert.equal((await search.opportunitySearch(req(),env,'alice',lookup)).status,409);assert.equal(count,0);
  await db.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt,savia_market) VALUES (\'alice\',\'Alice\',\'alice@example.com\',1,0,0,\'CO\')').run();
  await db.prepare("INSERT INTO provider_credentials(id,owner_id,provider,model,key_id,iv,ciphertext,created_at) VALUES('key','alice','opencode-go','model','k','iv','encrypted','2026')").run();
  await db.prepare("INSERT INTO opportunity_suggestion_settings(owner_id,enabled,keywords,version,updated_at,credential_id,include_rup,consented_at) VALUES('alice',1,'software',1,'2026','key',0,'2026')").run();
  const good=await search.opportunitySearch(req(),env,'alice',lookup);assert.equal(good.status,200);const result=await good.json();assert.equal(result.shortlist.length,2);assert.equal(result.settingsVersion,1);assert.match(result.sourceFingerprint,/^[a-f0-9]{64}$/);assert.match(result.snapshotId,/^[0-9a-f-]{36}$/);const snapshot=await db.prepare('SELECT owner_id,settings_version,candidates_json,profile_json FROM opportunity_search_snapshots WHERE id=?').bind(result.snapshotId).first();assert.equal(snapshot.owner_id,'alice');assert.equal(snapshot.settings_version,1);assert.equal(JSON.parse(snapshot.candidates_json).length,2);assert.ok(JSON.parse(snapshot.profile_json));
  assert.equal(typeof search.opportunityJobs,'function');
  const jobRequest=(key,snapshotId=result.snapshotId)=>new Request('http://localhost/api/opportunity-suggestions/jobs',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json','idempotency-key':key},body:JSON.stringify({snapshotId,language:'es',dataProcessingConsent:true})});
  const first=await search.opportunityJobs(jobRequest('once'),env,'alice');assert.equal(first.status,201);const job=(await first.json()).job;assert.equal(job.kind,'opportunity.analyze');
  const repeat=await search.opportunityJobs(jobRequest('once'),env,'alice');assert.equal(repeat.status,200);assert.equal((await repeat.json()).job.id,job.id);
  assert.equal((await search.opportunityJobs(jobRequest('another'),env,'alice')).status,409);assert.equal((await search.opportunityJobs(jobRequest('bob'),env,'bob')).status,404);
  const runnerToken='c'.repeat(64);await db.prepare("INSERT INTO runners(id,owner_id,name,token_hash,created_at) VALUES('runner','alice','runner',?,'2026')").bind(await digest(runnerToken)).run();const claimRequest=new Request('http://localhost/api/runner/jobs/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kinds:['opportunity.analyze']})});const claim=await (await handleAgentJobs(claimRequest,env,{id:'runner',ownerId:'alice'})).json();assert.equal(claim.job?.id,job.id);const lease=claim.lease;
  const runnerDue=token=>worker.dispatchFetch('http://localhost/api/runner/opportunity-suggestions/due',{method:'POST',headers:token?{authorization:`Bearer ${token}`}:{}});
  assert.equal((await runnerDue()).status,401);const notEnabled=await runnerDue(runnerToken);assert.equal(notEnabled.status,200);assert.equal((await notEnabled.json()).started,false);
  assert.equal(typeof search.runnerOpportunityContext,'function');
  const contextRequest=(value=lease)=>new Request(`http://localhost/api/runner/jobs/${job.id}/opportunity-context`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lease:value})});
  const routed=await worker.dispatchFetch(`http://localhost/api/runner/jobs/${job.id}/opportunity-context`,{method:'POST',headers:{authorization:`Bearer ${runnerToken}`,'content-type':'application/json'},body:JSON.stringify({lease})});assert.equal(routed.status,200);
  const context=await search.runnerOpportunityContext(contextRequest(),env,{id:'runner',ownerId:'alice'},job.id);assert.equal(context.status,200);const source=await context.json();assert.equal(source.shortlist.length,2);assert.deepEqual(source.profile,JSON.parse(snapshot.profile_json));assert.equal((await search.runnerOpportunityContext(contextRequest('b'.repeat(64)),env,{id:'runner',ownerId:'alice'},job.id)).status,409);assert.equal((await search.runnerOpportunityContext(contextRequest(),env,{id:'runner',ownerId:'bob'},job.id)).status,409);
  await db.prepare("UPDATE provider_credentials SET revoked_at='2026' WHERE id='key'").run();assert.equal((await search.runnerOpportunityContext(contextRequest(),env,{id:'runner',ownerId:'alice'},job.id)).status,409);await db.prepare("UPDATE provider_credentials SET revoked_at=NULL WHERE id='key'").run();
  await db.prepare("INSERT INTO company_profiles(owner_id,profile_json,version,updated_at) VALUES('alice','{\"industry\":\"Temporal\"}',1,'2026')").run();assert.equal((await search.runnerOpportunityContext(contextRequest(),env,{id:'runner',ownerId:'alice'},job.id)).status,409);await db.prepare("DELETE FROM company_profiles WHERE owner_id='alice'").run();
  const completeRequest=(recommendations)=>new Request(`http://localhost/api/runner/jobs/${job.id}/complete`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lease,status:'succeeded',result:{recommendations}})});
  assert.equal((await handleAgentJobs(completeRequest([{id:'invented',reason:'x',checks:'y'}]),env,{id:'runner',ownerId:'alice'})).status,400);
  await db.prepare("UPDATE provider_credentials SET revoked_at='2026' WHERE id='key'").run();assert.equal((await handleAgentJobs(completeRequest([{id:'secop-ii:123',reason:'x',checks:'y'}]),env,{id:'runner',ownerId:'alice'})).status,409);await db.prepare("UPDATE provider_credentials SET revoked_at=NULL WHERE id='key'").run();
  let injected=false;const racingEnv={...env,DB:{prepare(sql){const statement=db.prepare(sql);if(!sql.includes("UPDATE account_jobs SET state='succeeded',result_json=?"))return statement;return {bind(...args){const bound=statement.bind(...args);return {async first(){if(!injected){injected=true;await db.prepare("INSERT INTO company_profiles(owner_id,profile_json,version,updated_at) VALUES('alice','{\"industry\":\"Cambio\"}',1,'2026')").run();}return bound.first();}};}};}}};
  assert.equal((await handleAgentJobs(completeRequest([{id:'secop-ii:123',reason:'x',checks:'y'}]),racingEnv,{id:'runner',ownerId:'alice'})).status,409);assert.equal(injected,true);await db.prepare("DELETE FROM company_profiles WHERE owner_id='alice'").run();
  const valid=[{id:'secop-ii:123',reason:'Coincide',checks:'Revisar pliego'},{id:'secop-i:123',reason:'Posible',checks:'Revisar condiciones'}];assert.equal((await handleAgentJobs(completeRequest(valid),env,{id:'runner',ownerId:'alice'})).status,200);assert.equal((await handleAgentJobs(completeRequest(valid),env,{id:'runner',ownerId:'alice'})).status,200);

  assert.equal(typeof search.opportunityResults,'function');
  const resultsRequest=(action,body)=>new Request(`http://localhost/api/opportunity-suggestions/results${action?'/'+action:''}`,action?{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(body)}:{method:'GET'});
  let listed=await (await search.opportunityResults(resultsRequest(),env,'alice')).json();assert.equal(listed.items.length,2);assert.equal(listed.items[0].process.id,'123');assert.equal(listed.items[0].reviewed,false);assert.equal(listed.items[0].saved,false);
  const previousFetch=globalThis.fetch;let checks=0;
  try {
   globalThis.fetch=async url=>{checks++;return Response.json(String(url).includes('p6dx-8zbt')?[{id_del_proceso:'123',estado_del_procedimiento:'Adjudicado'}]:[{uid:'123',estado_del_proceso:'Convocado'}]);};
   const verifiedRequest=()=>new Request('http://localhost/api/opportunity-suggestions/results?verify=1');
   const verified=await (await search.opportunityResults(verifiedRequest(),env,'alice')).json();assert.deepEqual(verified.items.map(item=>item.process.source),['secop-i']);assert.equal(verified.verificationUnavailable,false);
   await search.opportunityResults(verifiedRequest(),env,'alice');assert.equal(checks,2);
  } finally {globalThis.fetch=previousFetch;}
  const expired=JSON.parse(snapshot.candidates_json);expired[0].process.deadline='2000-01-01';expired[0].process.deadlineVerified=true;expired[1].process.status='Evaluación';
  await db.prepare('UPDATE opportunity_search_snapshots SET candidates_json=? WHERE id=?').bind(JSON.stringify(expired),result.snapshotId).run();
  const filtered=await (await search.opportunityResults(resultsRequest(),env,'alice')).json();assert.equal(filtered.items.length,0);assert.equal(filtered.unreadCount,0);
  await db.prepare('UPDATE opportunity_search_snapshots SET candidates_json=? WHERE id=?').bind(snapshot.candidates_json,result.snapshotId).run();
  assert.equal((await search.opportunityResults(resultsRequest('review',{jobId:job.id,candidateId:'secop-ii:123'}),env,'bob','review')).status,404);
  assert.equal((await search.opportunityResults(resultsRequest('review',{jobId:job.id,candidateId:'falso'}),env,'alice','review')).status,404);
  assert.equal((await search.opportunityResults(resultsRequest('review',{jobId:job.id,candidateId:'secop-ii:123'}),env,'alice','review')).status,200);
  const archive=await(await search.opportunityResults(new Request('http://localhost/api/opportunity-suggestions/results?archive=1'),env,'alice')).json();assert.equal(archive.items.length,1);assert.equal(archive.items[0].process.source,'secop-ii');assert.equal(archive.items[0].jobId,job.id);assert.deepEqual((await(await search.opportunityResults(new Request('http://localhost/api/opportunity-suggestions/results?archive=1'),env,'bob')).json()).items,[]);
  const saved=await Promise.all([search.opportunityResults(resultsRequest('save',{jobId:job.id,candidateId:'secop-ii:123'}),env,'alice','save'),search.opportunityResults(resultsRequest('save',{jobId:job.id,candidateId:'secop-ii:123'}),env,'alice','save')]);assert.ok(saved.every(response=>response.ok));const ids=await Promise.all(saved.map(async response=>(await response.json()).projectId));assert.equal(ids[0],ids[1]);
  listed=await (await search.opportunityResults(resultsRequest(),env,'alice')).json();assert.equal(listed.items[0].reviewed,true);assert.equal(listed.items[0].saved,true);assert.equal(listed.items[0].projectId,ids[0]);assert.equal(listed.items[1].reviewed,false);assert.equal(listed.items[1].saved,false);const other=await search.opportunityResults(resultsRequest('save',{jobId:job.id,candidateId:'secop-i:123'}),env,'alice','save');assert.ok(other.ok);assert.notEqual((await other.json()).projectId,ids[0]);assert.equal((await db.prepare("SELECT count(*) AS n FROM projects WHERE owner_id='alice'").first()).n,2);
  await db.prepare("INSERT INTO company_profiles(owner_id,profile_json,version,updated_at) VALUES('alice','{\"industry\":\"Nuevo\"}',1,'2026')").run();assert.equal((await (await search.opportunityResults(resultsRequest(),env,'alice')).json()).stale,true);await db.prepare("DELETE FROM company_profiles WHERE owner_id='alice'").run();
  await db.prepare("UPDATE account_jobs SET state='cancelled' WHERE id=?").bind(job.id).run();
  const competing=await Promise.all([search.opportunityJobs(jobRequest('parallel-1'),env,'alice'),search.opportunityJobs(jobRequest('parallel-2'),env,'alice')]);assert.deepEqual(competing.map(response=>response.status).sort(),[201,409]);await db.prepare("UPDATE account_jobs SET state='cancelled' WHERE owner_id='alice' AND kind='opportunity.analyze' AND state='queued'").run();

  const changed=await search.opportunitySearch(req(),env,'alice',async query=>{await db.prepare("UPDATE opportunity_suggestion_settings SET version=version+1,keywords='otra' WHERE owner_id='alice'").run();return lookup(query)});assert.equal(changed.status,409);assert.equal((await search.opportunityJobs(jobRequest('stale-settings'),env,'alice')).status,409);
  await db.prepare("INSERT INTO company_profiles(owner_id,profile_json,version,updated_at) VALUES('alice','{\"industry\":\"Tecnología\"}',1,'2026')").run();
  let changedProfile=false;const stale=await search.opportunitySearch(req(),env,'alice',async query=>{if(!changedProfile){changedProfile=true;await db.prepare("UPDATE company_profiles SET profile_json='{\"industry\":\"Salud\"}',version=version+1 WHERE owner_id='alice'").run();}return lookup(query)});assert.equal(stale.status,409);
  const failure=await search.opportunitySearch(req(),env,'alice',async()=>({success:false}));assert.equal(failure.status,502);
  const originalFetch=globalThis.fetch,urls=[];try{globalThis.fetch=async (url,options)=>{const target=String(url);if(!target.startsWith('https://www.datos.gov.co/'))return originalFetch(url,options);urls.push(target);return Response.json([]);};const connected=await search.opportunitySearch(req(),env,'alice');assert.equal(connected.status,200);assert.deepEqual((await connected.json()).shortlist,[]);assert.equal(urls.length,2);assert.ok(urls.some(url=>url.includes('p6dx-8zbt')));assert.ok(urls.some(url=>url.includes('f789-7hwg')));}finally{globalThis.fetch=originalFetch;}
  await db.prepare("UPDATE provider_credentials SET revoked_at='2026' WHERE id='key'").run();const before=count;assert.equal((await search.opportunitySearch(req(),env,'alice',lookup)).status,409);assert.equal(count,before);
  assert.equal((await search.opportunitySearch(req(),env,'bob',lookup)).status,409);
  assert.equal(typeof search.opportunityDue,'function');
  const dueRequest=()=>new Request('http://localhost/api/opportunity-suggestions/due',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({language:'es'})});
  const callsBefore=count;assert.equal((await (await search.opportunityDue(dueRequest(),env,'alice',lookup)).json()).started,false);assert.equal(count,callsBefore);
  await db.prepare("UPDATE provider_credentials SET revoked_at=NULL WHERE id='key'").run();await db.prepare("UPDATE opportunity_suggestion_settings SET auto_enabled=1,version=version+1 WHERE owner_id='alice'").run();
  await db.prepare("UPDATE account_jobs SET updated_at='2000-01-01T00:00:00.000Z' WHERE owner_id='alice' AND kind='opportunity.analyze'").run();
  const due=await Promise.all([search.opportunityDue(dueRequest(),env,'alice',lookup),search.opportunityDue(dueRequest(),env,'alice',lookup)]);const dueResults=await Promise.all(due.map(response=>response.json()));assert.equal(dueResults.filter(item=>item.started).length,1);assert.equal((await db.prepare("SELECT count(*) AS n FROM account_jobs WHERE owner_id='alice' AND kind='opportunity.analyze' AND state='queued'").first()).n,1);
  const prev=count;assert.equal((await(await search.opportunityDue(dueRequest(),env,'alice',lookup)).json()).started,false);assert.equal(count,prev);
  await db.prepare("UPDATE account_jobs SET state='succeeded',updated_at=? WHERE owner_id='alice' AND kind='opportunity.analyze' AND state='queued'").bind(new Date().toISOString()).run();await db.prepare("UPDATE opportunity_schedule_web SET last_attempt=0 WHERE owner_id='alice'").run();const sixHourCount=count;assert.equal((await(await search.opportunityDue(dueRequest(),env,'alice',lookup)).json()).started,false);assert.equal(count,sixHourCount);
  await db.prepare("UPDATE account_jobs SET state='cancelled',updated_at='2000-01-01T00:00:00.000Z' WHERE owner_id='alice' AND kind='opportunity.analyze' AND updated_at>=? ").bind(new Date(Date.now()-60000).toISOString()).run();await db.prepare("UPDATE opportunity_schedule_web SET last_attempt=? WHERE owner_id='alice'").bind(Date.now()).run();assert.equal((await(await search.opportunityDue(dueRequest(),env,'alice',lookup)).json()).started,false);
  await db.prepare("UPDATE opportunity_schedule_web SET last_attempt=0 WHERE owner_id='alice'").run();let disabled=false;const during=await search.opportunityDue(dueRequest(),env,'alice',async query=>{if(!disabled){disabled=true;await db.prepare("UPDATE opportunity_suggestion_settings SET auto_enabled=0 WHERE owner_id='alice'").run();}return lookup(query);});assert.equal((await during.json()).started,false);assert.equal((await db.prepare("SELECT count(*) AS n FROM account_jobs WHERE owner_id='alice' AND kind='opportunity.analyze' AND state='queued'").first()).n,0);


 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});

test('filtra recomendaciones activas y archivadas por país y respeta tenant/miembro', async () => {
 const worker = new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'search-market'}}));
 try {
  const db = await worker.getD1Database('DB');
  for (const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort()) {
   for (const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean)) await db.prepare(sql).run();
  }
  const env = {DB:db,BETTER_AUTH_URL:'http://localhost'};
  await db.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt,savia_market) VALUES (?,?,?,?,?,?,?)').bind('owner','Owner','owner@example.com',1,0,0,'ALL').run();
  await db.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt,savia_market) VALUES (?,?,?,?,?,?,?)').bind('member','Member','member@example.com',1,0,0,'ES').run();
  await db.prepare('INSERT INTO tenants (id,name,owner_user_id,country,created_at) VALUES (?,?,?,?,?)').bind('tenant-1','Org','owner','ALL','2026').run();
  await db.prepare("INSERT INTO provider_credentials(id,owner_id,provider,model,key_id,iv,ciphertext,created_at) VALUES('key','owner','opencode-go','model','k','iv','encrypted','2026')").run();
  await db.prepare("INSERT INTO opportunity_suggestion_settings(owner_id,enabled,keywords,version,updated_at,credential_id,include_rup,consented_at) VALUES('owner',1,'software',1,'2026','key',0,'2026')").run();

  const seenDatasets = [];
  const lookup = async ({dataset}) => {
   seenDatasets.push(dataset);
   if (dataset === 'secop-ii') return {success:true,data:{items:[{id:'co-1',source:'secop-ii',title:'Software CO',status:'Publicado'}]}};
   if (dataset === 'placsp') return {success:true,data:{items:[{id:'es-1',source:'placsp',title:'Software ES',status:'Publicado',statusCode:'PUB'}]}};
   return {success:true,data:{items:[]}};
  };

  // Explicit input.market overrides owner's ALL market.
  seenDatasets.length = 0;
  const esSearch = await search.opportunitySearch(
   new Request('http://localhost/api/opportunity-suggestions/search',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({language:'es',market:'ES'})}),
   env,'owner',lookup,{userId:'owner',tenantCountry:'ALL'},
  );
  assert.equal(esSearch.status,200);
  assert.deepEqual([...new Set(seenDatasets)].sort(),['placsp','ted']);

  // Acting tenant member without explicit input.market uses member's savia_market ('ES').
  seenDatasets.length = 0;
  const memberSearch = await search.opportunitySearch(
   new Request('http://localhost/api/opportunity-suggestions/search',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({language:'es'})}),
   env,'owner',lookup,{userId:'member',tenantCountry:'ALL'},
  );
  assert.equal(memberSearch.status,200);
  assert.deepEqual([...new Set(seenDatasets)].sort(),['placsp','ted']);

  // Tenant fixed country overrides both input.market and member preference.
  seenDatasets.length = 0;
  const tenantOverride = await search.opportunitySearch(
   new Request('http://localhost/api/opportunity-suggestions/search',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({language:'es',market:'ES'})}),
   env,'owner',lookup,{userId:'member',tenantCountry:'CO'},
  );
  assert.equal(tenantOverride.status,200);
  assert.deepEqual([...new Set(seenDatasets)].sort(),['secop-i','secop-ii']);

  // Seed archived CO job and mixed ALL job.
  const coProc = {id:'co-1',source:'secop-ii',title:'Software CO',status:'Publicado'};
  const esProc = {id:'es-1',source:'placsp',title:'Software ES',status:'Publicado',statusCode:'PUB'};
  const archCoProc = {id:'co-arch',source:'secop-ii',title:'Archivado CO',status:'Publicado'};
  const archEsProc = {id:'es-arch',source:'ted',title:'Archivado ES',status:'Publicado',statusCode:'PUB'};

  await db.prepare("INSERT INTO opportunity_search_snapshots(id,owner_id,settings_version,credential_id,source_fingerprint,profile_json,shortlist_json,candidates_json,created_at,expires_at,source_state) VALUES('snap-old','owner',1,'key','fp','{}','[]',?,?,?,?)")
   .bind(JSON.stringify([{id:'secop-ii:co-arch',process:archCoProc},{id:'ted:es-arch',process:archEsProc}]),'2026-01-01T00:00:00Z',Date.now()+86400000,'{}').run();
  await db.prepare("INSERT INTO account_jobs(id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at,credential_id,result_json) VALUES('job-old','owner','opportunity.analyze','k-old',?,'succeeded','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','key',?)")
   .bind(JSON.stringify({snapshotId:'snap-old'}),JSON.stringify({recommendations:[{id:'secop-ii:co-arch',reason:'r1',checks:'c1'},{id:'ted:es-arch',reason:'r2',checks:'c2'}]})).run();
  await db.prepare("INSERT INTO opportunity_suggestion_reviews_web(owner_id,source,process_id,reviewed_at) VALUES('owner','secop-ii','co-arch','2026-01-02T00:00:00Z'),('owner','ted','es-arch','2026-01-03T00:00:00Z')").run();

  await db.prepare("INSERT INTO opportunity_search_snapshots(id,owner_id,settings_version,credential_id,source_fingerprint,profile_json,shortlist_json,candidates_json,created_at,expires_at,source_state) VALUES('snap-mix','owner',1,'key','fp','{}','[]',?,?,?,?)")
   .bind(JSON.stringify([{id:'secop-ii:co-1',process:coProc},{id:'placsp:es-1',process:esProc}]),'2026-01-04T00:00:00Z',Date.now()+86400000,'{}').run();
  await db.prepare("INSERT INTO account_jobs(id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at,credential_id,result_json) VALUES('job-mix','owner','opportunity.analyze','k-mix',?,'succeeded','2026-01-04T00:00:00Z','2026-01-04T00:00:00Z','key',?)")
   .bind(JSON.stringify({snapshotId:'snap-mix'}),JSON.stringify({recommendations:[{id:'secop-ii:co-1',reason:'r1',checks:'c1'},{id:'placsp:es-1',reason:'r2',checks:'c2'}]})).run();

  const resCo = await (await search.opportunityResults(new Request('http://localhost/api/opportunity-suggestions/results?market=CO'),env,'owner',undefined,{userId:'owner',tenantCountry:'ALL'})).json();
  assert.deepEqual(resCo.items.map(i=>i.id),['secop-ii:co-1']);
  const resEs = await (await search.opportunityResults(new Request('http://localhost/api/opportunity-suggestions/results?market=ES'),env,'owner',undefined,{userId:'owner',tenantCountry:'ALL'})).json();
  assert.deepEqual(resEs.items.map(i=>i.id),['placsp:es-1']);
  const resAll = await (await search.opportunityResults(new Request('http://localhost/api/opportunity-suggestions/results?market=ALL'),env,'owner',undefined,{userId:'owner',tenantCountry:'ALL'})).json();
  assert.deepEqual(resAll.items.map(i=>i.id),['secop-ii:co-1','placsp:es-1']);

  const archCo = await (await search.opportunityResults(new Request('http://localhost/api/opportunity-suggestions/results?archive=1&market=CO'),env,'owner',undefined,{userId:'owner',tenantCountry:'ALL'})).json();
  assert.deepEqual(archCo.items.map(i=>i.id),['secop-ii:co-arch']);
  const archEs = await (await search.opportunityResults(new Request('http://localhost/api/opportunity-suggestions/results?archive=1&market=ES'),env,'owner',undefined,{userId:'owner',tenantCountry:'ALL'})).json();
  assert.deepEqual(archEs.items.map(i=>i.id),['ted:es-arch']);

  // When latest job only has candidates for another country, return jobId: null so UI opens search setup.
  await db.prepare('UPDATE opportunity_search_snapshots SET candidates_json=? WHERE id=?').bind(JSON.stringify([{id:'secop-ii:co-1',process:coProc}]),'snap-mix').run();
  await db.prepare('UPDATE account_jobs SET result_json=? WHERE id=?').bind(JSON.stringify({recommendations:[{id:'secop-ii:co-1',reason:'r1',checks:'c1'}]}),'job-mix').run();
  const onlyCoForEs = await (await search.opportunityResults(new Request('http://localhost/api/opportunity-suggestions/results?market=ES'),env,'owner',undefined,{userId:'owner',tenantCountry:'ALL'})).json();
  assert.equal(onlyCoForEs.jobId,null);
  assert.deepEqual(onlyCoForEs.items,[]);
  const onlyCoForCo = await (await search.opportunityResults(new Request('http://localhost/api/opportunity-suggestions/results?market=CO'),env,'owner',undefined,{userId:'owner',tenantCountry:'ALL'})).json();
  assert.equal(onlyCoForCo.jobId,'job-mix');
  assert.deepEqual(onlyCoForCo.items.map(i=>i.id),['secop-ii:co-1']);
 } finally { await worker?.dispose(); }
});
