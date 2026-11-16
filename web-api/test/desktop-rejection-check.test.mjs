import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(new URL('../../client/package.json',import.meta.url));
const {createCompanyArchive}=require('./electron/services/companyBackupArchive.cjs');

test('migra rechazo con documentos e imágenes y lo aísla de cuentas y otras revisiones',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-rejection-web-'));let worker;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'rejection'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const db=await worker.getD1Database('DB');for(const name of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',name),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),post=(path,body,headers={})=>req(path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...headers},body:JSON.stringify(body)});
  async function signup(name){return (await post('/api/auth/sign-up/email',{name,email:`${name}@example.com`,password:'password-123456'})).headers.get('set-cookie').split(';')[0];}
  const alice=await signup('alice'),bob=await signup('bob'),pair=await (await post('/api/runner-pairings',{}, {cookie:alice})).json(),runner=await (await post('/api/runners/pair',{code:pair.code,name:'Equipo'})).json();
  const file=join(dir,'desktop.sqlite'),dbLocal=new DatabaseSync(file);dbLocal.exec(`PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER,outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT,parent_node_id TEXT,sort_order INTEGER,title TEXT); CREATE TABLE rejection_check_documents (document_id TEXT,role TEXT,file_name TEXT,markdown_path TEXT,sort_order INTEGER); INSERT INTO rejection_check_documents VALUES ('doc','bid','Oferta.docx','rejection-check/bids/doc.md',0),('missing','tender','Pliego.pdf','rejection-check/tenders/missing.md',0); CREATE TABLE rejection_check_risk_findings (finding_id TEXT,bid_document_id TEXT,title TEXT,sort_order INTEGER); INSERT INTO rejection_check_risk_findings VALUES ('risk','doc','Riesgo privado',0);`);dbLocal.close();
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=','base64'),markdown='Privado ![plano](savia-asset://imported-images/rejection-check-bid-doc/fig.png)';
  const backup=join(dir,'backup.savia'),config=join(dir,'runner.json');await writeFile(backup,createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)},{path:'workspace/rejection-check/bids/doc.md',bytes:Buffer.from(markdown)},{path:'workspace/imported-images/rejection-check-bid-doc/fig.png',bytes:png}]}));await writeFile(config,JSON.stringify({server:(await worker.ready).origin,runnerId:runner.runner.id,token:runner.token}));
  const cli=process.env.SAVIA_TEST_RUNNER_CLI||resolve(root,'../runner/cli.mjs'),args=[cli,'import-rejection-check','--backup',backup,'--config',config],run=promisify(execFile),output=(await run(process.execPath,args)).stdout;
  assert.equal(output.includes('Riesgo privado'),false);const result=JSON.parse(output);assert.equal(result.uploaded,2);assert.equal(result.missing,1);assert.equal(JSON.parse((await run(process.execPath,args)).stdout).id,result.id);
  assert.deepEqual((await (await req('/api/imported-rejection-checks',{headers:{cookie:bob}})).json()).reviews,[]);assert.deepEqual((await (await req('/api/imported-duplicate-checks',{headers:{cookie:alice}})).json()).reviews,[]);
  assert.equal((await req(`/api/imported-duplicate-checks/${result.id}`,{headers:{cookie:alice}})).status,404);assert.equal((await req(`/api/imported-rejection-checks/${result.id}`,{headers:{cookie:bob}})).status,404);
  assert.equal((await req(`/api/imported-duplicate-checks/${result.id}`,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}})).status,404);
  const data=await (await req(`/api/imported-rejection-checks/${result.id}`,{headers:{cookie:alice}})).json();assert.equal(data.tables.rejection_check_risk_findings[0].title,'Riesgo privado');const doc=data.files.find(item=>item.category==='document'&&item.sourceId==='doc'),image=data.files.find(item=>item.category==='image');assert.equal(doc.content.available,true);assert.equal(data.files.find(item=>item.sourceId==='missing').content.reason,'not_found');
  const url=item=>`/api/imported-rejection-checks/${result.id}/files/${item.sourceKey}/content`;assert.equal(await (await req(url(doc),{headers:{cookie:alice}})).text(),markdown);assert.deepEqual(Buffer.from(await (await req(url(image),{headers:{cookie:alice}})).arrayBuffer()),png);
  assert.equal((await req(`/api/imported-duplicate-checks/${result.id}/files/${doc.sourceKey}/content`,{headers:{cookie:alice}})).status,404);
  assert.equal((await req(`/api/runner/imports/duplicate-check-files/${result.id}/${doc.sourceKey}/content`,{method:'POST',headers:{authorization:`Bearer ${runner.token}`},body:markdown})).status,404);
  assert.equal((await req(`/api/imported-rejection-checks/${result.id}`,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}})).status,204);assert.equal(JSON.parse((await run(process.execPath,args)).stdout).removed,true);
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
