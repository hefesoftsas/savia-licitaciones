import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { importDesktopOffer } from '../src/desktop-offer-import.js';
import { restoreProjectOffer } from '../../runner/project-offer-restore.mjs';

test('recupera la oferta económica una sola vez y no sobrescribe ediciones',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'offer-restore'}}));
 try {
  const DB=await worker.getD1Database('DB');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();
  await DB.prepare('INSERT INTO projects VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  await DB.prepare('INSERT INTO desktop_plan_imports VALUES (?,?,?,?,?,?)').bind('alice','req','hash','p','mutation','2026').run();
  const offer={updatedAt:'2026',draft:{currency:'COP',budget:'1000',items:[{id:'a',name:'Servicio',quantity:'2',price:'100',rate:'0',cost:'50'}]}};
  const send=async(url,options)=>{const response=await importDesktopOffer(new Request(url,options),{DB},{ownerId:'alice'},'req');if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();};
  const options={offer,server:'http://localhost',requestId:'req',send};
  let called=0;await assert.rejects(restoreProjectOffer({...options,offer:{...offer,draft:{...offer.draft,budget:5}},send:()=>{called++;}}),/oferta económica/i);assert.equal(called,0);
  await restoreProjectOffer(options);await restoreProjectOffer(options);
  assert.deepEqual(JSON.parse((await DB.prepare('SELECT draft_json FROM economic_offer_drafts WHERE project_id=?').bind('p').first()).draft_json),offer.draft);
  await DB.prepare('UPDATE economic_offer_drafts SET draft_json=? WHERE project_id=?').bind('{"edited":true}','p').run();
  await restoreProjectOffer(options);
  assert.equal((await DB.prepare('SELECT draft_json FROM economic_offer_drafts WHERE project_id=?').bind('p').first()).draft_json,'{"edited":true}');
 } finally {await worker.dispose();}
});
