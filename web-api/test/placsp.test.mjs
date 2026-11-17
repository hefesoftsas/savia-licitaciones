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
    const outboundService = async request => {
      const url = new URL(request.url);
      if (url.hostname === 'contrataciondelsectorpublico.gob.es') {
        if (url.pathname.endsWith('page2.atom')) {
          return new Response('<feed xmlns="http://www.w3.org/2005/Atom"></feed>', { headers: { 'content-type': 'application/atom+xml' } });
        }
        return new Response(SAMPLE_ATOM, { headers: { 'content-type': 'application/atom+xml' } });
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
  } finally {
    await worker?.dispose();
    await rm(build, { recursive: true, force: true });
  }
});
