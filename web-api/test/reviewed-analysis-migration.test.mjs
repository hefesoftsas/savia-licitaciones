import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('la migración conserva análisis y referencias a tareas existentes', async () => {
 const db = new DatabaseSync(':memory:');
 try {
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE projects (id TEXT PRIMARY KEY); CREATE TABLE jobs (id TEXT PRIMARY KEY); INSERT INTO projects VALUES ('project'); INSERT INTO jobs VALUES ('job');");
  db.exec(await readFile(new URL('../migrations/0019_technical_analyses.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO project_technical_analyses VALUES (?, ?, ?, ?, ?, ?, ?)').run('project', 'technical-score', 7, 'Contenido anterior', 'job', '{"documentsFingerprint":"[]","includeRup":false}', '2026-01-01');
  db.exec(await readFile(new URL('../migrations/0033_reviewed_imported_analyses.sql', import.meta.url), 'utf8'));
  const row = db.prepare('SELECT * FROM project_technical_analyses').get(); assert.equal(row.content, 'Contenido anterior'); assert.equal(row.revision, 7); assert.equal(row.job_id, 'job'); assert.equal(row.review_id, null); assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
 } finally { db.close(); }
});

test('la migración de D1 conserva los análisis existentes y permite nuevas revisiones', async () => {
 const worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("ok"); } }', compatibilityDate: '2026-10-30', d1Databases: { DB: 'migration-test' } }));
 try {
  const db = await worker.getD1Database('DB');
  for (const sql of ["CREATE TABLE projects (id TEXT PRIMARY KEY)", "CREATE TABLE jobs (id TEXT PRIMARY KEY)", "INSERT INTO projects VALUES ('project')", "INSERT INTO jobs VALUES ('job')"]) await db.prepare(sql).run();
  for (const sql of (await readFile(new URL('../migrations/0019_technical_analyses.sql', import.meta.url), 'utf8')).split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
  await db.prepare('INSERT INTO project_technical_analyses VALUES (?, ?, ?, ?, ?, ?, ?)').bind('project', 'technical-score', 7, 'Contenido anterior', 'job', '{}', '2026-01-01').run();
  for (const sql of (await readFile(new URL('../migrations/0033_reviewed_imported_analyses.sql', import.meta.url), 'utf8')).split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
  const row = await db.prepare('SELECT * FROM project_technical_analyses WHERE project_id = ?').bind('project').first(); assert.equal(row.job_id, 'job'); assert.equal(row.revision, 7); assert.equal(row.content, 'Contenido anterior');
  await db.prepare("UPDATE project_technical_analyses SET job_id = NULL, review_id = 'review', source_file_ids_json = '[]' WHERE project_id = 'project'").run();
  assert.equal((await db.prepare('SELECT review_id FROM project_technical_analyses WHERE project_id = ?').bind('project').first()).review_id, 'review');
 } finally { await worker.dispose(); }
});
