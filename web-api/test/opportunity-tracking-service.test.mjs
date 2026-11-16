import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { opportunityTracking } from '../src/opportunity-tracking.js';

test('el servicio protege propietarios y versiones usando SQLite', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE projects(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL);
      CREATE TABLE project_opportunity_tracking(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,decision TEXT NOT NULL,owner TEXT NOT NULL,notes TEXT NOT NULL,version INTEGER NOT NULL,updated_at TEXT NOT NULL);
      INSERT INTO projects VALUES ('p','alice');`);
    const DB={prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args) ?? null;}};}};}};
    const env={DB,BETTER_AUTH_URL:'http://localhost'},url='http://localhost/api/projects/p/opportunity-tracking';
    const get=owner=>opportunityTracking(new Request(url),env,owner,'p');
    const put=(owner,input,origin='http://localhost')=>opportunityTracking(new Request(url,{method:'PUT',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)}),env,owner,'p');
    assert.deepEqual(await (await get('alice')).json(),{decision:'review',owner:'',notes:'',version:0,updatedAt:null});
    assert.equal((await get('bob')).status,404);
    const data={decision:'participate',owner:' Ana ',notes:' Nota ',version:0};
    assert.equal((await put('alice',data,'https://other.example')).status,403);
    assert.equal((await put('alice',{...data,owner:'x'.repeat(121)})).status,400);
    const saved=await (await put('alice',data)).json();assert.equal(saved.owner,'Ana');assert.equal(saved.notes,'Nota');assert.equal(saved.version,1);
    assert.equal((await put('alice',data)).status,409);
    assert.equal((await put('bob',{...data,version:1})).status,404);
    const results=await Promise.all([put('alice',{...data,version:1}),put('alice',{...data,decision:'discarded',version:1})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    db.prepare('DELETE FROM projects WHERE id = ?').run('p');
    assert.equal((await get('alice')).status,404);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM project_opportunity_tracking').get().n,0);
  } finally { db.close(); }
});
