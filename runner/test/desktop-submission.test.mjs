import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readDesktopSubmission} from '../desktop-submission.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('lee el seguimiento por proceso y verifica las evidencias y sus dueños',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec(`CREATE TABLE secop_submission_records(id TEXT,process_id TEXT,date TEXT,reference TEXT,version TEXT,note TEXT,package_id TEXT,receipt_id TEXT,created_at TEXT);CREATE TABLE secop_submission_files(id TEXT,process_id TEXT,owner_id TEXT,role TEXT,name TEXT,stored_name TEXT,size INTEGER,sha256 TEXT,created_at TEXT);CREATE TABLE secop_submission_requests(id TEXT,process_id TEXT,kind TEXT,title TEXT,due_date TEXT,note TEXT,status TEXT,task_id TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE secop_submission_results(id TEXT,process_id TEXT,result TEXT,note TEXT,created_at TEXT);`);
  db.prepare('INSERT INTO secop_submission_requests VALUES(?,?,?,?,?,?,?,?,?,?)').run('r','p','correction','Subsanar','','nota','reviewed','task','2026','2026');db.prepare('INSERT INTO secop_submission_results VALUES(?,?,?,?,?)').run('res','p','awarded','','2026');db.prepare('INSERT INTO secop_submission_records VALUES(?,?,?,?,?,?,?,?,?)').run('s','p','2026-11-05','RAD','v1','','pkg','rec','2026');
  for(const [id,owner,role,stored,content] of [['a','r','request','a.pdf','anexo'],['pkg','s','package','p.pdf','oferta'],['rec','s','receipt','r.pdf','acuse'],['other','x','request','other.pdf','otro']])db.prepare('INSERT INTO secop_submission_files VALUES(?,?,?,?,?,?,?,?,?)').run(id,id==='other'?'other':'p',owner,role,`${id}.pdf`,stored,content.length,hash(content),'2026');
  const files=new Map([['workspace/submission-evidence/a.pdf',Buffer.from('anexo')],['workspace/submission-evidence/p.pdf',Buffer.from('oferta')],['workspace/submission-evidence/r.pdf',Buffer.from('acuse')]]),hasTable=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  const value=readDesktopSubmission(db,files,hasTable,'p');assert.equal(value.requests[0].taskId,'task');assert.equal(value.requests[0].version,1);assert.equal(value.results.length,1);assert.equal(value.attachments[0].bytes.toString(),'anexo');assert.equal(value.evidence.length,2);assert.deepEqual(value.missing,[]);
  files.set('workspace/submission-evidence/p.pdf',Buffer.from('falsos'));files.delete('workspace/submission-evidence/r.pdf');const missing=readDesktopSubmission(db,files,hasTable,'p');assert.deepEqual(missing.missing.map(x=>x.reason).sort(),['hash_mismatch','not_found']);assert.equal(missing.evidence.length,0);assert.equal(readDesktopSubmission(db,files,hasTable,'unknown').requests.length,0);
  db.prepare('UPDATE secop_submission_files SET stored_name=? WHERE id=?').run('../fuera','a');assert.ok(readDesktopSubmission(db,files,hasTable,'p').missing.some(x=>x.reason==='unsafe_path'));
 }finally{db.close();}
});
