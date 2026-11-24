import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('permite revisar el borrador Word generado en Preparar oferta sin volver a subirlo', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savia-rejection-draft-'));
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
        d1Databases: { DB: 'rejection-draft' },
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
    for (const file of (await readdir(join(root, 'migrations'))).filter((x) => x.endsWith('.sql')).sort()) {
      for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map((x) => x.trim()).filter(Boolean)) {
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
    const pair = await (await post('/api/runner-pairings', {}, { cookie: alice })).json();
    const runner = await (await post('/api/runners/pair', { code: pair.code, name: 'Equipo' })).json();
    const credential = (
      await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'modelo', secret: 'fixture-secret' }, { cookie: alice })).json()
    ).credential;
    const aliceProject = (await (await post('/api/projects', { title: 'Proyecto Alice' }, { cookie: alice })).json()).project;
    const aliceOtherProject = (await (await post('/api/projects', { title: 'Otro Proyecto Alice' }, { cookie: alice })).json()).project;
    const bobProject = (await (await post('/api/projects', { title: 'Proyecto Bob' }, { cookie: bob })).json()).project;
    const aliceUser = await db.prepare('SELECT id FROM "user" WHERE email = ?').bind('alice@example.com').first();
    const bobUser = await db.prepare('SELECT id FROM "user" WHERE email = ?').bind('bob@example.com').first();

    const upload = async (projectId, cookie, name, text) =>
      (await (await req(`/api/projects/${projectId}/files`, { method: 'POST', headers: { cookie, origin: 'http://localhost', 'x-file-name': name, 'content-type': 'text/plain' }, body: text })).json()).file;
    const tender = await upload(aliceProject.id, alice, 'pliego.txt', 'Causal: incumplir plazo.');

    const docxBytes = Buffer.from('PK\x03\x04borrador-propuesta-simulada');
    const seedExport = async ({ jobId, projectId, ownerId, payload, state = 'succeeded', deletedAt = null }) => {
      const now = '2026-11-23T12:00:00.000Z';
      const objectKey = `artifacts/${jobId}.docx`;
      await files.put(objectKey, docxBytes, { httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } });
      await db
        .prepare('INSERT INTO jobs (id, project_id, owner_id, kind, client_request_id, payload_json, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(jobId, projectId, ownerId, 'technical-plan.export-word', `req-${jobId}`, JSON.stringify(payload), state, now, now)
        .run();
      await db
        .prepare('INSERT INTO job_artifacts (id, job_id, object_key, sha256, size, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(`art-${jobId}`, jobId, objectKey, `sha-${jobId}`, docxBytes.length, now, deletedAt)
        .run();
    };

    const techDraftJobId = 'draft-tech-1';
    const economicDraftJobId = 'draft-econ-1';
    const deletedDraftJobId = 'draft-deleted-1';
    const otherProjectDraftJobId = 'draft-other-proj-1';
    const bobDraftJobId = 'draft-bob-1';

    await seedExport({ jobId: techDraftJobId, projectId: aliceProject.id, ownerId: aliceUser.id, payload: { planVersion: 1, language: 'es' } });
    await seedExport({ jobId: economicDraftJobId, projectId: aliceProject.id, ownerId: aliceUser.id, payload: { planVersion: 1, language: 'es', bidDocument: 'economic' } });
    await seedExport({ jobId: deletedDraftJobId, projectId: aliceProject.id, ownerId: aliceUser.id, payload: { planVersion: 1, language: 'es' }, deletedAt: '2026-11-23T13:00:00.000Z' });
    await seedExport({ jobId: otherProjectDraftJobId, projectId: aliceOtherProject.id, ownerId: aliceUser.id, payload: { planVersion: 1, language: 'es' } });
    await seedExport({ jobId: bobDraftJobId, projectId: bobProject.id, ownerId: bobUser.id, payload: { planVersion: 1, language: 'es' } });

    const jobsUrl = `/api/projects/${aliceProject.id}/jobs`;
    const draftId = `word-draft:${techDraftJobId}`;
    const baseAnalyze = {
      kind: 'rejection-check.analyze',
      credentialId: credential.id,
      payload: {
        fileIds: [tender.id, draftId],
        tenderFileIds: [tender.id],
        bidFileIds: [draftId],
        language: 'es',
        dataProcessingConsent: true,
        criteria: 'Causal de prueba',
        customCheckItems: '',
        options: { rejectionCheck: true, typoCheck: false, logicCheck: false },
      },
    };

    // No se admite word-draft: en extracción ni como pliego ni sin ID
    assert.equal(
      (await post(jobsUrl, { kind: 'rejection-check.extract', credentialId: credential.id, payload: { fileIds: [draftId], language: 'es', dataProcessingConsent: true } }, { cookie: alice, 'idempotency-key': 'k1' })).status,
      400,
    );
    assert.equal(
      (await post(jobsUrl, { ...baseAnalyze, payload: { ...baseAnalyze.payload, fileIds: [draftId], tenderFileIds: [draftId], bidFileIds: [] } }, { cookie: alice, 'idempotency-key': 'k2' })).status,
      400,
    );
    assert.equal(
      (await post(jobsUrl, { ...baseAnalyze, payload: { ...baseAnalyze.payload, fileIds: [tender.id, 'word-draft:'], bidFileIds: ['word-draft:'] } }, { cookie: alice, 'idempotency-key': 'k3' })).status,
      400,
    );

    // Se rechazan borradores económicos, eliminados, de otro proyecto o de otro usuario
    for (const [index, badId] of [economicDraftJobId, deletedDraftJobId, otherProjectDraftJobId, bobDraftJobId, 'missing-id'].entries()) {
      const ref = `word-draft:${badId}`;
      const res = await post(
        jobsUrl,
        { ...baseAnalyze, payload: { ...baseAnalyze.payload, fileIds: [tender.id, ref], bidFileIds: [ref] } },
        { cookie: alice, 'idempotency-key': `bad-${index}` },
      );
      assert.equal(res.status, 404, `Esperaba 404 para ${badId}`);
    }

    // Acepta el borrador técnico como Oferta y lo descarga el runner desde R2
    const createdRes = await post(jobsUrl, baseAnalyze, { cookie: alice, 'idempotency-key': 'ok-draft' });
    assert.equal(createdRes.status, 201);
    const createdJob = (await createdRes.json()).job;
    assert.deepEqual(createdJob.payload.bidFileIds, [draftId]);

    const auth = { authorization: `Bearer ${runner.token}` };
    const claim = await (await post('/api/runner/jobs/claim', { kinds: ['rejection-check.analyze'] }, auth)).json();
    assert.equal(claim.job.id, createdJob.id);

    const fileRes = await post(`/api/runner/jobs/${createdJob.id}/files/${encodeURIComponent(draftId)}`, { lease: claim.lease }, auth);
    assert.equal(fileRes.status, 200);
    assert.equal(fileRes.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.equal(decodeURIComponent(fileRes.headers.get('x-savia-file-name') || ''), 'Borrador-propuesta-generada.docx');
    assert.deepEqual(Buffer.from(await fileRes.arrayBuffer()), docxBytes);

    // Un archivo no seleccionado sigue devolviendo 409 lease_conflict
    const denied = await post(`/api/runner/jobs/${createdJob.id}/files/${encodeURIComponent(`word-draft:${otherProjectDraftJobId}`)}`, { lease: claim.lease }, auth);
    assert.equal(denied.status, 409);

    // Anonimato (blind-check.inspect) acepta word-draft: como oferta DOCX y rechaza pliego/vacío/ajeno
    assert.equal(
      (await post(jobsUrl, { kind: 'blind-check.inspect', payload: { fileIds: ['word-draft:'], language: 'es', preset: 'builtin-general', sensitiveWords: [] } }, { cookie: alice, 'idempotency-key': 'blind-empty' })).status,
      400,
    );
    assert.equal(
      (await post(jobsUrl, { kind: 'blind-check.inspect', credentialId: credential.id, payload: { fileIds: [tender.id, draftId], bidFileId: tender.id, tenderFileId: draftId, language: 'es', preset: 'builtin-general', sensitiveWords: [], aiReview: true, dataProcessingConsent: true } }, { cookie: alice, 'idempotency-key': 'blind-tender' })).status,
      400,
    );
    assert.equal(
      (await post(jobsUrl, { kind: 'blind-check.inspect', payload: { fileIds: [`word-draft:${economicDraftJobId}`], language: 'es', preset: 'builtin-general', sensitiveWords: [] } }, { cookie: alice, 'idempotency-key': 'blind-econ' })).status,
      404,
    );
    const blindRes = await post(
      jobsUrl,
      { kind: 'blind-check.inspect', payload: { fileIds: [draftId], language: 'es', preset: 'builtin-general', sensitiveWords: [] } },
      { cookie: alice, 'idempotency-key': 'blind-ok' },
    );
    assert.equal(blindRes.status, 201);
    const blindJob = (await blindRes.json()).job;
    const blindClaim = await (await post('/api/runner/jobs/claim', { kinds: ['blind-check.inspect'] }, auth)).json();
    assert.equal(blindClaim.job.id, blindJob.id);
    const blindFileRes = await post(`/api/runner/jobs/${blindJob.id}/files/${encodeURIComponent(draftId)}`, { lease: blindClaim.lease }, auth);
    assert.equal(blindFileRes.status, 200);
    assert.deepEqual(Buffer.from(await blindFileRes.arrayBuffer()), docxBytes);

    // Evaluación (bid-evaluation.analyze) acepta word-draft: solo como bid y lo descarga desde R2
    assert.equal(
      (await post(jobsUrl, { kind: 'bid-evaluation.analyze', credentialId: credential.id, payload: { fileIds: [tender.id, draftId], tenderFileIds: [draftId], bidFileIds: [tender.id], language: 'es', dataProcessingConsent: true } }, { cookie: alice, 'idempotency-key': 'eval-tender' })).status,
      400,
    );
    assert.equal(
      (await post(jobsUrl, { kind: 'bid-evaluation.analyze', credentialId: credential.id, payload: { fileIds: [tender.id, `word-draft:${bobDraftJobId}`], tenderFileIds: [tender.id], bidFileIds: [`word-draft:${bobDraftJobId}`], language: 'es', dataProcessingConsent: true } }, { cookie: alice, 'idempotency-key': 'eval-bob' })).status,
      404,
    );
    const evalRes = await post(
      jobsUrl,
      { kind: 'bid-evaluation.analyze', credentialId: credential.id, payload: { fileIds: [tender.id, draftId], tenderFileIds: [tender.id], bidFileIds: [draftId], language: 'es', dataProcessingConsent: true } },
      { cookie: alice, 'idempotency-key': 'eval-ok' },
    );
    assert.equal(evalRes.status, 201);
    const evalJob = (await evalRes.json()).job;
    const evalClaim = await (await post('/api/runner/jobs/claim', { kinds: ['bid-evaluation.analyze'] }, auth)).json();
    assert.equal(evalClaim.job.id, evalJob.id);
    const evalFileRes = await post(`/api/runner/jobs/${evalJob.id}/files/${encodeURIComponent(draftId)}`, { lease: evalClaim.lease }, auth);
    assert.equal(evalFileRes.status, 200);

    // Duplicados (duplicate-check.analyze) acepta word-draft: solo como bid y rechaza pliego/ajeno
    assert.equal(
      (await post(jobsUrl, { kind: 'duplicate-check.analyze', payload: { fileIds: [draftId], tenderFileIds: [draftId], bidFileIds: [], language: 'es' } }, { cookie: alice, 'idempotency-key': 'dup-empty' })).status,
      400,
    );
    assert.equal(
      (await post(jobsUrl, { kind: 'duplicate-check.analyze', payload: { fileIds: [tender.id, draftId], tenderFileIds: [draftId], bidFileIds: [tender.id], language: 'es' } }, { cookie: alice, 'idempotency-key': 'dup-tender' })).status,
      400,
    );
    assert.equal(
      (await post(jobsUrl, { kind: 'duplicate-check.analyze', payload: { fileIds: [tender.id, `word-draft:${deletedDraftJobId}`], tenderFileIds: [tender.id], bidFileIds: [`word-draft:${deletedDraftJobId}`], language: 'es' } }, { cookie: alice, 'idempotency-key': 'dup-deleted' })).status,
      404,
    );
    const dupRes = await post(
      jobsUrl,
      { kind: 'duplicate-check.analyze', payload: { fileIds: [tender.id, draftId], tenderFileIds: [tender.id], bidFileIds: [draftId], language: 'es' } },
      { cookie: alice, 'idempotency-key': 'dup-ok' },
    );
    assert.equal(dupRes.status, 201);
    const dupJob = (await dupRes.json()).job;
    const dupClaim = await (await post('/api/runner/jobs/claim', { kinds: ['duplicate-check.analyze'] }, auth)).json();
    assert.equal(dupClaim.job.id, dupJob.id);
    const dupFileRes = await post(`/api/runner/jobs/${dupJob.id}/files/${encodeURIComponent(draftId)}`, { lease: dupClaim.lease }, auth);
    assert.equal(dupFileRes.status, 200);
  } finally {
    await worker?.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
