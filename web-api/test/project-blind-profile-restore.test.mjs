import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import presets from '../../client/electron/services/blindCheckPresets.cjs';
import {importDesktopBlindProfile} from '../src/desktop-blind-profile-import.js';
import {restoreProjectBlindProfile} from '../../runner/project-blind-profile-restore.mjs';

test('recupera el perfil una vez, respeta ediciones posteriores y valida antes del envío',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'blind-restore'}}));
 try{const DB=await worker.getD1Database('DB');for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();await DB.prepare('INSERT INTO projects VALUES(?,?,?,?)').bind('p','alice','Proyecto','2026').run();await DB.prepare('INSERT INTO desktop_plan_imports VALUES(?,?,?,?,?,?)').bind('alice','req','hash','p','mutation','2026').run();
  const blindProfile={profile:presets.normalizeProfile({page:{paper:'Letter'},body:{font_en:'Arial'}}),updatedAt:'2026'};
  const send=async(url,options)=>{const response=await importDesktopBlindProfile(new Request(url,options),{DB},{ownerId:'alice'},'req');if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();};
  const options={blindProfile,server:'http://localhost',requestId:'req',send};let calls=0;await assert.rejects(restoreProjectBlindProfile({...options,blindProfile:{profile:{page:{paper:'imposible'}},updatedAt:'2026'},send:()=>{calls++;}}),/perfil/i);assert.equal(calls,0);
  await restoreProjectBlindProfile(options);await restoreProjectBlindProfile(options);let row=await DB.prepare('SELECT profile_json,updated_at,version FROM project_blind_profiles WHERE project_id=?').bind('p').first();assert.deepEqual(JSON.parse(row.profile_json),blindProfile.profile);assert.equal(row.updated_at,'2026');assert.equal(row.version,1);
  await DB.prepare('UPDATE project_blind_profiles SET profile_json=?,version=2 WHERE project_id=?').bind('{"edited":true}','p').run();await restoreProjectBlindProfile(options);row=await DB.prepare('SELECT profile_json FROM project_blind_profiles WHERE project_id=?').bind('p').first();assert.equal(row.profile_json,'{"edited":true}');
 }finally{await worker.dispose();}
});
