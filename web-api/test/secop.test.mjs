import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const { runOnce } = await import(process.env.SAVIA_TEST_RUNNER_LOOP_MODULE || new URL('../../runner/work-loop.mjs', import.meta.url));
const { createSecopZipHandler } = await import(process.env.SAVIA_TEST_SECOP_ZIP_MODULE || new URL('../../runner/secop-zip.mjs', import.meta.url));
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const AdmZip = require('adm-zip');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('busca datos públicos y guarda una oportunidad aislada por usuario', async () => {
  const build = await mkdtemp(join(tmpdir(), 'savia-secop-test-')); let worker; const calls = []; let mode = 'valid';
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
    const outboundService = async request => { const url = new URL(request.url); calls.push(url); if (url.hostname === 'community.secop.gov.co') { assert.equal(url.pathname, '/Public/Archive/RetrieveFile/Index'); if (!/^Mozilla\/5\.0\b/i.test(request.headers.get('user-agent') || '')) return new Response('<title>Azure WAF</title>', { status: 403, headers: { 'content-type': 'text/html' } }); if (['9000','9101'].includes(url.searchParams.get('DocumentId'))) return new Response('%PDF-same',{headers:{'content-type':'application/pdf'}});
    assert.match(url.searchParams.get('DocumentId'), /^4[23]$/); if (mode === 'large') return new Response('x', { headers: { 'content-length': String(51 * 1024 * 1024) } }); if(mode==='stream'){let sent=0;return new Response(new ReadableStream({pull(controller){if(sent===6){controller.close();return;}const chunk=new Uint8Array(1024*1024);if(sent++===0)chunk.set(new TextEncoder().encode('%PDF-1.7'));controller.enqueue(chunk);}}),{headers:{'content-type':'application/pdf'}});} if (mode === 'html') return new Response('<html>not pdf</html>', { headers: { 'content-type': 'text/html' } }); if (mode === 'invalid') return new Response('not a pdf', { headers: { 'content-type': 'application/pdf' } }); if (mode === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://other.example/file' } }); return new Response('%PDF-1.4 fixture', { headers: { 'content-type': 'application/pdf' } }); } assert.equal(url.hostname, 'www.datos.gov.co'); if (url.pathname === '/resource/jbjy-vk9h.json') {
      if (url.searchParams.get('$q') === 'consulta lenta') return new Response('timeout', { status: 504 });
      return Response.json([{ id_contrato: 'CO1.PCCNTR.1', proceso_de_compra:'CO1.BDOS.123', descripcion_del_proceso: 'Consultoría' }]);
    }
    if (url.searchParams.get('$where') === "proceso='CO1.BDOS.9999'") {
      return Response.json(url.pathname.endsWith('/f8va-cf4m.json')
        ? Array.from({length:102},(_,index)=>({id_documento:String(9101-index),nombre_archivo:index===0||index===101?'Acta.pdf':`Documento ${index}.pdf`,extensi_n:'pdf',tamanno_archivo:index===0||index===101?9:100+index,fecha_carga:'2026-01-01'}))
        : []);
    }
    if (mode === 'partial' && url.pathname === '/resource/dmgg-8hin.json') return new Response('unavailable', { status: 503 }); if (url.pathname !== '/resource/p6dx-8zbt.json') return Response.json(url.searchParams.get('$where').includes('999') ? [] : [{ id_documento: mode === 'zip-list' || url.searchParams.get('$where').includes('(44)') ? '44' : url.searchParams.get('$where').includes('(43)') ? '43' : '42', nombre_archivo: 'pliego.pdf', extensi_n: mode === 'zip-list' || url.searchParams.get('$where').includes('(44)') ? 'zip' : 'pdf', tamanno_archivo: '15', fecha_carga: '2026-01-01' }]); return Response.json([{ id_del_proceso: 'CO1.PRO.123', id_del_portafolio: 'CO1.BDOS.123', entidad: 'Entidad', nombre_del_procedimiento: 'Compra', precio_base: '123', referencia_del_proceso: 'REF-1', departamento_entidad: 'Bogotá', urlproceso: { url: 'https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.123' } }]); };
    const options = convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'secop-test' }, r2Buckets: ['FILES'], bindings: {AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost' }, outboundService });
    worker = new Miniflare(options);
    const db = await worker.getD1Database('DB');
    for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
    const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
    const post = (path, body, cookie) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    async function signup(name) { const response = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; }
    const alice = await signup('alice'); const bob = await signup('bob');
    assert.equal((await post('/api/secop/search', { dataset: 'secop-ii' })).status, 401);
    const search = await post('/api/secop/search', { dataset: 'secop-ii', keyword: 'salud', department: 'Bogotá', limit: 20 }, alice);
    assert.equal(search.status, 200, await search.clone().text());
    const result = await search.json(); assert.equal(result.data.items[0].title, 'Compra'); assert.equal(result.data.items[0].value, 123);
    assert.equal(calls.length, 1); assert.equal(calls[0].pathname, '/resource/p6dx-8zbt.json'); assert.equal(calls[0].searchParams.get('$q'), 'salud'); assert.match(calls[0].searchParams.get('$where'), /Bogotá/);
    const prefs = {dataset:'secop-ii',department:['Bogotá','Antioquia'],modality:['Licitación'],status:[]};
    assert.equal((await req('/api/secop/preferences',{method:'PUT',headers:{cookie:alice,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(prefs)})).status,200);
    assert.deepEqual(await (await req('/api/secop/preferences',{headers:{cookie:alice}})).json(),prefs);
    assert.deepEqual((await (await req('/api/secop/preferences',{headers:{cookie:bob}})).json()).department,[]);
    await post('/api/secop/search', { dataset:'secop-ii', keyword:'salud', department:'Bogotá' }, alice);
    assert.equal(calls.length,1,'repeated query uses server cache');
    await post('/api/secop/search', { dataset:'secop-ii', keyword:'salud', department:'Bogotá', fresh:true }, alice);
    assert.equal(calls.length,2,'refresh bypasses cached results');
    assert.match(calls.at(-1).searchParams.get('$order'), /DESC NULLS LAST/);
    const browseDefault = await post('/api/secop/search', { dataset: 'secop-ii' }, alice);
    assert.equal(browseDefault.status, 200);
    assert.match(calls.at(-1).searchParams.get('$where'), /fecha_de_publicacion_del is not null/);
    const browseOpenOnly = await post('/api/secop/search', { dataset: 'secop-ii', openOnly: true }, alice);
    assert.equal(browseOpenOnly.status, 200);
    const openWhere = calls.at(-1).searchParams.get('$where');
    assert.match(openWhere, /estado_del_procedimiento = 'Publicado'/);
    assert.match(openWhere, /fecha_de_recepcion_de >= '/);
    assert.match(openWhere, /fecha_de_publicacion_del is not null/);
    const filtered = await post('/api/secop/search', { dataset:'secop-ii',department:['Bogotá','Antioquia'],minValue:100,sortBy:'value',sortDirection:'asc',columnFilters:{entity:'Entidad'} },alice);
    assert.equal(filtered.status,200,await filtered.clone().text());
    const where = calls.at(-1).searchParams.get('$where'); assert.match(where,/Bogotá/); assert.match(where,/Antioquia/); assert.match(where,/100/); assert.match(where,/Entidad/); assert.match(calls.at(-1).searchParams.get('$order'),/ASC/);
    const contracts = { dataset: 'contratos', keyword: 'consultoría', sortBy: 'publicationDate', sortDirection: 'desc' };
    for (const offset of [0, 20]) {
      const response = await post('/api/secop/search', { ...contracts, offset }, alice);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.items[0].id, 'CO1.PCCNTR.1');
      const query = calls.at(-1).searchParams;
      assert.equal(query.get('$q'), 'consultoría');
      assert.equal(query.get('$order'), 'fecha_de_firma DESC');
      assert.match(query.get('$where'), /fecha_de_firma is not null/);
      assert.equal(query.get('$offset'), String(offset));
    }
    const timeout = await post('/api/secop/search', { ...contracts, keyword: 'consulta lenta' }, alice);
    assert.equal(timeout.status, 504);
    assert.equal((await timeout.json()).error, 'secop_source_timeout');
    const categoryUrl='/api/secop/categories?dataset=secop-ii&category=department';
    assert.equal((await req(categoryUrl,{headers:{cookie:alice}})).status,200);
    const count=calls.length; assert.equal((await req(categoryUrl,{headers:{cookie:bob}})).status,200); assert.equal(calls.length,count,'category options are cached');
    const categoryRow=await db.prepare('SELECT response_json,expires_at FROM secop_search_cache WHERE cache_key=?').bind('category:secop-ii:department').first();
    assert.deepEqual(JSON.parse(categoryRow.response_json).data,['Bogotá']);
    assert.ok(categoryRow.expires_at>Date.now()+6*24*60*60*1000,'category cache persists for seven days');
    await db.prepare('UPDATE secop_search_cache SET expires_at=0 WHERE cache_key=?').bind('category:secop-ii:department').run();
    assert.equal((await req(categoryUrl,{headers:{cookie:alice}})).status,200);
    assert.equal(calls.length,count+1,'expired categories fetch upstream exactly once');
    assert.equal((await req(categoryUrl,{headers:{cookie:bob}})).status,200);
    assert.equal(calls.length,count+1,'refreshed categories are served from D1 again');
    assert.equal((await req('/api/secop/detail?source=secop-ii&id=CO1.PRO.123')).status,401);
    const detail=await req('/api/secop/detail?source=secop-ii&id=CO1.PRO.123',{headers:{cookie:alice}});
    assert.equal(detail.status,200,await detail.clone().text()); assert.equal((await detail.json()).data.id,'CO1.PRO.123');
    assert.equal((await req('/api/secop/detail?source=unknown&id=x',{headers:{cookie:alice}})).status,400);
    const beforeContractDetail=calls.length;
    const contractDetail=await req('/api/secop/detail?source=secop-ii&id=CO1.PCCNTR.1',{headers:{cookie:alice}});
    assert.equal(contractDetail.status,200);
    assert.equal((await contractDetail.json()).data.portfolioId,'CO1.BDOS.123');
    assert.deepEqual(calls.slice(beforeContractDetail).map(url=>url.pathname),['/resource/jbjy-vk9h.json']);
    const catalog=await req('/api/secop/documents?portfolioId=CO1.BDOS.123&offset=0',{headers:{cookie:alice}});
    assert.equal(catalog.status,200,await catalog.clone().text()); const catalogData=await catalog.json();assert.equal(catalogData.data.items[0].id,'42');assert.equal('url' in catalogData.data.items[0],false);
    assert.equal((await req('/api/secop/documents?portfolioId=invalid',{headers:{cookie:alice}})).status,400);
    const dedupPage=offset=>req(`/api/secop/documents?portfolioId=CO1.BDOS.9999&offset=${offset}`,{headers:{cookie:alice}})
      .then(async response=>{assert.equal(response.status,200,await response.clone().text());return (await response.json()).data;});
    const firstPage=await dedupPage(0);
    const upstreamCalls=calls.length;
    const secondPage=await dedupPage(100);
    assert.equal(calls.length,upstreamCalls,'the second page uses the same catalog snapshot');
    assert.equal(firstPage.items.length,100);
    assert.equal(firstPage.truncated,true);
    assert.deepEqual(secondPage.items.map(item=>item.id),['9001']);
    assert.equal(secondPage.truncated,false);
    assert.deepEqual([...firstPage.items,...secondPage.items].filter(item=>item.name==='Acta.pdf').map(item=>item.id),['9101']);
    const created = await post('/api/projects/from-secop', { process: result.data.items[0] }, alice);
    assert.equal(created.status, 201, await created.clone().text()); const project = (await created.json()).project;
    const saved = await req(`/api/projects/${project.id}/secop`, { headers: { cookie: alice } });
    assert.equal((await saved.json()).process.reference, 'REF-1');
    assert.equal((await req(`/api/projects/${project.id}/secop`, { headers: { cookie: bob } })).status, 404);
    assert.equal((await post('/api/projects/from-secop', { process: result.data.items[0] }, alice)).status, 409);
    assert.equal((await (await req('/api/projects', { headers: { cookie: alice } })).json()).projects.length, 1);
    const documentsPath = `/api/projects/${project.id}/secop/documents`;
    assert.equal((await req(documentsPath, { headers: { cookie: bob } })).status, 404);
    assert.equal((await req(`${documentsPath}?offset=5001`,{headers:{cookie:alice}})).status,400);
    assert.deepEqual((await (await req(`${documentsPath}?offset=100`,{headers:{cookie:alice}})).json()).items,[]);
    const listed = await req(documentsPath, { headers: { cookie: alice } });
    assert.equal(listed.status, 200); const docs = await listed.json(); assert.equal(docs.items[0].id, '42');
    assert.equal((await post(`${documentsPath}/999/import`, {}, alice)).status, 404);
    assert.equal((await post(`${documentsPath}/42/import`, {}, bob)).status, 404);
    const imports = await Promise.all([post(`${documentsPath}/42/import`, {}, alice), post(`${documentsPath}/42/import`, {}, alice)]);
    assert.deepEqual(imports.map(response => response.status).sort(), [200, 201], JSON.stringify({ bodies: await Promise.all(imports.map(response => response.clone().text())), calls: calls.map(url => url.href) }));
    const files = (await (await req(`/api/projects/${project.id}/files`, { headers: { cookie: alice } })).json()).files;
    assert.equal(files.length, 1); assert.equal(files[0].name, 'pliego.pdf'); assert.equal(files[0].contentType, 'application/pdf');
    for (const [testMode, expected] of [['large', 413], ['html', 502], ['invalid', 400], ['redirect', 502]]) { mode = testMode; assert.equal((await post(`${documentsPath}/43/import`, {}, alice)).status, expected, testMode); }
    assert.equal((await (await req(`/api/projects/${project.id}/files`, { headers: { cookie: alice } })).json()).files.length, 1);
    const bucket = await worker.getR2Bucket('FILES'); assert.equal((await bucket.list()).objects.length, 1);
    mode='stream';const largeImport=await post(`${documentsPath}/43/import`,{},alice);assert.equal(largeImport.status,201,await largeImport.clone().text());const largeFile=(await largeImport.json()).file;assert.equal(largeFile.size,6*1024*1024);assert.equal((await(await req(`/api/projects/${project.id}/files/${largeFile.id}`,{headers:{cookie:alice}})).arrayBuffer()).byteLength,6*1024*1024);assert.equal((await bucket.list()).objects.length,2);assert.equal((await db.prepare('SELECT COUNT(*) n FROM desktop_file_staging').first()).n,0);mode='valid';
    assert.equal((await post(`${documentsPath}/44/import`, {}, bob)).status, 404);
    const zipRequests=await Promise.all([post(`${documentsPath}/44/import`, {}, alice),post(`${documentsPath}/44/import`, {}, alice)]);
    assert.deepEqual(zipRequests.map(response=>response.status).sort(),[200,201]);
    const zipJobs=await Promise.all(zipRequests.map(response=>response.json()));
    assert.equal(zipJobs[0].job.id,zipJobs[1].job.id);assert.equal(zipJobs[0].job.state,'queued');
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE kind='secop.import-zip'").first()).n,1);
    assert.equal((await req(`/api/projects/${project.id}/jobs`,{method:'POST',headers:{origin:'http://localhost',cookie:alice,'content-type':'application/json','idempotency-key':'forged'},body:JSON.stringify({kind:'secop.import-zip',payload:{documentId:'999'}})})).status,400);
    assert.equal((await post(`/api/projects/${project.id}/jobs/${zipJobs[0].job.id}/cancel`,{},alice)).status,200);
    const retry=await post(`${documentsPath}/44/import`,{},alice);assert.equal(retry.status,201);assert.notEqual((await retry.json()).job.id,zipJobs[0].job.id);
    await db.prepare("DELETE FROM secop_search_cache WHERE cache_key LIKE 'secop-document-snapshot:%'").run();
    mode='zip-list';const withJob=await (await req(documentsPath,{headers:{cookie:alice}})).json();assert.equal(withJob.items[0].zipJob.state,'queued');assert.equal(withJob.items[0].imported,false);
    const pairing=await(await post('/api/runner-pairings',{},alice)).json(),runner=await(await post('/api/runners/pair',{code:pairing.code,name:'Equipo'})).json();
    const zip=new AdmZip();zip.addFile('pliego.pdf',Buffer.from('%PDF-contenido'));zip.addFile('anexo.pdf',Buffer.from('%PDF-anexo'));zip.addFile('notas.txt',Buffer.from('ignorar'));
    const zipHandler=createSecopZipHandler({fetchImpl:async url=>{assert.equal(url.searchParams.get('DocumentId'),'44');return new Response(zip.toBuffer());}});
    const nativeFetch=globalThis.fetch;let lostPart=false,lostCommit=false;
    try {
      globalThis.fetch=async (url,options)=>{const response=await nativeFetch(url,options),path=new URL(url).pathname;if(path.endsWith('/secop-parts/0')&&!lostPart){lostPart=true;throw Error('respuesta perdida');}if(path.endsWith('/secop-commit')&&!lostCommit){lostCommit=true;await new Promise(resolve=>setTimeout(resolve,80));throw Error('respuesta perdida');}return response;};
      const run=await runOnce({server:(await worker.ready).origin,token:runner.token,handlers:{'secop.import-zip':zipHandler},retryDelayMs:10,renewIntervalMs:5});
      assert.equal(run.state,'succeeded');assert.equal(lostPart,true);assert.equal(lostCommit,true);
    } finally {globalThis.fetch=nativeFetch;}
    const allFiles=(await(await req(`/api/projects/${project.id}/files`,{headers:{cookie:alice}})).json()).files;
    assert.equal(allFiles.length,4);assert.equal(await(await req(`/api/projects/${project.id}/files/${allFiles.find(file=>file.name==='anexo.pdf').id}`,{headers:{cookie:alice}})).text(),'%PDF-anexo');
    const withFiles=await (await req(documentsPath,{headers:{cookie:alice}})).json();assert.equal(withFiles.items[0].imported,true);
    assert.equal((await (await post(`${documentsPath}/44/import`,{},alice)).json()).imported,true);
    const owner=(await db.prepare('SELECT owner_id FROM projects WHERE id=?').bind(project.id).first()).owner_id;
    for(const [id,state] of [['zz-older','cancelled'],['aa-newer','failed']]) await db.prepare("INSERT INTO jobs(id,project_id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at) VALUES(?,?,?,'secop.import-zip',?,'{\"documentId\":\"44\"}',?,'9999-01-01','9999-01-01')").bind(id,project.id,owner,id,state).run();
    const sameTime=await (await req(documentsPath,{headers:{cookie:alice}})).json();assert.equal(sameTime.items[0].zipJob.id,'aa-newer');
    await db.prepare("DELETE FROM secop_search_cache WHERE cache_key LIKE 'secop-document-snapshot:%'").run();
    const emptyCatalog = await req('/api/secop/documents?portfolioId=CO1.BDOS.9990&offset=0', { headers: { cookie: alice } });
    assert.equal(emptyCatalog.status, 200);
    assert.deepEqual((await emptyCatalog.json()).data.items, []);
    assert.equal(await db.prepare("SELECT 1 FROM secop_search_cache WHERE cache_key = 'secop-document-snapshot:v1:CO1.BDOS.9990'").first(), null);
    mode = 'partial'; const partialListing = await req(documentsPath, { headers: { cookie: alice } }); assert.equal((await partialListing.json()).partial, true);
    assert.equal(await db.prepare("SELECT 1 FROM secop_search_cache WHERE cache_key = 'secop-document-snapshot:v1:CO1.BDOS.123'").first(), null);
    const downloaded = await req(`/api/projects/${project.id}/files/${files[0].id}`, { headers: { cookie: alice } }); assert.equal(await downloaded.text(), '%PDF-1.4 fixture');
    mode='valid';
    const batchCreated=await post('/api/projects/from-secop',{process:result.data.items[0],documentIds:['42','999','44']},bob);assert.equal(batchCreated.status,201,await batchCreated.clone().text());const batchProject=(await batchCreated.json()).project;
    const batchPath=`/api/projects/${batchProject.id}/secop/imports`;
    assert.equal((await req(batchPath,{headers:{cookie:alice}})).status,404);
    const initial=(await(await req(batchPath,{headers:{cookie:bob}})).json()).items;assert.deepEqual(initial.map(x=>[x.id,x.state]),[['42','pending'],['999','pending'],['44','pending']]);
    assert.equal((await post(`${batchPath}/42`,{},bob)).status,201);
    assert.equal((await post(`${batchPath}/999`,{},bob)).status,404);
    const recovered=(await(await req(batchPath,{headers:{cookie:bob}})).json()).items;assert.deepEqual(recovered.map(x=>[x.id,x.state]),[['42','imported'],['999','failed'],['44','pending']]);
    assert.equal((await post(`${batchPath}/42`,{},bob)).status,200);
    assert.equal((await post(`${batchPath}/43`,{},bob)).status,404);
    mode='zip-list';const queued=await post(`${batchPath}/44`,{},bob);assert.equal(queued.status,201);const queuedJob=(await queued.json()).job;assert.equal((await(await req(batchPath,{headers:{cookie:bob}})).json()).items[2].state,'queued');
    assert.equal((await post(`/api/projects/${batchProject.id}/jobs/${queuedJob.id}/cancel`,{},bob)).status,200);assert.equal((await(await req(batchPath,{headers:{cookie:bob}})).json()).items[2].state,'failed');
    const retrySelected=await post(`${batchPath}/44`,{},bob);assert.equal(retrySelected.status,201);assert.notEqual((await retrySelected.json()).job.id,queuedJob.id);



    mode = 'html';
    const bobDocsPath = `/api/projects/${batchProject.id}/secop/documents`;
    const htmlBlocked = await post(`${bobDocsPath}/43/import`, {}, bob);
    assert.equal(htmlBlocked.status, 502);
    const htmlBody = await htmlBlocked.json();
    assert.equal(htmlBody.error, 'secop_captcha_required');
    assert.match(htmlBody.officialUrl, /DocumentId=43/);
    const runnerPairing = await (await post('/api/runner-pairings', {}, bob)).json();
    const pairedRunner = await (await post('/api/runners/pair', { code: runnerPairing.code, name: 'RunnerCaptcha' })).json();
    await req('/api/runner/jobs/claim', { method: 'POST', headers: { authorization: `Bearer ${pairedRunner.token}`, 'content-type': 'application/json' }, body: '{}' });
    const runnerFallback = await post(`${bobDocsPath}/43/import`, {}, bob);
    assert.equal(runnerFallback.status, 201);
    const fallbackBody = await runnerFallback.json();
    assert.equal(fallbackBody.fallback, 'runner');
    assert.equal(fallbackBody.job.state, 'queued');
    assert.equal((await db.prepare('SELECT kind FROM jobs WHERE id=?').bind(fallbackBody.job.id).first()).kind, 'secop.import-zip');
    await post(`/api/projects/${batchProject.id}/jobs/${fallbackBody.job.id}/cancel`, {}, bob);
    await req(`/api/runners/${pairedRunner.runner.id}`, { method: 'DELETE', headers: { cookie: bob } });
    mode = 'valid';

  } finally { await worker?.dispose(); await rm(build, { recursive: true, force: true }); }
});
