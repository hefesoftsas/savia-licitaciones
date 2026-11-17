import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleProjects } from '../src/projects.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('sesiones, proyectos y documentos permanecen aislados y persisten', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-web-build-'));
  const persistence = await mkdtemp(join(tmpdir(), 'savia-web-d1-'));
  let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], {
      cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' },
    });
    const options = convertV4MiniflareOptions({
      modules: true,
      script: await readFile(join(build, 'index.js'), 'utf8'),
      compatibilityDate: '2026-10-30',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: { DB: 'savia-auth-test' },
      r2Buckets: ['FILES'],
      bindings: { AUTH_ALLOW_REGISTRATION: 'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost' },
    });
    options.resourcePersistencePath = persistence;
    worker = new Miniflare(options);
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(name => name.endsWith('.sql')).sort()) {
      const schema = await readFile(join(root, 'migrations', file), 'utf8');
      for (const statement of schema.split(';').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run();
    }
    const request = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const noSession = await request('/api/me');
    assert.equal(noSession.status, 401);

    async function signUp(name, email) {
      const response = await request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({ name, email, password: 'test-password-12345' }),
      });
      assert.equal(response.status, 200, await response.clone().text());
      const cookie = response.headers.get('set-cookie')?.split(';')[0];
      assert.ok(cookie, 'la respuesta debe crear una sesión');
      return cookie;
    }
    const alice = await signUp('Alice', 'alice@example.com');
    const bob = await signUp('Bob', 'bob@example.com');
    const identity = async cookie => {
      const response = await request('/api/me', { headers: { cookie } });
      assert.equal(response.status, 200);
      return response.json();
    };
    assert.equal((await identity(alice)).user.email, 'alice@example.com');
    assert.equal((await identity(bob)).user.email, 'bob@example.com');
    const preferences = cookie => request('/api/preferences', { headers: { cookie } });
    const changeLanguage = (cookie, language, origin = 'http://localhost') => request('/api/preferences', { method:'PUT', headers:{cookie, origin, 'content-type':'application/json'}, body:JSON.stringify({language}) });
    assert.equal((await request('/api/preferences')).status, 401);
    assert.equal((await (await preferences(alice)).json()).language, 'es');
    assert.equal((await changeLanguage(alice, 'en', 'https://otro.example')).status, 403);
    assert.equal((await changeLanguage(alice, 'zh')).status, 400);
    assert.equal((await changeLanguage(alice, 'en')).status, 200);
    assert.equal((await (await preferences(alice)).json()).language, 'en');
    assert.equal((await (await preferences(bob)).json()).language, 'es');
    const changeTheme = (cookie, theme) => request('/api/preferences', {method:'PUT', headers:{cookie,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({theme})});
    assert.equal((await (await preferences(alice)).json()).theme, 'system');
    assert.equal((await changeTheme(alice, 'invalid')).status, 400);
    assert.equal((await changeTheme(alice, 'dark')).status, 200);
    assert.deepEqual(await (await preferences(alice)).json(), {language:'en',theme:'dark',colorTheme:'neutral',visualStyle:'vega',market:'ALL'});
    assert.equal((await changeLanguage(alice, 'es')).status, 200);
    assert.deepEqual(await (await preferences(alice)).json(), {language:'es',theme:'dark',colorTheme:'neutral',visualStyle:'vega',market:'ALL'});
    assert.equal((await changeLanguage(alice, 'en')).status, 200);
    const changeAppearance = value => request('/api/preferences', {method:'PUT', headers:{cookie:alice,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(value)});
    assert.equal((await changeAppearance({colorTheme:'unknown'})).status, 400);
    assert.equal((await changeAppearance({visualStyle:'unknown'})).status, 400);
    assert.equal((await changeAppearance({market:'FR'})).status, 400);
    assert.equal((await changeAppearance({colorTheme:'blue'})).status, 200);
    assert.equal((await changeAppearance({visualStyle:'mira'})).status, 200);
    assert.deepEqual(await (await preferences(alice)).json(), {language:'en',theme:'dark',colorTheme:'blue',visualStyle:'mira',market:'ALL'});
    assert.equal((await changeAppearance({market:'ES'})).status, 200);
    assert.equal((await (await preferences(alice)).json()).market, 'ES');
    assert.equal((await (await preferences(bob)).json()).colorTheme, 'neutral');
    assert.equal((await (await preferences(bob)).json()).theme, 'system');


    const create = await request('/api/projects', {
      method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Oferta pública' }),
    });
    assert.equal(create.status, 201, await create.clone().text());
    const project = (await create.json()).project;
    assert.equal(project.title, 'Oferta pública');
    const list = await request('/api/projects', { headers: { cookie: alice } });
    assert.equal(list.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await list.json()).projects.map(item => item.id), [project.id]);
    const otherList = await request('/api/projects', { headers: { cookie: bob } });
    assert.deepEqual((await otherList.json()).projects, []);
    assert.equal((await request(`/api/projects/${project.id}`, { headers: { cookie: bob } })).status, 404);
    assert.equal((await request(`/api/projects/${project.id}`)).status, 401);
    assert.equal((await request('/api/projects', {
      method: 'POST', headers: { cookie: alice, origin: 'https://otro.example', 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'No autorizado' }),
    })).status, 403);
    const fileBytes = new Uint8Array([0, 17, 42, 128, 255]);
    const upload = await request(`/api/projects/${project.id}/files`, {
      method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/pdf', 'x-file-name': encodeURIComponent('pliego ñ.pdf') }, body: fileBytes,
    });
    assert.equal(upload.status, 201, await upload.clone().text());
    const file = (await upload.json()).file;
    assert.equal(file.name, 'pliego ñ.pdf');
    const fileList = await request(`/api/projects/${project.id}/files`, { headers: { cookie: alice } });
    assert.deepEqual((await fileList.json()).files.map(item => item.id), [file.id]);
    const downloadPath = `/api/projects/${project.id}/files/${file.id}`;
    const download = await request(downloadPath, { headers: { cookie: alice } });
    assert.deepEqual(new Uint8Array(await download.arrayBuffer()), fileBytes);
    assert.equal(download.headers.get('content-type'), 'application/pdf');
    assert.equal(download.headers.get('cache-control'), 'no-store');
    assert.equal(download.headers.get('content-disposition'), "attachment; filename*=UTF-8''pliego%20%C3%B1.pdf");
    assert.equal((await request(downloadPath, { headers: { cookie: bob } })).status, 404);
    assert.equal((await request(`/api/projects/${project.id}/files`, { method: 'POST', headers: { cookie: bob, origin: 'http://localhost', 'x-file-name': 'other.pdf' }, body: 'other' })).status, 404);
    assert.equal((await request(`/api/projects/${project.id}/files`, { method: 'POST', headers: { cookie: alice, origin: 'https://otro.example', 'x-file-name': 'other.pdf' }, body: 'other' })).status, 403);
    assert.equal((await request(`/api/projects/${project.id}/files`, { headers: { cookie: bob } })).status, 404);
    const bucket = await worker.getR2Bucket('FILES');
    const countBefore = (await bucket.list()).objects.length;
    await db.prepare("CREATE TRIGGER reject_file BEFORE INSERT ON project_files BEGIN SELECT RAISE(ABORT, 'simulated_failure'); END").run();
    try {
      const failed = await request(`/api/projects/${project.id}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': 'failure.pdf' }, body: 'content' }).catch(() => null);
      assert.ok(!failed || failed.status >= 500);
      assert.equal((await bucket.list()).objects.length, countBefore);
    } finally {
      await db.prepare('DROP TRIGGER reject_file').run();
    }
    const logout = await request('/api/auth/sign-out', {
      method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(logout.status, 200);
    assert.equal((await request('/api/me', { headers: { cookie: alice } })).status, 401);
    assert.equal((await identity(bob)).user.email, 'bob@example.com');
    await worker.dispose();
    worker = new Miniflare(options);
    assert.equal((await request('/api/me', { headers: { cookie: alice } })).status, 401);
    assert.equal((await identity(bob)).user.email, 'bob@example.com');
    const login = await request('/api/auth/sign-in/email', {
      method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.com', password: 'test-password-12345' }),
    });
    assert.equal(login.status, 200);
    const aliceAgain = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(aliceAgain);
    assert.equal((await (await preferences(aliceAgain)).json()).language, 'en');
    assert.equal((await (await preferences(aliceAgain)).json()).theme, 'dark');
    assert.equal((await (await preferences(aliceAgain)).json()).colorTheme, 'blue');
    assert.equal((await (await preferences(aliceAgain)).json()).visualStyle, 'mira');
    const persisted = await request(downloadPath, { headers: { cookie: aliceAgain } });
    assert.deepEqual(new Uint8Array(await persisted.arrayBuffer()), fileBytes);
    const restartedDb = await worker.getD1Database('DB');
    const remove = (cookie, origin = 'http://localhost') => request(downloadPath, { method: 'DELETE', headers: { cookie, origin } });
    assert.equal((await remove(bob)).status, 404);
    assert.equal((await remove(aliceAgain, 'https://otro.example')).status, 403);
    await restartedDb.prepare("CREATE TRIGGER reject_file_delete BEFORE DELETE ON project_files BEGIN SELECT RAISE(ABORT, 'simulated_failure'); END").run();
    const failedDelete = await remove(aliceAgain).catch(() => null); assert.ok(!failedDelete || failedDelete.status >= 500);
    assert.equal((await request(downloadPath, { headers: { cookie: aliceAgain } })).status, 200);
    await restartedDb.prepare('DROP TRIGGER reject_file_delete').run();
    const owner = await restartedDb.prepare('SELECT id FROM user WHERE email = ?').bind('alice@example.com').first();
    const failedStorage = await handleProjects(new Request(`http://localhost${downloadPath}`, { method: 'DELETE', headers: { origin: 'http://localhost' } }), { BETTER_AUTH_URL: 'http://localhost', DB: restartedDb, FILES: { delete: async () => { throw new Error('R2 no disponible'); } } }, owner.id);
    assert.equal(failedStorage.status, 503);
    assert.equal((await request(downloadPath, { headers: { cookie: aliceAgain } })).status, 404);
    assert.equal((await (await request(`/api/projects/${project.id}/files`, { headers: { cookie: aliceAgain } })).json()).files[0].deleting, 1);
    assert.equal((await remove(aliceAgain)).status, 204);
    assert.equal((await remove(aliceAgain)).status, 204);
    assert.equal((await request(downloadPath, { headers: { cookie: aliceAgain } })).status, 404);
    assert.deepEqual((await (await request(`/api/projects/${project.id}/files`, { headers: { cookie: aliceAgain } })).json()).files, []);
    assert.equal((await (await worker.getR2Bucket('FILES')).list()).objects.length, 0);
    await restartedDb.prepare('UPDATE session SET expiresAt = ? WHERE userId = (SELECT id FROM user WHERE email = ?)').bind(0, 'bob@example.com').run();
    assert.equal((await request('/api/me', { headers: { cookie: bob } })).status, 401);
  } finally {
    await worker?.dispose();
    await rm(build, { recursive: true, force: true });
    await rm(persistence, { recursive: true, force: true });
  }
});
