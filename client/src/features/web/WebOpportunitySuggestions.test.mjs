import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const clientRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

async function loadSuggestionModules() {
  const server = await createServer({
    configFile: resolve(clientRoot, 'vite.web.config.ts'),
    root: clientRoot,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: 'custom',
  });
  try {
    const suggestions = await server.ssrLoadModule('/src/features/web/WebOpportunitySuggestions.tsx');
    const autopilot = await server.ssrLoadModule('/src/features/web/WebOpportunityAutopilot.tsx');
    const { ToastProvider } = await server.ssrLoadModule('/src/shared/ui/ToastProvider.tsx');
    const { LanguageProvider } = await server.ssrLoadModule('/src/shared/i18n/index.ts');
    return { server, ToastProvider, LanguageProvider, ...suggestions, ...autopilot };
  } catch (error) {
    await server.close();
    throw error;
  }
}

function makeItem(source, id, title) {
  return {
    id: `${source}:${id}`,
    process: { id, source, title, entity: `Entidad ${source}`, status: 'Publicado' },
    reason: 'Coincidencia de prueba',
    checks: 'Verificar pliego',
    reviewed: false,
    saved: false,
    projectId: null,
  };
}

test('matchesMarketSource y OpportunityResultsView filtran oportunidades según el mercado', async () => {
  const { server, matchesMarketSource, OpportunityResultsView } = await loadSuggestionModules();
  try {
    assert.equal(matchesMarketSource('placsp', 'ES'), true);
    assert.equal(matchesMarketSource('ted', 'ES'), true);
    assert.equal(matchesMarketSource('secop-i', 'ES'), false);
    assert.equal(matchesMarketSource('secop-ii', 'ES'), false);

    assert.equal(matchesMarketSource('secop-i', 'CO'), true);
    assert.equal(matchesMarketSource('secop-ii', 'CO'), true);
    assert.equal(matchesMarketSource('placsp', 'CO'), false);
    assert.equal(matchesMarketSource('ted', 'CO'), false);

    assert.equal(matchesMarketSource('placsp', 'ALL'), true);
    assert.equal(matchesMarketSource('secop-ii', 'ALL'), true);

    const coItem = makeItem('secop-ii', 'co-1', 'Licenciamiento SAP COLPENSIONES');
    const esItem = makeItem('placsp', 'es-1', 'Servicio de mantenimiento PLACSP');
    const html = renderToStaticMarkup(
      React.createElement(OpportunityResultsView, {
        language: 'es',
        market: 'ES',
        items: [coItem, esItem],
        archive: [{ ...coItem, reviewed: true, jobId: 'old-co' }],
        jobId: 'job-1',
        stale: false,
        busy: false,
        onReview() {},
        onSave() {},
        onOpen() {},
        onLoadArchive() {},
      }),
    );
    assert.doesNotMatch(html, /Licenciamiento SAP COLPENSIONES/);
    assert.match(html, /Servicio de mantenimiento PLACSP/);
    assert.match(html, /No hay recomendaciones archivadas/);
  } finally {
    await server.close();
  }
});

test('cambiar de ALL/CO a ES descarta verify=1 tardío con SECOP-II sin mostrarlo bajo ES', async () => {
  const {
    server,
    createOpportunityMarketController,
    resolveMarketResults,
    OpportunityResultsView,
  } = await loadSuggestionModules();
  try {
    let currentMarket = 'ALL';
    let resultsState = null;
    let archiveState = null;
    let verifying = false;
    let jobs = [];
    let releaseSlowVerify;

    const coItem = makeItem('secop-ii', 'chec-1', 'Soporte software CHEC');
    const jobsPayload = { jobs: [{ id: 'job-co', state: 'succeeded', result: null }] };

    const controller = createOpportunityMarketController({
      getMarket: () => currentMarket,
      fetchJobs: async () => jobsPayload,
      fetchResults: async (targetMarket) =>
        targetMarket === 'ES'
          ? { jobId: null, items: [], unreadCount: 0, stale: false }
          : { jobId: 'job-co', items: [coItem], unreadCount: 1, stale: false },
      verifyResults: async (targetMarket) => {
        if (targetMarket === 'ALL') {
          await new Promise((resolvePromise) => {
            releaseSlowVerify = resolvePromise;
          });
          return {
            jobId: 'job-co',
            items: [coItem],
            unreadCount: 1,
            stale: false,
            verificationUnavailable: true,
          };
        }
        return { jobId: null, items: [], unreadCount: 0, stale: false };
      },
      onJobs: (next) => { jobs = next; },
      onResults: (next) => { resultsState = next; },
      onArchive: (next) => { archiveState = next; },
      onVerifying: (next) => { verifying = next; },
    });

    await controller.refresh('ALL');
    assert.equal(jobs.length, 1);
    assert.equal(verifying, true);
    assert.equal(resolveMarketResults(resultsState, 'ALL')?.items.length, 1);

    currentMarket = 'ES';
    controller.resetForMarket();
    assert.equal(verifying, false);
    assert.equal(archiveState, null);
    await controller.refresh('ES');

    assert.ok(releaseSlowVerify);
    releaseSlowVerify();
    await new Promise((resolveTick) => setTimeout(resolveTick, 0));

    assert.equal(verifying, false);
    const esResults = resolveMarketResults(resultsState, 'ES');
    assert.deepEqual(esResults, { jobId: null, items: [], unreadCount: 0, stale: false });

    const html = renderToStaticMarkup(
      React.createElement(OpportunityResultsView, {
        language: 'es',
        market: 'ES',
        items: esResults.items,
        jobId: esResults.jobId,
        stale: esResults.stale,
        verificationUnavailable: esResults.verificationUnavailable,
        busy: false,
        onReview() {},
        onSave() {},
        onOpen() {},
      }),
    );
    assert.doesNotMatch(html, /Soporte software CHEC|SECOP-II/);
    assert.match(html, /Aún no hay un análisis/);
  } finally {
    await server.close();
  }
});

test('en ES con un trabajo previo de CO y jobId nulo no se queda cargando recomendaciones', async () => {
  const {
    server,
    ToastProvider,
    LanguageProvider,
    resolveMarketResults,
    isCheckingOpportunityResults,
    WebOpportunityAutopilot,
  } = await loadSuggestionModules();
  try {
    const jobs = [{ id: 'job-co', state: 'succeeded', result: null }];
    const resultsState = {
      market: 'ES',
      data: { jobId: null, items: [], unreadCount: 0, stale: false },
    };
    const results = resolveMarketResults(resultsState, 'ES');
    const checkingResults = isCheckingOpportunityResults({
      active: undefined,
      latestCompleted: jobs[0],
      results,
    });
    assert.equal(checkingResults, false);

    const html = renderToStaticMarkup(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(
          ToastProvider,
          null,
          React.createElement(WebOpportunityAutopilot, {
            language: 'es',
            market: 'ES',
            settings: {
              refreshHours: 6,
              localRunner: false,
              enabled: true,
              autoEnabled: false,
              runnerAutoEnabled: false,
              runnerLanguage: 'es',
              keywords: 'software',
              version: 1,
              terms: ['software'],
              hasRup: false,
              credentialId: 'cred-1',
              credentialAvailable: true,
              includeRup: false,
            },
            jobs,
            results,
            active: undefined,
            searching: false,
            checkingResults,
            verifyingSecop: false,
            elapsedSeconds: 0,
            busy: false,
            credential: 'cred-1',
            autoEnabled: false,
            archive: null,
            onStartAutopilotSearch: async () => {},
            onToggleAutoRefresh: async () => {},
            onCancel: async () => {},
            onReview: async () => {},
            onOpenDetail() {},
            onLoadArchive: async () => {},
            onOpen() {},
            onOpenAdvanced() {},
          }),
        ),
      ),
    );
    assert.doesNotMatch(html, /Cargando recomendaciones/);
    assert.match(html, /Iniciar primer radar/);
    assert.match(html, /Ejecuta el radar arriba para obtener oportunidades recomendadas/);
  } finally {
    await server.close();
  }
});
