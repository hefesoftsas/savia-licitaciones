import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('limita intentos por IP incluso tras reiniciar el runtime', {timeout:60000},async()=>{
 const build=await mkdtemp(join(tmpdir(),'savia-auth-limit-build-')),persist=await mkdtemp(join(tmpdir(),'savia-auth-limit-db-'));let worker;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',build],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  const script=await readFile(join(build,'index.js'),'utf8');
  const create=()=>{const options=convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'auth-limit'},r2Buckets:['FILES'],bindings:{BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}});options.resourcePersistencePath=persist;return new Miniflare(options);};
  worker=create();const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const login=ip=>worker.dispatchFetch('http://localhost/api/auth/sign-in/email',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json','cf-connecting-ip':ip},body:JSON.stringify({email:'missing@example.test',password:'wrong-password'})});
  for(let i=0;i<2;i++)assert.equal((await login('192.0.2.10')).status,401);
  await worker.dispose();worker=create();for(let i=0;i<3;i++)assert.equal((await login('192.0.2.10')).status,401);const blocked=await login('192.0.2.10');assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('x-retry-after'))>0);
  assert.equal((await login('192.0.2.11')).status,401);
  const simultaneous=await Promise.all(Array.from({length:8},()=>login('192.0.2.12')));
  assert.equal(simultaneous.filter(response=>response.status===401).length,5);assert.equal(simultaneous.filter(response=>response.status===429).length,3);
  const change=()=>worker.dispatchFetch('http://localhost/api/auth/change-password',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json','cf-connecting-ip':'192.0.2.13'},body:JSON.stringify({currentPassword:'wrong',newPassword:'new-password-123'})});
  for(let i=0;i<10;i++)assert.equal((await change()).status,401);assert.equal((await change()).status,429);
  const rows=await (await worker.getD1Database('DB')).prepare('SELECT key FROM "rateLimit"').all();assert.ok(rows.results.length>=4);
  for(const row of rows.results){assert.match(row.key,/^[a-f0-9]{64}$/);assert.ok(!row.key.includes('192.0.2.'));assert.ok(!row.key.includes('sign-in'));}
 }finally{await worker?.dispose();await rm(build,{recursive:true,force:true});await rm(persist,{recursive:true,force:true});}
});
