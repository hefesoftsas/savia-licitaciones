import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { inspectDesktopBackup } from '../desktop-backup.mjs';

const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { createCompanyArchive } = require('./electron/services/companyBackupArchive.cjs');

test('asocia seguimiento personal por la licitación real y acepta respaldos anteriores', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savia-tracking-backup-'));
  try {
    const file = join(dir, 'workspace.sqlite'), db = new DatabaseSync(file);
    db.exec(`PRAGMA user_version=64;
      CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT);
      INSERT INTO technical_plan_meta VALUES (1,'Plan');
      CREATE TABLE technical_plan_outline_nodes (node_id TEXT,parent_node_id TEXT,sort_order INTEGER,title TEXT);
      CREATE TABLE technical_plan_secop_context (id INTEGER,process_id TEXT,portfolio_id TEXT);
      INSERT INTO technical_plan_secop_context VALUES (1,'linked','');
      CREATE TABLE secop_saved_processes (id TEXT,process_json TEXT,summary TEXT,analysis_json TEXT,imported_json TEXT,official_json TEXT,created_at TEXT,updated_at TEXT);`);
    const insert = db.prepare('INSERT INTO secop_saved_processes VALUES (?,?,?,?,?,?,?,?)');
    for (const id of ['linked','separate']) insert.run(id, JSON.stringify({ id, source:'local', title:id }), '', '{}', '[]', '[]', '', '');
    const backup = async () => createCompanyArchive({ companyName:'Empresa', schemaVersion:64, files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)}] });
    let data = await inspectDesktopBackup(await backup(), {temporaryRoot:dir});
    assert.equal(data.projects[0].opportunityTracking, null);
    db.exec(`CREATE TABLE secop_opportunity_tracking (process_id TEXT PRIMARY KEY,decision TEXT,owner TEXT,notes TEXT);
      INSERT INTO secop_opportunity_tracking VALUES ('linked','participate','Ana','Nota privada'),('separate','discarded','Luis','Otra nota'),('orphan','review','','');`);
    data = await inspectDesktopBackup(await backup(), {temporaryRoot:dir});
    assert.deepEqual(data.projects[0].opportunityTracking, {decision:'participate',owner:'Ana',notes:'Nota privada'});
    assert.deepEqual(data.savedTenders.find(item=>item.record.sourceId==='separate').opportunityTracking, {decision:'discarded',owner:'Luis',notes:'Otra nota'});
    assert.equal(data.opportunityTrackingOrphanCount, 1);
    db.exec("DELETE FROM technical_plan_secop_context; CREATE TABLE technical_plan_project_active (id INTEGER,project_id TEXT); INSERT INTO technical_plan_project_active VALUES (1,'linked');");
    data = await inspectDesktopBackup(await backup(), {temporaryRoot:dir});
    assert.equal(data.projects[0].opportunityTracking, null, 'un identificador de plan no demuestra el vínculo con la licitación');
    db.close();
  } finally { await rm(dir,{recursive:true,force:true}); }
});
