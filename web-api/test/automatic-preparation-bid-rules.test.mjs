import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let buildDir, workerScript;
before(async () => {
  buildDir = await mkdtemp(join(tmpdir(), 'savia-autopilot-bid-rules-'));
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', buildDir], {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' },
  });
  workerScript = await readFile(join(buildDir, 'index.js'), 'utf8');
});
after(async () => {
  if (buildDir) await rm(buildDir, { recursive: true, force: true });
});

async function createBlockedDraftEnv() {
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: workerScript,
      compatibilityDate: '2026-10-30',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: { DB: 'automatic-prep-bid-rules-test' },
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
  for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) {
    for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) {
      await db.prepare(sql).run();
    }
  }
  try {
    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const post = (path, body, headers = {}) =>
      req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

    const signup = await post('/api/auth/sign-up/email', { name: 'alice', email: 'alice@example.com', password: 'password-123456' });
    assert.equal(signup.status, 200);
    const alice = signup.headers.get('set-cookie').split(';')[0];

    const project = (await (await post('/api/projects', { title: 'Proyecto reglas' }, { cookie: alice })).json()).project;
    const path = `/api/projects/${project.id}`;
    await req(`${path}/technical-plan`, { headers: { cookie: alice } });
    const file = (await (await req(`${path}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': 'pliego.txt', 'content-type': 'text/plain' }, body: 'Pliego' })).json()).file;
    const pairing = await (await post('/api/runner-pairings', {}, { cookie: alice })).json();
    const runner = await (await post('/api/runners/pair', { code: pairing.code, name: 'Equipo' })).json();
    const agent = { authorization: `Bearer ${runner.token}` };
    const url = `${path}/automatic-preparation`;
    const command = (action, extra = {}) => post(url, { action, ...extra }, { cookie: alice });
    const state = async () => (await (await req(url, { headers: { cookie: alice } })).json()).preparation;
    const kinds = ['analyze', 'generate-roots', 'expand-outline', 'generate-facts', 'generate-batch', 'export-word'].map(kind => `technical-plan.${kind}`);
    const claim = async () => {
      const response = await post('/api/runner/jobs/claim', { kinds, supportsBidDocuments: true, localModel: true }, agent);
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    };
    const claimNext = async expected => {
      for (let i = 0; i < 8; i++) {
        const result = await claim();
        if (result.job) {
          assert.equal(result.job.kind, `technical-plan.${expected}`);
          return result;
        }
      }
      assert.fail(`No job queued: ${JSON.stringify(await state())}`);
    };
    const complete = async ({ job, lease }, result, status = 'succeeded') => {
      const response = await post(`/api/runner/jobs/${job.id}/complete`, { lease, status, result }, agent);
      assert.equal(response.status, 200, await response.clone().text());
    };

    assert.equal((await command('start', { fileIds: [file.id], localRunner: true, language: 'es', consent: true })).status, 200);
    const incompleteResponseRequirements =
      'Requisitos de la oferta\n\n```json\n{"bidDocuments":{"separate":true,"economicAnnex":null,"pageLimit":null,"format":{}}}\n```';
    for (const [category, content] of [
      ['project-overview', 'Resumen del proyecto'],
      ['technical-score', 'No hay puntuación técnica.'],
      ['response-requirements', incompleteResponseRequirements],
    ]) {
      const active = await claimNext('analyze');
      assert.equal(active.job.payload.category, category);
      await complete(active, { content });
    }

    const chapter = { id: crypto.randomUUID(), title: 'Metodología', description: 'Alcance técnico', attr: '技术', content_mode: 'ai-generate' };
    const rootsJob = await claimNext('generate-roots');
    await complete(rootsJob, { outline: [chapter] });
    const expandJob = await claimNext('expand-outline');
    await complete(expandJob, { outline: [chapter], warnings: [] });
    const factsJob = await claimNext('generate-facts');
    await complete(factsJob, { groups: [{ id: 'plazo', title: 'Plazo', content: 'Dos meses' }] });

    for (let i = 0; i < 4; i++) {
      assert.equal((await claim()).job, null);
      if ((await state()).status === 'blocked') break;
    }
    const blocked = await state();
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.stage, 'draft');
    assert.equal(blocked.reason, 'bid_document_rules_incomplete');

    return { worker, command, state, claim, claimNext, complete, req, post, agent, chapterId: chapter.id };
  } catch (error) {
    await worker.dispose();
    throw error;
  }
}

test('bloquea bid_document_rules_incomplete, valida bidDocumentRules y desbloquea borrador estándar', async () => {
  const { worker, command, claimNext } = await createBlockedDraftEnv();
  try {
    for (const invalid of ['bad', [], { separate: true }, { separate: true, economicAnnex: 0 }, { separate: true, economicAnnex: 1000 }, { separate: true, economicAnnex: 3, pageLimit: 501 }]) {
      assert.equal((await command('resume', { bidDocumentRules: invalid })).status, 400);
    }
    assert.equal((await command('resume', { bidDocumentRules: { separate: false } })).status, 200);
    const batch = await claimNext('generate-batch');
    assert.equal(batch.job.payload.technicalOnly, undefined);
    assert.equal(batch.job.payload.instructions, undefined);
  } finally {
    await worker.dispose();
  }
});

test('desbloquea bid_document_rules_incomplete con anexo económico y límite de páginas', async () => {
  const { worker, command, claimNext } = await createBlockedDraftEnv();
  try {
    assert.equal((await command('resume', { bidDocumentRules: { separate: true, economicAnnex: 3, pageLimit: 20 } })).status, 200);
    const batch = await claimNext('generate-batch');
    assert.equal(batch.job.payload.technicalOnly, true);
    assert.match(batch.job.payload.instructions, /4200/);
  } finally {
    await worker.dispose();
  }
});

test('bloquea word_page_limit_exceeded y permite actualizar o quitar pageLimit', async () => {
  const { worker, command, state, claim, claimNext, complete, req, post, agent, chapterId } = await createBlockedDraftEnv();
  try {
    assert.equal((await command('resume', { bidDocumentRules: { separate: true, economicAnnex: 4, pageLimit: 1 } })).status, 200);
    const batch = await claimNext('generate-batch');
    const draft = await post(`/api/runner/jobs/${batch.job.id}/technical-batch/drafts/${chapterId}`, { lease: batch.lease, content: 'Texto técnico de prueba.' }, agent);
    assert.equal(draft.status, 201, await draft.clone().text());
    await complete(batch, { generatedCount: 1 });

    const word1 = await claimNext('export-word');
    assert.equal(word1.job.payload.pageLimit, 1);
    await complete(word1, { message: 'La memoria técnica tiene 13 páginas y el pliego permite 1.' }, 'failed');
    for (let i = 0; i < 4; i++) {
      assert.equal((await claim()).job, null);
      if ((await state()).status === 'blocked') break;
    }
    const blocked1 = await state();
    assert.equal(blocked1.status, 'blocked');
    assert.equal(blocked1.stage, 'word');
    assert.equal(blocked1.reason, 'word_page_limit_exceeded');

    for (const invalid of [0, 501, '20', 1.5]) {
      assert.equal((await command('resume', { pageLimit: invalid })).status, 400);
    }

    assert.equal((await command('resume', { pageLimit: 25 })).status, 200);
    const word2 = await claimNext('export-word');
    assert.equal(word2.job.payload.bidDocument, 'technical');
    assert.equal(word2.job.payload.pageLimit, 25);
    await complete(word2, { message: 'The technical proposal has 30 pages and the tender allows 25.' }, 'failed');
    for (let i = 0; i < 4; i++) {
      assert.equal((await claim()).job, null);
      if ((await state()).status === 'blocked') break;
    }
    assert.equal((await state()).reason, 'word_page_limit_exceeded');

    assert.equal((await command('resume', { pageLimit: null })).status, 200);
    const word3 = await claimNext('export-word');
    assert.equal(word3.job.payload.bidDocument, 'technical');
    assert.equal(word3.job.payload.pageLimit, undefined);

    const upload = await req(`/api/runner/jobs/${word3.job.id}/artifact`, {
      method: 'POST',
      headers: {
        ...agent,
        'x-savia-lease': word3.lease,
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      body: new Uint8Array([80, 75, 3, 4]),
    });
    assert.equal(upload.status, 200, await upload.clone().text());
    const { artifact } = await upload.json();
    await complete(word3, { artifactId: artifact.id, bidDocument: 'technical' });

    const economicJob = await claimNext('export-word');
    assert.equal(economicJob.job.payload.bidDocument, 'economic');
    await complete(economicJob, { message: 'No se pudo localizar el anexo oficial de la oferta económica en los PDF seleccionados.' }, 'failed');
    for (let i = 0; i < 4; i++) {
      assert.equal((await claim()).job, null);
      if ((await state()).status === 'blocked') break;
    }
    const blockedEconomic = await state();
    assert.equal(blockedEconomic.status, 'blocked');
    assert.equal(blockedEconomic.stage, 'economic');
    assert.equal(blockedEconomic.reason, 'task_failed');

    assert.equal((await command('resume', { bidDocumentRules: { separate: false } })).status, 200);
    for (let i = 0; i < 4; i++) {
      assert.equal((await claim()).job, null);
      if ((await state()).status === 'ready') break;
    }
    const ready = await state();
    assert.equal(ready.status, 'ready');
    assert.equal(ready.wordId, word3.job.id);
    assert.equal(ready.economicId, undefined);
  } finally {
    await worker.dispose();
  }
});
