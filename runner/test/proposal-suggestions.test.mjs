import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { inspectBlindDocument } from '../blind-check.mjs';
import { createProposalSuggestionsHandler } from '../proposal-suggestions.mjs';
import { exportTechnicalPlan } from '../technical-plan-export.mjs';

const require = createRequire(new URL('../../client/package.json', import.meta.url));
const AdmZip = require('adm-zip');
const { findBuiltinPreset } = require('./electron/services/blindCheckPresets.cjs');

test('aplica correcciones de formato y edición IA sobre un DOCX real y limpia temporales', { timeout: 240000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-proposal-runner-'));
  try {
    const exported = await exportTechnicalPlan(
      {
        projectTitle: 'Oferta técnica',
        outline: [
          {
            id: 's1',
            title: 'Metodología',
            number: '1',
            content_mode: 'manual-fill',
            content: 'Nuestro equipo acredita experiensia comprobada en mantenimiento industrial.',
            children: [],
          },
        ],
      },
      { tempRoot: root },
    );
    const profile = findBuiltinPreset('builtin-general').profile;
    const inspected = await inspectBlindDocument(
      { fileName: 'oferta.docx', bytes: exported.bytes, profile, sensitiveWords: [] },
      { tempRoot: root },
    );

    const filesMap = {
      'word-draft:exp1': {
        name: 'Borrador-propuesta-generada.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes: exported.bytes,
      },
      'review-artifact:blind-1': {
        name: 'blind-1.json',
        contentType: 'application/json',
        bytes: Buffer.from(JSON.stringify(inspected)),
      },
      'review-artifact:rej-1': {
        name: 'rej-1.json',
        contentType: 'application/json',
        bytes: Buffer.from(
          JSON.stringify({
            status: 'success',
            typoCheckResult: {
              status: 'success',
              findings: [{ id: 'f1', wrongText: 'experiensia', correctText: 'experiencia', reason: 'Error ortográfico' }],
            },
          }),
        ),
      },
    };

    let uploadedDocx = null;
    const handler = createProposalSuggestionsHandler({
      tempRoot: root,
      createAiService: () => ({}),
      createRuntime: () => ({
        close: async () => {},
        runTask: async (task) => {
          const dumpFile = task.files.find((f) => f.path === 'document-paragraphs.txt');
          const match = /^\[([a-z]+\.?[0-9][0-9a-z.]*)\].*experiensia/m.exec(dumpFile?.content || '');
          assert.ok(match, 'Debe encontrar el párrafo con experiensia en document-paragraphs.txt');
          const workspaceDir = await mkdtemp(join(root, 'agent-ws-'));
          const [configuredTool] = task.create_tools({
            Type: {
              Object: (v) => v,
              Array: (v) => v,
              String: (v) => v,
              Optional: (v) => v,
              Union: (v) => v,
              Literal: (v) => v,
            },
            workspaceDir,
          });
          const res = await configuredTool.execute('call-1', {
            edits: [{ op: 'replace', target: match[1], find: 'experiensia', replace: 'experiencia' }],
          });
          assert.equal(res.details.applied, 1);
          const validated = task.validateOutput({
            output_content: JSON.stringify({
              summary: 'Se corrigió el término.',
              appliedSuggestionCount: 1,
              skippedSuggestions: [],
            }),
          });
          assert.deepEqual(validated.issues, []);
          return { validation_result: validated.value };
        },
      }),
    });

    const result = await handler(
      {
        proposalId: 'word-draft:exp1',
        reviewJobs: [
          { id: 'blind-1', kind: 'blind-check.inspect' },
          { id: 'rej-1', kind: 'rejection-check.analyze' },
        ],
        language: 'es',
        dataProcessingConsent: true,
      },
      {
        job: { id: 'apply-job-1', projectId: 'p1' },
        signal: new AbortController().signal,
        getFileInfo: async (id) => filesMap[id],
        getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture-secret' }),
        uploadArtifact: async (bytes) => {
          uploadedDocx = Buffer.from(bytes);
          return { id: 'art-updated', updatedProposal: true, wordRevision: 1 };
        },
      },
    );

    assert.equal(result.artifactId, 'art-updated');
    assert.equal(result.updatedProposal, true);
    assert.equal(result.wordRevision, 1);
    assert.equal(result.textEditCount, 1);
    assert.ok(uploadedDocx && uploadedDocx.subarray(0, 4).toString('binary') === 'PK\x03\x04');
    const xml = new AdmZip(uploadedDocx).readAsText('word/document.xml');
    assert.ok(xml.includes('experiencia'));
    assert.equal(xml.includes('experiensia'), false);
    assert.equal(JSON.stringify(result).includes('fixture-secret'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('permite corregir requisitos de flujo (workflowRequirements) sin reportes de revisión previos', { timeout: 240000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-proposal-reqs-'));
  try {
    const exported = await exportTechnicalPlan(
      {
        projectTitle: 'Alumbrado Navidad',
        outline: [
          {
            id: 's1',
            title: 'Ejecución',
            number: '1',
            content_mode: 'manual-fill',
            content: 'El contratista ejecutará la instalación en el municipio.',
            children: [],
          },
        ],
      },
      { tempRoot: root },
    );

    let uploadedDocx = null;
    let capturedSuggestions = [];
    const consoleEntries = [];
    const progressStages = [];
    const handler = createProposalSuggestionsHandler({
      tempRoot: root,
      createAiService: () => ({}),
      createRuntime: () => ({
        close: async () => {},
        runTask: async (task) => {
          const suggestionsFile = task.files.find((f) => f.path === 'review-suggestions.json');
          capturedSuggestions = JSON.parse(suggestionsFile?.content || '[]');
          const dumpFile = task.files.find((f) => f.path === 'document-paragraphs.txt');
          const match = /^\[([a-z]+\.?[0-9][0-9a-z.]*)\].*municipio/m.exec(dumpFile?.content || '');
          assert.ok(match, 'Debe encontrar el párrafo de ejecución en document-paragraphs.txt');
          const workspaceDir = await mkdtemp(join(root, 'agent-ws-'));
          const [configuredTool] = task.create_tools({
            Type: {
              Object: (v) => v,
              Array: (v) => v,
              String: (v) => v,
              Optional: (v) => v,
              Union: (v) => v,
              Literal: (v) => v,
            },
            workspaceDir,
          });
          const res = await configuredTool.execute('call-1', {
            edits: [
              {
                op: 'replace',
                target: match[1],
                find: 'El contratista ejecutará la instalación en el municipio.',
                replace: 'El contratista ejecutará la instalación en el municipio dentro del plazo establecido de 30 días.',
              },
            ],
          });
          assert.equal(res.details.applied, 1);
          const validated = task.validateOutput({
            output_content: JSON.stringify({
              summary: 'Se aclaró el plazo de ejecución en la propuesta.',
              appliedSuggestionCount: 1,
              skippedSuggestions: [],
              resolvedRequirements: [
                {
                  title: 'Plazo de ejecución del contrato',
                  evidence: 'Apartado 1 Ejecución: plazo establecido de 30 días.',
                },
              ],
            }),
          });
          assert.deepEqual(validated.issues, []);
          return { validation_result: validated.value };
        },
      }),
    });

    const result = await handler(
      {
        proposalId: 'word-draft:exp2',
        reviewJobs: [],
        workflowRequirements: [
          {
            title: 'Plazo de ejecución del contrato',
            source: 'El plazo de ejecución será de 30 días calendario.',
            evidence: 'No se especifica el plazo exacto en el borrador.',
            status: 'pending',
          },
        ],
        language: 'es',
        dataProcessingConsent: true,
      },
      {
        job: { id: 'apply-req-job-1', projectId: 'p1' },
        signal: new AbortController().signal,
        reportProgress: (stage) => progressStages.push(stage),
        reportConsole: (entry) => consoleEntries.push(entry),
        getFileInfo: async () => ({
          name: 'Borrador-propuesta.docx',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          bytes: exported.bytes,
        }),
        getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'fixture-secret' }),
        uploadArtifact: async (bytes) => {
          uploadedDocx = Buffer.from(bytes);
          return { id: 'art-req-updated', updatedProposal: true, wordRevision: 2 };
        },
      },
    );

    assert.equal(capturedSuggestions.length, 1);
    assert.equal(capturedSuggestions[0].category, 'requirement');
    assert.equal(capturedSuggestions[0].title, 'Plazo de ejecución del contrato');
    assert.equal(result.artifactId, 'art-req-updated');
    assert.equal(result.updatedProposal, true);
    assert.equal(result.wordRevision, 2);
    assert.equal(result.textEditCount, 1);
    assert.equal(result.agentSummary, 'Se aclaró el plazo de ejecución en la propuesta.');
    assert.equal(result.appliedEdits.length, 1);
    assert.equal(result.appliedEdits[0].op, 'replace');
    assert.ok(result.appliedEdits[0].target);
    assert.ok(result.appliedEdits[0].replace.includes('30 días'));
    assert.deepEqual(result.resolvedRequirements, [
      {
        title: 'Plazo de ejecución del contrato',
        evidence: 'Apartado 1 Ejecución: plazo establecido de 30 días.',
      },
    ]);
    assert.ok(progressStages.includes('reading'));
    assert.ok(progressStages.includes('generating'));
    const fixLogs = consoleEntries.filter((entry) => entry.event === 'proposal.fix').map((entry) => entry.text);
    assert.ok(fixLogs.some((line) => line.includes('Plazo de ejecución del contrato')));
    assert.ok(fixLogs.some((line) => line.includes('Editado')));
    const xml = new AdmZip(uploadedDocx).readAsText('word/document.xml');
    assert.ok(xml.includes('30 días'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
