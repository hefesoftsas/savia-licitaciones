import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const require = createRequire(import.meta.url);
const placsp = require('../../client/electron/services/placspService.cjs');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SAMPLE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:cbc="urn:dgpe:names:draft:codice:schema:xsd:CommonBasicComponents-2"
      xmlns:cac="urn:dgpe:names:draft:codice:schema:xsd:CommonAggregateComponents-2"
      xmlns:cbc-place-ext="urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonBasicComponents-2"
      xmlns:cac-place-ext="urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonAggregateComponents-2">
  <updated>2026-11-15T10:00:00.000+01:00</updated>
  <link rel="next" href="https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/page2.atom"/>
  <entry>
    <id>https://contrataciondelsectorpublico.gob.es/sindicacion/licitacionesPerfilContratante/123456</id>
    <title>Servicios de desarrollo de software y mantenimiento</title>
    <updated>2026-11-15T09:30:00+01:00</updated>
    <link rel="alternate" href="https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&amp;idEvl=ABC123"/>
    <cac-place-ext:ContractFolderStatus>
      <cbc:ContractFolderID>EXP-2026-001</cbc:ContractFolderID>
      <cbc-place-ext:ContractFolderStatusCode>PUB</cbc-place-ext:ContractFolderStatusCode>
      <cac-place-ext:LocatedContractingParty>
        <cac:Party>
          <cac:PartyIdentification><cbc:ID schemeName="NIF">Q2800001A</cbc:ID></cac:PartyIdentification>
          <cac:PartyName><cbc:Name>Ministerio de Transformación Digital</cbc:Name></cac:PartyName>
        </cac:Party>
      </cac-place-ext:LocatedContractingParty>
      <cac:ProcurementProject>
        <cbc:Name>Servicios de desarrollo de software y mantenimiento</cbc:Name>
        <cbc:TypeCode>2</cbc:TypeCode>
        <cac:BudgetAmount>
          <cbc:TaxExclusiveAmount currencyID="EUR">250000.50</cbc:TaxExclusiveAmount>
        </cac:BudgetAmount>
        <cac:RequiredCommodityClassification>
          <cbc:ItemClassificationCode>72200000</cbc:ItemClassificationCode>
        </cac:RequiredCommodityClassification>
        <cac:RealizedLocation>
          <cbc:CountrySubentity>Comunidad de Madrid</cbc:CountrySubentity>
          <cac:Address><cbc:CityName>Madrid</cbc:CityName></cac:Address>
        </cac:RealizedLocation>
      </cac:ProcurementProject>
      <cac:TenderingProcess>
        <cbc:ProcedureCode>1</cbc:ProcedureCode>
        <cac:TenderSubmissionDeadlinePeriod>
          <cbc:EndDate>2026-12-20</cbc:EndDate>
          <cbc:EndTime>14:00:00</cbc:EndTime>
        </cac:TenderSubmissionDeadlinePeriod>
      </cac:TenderingProcess>
      <cac:LegalDocumentReference>
        <cbc:ID>PCAP-2026.pdf</cbc:ID>
        <cac:Attachment><cac:ExternalReference><cbc:URI>https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?DocumentIdParam=PCAP1</cbc:URI></cac:ExternalReference></cac:Attachment>
      </cac:LegalDocumentReference>
      <cac:TechnicalDocumentReference>
        <cbc:ID>PPT-2026.pdf</cbc:ID>
        <cac:Attachment><cac:ExternalReference><cbc:URI>https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?DocumentIdParam=PPT1</cbc:URI></cac:ExternalReference></cac:Attachment>
      </cac:TechnicalDocumentReference>
    </cac-place-ext:ContractFolderStatus>
  </entry>
</feed>`;

test('placspService parsea Atom/CODICE y valida URLs oficiales', () => {
  const parsed = placsp.parseAtomFeed(SAMPLE_ATOM);
  assert.equal(parsed.nextUrl, 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/page2.atom');
  assert.equal(parsed.entries.length, 1);
  const item = parsed.entries[0];
  assert.equal(item.source, 'placsp');
  assert.equal(item.country, 'ES');
  assert.equal(item.reference, 'EXP-2026-001');
  assert.equal(item.status, 'Publicado');
  assert.equal(item.statusCode, 'PUB');
  assert.equal(item.entity, 'Ministerio de Transformación Digital');
  assert.equal(item.entityId, 'Q2800001A');
  assert.equal(item.value, 250000.5);
  assert.equal(item.currency, 'EUR');
  assert.equal(item.currencyVerified, true);
  assert.equal(item.classificationCode, '72200000');
  assert.deepEqual(item.cpvCodes, ['72200000']);
  assert.equal(item.territory, 'Comunidad de Madrid');
  assert.equal(item.department, 'Comunidad de Madrid');
  assert.equal(item.city, 'Madrid');
  assert.equal(item.deadline, '2026-12-20T14:00:00');
  assert.equal(item.deadlineVerified, true);
  assert.equal(item.modality, 'Abierto · Servicios');
  assert.equal(item.documents.length, 2);
  assert.equal(item.documents[0].docType, 'PCAP');
  assert.equal(item.documents[1].docType, 'PPT');

  assert.equal(placsp.validatePlacspUrl('https://evil.example/a.pdf'), '');
  assert.equal(placsp.validatePlacspUrl('http://contrataciondelestado.es/a.pdf'), '');
  assert.ok(placsp.validatePlacspUrl('https://contrataciondelestado.es/a.pdf'));
});

test('web-api sincroniza PLACSP en D1, busca por CPV/territorio e importa pliegos', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-placsp-test-'));
  let worker;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' },
    });
    let boePortalStatus = 'Publicada';
    const floodNotices = [
      ['BOE-B-2099-1', 'QA-BOE', 'Defensa contra inundaciones'],
      ['BOE-B-2099-2', '22706.26.021', 'Defensa contra inundaciones del arroyo de Letur'],
      ['BOE-B-2099-3', 'FP.499.079/2111', 'Protección contra inundaciones de Cogullada'],
      ['BOE-B-2099-4', 'FP.499.079/0611', 'Control de las obras de protección contra inundaciones de Cogullada'],
    ];
    let useLicit = false;
    let atomRequests = 0;
    const duplicatePscpUrl = 'https://contractaciopublica.cat/ca/detall-publicacio/test/123';
    const licitRows = [
      ['22706.26.021', 'Defensa contra inundaciones del arroyo de Letur', '2099-11-30'],
      ['FP.499.079/2111', 'Protección contra inundaciones de Cogullada', '2099-12-01'],
      ['FP.499.079/0611', 'Control de obras contra inundaciones de Cogullada', '2099-12-02'],
      ['QA-VENCIDA', 'Defensa contra inundaciones vencida', '2000-01-01'],
      ['QA-VENCIDA-HOY', 'Defensa contra inundaciones vencida hoy', placsp.placspDeadlineCutoff().slice(0, 10)],
    ].map(([expediente, titulo, fecha_limite], index) => ({
      id: '00000000-0000-0000-0000-00000000000' + index, expediente, titulo, fecha_limite,
      estado: 'EN PLAZO', fecha_publicacion: '2026-11-15', organo: 'Confederación',
      url_place: 'https://contrataciondelestado.es/wps/poc?idEvl=licit-cog',
    }));
    const outboundService = async request => {
      const url = new URL(request.url);
      if (url.hostname === 'api.licit.es') {
        if (!useLicit) return new Response(null, {status:503});
        if (url.pathname.startsWith('/v1/licitacion/')) {
          return Response.json({...licitRows.at(-1), hora_limite:'00:00:00'});
        }
        const {q, filtros} = await request.json();
        assert.deepEqual(filtros.estado, ['EN PLAZO']);
        if (q === 'saneamiento') return Response.json({resultados:[{
          ...licitRows[0], id:'00000000-0000-0000-0000-000000000005',
          expediente:'QA-PSCP-OVERLAP', titulo:'Saneamiento municipal', url_place:duplicatePscpUrl,
        }]});
        return Response.json({resultados:licitRows.filter(row => row.titulo.toLowerCase().includes(q.toLowerCase()))});
      }
      if (url.hostname === 'contrataciondelsectorpublico.gob.es') {
        if (url.pathname.endsWith('.atom')) atomRequests++;
        if (url.pathname.endsWith('page2.atom')) {
          return new Response('<feed xmlns="http://www.w3.org/2005/Atom"></feed>', { headers: { 'content-type': 'application/atom+xml' } });
        }
        return new Response(SAMPLE_ATOM, { headers: { 'content-type': 'application/atom+xml' } });
      }
      if (url.hostname === 'www.boe.es') {
        if (url.pathname.includes('/sumario/')) {
          return Response.json({data:{sumario:{diario:[{seccion:[{codigo:'5A',departamento:[{item:floodNotices.map(([identificador, reference, title]) => ({
            identificador, titulo: `Anuncio de licitación de: Confederación. Objeto: ${title}. Expediente: ${reference}.`,
          }))}]}]}]}}});
        }
        const id = url.searchParams.get('id');
        return new Response(`<documento><p>https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&amp;idEvl=${id}</p>`
          + '<dt>19. Plazo para la recepción de ofertas:</dt><dd>Hasta las 12:00 horas del 1 de enero de 2099.</dd></documento>');
      }
      const notice = url.pathname === '/wps/poc' && floodNotices.find(([id]) => id === url.searchParams.get('idEvl'));
      if (notice) {
        const [, reference, title] = notice;
        const status = reference === 'QA-BOE' ? boePortalStatus : 'Publicada';
        if (!status) return new Response('', {status:503});
        return new Response(`<span id="app:form1:text_Expediente">${reference}</span>`
          + `<span id="app:form1:text_ObjetoContrato">${title}</span>`
          + `<span id="app:form1:text_Estado">${status}</span>`
          + '<span id="app:form1:text_FechaPresentacionOfertaConHora">02/01/2099 14:00</span>'
          + '<span id="app:form1:text_OC_con">Confederación</span>');
      }
      if (url.pathname === '/wps/poc' && url.searchParams.get('idEvl') === 'licit-cog') {
        return new Response('<table id="myTablaDetalleVISUOE"><tr><td>03/11/2026</td><td>Rectificaci&#243;n de Pliego</td>'
          + '<td><a href="https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?DocumentIdParam=COG-PCAP">'
          + '<img alt="Documento pdf"></a><a href="https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?DocumentIdParam=COG-XML">'
          + '<img alt="Documento xml"></a></td></tr></table>');
      }
      if (url.searchParams.get('DocumentIdParam') === 'COG-XML') {
        assert.match(request.headers.get('accept'), /application\/xml/);
        return new Response('<CallForTenders><cac:LegalDocumentReference><cbc:ID>PCAP Cogullada.pdf</cbc:ID>'
          + '<cac:Attachment><cac:ExternalReference><cbc:URI>https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?DocumentIdParam=COG-ATTACHMENT</cbc:URI>'
          + '</cac:ExternalReference></cac:Attachment></cac:LegalDocumentReference></CallForTenders>', {headers:{'content-type':'application/xml'}});
      }
      if (url.hostname === 'contractaciopublica.cat' && url.pathname === '/qa-terrassa.json') {
        return Response.json({publicacio:{dadesPublicacio:{plecsDeClausulesAdministratives:{ca:[
          {id:302782745, hash:'official-hash', titol:'PCAP Terrassa.pdf'},
        ]}}}});
      }
      if (url.hostname === 'contractaciopublica.cat' && url.pathname === '/portal-api/descarrega-document/302782745/official-hash') {
        return new Response('%PDF-1.4 Terrassa', {headers:{'content-type':'application/pdf'}});
      }
      if (url.hostname === 'analisi.transparenciacatalunya.cat') {
        const where = url.searchParams.get('$where') || '';
        if (where === "id_intern='a772d77f-07cd-4827-8745-919be611b2e0'") {
          return Response.json([{url_json_licitacio:{url:'https://contractaciopublica.cat/qa-terrassa.json'}}]);
        }
        if (where.includes('SANEAMIENTO')) return Response.json(['0', '1'].map(lot => ({
          id_intern:'qa-overlap_' + lot, codi_expedient:'QA-PSCP-OVERLAP',
          denominacio:'Saneamiento municipal', enllac_publicacio:duplicatePscpUrl,
          fase_publicacio:'Anunci de licitació', termini_presentacio_ofertes:'2099-11-30T14:00:00',
        })));
        if (where.includes('INUNDACIONS')) {
          return Response.json([{id_intern:'qa-flood', denominacio:'QA Torrent', objecte_contracte:'Prevenció d’inundacions',
            fase_publicacio:'Anunci de licitació', termini_presentacio_ofertes:'2099-01-01T12:00:00'}]);
        }
        if (where.includes('QA PAGINATION')) {
          const offset = Number(url.searchParams.get('$offset') || 0);
          return Response.json(Array.from({length:22}, (_, i) => ({
            id_intern: `qa-page-${String(i+1).padStart(2,'0')}`,
            denominacio: `Anuncio de prueba ${i+1}`,
            objecte_contracte: 'QA pagination',
            data_publicacio_anunci: `2099-01-${String(28-i).padStart(2,'0')}T12:00:00`,
          })).slice(offset, offset + Number(url.searchParams.get('$limit'))));
        }
        return Response.json(where.includes('QA PSCP CATALOG') ? [{id_intern:'qa-catalog', denominacio:'QA PSCP catalog'}] : []);
      }
      if (url.hostname === 'contrataciondelestado.es') {
        return new Response('%PDF-1.4 pliego', { headers: { 'content-type': 'application/pdf' } });
      }
      return new Response('Not found', { status: 404 });
    };
    const options = convertV4MiniflareOptions({
      modules: true,
      script: await readFile(join(build, 'index.js'), 'utf8'),
      compatibilityDate: '2026-10-30',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: { DB: 'placsp-test' },
      r2Buckets: ['FILES'],
      bindings: {
        AUTH_ALLOW_REGISTRATION: 'true',
        BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
        BETTER_AUTH_URL: 'http://localhost',
      },
      outboundService,
    });
    worker = new Miniflare(options);
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) {
      for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) {
        await db.prepare(sql).run();
      }
    }
    const req = (path, opts = {}) => worker.dispatchFetch(`http://localhost${path}`, opts);
    const post = (path, body, cookie) => req(path, {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    const signup = await post('/api/auth/sign-up/email', { name: 'ana', email: 'ana@example.es', password: 'password-123456' });
    assert.equal(signup.status, 200);
    const cookie = signup.headers.get('set-cookie').split(';')[0];

    const syncRes = await post('/api/secop/placsp/sync', {}, cookie);
    assert.equal(syncRes.status, 200, await syncRes.clone().text());
    assert.equal((await syncRes.json()).count, 1);

    for (const [id, code, deadline, phase] of [
      ['qa-open', 'PUB', '2099-01-01T09:00:00'],
      ['qa-expired', 'PUB', '2000-01-01T09:00:00'],
      ['qa-resolved', 'RES', '2099-01-01T09:00:00'],
      ['qa-unverified', 'PUB', ''],
      ['pscp:qa-resolved', 'PUB', '2099-01-01T09:00:00', 'Adjudicació'],
    ]) {
      await db.prepare('INSERT INTO placsp_tenders (id, title, status_code, deadline, status, synced_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, 'QA open bids', code, deadline, phase || '', Date.now()).run();
    }
    const openBids = await post('/api/secop/search', {dataset:'placsp', keyword:'QA open bids', openOnly:true}, cookie);
    assert.equal(openBids.status, 200);
    assert.deepEqual((await openBids.json()).data.items.map(item=>item.id), ['qa-open']);
    const allBids = await post('/api/secop/search', {dataset:'placsp', keyword:'QA open bids', openOnly:false}, cookie);
    assert.equal((await allBids.json()).data.items.length, 5);

    const pscpDocs = [{id:'PCAP-99',name:'PCAP.pdf',extension:'pdf',url:'https://contrataciondelestado.es/pcap.pdf'}];
    await db.prepare('INSERT INTO placsp_tenders (id, title, documents_json, synced_at) VALUES (?, ?, ?, ?)')
      .bind('pscp:qa-catalog', 'QA PSCP catalog', JSON.stringify(pscpDocs), Date.now()).run();
    const pscpRefresh = await post('/api/secop/search', {dataset:'placsp', keyword:'QA PSCP catalog'}, cookie);
    assert.equal(pscpRefresh.status, 200);
    const retained = await req('/api/secop/documents?source=placsp&id=pscp%3Aqa-catalog', {headers:{cookie}});
    assert.deepEqual((await retained.json()).data.items.map(item=>item.id), ['PCAP-99']);
    await db.prepare('DELETE FROM placsp_tenders WHERE id = ?').bind('pscp:qa-catalog').run();

    await db.prepare('INSERT INTO placsp_tenders (id, title, publication_date, synced_at) VALUES (?, ?, ?, ?)')
      .bind('qa-page-atom', 'QA pagination Atom', '2099-01-01', Date.now()).run();
    const pagination = async offset => (await (await post('/api/secop/search', {
      dataset:'placsp', keyword:'QA pagination', offset,
    }, cookie)).json()).data;
    const firstPage = await pagination(0);
    assert.equal(firstPage.items[0].id, 'pscp:qa-page-01');
    assert.equal(firstPage.truncated, true);
    const secondPage = await pagination(20);
    assert.deepEqual(secondPage.items.map(item=>item.id), ['pscp:qa-page-21','pscp:qa-page-22','qa-page-atom']);
    assert.equal(secondPage.truncated, false);
    await db.prepare("DELETE FROM placsp_tenders WHERE id LIKE 'qa-page-%' OR id LIKE 'pscp:qa-page-%'").run();

    const floodSearch = await post('/api/secop/search', {dataset:'placsp',keyword:'inundaciones',openOnly:true}, cookie);
    assert.equal(floodSearch.status, 200);
    const floodItems = (await floodSearch.json()).data.items;
    assert.ok(floodItems.some(item=>item.id==='pscp:qa-flood'));
    assert.ok(floodItems.some(item=>item.reference==='QA-BOE' && item.deadline==='2099-01-02T14:00:00'));
    for (const [keyword, expected] of [
      ['Letur', ['22706.26.021']],
      ['Cogullada', ['FP.499.079/0611', 'FP.499.079/2111']],
    ]) {
      assert.deepEqual(floodItems.filter(item => item.title.includes(keyword)).map(item => item.reference).sort(), expected);
      const targetedSearch = await post('/api/secop/search', {dataset:'placsp',keyword,openOnly:true}, cookie);
      assert.equal(targetedSearch.status, 200);
      assert.deepEqual((await targetedSearch.json()).data.items.map(item => item.reference).sort(), expected);
    }
    useLicit = true;
    const priorAtomRequests = atomRequests;
    const overlap = await post('/api/secop/search', {dataset:'placsp',keyword:'saneamiento',openOnly:true}, cookie);
    assert.equal(overlap.status, 200);
    assert.deepEqual((await overlap.json()).data.items.map(({id, deadline}) => ({id, deadline})), [
      {id:'pscp:qa-overlap_0', deadline:'2099-11-30T14:00:00'},
    ]);
    await db.prepare('DELETE FROM placsp_tenders WHERE reference = ?').bind('QA-PSCP-OVERLAP').run();
    for (const [keyword, expected] of [
      ['inundaciones', ['22706.26.021', 'FP.499.079/0611', 'FP.499.079/2111']],
      ['Letur', ['22706.26.021']],
      ['Cogullada', ['FP.499.079/0611', 'FP.499.079/2111']],
    ]) {
      const response = await post('/api/secop/search', {dataset:'placsp',keyword,openOnly:true,fresh:true}, cookie);
      assert.equal(response.status, 200);
      const items = (await response.json()).data.items;
      assert.deepEqual(items.filter(item => item.id.startsWith('licit:')).map(item => item.reference).sort(), expected);
      assert.ok(!items.some(item => item.reference?.startsWith('QA-VENCIDA')));
      if (keyword === 'inundaciones') assert.ok(items.some(item => item.id === 'pscp:qa-flood'));
    }
    const cogId = 'licit:' + licitRows[2].id;
    const catalog = await req('/api/secop/documents?source=placsp&id=' + encodeURIComponent(cogId), {headers:{cookie}});
    const pliego = (await catalog.json()).data.items.find(item => item.docType === 'PCAP');
    assert.equal(pliego?.name, 'PCAP Cogullada.pdf');
    const cogProject = await post('/api/projects/from-secop', {
      process:{source:'placsp', id:cogId, title:licitRows[2].titulo}, documentIds:[pliego.id],
    }, cookie);
    assert.equal(cogProject.status, 201);
    const {project: cog} = await cogProject.json();
    const importedCog = await post('/api/projects/' + cog.id + '/secop/documents/' + pliego.id + '/import', {}, cookie);
    assert.equal(importedCog.status, 201, await importedCog.clone().text());
    const {file:cogFile} = await importedCog.json();
    const downloaded = await req('/api/projects/' + cog.id + '/files/' + cogFile.id, {headers:{cookie}});
    assert.equal(downloaded.status, 200);
    assert.match(await downloaded.text(), /^%PDF-/);
    const terrassaId = 'licit:507e7c83-81ed-7cb6-84be-73d55d84378e';
    await db.prepare('INSERT INTO placsp_tenders (id, title, reference, url, synced_at) VALUES (?, ?, ?, ?, ?)')
      .bind(terrassaId, 'Saneamiento de Terrassa', 'ECAS 10370/2026',
        'https://contractaciopublica.cat/ca/detall-publicacio/a772d77f-07cd-4827-8745-919be611b2e0/300934689', Date.now()).run();
    const terrassaCatalog = await req('/api/secop/documents?source=placsp&id=' + encodeURIComponent(terrassaId), {headers:{cookie}});
    const [terrassaPcap] = (await terrassaCatalog.json()).data.items;
    assert.equal(terrassaPcap?.name, 'PCAP Terrassa.pdf');
    const terrassaProject = await post('/api/projects/from-secop', {
      process:{source:'placsp', id:terrassaId, title:'Saneamiento de Terrassa'}, documentIds:[terrassaPcap.id],
    }, cookie);
    assert.equal(terrassaProject.status, 201);
    const {project:terrassa} = await terrassaProject.json();
    const terrassaImport = await post('/api/projects/' + terrassa.id + '/secop/documents/' + terrassaPcap.id + '/import', {}, cookie);
    assert.equal(terrassaImport.status, 201, await terrassaImport.clone().text());
    const {file:terrassaFile} = await terrassaImport.json();
    const terrassaDownload = await req('/api/projects/' + terrassa.id + '/files/' + terrassaFile.id, {headers:{cookie}});
    assert.equal(await terrassaDownload.text(), '%PDF-1.4 Terrassa');
    await db.prepare('DELETE FROM placsp_tenders WHERE id = ?').bind(terrassaId).run();
    assert.equal(atomRequests, priorAtomRequests);
    useLicit = false;
    boePortalStatus = null;
    const fallbackSearch = await post('/api/secop/search', {dataset:'placsp',keyword:'inundaciones',openOnly:true,fresh:true}, cookie);
    const fallbackItems = (await fallbackSearch.json()).data.items;
    assert.ok(fallbackItems.some(item=>item.reference==='QA-BOE' && item.deadline==='2099-01-02T14:00:00'));
    boePortalStatus = 'Anulada';
    const closedSearch = await post('/api/secop/search', {dataset:'placsp',keyword:'inundaciones',openOnly:true,fresh:true}, cookie);
    assert.ok(!(await closedSearch.json()).data.items.some(item=>item.reference==='QA-BOE'));
    await db.prepare("DELETE FROM placsp_tenders WHERE id LIKE 'boe:BOE-B-2099-%'").run();
    await db.prepare('DELETE FROM placsp_tenders WHERE id = ?').bind('pscp:qa-flood').run();

    const searchRes = await post('/api/secop/search', {
      dataset: 'placsp',
      keyword: 'software',
      classificationClass: '722000',
      department: 'Comunidad de Madrid',
      minValue: 100000,
    }, cookie);
    assert.equal(searchRes.status, 200, await searchRes.clone().text());
    const searchJson = await searchRes.json();
    assert.equal(searchJson.data.items.length, 1);
    const tender = searchJson.data.items[0];
    assert.equal(tender.source, 'placsp');
    assert.equal(tender.currency, 'EUR');

    const catRes = await req('/api/secop/categories?dataset=placsp&category=department', { headers: { cookie } });
    assert.equal(catRes.status, 200);
    assert.deepEqual((await catRes.json()).data, ['Comunidad de Madrid']);

    const detailRes = await req(`/api/secop/detail?source=placsp&id=${encodeURIComponent(tender.id)}`, { headers: { cookie } });
    assert.equal(detailRes.status, 200);
    assert.equal((await detailRes.json()).data.reference, 'EXP-2026-001');

    const catalogRes = await req(`/api/secop/documents?source=placsp&id=${encodeURIComponent(tender.id)}`, { headers: { cookie } });
    assert.equal(catalogRes.status, 200);
    const catalogJson = await catalogRes.json();
    assert.equal(catalogJson.data.items.length, 2);
    assert.equal('url' in catalogJson.data.items[0], false);

    const createRes = await post('/api/projects/from-secop', { process: tender, documentIds: ['PCAP-1'] }, cookie);
    assert.equal(createRes.status, 201, await createRes.clone().text());
    const { project } = await createRes.json();

    const listRes = await req('/api/projects', { headers: { cookie } });
    const projects = (await listRes.json()).projects;
    assert.equal(projects[0].tenderSource, 'placsp');
    assert.equal(projects[0].tenderCountry, 'ES');
    assert.equal(projects[0].tenderCurrency, 'EUR');
    assert.equal(projects[0].tenderTerritory, 'Comunidad de Madrid');

    const importRes = await post(`/api/projects/${project.id}/secop/documents/PCAP-1/import`, {}, cookie);
    assert.equal(importRes.status, 201, await importRes.clone().text());
    const importedFile = (await importRes.json()).file;
    assert.equal(importedFile.name, 'PCAP-2026.pdf');
    assert.equal(importedFile.contentType, 'application/pdf');

    const aliasId = 'licit:00000000-0000-0000-0000-000000000999';
    await db.prepare('INSERT INTO placsp_tenders (id, title, url, synced_at) VALUES (?, ?, ?, ?)')
      .bind(aliasId, tender.title, 'https://contrataciondelsectorpublico.gob.es/wps/poc?idEvl=ABC123&uri=deeplink:detalle_licitacion', Date.now()).run();
    const duplicate = await post('/api/projects/from-secop', {
      process:{...tender,id:aliasId,url:'https://contrataciondelestado.es/wps/poc?idEvl=untrusted'},
    }, cookie);
    assert.equal(duplicate.status, 409);
    assert.deepEqual(await duplicate.json(), {error:'already_saved', projectId:project.id});

  } finally {
    await worker?.dispose();
    await rm(build, { recursive: true, force: true });
  }
});

test('placspService recupera entradas completas cuando el stream Atom se corta por soft deadline o maxBytes', async () => {
  const encoder = new TextEncoder();
  const completePrefix = SAMPLE_ATOM.replace(/<\/feed>\s*$/, '');
  const truncatedSecondEntry = `
  <entry>
    <id>https://contrataciondelsectorpublico.gob.es/sindicacion/licitacionesPerfilContratante/999999</id>
    <title>Entrada incompleta que se corta a mitad`;

  // 1. Soft deadline hit mid-second-entry: should cancel reader and return the 1st complete entry
  let softCancelled = false;
  const softStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(completePrefix));
      controller.enqueue(encoder.encode(truncatedSecondEntry));
    },
    cancel() {
      softCancelled = true;
    },
  });
  const softService = placsp.createPlacspService({
    fetchImpl: async () => new Response(softStream, { status: 200, headers: { 'content-type': 'application/atom+xml' } }),
  });
  const softParsed = await softService.fetchFeedPage(placsp.DEFAULT_FEED_URL, { timeoutMs: 5000, softDeadlineMs: 40 });
  assert.equal(softCancelled, true);
  assert.equal(softParsed.entries.length, 1);
  assert.equal(softParsed.entries[0].reference, 'EXP-2026-001');
  assert.equal(softParsed.nextUrl, 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/page2.atom');

  // 2. Max byte cap hit mid-second-entry: should cancel reader and return the 1st complete entry
  let bytesCancelled = false;
  const bytesStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(completePrefix));
      controller.enqueue(encoder.encode(truncatedSecondEntry));
      controller.enqueue(encoder.encode('x'.repeat(500)));
      controller.close();
    },
    cancel() {
      bytesCancelled = true;
    },
  });
  const bytesService = placsp.createPlacspService({
    fetchImpl: async () => new Response(bytesStream, { status: 200, headers: { 'content-type': 'application/atom+xml' } }),
  });
  const bytesParsed = await bytesService.fetchFeedPage(placsp.DEFAULT_FEED_URL, {
    timeoutMs: 5000,
    softDeadlineMs: 5000,
    maxBytes: encoder.encode(completePrefix).byteLength + 10,
  });
  assert.equal(bytesCancelled, true);
  assert.equal(bytesParsed.entries.length, 1);
  assert.equal(bytesParsed.entries[0].reference, 'EXP-2026-001');

  // 3. Soft deadline hit with 0 complete </entry> tags: should throw TimeoutError
  let emptyCancelled = false;
  const emptyStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('<?xml version="1.0"?><feed><updated>2026-11-15T10:00:00Z</updated><entry><title>Solo inicio'));
    },
    cancel() {
      emptyCancelled = true;
    },
  });
  const emptyService = placsp.createPlacspService({
    fetchImpl: async () => new Response(emptyStream, { status: 200, headers: { 'content-type': 'application/atom+xml' } }),
  });
  await assert.rejects(
    () => emptyService.fetchFeedPage(placsp.DEFAULT_FEED_URL, { timeoutMs: 5000, softDeadlineMs: 30 }),
    err => err?.name === 'TimeoutError'
  );
  assert.equal(emptyCancelled, true);
});

test('placspService.searchPscpSocrata construye consultas SoQL válidas y mapea filas', async () => {
  const capturedUrls = [];
  const sampleRows = [
    {
      id_intern: '1001',
      codi_expedient: 'EXP-CAT-2026-01',
      denominacio: "Serveis d'arquitectura de software",
      objecte_contracte: 'Desenvolupament i manteniment',
      nom_organ: 'Generalitat de Catalunya',
      codi_organ: 'ORG-01',
      procediment: 'Obert',
      fase_publicacio: 'Anunci de licitació',
      valor_estimat_contracte: '185000.50',
      codi_cpv: '72200000-7',
      lloc_execucio: 'Barcelona',
      data_publicacio_anunci: '2026-11-10T09:00:00.000',
      termini_presentacio_ofertes: '2026-12-01T14:00:00.000',
      enllac_publicacio: { url: 'https://contractaciopublica.cat/ca/detall-publicacio/1001' },
    },
    {
      id_intern: '1002',
      codi_expedient: 'EXP-CAT-2026-02',
      denominacio: 'Servicios de consultoría cloud',
      nom_organ: 'Ajuntament de Girona',
      procediment: 'Obert simplificat',
      fase_publicacio: 'Anunci de licitació',
      valor_estimat_contracte: '90000',
      codi_cpv: '72220000',
      lloc_execucio: 'Girona',
      data_publicacio_anunci: '2026-11-09T10:00:00.000',
    },
    {
      id_intern: '1003',
      codi_expedient: 'EXP-CAT-2026-03',
      denominacio: 'Servicios extra para comprobar truncado',
      nom_organ: 'Diputació de Tarragona',
      fase_publicacio: 'Anunci de licitació',
      valor_estimat_contracte: '60000',
      codi_cpv: '72000000',
      data_publicacio_anunci: '2026-11-08T10:00:00.000',
    },
  ];

  const service = placsp.createPlacspService({
    fetchImpl: async url => {
      capturedUrls.push(String(url));
      return new Response(JSON.stringify(sampleRows), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const res = await service.searchPscpSocrata({
    keyword: "servicios d'software",
    classificationClass: '722',
    columnFilters: {entity: 'Girona', value: '90000', deadline: '2026-12-01'},
    department: 'Barcelona',
    modality: 'Obert',
    fromDate: '2026-11-01',
    minValue: 50000,
    maxValue: 250000,
    limit: 2,
    offset: 4,
    sortBy: 'value',
    sortDirection: 'asc',
  });

  assert.equal(capturedUrls.length, 1);
  const parsedUrl = new URL(capturedUrls[0]);
  assert.equal(parsedUrl.origin + parsedUrl.pathname, 'https://analisi.transparenciacatalunya.cat/resource/ybgg-dgi6.json');
  const where = parsedUrl.searchParams.get('$where');
  assert.ok(where.includes("fase_publicacio like '%licitaci%'"), where);
  assert.ok(where.includes("upper(denominacio) like '%SERVICIOS D''SOFTWARE%'"), where);
  assert.ok(where.includes("upper(objecte_contracte) like '%SERVICIOS D''SOFTWARE%'"), where);
  assert.ok(where.includes("upper(nom_organ) like '%SERVICIOS D''SOFTWARE%'"), where);
  assert.ok(where.includes("upper(codi_expedient) like '%SERVICIOS D''SOFTWARE%'"), where);
  assert.ok(where.includes("codi_cpv like '722%'"), where);
  assert.ok(where.includes("upper(lloc_execucio) like '%BARCELONA%'"), where);
  assert.ok(where.includes("upper(procediment) like '%OBERT%'"), where);
  assert.ok(where.includes("data_publicacio_anunci >= '2026-11-01T00:00:00'"), where);
  assert.ok(where.includes('valor_estimat_contracte >= 50000'), where);
  assert.ok(where.includes('valor_estimat_contracte <= 250000'), where);
  assert.ok(where.includes("upper(nom_organ) like '%GIRONA%'"), where);
  assert.ok(where.includes('valor_estimat_contracte = 90000'), where);
  assert.ok(where.includes("termini_presentacio_ofertes >= '2026-12-01T00:00:00'"), where);
  assert.ok(where.includes("termini_presentacio_ofertes < '2026-12-02T00:00:00'"), where);
  assert.equal(parsedUrl.searchParams.get('$limit'), '3');
  assert.equal(parsedUrl.searchParams.get('$offset'), '4');
  assert.equal(parsedUrl.searchParams.get('$order'), 'valor_estimat_contracte ASC');

  assert.equal(res.truncated, true);
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].id, 'pscp:1001');
  assert.equal(res.items[0].source, 'placsp');
  assert.equal(res.items[0].country, 'ES');
  assert.equal(res.items[0].currency, 'EUR');
  assert.equal(res.items[0].value, 185000.5);
  assert.equal(res.items[0].classificationCode, '72200000');
  assert.deepEqual(res.items[0].cpvCodes, ['72200000']);
  assert.equal(res.items[0].url, 'https://contractaciopublica.cat/ca/detall-publicacio/1001');

  await service.searchPscpSocrata({openOnly:true, deadlineCutoff:placsp.placspDeadlineCutoff(new Date('2026-07-01T10:00:00Z'))});
  assert.equal(new URL(capturedUrls[1]).searchParams.get('$where'),
    "fase_publicacio = 'Anunci de licitació' AND termini_presentacio_ofertes > '2026-07-01T12:00:00'");
});

test('PLACSP carga las oportunidades de PSCP cuando Atom responde vacío', async () => {
  const urls = [];
  const service = placsp.createPlacspService({
    fetchImpl: async url => {
      urls.push(url);
      return url === placsp.DEFAULT_FEED_URL
        ? new Response('<feed><updated>2026-11-17T12:00:00Z</updated></feed>')
        : Response.json([{id_intern: '1234', denominacio: 'Obres municipals'}]);
    },
  });
  const {entries} = await service.fetchLatestEntries({maxPages: 1});
  assert.deepEqual(entries.map(item => item.id), ['pscp:1234']);
  assert.equal(new URL(urls[1]).hostname, 'analisi.transparenciacatalunya.cat');
});
