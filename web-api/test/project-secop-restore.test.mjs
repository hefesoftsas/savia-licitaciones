import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { importDesktopSecop } from '../src/desktop-secop-import.js';
import { checkSecopAvailability, restoreSecopLinks } from '../src/secop-restore-links.js';
import { checkProjectSecop, restoreProjectSecop } from '../../runner/project-secop-restore.mjs';

test('recupera SECOP y sus vínculos con reintentos sin duplicar el proceso',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'secop-restore'}}));
 try {
  const DB=await worker.getD1Database('DB');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();
  await DB.prepare('INSERT INTO projects (id,owner_id,title,created_at) VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  await DB.prepare('INSERT INTO desktop_plan_imports VALUES (?,?,?,?,?,?)').bind('alice','req','hash','p','mutation','2026').run();
  await DB.prepare('INSERT INTO project_files VALUES (?,?,?,?,?,?,?)').bind('new-file','p','pliego.pdf','application/pdf','key',4,'2026').run();
  const key=createHash('sha256').update('old-file').digest('hex');
  await DB.prepare('INSERT INTO desktop_plan_file_imports(owner_id,request_id,source_key,file_id,project_id,content_hash,name,content_type,size,object_key,mutation_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind('alice','req',key,'new-file','p','hash','pliego.pdf','application/pdf',4,'key','mutation','2026').run();
  const secop={sourceId:'process',process:{id:'process',source:'secop-ii',title:'Proceso'},baseline:{process:{status:'open'},documents:[{id:'d',name:'Pliego'}],checkedAt:'2026',error:''},alerts:[{id:'a',title:'Proceso',kind:'status',previous:'old',current:'new',createdAt:'2026',reviewed:true}],links:[{kind:'document',documentId:'d',fileId:'old-file'}]};
  const send=async(url,options)=>{const request=new Request(url,options),runner={ownerId:'alice'},env={DB};const response=url.endsWith('/secop-check')?await checkSecopAvailability(request,env,runner):url.endsWith('/secop-links')?await restoreSecopLinks(request,env,runner,'req'):await importDesktopSecop(request,env,runner,'req');if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();};
  const options={secop,files:[{id:'old-file'}],server:'http://localhost',requestId:'req',send};
  await checkProjectSecop(options);await restoreProjectSecop(options);await checkProjectSecop(options);await restoreProjectSecop(options);
  assert.equal((await DB.prepare('SELECT file_id FROM project_secop_files WHERE project_id=? AND document_id=?').bind('p','d').first()).file_id,'new-file');
  assert.equal((await DB.prepare('SELECT reviewed FROM secop_watch_alerts_web WHERE project_id=?').bind('p').first()).reviewed,1);
  await assert.rejects(checkProjectSecop({...options,requestId:'different'}),/409/);
 } finally {await worker.dispose();}
});
