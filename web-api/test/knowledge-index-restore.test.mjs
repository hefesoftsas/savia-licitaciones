import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { restoreKnowledgeIndex } from '../src/knowledge-index-restore.js';

test('recupera una sola vez un índice de conocimiento y no sobrescribe ediciones', async () => {
  const worker = new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'knowledge-index'}}));
  try {
    const DB = await worker.getD1Database('DB');
    for (const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()) for (const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean)) await DB.prepare(sql).run();
    await DB.prepare('INSERT INTO knowledge_folders(id,owner_id,name,created_at) VALUES (?,?,?,?)').bind('folder','alice','Carpeta','2026').run();
    await DB.prepare('INSERT INTO knowledge_documents(id,folder_id,owner_id,name,content_type,object_key,size,created_at) VALUES (?,?,?,?,?,?,?,?)').bind('doc','folder','alice','doc.pdf','application/pdf','key',4,'2026').run();
    await DB.prepare('INSERT INTO desktop_knowledge_document_imports VALUES (?,?,?,?,?,?,?)').bind('alice','restore-1','a'.repeat(64),'doc','hash','mutation','2026').run();
    const entries=[{id:'source-1',title:'Título',summary:'Resumen',quote:'Cita',sortOrder:0},{id:'source-2',title:'Otra',summary:'Texto',quote:'Cita 2',sortOrder:1}];
    const req = body => new Request('http://localhost/index',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const call = (owner,body={entries}) => restoreKnowledgeIndex(req(body),{DB},{ownerId:owner},'restore-1','a'.repeat(64));
    assert.equal((await call('bob')).status,404);
    const first=await call('alice'); assert.equal(first.status,201); const result=await first.json();
    assert.equal(result.mapping.length,2); assert.notEqual(result.mapping[0].id,'source-1');
    assert.deepEqual(await (await call('alice')).json(),result);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM knowledge_entries WHERE document_id=?').bind('doc').first()).n,2);
    await DB.prepare('INSERT INTO knowledge_documents(id,folder_id,owner_id,name,content_type,object_key,size,created_at) VALUES (?,?,?,?,?,?,?,?)').bind('doc-2','folder','alice','doc2.pdf','application/pdf','key-2',4,'2026').run();
    await DB.prepare('INSERT INTO desktop_knowledge_document_imports VALUES (?,?,?,?,?,?,?)').bind('alice','restore-2','b'.repeat(64),'doc-2','hash','mutation','2026').run();
    const concurrent=()=>restoreKnowledgeIndex(req({entries}),{DB},{ownerId:'alice'},'restore-2','b'.repeat(64));
    const [left,right]=await Promise.all([concurrent(),concurrent()]);
    assert.deepEqual([left.status,right.status].sort(),[200,201]);
    assert.deepEqual(await left.json(),await right.json());
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM knowledge_entries WHERE document_id=?').bind('doc-2').first()).n,2);
    assert.equal((await call('alice',{entries:[{...entries[0],title:'Alterado'}]})).status,409);
    await DB.prepare('UPDATE knowledge_indices SET revision=revision+1,mutation_id=? WHERE document_id=?').bind('edit','doc').run();
    assert.equal((await call('alice')).status,409);
    await DB.prepare('DELETE FROM knowledge_documents WHERE id=?').bind('doc').run();
    assert.equal((await call('alice')).status,410);
  } finally { await worker.dispose(); }
});
