import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('inteligencia de mercado consulta fuentes oficiales y valida filtros',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-market-'));let worker;const calls=[];let failure=false;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  const outboundService=async request=>{const url=new URL(request.url);calls.push(url);assert.equal(url.hostname,'www.datos.gov.co');if(failure)return new Response('unavailable',{status:503});if(url.searchParams.has('$select'))return Response.json([{registros:'3',contratos:'2',con_valor:'2',desde:'2025-01-01',hasta:'2026-01-01',minimo:'0',maximo:'100',promedio:'50'}]);if(url.pathname.includes('9sue-ezhx'))return Response.json([{id:'1',nombre_entidad:'Entidad',descripcion:'Equipo',annio:'2026',valor_total_esperado:'42'}]);if(url.pathname.includes('rgxm-mmea'))return Response.json([{identificador_de_la_orden:'2',entidad:'Entidad',proveedor:'Proveedor',items:'Orden',total:'50'}]);return Response.json([{id_contrato:'3',nombre_entidad:'Entidad',proveedor_adjudicado:'Proveedor',descripcion_del_proceso:'Contrato',valor_del_contrato:'100',fecha_de_firma:'2026-01-01'}]);};
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'market'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'},outboundService}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),post=(path,body,cookie,origin='http://localhost')=>req(path,{method:'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  const signup=await post('/api/auth/sign-up/email',{name:'Alice',email:'alice@example.com',password:'password-123456'}),cookie=signup.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/secop/market',{mode:'paa'})).status,401);assert.equal((await post('/api/secop/market',{mode:'paa'},cookie,'https://other.example')).status,403);
  for(const invalid of [{mode:'unknown'},{mode:'paa',year:1999},{mode:'history',offset:-1},{mode:'paa',entity:'x'.repeat(301)}])assert.equal((await post('/api/secop/market',invalid,cookie)).status,400);
  assert.equal(calls.length,0);
  const paa=await post('/api/secop/market',{mode:'paa',entity:"O'Brien",keyword:'salud',year:2026,offset:20},cookie);assert.equal(paa.status,200);assert.equal((await paa.json()).data.items[0].value,42);assert.equal(calls[0].pathname,'/resource/9sue-ezhx.json');assert.match(calls[0].searchParams.get('$where'),/O''BRIEN/);assert.equal(calls[0].searchParams.get('$offset'),'20');
  const history=await post('/api/secop/market',{mode:'history',supplier:'Proveedor'},cookie);assert.equal(history.status,200);assert.equal((await history.json()).data.items[0].id,'3');assert.equal(calls[1].pathname,'/resource/jbjy-vk9h.json');
  const tvec=await post('/api/secop/market',{mode:'tvec'},cookie);assert.equal(tvec.status,200);assert.equal((await tvec.json()).data.items[0].id,'2');assert.equal(calls[2].pathname,'/resource/rgxm-mmea.json');
  const summary=await post('/api/secop/market/summary',{entity:'Entidad',supplier:'Proveedor',keyword:'servicio'},cookie);assert.equal(summary.status,200);const aggregate=(await summary.json()).data;assert.equal(aggregate.records,3);assert.equal(aggregate.contracts,2);assert.equal(aggregate.average,50);assert.equal(new URL(aggregate.sourceUrl).hostname,'www.datos.gov.co');
  failure=true;const failed=await post('/api/secop/market',{mode:'history',keyword:'no cache'},cookie);assert.equal(failed.status,502);
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
