import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {handleRunnerUser} from '../src/runners.js';
test('estado incluye tareas de proyecto y cuenta con lease vigente, aisladas por usuario',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'runner-status'}}));
 try{const DB=await worker.getD1Database('DB');await DB.prepare('CREATE TABLE runners(id TEXT,owner_id TEXT,name TEXT,created_at TEXT,last_seen_at TEXT,execution_mode TEXT,revoked_at TEXT,max_agents INTEGER DEFAULT 1,supports_concurrency INTEGER DEFAULT 0)').run();for(const table of ['jobs','account_jobs'])await DB.prepare(`CREATE TABLE ${table}(runner_id TEXT,owner_id TEXT,state TEXT,lease_expires_at INTEGER)`).run();
 await DB.prepare("INSERT INTO runners(id,owner_id,name,created_at,last_seen_at,execution_mode,revoked_at) VALUES('r','alice','Local','2026',?,'local',NULL),('other','bob','Other','2026',?,'local',NULL)").bind(new Date().toISOString(),new Date().toISOString()).run();
 const future=Date.now()+60000;await DB.prepare("INSERT INTO jobs VALUES('r','alice','running',?),('r','alice','running',1),('r','alice','succeeded',?),('r','bob','running',?),(NULL,'alice','queued',NULL)").bind(future,future,future).run();await DB.prepare("INSERT INTO account_jobs VALUES('r','alice','running',?),(NULL,'alice','queued',NULL)").bind(future).run();
 await DB.prepare('CREATE TABLE projects(id TEXT,owner_id TEXT,title TEXT)').run();await DB.prepare("INSERT INTO projects VALUES('p','alice','Oferta de prueba')").run();
 for(const column of ['id','project_id','kind','progress','created_at'])await DB.prepare(`ALTER TABLE jobs ADD COLUMN ${column} TEXT`).run();
 for(const column of ['id','kind','progress','created_at'])await DB.prepare(`ALTER TABLE account_jobs ADD COLUMN ${column} TEXT`).run();
 await DB.prepare("UPDATE jobs SET id='j'||rowid,project_id='p',kind='technical-plan.generate-batch',progress='ocr',created_at='2026'").run();
 const response=await handleRunnerUser(new Request('http://localhost/api/runners'),{DB},'alice'),data=await response.json();assert.equal(data.activeJobs.length,2);assert.equal(data.activeJobs[0].projectTitle,'Oferta de prueba');assert.equal(data.activeJobs[0].progress,'ocr');assert.equal(data.runners.length,1);assert.equal(data.runners[0].runningJobs,2);assert.equal(data.runners[0].completedJobs,1);assert.equal(data.runners[0].assignedJobs,4);assert.equal(data.queuedJobs,2);await DB.prepare("UPDATE runners SET revoked_at='2026' WHERE id='r'").run();assert.equal((await(await handleRunnerUser(new Request('http://localhost/api/runners'),{DB},'alice')).json()).runners.length,0);
 }finally{await worker.dispose();}
});
