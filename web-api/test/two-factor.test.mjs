import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function decodeBase32(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base32 char: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateTotp(secretBase32, counterOffset = 0) {
  const key = decodeBase32(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30) + counterOffset;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

function mergeCookies(existing, headers) {
  const map = new Map();
  if (existing) {
    for (const part of existing.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k) map.set(k, v.join('='));
    }
  }
  const setCookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
  for (const raw of setCookies) {
    const pair = raw.split(';')[0];
    const [k, ...v] = pair.trim().split('=');
    if (k) map.set(k, v.join('='));
  }
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

test('habilita, verifica en inicio de sesión (TOTP y código de respaldo) y desactiva MFA', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-mfa-test-'));
  let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' },
    });
    worker = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: await readFile(join(build, 'index.js'), 'utf8'),
      compatibilityDate: '2026-10-30',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: { DB: 'mfa-test' },
      r2Buckets: ['FILES'],
      bindings: {
        AUTH_ALLOW_REGISTRATION: 'true',
        BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
        BETTER_AUTH_URL: 'http://localhost',
      },
    }));
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter((item) => item.endsWith('.sql')).sort()) {
      for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map((item) => item.trim()).filter(Boolean)) {
        await db.prepare(sql).run();
      }
    }

    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const post = (path, body, headers = {}) => req(path, {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    const signup = await post('/api/auth/sign-up/email', {
      name: 'Alice MFA',
      email: 'alice-mfa@example.com',
      password: 'password-123456',
    });
    assert.equal(signup.status, 200);
    let cookie = mergeCookies('', signup.headers);

    const meBefore = await req('/api/me', { headers: { cookie } });
    assert.equal(meBefore.status, 200);
    assert.equal((await meBefore.json()).user.twoFactorEnabled, false);

    const enabled = await post('/api/auth/two-factor/enable', { password: 'password-123456', issuer: 'Savia' }, { cookie });
    assert.equal(enabled.status, 200, await enabled.clone().text());
    const enabledBody = await enabled.json();
    assert.ok(enabledBody.totpURI?.startsWith('otpauth://totp/'));
    assert.ok(Array.isArray(enabledBody.backupCodes) && enabledBody.backupCodes.length > 0);
    const secret = new URL(enabledBody.totpURI).searchParams.get('secret');
    assert.ok(secret);

    const confirmTotp = await post('/api/auth/two-factor/verify-totp', { code: generateTotp(secret) }, { cookie });
    assert.equal(confirmTotp.status, 200, await confirmTotp.clone().text());
    cookie = mergeCookies(cookie, confirmTotp.headers);

    const meAfterEnable = await req('/api/me', { headers: { cookie } });
    assert.equal(meAfterEnable.status, 200);
    assert.equal((await meAfterEnable.json()).user.twoFactorEnabled, true);

    await post('/api/auth/sign-out', {}, { cookie });

    const signInRes = await post('/api/auth/sign-in/email', {
      email: 'alice-mfa@example.com',
      password: 'password-123456',
    });
    assert.equal(signInRes.status, 200);
    const signInBody = await signInRes.json();
    assert.equal(signInBody.twoFactorRedirect, true);

    let mfaCookie = mergeCookies('', signInRes.headers);
    assert.equal((await req('/api/me', { headers: { cookie: mfaCookie } })).status, 401);

    const verifyBackup = await post('/api/auth/two-factor/verify-backup-code', {
      code: enabledBody.backupCodes[0],
    }, { cookie: mfaCookie });
    assert.equal(verifyBackup.status, 200);
    mfaCookie = mergeCookies(mfaCookie, verifyBackup.headers);

    const meAfterMfa = await req('/api/me', { headers: { cookie: mfaCookie } });
    assert.equal(meAfterMfa.status, 200);
    assert.equal((await meAfterMfa.json()).user.twoFactorEnabled, true);

    const disabled = await post('/api/auth/two-factor/disable', { password: 'password-123456' }, { cookie: mfaCookie });
    assert.equal(disabled.status, 200, await disabled.clone().text());
    mfaCookie = mergeCookies(mfaCookie, disabled.headers);
    const meAfterDisable = await req('/api/me', { headers: { cookie: mfaCookie } });
    assert.equal(meAfterDisable.status, 200);
    assert.equal((await meAfterDisable.json()).user.twoFactorEnabled, false);
  } finally {
    await worker?.dispose();
    await rm(build, { recursive: true, force: true });
  }
});
