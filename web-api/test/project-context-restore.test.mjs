import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { importDesktopFacts } from '../src/desktop-fact-import.js';
import { importDesktopAnalyses } from '../src/desktop-analysis-import.js';
import { restoreProjectContext } from '../../runner/project-context-restore.mjs';

test('recupera hechos y análisis como contenido pendiente de revisión y permite reintentos',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'context-restore'}}));
 try {
  const DB=await worker.getD1Database('DB');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();
  await DB.prepare('INSERT INTO projects (id,owner_id,title,created_at) VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  await DB.prepare('INSERT INTO project_technical_plans(project_id,version,updated_at) VALUES (?,?,?)').bind('p',1,'2026').run();
  await DB.prepare('INSERT INTO desktop_plan_imports VALUES (?,?,?,?,?,?)').bind('alice','req','hash','p','mutation','2026').run();
  const context={facts:{groups:[{id:'f',title:'Hecho',content:'Contenido'}]},analyses:[{category:'project-overview',content:'Análisis anterior'}],importedAnalyses:[]};
  const send=async(url,options)=>{const request=new Request(url,options),runner={ownerId:'alice'},env={DB},response=url.endsWith('/facts')?await importDesktopFacts(request,env,runner,'req'):await importDesktopAnalyses(request,env,runner,'req');if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();};
  await restoreProjectContext({context,server:'http://localhost',requestId:'req',send});await restoreProjectContext({context,server:'http://localhost',requestId:'req',send});
  const facts=await DB.prepare('SELECT groups_json,snapshot_json FROM project_global_facts WHERE project_id=?').bind('p').first();
  assert.equal(JSON.parse(facts.groups_json)[0].content,'Contenido');assert.equal(JSON.parse(facts.snapshot_json).desktopImportPending,true);
  const analyses=JSON.parse((await DB.prepare('SELECT analyses_json FROM desktop_analysis_imports WHERE project_id=?').bind('p').first()).analyses_json);
  assert.equal(analyses[0].id,'projectOverview');assert.equal(analyses[0].content,'Análisis anterior');
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM project_technical_analyses WHERE project_id=?').bind('p').first()).n,0);
 } finally {await worker.dispose();}
});
