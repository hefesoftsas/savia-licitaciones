import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
test('la migración conserva runners anteriores como locales y limita modalidades',async()=>{
 const db=new DatabaseSync(':memory:');try{db.exec("CREATE TABLE runners(id TEXT PRIMARY KEY,name TEXT NOT NULL); INSERT INTO runners VALUES('old','Equipo');");db.exec(await readFile(new URL('../migrations/0130_runner_execution_mode.sql',import.meta.url),'utf8'));assert.equal(db.prepare("SELECT execution_mode FROM runners WHERE id='old'").get().execution_mode,'local');db.exec("INSERT INTO runners(id,name) VALUES('new','Nuevo')");assert.equal(db.prepare("SELECT execution_mode FROM runners WHERE id='new'").get().execution_mode,'local');assert.throws(()=>db.exec("UPDATE runners SET execution_mode='arbitrary' WHERE id='old'"),/CHECK constraint/);db.exec("UPDATE runners SET execution_mode='hosted' WHERE id='old'");}finally{db.close();}
});
