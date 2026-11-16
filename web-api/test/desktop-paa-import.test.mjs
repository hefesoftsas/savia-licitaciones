import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const require=createRequire(new URL('../../client/package.json',import.meta.url)),{createCompanyArchive}=require('./electron/services/companyBackupArchive.cjs'),root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('migra seguimiento PAA y avisos sin sobreescribir ni restablecer planes retirados',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-paa-import-'));let worker,calls=0;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  const outboundService=async request=>{calls++;assert.equal(new URL(request.url).hostname,'www.datos.gov.co');return Response.json([{id_plan_anual_de_adquisiciones:'existing',nombre_entidad:'Web',anno:'2026',version:'actual'}]);};
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'paa-import'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'},outboundService}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),send=(path,method,body,headers={})=>req(path,{method,headers:{origin:'http://localhost','content-type':'application/json',...headers},body:JSON.stringify(body)});
  async function signup(name){const response=await send('/api/auth/sign-up/email','POST',{name,email:`${name}@example.com`,password:'password-123456'});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
  const alice=await signup('alice'),bob=await signup('bob'),pair=(await (await send('/api/runner-pairings','POST',{}, {cookie:alice})).json()),runner=(await (await send('/api/runners/pair','POST',{code:pair.code,name:'Equipo'})).json());
  assert.equal((await send('/api/paa-watches','POST',{planId:'existing'},{cookie:alice})).status,201);const callsBefore=calls;
  const dbPath=join(dir,'desktop.sqlite'),local=new DatabaseSync(dbPath);local.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT); CREATE TABLE paa_watched_plans (plan_id TEXT, header_json TEXT, checked_at TEXT, error TEXT); CREATE TABLE paa_watch_alerts (id TEXT, plan_id TEXT, previous_json TEXT, current_json TEXT, created_at TEXT, reviewed INTEGER);");
  const header=(planId,version)=>({id:'legacy-id',planId,entity:'Entidad privada',year:2026,version,modifiedAt:'2026-01-01',status:'Publicado',headerId:'cabecera'}),a=header('plan-ñ','2'),old=header('plan-ñ','1');
  local.prepare('INSERT INTO paa_watched_plans VALUES (?,?,?,?)').run('plan-ñ',JSON.stringify(a),'2026-01-02T00:00:00.000Z','fallo anterior');local.prepare('INSERT INTO paa_watched_plans VALUES (?,?,?,?)').run('existing',JSON.stringify(header('existing','antiguo')),'2026-01-01T00:00:00.000Z','');
  const add=local.prepare('INSERT INTO paa_watch_alerts VALUES (?,?,?,?,?,?)');add.run('a1','plan-ñ',JSON.stringify(old),JSON.stringify(a),'2026-01-01T00:00:00.000Z',0);add.run('a2','plan-ñ',JSON.stringify(old),JSON.stringify(a),'2026-01-02T00:00:00.000Z',1);add.run('orphan','sin-plan',JSON.stringify(old),JSON.stringify(a),'2026-01-01T00:00:00.000Z',0);local.close();
  const backup=join(dir,'backup.savia'),config=join(dir,'runner.json');await writeFile(backup,createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(dbPath)}]}));await writeFile(config,JSON.stringify({server:(await worker.ready).origin,runnerId:runner.runner.id,token:runner.token}));
  const cli=process.env.SAVIA_TEST_RUNNER_CLI||resolve(root,'../runner/cli.mjs'),run=promisify(execFile),inspection=(await run(process.execPath,[cli,'inspect-backup','--backup',backup])).stdout;
  assert.equal(JSON.parse(inspection).paaWatches.count,2);assert.equal(JSON.parse(inspection).paaWatches.alertCount,2);assert.equal(JSON.parse(inspection).paaWatches.orphanAlertCount,1);assert.equal(inspection.includes('Entidad privada'),false);
  const args=[cli,'import-paa','--backup',backup,'--config',config],first=JSON.parse((await run(process.execPath,args)).stdout),again=JSON.parse((await run(process.execPath,args)).stdout);assert.equal(first.imported,1);assert.equal(first.conflicts,1);assert.deepEqual(first.conflictPlanIds,['existing']);assert.equal(first.orphanAlerts,1);assert.equal(first.importedAlerts,2);assert.equal(again.imported,1);assert.equal(calls,callsBefore);
  const state=async(cookie)=>await (await req('/api/paa-watches',{headers:{cookie}})).json();let result=await state(alice);assert.equal(result.items.length,2);assert.equal(result.items.find(item=>item.planId==='existing').version,'actual');const imported=result.items.find(item=>item.planId==='plan-ñ');assert.equal(imported.version,'2');assert.notEqual(imported.id,'legacy-id');assert.equal(imported.error,'fallo anterior');assert.equal(result.alerts.length,2);assert.equal(result.unreadCount,1);assert.equal((await state(bob)).items.length,0);
  const unreviewed=result.alerts.find(item=>!item.reviewed);assert.equal((await send(`/api/paa-alerts/${unreviewed.id}/review`,'POST',{}, {cookie:alice})).status,200);
  const repeated=JSON.parse((await run(process.execPath,args)).stdout);assert.equal(repeated.importedAlerts,2);assert.equal((await state(alice)).unreadCount,0);
  assert.equal((await send(`/api/paa-watches/${imported.id}`,'DELETE',{}, {cookie:alice})).status,204);const after=JSON.parse((await run(process.execPath,args)).stdout);assert.equal(after.removed,1);assert.deepEqual(after.removedPlanIds,['plan-ñ']);assert.equal((await state(alice)).items.length,1);assert.equal((await state(alice)).alerts.length,0);
  const requestId=`desktop-paa-${createHash('sha256').update(await readFile(backup)).digest('hex')}`,sourceKey=createHash('sha256').update('plan-ñ').digest('hex'),url=`/api/runner/imports/paa/${requestId}/${sourceKey}`;assert.equal((await send(url,'POST',{},{})).status,401);
  const keyFor=value=>createHash('sha256').update(value).digest('hex'), auth={authorization:`Bearer ${runner.token}`}, makeWatch=planId=>({planId,header:header(planId,'1'),checkedAt:'2026-01-02T00:00:00.000Z',error:'',alerts:[{id:'source-alert',previous:header(planId,'1'),current:header(planId,'2'),createdAt:'2026-01-03T00:00:00.000Z',reviewed:false}]});
  const fresh=makeWatch('concurrente'),freshPath=`/api/runner/imports/paa/${requestId}/${keyFor(fresh.planId)}`;
  const pairResults=await Promise.all([send(freshPath,'POST',fresh,auth),send(freshPath,'POST',fresh,auth)]);assert.deepEqual(pairResults.map(r=>r.status).sort(),[200,201]);assert.equal((await pairResults[0].json()).watchId,(await pairResults[1].json()).watchId);
  assert.equal((await send(freshPath,'POST',{...fresh,error:'modificado'},auth)).status,409);assert.equal((await state(alice)).alerts.length,1);assert.equal((await state(bob)).alerts.length,0);
  const failure=makeWatch('falla'),failurePath=`/api/runner/imports/paa/${requestId}/${keyFor(failure.planId)}`;await db.exec("CREATE TRIGGER reject_paa_alert BEFORE INSERT ON paa_alerts WHEN NEW.current_json LIKE '%falla%' BEGIN SELECT RAISE(ABORT,'simulated'); END");
  let rejected;try{rejected=await send(failurePath,'POST',failure,auth);}catch{/* D1 may throw */}if(rejected)assert.equal(rejected.status,500);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM paa_watches WHERE plan_id = ?').bind('falla').first()).count,0);assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM desktop_paa_imports WHERE source_key = ?').bind(keyFor('falla')).first()).count,0);await db.exec('DROP TRIGGER reject_paa_alert');

 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
