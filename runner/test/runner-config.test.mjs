import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  fetchRunnerConfig,
  applyRunnerConfigToPiOptions,
} from '../runner-config.mjs';
import { runOnce, clearRunnerConfigCache } from '../work-loop.mjs';

const require = createRequire(import.meta.url);
const {
  resolveRunnerConfig,
  resolvePiRuntimeOverrides,
} = require('../../client/electron/services/pi/piSessionFactory.cjs');

test('fetchRunnerConfig sends Bearer token and normalizes web-api overrides payload', async () => {
  let seenAuth = '';
  let seenUrl = '';
  let seenMethod = '';
  const config = await fetchRunnerConfig({
    apiUrl: 'https://savia.example.com/',
    runnerToken: 'tok-123',
    fetchImpl: async (url, init) => {
      seenUrl = url;
      seenMethod = init.method;
      seenAuth = init.headers.authorization;
      return new Response(JSON.stringify({
        items: [],
        overrides: {
          skills: ['Skill A', '  ', 'Skill B'],
          hooks: {
            'hook:task-completion': { enabled: false, config: { strict: true } },
          },
          prompts: {
            'prompt:agent-workspace': 'Custom workspace prompt',
          },
        },
        updatedAt: '2026-11-16T00:00:00Z',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.equal(seenUrl, 'https://savia.example.com/api/runner/config');
  assert.equal(seenMethod, 'GET');
  assert.equal(seenAuth, 'Bearer tok-123');
  assert.deepEqual(config, {
    skills: ['Skill A', 'Skill B'],
    hooks: {
      'hook:task-completion': { enabled: false, config: { strict: true } },
    },
    prompts: {
      'prompt:agent-workspace': 'Custom workspace prompt',
    },
  });
});

test('fetchRunnerConfig falls back to empty defaults when offline, HTTP error, or missing args', async () => {
  const empty = { skills: [], hooks: {}, prompts: {} };
  assert.deepEqual(await fetchRunnerConfig({ apiUrl: '', runnerToken: 'tok' }), empty);
  assert.deepEqual(await fetchRunnerConfig({ apiUrl: 'https://savia.example.com', runnerToken: '' }), empty);
  assert.deepEqual(
    await fetchRunnerConfig({
      apiUrl: 'https://savia.example.com',
      runnerToken: 'tok',
      fetchImpl: async () => new Response('Server error', { status: 503 }),
    }),
    empty,
  );
  assert.deepEqual(
    await fetchRunnerConfig({
      apiUrl: 'https://savia.example.com',
      runnerToken: 'tok',
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
    }),
    empty,
  );
});

test('applyRunnerConfigToPiOptions merges skills, prompt overrides, and hookOverrides without mutating input', () => {
  const original = {
    workspaceInstructions: 'Base instructions',
    environment: { instructions: 'Base instructions', shellPath: '/bin/sh' },
    hookOverrides: { existing: { enabled: true } },
  };
  const updated = applyRunnerConfigToPiOptions(original, {
    skills: ['Use structured citations.', 'Verify RUP codes.'],
    hooks: { 'hook:retry-error-normalizer': { enabled: false } },
    prompts: {
      'prompt:agent-workspace': 'Override workspace',
      'prompt:pi-no-summary': 'No summary override',
      'prompt:fixed-tool-list': 'Fixed tools override',
    },
  });

  assert.equal(original.workspaceInstructions, 'Base instructions');
  assert.equal(original.environment.instructions, 'Base instructions');
  assert.equal(
    updated.workspaceInstructions,
    'Override workspace\n\n## Active Runner Skills\n\nUse structured citations.\n\nVerify RUP codes.',
  );
  assert.equal(updated.environment.instructions, updated.workspaceInstructions);
  assert.equal(updated.environment.shellPath, '/bin/sh');
  assert.deepEqual(updated.promptOverrides, {
    'prompt:agent-workspace': 'Override workspace',
    'prompt:pi-no-summary': 'No summary override',
    'prompt:fixed-tool-list': 'Fixed tools override',
  });
  assert.deepEqual(updated.hookOverrides, {
    existing: { enabled: true },
    'hook:retry-error-normalizer': { enabled: false },
  });
});

test('work-loop runOnce fetches runner config, sets SAVIA_RUNNER_CONFIG_JSON during job, and falls back offline', async () => {
  clearRunnerConfigCache();
  let envDuringJob;
  let contextRunnerConfig;
  let configCalls = 0;

  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (req.url === '/api/runner/config') {
      configCalls++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        overrides: {
          skills: ['Runner skill 1'],
          hooks: { 'hook:task-completion': { enabled: false } },
          prompts: { 'prompt:pi-no-summary': 'Custom no summary' },
        },
      }));
      return;
    }
    if (req.url.endsWith('/claim')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ job: { id: 'job-1', kind: 'test', payload: {} }, lease: 'lease-1', leaseDurationMs: 5000 }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const outcome = await runOnce({
      server: baseUrl,
      token: 'tok-abc',
      runnerConfigCacheMs: 0,
      localCredentialLoader: async () => null,
      handlers: {
        test: async (_payload, context) => {
          contextRunnerConfig = context.runnerConfig;
          envDuringJob = process.env.SAVIA_RUNNER_CONFIG_JSON;
          return { ok: true };
        },
      },
    });
    assert.equal(outcome.state, 'succeeded');
    assert.equal(configCalls, 1);
    assert.equal(process.env.SAVIA_RUNNER_CONFIG_JSON, undefined);
    assert.deepEqual(contextRunnerConfig, {
      skills: ['Runner skill 1'],
      hooks: { 'hook:task-completion': { enabled: false } },
      prompts: { 'prompt:pi-no-summary': 'Custom no summary' },
    });
    assert.deepEqual(JSON.parse(envDuringJob), contextRunnerConfig);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('piSessionFactory resolveRunnerConfig and resolvePiRuntimeOverrides apply prompts, skills, and hook disables', () => {
  const prevEnv = process.env.SAVIA_RUNNER_CONFIG_JSON;
  try {
    process.env.SAVIA_RUNNER_CONFIG_JSON = JSON.stringify({
      skills: ['Skill from env'],
      hooks: {
        'hook:retry-error-normalizer': { enabled: false },
        'hook:task-completion': { enabled: false },
        'hook:fixed-tool-list': { enabled: false },
      },
      prompts: {
        'prompt:agent-workspace': 'Custom workspace from env',
        'prompt:pi-no-summary': 'Custom no summary',
        'prompt:fixed-tool-list': 'Custom fixed tools',
      },
    });

    const fromEnv = resolveRunnerConfig();
    assert.deepEqual(fromEnv.skills, ['Skill from env']);

    const overrides = resolvePiRuntimeOverrides({
      environment: { instructions: 'Default workspace' },
      summaryEnabled: false,
      fixedToolList: true,
    });

    assert.equal(overrides.workspaceInstructions, 'Custom workspace from env\n\n## Active Runner Skills\n\nSkill from env');
    assert.equal(overrides.retryErrorNormalizerEnabled, false);
    assert.equal(overrides.taskCompletionEnabled, false);
    assert.equal(overrides.fixedToolListHookEnabled, false);
    assert.deepEqual(overrides.appendSystemPrompt, ['Custom no summary']);

    const enabledOverrides = resolvePiRuntimeOverrides({
      runnerConfig: {
        skills: [],
        hooks: {},
        prompts: { 'prompt:fixed-tool-list': 'Custom fixed tools' },
      },
      environment: { instructions: 'Default workspace' },
      summaryEnabled: false,
      fixedToolList: true,
    });
    assert.equal(enabledOverrides.workspaceInstructions, 'Default workspace');
    assert.equal(enabledOverrides.retryErrorNormalizerEnabled, true);
    assert.equal(enabledOverrides.taskCompletionEnabled, true);
    assert.equal(enabledOverrides.fixedToolListHookEnabled, true);
    assert.equal(enabledOverrides.appendSystemPrompt.length, 2);
    assert.equal(enabledOverrides.appendSystemPrompt[1], 'Custom fixed tools');
  } finally {
    if (prevEnv === undefined) delete process.env.SAVIA_RUNNER_CONFIG_JSON;
    else process.env.SAVIA_RUNNER_CONFIG_JSON = prevEnv;
  }
});

test('runner/build.mjs includes runner-config.mjs in bundled runner files', async () => {
  const buildPath = join(fileURLToPath(new URL('..', import.meta.url)), 'build.mjs');
  const source = await readFile(buildPath, 'utf8');
  assert.ok(source.includes("'runner-config.mjs'"));
});
