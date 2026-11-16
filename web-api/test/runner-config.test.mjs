import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('admin runner-config CRUD y endpoint /api/runner/config', { timeout: 120000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savia-runner-config-'));
  let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', dir], {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' },
    });
    worker = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: await readFile(join(dir, 'index.js'), 'utf8'),
        compatibilityDate: '2026-10-30',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: { DB: 'runner-config-test' },
        r2Buckets: ['FILES'],
        bindings: {
          BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
          BETTER_AUTH_URL: 'http://localhost',
          SAVIA_SUPERADMIN_EMAIL: 'admin@example.test',
          SAVIA_SUPERADMIN_PASSWORD: 'local-only-password-12345',
          AUTH_ALLOW_REGISTRATION: 'true',
        },
      }),
    );

    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter((x) => x.endsWith('.sql')).sort()) {
      for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map((x) => x.trim()).filter(Boolean)) {
        await db.prepare(sql).run();
      }
    }

    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const jsonReq = (method, path, body, headers = {}) =>
      req(path, {
        method,
        headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    // Sign in as superadmin
    const adminLogin = await jsonReq('POST', '/api/auth/sign-in/email', {
      email: 'admin@example.test',
      password: 'local-only-password-12345',
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];

    // Sign up a regular user
    const userSignup = await jsonReq('POST', '/api/auth/sign-up/email', {
      name: 'Usuario Normal',
      email: 'user@example.test',
      password: 'regular-user-password-123',
    });
    assert.equal(userSignup.status, 200);
    const userCookie = userSignup.headers.get('set-cookie').split(';')[0];

    // Auth & RBAC checks
    const unauth = await req('/api/admin/runner-config');
    assert.equal(unauth.status, 401);
    assert.equal(unauth.headers.get('cache-control'), 'no-store');

    assert.equal((await req('/api/admin/runner-config', { headers: { cookie: userCookie } })).status, 403);
    assert.equal(
      (
        await req('/api/admin/runner-config', {
          method: 'POST',
          headers: { origin: 'https://evil.example', 'content-type': 'application/json', cookie: adminCookie },
          body: JSON.stringify({ id: 'skill:bad-origin', category: 'skill', title: 'Bad', content: 'x' }),
        })
      ).status,
      403,
    );

    // GET catalog
    const listAll = await req('/api/admin/runner-config', { headers: { cookie: adminCookie } });
    assert.equal(listAll.status, 200);
    assert.equal(listAll.headers.get('cache-control'), 'no-store');
    const allData = await listAll.json();
    assert.ok(allData.items.some((x) => x.id === 'skill:secop-research' && x.isBuiltIn && !x.isCustomized));
    assert.ok(allData.items.some((x) => x.id === 'hook:task-completion' && x.isBuiltIn && !x.isCustomized));
    assert.ok(allData.items.some((x) => x.id === 'prompt:agent-workspace' && x.isBuiltIn && !x.isCustomized));

    // Category filter
    const onlyHooks = await req('/api/admin/runner-config?category=hook', { headers: { cookie: adminCookie } });
    assert.equal(onlyHooks.status, 200);
    const hooksData = await onlyHooks.json();
    assert.ok(hooksData.items.length >= 5);
    assert.ok(hooksData.items.every((x) => x.category === 'hook'));

    assert.equal((await req('/api/admin/runner-config?category=unknown', { headers: { cookie: adminCookie } })).status, 400);

    // Pair a runner to test /api/runner/config
    assert.equal((await req('/api/runner/config')).status, 401);
    const pairing = await (await jsonReq('POST', '/api/runner-pairings', {}, { cookie: userCookie })).json();
    const paired = await (await jsonReq('POST', '/api/runners/pair', { name: 'Runner Config Test', code: pairing.code })).json();
    const runnerAuth = { authorization: `Bearer ${paired.token}` };

    // Initial runner config (no overrides yet)
    const initialRunnerCfgRes = await req('/api/runner/config', { headers: runnerAuth });
    assert.equal(initialRunnerCfgRes.status, 200);
    const initialRunnerCfg = await initialRunnerCfgRes.json();
    assert.equal(initialRunnerCfg.updatedAt, null);
    assert.equal(initialRunnerCfg.overrides.skills.length, 4);
    assert.equal(initialRunnerCfg.overrides.hooks['hook:task-completion'].enabled, true);
    assert.deepEqual(initialRunnerCfg.overrides.prompts, {});

    // POST validation & creation
    assert.equal(
      (await jsonReq('POST', '/api/admin/runner-config', { id: 'INVALID ID!', category: 'skill', title: 'X', content: 'Y' }, { cookie: adminCookie })).status,
      400,
    );
    assert.equal(
      (await jsonReq('POST', '/api/admin/runner-config', { id: 'skill:secop-research', category: 'skill', title: 'Dup', content: 'Y' }, { cookie: adminCookie })).status,
      409,
    );
    const createdSkillRes = await jsonReq(
      'POST',
      '/api/admin/runner-config',
      {
        id: 'skill:custom-colombia-tax',
        category: 'skill',
        title: 'Custom Tax Check',
        description: 'Custom skill for tax verification',
        content: '## Custom Tax Skill\nVerify RUT and ICA.',
        enabled: true,
      },
      { cookie: adminCookie },
    );
    assert.equal(createdSkillRes.status, 201);
    const createdSkill = (await createdSkillRes.json()).item;
    assert.equal(createdSkill.isBuiltIn, false);
    assert.equal(createdSkill.isCustomized, true);
    assert.equal(createdSkill.updatedBy, 'admin@example.test');

    // PUT override built-in prompt, disable a built-in hook, disable a built-in skill
    const putPromptRes = await jsonReq(
      'PUT',
      '/api/admin/runner-config/prompt:agent-workspace',
      { content: '# Custom Workspace Override\nOnly read/write inside workspace.' },
      { cookie: adminCookie },
    );
    assert.equal(putPromptRes.status, 200);
    const putPrompt = (await putPromptRes.json()).item;
    assert.equal(putPrompt.isBuiltIn, true);
    assert.equal(putPrompt.isCustomized, true);
    assert.ok(putPrompt.defaultContent.includes('Savia智能体工作区'));
    assert.equal(putPrompt.content, '# Custom Workspace Override\nOnly read/write inside workspace.');

    const putHookRes = await jsonReq(
      'PUT',
      '/api/admin/runner-config/hook:task-completion',
      { enabled: false, content: JSON.stringify({ enabled: false, allowTaskCompleteParam: false }) },
      { cookie: adminCookie },
    );
    assert.equal(putHookRes.status, 200);

    const disableSkillRes = await jsonReq(
      'PUT',
      '/api/admin/runner-config/skill:compliance-audit',
      { enabled: false },
      { cookie: adminCookie },
    );
    assert.equal(disableSkillRes.status, 200);

    assert.equal(
      (await jsonReq('PUT', '/api/admin/runner-config/skill:does-not-exist', { title: 'Nope' }, { cookie: adminCookie })).status,
      404,
    );

    // Fetch updated runner config
    const updatedRunnerCfg = await (await req('/api/runner/config', { headers: runnerAuth })).json();
    assert.ok(updatedRunnerCfg.updatedAt);
    assert.equal(updatedRunnerCfg.overrides.skills.length, 4); // 3 enabled built-in + 1 custom
    assert.ok(updatedRunnerCfg.overrides.skills.some((s) => s.includes('Custom Tax Skill')));
    assert.equal(updatedRunnerCfg.overrides.hooks['hook:task-completion'].enabled, false);
    assert.equal(updatedRunnerCfg.overrides.hooks['hook:task-completion'].config.allowTaskCompleteParam, false);
    assert.deepEqual(updatedRunnerCfg.overrides.prompts, {
      'prompt:agent-workspace': '# Custom Workspace Override\nOnly read/write inside workspace.',
    });

    // DELETE built-in override resets to default
    const resetRes = await req('/api/admin/runner-config/prompt:agent-workspace', {
      method: 'DELETE',
      headers: { origin: 'http://localhost', cookie: adminCookie },
    });
    assert.equal(resetRes.status, 200);
    const resetBody = await resetRes.json();
    assert.equal(resetBody.isBuiltIn, true);
    assert.equal(resetBody.item.isCustomized, false);
    assert.equal(resetBody.item.content, resetBody.item.defaultContent);

    // DELETE custom item removes it completely
    const deleteCustomRes = await req('/api/admin/runner-config/skill:custom-colombia-tax', {
      method: 'DELETE',
      headers: { origin: 'http://localhost', cookie: adminCookie },
    });
    assert.equal(deleteCustomRes.status, 200);
    const deleteCustomBody = await deleteCustomRes.json();
    assert.equal(deleteCustomBody.isBuiltIn, false);
    assert.equal(deleteCustomBody.item, null);

    // DELETE unknown returns 404
    assert.equal(
      (
        await req('/api/admin/runner-config/skill:nonexistent', {
          method: 'DELETE',
          headers: { origin: 'http://localhost', cookie: adminCookie },
        })
      ).status,
      404,
    );
  } finally {
    await worker?.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
