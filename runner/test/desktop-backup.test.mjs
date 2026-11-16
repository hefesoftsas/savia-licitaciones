import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { serialize } from 'node:v8';
import { createRequire } from 'node:module';
const { inspectDesktopBackup } = await import(process.env.SAVIA_TEST_BACKUP_MODULE || new URL('../desktop-backup.mjs', import.meta.url));
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { createCompanyArchive } = require('./electron/services/companyBackupArchive.cjs');

test('inspecciona seguimiento de escritorio versión 69 y declara datos aún omitidos',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-submission-desktop-'));try{
  const file=join(dir,'source.sqlite'),db=new DatabaseSync(file);db.exec(`PRAGMA user_version=69; CREATE TABLE technical_plan_meta(id INTEGER,outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES(1,'Plan'); CREATE TABLE technical_plan_outline_nodes(node_id TEXT,parent_node_id TEXT,sort_order INTEGER,title TEXT); CREATE TABLE technical_plan_secop_context(id INTEGER,process_id TEXT); INSERT INTO technical_plan_secop_context VALUES(1,'p'); CREATE TABLE secop_submission_records(id TEXT,process_id TEXT,date TEXT,reference TEXT,version TEXT,note TEXT,package_id TEXT,receipt_id TEXT,created_at TEXT); CREATE TABLE secop_submission_files(id TEXT,process_id TEXT,owner_id TEXT,role TEXT,name TEXT,stored_name TEXT,size INTEGER,sha256 TEXT,created_at TEXT); CREATE TABLE secop_submission_requests(id TEXT,process_id TEXT,kind TEXT,title TEXT,due_date TEXT,note TEXT,status TEXT,task_id TEXT,created_at TEXT,updated_at TEXT); INSERT INTO secop_submission_requests VALUES('req','p','correction','Subsanar','','','pending','','2026','2026'); CREATE TABLE secop_submission_results(id TEXT,process_id TEXT,result TEXT,note TEXT,created_at TEXT);`);db.close();
  const offerDb=new DatabaseSync(file);offerDb.exec("CREATE TABLE secop_offer_documents(id TEXT,process_id TEXT,kind TEXT,ref TEXT,name TEXT,created_at TEXT); INSERT INTO secop_offer_documents VALUES('d','p','managed','doc.pdf','Oferta privada','2026'); CREATE TABLE secop_offer_support_files(process_id TEXT,requirement_id TEXT,support_id TEXT,document_id TEXT); CREATE TABLE secop_presentation_files(id TEXT,process_id TEXT,document_id TEXT,sort_order INTEGER,size INTEGER,modified REAL,digest TEXT); CREATE TABLE addendum_impact_runs(id TEXT,process_id TEXT,status TEXT,source_hash TEXT,sources_json TEXT,result_json TEXT,error TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE addendum_impact_reviews(run_id TEXT,impact_id TEXT,status TEXT,note TEXT,updated_at TEXT); INSERT INTO addendum_impact_runs VALUES('run','p','running','hash','{}',NULL,NULL,'2026','2026'); INSERT INTO addendum_impact_reviews VALUES('run','i','pending','nota privada','2026');");offerDb.close();
  const backup=createCompanyArchive({companyName:'Empresa',schemaVersion:69,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)},{path:'workspace/offer-support-files/doc.pdf',bytes:Buffer.from('archivo')}]});const inspected=await inspectDesktopBackup(backup,{temporaryRoot:dir});assert.equal(inspected.schemaVersion,69);assert.equal(inspected.projects[0].submission.requests[0].title,'Subsanar');assert.equal(inspected.projects[0].offerDocuments.documents[0].bytes.toString(),'archivo');assert.ok(inspected.omitted.includes('submission-tracking'));assert.ok(inspected.omitted.includes('addendum-actions'));assert.ok(inspected.omitted.includes('addendum-impact'));assert.equal(inspected.projects[0].addendum.runs[0].status,'interrupted');
  const backupFile=join(dir,'backup.savia');await writeFile(backupFile,backup);const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');const cli=process.env.SAVIA_TEST_RUNNER_CLI||new URL('../cli.mjs',import.meta.url).pathname,output=(await promisify(execFile)(process.execPath,[cli,'inspect-backup','--backup',backupFile])).stdout,summary=JSON.parse(output);assert.equal(summary.projects[0].submissionRequestCount,1);assert.equal(summary.projects[0].missingSubmissionFiles,0);assert.equal(summary.projects[0].offerDocumentCount,1);assert.equal(summary.projects[0].addendumRunCount,1);assert.equal(summary.projects[0].interruptedAddendumRunCount,1);assert.doesNotMatch(output,/Subsanar|Oferta privada|nota privada/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('inspecciona hallazgos de rechazo y recupera documentos e imágenes solo del respaldo',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-rejection-backup-'));
 try{
  const file=join(dir,'source.sqlite'),db=new DatabaseSync(file);
  db.exec(`PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER,outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT,parent_node_id TEXT,sort_order INTEGER,title TEXT);
   CREATE TABLE rejection_check_documents (document_id TEXT,role TEXT,file_name TEXT,markdown_path TEXT,sort_order INTEGER); INSERT INTO rejection_check_documents VALUES ('a','bid','Oferta.docx','rejection-check\\bids\\a.md',0),('b','tender','Pliego.pdf','../externo.md',0);
   CREATE TABLE rejection_check_risk_findings (finding_id TEXT,bid_document_id TEXT,title TEXT,sort_order INTEGER); INSERT INTO rejection_check_risk_findings VALUES ('risk','a','Hallazgo privado',0);`);db.close();
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=','base64');
  const markdown='Texto reservado ![plano](savia-asset://imported-images/rejection-check-bid-a/fig.png)';
  const backup=createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)},{path:'workspace/rejection-check/bids/a.md',bytes:Buffer.from(markdown)},{path:'workspace/imported-images/rejection-check-bid-a/fig.png',bytes:png}]});
  const data=await inspectDesktopBackup(backup,{temporaryRoot:dir});assert.equal(data.rejectionCheck.present,true);assert.equal(data.rejectionCheck.tables.rejection_check_risk_findings[0].title,'Hallazgo privado');assert.equal(data.rejectionCheck.documents[0].bytes.toString(),markdown);assert.equal(data.rejectionCheck.documents[1].reason,'unsafe_path');assert.deepEqual(data.rejectionCheck.assets[0].bytes,png);assert.equal(JSON.stringify(data.rejectionCheck.tables).includes('../externo'),false);
  const backupFile=join(dir,'backup.savia');await writeFile(backupFile,backup);const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');const cli=process.env.SAVIA_TEST_RUNNER_CLI||new URL('../cli.mjs',import.meta.url).pathname;
  const output=(await promisify(execFile)(process.execPath,[cli,'inspect-backup','--backup',backupFile])).stdout;assert.deepEqual(JSON.parse(output).rejectionCheck,{present:true,documentCount:2,missingDocumentCount:1,imageCount:1,missingImageCount:0});assert.equal(output.includes('Hallazgo privado'),false);assert.equal(output.includes('Texto reservado'),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('inspecciona resultados de duplicados y textos respaldados sin leer rutas externas', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-duplicate-backup-'));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file);
  db.exec(`PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT);
   CREATE TABLE duplicate_check_meta (id INTEGER, step TEXT, active_analysis_tab TEXT); INSERT INTO duplicate_check_meta VALUES (1,'analysis','content');
   CREATE TABLE duplicate_check_files (file_id TEXT, role TEXT, file_name TEXT, file_path TEXT, sort_order INTEGER); INSERT INTO duplicate_check_files VALUES ('a','bid','Oferta.docx','/privado/oferta.docx',0),('b','bid','Otra.docx','C:\\privado\\otra.docx',1);
   CREATE TABLE duplicate_check_content_files (file_id TEXT, status TEXT, content_path TEXT); INSERT INTO duplicate_check_content_files VALUES ('a','success','C:\\Savia\\workspace\\duplicate-check\\contents\\a.md'),('b','success','/tmp/ajeno/b.md');
   CREATE TABLE duplicate_check_content_duplicates (duplicate_id TEXT, sentence TEXT, normalized TEXT, file_ids_json TEXT, first_order INTEGER); INSERT INTO duplicate_check_content_duplicates VALUES ('d','Frase privada','frase privada','["a","b"]',0);`); db.close();
  const backup = createCompanyArchive({ companyName:'Empresa', schemaVersion:64, files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)},{path:'workspace/duplicate-check/contents/a.md',bytes:Buffer.from('Texto privado')},{path:'workspace/duplicate-check/contents/b.md',bytes:Buffer.from('No corresponde')}] });
  const result = await inspectDesktopBackup(backup,{temporaryRoot:dir});
  assert.equal(result.duplicateCheck.tables.duplicate_check_content_duplicates[0].sentence,'Frase privada');
  assert.equal(result.duplicateCheck.files[0].original.reason,'outside_backup');
  assert.equal(result.duplicateCheck.files[0].content.bytes.toString(),'Texto privado');
  assert.equal(result.duplicateCheck.files[1].content.reason,'outside_backup');
  assert.equal(JSON.stringify(result.duplicateCheck.tables).includes('/privado/'),false);
  const backupFile=join(dir,'backup.savia'); await writeFile(backupFile,backup);
  const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');
  const cli=process.env.SAVIA_TEST_RUNNER_CLI || new URL('../cli.mjs',import.meta.url).pathname;
  const output=(await promisify(execFile)(process.execPath,[cli,'inspect-backup','--backup',backupFile])).stdout;
  assert.deepEqual(JSON.parse(output).duplicateCheck,{present:true,fileCount:2,missingOriginalCount:2,missingContentCount:1});
  assert.equal(output.includes('Frase privada'),false); assert.equal(output.includes('/privado/'),false);
 } finally { await rm(dir,{recursive:true,force:true}); }
});

test('distingue un texto de duplicados faltante y un respaldo anterior sin revisión', async () => {
 const dir=await mkdtemp(join(tmpdir(),'savia-duplicate-old-'));
 try {
  const file=join(dir,'source.sqlite'),db=new DatabaseSync(file);
  db.exec(`PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER,outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT,parent_node_id TEXT,sort_order INTEGER,title TEXT);`);
  const backup=async()=>createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)}]});
  let result=await inspectDesktopBackup(await backup(),{temporaryRoot:dir}); assert.equal(result.duplicateCheck.present,false); assert.deepEqual(result.duplicateCheck.files,[]);
  db.exec(`CREATE TABLE duplicate_check_files (file_id TEXT, role TEXT, file_name TEXT, file_path TEXT); INSERT INTO duplicate_check_files VALUES ('a','bid','Oferta.docx','/fuera/original.docx'); CREATE TABLE duplicate_check_content_files (file_id TEXT, content_path TEXT); INSERT INTO duplicate_check_content_files VALUES ('a','/perfil/workspace/duplicate-check/contents/a.md');`);
  result=await inspectDesktopBackup(await backup(),{temporaryRoot:dir}); assert.equal(result.duplicateCheck.present,true); assert.equal(result.duplicateCheck.files[0].content.reason,'not_found');
  db.close();
 } finally { await rm(dir,{recursive:true,force:true}); }
});

test('lee el historial por identificador real de proyecto y conserva el orden de mensajes', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-backup-chat-'));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file);
  db.exec(`PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Activo'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT); CREATE TABLE technical_plan_project_active (id INTEGER, project_id TEXT); INSERT INTO technical_plan_project_active VALUES (1,'project-a'); CREATE TABLE technical_plan_projects (id TEXT, snapshot TEXT); INSERT INTO technical_plan_projects VALUES ('old','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); CREATE TABLE tender_chat_messages (id TEXT, project_id TEXT, role TEXT, content TEXT, status TEXT, created_at TEXT, followups_json TEXT); INSERT INTO tender_chat_messages VALUES ('u','project-a','user','Pregunta privada','complete','2026-01-01',NULL),('a','project-a','assistant','Respuesta','complete','2026-01-01','{"questions":["Otra?"],"sourceIds":["doc"]}'),('h','old','assistant','Anterior','running','2026-01-02',NULL),('x','otro','user','Ajeno','complete','2026-01-01',NULL);`); db.close();
  const backup = createCompanyArchive({ companyName:'Empresa', schemaVersion:64, files:[{ path:'workspace/savia.sqlite', bytes:await readFile(file) }, { path:'technical-plan-projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/data.bin', bytes:serialize({ tables:{ technical_plan_meta:[{id:1,outline_project_name:'Anterior'}],technical_plan_outline_nodes:[] } }) }] });
  const result = await inspectDesktopBackup(backup, { temporaryRoot:dir });
  assert.deepEqual(result.projects[0].chatMessages.map(x => x.id), ['u','a']); assert.equal(result.projects[0].chatMessages[1].followupsJson, '{"questions":["Otra?"],"sourceIds":["doc"]}');
  assert.deepEqual(result.projects[1].chatMessages.map(x => x.id), ['h']);
  const old = new DatabaseSync(file); old.exec("DELETE FROM technical_plan_project_active; INSERT INTO tender_chat_messages VALUES ('bad','active','user','No asociar','complete','2026-01-01',NULL)"); old.close();
  const noId = createCompanyArchive({ companyName:'Empresa', schemaVersion:64, files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)}] });
  assert.deepEqual((await inspectDesktopBackup(noId, { temporaryRoot:dir })).projects[0].chatMessages, []);
 } finally { await rm(dir, { recursive:true, force:true }); }
});

test('el CLI informa el conteo y transfiere historial sin imprimir sus mensajes', async () => {
 const { createServer } = await import('node:http'), { execFile } = await import('node:child_process'), { promisify } = await import('node:util'); const execute = promisify(execFile), received = [];
 const dir = await mkdtemp(join(tmpdir(), 'savia-backup-chat-cli-'));
 const server = createServer(async (req, res) => { let body = ''; for await (const chunk of req) body += chunk; received.push({ path:req.url, body:JSON.parse(body) }); res.writeHead(201, { 'content-type':'application/json' }); res.end(JSON.stringify({ project:{id:'web-project',title:'Activo'} })); });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 try {
  const file = join(dir,'db'), db = new DatabaseSync(file);
  db.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Activo'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT); CREATE TABLE technical_plan_project_active (id INTEGER, project_id TEXT); INSERT INTO technical_plan_project_active VALUES (1,'proyecto'); CREATE TABLE tender_chat_messages (id TEXT, project_id TEXT, role TEXT, content TEXT, status TEXT, created_at TEXT); INSERT INTO tender_chat_messages VALUES ('u','proyecto','user','Mensaje secreto','complete','2026-01-01');"); db.close();
  const backup=join(dir,'backup.savia'); await writeFile(backup,createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)}]}));
  const config=join(dir,'runner.json'); await writeFile(config,JSON.stringify({server:`http://127.0.0.1:${server.address().port}`,token:'token-fixture',runnerId:'runner'}));
  const cli=process.env.SAVIA_TEST_RUNNER_CLI || new URL('../cli.mjs', import.meta.url).pathname;
  const inspect=(await execute(process.execPath,[cli,'inspect-backup','--backup',backup])).stdout; assert.equal(JSON.parse(inspect).projects[0].chatMessageCount,1); assert.equal(inspect.includes('Mensaje secreto'),false);
  const result=(await execute(process.execPath,[cli,'import-plan','--backup',backup,'--project','proyecto','--config',config])).stdout;
  assert.equal(JSON.parse(result).importedChatMessages,1); assert.equal(result.includes('Mensaje secreto'),false); assert.equal(received.find(x=>x.path.endsWith('/chat')).body.messages[0].content,'Mensaje secreto');
 } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); await rm(dir,{recursive:true,force:true}); }
});

test('solo vincula SECOP con identidad y portafolio demostrables', async () => {
 const dir=await mkdtemp(join(tmpdir(),'savia-secop-link-'));try{
  const file=join(dir,'source.sqlite'),db=new DatabaseSync(file);db.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER,outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT,parent_node_id TEXT,sort_order INTEGER,title TEXT); CREATE TABLE secop_saved_processes (id TEXT,process_json TEXT); CREATE TABLE technical_plan_secop_context (id INTEGER,process_id TEXT,portfolio_id TEXT);");
  db.prepare('INSERT INTO secop_saved_processes VALUES (?,?)').run('active',JSON.stringify({id:'active',source:'secop-ii',portfolioId:'CO1.BDOS.1'}));db.close();
  const backup=async()=>createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)}]});
  let project=(await inspectDesktopBackup(await backup(),{temporaryRoot:dir})).projects[0];assert.equal(project.secop,null);assert.equal(project.secopIssue,null);
  const edit=new DatabaseSync(file);edit.prepare('INSERT INTO technical_plan_secop_context VALUES (1,?,?)').run('active','CO1.BDOS.2');edit.close();project=(await inspectDesktopBackup(await backup(),{temporaryRoot:dir})).projects[0];assert.equal(project.secop,null);assert.equal(project.secopIssue,'portfolio_mismatch');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('no supone que una licitación está desvinculada si falta una instantánea', async () => {
 const dir=await mkdtemp(join(tmpdir(),'savia-saved-ambiguous-'));try{
  const file=join(dir,'source.sqlite'),db=new DatabaseSync(file);db.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER,outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT,parent_node_id TEXT,sort_order INTEGER,title TEXT); CREATE TABLE technical_plan_projects (id TEXT,snapshot TEXT); INSERT INTO technical_plan_projects VALUES ('inactivo',NULL); CREATE TABLE secop_saved_processes (id TEXT,process_json TEXT,summary TEXT,analysis_json TEXT,imported_json TEXT,official_json TEXT,created_at TEXT,updated_at TEXT);");db.prepare('INSERT INTO secop_saved_processes VALUES (?,?,?,?,?,?,?,?)').run('p',JSON.stringify({id:'p',source:'secop-i',title:'Compra'}),'','{}','[]','[]','2026','2026');db.close();
  const backup=createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)}]});const result=await inspectDesktopBackup(backup,{temporaryRoot:dir});assert.equal(result.unavailable.length,1);assert.equal(result.savedTenders[0].association,'ambiguous');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('lee la biblioteca con originales y entradas, sin salir del respaldo', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-backup-knowledge-'));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file);
  db.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT); CREATE TABLE knowledge_folders (folder_id TEXT, name TEXT, sort_order INTEGER, created_at TEXT); INSERT INTO knowledge_folders VALUES ('f2','Segunda',1,'2026-01-01'),('f1','Primera',0,'2026-01-01'); CREATE TABLE knowledge_documents (document_id TEXT, folder_id TEXT, file_name TEXT, source_path TEXT, sort_order INTEGER, created_at TEXT); INSERT INTO knowledge_documents VALUES ('d1','f1','Oferta ñ.docx','folders\\f1\\documents\\d1\\source.docx',0,'2026-01-01'),('d2','f1','Ausente.pdf','folders/f1/documents/d2/source.pdf',1,'2026-01-02'),('d3','f2','Externo.txt','../secreto.txt',0,'2026-01-03'); CREATE TABLE knowledge_items (document_id TEXT, item_id TEXT, title TEXT, resume TEXT, content TEXT, source_file TEXT, sort_order INTEGER); INSERT INTO knowledge_items VALUES ('d1','i1','Título','Resumen','Contenido histórico','Origen',0);"); db.close();
  const original = Buffer.from('original privado'); const backup = createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes: await readFile(file) }, { path: 'workspace/knowledge-base/folders/f1/documents/d1/source.docx', bytes: original }] });
  const result = await inspectDesktopBackup(backup, { temporaryRoot: dir }), library = result.knowledge;
  assert.deepEqual(library.folders.map(folder => folder.name), ['Primera', 'Segunda']);
  assert.deepEqual(library.folders[0].documents[0].bytes, original); assert.equal(library.folders[0].documents[0].items[0].content, 'Contenido histórico');
  assert.equal(library.folders[0].documents[1].reason, 'not_found'); assert.equal(library.folders[1].documents[0].reason, 'unsafe_path');
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('lee comparaciones del proceso con sus fuentes históricas y señala PDF ausentes', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-backup-comparisons-'));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file);
  db.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT); CREATE TABLE technical_plan_secop_context (id INTEGER, process_id TEXT); INSERT INTO technical_plan_secop_context VALUES (1,'proceso-a'); CREATE TABLE rup_requirement_comparisons (requirement_id TEXT, process_id TEXT, fact_id TEXT, certificate_stored_name TEXT, certificate_name TEXT, certificate_issued_on TEXT, fact_label TEXT, fact_value TEXT, fact_page INTEGER, requirement_title TEXT, requirement_source TEXT, operator TEXT, threshold TEXT, updated_at TEXT, imported_hash TEXT, interpreted_value TEXT); INSERT INTO rup_requirement_comparisons VALUES ('r1','proceso-a','f1','old.pdf','RUP anterior.pdf','2025-01-01','Liquidez','1,5',1,'Requisito','Página 2','gte','1','2026-01-01','hash','1.5'),('r2','proceso-a','f2','missing.pdf','RUP ausente.pdf','','Patrimonio','10',2,'Otro','Página 3','gte','5','2026-01-02','',''),('r3','ajeno','f3','old.pdf','Ajeno','','No incluir','1',1,'Ajeno','P1','gte','1','2026-01-01','','');"); db.close();
  const pdf = Buffer.from('%PDF-historico');
  const backup = createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes: await readFile(file) }, { path: 'workspace/credential-library/rup/old.pdf', bytes: pdf }] });
  const result = await inspectDesktopBackup(backup, { temporaryRoot: dir }), comparisons = result.projects[0].comparisons;
  assert.equal(comparisons.length, 2); assert.equal(comparisons[0].requirementId, 'r1'); assert.equal(comparisons[0].factId, 'f1'); assert.equal(comparisons[0].interpretedValue, '1.5'); assert.deepEqual(comparisons[0].certificate.bytes, pdf);
  assert.equal(comparisons[1].certificate.missing, true); assert.equal(comparisons[1].certificate.reason, 'not_found');
  const { execFile } = await import('node:child_process'), { promisify } = await import('node:util');
  const backupFile = join(dir, 'empresa.savia'); await writeFile(backupFile, backup);
  const cli = process.env.SAVIA_TEST_RUNNER_CLI || new URL('../cli.mjs', import.meta.url).pathname;
  const inspected = (await promisify(execFile)(process.execPath, [cli, 'inspect-backup', '--backup', backupFile])).stdout;
  assert.equal(inspected.includes('Liquidez'), false); assert.equal(inspected.includes('RUP anterior.pdf'), false); assert.equal(JSON.parse(inspected).projects[0].comparisonCount, 2); assert.equal(JSON.parse(inspected).projects[0].missingComparisonSources, 1);
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('lee solo los datos revisados del RUP actual y detecta si falta el PDF', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-backup-rup-'));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file);
  db.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1, 'Activo'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT); CREATE TABLE rup_certificate (id INTEGER, file_name TEXT, stored_name TEXT, imported_at TEXT, issued_on TEXT); INSERT INTO rup_certificate VALUES (1,'RUP empresa.pdf','actual.pdf','2026-01-01','2025-12-31'); CREATE TABLE rup_reviewed_facts (id TEXT, certificate_name TEXT, label TEXT, value TEXT, page INTEGER); INSERT INTO rup_reviewed_facts VALUES ('actual','actual.pdf','Liquidez','1,5',1), ('otro','anterior.pdf','Histórico','9',1);"); db.close();
  const database = await readFile(file), pdf = Buffer.from('%PDF-test');
  const make = files => createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes: database }, ...files] });
  const result = await inspectDesktopBackup(make([{ path: 'workspace/credential-library/rup/actual.pdf', bytes: pdf }]), { temporaryRoot: dir });
  assert.equal(result.rup.name, 'RUP empresa.pdf'); assert.deepEqual(result.rup.bytes, pdf); assert.deepEqual(result.rup.facts.map(item => item.id), ['actual']); assert.equal(result.rup.issuedOn, '2025-12-31');
  assert.equal((await inspectDesktopBackup(make([]), { temporaryRoot: dir })).rup.missing, true);
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('asocia el seguimiento de cada proceso al plan correcto, incluso en instantáneas', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-backup-workflow-'));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file);
  db.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1, 'Activo'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT); CREATE TABLE technical_plan_project_active (id INTEGER, project_id TEXT); INSERT INTO technical_plan_project_active VALUES (1, 'local-project'); CREATE TABLE technical_plan_secop_context (id INTEGER, process_id TEXT); INSERT INTO technical_plan_secop_context VALUES (1, 'process-a'); CREATE TABLE technical_plan_projects (id TEXT, snapshot TEXT); INSERT INTO technical_plan_projects VALUES ('local-project', NULL), ('historic', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); CREATE TABLE secop_tender_workflow (process_id TEXT, work_stage TEXT, updated_at TEXT); INSERT INTO secop_tender_workflow VALUES ('process-a','preparing','2026-01-02T00:00:00Z'), ('historic-process','submitted','2026-01-03T00:00:00Z'); CREATE TABLE secop_tender_tasks (id TEXT, process_id TEXT, title TEXT, due_date TEXT, completed INTEGER, created_at TEXT, updated_at TEXT); INSERT INTO secop_tender_tasks VALUES ('task-a','process-a','Firmar','2026-02-01',1,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z'), ('task-b','historic-process','Revisar','',0,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z'), ('task-other','otro','No incluir','',0,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z'); CREATE TABLE secop_tender_requirements (id TEXT, process_id TEXT, title TEXT, source TEXT, evidence TEXT, status TEXT, category TEXT, created_at TEXT, updated_at TEXT); INSERT INTO secop_tender_requirements VALUES ('req-a','process-a','Garantía','Pliego','Anexo','meets','legal','2026-01-01T00:00:00Z','2026-01-02T00:00:00Z');"); db.close();
  const edit = new DatabaseSync(file); edit.exec('CREATE TABLE economic_offer_drafts (process_id TEXT, draft_json TEXT, updated_at TEXT)');
  const insertOffer = edit.prepare('INSERT INTO economic_offer_drafts VALUES (?, ?, ?)');
  insertOffer.run('process-a', JSON.stringify({ budget: '', items: [{ id: 'a', name: '', quantity: '', price: '', rate: '0', cost: '' }] }), '2026-01-04');
  insertOffer.run('historic-process', JSON.stringify({ currency: 'COP', budget: '100', items: [] }), '2026-01-05'); edit.close();
  const archive = createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes: await readFile(file) }, { path: 'technical-plan-projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/data.bin', bytes: serialize({ tables: { technical_plan_meta: [{ id: 1, outline_project_name: 'Anterior' }], technical_plan_outline_nodes: [], technical_plan_secop_context: [{ id: 1, process_id: 'historic-process' }] } }) }] });
  const result = await inspectDesktopBackup(archive, { temporaryRoot: dir }), active = result.projects.find(x => x.active), historic = result.projects.find(x => !x.active);
  assert.equal(active.workflow.stage, 'preparing'); assert.equal(active.workflow.tasks.length, 1); assert.equal(active.workflow.tasks[0].completed, true); assert.equal(active.workflow.requirements[0].evidence, 'Anexo'); assert.equal(active.workflow.requirements[0].status, 'meets');
  assert.equal(historic.workflow.stage, 'submitted'); assert.deepEqual(historic.workflow.tasks.map(x => x.id), ['task-b']); assert.equal(historic.workflow.requirements.length, 0);
  assert.equal(active.economicOffer.draft.items[0].name, ''); assert.equal(active.economicOffer.updatedAt, '2026-01-04'); assert.equal(historic.economicOffer.draft.currency, 'COP');
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('no asocia el identificador sintético active con un proceso sin vínculo', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-backup-unknown-process-'));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file);
  db.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1, 'Activo'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT); CREATE TABLE secop_tender_workflow (process_id TEXT, work_stage TEXT, updated_at TEXT); INSERT INTO secop_tender_workflow VALUES ('active', 'submitted', '2026-01-01'); CREATE TABLE economic_offer_drafts (process_id TEXT, draft_json TEXT, updated_at TEXT); INSERT INTO economic_offer_drafts VALUES ('active', '{}', '2026-01-01');"); db.close();
  const archive = createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes: await readFile(file) }] });
  const project = (await inspectDesktopBackup(archive, { temporaryRoot: dir })).projects[0]; assert.equal(project.workflow, null); assert.equal(project.economicOffer, null);
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('identifica imágenes de capítulos en el proyecto activo y en instantáneas sin leer rutas externas', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-backup-images-'));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file);
  db.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1, 'Activo'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT, content TEXT); CREATE TABLE technical_plan_projects (id TEXT, snapshot TEXT); INSERT INTO technical_plan_projects VALUES ('inactive', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');");
  const activeContent = '![Plano](savia-asset://imported-images/technical-plan-123/plano%20%C3%B1.png)\n![Repetida](savia-asset://imported-images/technical-plan-123/plano%20%C3%B1.png)\n![Falta](savia-asset://generated-images/technical-plan/ausente.png)\n![Externa](https://example.org/remota.png)\n<img data-sv-asset-ref="figuras/diagrama.png">\n<img data-sv-asset-ref="../secreto.png">';
  db.prepare('INSERT INTO technical_plan_outline_nodes VALUES (?, NULL, 0, ?, ?)').run('a', 'Capítulo', activeContent); db.close();
  const snapshot = serialize({ tables: { technical_plan_meta: [{ id: 1, outline_project_name: 'Anterior' }], technical_plan_outline_nodes: [{ node_id: 'old', parent_node_id: null, sort_order: 0, title: 'Viejo', content: '![Gráfico](savia-asset://generated-images/technical-plan/g.png)' }] } });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=', 'base64');
  const archive = createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes: await readFile(file) }, { path: 'workspace/imported-images/technical-plan-123/plano ñ.png', bytes: png }, { path: 'agent-runtime/pi/tasks/technical-plan-content-generation/workspace/figuras/diagrama.png', bytes: png }, { path: 'technical-plan-projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/data.bin', bytes: snapshot }, { path: 'technical-plan-projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/generated/g.png', bytes: png }] });
  const result = await inspectDesktopBackup(archive, { temporaryRoot: dir }), active = result.projects.find(p => p.active), inactive = result.projects.find(p => !p.active);
  assert.equal(active.assets.length, 2); assert.ok(active.assets.every(asset => asset.bytes.equals(png))); assert.equal(active.missingAssets.length, 3); assert.ok(active.missingAssets.some(item => item.reason === 'unsafe_path')); assert.ok(active.missingAssets.some(item => item.reason === 'outside_backup')); assert.ok(active.missingAssets.some(item => item.reason === 'not_found')); assert.equal(active.nodes[0].content, activeContent);
  assert.equal(inactive.assets.length, 1); assert.deepEqual(inactive.assets[0].bytes, png);
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el runner transfiere imágenes detectadas y declara las que faltan', async () => {
 const { createServer } = await import('node:http'), { execFile } = await import('node:child_process'), { promisify } = await import('node:util'); const execute = promisify(execFile);
 const dir = await mkdtemp(join(tmpdir(), 'savia-import-images-')); const uploads = [];
 const server = createServer(async (req, res) => { const chunks = []; for await (const chunk of req) chunks.push(chunk); const data = Buffer.concat(chunks); if (req.url.includes('/assets/')) uploads.push({ path: req.url, data, kind: req.headers['x-asset-kind'], reference: decodeURIComponent(req.headers['x-asset-reference']) }); res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ project: { id: 'web-project', title: 'Activo' }, asset: { id: 'asset' } })); });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file); db.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1, 'Activo'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT, content TEXT);");
  db.prepare('INSERT INTO technical_plan_outline_nodes VALUES (?, NULL, 0, ?, ?)').run('n', 'Capítulo', '![Plano](savia-asset://imported-images/technical-plan-a/plano.png)\n![Falta](savia-asset://imported-images/technical-plan-a/falta.png)\n![Externa](https://example.org/a.png?token=fixture-secret)'); db.close();
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=', 'base64'), backup = join(dir, 'empresa.savia');
  await writeFile(backup, createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes: await readFile(file) }, { path: 'workspace/imported-images/technical-plan-a/plano.png', bytes: image }] }));
  const config = join(dir, 'runner.json'); await writeFile(config, JSON.stringify({ server: `http://127.0.0.1:${server.address().port}`, token: 'token-fixture', runnerId: 'runner' }));
  const cli = process.env.SAVIA_TEST_RUNNER_CLI || new URL('../cli.mjs', import.meta.url).pathname, args = [cli, 'import-plan', '--backup', backup, '--project', 'active', '--config', config];
  const firstOutput = (await execute(process.execPath, args)).stdout, first = JSON.parse(firstOutput), second = JSON.parse((await execute(process.execPath, args)).stdout);
  assert.equal(first.importedAssets, 1); assert.equal(first.missingAssets.length, 2); assert.equal(firstOutput.includes('fixture-secret'), false); assert.equal(second.importedAssets, 1); assert.equal(uploads.length, 2); assert.equal(uploads[0].path, uploads[1].path); assert.equal(uploads[0].kind, 'url'); assert.match(uploads[0].reference, /plano\.png$/); assert.deepEqual(uploads[0].data, image);
 } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('informa imágenes cuyo formato no se puede importar sin interrumpir el resto', async () => {
 const { extractDesktopAssets } = await import('../desktop-assets.mjs');
 const reference = 'savia-asset://imported-images/technical-plan-a/vector.svg';
 const result = extractDesktopAssets([{ content: `![Vector](${reference})` }], new Map([['workspace/imported-images/technical-plan-a/vector.svg', Buffer.from('<svg/>')]]));
 assert.equal(result.assets.length, 0); assert.deepEqual(result.missingAssets, [{ kind: 'url', reference, reason: 'unsupported_format' }]);
});

test('conserva todos los análisis de los proyectos activo e inactivo al inspeccionar el respaldo', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-backup-analysis-'));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file);
  db.exec("PRAGMA user_version = 64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT, outline_project_overview TEXT); INSERT INTO technical_plan_meta VALUES (1, 'Activo', 'Resumen anterior'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT); CREATE TABLE technical_plan_bid_items (item_id TEXT, label TEXT, status TEXT, content TEXT, error TEXT, sort_order INTEGER); INSERT INTO technical_plan_bid_items VALUES ('other', 'Análisis adicional', 'error', 'Borrador ñ', 'Interrumpido', 2), ('projectOverview', 'Resumen', 'success', 'Datos originales', NULL, 0); CREATE TABLE technical_plan_projects (id TEXT, snapshot TEXT); INSERT INTO technical_plan_projects VALUES ('inactive', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');"); db.close();
  const archive = createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes: await readFile(file) }, { path: 'technical-plan-projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/data.bin', bytes: serialize({ tables: { technical_plan_meta: [{ id: 1, outline_project_name: 'Anterior' }], technical_plan_outline_nodes: [], technical_plan_bid_items: [{ item_id: 'techRequirements', label: 'Técnico', status: 'success', content: 'Criterios', error: null, sort_order: 0 }] } }) }] });
  const result = await inspectDesktopBackup(archive, { temporaryRoot: dir });
  assert.deepEqual(result.projects.find(x => x.active).analyses.map(x => x.id), ['projectOverview', 'other', 'legacy-project-overview']);
  assert.equal(result.projects.find(x => x.active).analyses[1].content, 'Borrador ñ'); assert.equal(result.projects.find(x => x.active).analyses[1].error, 'Interrumpido');
  assert.equal(result.projects.find(x => !x.active).analyses[0].content, 'Criterios');
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('lee hechos globales ordenados del proyecto activo y de una instantánea', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-backup-facts-'));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file);
  db.exec("PRAGMA user_version = 64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1, 'Activo'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT); CREATE TABLE technical_plan_global_fact_groups (group_id TEXT, title TEXT, content TEXT, sort_order INTEGER); INSERT INTO technical_plan_global_fact_groups VALUES ('b', 'Segundo', '', 1), ('a', 'Primero', 'Dato ñ', 0); CREATE TABLE technical_plan_projects (id TEXT, snapshot TEXT); INSERT INTO technical_plan_projects VALUES ('inactive', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');"); db.close();
  const archive = createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes: await readFile(file) }, { path: 'technical-plan-projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/data.bin', bytes: serialize({ tables: { technical_plan_meta: [{ id: 1, outline_project_name: 'Anterior' }], technical_plan_outline_nodes: [], technical_plan_global_fact_groups: [{ group_id: 'old', title: 'Hecho previo', content: 'Texto', sort_order: 0 }] } }) }] });
  const result = await inspectDesktopBackup(archive, { temporaryRoot: dir });
  assert.deepEqual(result.projects.find(x => x.active).facts, [{ id: 'a', title: 'Primero', content: 'Dato ñ' }, { id: 'b', title: 'Segundo', content: '' }]);
  assert.deepEqual(result.projects.find(x => !x.active).facts, [{ id: 'old', title: 'Hecho previo', content: 'Texto' }]);
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('inspecciona planes activos e inactivos de un respaldo real sin alterar el original', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-backup-inspect-'));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file);
  db.exec(`PRAGMA user_version = 64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1, 'Activo'); CREATE TABLE technical_plan_project_active (id INTEGER, project_id TEXT); INSERT INTO technical_plan_project_active VALUES (1, 'active'); CREATE TABLE technical_plan_projects (id TEXT, snapshot TEXT); INSERT INTO technical_plan_projects VALUES ('active', NULL), ('inactive', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT, description TEXT, content_mode TEXT, content TEXT); INSERT INTO technical_plan_outline_nodes VALUES ('n1', NULL, 0, 'Capítulo', '', 'ai-generate', 'Texto con ñ'), ('n2', 'n1', 0, 'Hijo', 'Detalle', 'manual-fill', 'Texto hijo');`); db.close();
  const bytes = await readFile(file), archive = createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes }, { path: 'technical-plan-projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/data.bin', bytes: serialize({ tables: { technical_plan_meta: [{ id: 1, outline_project_name: 'Histórico' }], technical_plan_outline_nodes: [{ node_id: 'old', parent_node_id: null, sort_order: 0, title: 'Anterior', description: '', content: 'Contenido', content_mode: null }] } }) }] });
  const result = await inspectDesktopBackup(archive, { temporaryRoot: dir });
  assert.equal(result.companyName, 'Empresa'); assert.equal(result.projects.length, 2); assert.equal(result.projects.find(x => x.sourceId === 'active').nodes[1].parentId, 'n1'); assert.equal(result.projects.find(x => x.sourceId === 'active').nodes[0].content, 'Texto con ñ'); assert.equal(result.projects.find(x => x.sourceId === 'inactive').title, 'Histórico');
  assert.deepEqual(await readFile(file), bytes); assert.deepEqual((await readdir(dir)).sort(), ['source.sqlite']);
  await assert.rejects(inspectDesktopBackup(Buffer.from('archivo roto'), { temporaryRoot: dir }), /respaldo/i);
  const wrongOwner = createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes }, { path: 'technical-plan-projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/data.bin', bytes: serialize({ tables: { technical_plan_meta: [], technical_plan_outline_nodes: [] } }) }, { path: 'technical-plan-projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/owner.txt', bytes: Buffer.from('otra-empresa') }] });
  await assert.rejects(inspectDesktopBackup(wrongOwner, { temporaryRoot: dir }), /propietario|pertenece/i);

 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el CLI inspecciona e importa el plan elegido con un identificador idempotente', async () => {
 const { createServer } = await import('node:http'); const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util'); const { writeFile } = await import('node:fs/promises'); const execute = promisify(execFile);
 const dir = await mkdtemp(join(tmpdir(), 'savia-import-cli-')); let received = [];
 const server = createServer(async (req, res) => { let body = ''; for await (const chunk of req) body += chunk; received.push({ path: req.url, key: req.headers['idempotency-key'], auth: req.headers.authorization, body: JSON.parse(body) }); res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ project: { id: 'web-project', title: 'Activo' } })); });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file); db.exec("PRAGMA user_version = 64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1, 'Activo'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT, description TEXT, content_mode TEXT, content TEXT); INSERT INTO technical_plan_outline_nodes VALUES ('n1', NULL, 0, 'Capítulo', '', 'manual-fill', 'Contenido'); CREATE TABLE technical_plan_global_fact_groups (group_id TEXT, title TEXT, content TEXT, sort_order INTEGER); INSERT INTO technical_plan_global_fact_groups VALUES ('fact-1', 'Dato', 'Secreto empresarial', 0); CREATE TABLE technical_plan_bid_items (item_id TEXT, label TEXT, status TEXT, content TEXT, error TEXT, sort_order INTEGER); INSERT INTO technical_plan_bid_items VALUES ('projectOverview', 'Resumen', 'success', 'Análisis privado', NULL, 0);"); db.close();
  const backup = join(dir, 'empresa.savia'), archive = createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes: await readFile(file) }] }); await writeFile(backup, archive);
  const config = join(dir, 'runner.json'); await writeFile(config, JSON.stringify({ server: `http://127.0.0.1:${server.address().port}`, token: 'token-fixture', runnerId: 'runner' }));
  const cli = process.env.SAVIA_TEST_RUNNER_CLI || new URL('../cli.mjs', import.meta.url).pathname;
  const preview = await execute(process.execPath, [cli, 'inspect-backup', '--backup', backup]); const parsed = JSON.parse(preview.stdout); assert.equal(parsed.projects[0].sourceId, 'active'); assert.equal(parsed.projects[0].nodeCount, 1); assert.equal(parsed.projects[0].factGroupCount, 1); assert.equal(parsed.projects[0].analysisCount, 1); assert.equal(preview.stdout.includes('Contenido'), false); assert.equal(preview.stdout.includes('Secreto empresarial'), false); assert.equal(preview.stdout.includes('Análisis privado'), false);
  const args = [cli, 'import-plan', '--backup', backup, '--project', 'active', '--config', config];
  const first = await execute(process.execPath, args), second = await execute(process.execPath, args); assert.equal(JSON.parse(first.stdout).project.id, 'web-project'); assert.equal(JSON.parse(second.stdout).project.id, 'web-project'); assert.equal(received.length, 6); assert.equal(received[0].key, received[3].key); assert.equal(received[0].body.nodes[0].content, 'Contenido'); assert.equal(received[0].auth, 'Bearer token-fixture'); assert.match(received[1].path, /\/facts$/); assert.equal(received[1].body.groups[0].content, 'Secreto empresarial'); assert.match(received[2].path, /\/analyses$/); assert.equal(received[2].body.analyses[0].content, 'Análisis privado'); assert.equal(JSON.parse(first.stdout).importedAnalyses, 1); assert.deepEqual(await readFile(backup), archive);
 } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('localiza originales en el proyecto activo e inactivo y declara rutas ausentes o externas', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'savia-backup-documents-'));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file);
  db.exec("PRAGMA user_version = 64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT, tender_files_json TEXT); CREATE TABLE technical_plan_project_active (id INTEGER, project_id TEXT); INSERT INTO technical_plan_project_active VALUES (1, 'active'); CREATE TABLE technical_plan_projects (id TEXT, snapshot TEXT); INSERT INTO technical_plan_projects VALUES ('inactive', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT, description TEXT, content_mode TEXT, content TEXT);");
  db.prepare('INSERT INTO technical_plan_meta VALUES (1, ?, ?)').run('Activo', JSON.stringify([{ id: 'a', fileName: ' Pliego ñ.pdf ', sourceOriginalPath: 'technical-plan\\tender-originals\\a.pdf' }, { id: 'missing', fileName: 'Ausente.pdf', sourceOriginalPath: 'technical-plan/tender-originals/missing.pdf' }, { id: 'external', fileName: 'Externo.pdf', sourceOriginalPath: '/tmp/external.pdf' }])); db.close();
  const snapshot = serialize({ tables: { technical_plan_meta: [{ id: 1, outline_project_name: 'Anterior', tender_files_json: JSON.stringify([{ id: 'b', fileName: 'Anterior.txt', sourceOriginalPath: 'technical-plan/tender-originals/b.txt' }]) }], technical_plan_outline_nodes: [] } });
  const archive = createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes: await readFile(file) }, { path: 'workspace/technical-plan/tender-originals/a.pdf', bytes: Buffer.from('%PDF original') }, { path: 'technical-plan-projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/data.bin', bytes: snapshot }, { path: 'technical-plan-projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/plan/tender-originals/b.txt', bytes: Buffer.from('Documento anterior') }] });
  const result = await inspectDesktopBackup(archive, { temporaryRoot: dir }), active = result.projects.find(project => project.sourceId === 'active'), inactive = result.projects.find(project => project.sourceId === 'inactive');
  assert.equal(active.documents.length, 1); assert.equal(active.documents[0].name, ' Pliego ñ.pdf '); assert.equal(active.documents[0].bytes.toString(), '%PDF original'); assert.equal(active.missingDocuments.length, 2);
  assert.equal(inactive.documents.length, 1); assert.equal(inactive.documents[0].bytes.toString(), 'Documento anterior');
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('conserva originales de más de 25 y 50 MiB que caben en el respaldo',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-backup-large-'));try{
  const file=join(dir,'source.sqlite'),db=new DatabaseSync(file);db.exec("PRAGMA user_version = 64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT, tender_files_json TEXT); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT);");
  db.prepare('INSERT INTO technical_plan_meta VALUES (1, ?, ?)').run('Activo',JSON.stringify([{id:'medium',fileName:'medio.pdf',sourceOriginalPath:'technical-plan/tender-originals/medio.pdf'},{id:'large',fileName:'grande.pdf',sourceOriginalPath:'technical-plan/tender-originals/grande.pdf'}]));db.close();
  const medium=Buffer.alloc(25*1024*1024+1,1),large=Buffer.alloc(50*1024*1024+1,2),archive=createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)},{path:'workspace/technical-plan/tender-originals/medio.pdf',bytes:medium},{path:'workspace/technical-plan/tender-originals/grande.pdf',bytes:large}]});
  const project=(await inspectDesktopBackup(archive,{temporaryRoot:dir})).projects.find(item=>item.active);assert.deepEqual(project.documents.map(item=>item.bytes.length),[medium.length,large.length]);assert.deepEqual(project.missingDocuments,[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('la importación parcial indica el proyecto y permite reintentar los originales', async () => {
 const { createServer } = await import('node:http'); const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util'); const { writeFile } = await import('node:fs/promises'); const execute = promisify(execFile);
 const dir = await mkdtemp(join(tmpdir(), 'savia-import-retry-')); let uploads = 0, firstFailure = true;
 const server = createServer(async (req, res) => { const chunks = []; for await (const chunk of req) chunks.push(chunk); if (req.url.endsWith('/technical-plan')) { res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ project: { id: 'web-project', title: 'Activo' } })); return; } uploads++; if (uploads === 2 && firstFailure) { firstFailure = false; res.writeHead(500); res.end(); return; } res.writeHead(201, { 'content-type': 'application/json' }); res.end('{}'); });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 try {
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file); db.exec("PRAGMA user_version = 64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT, tender_files_json TEXT); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT, description TEXT, content_mode TEXT, content TEXT);");
  db.prepare('INSERT INTO technical_plan_meta VALUES (1, ?, ?)').run('Activo', JSON.stringify([{ id: 'a', fileName: 'a.pdf', sourceOriginalPath: 'technical-plan/tender-originals/a.pdf' }, { id: 'b', fileName: 'b.pdf', sourceOriginalPath: 'technical-plan/tender-originals/b.pdf' }])); db.close();
  const archive = createCompanyArchive({ companyName: 'Empresa', schemaVersion: 64, files: [{ path: 'workspace/savia.sqlite', bytes: await readFile(file) }, { path: 'workspace/technical-plan/tender-originals/a.pdf', bytes: Buffer.from('A') }, { path: 'workspace/technical-plan/tender-originals/b.pdf', bytes: Buffer.from('B') }] }), backup = join(dir, 'backup.savia'); await writeFile(backup, archive);
  const config = join(dir, 'runner.json'); await writeFile(config, JSON.stringify({ server: `http://127.0.0.1:${server.address().port}`, token: 'fixture', runnerId: 'runner' }));
  const cli = process.env.SAVIA_TEST_RUNNER_CLI || new URL('../cli.mjs', import.meta.url).pathname, args = [cli, 'import-plan', '--backup', backup, '--project', 'active', '--config', config];
  await assert.rejects(execute(process.execPath, args), error => /web-project/.test(error.stderr) && /1 de 2/.test(error.stderr) && /Repite/.test(error.stderr));
  const result = JSON.parse((await execute(process.execPath, args)).stdout); assert.equal(result.importedDocuments, 2); assert.equal(uploads, 4); assert.deepEqual(await readFile(backup), archive);
 } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('el runner solicita limpieza de importaciones para su cuenta sin mostrar credenciales', async () => {
 const { createServer } = await import('node:http'), { execFile } = await import('node:child_process'), { promisify } = await import('node:util'), { writeFile } = await import('node:fs/promises');
 const dir = await mkdtemp(join(tmpdir(), 'savia-cleanup-cli-')); let path, authorization;
 const server = createServer(async (req, res) => { path = req.url; authorization = req.headers.authorization; for await (const _chunk of req) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ removed: 2, failed: 0, retained: 0, pending: 1 })); });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 try {
  const config = join(dir, 'runner.json'); await writeFile(config, JSON.stringify({ server: `http://127.0.0.1:${server.address().port}`, token: 'fixture-secret', runnerId: 'runner' }));
  const cli = process.env.SAVIA_TEST_RUNNER_CLI || new URL('../cli.mjs', import.meta.url).pathname;
  const result = await promisify(execFile)(process.execPath, [cli, 'cleanup-imports', '--config', config]);
  assert.equal(path, '/api/runner/imports/cleanup'); assert.equal(authorization, 'Bearer fixture-secret'); assert.equal(JSON.parse(result.stdout).removed, 2); assert.equal(result.stdout.includes('fixture-secret'), false);
 } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('extrae evaluaciones y originales por proyecto sin asociar datos ajenos',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-backup-evaluation-'));
 try{
  const file=join(dir,'source.sqlite'),db=new DatabaseSync(file);
  db.exec(`PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER,outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT,parent_node_id TEXT,sort_order INTEGER,title TEXT); CREATE TABLE technical_plan_project_active (id INTEGER,project_id TEXT); INSERT INTO technical_plan_project_active VALUES (1,'p1');
  CREATE TABLE bid_evaluation_documents (id TEXT,project_id TEXT,name TEXT,text TEXT,created_at TEXT); INSERT INTO bid_evaluation_documents VALUES ('d1','p1','Oferta.pdf','Texto privado','2026'),('d2','p1','Otra.docx','Otro texto','2026'),('d3','otro','Ajeno.pdf','Ajeno','2026');
  CREATE TABLE bid_evaluation_runs (id TEXT,project_id TEXT,status TEXT,tender_sources_json TEXT,bid_sources_json TEXT,result_json TEXT,error TEXT,created_at TEXT,updated_at TEXT);
  CREATE TABLE bid_evaluation_reviews (run_id TEXT,criterion_id TEXT,status TEXT,score REAL,note TEXT,updated_at TEXT);
  INSERT INTO bid_evaluation_runs VALUES ('r1','p1','completed','[]','[]','{"criteria":[],"unreadableDocuments":[],"discardedCount":0,"total":null}',NULL,'2026','2026'),('r2','p1','running','[]','[]',NULL,NULL,'2026','2026'),('r3','otro','completed','[]','[]','{}',NULL,'2026','2026');
  INSERT INTO bid_evaluation_reviews VALUES ('r1','criterion','adjusted',5,'Nota privada','2026');`);db.close();
  const backup=createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)},{path:'workspace/bid-evaluation-originals/d1.pdf',bytes:Buffer.from('%PDF-prueba')}]});
  const inspected=await inspectDesktopBackup(backup,{temporaryRoot:dir}),data=inspected.projects[0].bidEvaluation;
  assert.deepEqual(data.runs.map(item=>item.id),['r1','r2']);assert.equal(data.runs[0].reviews[0].note,'Nota privada');assert.equal(data.runs[1].status,'interrupted');assert.equal(data.documents[0].bytes.toString(),'%PDF-prueba');assert.equal(data.documents[1].reason,'not_found');assert.equal(JSON.stringify(data).includes('Ajeno'),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('transfiere evaluaciones y textos recuperables sin imprimir su contenido',async()=>{
 const {transferDesktopBidEvaluation}=await import('../desktop-bid-evaluation.mjs'),seen=[];
 const data={documents:[{id:'one',name:'Oferta.pdf',text:'Texto confidencial',createdAt:'2026',bytes:Buffer.from('%PDF-prueba')},{id:'two',name:'Ausente.docx',text:'Texto recuperado',missing:true,reason:'not_found'}],runs:[{id:'run',status:'interrupted',tenderSources:[],bidSources:[],result:null,error:null,createdAt:'2026',updatedAt:'2026',reviews:[]}]};
 const result=await transferDesktopBidEvaluation({server:'http://localhost',token:'token',requestId:'request',projectId:'p',data,fetchImpl:async(url,options)=>{seen.push({url,options});return new Response('{}',{status:201});}});
 assert.equal(result.importedRuns,1);assert.equal(result.importedOriginals,1);assert.equal(result.importedTexts,2);assert.equal(result.missingOriginals.length,1);assert.equal(JSON.stringify(result).includes('Texto confidencial'),false);assert.equal(seen.length,4);assert.ok(seen.some(item=>item.url.includes('bid-evaluations/')));
});

test('el CLI importa evaluaciones históricas y avisa de originales ausentes sin revelar contenido',async()=>{
 const {createServer}=await import('node:http'),{execFile}=await import('node:child_process'),{promisify}=await import('node:util'),execute=promisify(execFile),seen=[];
 const dir=await mkdtemp(join(tmpdir(),'savia-evaluation-cli-'));
 const server=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);seen.push({path:req.url,body});res.writeHead(201,{'content-type':'application/json'});res.end(JSON.stringify({project:{id:'web-project',title:'Plan'}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const file=join(dir,'source.sqlite'),db=new DatabaseSync(file);
  db.exec(`PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER,outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT,parent_node_id TEXT,sort_order INTEGER,title TEXT); CREATE TABLE technical_plan_project_active (id INTEGER,project_id TEXT); INSERT INTO technical_plan_project_active VALUES (1,'p1'); CREATE TABLE bid_evaluation_documents (id TEXT,project_id TEXT,name TEXT,text TEXT,created_at TEXT); INSERT INTO bid_evaluation_documents VALUES ('d1','p1','Oferta.pdf','Texto privado','2026'),('d2','p1','Falta.pdf','Otro texto','2026'); CREATE TABLE bid_evaluation_runs (id TEXT,project_id TEXT,status TEXT,tender_sources_json TEXT,bid_sources_json TEXT,result_json TEXT,error TEXT,created_at TEXT,updated_at TEXT); INSERT INTO bid_evaluation_runs VALUES ('r1','p1','completed','[]','[]','{"criteria":[],"unreadableDocuments":[],"discardedCount":0,"total":null}',NULL,'2026','2026');`);db.close();
  const backup=join(dir,'backup.savia');await writeFile(backup,createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)},{path:'workspace/bid-evaluation-originals/d1.pdf',bytes:Buffer.from('%PDF-prueba')}]}));
  const config=join(dir,'config.json');await writeFile(config,JSON.stringify({server:`http://127.0.0.1:${server.address().port}`,token:'secreto'}));const cli=process.env.SAVIA_TEST_RUNNER_CLI||new URL('../cli.mjs',import.meta.url).pathname;
  const preview=(await execute(process.execPath,[cli,'inspect-backup','--backup',backup])).stdout;assert.equal(JSON.parse(preview).projects[0].evaluationCount,1);assert.equal(JSON.parse(preview).projects[0].missingEvaluationOriginals,1);assert.equal(preview.includes('Texto privado'),false);
  const output=(await execute(process.execPath,[cli,'import-plan','--backup',backup,'--project','p1','--config',config])).stdout,result=JSON.parse(output).bidEvaluation;assert.equal(result.importedRuns,1);assert.equal(result.importedOriginals,1);assert.equal(result.importedTexts,2);assert.equal(result.missingOriginals[0].reason,'not_found');assert.equal(output.includes('Texto privado'),false);assert.equal(seen.filter(item=>item.path.includes('/files/')).length,3);assert.equal(JSON.parse(seen.find(item=>item.path.includes('/bid-evaluations/')).body).id,'r1');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('recupera el informe de viabilidad del respaldo con capítulos, tareas y fuentes sin leer rutas externas',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-backup-feasibility-'));try{
  const file=join(dir,'source.sqlite'),db=new DatabaseSync(file);
  db.exec(`PRAGMA user_version=64; CREATE TABLE technical_plan_meta(id INTEGER,outline_project_name TEXT); CREATE TABLE technical_plan_outline_nodes(node_id TEXT,parent_node_id TEXT,sort_order INTEGER,title TEXT); CREATE TABLE feasibility_report_meta(id INTEGER,step TEXT,project_info_json TEXT,source_files_json TEXT,analysis_markdown TEXT,outline_template TEXT,target_words INTEGER,reference_document_ids_json TEXT,key_parameters_markdown TEXT,outline_project_name TEXT,outline_project_overview TEXT); CREATE TABLE feasibility_report_outline_nodes(node_id TEXT,parent_node_id TEXT,sort_order INTEGER,level INTEGER,title TEXT,description TEXT,knowledge_item_ids_json TEXT,content TEXT); CREATE TABLE feasibility_report_tasks(type TEXT,task_id TEXT,status TEXT,progress INTEGER,error TEXT,started_at TEXT,updated_at TEXT);`);
  db.prepare('INSERT INTO feasibility_report_meta VALUES(1,?,?,?,?,?,?,?,?,?,?)').run('content',JSON.stringify({projectName:'Hospital',projectType:'government'}),JSON.stringify([{id:'a',fileName:'Estudio.pdf',markdownPath:'feasibility-report/sources/a.md'},{id:'b',fileName:'Externo.pdf',markdownPath:'../../private.md'}]),'Análisis','government',30000,'[]','Parámetros','Hospital','Resumen');
  db.exec("INSERT INTO feasibility_report_outline_nodes VALUES ('n1',NULL,0,1,'Raíz','','[]',''),('n2','n1',0,2,'Hijo','Descripción','[\"k1\"]','Contenido privado ![Plano](savia-asset://imported-images/feasibility-report/plano.png)'); INSERT INTO feasibility_report_tasks VALUES ('feasibility-content','t1','running',50,NULL,'2026','2026');");db.close();
  const backup=createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)},{path:'workspace/feasibility-report/sources/a.md',bytes:Buffer.from('Texto fuente')},{path:'workspace/imported-images/feasibility-report/plano.png',bytes:Buffer.from('89504e470d0a1a0a010203','hex')}]});
  const report=(await inspectDesktopBackup(backup,{temporaryRoot:dir})).feasibility;assert.equal(report.state.projectInfo.projectName,'Hospital');assert.match(report.state.outlineData.outline[0].children[0].content,/Contenido privado/);assert.equal(report.sources[0].bytes.toString(),'Texto fuente');assert.equal(report.sources[1].reason,'unsafe_path');assert.equal(report.tasks[0].status,'interrupted');
  const {execFile}=await import('node:child_process'),{promisify}=await import('node:util'),backupPath=join(dir,'backup.savia');await writeFile(backupPath,backup);const cli=process.env.SAVIA_TEST_RUNNER_CLI||new URL('../cli.mjs',import.meta.url).pathname;const output=(await promisify(execFile)(process.execPath,[cli,'inspect-backup','--backup',backupPath])).stdout;assert.deepEqual(JSON.parse(output).feasibility,{present:true,sourceCount:2,missingSourceCount:1,chapterCount:2,taskCount:1,assetCount:1,missingAssetCount:0});assert.equal(output.includes('Contenido privado'),false);
  const {createServer}=await import('node:http'),received=[];const server=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);received.push({path:req.url,body:Buffer.concat(chunks)});res.writeHead(201,{'content-type':'application/json'});res.end('{}');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{const config=join(dir,'config.json');await writeFile(config,JSON.stringify({server:`http://127.0.0.1:${server.address().port}`,token:'secret'}));const result=(await promisify(execFile)(process.execPath,[cli,'import-feasibility','--backup',backupPath,'--config',config])).stdout;assert.equal(JSON.parse(result).uploadedSources,1);assert.equal(JSON.parse(result).uploadedAssets,1);assert.equal(JSON.parse(result).missingSources.length,1);assert.equal(result.includes('Contenido privado'),false);const imported=JSON.parse(received.find(item=>!item.path.includes('/sources/')&&!item.path.includes('/assets/')).body);assert.match(imported.report.outlineData.outline[0].children[0].content,/Contenido privado/);assert.equal(imported.report.sourceFiles[1].reason,'unsafe_path');assert.equal(imported.tasks[0].status,'interrupted');assert.equal(received.find(item=>item.path.includes('/sources/')).body.toString(),'Texto fuente');}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

 }finally{await rm(dir,{recursive:true,force:true});}
});

test('encuentra imágenes del informe en el respaldo y marca las externas',async()=>{
 const {extractFeasibilityAssets}=await import('../desktop-feasibility.mjs');const png=Buffer.from('89504e470d0a1a0a010203','hex'),nodes=[{id:'a',content:'![Plano](savia-asset://imported-images/feasibility-report/plano.png) ![Externa](https://example.invalid/p.png)',children:[{id:'b',content:'![Otro](savia-asset://generated-images/feasibility-report/figura.png)'}]}],files=new Map([['workspace/imported-images/feasibility-report/plano.png',png],['workspace/generated-images/feasibility-report/figura.png',png]]);const result=extractFeasibilityAssets(nodes,files);assert.equal(result.assets.length,2);assert.equal(result.missingAssets[0].reason,'outside_backup');assert.equal(result.assets[0].bytes,png);
});

test('recupera imágenes del perfil solo dentro del respaldo y declara las ausentes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-profile-backup-'));
 try{
  const file=join(dir,'source.sqlite'),db=new DatabaseSync(file);
  db.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta(id INTEGER,outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES(1,'Plan'); CREATE TABLE technical_plan_outline_nodes(node_id TEXT,parent_node_id TEXT,sort_order INTEGER,title TEXT); CREATE TABLE credential_library_profile(id INTEGER,company_name TEXT); INSERT INTO credential_library_profile VALUES(1,'Empresa'); CREATE TABLE credential_library_images(image_id TEXT,owner_type TEXT,owner_id TEXT,field_key TEXT,original_name TEXT,relative_path TEXT,custom_name TEXT,sort_order INTEGER,created_at TEXT); INSERT INTO credential_library_images VALUES('i1','profile','1','officeEnvironment','Oficina ñ.png','images/presente.png','Principal',3,'2026-01-01'),('i2','profile','1','businessLicense','Falta.png','images/falta.png','',0,'2026-01-02'),('i3','profile','1','taxCertificate','Fuera.png','../fuera.png','',0,'2026-01-03'),('other','employee','1','employeeIdPortrait','otro.png','images/presente.png','',0,'2026-01-04');");db.close();
  const bytes=Buffer.from('contenido'),archive=createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)},{path:'workspace/credential-library/images/presente.png',bytes}]});
  const result=await inspectDesktopBackup(archive,{temporaryRoot:dir});assert.equal(result.companyProfileImages.length,3);const available=result.companyProfileImages.find(item=>item.sourceId==='i1');assert.deepEqual(available.bytes,bytes);assert.equal(available.customName,'Principal');assert.equal(available.sortOrder,3);assert.equal(result.companyProfileImages.find(item=>item.sourceId==='i2').reason,'not_found');assert.equal(result.companyProfileImages.find(item=>item.sourceId==='i3').reason,'unsafe_path');
  const archivePath=join(dir,'backup.savia');await writeFile(archivePath,archive);const {execFile}=await import('node:child_process'),{promisify}=await import('node:util'),cli=process.env.SAVIA_TEST_RUNNER_CLI||new URL('../cli.mjs',import.meta.url).pathname;
  const preview=(await promisify(execFile)(process.execPath,[cli,'inspect-backup','--backup',archivePath])).stdout;assert.equal(JSON.parse(preview).companyProfile.imageCount,3);assert.equal(JSON.parse(preview).companyProfile.missingImageCount,2);assert.equal(preview.includes('Oficina ñ.png'),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
