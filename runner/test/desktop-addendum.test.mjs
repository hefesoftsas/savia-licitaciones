import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readDesktopAddendum} from '../desktop-addendum.mjs';
const tables=db=>name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
test('conserva análisis y revisiones por proceso y marca tareas interrumpidas',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec("CREATE TABLE addendum_impact_runs(id TEXT,process_id TEXT,status TEXT,source_hash TEXT,sources_json TEXT,result_json TEXT,error TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE addendum_impact_reviews(run_id TEXT,impact_id TEXT,status TEXT,note TEXT,updated_at TEXT);");
  const insert=db.prepare('INSERT INTO addendum_impact_runs VALUES(?,?,?,?,?,?,?,?,?)');insert.run('done','p','completed','hash',JSON.stringify({addendumId:'doc',addendumName:'Adenda',originals:[{id:'base',name:'Pliego'}],offers:[]}),JSON.stringify({impacts:[{id:'i',title:'Cambio',addendumQuote:'Texto exacto'}],discardedCount:0,unreadableSources:[],reviewRequired:true}),null,'2026','2027');insert.run('active','p','running','hash',JSON.stringify({addendumId:'x'}),null,null,'2027','2027');insert.run('broken','p','completed','hash','{','{',null,'2028','2028');insert.run('other','q','completed','hash','{}','{}',null,'2026','2026');
  db.exec("INSERT INTO addendum_impact_reviews VALUES('done','i','reviewed','nota privada','2027'),('done','missing','pending','sin hallazgo','2027'),('other','x','pending','otra','2026');");
  const result=readDesktopAddendum(db,tables(db),'p');assert.equal(result.runs.length,3);const done=result.runs.find(item=>item.id==='done');assert.equal(done.result.impacts[0].addendumQuote,'Texto exacto');assert.equal(done.reviews[0].note,'nota privada');assert.equal(done.orphanReviewCount,1);assert.equal(result.runs.find(item=>item.id==='active').status,'interrupted');assert.equal(result.runs.find(item=>item.id==='active').originalStatus,'running');assert.equal(result.runs.find(item=>item.id==='broken').issue,'invalid_json');assert.equal(result.runs.find(item=>item.id==='broken').rawSources,'{');assert.equal(readDesktopAddendum(db,tables(db),'q').runs.length,1);assert.equal(readDesktopAddendum(db,tables(db),'').runs.length,0);
 }finally{db.close();}
});
test('distingue respaldos anteriores de tablas incompletas',()=>{const db=new DatabaseSync(':memory:');try{assert.deepEqual(readDesktopAddendum(db,tables(db),'p'),{runs:[],available:false});db.exec('CREATE TABLE addendum_impact_runs(id TEXT)');assert.throws(()=>readDesktopAddendum(db,tables(db),'p'),/incomplet/i);}finally{db.close();}});
