import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

function assertSecurityHeaders(response) {
  for (const [name, expected] of Object.entries(EXPECTED_SECURITY_HEADERS)) {
    assert.equal(response.headers.get(name), expected, `Expected header ${name} to equal ${expected}`);
  }
}

test('aplica cabeceras de seguridad HTTP en respuestas /api/* y no-API sin romper cabeceras existentes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savia-security-headers-'));
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
        d1Databases: { DB: 'security-headers-test' },
        r2Buckets: ['FILES'],
        bindings: {
          AUTH_ALLOW_REGISTRATION: 'true',
          BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
          BETTER_AUTH_URL: 'http://localhost',
        },
      }),
    );
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter((x) => x.endsWith('.sql')).sort()) {
      for (const sql of (await readFile(join(root, 'migrations', file), 'utf8'))
        .split(';')
        .map((x) => x.trim())
        .filter(Boolean)) {
        await db.prepare(sql).run();
      }
    }

    const capabilities = await worker.dispatchFetch('http://localhost/api/auth-capabilities');
    assert.equal(capabilities.status, 200);
    assert.equal(capabilities.headers.get('cache-control'), 'no-store');
    assert.match(capabilities.headers.get('content-type') || '', /application\/json/);
    assertSecurityHeaders(capabilities);

    const meUnauthorized = await worker.dispatchFetch('http://localhost/api/me');
    assert.equal(meUnauthorized.status, 401);
    assert.equal(meUnauthorized.headers.get('cache-control'), 'no-store');
    assertSecurityHeaders(meUnauthorized);

    const authSession = await worker.dispatchFetch('http://localhost/api/auth/get-session');
    assert.equal(authSession.status, 200);
    assert.equal(authSession.headers.get('cache-control'), 'no-store');
    assertSecurityHeaders(authSession);

    const nonApi = await worker.dispatchFetch('http://localhost/app/dashboard');
    assert.equal(nonApi.status, 404);
    assertSecurityHeaders(nonApi);
  } finally {
    await worker?.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
