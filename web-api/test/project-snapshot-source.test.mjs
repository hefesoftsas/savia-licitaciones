import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { openProjectSnapshotSource } from '../src/project-snapshot-source.js';
import { runnerProjectCapture } from '../src/project-capture-route.js';

async function setup() {
  const worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("ok") } }', compatibilityDate: '2026-10-30', d1Databases: { DB: 'snapshot' }, r2Buckets: ['FILES'] }));
  const DB = await worker.getD1Database('DB'), FILES = await worker.getR2Bucket('FILES');
  for (const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await DB.prepare(statement).run();
  }
  for (const id of ['alice', 'bob']) await DB.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind(id,id,`${id}@example.com`).run();
  for (const [id,owner] of [['a','alice'],['b','bob']]) await DB.prepare('INSERT INTO projects VALUES (?,?,?,?)').bind(id,owner,`Proyecto ${id}`,'2026-01-01').run();
  for (const [id,project] of [['file-a','a'],['file-b','b']]) {
    await FILES.put(`key-${id}`, id);
    await DB.prepare('INSERT INTO project_files VALUES (?,?,?,?,?,?,?)').bind(id,project,`${id}.txt`,'text/plain',`key-${id}`,id.length,'2026-01-01').run();
  }
  return { worker, DB, FILES };
}

test('captura solo el proyecto autorizado y lee el objeto fijado', async () => {
  const env = await setup();
  try {
    assert.equal(await openProjectSnapshotSource(env,'bob','a'), null);
    const source = await openProjectSnapshotSource(env,'alice','a');
    assert.equal(source.project.title,'Proyecto a');
    assert.deepEqual(source.files.map(file => file.id), ['file-a']);
    assert.equal(await new Response(await source.open('file-a')).text(), 'file-a');
    await assert.rejects(source.open('file-b'), /objeto/i);
    await source.assertUnchanged();
  } finally { await env.worker.dispose(); }
});

test('rechaza archivos ausentes o modificados y cambios en D1', async () => {
  const env = await setup();
  try {
    let source = await openProjectSnapshotSource(env,'alice','a');
    await env.FILES.put('key-file-a','cambio');
    await assert.rejects(source.open('file-a'), /camb|integridad/i);
    await assert.rejects(source.assertUnchanged(), /camb|integridad/i);
    await env.FILES.delete('key-file-a');
    await assert.rejects(openProjectSnapshotSource(env,'alice','a'), /falta|integridad/i);
    await env.FILES.put('key-file-a','file-a');
    source = await openProjectSnapshotSource(env,'alice','a');
    await env.DB.prepare('UPDATE projects SET title=? WHERE id=?').bind('Nuevo','a').run();
    await assert.rejects(source.assertUnchanged(), /camb/i);
  } finally { await env.worker.dispose(); }
});

test('rechaza una eliminación de archivo todavía en curso', async () => {
  const env = await setup();
  try {
    const source = await openProjectSnapshotSource(env,'alice','a');
    await env.DB.batch([
      env.DB.prepare("INSERT INTO project_file_deletions SELECT id,project_id,name,content_type,object_key,size,created_at,'2026-01-02',NULL FROM project_files WHERE id='file-a'"),
      env.DB.prepare("DELETE FROM project_files WHERE id='file-a'"),
    ]);
    await assert.rejects(source.assertUnchanged(), /camb/i);
    await assert.rejects(openProjectSnapshotSource(env,'alice','a'), /camb/i);
  } finally { await env.worker.dispose(); }
});

test('descargar un archivo no consulta los demás objetos de R2', async () => {
  const env = await setup();
  try {
    for (let i=0; i<4; i++) {
      await env.FILES.put(`extra-${i}`,'dato');
      await env.DB.prepare('INSERT INTO project_files VALUES (?,?,?,?,?,?,?)').bind(`extra-${i}`,'a',`extra-${i}.txt`,'text/plain',`extra-${i}`,4,'2026').run();
    }
    const source = await openProjectSnapshotSource(env,'alice','a');
    const file = source.files.find(x=>x.id==='file-a');
    let heads = 0, gets = 0;
    const counted = {DB:env.DB, FILES:{head:async(...args)=>{heads++;return env.FILES.head(...args);}, get:async(...args)=>{gets++;return env.FILES.get(...args);}}};
    const url = `http://localhost/api/runner/project-captures/a/files/file-a?etag=${encodeURIComponent(file.etag)}&version=${file.version}`;
    const response = await runnerProjectCapture(new Request(url),counted,{ownerId:'alice'},'a','file-a');
    assert.equal(response.status,200);
    assert.equal(await response.text(),'file-a');
    assert.equal(heads,0);
    assert.equal(gets,1);
  } finally { await env.worker.dispose(); }
});
