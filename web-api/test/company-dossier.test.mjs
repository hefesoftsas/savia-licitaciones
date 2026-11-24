import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('company-dossier.extract sube fuentes, respeta aislamiento e idempotencia, entrega archivo al runner y limpia R2 al completar', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savia-company-dossier-'));
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
        d1Databases: { DB: 'company-dossier' },
        r2Buckets: ['FILES'],
        bindings: {
          AUTH_ALLOW_REGISTRATION: 'true',
          BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
          BETTER_AUTH_URL: 'http://localhost',
          CREDENTIAL_KEY_HEX: '11'.repeat(32),
          CREDENTIAL_KEY_ID: 'test',
        },
      }),
    );
    const db = await worker.getD1Database('DB');
    const files = await worker.getR2Bucket('FILES');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) {
      for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) {
        await db.prepare(sql).run();
      }
    }

    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const post = (path, body, headers = {}) =>
      req(path, {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    async function signup(name) {
      return (await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }))
        .headers.get('set-cookie')
        .split(';')[0];
    }

    const alice = await signup('alice');
    const bob = await signup('bob');
    const aliceUser = await db.prepare('SELECT id FROM "user" WHERE email = ?').bind('alice@example.com').first();

    const pair = await (await post('/api/runner-pairings', {}, { cookie: alice })).json();
    const runner = await (await post('/api/runners/pair', { code: pair.code, name: 'Equipo' })).json();

    // Rechaza extensión no permitida, rutas en nombre y ausencia de origin
    const badExt = await req('/api/company-dossier/uploads', {
      method: 'POST',
      headers: { origin: 'http://localhost', cookie: alice, 'x-file-name': 'script.exe' },
      body: 'abc',
    });
    assert.equal(badExt.status, 400);

    const traversalName = await req('/api/company-dossier/uploads', {
      method: 'POST',
      headers: { origin: 'http://localhost', cookie: alice, 'x-file-name': encodeURIComponent('../secret.pdf') },
      body: 'abc',
    });
    assert.equal(traversalName.status, 400);

    const noOrigin = await req('/api/company-dossier/uploads', {
      method: 'POST',
      headers: { cookie: alice, 'x-file-name': 'empresa.txt' },
      body: 'Nombre: Empresa Demo SAS',
    });
    assert.equal(noOrigin.status, 403);

    const uploadRes = await req('/api/company-dossier/uploads', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        cookie: alice,
        'content-type': 'text/plain',
        'x-file-name': encodeURIComponent('Presentación Corporativa.txt'),
      },
      body: 'Nombre: Empresa Demo SAS\nNIT: 900123456-7',
    });
    assert.equal(uploadRes.status, 201);
    const { source } = await uploadRes.json();
    assert.ok(source.id);
    assert.equal(source.fileName, 'Presentación Corporativa.txt');

    // Bob no puede usar el archivo subido por Alice
    const bobAttempt = await post(
      '/api/company-dossier/analyses',
      { sourceIds: [source.id], language: 'es', market: 'CO', credentialId: 'local-runner', dataProcessingConsent: true },
      { cookie: bob, 'idempotency-key': 'bob-1' },
    );
    assert.equal(bobAttempt.status, 404);

    // Encolar análisis con local-runner + idempotencia
    const payload = {
      sourceIds: [source.id],
      language: 'es',
      market: 'CO',
      credentialId: 'local-runner',
      dataProcessingConsent: true,
    };
    const created = await post('/api/company-dossier/analyses', payload, {
      cookie: alice,
      'idempotency-key': 'alice-dossier-1',
    });
    assert.equal(created.status, 201);
    const { job } = await created.json();
    assert.equal(job.kind, 'company-dossier.extract');

    const replay = await post('/api/company-dossier/analyses', payload, {
      cookie: alice,
      'idempotency-key': 'alice-dossier-1',
    });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).job.id, job.id);

    // El runner reclama el trabajo
    const claim = await post(
      '/api/runner/jobs/claim',
      { kinds: ['company-dossier.extract'], localModel: true, localModelSelection: true },
      { authorization: `Bearer ${runner.token}` },
    );
    assert.equal(claim.status, 200);
    const claimed = await claim.json();
    assert.equal(claimed.job.id, job.id);

    // Lease inválido rechazado; lease válido descarga contenido original
    const badLease = await post(
      `/api/runner/jobs/${job.id}/company-dossier/${source.id}`,
      { lease: '0'.repeat(64) },
      { authorization: `Bearer ${runner.token}` },
    );
    assert.equal(badLease.status, 409);

    const dl = await post(
      `/api/runner/jobs/${job.id}/company-dossier/${source.id}`,
      { lease: claimed.lease },
      { authorization: `Bearer ${runner.token}` },
    );
    assert.equal(dl.status, 200);
    assert.match(decodeURIComponent(dl.headers.get('x-savia-file-name') || ''), /Presentación Corporativa\.txt/);
    assert.match(await dl.text(), /Empresa Demo SAS/);

    // Completar tarea y verificar limpieza de R2
    const done = await post(
      `/api/runner/jobs/${job.id}/complete`,
      {
        lease: claimed.lease,
        status: 'succeeded',
        result: {
          summary: 'Datos básicos identificados.',
          profile: { companyName: 'Empresa Demo SAS', unifiedSocialCreditCode: '900123456-7' },
          experiences: [],
          certificates: [],
          rupFacts: [],
          sourceNames: ['Presentación Corporativa.txt'],
          unreadableSources: [],
        },
      },
      { authorization: `Bearer ${runner.token}` },
    );
    assert.equal(done.status, 200);
    assert.equal(await files.head(`company-dossier/${aliceUser.id}/${source.id}`), null);

    const list = await req('/api/company-dossier/analyses', { headers: { cookie: alice } });
    assert.equal(list.status, 200);
    const { jobs } = await list.json();
    assert.equal(jobs[0].state, 'succeeded');
    assert.equal(jobs[0].result.profile.companyName, 'Empresa Demo SAS');

    // Cancelar una tarea en cola también elimina inmediatamente su archivo temporal en R2
    const cancelUpload = await req('/api/company-dossier/uploads', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        cookie: alice,
        'content-type': 'text/plain',
        'x-file-name': 'Temporal.txt',
      },
      body: 'Datos sensibles temporales',
    });
    assert.equal(cancelUpload.status, 201);
    const { source: cancelSource } = await cancelUpload.json();
    const cancelQueued = await post(
      '/api/company-dossier/analyses',
      { sourceIds: [cancelSource.id], language: 'es', market: 'CO', credentialId: 'local-runner', dataProcessingConsent: true },
      { cookie: alice, 'idempotency-key': 'alice-dossier-cancel-1' },
    );
    assert.equal(cancelQueued.status, 201);
    const { job: queuedJob } = await cancelQueued.json();
    const cancelled = await post(`/api/company-dossier/analyses/${queuedJob.id}/cancel`, {}, { cookie: alice });
    assert.equal(cancelled.status, 200);
    assert.equal(await files.head(`company-dossier/${aliceUser.id}/${cancelSource.id}`), null);
  } finally {
    if (worker) await worker.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
