import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),hash=x=>createHash('sha256').update(x).digest('hex');
test('captura imágenes y faltantes por cuenta y recupera sin duplicar ni recrear eliminados',{timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-library-snapshot-'));let worker;
 try{const build=join(dir,'build');execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',build],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(build,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'snapshot'},r2Buckets:['FILES'],bindings:{BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const db=await worker.getD1Database('DB'),bucket=await worker.getR2Bucket('FILES');for(const f of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',f),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const tokens={alice:'a'.repeat(64),bob:'b'.repeat(64)};for(const id of Object.keys(tokens)){await db.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind(id,id,`${id}@example.com`).run();await db.prepare('INSERT INTO runners(id,owner_id,name,token_hash,created_at) VALUES(?,?,?,?,?)').bind(id,id,id,hash(tokens[id]),'2026').run();}
  const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,1]);await bucket.put('source',bytes);
  const insert='INSERT INTO image_library_web(id,owner_id,name,content_type,object_key,size,created_at,sequence,missing_reason) VALUES(?,?,?,?,?,?,?,?,?)';await db.prepare(insert).bind('present','alice','Imagen.png','image/png','source',bytes.length,'2026',0,null).run();await db.prepare(insert).bind('missing','alice','Ausente.png','application/octet-stream',null,0,'2026',1,'not_found').run();
  const dispatch=async(url,options={})=>{const req=new Request(url,options);return worker.dispatchFetch(req.url,{method:req.method,headers:Object.fromEntries(req.headers),body:req.body?await req.arrayBuffer():undefined});};
  assert.equal((await dispatch('http://localhost/api/runner/image-library-captures')).status,401);const alice={authorization:`Bearer ${tokens.alice}`},bob={authorization:`Bearer ${tokens.bob}`};assert.deepEqual((await(await dispatch('http://localhost/api/runner/image-library-captures',{headers:bob})).json()).images,[]);
  const original=(await(await dispatch('http://localhost/api/runner/image-library-captures',{headers:alice})).json()).images.find(x=>x.id==='present'),fileUrl=`http://localhost/api/runner/image-library-captures/images/present?etag=${encodeURIComponent(original.etag)}&version=${original.version}`;
  assert.equal((await dispatch(fileUrl,{headers:bob})).status,404);await bucket.put('source',Uint8Array.from([137,80,78,71,13,10,26,10,2]));assert.equal((await dispatch(fileUrl,{headers:alice})).status,409);await bucket.put('source',bytes);
  const changing=async(url,options)=>{const response=await dispatch(url,options);if(url.includes('/images/'))await bucket.put('source',Uint8Array.from([137,80,78,71,13,10,26,10,3]));return response;};
  const moduleUrl=process.env.SAVIA_TEST_PACKAGED_RUNNER?pathToFileURL(join(process.env.SAVIA_TEST_PACKAGED_RUNNER,'runner','account-image-library-snapshot.mjs')).href:new URL('../../runner/account-image-library-snapshot.mjs',import.meta.url).href;const {captureAccountImageLibrary,restoreAccountImageLibrary}=await import(moduleUrl),directory=join(dir,'snapshot');await assert.rejects(captureAccountImageLibrary({server:'http://localhost',token:tokens.alice,directory:join(dir,'changed'),fetchImpl:changing}),/cambió/);await bucket.put('source',bytes);await captureAccountImageLibrary({server:'http://localhost',token:tokens.alice,directory,fetchImpl:dispatch});const options={server:'http://localhost',token:tokens.bob,directory,fetchImpl:dispatch};
  assert.deepEqual(await restoreAccountImageLibrary(options),{images:2,removed:0,omitted:['other-account-data','credentials']});await restoreAccountImageLibrary(options);
  const rows=(await db.prepare('SELECT id,name,object_key,missing_reason FROM image_library_web WHERE owner_id=? ORDER BY sequence').bind('bob').all()).results;assert.equal(rows.length,2);assert.equal(rows[1].missing_reason,'not_found');assert.deepEqual(new Uint8Array(await(await bucket.get(rows[0].object_key)).arrayBuffer()),bytes);
  await db.prepare('DELETE FROM image_library_web WHERE id=?').bind(rows[0].id).run();assert.equal((await restoreAccountImageLibrary(options)).removed,1);
  const cli=process.env.SAVIA_TEST_RUNNER_CLI||resolve(root,'../runner/cli.mjs'),run=promisify(execFile),config=join(dir,'runner.json'),cliSnapshot=join(dir,'cli-snapshot');await writeFile(config,JSON.stringify({server:(await worker.ready).origin,runnerId:'alice',token:tokens.alice}));
  assert.match((await run(process.execPath,[cli,'capture-account-image-library','--config',config,'--output',cliSnapshot])).stdout,/Captura parcial creada/);await writeFile(config,JSON.stringify({server:(await worker.ready).origin,runnerId:'bob',token:tokens.bob}));assert.match((await run(process.execPath,[cli,'restore-account-image-library','--config',config,'--snapshot',cliSnapshot])).stdout,/Biblioteca recuperada/);
  const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));await writeFile(join(directory,'objects',manifest.objects[0].file),'corrupt');await assert.rejects(restoreAccountImageLibrary(options));assert.equal((await db.prepare('SELECT count(*) AS n FROM image_library_web WHERE owner_id=?').bind('bob').first()).n,3);
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
