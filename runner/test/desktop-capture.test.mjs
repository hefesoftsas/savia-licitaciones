import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { readCompanyArchive } = require('./electron/services/companyBackupArchive.cjs');
const execute = promisify(execFile), cli = process.env.SAVIA_TEST_RUNNER_CLI || new URL('../cli.mjs', import.meta.url).pathname;

test('captura un perfil de escritorio versión 69 y cuenta su seguimiento sin exponer contenido',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-capture-69-'));try{
  const root=join(dir,'perfil'),workspace=join(root,'workspace');await mkdir(workspace,{recursive:true});const db=new DatabaseSync(join(workspace,'savia.sqlite'));db.exec("PRAGMA user_version=69; CREATE TABLE technical_plan_meta(id INTEGER,outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES(1,'Plan'); CREATE TABLE technical_plan_outline_nodes(node_id TEXT,parent_node_id TEXT,sort_order INTEGER,title TEXT); CREATE TABLE technical_plan_secop_context(id INTEGER,process_id TEXT); INSERT INTO technical_plan_secop_context VALUES(1,'p'); CREATE TABLE secop_submission_records(id TEXT,process_id TEXT,date TEXT,reference TEXT,version TEXT,note TEXT,package_id TEXT,receipt_id TEXT,created_at TEXT); CREATE TABLE secop_submission_files(id TEXT,process_id TEXT,owner_id TEXT,role TEXT,name TEXT,stored_name TEXT,size INTEGER,sha256 TEXT,created_at TEXT); CREATE TABLE secop_submission_requests(id TEXT,process_id TEXT,kind TEXT,title TEXT,due_date TEXT,note TEXT,status TEXT,task_id TEXT,created_at TEXT,updated_at TEXT); INSERT INTO secop_submission_requests VALUES('r','p','observation','Privado','','','pending','','2026','2026'); CREATE TABLE secop_submission_results(id TEXT,process_id TEXT,result TEXT,note TEXT,created_at TEXT);");db.close();
  const target=join(dir,'backup.savia');await execute(process.execPath,[cli,'create-backup','--user-data',root,'--company','default','--output',target]);const output=(await execute(process.execPath,[cli,'inspect-backup','--backup',target])).stdout,summary=JSON.parse(output);assert.equal(summary.schemaVersion,69);assert.equal(summary.projects[0].submissionRequestCount,1);assert.ok(summary.omitted.includes('submission-tracking'));assert.doesNotMatch(output,/Privado/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('captura empresa fuera de línea con WAL, sin secretos ni cambios de configuración y sin sobrescribir', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-capture-cli-')); let source;
 try {
  const userData = join(dir, 'Perfil con ñ'), workspace = join(userData, 'workspace'); await mkdir(workspace, { recursive: true });
  const config = JSON.stringify({ company_workspaces: { activeId: 'default', companies: [{ id: 'default', name: 'Empresa Ñ' }] }, api_key: 'secreto-ficticio' }); await writeFile(join(userData, 'user_config.json'), config);
  const database = join(workspace, 'savia.sqlite'); source = new DatabaseSync(database); source.exec("PRAGMA journal_mode=WAL; PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1, 'Mi plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT, description TEXT, content_mode TEXT, content TEXT); INSERT INTO technical_plan_outline_nodes VALUES ('x', NULL, 0, 'Capítulo', '', 'manual-fill', 'Datos WAL');");
  await writeFile(join(workspace, 'evidencia.txt'), 'Documento privado');
  const listed = await execute(process.execPath, [cli, 'list-desktop-companies', '--user-data', userData]); assert.equal(JSON.parse(listed.stdout).companies[0].name, 'Empresa Ñ'); assert.equal(listed.stdout.includes('secreto-ficticio'), false);
  const target = join(dir, 'respaldo.savia'), result = await execute(process.execPath, [cli, 'create-backup', '--user-data', userData, '--company', 'default', '--output', target]); assert.equal(JSON.parse(result.stdout).companyId, 'default');
  if (process.platform !== 'win32') assert.equal((await stat(target)).mode & 0o777, 0o600);
  const archiveBytes = await readFile(target), archive = readCompanyArchive(archiveBytes, 64); assert.equal(archive.manifest.companyName, 'Empresa Ñ'); assert.equal(archive.files.get('workspace/evidencia.txt').toString(), 'Documento privado'); assert.equal(JSON.stringify(archive.manifest).includes('secreto-ficticio'), false); assert.equal(archive.files.has('user_config.json'), false); assert.equal((await readFile(join(userData, 'user_config.json'), 'utf8')), config);
  const preview = await execute(process.execPath, [cli, 'inspect-backup', '--backup', target]); assert.equal(JSON.parse(preview.stdout).projects[0].nodeCount, 1); assert.equal(source.prepare('SELECT content FROM technical_plan_outline_nodes').get().content, 'Datos WAL');
  await assert.rejects(execute(process.execPath, [cli, 'create-backup', '--user-data', userData, '--company', 'default', '--output', target]), /existe/i); assert.deepEqual(await readFile(target), archiveBytes);
  const inner = join(workspace, 'no-crear.savia'); await assert.rejects(execute(process.execPath, [cli, 'create-backup', '--user-data', userData, '--company', 'default', '--output', inner]), /fuera/i); assert.equal((await readdir(workspace)).includes('no-crear.savia'), false);
 } finally { source?.close(); await rm(dir, { recursive: true, force: true }); }
});

test('el bloqueo del perfil impide capturar mientras Savia está abierta', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-capture-locked-')); let lock;
 try {
  const userData = join(dir, 'profile'); await mkdir(join(userData, 'workspace'), { recursive: true });
  await writeFile(join(userData, 'user_config.json'), JSON.stringify({ company_workspaces: { activeId: 'default', companies: [{ id: 'default', name: 'Empresa' }] } }));
  const db = new DatabaseSync(join(userData, 'workspace', 'savia.sqlite')); db.exec('PRAGMA user_version=64; CREATE TABLE fixture (id INTEGER)'); db.close();
  lock = new DatabaseSync(join(userData, 'project-profile-lock.sqlite')); lock.exec('BEGIN EXCLUSIVE');
  const target = join(dir, 'locked.savia'); await assert.rejects(execute(process.execPath, [cli, 'create-backup', '--user-data', userData, '--company', 'default', '--output', target]), error => /perfil ya está abierto/i.test(error.stderr));
  assert.equal((await readdir(dir)).includes('locked.savia'), false); lock.exec('ROLLBACK');
 } finally { lock?.close(); await rm(dir, { recursive: true, force: true }); }
});

test('selecciona la empresa indicada y rechaza destinos enlazados al perfil', async () => {
 const { symlink } = await import('node:fs/promises'); const dir = await mkdtemp(join(tmpdir(), 'savia-capture-companies-')); let db;
 try {
  const root = join(dir, 'profile'), second = '22222222-2222-4222-8222-222222222222', secondRoot = join(root, 'company-profiles', second, 'workspace');
  await mkdir(join(root, 'workspace'), { recursive: true }); await mkdir(secondRoot, { recursive: true });
  const config = JSON.stringify({ company_workspaces: { activeId: 'default', companies: [{ id: 'default', name: 'Primera' }, { id: second, name: 'Segunda' }] }, text_model_profiles: { 'opencode-go': { api_key: 'no-exportar' } } }); await writeFile(join(root, 'user_config.json'), config);
  for (const [path, title] of [[join(root, 'workspace', 'savia.sqlite'), 'Primera'], [join(secondRoot, 'savia.sqlite'), 'Segunda']]) { db = new DatabaseSync(path); db.exec(`PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1, '${title}'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT, description TEXT, content_mode TEXT, content TEXT);`); db.close(); db = null; }
  await writeFile(join(root, 'workspace', 'primera.txt'), 'primera'); await writeFile(join(secondRoot, 'segunda.txt'), 'segunda');
  const target = join(dir, 'segunda.savia'); await execute(process.execPath, [cli, 'create-backup', '--user-data', root, '--company', second, '--output', target]);
  const archive = readCompanyArchive(await readFile(target), 64); assert.equal(archive.manifest.companyName, 'Segunda'); assert.equal(archive.files.has('workspace/primera.txt'), false); assert.equal(archive.files.get('workspace/segunda.txt').toString(), 'segunda'); assert.equal(await readFile(join(root, 'user_config.json'), 'utf8'), config);
  if (process.platform !== 'win32') { const link = join(dir, 'shortcut'); await symlink(join(root, 'workspace'), link); await assert.rejects(execute(process.execPath, [cli, 'create-backup', '--user-data', root, '--company', second, '--output', join(link, 'wrong.savia')]), error => /fuera/i.test(error.stderr)); }
 } finally { db?.close(); await rm(dir, { recursive: true, force: true }); }
});

test('no infiere empresa principal si falta el índice con perfiles existentes', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-capture-index-'));
 try {
  const root = join(dir, 'profile'); await mkdir(join(root, 'company-profiles', '33333333-3333-4333-8333-333333333333'), { recursive: true });
  await assert.rejects(execute(process.execPath, [cli, 'list-desktop-companies', '--user-data', root]), error => /índice de empresas/i.test(error.stderr));
  assert.deepEqual(await readdir(root), ['company-profiles']);
 } finally { await rm(dir, { recursive: true, force: true }); }
});
