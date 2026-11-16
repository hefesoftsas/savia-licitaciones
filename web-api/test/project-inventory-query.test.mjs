import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('el inventario usa el índice por cuenta e ID también para páginas posteriores',async()=>{
 const db=new DatabaseSync(':memory:');try{for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())db.exec(await readFile(join(root,'migrations',file),'utf8'));
  for(const [sql,values] of [['SELECT id FROM projects WHERE owner_id=? ORDER BY id LIMIT 101',['alice']],['SELECT id FROM projects WHERE owner_id=? AND id>? ORDER BY id LIMIT 101',['alice','last']]]){const details=db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...values).map(x=>x.detail).join(' ');assert.match(details,/projects_owner_id_idx/);assert.doesNotMatch(details,/TEMP B-TREE/);}
 }finally{db.close();}
});
