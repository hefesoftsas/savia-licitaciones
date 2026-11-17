import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdir, readFile} from 'node:fs/promises';
import {handleProjects} from '../src/projects.js';

test('separa los proyectos manuales e importados por país', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const migrations = new URL('../migrations/', import.meta.url);
    for (const file of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
      db.exec(await readFile(new URL(file, migrations), 'utf8'));
    }
    db.prepare('INSERT INTO "user" (id, name, email, createdAt, updatedAt, emailVerified) VALUES (?, ?, ?, ?, ?, 1)')
      .run('owner', 'Owner', 'owner@example.test', 0, 0);
    const env = {
      BETTER_AUTH_URL: 'https://savia.test',
      DB: {prepare(sql) {
        const stmt = db.prepare(sql);
        return {bind(...args) {
          return {run: () => stmt.run(...args), all: () => ({results: stmt.all(...args)})};
        }};
      }},
    };
    db.prepare("INSERT INTO projects (id, owner_id, title, created_at) VALUES ('legacy', 'owner', 'Histórico', '2025-01-01')").run();
    for (const [title, market] of [['Manual España', 'ES'], ['Manual Colombia', 'CO'], ['Importado PLACSP', undefined]]) {
      const response = await handleProjects(new Request('https://savia.test/api/projects', {
        method: 'POST', headers: {origin: env.BETTER_AUTH_URL}, body: JSON.stringify({title, market}),
      }), env, 'owner');
      assert.equal(response.status, 201);
      const {project} = await response.json();
      if (title === 'Importado PLACSP') {
        db.prepare('INSERT INTO project_secop(project_id, owner_id, source, external_id, process_json) VALUES (?, ?, ?, ?, ?)')
          .run(project.id, 'owner', 'placsp', 'example', '{}');
      }
    }
    for (const [market, expected] of [
      ['ES', ['Importado PLACSP', 'Manual España']],
      ['CO', ['Histórico', 'Manual Colombia']],
      ['ALL', ['Histórico', 'Importado PLACSP', 'Manual Colombia', 'Manual España']],
    ]) {
      const response = await handleProjects(new Request(`https://savia.test/api/projects?market=${market}`), env, 'owner');
      const {projects} = await response.json();
      assert.deepEqual(projects.map(project => project.title).sort(), expected);
    }
  } finally {
    db.close();
  }
});
