import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { importDesktopChat } from '../src/desktop-chat-import.js';
import { restoreProjectChat } from '../../runner/project-chat-restore.mjs';

test('recupera consultas como historial aislado y permite reintentos',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'chat-restore'}}));
 try {
  const DB=await worker.getD1Database('DB');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();
  await DB.prepare('INSERT INTO projects (id,owner_id,title,created_at) VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  await DB.prepare('INSERT INTO desktop_plan_imports VALUES (?,?,?,?,?,?)').bind('alice','req','hash','p','mutation','2026').run();
  const messages=[{id:'q',role:'user',content:'Consulta',status:'complete',createdAt:'2026',followupsJson:null},{id:'a',role:'assistant',content:'Respuesta',status:'complete',createdAt:'2026',followupsJson:'{"questions":["Otra"]}'}];
  const send=async(url,options)=>{const response=await importDesktopChat(new Request(url,options),{DB},{ownerId:'alice'},'req');if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();};
  await restoreProjectChat({messages,server:'http://localhost',requestId:'req',send});await restoreProjectChat({messages,server:'http://localhost',requestId:'req',send});
  const row=await DB.prepare('SELECT messages_json FROM desktop_chat_imports WHERE project_id=? AND owner_id=?').bind('p','alice').first();assert.deepEqual(JSON.parse(row.messages_json),messages);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE project_id=? AND kind='tender-chat.send'").bind('p').first()).n,0);
 } finally {await worker.dispose();}
});
