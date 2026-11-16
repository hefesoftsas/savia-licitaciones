import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readReferencedKnowledge } from '../src/project-knowledge-snapshot.js';

test('selecciona el índice completo del documento solo si todas las referencias son de la cuenta', async () => {
  const worker = new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'knowledge'}}));
  try {
    const DB = await worker.getD1Database('DB');
    for (const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()) for (const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean)) await DB.prepare(sql).run();
    for(const owner of ['alice','bob']) {
      await DB.prepare('INSERT INTO knowledge_folders(id,owner_id,name,created_at) VALUES (?,?,?,?)').bind(`folder-${owner}`,owner,owner,'2026').run();
      await DB.prepare('INSERT INTO knowledge_documents(id,folder_id,owner_id,name,content_type,object_key,size,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(`doc-${owner}`,`folder-${owner}`,owner,'documento.pdf','application/pdf',`private-${owner}`,4,'2026').run();
      await DB.prepare('INSERT INTO knowledge_indices VALUES (?,?,?,?,?)').bind(`doc-${owner}`,owner,2,'job','mutation').run();
      for(let i=1;i<=2;i++) await DB.prepare('INSERT INTO knowledge_entries VALUES (?,?,?,?,?,?,?)').bind(`${owner}-${i}`,`doc-${owner}`,owner,`Entrada ${i}`,'Resumen','Cita',i).run();
    }
    const result = await readReferencedKnowledge({DB},'alice',['alice-1']);
    assert.deepEqual(result.documents.map(x=>x.id),['doc-alice']);
    assert.deepEqual(result.entries.map(x=>x.id),['alice-1','alice-2']);
    assert.equal(result.folders[0].id,'folder-alice');
    assert.equal(result.indices[0].revision,2);
    assert.equal((await readReferencedKnowledge({DB},'alice',['alice-1','alice-2'])).documents.length,1);
    await assert.rejects(readReferencedKnowledge({DB},'alice',['bob-1']),/conocimiento/i);
    await assert.rejects(readReferencedKnowledge({DB},'alice',['alice-1','bob-1']),/conocimiento/i);
    await DB.prepare('UPDATE knowledge_documents SET missing_reason=? WHERE id=?').bind('not_found','doc-alice').run();
    await assert.rejects(readReferencedKnowledge({DB},'alice',['alice-1']),/conocimiento/i);
    await DB.prepare('UPDATE knowledge_documents SET missing_reason=NULL WHERE id=?').bind('doc-alice').run();
    await DB.prepare('UPDATE knowledge_documents SET deleting=1 WHERE id=?').bind('doc-alice').run();
    await assert.rejects(readReferencedKnowledge({DB},'alice',['alice-1']),/conocimiento/i);
    assert.deepEqual(await readReferencedKnowledge({DB},'alice',[]),{folders:[],documents:[],indices:[],entries:[]});
  } finally { await worker.dispose(); }
});
