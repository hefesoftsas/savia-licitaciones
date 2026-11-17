import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import presets from '../../client/electron/services/blindCheckPresets.cjs';
import {runnerProjectCapture} from '../src/project-capture-route.js';

test('captura el perfil anónimo del proyecto y detecta cambios de versión',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'blind-snapshot'},r2Buckets:['FILES']}));
 try {const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();await DB.prepare('INSERT INTO projects (id,owner_id,title,created_at) VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  const profile=presets.normalizeProfile({page:{paper:'Letter'},body:{font_en:'Arial'}});await DB.prepare('INSERT INTO project_blind_profiles VALUES(?,?,?,?)').bind('p',JSON.stringify(profile),1,'2026').run();
  const req=new Request('http://localhost/capture'),env={DB,FILES};const first=await(await runnerProjectCapture(req,env,{ownerId:'alice'},'p')).json();assert.deepEqual(first.blindProfile,{profile,updatedAt:'2026'});
  await DB.prepare('UPDATE project_blind_profiles SET version=2 WHERE project_id=?').bind('p').run();assert.notEqual((await(await runnerProjectCapture(req,env,{ownerId:'alice'},'p')).json()).revision,first.revision);
  assert.equal((await runnerProjectCapture(req,env,{ownerId:'bob'},'p')).status,404);
 }finally{await worker.dispose();}
});
