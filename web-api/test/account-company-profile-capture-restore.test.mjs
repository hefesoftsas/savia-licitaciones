import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const moduleUrl=process.env.SAVIA_TEST_PACKAGED_RUNNER?pathToFileURL(join(process.env.SAVIA_TEST_PACKAGED_RUNNER,'runner','account-company-profile-snapshot.mjs')).href:new URL('../../runner/account-company-profile-snapshot.mjs',import.meta.url).href;
const {captureAccountCompanyProfile,restoreAccountCompanyProfile}=await import(moduleUrl);
const hash=data=>createHash('sha256').update(data).digest('hex');
test('captura y recupera imágenes sin perfil mediante el Worker autenticado',{timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-profile-e2e-'));let worker;
 try{const build=join(dir,'build');execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',build],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(build,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'profile-e2e'},r2Buckets:['FILES'],bindings:{BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');for(const f of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',f),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  const tokens={alice:'a'.repeat(64),bob:'b'.repeat(64)};for(const id of ['alice','bob']){await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind(id,id,`${id}@example.com`).run();await DB.prepare('INSERT INTO runners(id,owner_id,name,token_hash,created_at) VALUES(?,?,?,?,?)').bind(id,id,id,hash(tokens[id]),'2026').run();}
  const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,1]);await FILES.put('source',bytes);await DB.prepare('INSERT INTO company_profile_images(id,owner_id,name,custom_name,field_key,content_type,object_key,size,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind('img','alice','oficina.png','','officeEnvironment','image/png','source',bytes.length,0,'2026').run();
  const dispatch=async(url,options)=>{const req=new Request(url,options);return worker.dispatchFetch(req.url,{method:req.method,headers:Object.fromEntries(req.headers),body:req.body?await req.arrayBuffer():undefined});};
  const directory=join(dir,'snapshot');await captureAccountCompanyProfile({server:'http://localhost',token:tokens.alice,directory,fetchImpl:dispatch});const options={server:'http://localhost',token:tokens.bob,directory,fetchImpl:dispatch};assert.equal((await restoreAccountCompanyProfile(options)).images,1);assert.equal((await restoreAccountCompanyProfile(options)).images,1);
  assert.equal(await DB.prepare('SELECT 1 FROM company_profiles WHERE owner_id=?').bind('bob').first(),null);const rows=(await DB.prepare('SELECT id,object_key FROM company_profile_images WHERE owner_id=?').bind('bob').all()).results;assert.equal(rows.length,1);assert.notEqual(rows[0].id,'img');assert.deepEqual(new Uint8Array(await(await FILES.get(rows[0].object_key)).arrayBuffer()),bytes);
  await DB.prepare('DELETE FROM company_profile_images WHERE id=?').bind(rows[0].id).run();assert.equal((await restoreAccountCompanyProfile(options)).removed,1);
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
