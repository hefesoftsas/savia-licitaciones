import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCompanyDossierHandler } from '../company-dossier.mjs';

test('createCompanyDossierHandler extrae y normaliza perfil, experiencias, certificados y RUP y conserva ilegibles', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-company-dossier-runner-'));
  let sawCombined = false;
  let closed = false;
  try {
    const handler = createCompanyDossierHandler({
      temporaryRoot,
      createAiService: () => ({}),
      createRuntime: () => ({
        close: async () => {
          closed = true;
        },
        runTask: async task => {
          sawCombined = task.files.some(
            file => file.path === 'sources.md' && file.content.includes('Constructora Andina S.A.'),
          );
          const validated = task.validateOutput({
            output_content: JSON.stringify({
              summary: 'Perfil corporativo y experiencia contractual extraídos.',
              profile: {
                companyName: 'Constructora Andina S.A.',
                unifiedSocialCreditCode: '800.123.456-1',
                bidBenchmarks: 'Facturación 2025: 1.500M COP',
              },
              experiences: [
                {
                  projectName: 'Vía Secundaria Norte',
                  projectNumber: 'CT-2024-09',
                  customerName: 'Gobernación de Antioquia',
                  projectType: 'Obras civiles',
                  projectManager: 'Ing. Laura Ríos',
                  contractAmount: '850.000.000 COP',
                  startDate: '2024-01-15',
                  endDate: '2024-11-30',
                  projectStatus: 'Liquidado',
                  introduction: 'Mejoramiento vial rural.',
                },
              ],
              certificates: [
                {
                  name: 'ISO 9001:2015',
                  number: 'CERT-882',
                  validityMode: 'range',
                  validFrom: '2024-03-01',
                  validTo: '2027-02-28',
                },
                {
                  name: 'Certificado fecha invertida',
                  number: 'BAD-1',
                  validityMode: 'range',
                  validFrom: '2026-05-01',
                  validTo: '2025-01-01',
                },
              ],
              rupFacts: [
                {
                  label: 'Patrimonio neto',
                  value: '1200000000',
                  page: 4,
                  sourceFileName: 'empresa.txt',
                },
              ],
            }),
          });
          assert.equal(validated.issues.length, 0);
          return { validation_result: validated.value };
        },
      }),
    });

    const context = {
      job: { id: 'job-dossier' },
      signal: new AbortController().signal,
      getCredential: async () => ({ provider: 'opencode-go', model: 'glm-5', secret: 'fixture-key' }),
      getCompanyDossierFile: async sourceId => {
        if (sourceId === 'ok-1') {
          return {
            name: 'empresa.txt',
            contentType: 'application/octet-stream',
            bytes: new TextEncoder().encode('Constructora Andina S.A. NIT 800.123.456-1').buffer,
          };
        }
        return {
          name: 'vacio.txt',
          contentType: 'text/plain',
          bytes: new TextEncoder().encode('   ').buffer,
        };
      },
    };

    const result = await handler(
      {
        language: 'es',
        market: 'CO',
        dataProcessingConsent: true,
        sources: [
          { id: 'ok-1', fileName: 'empresa.txt' },
          { id: 'empty-2', fileName: 'vacio.txt' },
        ],
      },
      context,
    );

    assert.ok(sawCombined);
    assert.ok(closed);
    assert.equal(result.profile.companyName, 'Constructora Andina S.A.');
    assert.equal(result.experiences[0].projectType, 'construction');
    assert.equal(result.certificates[1].validTo, '');
    assert.equal(result.rupFacts[0].page, 4);
    assert.deepEqual(result.sourceNames, ['empresa.txt']);
    assert.equal(result.unreadableSources.length, 1);
    assert.equal(result.unreadableSources[0].fileName, 'vacio.txt');
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
