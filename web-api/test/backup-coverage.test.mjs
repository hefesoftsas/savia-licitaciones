import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readdir,readFile} from 'node:fs/promises';import {dirname,join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {backupTables,inspectBackupCoverage} from '../src/backup-coverage.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function database(){const db=new DatabaseSync(':memory:');for(const file of (await readdir(join(root,'migrations'))).filter(item=>item.endsWith('.sql')).sort())db.exec(await readFile(join(root,'migrations',file),'utf8'));return db;}
test('clasifica todas las tablas actuales y todas las columnas de objetos',async()=>{const db=await database();try{assert.deepEqual(inspectBackupCoverage(db),[]);for(const name of ['account','rateLimit','session','verification','runner_pairings','runners'])assert.equal(backupTables[name].disposition,'exclude');assert.equal(backupTables.provider_credentials.disposition,'sensitive');assert.equal(backupTables.user.disposition,'review');for(const name of ['projects','project_technical_plan_nodes','project_files','knowledge_documents','rup_certificates','feasibility_reports'])assert.equal(backupTables[name].disposition,'review');assert.deepEqual(backupTables.project_files.objectColumns,['object_key']);assert.equal(backupTables.rup_reviewed_facts.scope,'certificate');}finally{db.close();}});
test('detecta tablas y referencias de objetos añadidas sin inventariar',async()=>{const db=await database();try{db.exec('CREATE TABLE project_new_feature(id TEXT,project_id TEXT)');db.exec('ALTER TABLE project_files ADD COLUMN extra_object_key TEXT');const issues=inspectBackupCoverage(db);assert.ok(issues.some(item=>item.table==='project_new_feature'&&item.type==='unclassified_table'));assert.ok(issues.some(item=>item.table==='project_files'&&item.type==='unclassified_object_column'&&item.column==='extra_object_key'));}finally{db.close();}});

test('identifica recursos recientes sin considerarlos aprobados para respaldo',()=>{
 for(const name of ['project_feasibility_sources','project_feasibility_extracted_texts','project_feasibility_extracted_images']){
  assert.equal(backupTables[name].scope,'project');
  assert.equal(backupTables[name].disposition,'review');
  assert.deepEqual(backupTables[name].objectColumns,['object_key']);
 }
 assert.equal(backupTables.tenant_members.scope,'tenant');
 assert.equal(backupTables.word_recoveries.scope,'job');
 assert.equal(backupTables.word_recoveries.disposition,'review');
 assert.deepEqual(backupTables.word_recoveries.objectColumns,['object_key']);
});
