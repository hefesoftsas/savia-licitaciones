import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';

const sql = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');

test('la migración conserva las cuentas existentes en espacios separados', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(await sql('0001_auth.sql'));
    const add = db.prepare('INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (?,?,?,?,?,?)');
    add.run('one','Uno','one@example.test',1,1,1);
    add.run('two','Dos','two@example.test',1,1,1);
    db.exec(await sql('0170_tenants.sql'));
    const rows = db.prepare('SELECT m.user_id,t.owner_user_id FROM tenant_members m JOIN tenants t ON t.id=m.tenant_id ORDER BY m.user_id').all();
    assert.deepEqual(rows.map(row => ({...row})), [{user_id:'one',owner_user_id:'one'},{user_id:'two',owner_user_id:'two'}]);
    assert.throws(() => db.prepare('INSERT INTO tenant_members (tenant_id,user_id,created_at) VALUES (?,?,?)').run('legacy:one','two','2026-01-01'));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tenants').get().count,2);
    assert.throws(() => db.prepare('DELETE FROM "user" WHERE id=?').run('one'));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tenants').get().count,2);
  } finally { db.close(); }
});
