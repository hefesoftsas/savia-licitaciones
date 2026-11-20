import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

import {
  buildTedExpertQuery,
  escapeTedPhrase,
  mapTedNoticeToProcess,
} from '../src/ted-europa.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('buildTedExpertQuery construye consultas TED v3 y ordenación válidas', () => {
  assert.equal(escapeTedPhrase('agua "potable" \\ test\n'), 'agua potable test');

  const spainQuery = buildTedExpertQuery(
    {
      keyword: 'agua potable "red"',
      classificationClass: '7200',
      entity: 'Ministerio "Hacienda"',
      reference: 'EXP-2026/01',
      contractType: '2',
      euFunded: 'EU',
      modality: ['Abierto'],
      minValue: 50000,
      maxValue: 900000,
      fromDate: '2026-01-01',
      sortBy: 'value',
      sortDirection: 'asc',
    },
    { defaultCountries: ['ESP'], spanishTerritories: ['País Vasco'], openOnly: true }
  );
  assert.match(spainQuery, /\(FT ~ "agua" AND FT ~ "potable" AND FT ~ "red"\)/);
  assert.match(spainQuery, /place-of-performance-subdiv-lot = ES21\*/);
  assert.match(spainQuery, /\(place-of-performance-country-lot IN \(ESP\) OR buyer-country IN \(ESP\)\)/);
  assert.match(spainQuery, /classification-cpv = 7200\*/);
  assert.match(spainQuery, /contract-nature IN \(services\)/);
  assert.match(spainQuery, /buyer-name ~ "Ministerio Hacienda"/);
  assert.match(spainQuery, /\(internal-identifier-proc = \*EXP-2026\/01\* OR FT ~ "EXP-2026\/01"\)/);
  assert.match(spainQuery, /eu-fund-lot = eu-funds/);
  assert.match(spainQuery, /procedure-type IN \(open\)/);
  assert.match(spainQuery, /notice-type IN \(cn-standard/);
  assert.match(spainQuery, /estimated-value-proc >= 50000/);
  assert.match(spainQuery, /estimated-value-proc <= 900000/);
  assert.match(spainQuery, /publication-date >= 20260101/);
  assert.ok(spainQuery.endsWith('SORT BY estimated-value-proc'));
  assert.doesNotMatch(spainQuery, /\bASC\b/);

  const multiCountry = buildTedExpertQuery(
    {
      department: ['España (ESP)', 'Francia (FRA)'],
      cpvCode: '72200000',
      reference: '70899-2026',
      euFunded: 'NO-EU',
      status: ['Adjudicado'],
      sortBy: 'deadline',
      sortDirection: 'desc',
    },
    { defaultCountries: ['ESP'], openOnly: false }
  );
  assert.match(multiCountry, /place-of-performance-country-lot IN \(ESP FRA\)/);
  assert.match(multiCountry, /classification-cpv = 72200000 /);
  assert.match(multiCountry, /publication-number = 70899-2026/);
  assert.match(multiCountry, /eu-fund-lot = no-eu-funds/);
  assert.match(multiCountry, /notice-type IN \(can-standard can-social can-desg can-tran veat\)/);
  assert.ok(multiCountry.endsWith('SORT BY deadline-receipt-tender-date-lot DESC'));

  const allEuQuery = buildTedExpertQuery(
    { department: [] },
    { defaultCountries: ['ESP'], openOnly: true }
  );
  assert.doesNotMatch(allEuQuery, /country-lot IN/);
  assert.ok(allEuQuery.endsWith('SORT BY publication-date DESC'));
});

test('mapTedNoticeToProcess normaliza territorios NUTS, importes por lotes, plazos y portalUrl', () => {
  const esNotice = mapTedNoticeToProcess({
    'publication-number': '70899-2026',
    'internal-identifier-proc': 'URA/001A/2026',
    'title-proc': { spa: 'Servicio de prevención contra inundaciones' },
    'description-proc': { spa: 'Estudios hidráulicos' },
    'buyer-name': { spa: ['Gobierno Vasco - Agencia Vasca del Agua'] },
    'classification-cpv': ['71311100', '71322200'],
    'contract-nature': ['services'],
    'procedure-type': 'open',
    'notice-type': 'cn-standard',
    'estimated-value-lot': ['120000.5', '80000.25'],
    'estimated-value-cur-lot': ['EUR'],
    'publication-date': '2026-01-30+01:00',
    'deadline-receipt-tender-date-lot': ['2099-03-01+01:00', '2099-05-15+02:00'],
    'deadline-receipt-tender-time-lot': ['12:00:00+01:00', '14:00:00+02:00'],
    'place-of-performance-country-lot': ['ESP'],
    'place-of-performance-subdiv-lot': ['ES300', 'ES213'],
    'place-of-performance-city-lot': { mul: ['Vitoria-Gasteiz'] },
    'document-url-lot': ['https://contrataciondelestado.es/wps/poc?idEvl=ABC%2B123&uri=deeplink:detalle_licitacion'],
    links: {
      html: { SPA: 'https://ted.europa.eu/es/notice/-/detail/70899-2026' },
      pdf: { SPA: 'https://ted.europa.eu/es/notice/70899-2026/pdf' },
    },
  }, { now: Date.parse('2026-11-20T12:00:00Z'), preferredNuts: ['ES21'] });

  assert.equal(esNotice.id, 'ted:70899-2026');
  assert.equal(esNotice.source, 'ted');
  assert.equal(esNotice.country, 'ES');
  assert.equal(esNotice.territory, 'País Vasco');
  assert.equal(esNotice.city, 'Vitoria-Gasteiz');
  assert.equal(esNotice.value, 200000.75);
  assert.equal(esNotice.currency, 'EUR');
  assert.equal(esNotice.currencyVerified, true);
  assert.equal(esNotice.publicationDate, '2026-01-30');
  assert.equal(esNotice.deadline, '2099-05-15T14:00:00');
  assert.equal(esNotice.deadlineVerified, true);
  assert.equal(esNotice.status, 'Publicado');
  assert.equal(esNotice.statusCode, 'PUB');
  assert.equal(esNotice.modality, 'Abierto · Servicios');
  assert.deepEqual(esNotice.cpvCodes, ['71311100', '71322200']);
  assert.equal(esNotice.portalUrl, 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=ABC%2B123');
  assert.equal(esNotice.documents[0].id, 'TED-70899-2026');

  const euFallbackNotice = mapTedNoticeToProcess({
    'publication-number': '312624-2020',
    'notice-title': { spa: 'Francia-Marne: Equipamiento médico', fra: 'France-Marne: Équipement' },
    'buyer-name': { fra: ['Union des groupements d’achats publics'] },
    'buyer-country': ['FRA'],
    'notice-type': 'can-standard',
    'publication-date': '2020-07-06+02:00',
    'document-url-lot': ['https://evil.example/docs'],
  });
  assert.equal(euFallbackNotice.title, 'Francia-Marne: Equipamiento médico');
  assert.equal(euFallbackNotice.entity, 'Union des groupements d’achats publics');
  assert.equal(euFallbackNotice.country, 'FR');
  assert.equal(euFallbackNotice.territory, 'Francia');
  assert.equal(euFallbackNotice.statusCode, 'ADJ');
  assert.equal(euFallbackNotice.portalUrl, undefined);

  const expiredNotice = mapTedNoticeToProcess({
    'publication-number': '100-2020',
    'title-proc': { spa: 'Anuncio vencido' },
    'notice-type': 'cn-standard',
    'deadline-receipt-tender-date-lot': ['2020-01-01'],
    'deadline-receipt-tender-time-lot': ['12:00:00'],
  }, { now: Date.parse('2026-11-20T12:00:00Z') });
  assert.equal(expiredNotice.statusCode, 'RES');
  assert.equal(expiredNotice.status, 'Cerrado');
});

test('web-api integra TED Europa como fuente propia y dentro de PLACSP con detalle, importación y watch', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-ted-test-'));
  let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' },
    });

    let tedWatchStatus = 'cn-standard';
    let tedWatchDeadline = '2099-06-01';
    let tedWatchExtraDoc = false;
    let tedPdfBlocked = true;
    const tedQueries = [];

    const euskadiNotice = {
      'publication-number': '70899-2026',
      'internal-identifier-proc': 'URA/EUS/2026',
      'title-proc': { spa: 'Asistencia técnica inundaciones Euskadi' },
      'buyer-name': { spa: ['Agencia Vasca del Agua'] },
      'classification-cpv': ['71311100'],
      'contract-nature': ['services'],
      'procedure-type': 'open',
      'notice-type': 'cn-standard',
      'estimated-value-proc': '450000',
      'estimated-value-cur-proc': 'EUR',
      'publication-date': '2026-11-18+01:00',
      'deadline-receipt-tender-date-lot': ['2099-05-15+02:00'],
      'deadline-receipt-tender-time-lot': ['13:00:00+02:00'],
      'place-of-performance-country-lot': ['ESP'],
      'place-of-performance-subdiv-lot': ['ES213'],
      'document-url-lot': ['https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=TED-EUS-1'],
      links: {
        html: { SPA: 'https://ted.europa.eu/es/notice/-/detail/70899-2026' },
        pdf: { SPA: 'https://ted.europa.eu/es/notice/70899-2026/pdf' },
      },
    };

    const dupByUrlNotice = {
      ...euskadiNotice,
      'publication-number': '70900-2026',
      'internal-identifier-proc': 'EXP-DUP-URL',
      'title-proc': { spa: 'Duplicado por enlace PLACSP' },
      'document-url-lot': ['https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=PORTAL-MAIN'],
    };

    const dupByRefEntityNotice = {
      ...euskadiNotice,
      'publication-number': '70901-2026',
      'internal-identifier-proc': 'LICIT-REF-2026',
      'buyer-name': { spa: ['Ministerio de Prueba'] },
      'title-proc': { spa: 'Duplicado por expediente y entidad' },
      'document-url-lot': ['https://www.contratacion.euskadi.eus/ejemplo'],
    };

    const franceNotice = {
      'publication-number': '800111-2026',
      'internal-identifier-proc': 'FR-2026-09',
      'title-proc': { spa: 'Estudios hidráulicos Francia', fra: 'Études hydrauliques' },
      'buyer-name': { fra: ['Région Nouvelle-Aquitaine'] },
      'classification-cpv': ['71311100'],
      'contract-nature': ['services'],
      'procedure-type': 'open',
      'notice-type': 'cn-standard',
      'estimated-value-proc': '720000',
      'estimated-value-cur-proc': 'EUR',
      'publication-date': '2026-11-19+01:00',
      'deadline-receipt-tender-date-lot': ['2099-07-01+02:00'],
      'deadline-receipt-tender-time-lot': ['12:00:00+02:00'],
      'place-of-performance-country-lot': ['FRA'],
      'buyer-country': ['FRA'],
      links: {
        html: { SPA: 'https://ted.europa.eu/es/notice/-/detail/800111-2026' },
        pdf: { SPA: 'https://ted.europa.eu/es/notice/800111-2026/pdf' },
      },
    };

    const pageNotices = Array.from({ length: 22 }, (_, i) => ({
      ...euskadiNotice,
      'publication-number': `${910000 + i}-2026`,
      'internal-identifier-proc': `PAGE-${i + 1}`,
      'title-proc': { spa: `TED Página item ${i + 1}` },
    }));

    const outboundService = async request => {
      const url = new URL(request.url);
      if (url.hostname === 'api.ted.europa.eu' && url.pathname === '/v3/notices/search') {
        const body = await request.json();
        tedQueries.push(body);
        const q = body.query || '';
        const limit = body.limit || 20;
        const page = body.page || 1;
        if (q.includes('publication-number = 70899-2026')) {
          return Response.json({
            notices: [{
              ...euskadiNotice,
              'notice-type': tedWatchStatus,
              'deadline-receipt-tender-date-lot': [`${tedWatchDeadline}+02:00`],
            }],
            totalNoticeCount: 1,
          });
        }
        if (q.includes('publication-number = 800111-2026')) {
          return Response.json({ notices: [franceNotice], totalNoticeCount: 1 });
        }
        if (q.includes('IN (FRA)')) {
          return Response.json({ notices: [franceNotice], totalNoticeCount: 1 });
        }
        if (q.includes('paginacion-ted')) {
          const start = (page - 1) * limit;
          return Response.json({
            notices: pageNotices.slice(start, start + limit),
            totalNoticeCount: pageNotices.length,
          });
        }
        if (q.includes('FT ~ "inundaciones"')) {
          return Response.json({
            notices: [euskadiNotice, dupByUrlNotice, dupByRefEntityNotice],
            totalNoticeCount: 3,
          });
        }
        return Response.json({ notices: [euskadiNotice], totalNoticeCount: 1 });
      }

      if (url.hostname === 'api.licit.es') {
        const { q } = await request.json();
        if (q !== 'inundaciones') return Response.json({ resultados: [] });
        return Response.json({
          resultados: [
            {
              id: '00000000-0000-0000-0000-000000000111',
              expediente: 'EXP-MAIN-2026',
              titulo: 'Obras hidráulicas principales',
              organo: 'Confederación Hidrográfica',
              estado: 'EN PLAZO',
              fecha_publicacion: '2026-11-18',
              fecha_limite: '2099-04-01',
              hora_limite: '14:00:00',
              url_place: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=PORTAL-MAIN',
            },
            {
              id: '00000000-0000-0000-0000-000000000222',
              expediente: 'LICIT-REF-2026',
              titulo: 'Control de cauces',
              organo: 'Ministerio de Prueba',
              estado: 'EN PLAZO',
              fecha_publicacion: '2026-11-18',
              fecha_limite: '2099-04-02',
              hora_limite: '14:00:00',
              url_place: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=PORTAL-OTHER',
            },
          ],
        });
      }

      if (url.hostname === 'analisi.transparenciacatalunya.cat') {
        return Response.json([]);
      }

      if (url.hostname === 'contrataciondelestado.es' && url.pathname === '/wps/poc' && url.searchParams.get('idEvl') === 'TED-EUS-1') {
        const extraRow = tedWatchExtraDoc
          ? '<tr><td>19/11/2026</td><td>Adenda técnica</td><td><a href="https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?DocumentIdParam=EUS-ADENDA"><img alt="Documento pdf"></a></td></tr>'
          : '';
        return new Response(
          '<table id="myTablaDetalleVISUOE"><tr><td>18/11/2026</td><td>Pliego PCAP</td><td><a href="https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?DocumentIdParam=EUS-PCAP"><img alt="Documento pdf"></a></td></tr>'
          + extraRow + '</table>',
          { headers: { 'content-type': 'text/html; charset=UTF-8' } }
        );
      }

      if (url.hostname === 'contrataciondelestado.es' && url.pathname.includes('GetDocumentByIdServlet')) {
        return new Response('%PDF-1.4 pliego-eus', { headers: { 'content-type': 'application/pdf' } });
      }

      if (url.hostname === 'ted.europa.eu' && url.pathname.endsWith('/pdf')) {
        if (tedPdfBlocked) {
          return new Response('<html>Captcha required</html>', {
            status: 405,
            headers: { 'content-type': 'text/html; charset=UTF-8', 'x-amzn-waf-action': 'captcha' },
          });
        }
        return new Response('%PDF-1.4 ted-official', { headers: { 'content-type': 'application/pdf' } });
      }

      return new Response('Not found', { status: 404 });
    };

    worker = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: await readFile(join(build, 'index.js'), 'utf8'),
      compatibilityDate: '2026-10-30',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: { DB: 'ted-test' },
      r2Buckets: ['FILES'],
      bindings: {
        AUTH_ALLOW_REGISTRATION: 'true',
        BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
        BETTER_AUTH_URL: 'http://localhost',
      },
      outboundService,
    }));

    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) {
      for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) {
        await db.prepare(sql).run();
      }
    }

    const req = (path, opts = {}) => worker.dispatchFetch(`http://localhost${path}`, opts);
    const post = (path, body, cookie, method = 'POST') => req(path, {
      method,
      headers: { origin: 'http://localhost', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });

    const signup = await post('/api/auth/sign-up/email', { name: 'eva', email: 'eva@example.es', password: 'password-123456' });
    assert.equal(signup.status, 200);
    const cookie = signup.headers.get('set-cookie').split(';')[0];

    // 1. Categories & preferences for dataset='ted'
    const depCats = await (await req('/api/secop/categories?dataset=ted&category=department', { headers: { cookie } })).json();
    assert.ok(depCats.data.includes('España (ESP)'));
    assert.ok(depCats.data.includes('Francia (FRA)'));
    const savePref = await post('/api/secop/preferences', { dataset: 'ted', department: ['España (ESP)'], modality: [], status: [] }, cookie, 'PUT');
    assert.equal(savePref.status, 200);
    const gotPref = await (await req('/api/secop/preferences', { headers: { cookie } })).json();
    assert.equal(gotPref.dataset, 'ted');

    // 2. Standalone TED search (France) & pagination
    const frSearch = await post('/api/secop/search', {
      dataset: 'ted',
      department: ['Francia (FRA)'],
      openOnly: true,
    }, cookie);
    assert.equal(frSearch.status, 200);
    const frData = (await frSearch.json()).data;
    assert.equal(frData.items.length, 1);
    assert.equal(frData.items[0].id, 'ted:800111-2026');
    assert.equal(frData.items[0].source, 'ted');
    assert.equal(frData.items[0].country, 'FR');

    const tedPage1 = await (await post('/api/secop/search', {
      dataset: 'ted', keyword: 'paginacion-ted', department: [], openOnly: true, offset: 0,
    }, cookie)).json();
    assert.equal(tedPage1.data.items.length, 20);
    assert.equal(tedPage1.data.truncated, true);
    const tedPage2 = await (await post('/api/secop/search', {
      dataset: 'ted', keyword: 'paginacion-ted', department: [], openOnly: true, offset: 20,
    }, cookie)).json();
    assert.equal(tedPage2.data.items.length, 2);
    assert.equal(tedPage2.data.truncated, false);

    // 3. Hybrid PLACSP search merges unique TED ESP notice and deduplicates URL + ref/entity matches
    const spainHybrid = await post('/api/secop/search', {
      dataset: 'placsp',
      keyword: 'inundaciones',
      openOnly: true,
      fresh: true,
    }, cookie);
    assert.equal(spainHybrid.status, 200);
    const hybridItems = (await spainHybrid.json()).data.items;
    const hybridIds = hybridItems.map(item => item.id);
    assert.ok(hybridIds.includes('ted:70899-2026'), 'should merge unique regional TED notice');
    assert.ok(!hybridIds.includes('ted:70900-2026'), 'should deduplicate TED notice matching PLACSP idEvl');
    assert.ok(!hybridIds.includes('ted:70901-2026'), 'should deduplicate TED notice matching reference+entity');
    const mergedTed = hybridItems.find(item => item.id === 'ted:70899-2026');
    assert.equal(mergedTed.source, 'ted');
    assert.equal(mergedTed.territory, 'País Vasco');

    // 4. Detail + document catalog (PLACSP pliego resolved + official TED PDF)
    const detail = await req('/api/secop/detail?source=ted&id=ted%3A70899-2026', { headers: { cookie } });
    assert.equal(detail.status, 200);
    const detailProcess = (await detail.json()).data;
    assert.equal(detailProcess.source, 'ted');

    const docsRes = await req('/api/secop/documents?source=ted&id=ted%3A70899-2026', { headers: { cookie } });
    assert.equal(docsRes.status, 200);
    const docsList = (await docsRes.json()).data.items;
    assert.equal(docsList.length, 2);
    assert.equal(docsList[0].docType, 'PLIEGO');
    assert.equal(docsList[1].id, 'TED-70899-2026');

    // 5. Create project + market scoping (ES includes ted, CO excludes ted)
    const created = await post('/api/projects/from-secop', { process: detailProcess }, cookie);
    assert.equal(created.status, 201);
    const { project } = await created.json();

    const esProjects = await (await req('/api/projects?market=ES', { headers: { cookie } })).json();
    assert.ok(esProjects.projects.some(p => p.id === project.id && p.tenderSource === 'ted'));
    const coProjects = await (await req('/api/projects?market=CO', { headers: { cookie } })).json();
    assert.ok(!coProjects.projects.some(p => p.id === project.id));

    // Cross-source duplicate save prevention (placsp row pointing to same TED-EUS-1 idEvl)
    const dupSave = await post('/api/projects/from-secop', {
      process: {
        source: 'placsp',
        id: 'portal:dup-test',
        title: 'Duplicado portal',
        url: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=TED-EUS-1',
      },
    }, cookie);
    assert.equal(dupSave.status, 409);

    // 6. Document import: PLACSP pliego succeeds (201), TED PDF blocked by WAF returns 502 portal_captcha_required, then succeeds (201)
    const importPcap = await post(`/api/projects/${project.id}/secop/documents/${docsList[0].id}/import`, {}, cookie);
    assert.equal(importPcap.status, 201);

    const blockedPdf = await post(`/api/projects/${project.id}/secop/documents/TED-70899-2026/import`, {}, cookie);
    assert.equal(blockedPdf.status, 502);
    const blockedBody = await blockedPdf.json();
    assert.equal(blockedBody.error, 'portal_captcha_required');
    assert.equal(blockedBody.officialUrl, 'https://ted.europa.eu/es/notice/70899-2026/pdf');

    tedPdfBlocked = false;
    const directPdf = await post(`/api/projects/${project.id}/secop/documents/TED-70899-2026/import`, {}, cookie);
    assert.equal(directPdf.status, 201);

    // 7. secop-watch tracks changes on TED project without touching Atom
    const watchPath = `/api/projects/${project.id}/secop-watch`;
    assert.equal((await post(watchPath, {}, cookie)).status, 200);
    let watchState = await (await req(watchPath, { headers: { cookie } })).json();
    assert.equal(watchState.alerts.length, 0);

    tedWatchStatus = 'can-standard';
    tedWatchDeadline = '2099-06-15';
    tedWatchExtraDoc = true;
    assert.equal((await post(watchPath, {}, cookie)).status, 200);
    watchState = await (await req(watchPath, { headers: { cookie } })).json();
    assert.deepEqual(watchState.alerts.map(a => a.kind).sort(), ['deadline', 'document', 'status']);
    assert.ok(tedQueries.length > 0);
  } finally {
    await worker?.dispose();
    await rm(build, { recursive: true, force: true });
  }
});
