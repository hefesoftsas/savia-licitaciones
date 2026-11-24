import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('proposal-review.apply-suggestions sirve revisiones, recibe DOCX y actualiza el borrador Word', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savia-proposal-apply-'));
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
        d1Databases: { DB: 'proposal-apply' },
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
    const pair = await (await post('/api/runner-pairings', {}, { cookie: alice })).json();
    const runner = await (await post('/api/runners/pair', { code: pair.code, name: 'Equipo' })).json();
    const credential = (
      await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'modelo', secret: 'fixture-secret' }, { cookie: alice })).json()
    ).credential;
    const project = (await (await post('/api/projects', { title: 'Proyecto Sugerencias' }, { cookie: alice })).json()).project;
    const aliceUser = await db.prepare('SELECT id FROM "user" WHERE email = ?').bind('alice@example.com').first();

    const originalDocx = Buffer.from('PK\x03\x04original-propuesta');
    const updatedDocx = Buffer.from('PK\x03\x04propuesta-con-sugerencias-aplicadas');
    const techJobId = 'export-word-1';
    const blindJobId = 'blind-inspect-1';
    const rejectionJobId = 'rejection-analyze-1';
    const now = '2026-11-23T12:00:00.000Z';

    const seedArtifactJob = async ({ jobId, kind, payload, key, bytes }) => {
      await files.put(key, bytes);
      await db
        .prepare('INSERT INTO jobs (id, project_id, owner_id, kind, client_request_id, payload_json, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(jobId, project.id, aliceUser.id, kind, `req-${jobId}`, JSON.stringify(payload), 'succeeded', now, now)
        .run();
      await db
        .prepare('INSERT INTO job_artifacts (id, job_id, object_key, sha256, size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(`art-${jobId}`, jobId, key, `sha-${jobId}`, bytes.length, now)
        .run();
    };

    await seedArtifactJob({
      jobId: techJobId,
      kind: 'technical-plan.export-word',
      payload: { planVersion: 1, language: 'es' },
      key: `artifacts/${techJobId}.docx`,
      bytes: originalDocx,
    });
    await seedArtifactJob({
      jobId: blindJobId,
      kind: 'blind-check.inspect',
      payload: { fileIds: [`word-draft:${techJobId}`], language: 'es', preset: 'builtin-general', sensitiveWords: [] },
      key: `artifacts/${blindJobId}.json`,
      bytes: Buffer.from(JSON.stringify({ sourceFile: { id: `word-draft:${techJobId}`, name: 'Borrador.docx' }, summary: { high: 0, medium: 1, low: 0, total: 1 }, ruleErrors: [], groups: [{ id: 'font.color', severity: 'medium', category: 'font', ruleTitle: '文字颜色', message: '文字不是黑色', count: 1, samples: [] }] })),
    });
    await seedArtifactJob({
      jobId: rejectionJobId,
      kind: 'rejection-check.analyze',
      payload: { fileIds: [`word-draft:${techJobId}`], tenderFileIds: [], bidFileIds: [`word-draft:${techJobId}`], language: 'es', dataProcessingConsent: true },
      key: `artifacts/${rejectionJobId}.json`,
      bytes: Buffer.from(JSON.stringify({ status: 'success', typoCheckResult: { status: 'success', findings: [{ id: 't1', wrongText: 'experiensia', correctText: 'experiencia' }] } })),
    });

    const jobsUrl = `/api/projects/${project.id}/jobs`;
    const proposalId = `word-draft:${techJobId}`;

    // Sin consentimiento cuando hay credentialId -> 400
    assert.equal(
      (await post(jobsUrl, { kind: 'proposal-review.apply-suggestions', credentialId: credential.id, payload: { proposalId, reviewJobIds: [blindJobId], language: 'es' } }, { cookie: alice, 'idempotency-key': 'no-consent' })).status,
      400,
    );
    // Sin credencial solo con rejection (no blind-check) -> 400
    assert.equal(
      (await post(jobsUrl, { kind: 'proposal-review.apply-suggestions', payload: { proposalId, reviewJobIds: [rejectionJobId], language: 'es' } }, { cookie: alice, 'idempotency-key': 'need-ai' })).status,
      400,
    );

    const createRes = await post(
      jobsUrl,
      {
        kind: 'proposal-review.apply-suggestions',
        credentialId: credential.id,
        payload: {
          proposalId,
          reviewJobIds: [blindJobId, rejectionJobId],
          language: 'es',
          dataProcessingConsent: true,
        },
      },
      { cookie: alice, 'idempotency-key': 'apply-ok' },
    );
    assert.equal(createRes.status, 201);
    const createdJob = (await createRes.json()).job;

    const auth = { authorization: `Bearer ${runner.token}` };
    const claim = await (await post('/api/runner/jobs/claim', { kinds: ['proposal-review.apply-suggestions'] }, auth)).json();
    assert.equal(claim.job.id, createdJob.id);

    // Descarga propuesta + artefactos de revisión
    const docxRes = await post(`/api/runner/jobs/${createdJob.id}/files/${encodeURIComponent(proposalId)}`, { lease: claim.lease }, auth);
    assert.equal(docxRes.status, 200);
    assert.deepEqual(Buffer.from(await docxRes.arrayBuffer()), originalDocx);

    const blindRes = await post(`/api/runner/jobs/${createdJob.id}/files/${encodeURIComponent(`review-artifact:${blindJobId}`)}`, { lease: claim.lease }, auth);
    assert.equal(blindRes.status, 200);
    assert.equal((await blindRes.json()).summary.total, 1);

    const rejectionRes = await post(`/api/runner/jobs/${createdJob.id}/files/${encodeURIComponent(`review-artifact:${rejectionJobId}`)}`, { lease: claim.lease }, auth);
    assert.equal(rejectionRes.status, 200);
    assert.equal((await rejectionRes.json()).typoCheckResult.findings[0].wrongText, 'experiensia');

    // Subir artefacto DOCX actualizado: actualiza también technical-plan.export-word e incrementa edit_revision
    const uploadRes = await req(`/api/runner/jobs/${createdJob.id}/artifact`, {
      method: 'POST',
      headers: { ...auth, 'x-savia-lease': claim.lease, 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      body: updatedDocx,
    });
    assert.equal(uploadRes.status, 200);
    const uploadedArtifact = (await uploadRes.json()).artifact;
    assert.equal(uploadedArtifact.updatedProposal, true);
    assert.equal(uploadedArtifact.wordRevision, 1);

    const completeRes = await post(
      `/api/runner/jobs/${createdJob.id}/complete`,
      {
        lease: claim.lease,
        status: 'succeeded',
        result: {
          artifactId: uploadedArtifact.id,
          updatedProposal: true,
          wordRevision: 1,
          programmaticFixCount: 1,
          textEditCount: 1,
          summary: 'Propuesta actualizada.',
        },
      },
      auth,
    );
    assert.equal(completeRes.status, 200);

    // El artefacto del borrador Word original ahora contiene los bytes actualizados
    const updatedExportRes = await req(`${jobsUrl}/${techJobId}/artifact`, { headers: { cookie: alice } });
    assert.equal(updatedExportRes.status, 200);
    assert.equal(updatedExportRes.headers.get('etag'), '"1"');
    assert.deepEqual(Buffer.from(await updatedExportRes.arrayBuffer()), updatedDocx);

    const applyArtifactRes = await req(`${jobsUrl}/${createdJob.id}/artifact`, { headers: { cookie: alice } });
    assert.equal(applyArtifactRes.status, 200);
    assert.match(applyArtifactRes.headers.get('content-disposition') || '', /propuesta-actualizada\.docx/);
    assert.deepEqual(Buffer.from(await applyArtifactRes.arrayBuffer()), updatedDocx);

    // También acepta workflowRequirements sin reviewJobIds cuando hay credencial y consentimiento
    assert.equal(
      (await post(jobsUrl, { kind: 'proposal-review.apply-suggestions', credentialId: credential.id, payload: { proposalId, reviewJobIds: [], workflowRequirements: [], language: 'es', dataProcessingConsent: true } }, { cookie: alice, 'idempotency-key': 'empty-reqs' })).status,
      400,
    );
    assert.equal(
      (await post(jobsUrl, { kind: 'proposal-review.apply-suggestions', payload: { proposalId, reviewJobIds: [], workflowRequirements: [{ title: 'Plazo de ejecución', status: 'pending' }], language: 'es' } }, { cookie: alice, 'idempotency-key': 'reqs-no-cred' })).status,
      400,
    );
    const reqCreateRes = await post(
      jobsUrl,
      {
        kind: 'proposal-review.apply-suggestions',
        credentialId: credential.id,
        payload: {
          proposalId,
          reviewJobIds: [],
          workflowRequirements: [
            {
              title: 'Plazo de presentación de la oferta',
              source: 'La oferta tendrá validez mínima de 3 meses.',
              evidence: 'No se especifica el plazo.',
              status: 'pending',
            },
          ],
          language: 'es',
          dataProcessingConsent: true,
        },
      },
      { cookie: alice, 'idempotency-key': 'reqs-only-ok' },
    );
    assert.equal(reqCreateRes.status, 201);
    const reqJob = (await reqCreateRes.json()).job;
    const reqClaim = await (await post('/api/runner/jobs/claim', { kinds: ['proposal-review.apply-suggestions'] }, auth)).json();
    assert.equal(reqClaim.job.id, reqJob.id);
    assert.deepEqual(reqClaim.job.payload.reviewJobs, []);
    assert.deepEqual(reqClaim.job.payload.workflowRequirements, [
      {
        title: 'Plazo de presentación de la oferta',
        source: 'La oferta tendrá validez mínima de 3 meses.',
        evidence: 'No se especifica el plazo.',
        status: 'pending',
      },
    ]);
  } finally {
    await worker?.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
