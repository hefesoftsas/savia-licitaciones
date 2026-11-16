import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTechnicalAnalysisHandler } from '../technical-analysis.mjs';

test('analiza cada dimensión con los documentos seleccionados y el idioma solicitado', async () => {
  const calls = [];
  const handler = createTechnicalAnalysisHandler({ createDraft: () => async (payload, context) => { calls.push({ payload, context }); return { answer: 'Resultado con fuente.' }; } });
  const context = { signal: new AbortController().signal, assertRequirementSources: async () => {} };
  for (const category of ['project-overview', 'technical-score', 'response-requirements']) {
    const result = await handler({ category, fileIds: ['doc'], language: 'es', dataProcessingConsent: true }, context);
    assert.equal(result.content, 'Resultado con fuente.');
    assert.deepEqual(calls.at(-1).payload.fileIds, ['doc']);
    assert.match(calls.at(-1).payload.question, /fuente|documento/i);
  }
  assert.match(calls[1].payload.question, /puntuaci|puntaje/i);
  await assert.rejects(handler({ category: 'unknown', fileIds: ['doc'], dataProcessingConsent: true }, context), /análisis/i);
  await assert.rejects(handler({ category: 'technical-score', fileIds: ['doc'], dataProcessingConsent: false }, context), /consentimiento/i);
});

test('no procesa fuentes obsoletas y descarta el resultado si cambian durante la ejecución', async () => {
  let calls = 0, checks = 0;
  const handler = createTechnicalAnalysisHandler({ createDraft: () => async () => { calls++; return { answer: 'análisis' }; } });
  const payload = { category: 'project-overview', fileIds: ['doc'], language: 'es', dataProcessingConsent: true };
  const conflict = Object.assign(new Error('conflict'), { status: 409 });
  await assert.rejects(handler(payload, { signal: new AbortController().signal, assertRequirementSources: async () => { throw conflict; } }), /documentos fuente cambiaron/i);
  assert.equal(calls, 0);
  await assert.rejects(handler(payload, { signal: new AbortController().signal, assertRequirementSources: async () => { checks++; if (checks === 2) throw conflict; } }), /documentos fuente cambiaron/i);
  assert.equal(calls, 1);
});
