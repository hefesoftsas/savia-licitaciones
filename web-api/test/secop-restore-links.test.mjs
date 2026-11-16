import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { restoreSecopLinks, checkSecopAvailability } from '../src/secop-restore-links.js';

test('remapea documentos SECOP sin sobrescribir vínculos ni recrear archivos eliminados',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'secop-links'}}));
 try {
  const DB=await worker.getD1Database('DB');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();
  await DB.prepare('INSERT INTO projects VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  await DB.prepare('INSERT INTO desktop_plan_imports VALUES (?,?,?,?,?,?)').bind('alice','req','hash','p','mutation','2026').run();
  await DB.prepare('INSERT INTO project_secop VALUES (?,?,?,?,?)').bind('p','alice','secop-ii','process','{}').run();
  await DB.prepare('INSERT INTO desktop_secop_imports VALUES (?,?,?,?,?,?,?,?)').bind('alice','req','p','secop-ii','process','hash','mutation','2026').run();
  const check=(owner,requestId)=>checkSecopAvailability(new Request('http://localhost/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:'secop-ii',sourceId:'process',requestId})}),{DB},{ownerId:owner});
  assert.equal((await check('alice','other')).status,409);assert.equal((await check('alice','req')).status,200);assert.equal((await check('bob','other')).status,200);
  await DB.prepare('INSERT INTO project_files VALUES (?,?,?,?,?,?,?)').bind('file','p','pliego.pdf','application/pdf','key',4,'2026').run();
  await DB.prepare('INSERT INTO desktop_plan_file_imports(owner_id,request_id,source_key,file_id,project_id,content_hash,name,content_type,size,object_key,mutation_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind('alice','req','a'.repeat(64),'file','p','hash','pliego.pdf','application/pdf',4,'key','mutation','2026').run();
  const links=[{kind:'document',documentId:'d',sourceKey:'a'.repeat(64)},{kind:'zip',documentId:'z',sourceKey:'a'.repeat(64)}];
  const call=owner=>restoreSecopLinks(new Request('http://localhost/links',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({links})}),{DB},{ownerId:owner},'req');
  assert.equal((await call('bob')).status,404);assert.equal((await call('alice')).status,200);assert.equal((await call('alice')).status,200);
  assert.equal((await DB.prepare('SELECT file_id FROM project_secop_files WHERE project_id=? AND document_id=?').bind('p','d').first()).file_id,'file');
  assert.equal((await DB.prepare('SELECT file_id FROM secop_zip_files WHERE project_id=? AND document_id=?').bind('p','z').first()).file_id,'file');
  await DB.prepare('INSERT INTO project_files VALUES (?,?,?,?,?,?,?)').bind('other','p','otro.pdf','application/pdf','key-2',4,'2026').run();
  await DB.prepare('UPDATE project_secop_files SET file_id=? WHERE project_id=? AND document_id=?').bind('other','p','d').run();
  assert.equal((await call('alice')).status,409);
  assert.equal((await DB.prepare('SELECT file_id FROM project_secop_files WHERE project_id=? AND document_id=?').bind('p','d').first()).file_id,'other');
  await DB.prepare('UPDATE project_secop_files SET file_id=? WHERE project_id=? AND document_id=?').bind('file','p','d').run();
  await DB.prepare('DELETE FROM project_files WHERE id=?').bind('file').run();
  assert.equal((await call('alice')).status,410);
 } finally {await worker.dispose();}
});
