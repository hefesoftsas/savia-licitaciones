import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {inspectDesktopBackup} from '../desktop-backup.mjs';
const require=createRequire(new URL('../../client/package.json',import.meta.url));
const {createCompanyArchive}=require('./electron/services/companyBackupArchive.cjs');

test('lee soportes solo para la licitación y requisito vinculados, y acepta respaldos antiguos',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-support-backup-'));
 try{
  const file=join(dir,'workspace.sqlite'),db=new DatabaseSync(file);
  db.exec(`PRAGMA user_version=64;
   CREATE TABLE technical_plan_meta(id INTEGER,outline_project_name TEXT);INSERT INTO technical_plan_meta VALUES(1,'Plan');
   CREATE TABLE technical_plan_outline_nodes(node_id TEXT,parent_node_id TEXT,sort_order INTEGER,title TEXT);
   CREATE TABLE technical_plan_secop_context(id INTEGER,process_id TEXT,portfolio_id TEXT);INSERT INTO technical_plan_secop_context VALUES(1,'tender','');
   CREATE TABLE secop_saved_processes(id TEXT,process_json TEXT,summary TEXT,analysis_json TEXT,imported_json TEXT,official_json TEXT,created_at TEXT,updated_at TEXT);
   CREATE TABLE secop_tender_requirements(id TEXT,process_id TEXT,title TEXT,source TEXT,evidence TEXT,status TEXT,category TEXT,created_at TEXT,updated_at TEXT);
   INSERT INTO secop_tender_requirements VALUES('r','tender','Experiencia','','','pending','experience','2026','2026'),('other-r','other','Otro','','','pending','general','2026','2026');`);
  db.prepare('INSERT INTO secop_saved_processes VALUES (?,?,?,?,?,?,?,?)').run('tender',JSON.stringify({id:'tender',source:'local',title:'Compra'}),'','{}','[]','[]','','');
  const archive=async()=>createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)}]});
  let result=await inspectDesktopBackup(await archive(),{temporaryRoot:dir});
  assert.deepEqual(result.projects[0].requirementSupports,[]);
  db.exec(`CREATE TABLE secop_requirement_supports(id TEXT PRIMARY KEY,process_id TEXT,requirement_id TEXT,title TEXT,status TEXT,certificate_id TEXT,created_at TEXT);
   INSERT INTO secop_requirement_supports VALUES('s','tender','r','Certificado','reviewed','cert-private','2026'),('other','other','other-r','Ajeno','missing','','2026'),('orphan','tender','missing','Sin requisito','pending','','2026');`);
  result=await inspectDesktopBackup(await archive(),{temporaryRoot:dir});
  assert.deepEqual(result.projects[0].requirementSupports,[{id:'s',requirementId:'r',title:'Certificado',status:'reviewed',certificateId:'cert-private',createdAt:'2026'}]);
  assert.equal(result.requirementSupportsOrphanCount,1);
  db.close();
 }finally{await rm(dir,{recursive:true,force:true});}
});
