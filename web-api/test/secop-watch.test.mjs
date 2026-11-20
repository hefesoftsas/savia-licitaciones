import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('seguimiento SECOP detecta cambios y conserva fuentes incompletas',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-secop-watch-'));let worker,status='Abierto',deadline='2026-12-01',second=false,partial=false,calls=0,gate=null;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  const outboundService=async request=>{calls++;const url=new URL(request.url);assert.equal(url.hostname,'www.datos.gov.co');if(url.pathname==='/resource/p6dx-8zbt.json' && gate){gate.enter();await gate.promise;}if(url.pathname==='/resource/p6dx-8zbt.json')return Response.json([{id_del_proceso:'CO1.PRO.123',id_del_portafolio:'CO1.BDOS.123',entidad:'Entidad',nombre_del_procedimiento:'Compra',estado_del_procedimiento:status,fecha_de_recepcion_de:deadline}]);if(partial&&url.pathname==='/resource/dmgg-8hin.json')return new Response('unavailable',{status:503});return Response.json([{id_documento:'1',nombre_archivo:'Pliego.pdf',extensi_n:'pdf'},...(second?[{id_documento:'2',nombre_archivo:'Adenda.pdf',extensi_n:'pdf'}]:[])]);};
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'secop-watch'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'},outboundService}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),send=(path,method,body,cookie,origin='http://localhost')=>req(path,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  async function signup(name){const r=await send('/api/auth/sign-up/email','POST',{name,email:`${name}@example.com`,password:'password-123456'});return r.headers.get('set-cookie').split(';')[0];}const alice=await signup('alice'),bob=await signup('bob');
  const tenderData={source:'secop-ii',id:'CO1.PRO.123',title:'Compra',portfolioId:'CO1.BDOS.123',deadline:'2026-11-01',deadlineVerified:false};const project=(await (await send('/api/projects/from-secop','POST',{process:tenderData},alice)).json()).project,path=`/api/projects/${project.id}/secop-watch`;
  assert.equal((await req(path)).status,401);assert.equal((await req(path,{headers:{cookie:bob}})).status,404);assert.equal((await send(path,'POST',{},alice,'https://other.example')).status,403);
  assert.equal((await send(path,'POST',{},alice)).status,200);let state=await (await req(path,{headers:{cookie:alice}})).json();assert.equal(state.alerts.length,0);assert.equal(state.baseline.deadline,'2026-12-01');
  let agenda=(await (await req('/api/agenda',{headers:{cookie:alice}})).json()).items;assert.equal(agenda[0].date,'2026-12-01');assert.equal(agenda[0].deadlineSource,'watch');
  status='Cerrado';deadline='2026-12-03';second=true;const simultaneous=await Promise.all([send(path,'POST',{},alice),send(path,'POST',{},alice)]);assert.ok(simultaneous.every(r=>[200,409].includes(r.status)));state=await (await req(path,{headers:{cookie:alice}})).json();assert.deepEqual(state.alerts.map(x=>x.kind).sort(),['deadline','document','status']);assert.equal(state.unreadCount,3);assert.equal(state.alerts.find(x=>x.kind==='document').current.name,'Adenda.pdf');assert.equal(state.alerts.find(x=>x.kind==='status').previous,'Abierto');
  const overview=await (await req('/api/secop-watch',{headers:{cookie:alice}})).json();assert.equal(overview.alerts.length,3);assert.equal(overview.alerts[0].projectId,project.id);assert.equal((await (await req('/api/secop-watch',{headers:{cookie:bob}})).json()).alerts.length,0);
  const alert=state.alerts[0];assert.equal((await send(`/api/secop-alerts/${alert.id}/review`,'POST',{},bob)).status,404);assert.equal((await send(`/api/secop-alerts/${alert.id}/review`,'POST',{},alice)).status,200);
  partial=true;assert.equal((await send(path,'POST',{},alice)).status,200);state=await (await req(path,{headers:{cookie:alice}})).json();assert.equal(state.alerts.length,3);assert.ok(state.error);assert.equal(state.baseline.deadline,'2026-12-03');
  const before=calls;assert.equal((await send('/api/secop-watch/check-due','POST',{},alice)).status,200);assert.equal(calls,before);
  await db.prepare('UPDATE secop_watch_baselines_web SET checked_at = ? WHERE project_id = ?').bind('2020-01-01T00:00:00.000Z',project.id).run();partial=false;const due=await send('/api/secop-watch/check-due','POST',{},alice);assert.equal((await due.json()).checked,1);
  let enter,release;const started=new Promise(resolve=>enter=resolve);gate={enter,promise:new Promise(resolve=>release=resolve)};const pending=send(path,'POST',{},alice);await started;const callsAtRemoval=calls;await db.prepare('DELETE FROM project_secop WHERE project_id = ?').bind(project.id).run();release();gate=null;assert.equal((await pending).status,409);assert.equal(calls,callsAtRemoval);assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM secop_watch_alerts_web WHERE project_id = ?').bind(project.id).first()).count,3);

 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});

test('seguimiento PLACSP detecta cambios de estado, plazo y documentos',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-placsp-watch-'));let worker,statusCode='PUB',deadline='2026-12-20',extraDoc=false,unavailable=false;
 const licitId='11111111-2222-3333-4444-555555555555';
 let licitCalls=0, atomCalls=0, licitStatus='EN PLAZO', licitUnavailable=false;
 let portalCalls=0, portalStatus='Publicada', portalDeadline='31/12/2099 14:00', portalExtraDoc=false;

 const atom=()=>{
  const docExtra=extraDoc?`\n      <cac:TechnicalDocumentReference>\n        <cbc:ID>ADENDA-1.pdf</cbc:ID>\n        <cac:Attachment><cac:ExternalReference><cbc:URI>https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?DocumentIdParam=ADENDA1</cbc:URI></cac:ExternalReference></cac:Attachment>\n      </cac:TechnicalDocumentReference>`:'';
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:cbc="urn:dgpe:names:draft:codice:schema:xsd:CommonBasicComponents-2"
      xmlns:cac="urn:dgpe:names:draft:codice:schema:xsd:CommonAggregateComponents-2"
      xmlns:cbc-place-ext="urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonBasicComponents-2"
      xmlns:cac-place-ext="urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonAggregateComponents-2">
  <updated>2026-11-15T10:00:00.000+01:00</updated>
  <entry>
    <id>https://contrataciondelsectorpublico.gob.es/sindicacion/licitacionesPerfilContratante/999001</id>
    <title>Servicios TI España</title>
    <updated>2026-11-15T09:30:00+01:00</updated>
    <link rel="alternate" href="https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&amp;idEvl=XYZ999"/>
    <cac-place-ext:ContractFolderStatus>
      <cbc:ContractFolderID>EXP-2026-999</cbc:ContractFolderID>
      <cbc-place-ext:ContractFolderStatusCode>${statusCode}</cbc-place-ext:ContractFolderStatusCode>
      <cac-place-ext:LocatedContractingParty>
        <cac:Party><cac:PartyName><cbc:Name>Ministerio TI</cbc:Name></cac:PartyName></cac:Party>
      </cac-place-ext:LocatedContractingParty>
      <cac:ProcurementProject>
        <cbc:Name>Servicios TI España</cbc:Name>
        <cac:BudgetAmount><cbc:TaxExclusiveAmount currencyID="EUR">150000</cbc:TaxExclusiveAmount></cac:BudgetAmount>
      </cac:ProcurementProject>
      <cac:TenderingProcess>
        <cac:TenderSubmissionDeadlinePeriod><cbc:EndDate>${deadline}</cbc:EndDate><cbc:EndTime>14:00:00</cbc:EndTime></cac:TenderSubmissionDeadlinePeriod>
      </cac:TenderingProcess>
      <cac:LegalDocumentReference>
        <cbc:ID>PCAP-1.pdf</cbc:ID>
        <cac:Attachment><cac:ExternalReference><cbc:URI>https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?DocumentIdParam=PCAP1</cbc:URI></cac:ExternalReference></cac:Attachment>
      </cac:LegalDocumentReference>${docExtra}
    </cac-place-ext:ContractFolderStatus>
  </entry>
</feed>`;
 };
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  const outboundService=async request=>{
   const url=new URL(request.url);
   if (url.hostname === 'api.licit.es') {
    if (url.pathname !== '/v1/licitacion/' + licitId) return new Response('unavailable',{status:503});
    licitCalls++;
    if (licitUnavailable) return new Response('unavailable',{status:503});
    return Response.json({id:licitId, titulo:'Obras de saneamiento', expediente:'LICIT-100', estado:licitStatus,
      fecha_limite:'2026-12-31', hora_limite:'13:00:00', fecha_actualizacion:'2026-11-30'});
   }
   if (url.hostname === 'contrataciondelestado.es' && url.pathname === '/wps/poc' && url.searchParams.get('idEvl') === 'PORTAL-WATCH-1') {
    portalCalls++;
    const extra=portalExtraDoc?'<tr><td>02/12/2026</td><td>Adenda</td><td><a href="https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?DocumentIdParam=PORTAL-ADENDA"><img alt="Documento pdf"></a></td></tr>':'';
    return new Response(`<span id="app:form1:text_Expediente">PORTAL-100</span><span id="app:form1:text_ObjetoContrato">Servicio oficial vigilado</span><span id="app:form1:text_OC_con">Ministerio</span><span id="app:form1:text_Estado">${portalStatus}</span><span id="app:form1:text_FechaPresentacionOfertaConHora">${portalDeadline}</span><table id="myTablaDetalleVISUOE"><tr><td>01/12/2026</td><td>Pliego</td><td><a href="https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?DocumentIdParam=PORTAL-PCAP"><img alt="Documento pdf"></a></td></tr>${extra}</table>`,{headers:{'content-type':'text/html; charset=UTF-8'}});
   }
   assert.equal(url.hostname,'contrataciondelsectorpublico.gob.es');
   atomCalls++;
   if(unavailable)return new Response('unavailable',{status:503});
   return new Response(atom(),{headers:{'content-type':'application/atom+xml'}});
  };
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'placsp-watch'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'},outboundService}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),send=(path,method,body,cookie)=>req(path,{method,headers:{origin:'http://localhost','content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  const signup=await send('/api/auth/sign-up/email','POST',{name:'ana',email:'ana@example.es',password:'password-123456'});assert.equal(signup.status,200);
  const cookie=signup.headers.get('set-cookie').split(';')[0];
  assert.equal((await send('/api/secop/placsp/sync','POST',{},cookie)).status,200);
  const search=await (await send('/api/secop/search','POST',{dataset:'placsp'},cookie)).json();
  const tender=search.data.items[0];assert.equal(tender.source,'placsp');
  const project=(await (await send('/api/projects/from-secop','POST',{process:tender},cookie)).json()).project;
  const path=`/api/projects/${project.id}/secop-watch`;
  assert.equal((await send(path,'POST',{},cookie)).status,200);
  let state=await (await req(path,{headers:{cookie}})).json();
  assert.equal(state.alerts.length,0);
  assert.equal(state.baseline.deadline,'2026-12-20T14:00:00');
  assert.equal(state.baseline.deadlineVerified,true);

  statusCode='ADJ';deadline='2026-12-28';extraDoc=true;
  assert.equal((await send(path,'POST',{},cookie)).status,200);
  state=await (await req(path,{headers:{cookie}})).json();
  assert.deepEqual(state.alerts.map(x=>x.kind).sort(),['deadline','document','status']);
  assert.equal(state.unreadCount,3);
  assert.equal(state.alerts.find(x=>x.kind==='document').current.name,'ADENDA-1.pdf');

  unavailable=true;
  assert.equal((await send(path,'POST',{},cookie)).status,200);
  state=await (await req(path,{headers:{cookie}})).json();
  assert.ok(state.error);
  assert.equal(state.baseline.deadline,'2026-12-28T14:00:00');

  const licitTender={source:'placsp',id:'licit:' + licitId,title:'Obras de saneamiento',reference:'LICIT-100'};
  const licitProject=(await (await send('/api/projects/from-secop','POST',{process:licitTender},cookie)).json()).project;
  const licitPath=`/api/projects/${licitProject.id}/secop-watch`;
  const previousAtomCalls=atomCalls;
  assert.equal((await send(licitPath,'POST',{},cookie)).status,200);
  const initialLicit=await (await req(licitPath,{headers:{cookie}})).json();
  assert.equal(initialLicit.baseline.status,'Publicado');
  assert.equal(initialLicit.baseline.deadline,'2026-12-31T13:00:00');
  licitStatus='ADJUDICADA';
  assert.equal((await send(licitPath,'POST',{},cookie)).status,200);
  state=await (await req(licitPath,{headers:{cookie}})).json();
  assert.equal(state.alerts.find(item=>item.kind==='status')?.current,'Adjudicado');
  licitUnavailable=true;
  assert.equal((await send(licitPath,'POST',{},cookie)).status,200);
  state=await (await req(licitPath,{headers:{cookie}})).json();
  assert.ok(state.error);
  assert.equal(state.baseline.status,'Adjudicado');
  assert.equal(licitCalls,3);
  assert.equal(atomCalls,previousAtomCalls);

  const portalId='portal:0123456789abcdef01234567';
  const portalUrl='https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=PORTAL-WATCH-1';
  await db.prepare('INSERT INTO placsp_tenders (id, title, reference, url, synced_at) VALUES (?, ?, ?, ?, ?)').bind(portalId,'Servicio oficial vigilado','PORTAL-100',portalUrl,Date.now()).run();
  const portalTender={source:'placsp',id:portalId,title:'Servicio oficial vigilado',reference:'PORTAL-100',url:portalUrl};
  const portalProject=(await (await send('/api/projects/from-secop','POST',{process:portalTender},cookie)).json()).project;
  const portalWatchPath=`/api/projects/${portalProject.id}/secop-watch`;
  const atomBeforePortal=atomCalls;
  assert.equal((await send(portalWatchPath,'POST',{},cookie)).status,200);
  portalStatus='Adjudicada';
  portalDeadline='05/01/2100 10:00';
  portalExtraDoc=true;
  assert.equal((await send(portalWatchPath,'POST',{},cookie)).status,200);
  const portalWatchState=await (await req(portalWatchPath,{headers:{cookie}})).json();
  assert.deepEqual(portalWatchState.alerts.map(x=>x.kind).sort(),['deadline','document','status']);
  assert.equal(portalWatchState.alerts.find(x=>x.kind==='status')?.current,'Adjudicada');
  assert.equal(portalWatchState.alerts.find(x=>x.kind==='deadline')?.current,'2100-01-05T10:00:00');
  assert.equal(portalCalls,2);
  assert.equal(atomCalls,atomBeforePortal);
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
