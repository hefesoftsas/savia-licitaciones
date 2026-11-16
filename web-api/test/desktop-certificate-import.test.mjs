import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const { createCompanyArchive } = require('./electron/services/companyBackupArchive.cjs');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('migra certificados del respaldo de manera aislada, idempotente y sin sobrescribir cambios', async () => {
 const dir=await mkdtemp(join(tmpdir(),'savia-cert-import-')); let worker;
 try {
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'cert-import'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const db=await worker.getD1Database('DB'); for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort()) for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options), post=(path,body,headers={})=>req(path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...headers},body:JSON.stringify(body)});
  async function signup(name){const r=await post('/api/auth/sign-up/email',{name,email:`${name}@example.com`,password:'password-123456'});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
  const alice=await signup('alice'),bob=await signup('bob'),pair=(await (await post('/api/runner-pairings',{}, {cookie:alice})).json()),runner=(await (await post('/api/runners/pair',{code:pair.code,name:'Equipo'})).json());
  const file=join(dir,'db.sqlite'), local=new DatabaseSync(file);
  local.exec("PRAGMA user_version=64; CREATE TABLE technical_plan_meta (id INTEGER, outline_project_name TEXT); INSERT INTO technical_plan_meta VALUES (1,'Plan'); CREATE TABLE technical_plan_outline_nodes (node_id TEXT, parent_node_id TEXT, sort_order INTEGER, title TEXT); CREATE TABLE credential_library_certificates (certificate_id TEXT, name TEXT, number TEXT, validity_mode TEXT, valid_from TEXT, valid_to TEXT, created_at TEXT, updated_at TEXT); INSERT INTO credential_library_certificates VALUES ('c1','Certificado secreto','NUM-PRIVADO','range','2026-01-01','2026-12-10','2026-01-01','2026-01-02'),('c2',NULL,NULL,'legacy','fecha anterior','','2026-01-01','2026-01-02'); CREATE TABLE credential_library_images (image_id TEXT, owner_type TEXT, owner_id TEXT, field_key TEXT, original_name TEXT, relative_path TEXT, custom_name TEXT, sort_order INTEGER, created_at TEXT); INSERT INTO credential_library_images VALUES ('i1','certificate','c1','certificateImages','Original ñ.png','images/original.png','Nombre especial',0,'2026-01-01'),('i2','certificate','c1','certificateImages','Perdida.png','images/missing.png','',1,'2026-01-01'),('i3','certificate','c1','certificateImages','Externa.png','../exterior.png','',2,'2026-01-01'),('i4','certificate','c1','certificateImages','Segunda.png','images/second.png','',3,'2026-01-02'),('i5','certificate','c1','certificateImages','Corrupta.png','images/corrupt.png','',4,'2026-01-02'),('other','employee','e','x','x','x','',0,'2026-01-01');"); local.close();
  const backup=join(dir,'backup.savia'),config=join(dir,'runner.json'); await writeFile(backup,createCompanyArchive({companyName:'Empresa',schemaVersion:64,files:[{path:'workspace/savia.sqlite',bytes:await readFile(file)},{path:'workspace/credential-library/images/original.png',bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=','base64')},{path:'workspace/credential-library/images/second.png',bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=','base64')},{path:'workspace/credential-library/images/corrupt.png',bytes:Buffer.from('no es imagen')}]})); await writeFile(config,JSON.stringify({server:(await worker.ready).origin,runnerId:runner.runner.id,token:runner.token}));
  const cli=process.env.SAVIA_TEST_RUNNER_CLI||resolve(root,'../runner/cli.mjs'),execute=promisify(execFile),inspect=(await execute(process.execPath,[cli,'inspect-backup','--backup',backup])).stdout;
  assert.equal(JSON.parse(inspect).companyCertificates.count,2); assert.equal(JSON.parse(inspect).companyCertificates.imageCount,5); assert.equal(inspect.includes('NUM-PRIVADO'),false);
  const args=[cli,'import-certificates','--backup',backup,'--config',config],first=JSON.parse((await execute(process.execPath,args)).stdout),second=JSON.parse((await execute(process.execPath,args)).stdout); assert.equal(first.imported,2);assert.equal(first.importedImages,2);assert.equal(first.missingImages.length,3);assert.deepEqual(first.missingImages.map(x=>x.reason).sort(),['not_found','unsafe_path','unsupported']);assert.equal(second.importedImages,2);assert.equal(second.imported,2);
  let rows=(await (await req('/api/company-certificates',{headers:{cookie:alice}})).json()).certificates; assert.equal(rows.length,2); assert.deepEqual((await (await req('/api/company-certificates',{headers:{cookie:bob}})).json()).certificates,[]); const c1=rows.find(row=>row.name==='Certificado secreto'), c2=rows.find(row=>row.validityMode==='legacy'); assert.equal(c1.number,'NUM-PRIVADO'); assert.equal(c2.validFrom,'fecha anterior');
  const imagePath=`/api/company-certificates/${c1.id}/images`, images=(await (await req(imagePath,{headers:{cookie:alice}})).json()).images; assert.deepEqual(images.map(item=>item.name),['Original ñ.png','Segunda.png']); assert.equal(images[0].name,'Original ñ.png'); assert.equal(images[0].customName,'Nombre especial');
  assert.equal((await req(`${imagePath}/${images[0].id}`,{headers:{cookie:bob}})).status,404); assert.ok((await (await req(`${imagePath}/${images[0].id}`,{headers:{cookie:alice}})).arrayBuffer()).byteLength > 0);
  const agenda=(await (await req('/api/agenda',{headers:{cookie:alice}})).json()).items; assert.equal(agenda[0].title,'Certificado secreto');
  assert.equal((await req(`${imagePath}/${images[0].id}`,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}})).status,204);
  const imageRetry=JSON.parse((await execute(process.execPath,args)).stdout); assert.equal(imageRetry.removedImages,1); assert.equal((await (await req(imagePath,{headers:{cookie:alice}})).json()).images.length,1);
  const edit=await req(`/api/company-certificates/${c1.id}`,{method:'PUT',headers:{cookie:alice,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({name:'Editado',number:c1.number,validityMode:'range',validFrom:c1.validFrom,validTo:c1.validTo,version:1})}); assert.equal(edit.status,200);
  const del=await req(`/api/company-certificates/${c2.id}`,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({version:1})});assert.equal(del.status,204);
  const retry=JSON.parse((await execute(process.execPath,args)).stdout);assert.equal(retry.removed,1); rows=(await (await req('/api/company-certificates',{headers:{cookie:alice}})).json()).certificates;assert.equal(rows.length,1);assert.equal(rows[0].name,'Editado');
  const archiveHash=createHash('sha256').update(await readFile(backup)).digest('hex'),sourceKey=createHash('sha256').update('c1').digest('hex'),path=`/api/runner/imports/certificates/desktop-certificates-${archiveHash}/${sourceKey}`;
  assert.equal((await post(path,{},{})).status,401);
  const original={sourceId:'c1',name:'Certificado secreto',number:'NUM-PRIVADO',validityMode:'range',validFrom:'2026-01-01',validTo:'2026-12-10',createdAt:'2026-01-01',updatedAt:'2026-01-02'};
  assert.equal((await post(path,{...original,name:'Alterado'},{authorization:`Bearer ${runner.token}`})).status,409);
  await db.prepare('UPDATE company_certificates SET deleting = 1 WHERE id = ?').bind(c1.id).run();
  assert.equal((await post(path,original,{authorization:`Bearer ${runner.token}`})).status,410);
  await db.prepare('UPDATE company_certificates SET deleting = 0 WHERE id = ?').bind(c1.id).run();

  const fresh={...original,sourceId:'concurrente',name:'Concurrente'},freshKey=createHash('sha256').update(fresh.sourceId).digest('hex'),freshPath=`/api/runner/imports/certificates/desktop-certificates-${archiveHash}/${freshKey}`,headers={authorization:`Bearer ${runner.token}`};
  const simultaneous=await Promise.all([post(freshPath,fresh,headers),post(freshPath,fresh,headers)]); assert.deepEqual(simultaneous.map(response=>response.status).sort(),[200,201]); assert.equal((await simultaneous[0].json()).certificateId,(await simultaneous[1].json()).certificateId);
  await db.exec("CREATE TRIGGER fail_cert_import BEFORE INSERT ON desktop_certificate_imports WHEN NEW.source_key = '" + createHash('sha256').update('failure').digest('hex') + "' BEGIN SELECT RAISE(ABORT,'simulated'); END");
  const fail={...original,sourceId:'failure'},failPath=`/api/runner/imports/certificates/desktop-certificates-${archiveHash}/${createHash('sha256').update(fail.sourceId).digest('hex')}`;
  let failed; try { failed=await post(failPath,fail,headers); } catch { /* D1 can surface the simulated error directly. */ } if(failed) assert.equal(failed.status,500);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM company_certificates WHERE name = ?').bind('Certificado secreto').first()).count,0);
  await db.exec('DROP TRIGGER fail_cert_import');
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=','base64'), imageSource='race-image', imageKey=createHash('sha256').update(imageSource).digest('hex'), imageUrl=`/api/runner/imports/certificates/desktop-certificates-${archiveHash}/images/${imageKey}`;
  const metadata={sourceId:imageSource,certificateSourceId:'c1',name:'otro.png',customName:'Prueba',fieldKey:'certificateImages',createdAt:'2026-01-01'};
  const sendImage=async (details=metadata) => { const form=new FormData();form.set('metadata',JSON.stringify(details));form.set('file',new Blob([bytes]),'image.png');const request=new Request(`http://localhost${imageUrl}`,{method:'POST',headers,body:form});return worker.dispatchFetch(request.url,{method:'POST',headers:Object.fromEntries(request.headers),body:await request.arrayBuffer()}); };
  const concurrentImages=await Promise.all([sendImage(),sendImage()]);assert.deepEqual(concurrentImages.map(r=>r.status).sort(),[200,201]);assert.equal((await concurrentImages[0].json()).imageId,(await concurrentImages[1].json()).imageId);assert.equal((await sendImage({...metadata,customName:'distinto'})).status,409);
  const bucket=await worker.getR2Bucket('FILES'),before=(await bucket.list()).objects.map(x=>x.key).sort(),owner=(await db.prepare('SELECT id FROM user WHERE email = ?').bind('alice@example.com').first()).id;
  const { importCertificateImage }=await import('../src/desktop-certificate-image-import.js');
  const failImage={...metadata,sourceId:'failing-image'},failImageKey=createHash('sha256').update(failImage.sourceId).digest('hex'),makeRequest=()=>{const form=new FormData();form.set('metadata',JSON.stringify(failImage));form.set('file',new Blob([bytes]),'image.png');return new Request('http://localhost/import',{method:'POST',body:form});};
  await db.exec("CREATE TRIGGER fail_image_import BEFORE INSERT ON desktop_certificate_image_imports WHEN NEW.source_key = '"+failImageKey+"' BEGIN SELECT RAISE(ABORT,'simulated'); END");
  let failedImage;try{failedImage=await importCertificateImage(makeRequest(),{DB:db,FILES:bucket},{ownerId:owner},`desktop-certificates-${archiveHash}`,failImageKey);}catch{/* D1 may throw */}if(failedImage)assert.equal(failedImage.status,500);
  assert.deepEqual((await bucket.list()).objects.map(x=>x.key).sort(),before);await db.exec('DROP TRIGGER fail_image_import');
  const failedR2={put:async()=>{throw Error('simulated R2');},delete:key=>bucket.delete(key)};await assert.rejects(importCertificateImage(makeRequest(),{DB:db,FILES:failedR2},{ownerId:owner},`desktop-certificates-${archiveHash}`,failImageKey),/simulated R2/);assert.deepEqual((await bucket.list()).objects.map(x=>x.key).sort(),before);
  let entered,proceed;const enteredPromise=new Promise(resolve=>entered=resolve),proceedPromise=new Promise(resolve=>proceed=resolve),slowBucket={put:async(key,data)=>{entered();await proceedPromise;return bucket.put(key,data);},delete:key=>bucket.delete(key)};
  const pending=importCertificateImage(makeRequest(),{DB:db,FILES:slowBucket},{ownerId:owner},`desktop-certificates-${archiveHash}`,failImageKey);await enteredPromise;
  const { companyCertificates }=await import('../src/company-certificates.js'),deleteRequest=new Request('http://localhost/delete',{method:'DELETE',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({version:2})});
  assert.equal((await companyCertificates(deleteRequest,{DB:db,FILES:bucket,BETTER_AUTH_URL:'http://localhost'},owner,c1.id)).status,204);proceed();assert.equal((await pending).status,410);assert.equal((await bucket.list()).objects.length,0);



 } finally {await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
