import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const moduleUrl=process.env.SAVIA_TEST_PACKAGED_RUNNER?pathToFileURL(join(process.env.SAVIA_TEST_PACKAGED_RUNNER,'runner','account-components-capture.mjs')).href:new URL('../../runner/account-components-capture.mjs',import.meta.url).href;
const {captureAccountComponents,accountComponentNames}=await import(moduleUrl);
const restoreModuleUrl=process.env.SAVIA_TEST_PACKAGED_RUNNER?pathToFileURL(join(process.env.SAVIA_TEST_PACKAGED_RUNNER,'runner','account-components-restore.mjs')).href:new URL('../../runner/account-components-restore.mjs',import.meta.url).href;
const {restoreAccountComponents}=await import(restoreModuleUrl);

test('captura los componentes de la cuenta vinculada y respeta revocación',{timeout:120000},async()=>{
 const rootDir=await mkdtemp(join(tmpdir(),'savia-account-components-'));let worker;
 try{
  const build=join(rootDir,'build');
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',build],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(build,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'accounts'},r2Buckets:['FILES'],bindings:{BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');for(const file of (await readdir(join(root,'migrations'))).filter(name=>name.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  const tokens={alice:'a'.repeat(64),bob:'b'.repeat(64)};
  for(const id of ['alice','bob']){await DB.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt,savia_language) VALUES (?,?,?,0,0,0,?)').bind(id,id,`${id}@example.test`,id==='alice'?'es':'en').run();await DB.prepare('INSERT INTO runners (id,owner_id,name,token_hash,created_at) VALUES (?,?,?,?,?)').bind(`runner-${id}`,id,id,createHash('sha256').update(tokens[id]).digest('hex'),'2026').run();}
  const image=Uint8Array.from([137,80,78,71,13,10,26,10,1]);await FILES.put('alice-image',image);await DB.prepare('INSERT INTO company_profile_images(id,owner_id,name,custom_name,field_key,content_type,object_key,size,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind('alice-image','alice','oficina.png','','officeEnvironment','image/png','alice-image',image.length,0,'2026').run();
  const fetchImpl=async(url,options)=>{const request=new Request(url,options);return worker.dispatchFetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),body:request.body?await request.arrayBuffer():undefined});},destination=join(rootDir,'capture');
  const result=await captureAccountComponents({server:'http://localhost',token:tokens.alice,destination,fetchImpl});
  assert.deepEqual(result.components,accountComponentNames);assert.equal(result.complete,false);assert.equal(result.atomic,false);
  const preferences=JSON.parse(await readFile(join(destination,'preferences','metadata.json'),'utf8'));assert.equal(preferences.preferences.language,'es');
  for(const name of accountComponentNames){const manifest=JSON.parse(await readFile(join(destination,name,'manifest.json'),'utf8'));assert.equal(manifest.complete,false);}
  assert.equal(JSON.parse(await readFile(join(destination,'company-profile','manifest.json'),'utf8')).objects.length,1);
  const config=join(rootDir,'runner.json'),cli=process.env.SAVIA_TEST_RUNNER_CLI||resolve(root,'../runner/cli.mjs'),cliDestination=join(rootDir,'cli-capture');
  await writeFile(config,JSON.stringify({server:(await worker.ready).origin,runnerId:'bob',token:tokens.bob}));
  const output=await promisify(execFile)(process.execPath,[cli,'capture-account-components','--config',config,'--output',cliDestination],{timeout:90000});
  assert.match(output.stdout,/No es un respaldo completo/);assert.equal(JSON.parse(await readFile(join(cliDestination,'preferences','metadata.json'),'utf8')).preferences.language,'en');assert.equal(JSON.parse(await readFile(join(cliDestination,'company-profile','manifest.json'),'utf8')).objects.length,0);
  const lastMetadata=join(destination,'feasibility','metadata.json'),originalMetadata=await readFile(lastMetadata,'utf8');await writeFile(lastMetadata,'{}');await assert.rejects(restoreAccountComponents({server:'http://localhost',token:tokens.bob,directory:destination,expectedRevision:0,fetchImpl}),/integridad/i);assert.equal((await DB.prepare('SELECT count(*) AS total FROM company_profile_images WHERE owner_id=?').bind('bob').first()).total,0);await writeFile(lastMetadata,originalMetadata);
  const restored=await restoreAccountComponents({server:'http://localhost',token:tokens.bob,directory:destination,expectedRevision:0,fetchImpl});assert.equal(restored.complete,false);assert.equal(restored.components['company-profile'].images,1);assert.equal(restored.components.preferences.revision,1);assert.equal((await DB.prepare('SELECT savia_language FROM "user" WHERE id=?').bind('bob').first()).savia_language,'es');
  const images=(await DB.prepare('SELECT id,object_key FROM company_profile_images WHERE owner_id=?').bind('bob').all()).results;assert.equal(images.length,1);assert.deepEqual(new Uint8Array(await(await FILES.get(images[0].object_key)).arrayBuffer()),image);
  await DB.prepare('DELETE FROM company_profile_images WHERE id=?').bind(images[0].id).run();const retried=await restoreAccountComponents({server:'http://localhost',token:tokens.bob,directory:destination,expectedRevision:1,fetchImpl});assert.equal(retried.components['company-profile'].removed,1);assert.equal((await DB.prepare('SELECT count(*) AS total FROM company_profile_images WHERE owner_id=?').bind('bob').first()).total,0);
  const cliRestore=await promisify(execFile)(process.execPath,[cli,'restore-account-components','--config',config,'--snapshot',destination,'--expected-revision','2'],{timeout:90000});assert.match(cliRestore.stdout,/Recuperación parcial/);assert.match(cliRestore.stdout,/"removed":1/);
  await DB.prepare('UPDATE runners SET revoked_at=? WHERE id=?').bind('2026','runner-alice').run();
  await assert.rejects(captureAccountComponents({server:'http://localhost',token:tokens.alice,destination:join(rootDir,'revoked'),fetchImpl}),/401/);
 }finally{await worker?.dispose();await rm(rootDir,{recursive:true,force:true});}
});
