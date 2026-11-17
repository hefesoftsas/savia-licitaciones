import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createComponentSnapshot } from '../../runner/cloud-snapshot-archive.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('importa un archivo de más de 25 MiB por flujo, verifica hash y conserva recibos',async()=>{
 const build=await mkdtemp(join(tmpdir(),'savia-large-file-'));let worker;
 try {
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',build],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(build,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'large-file'},r2Buckets:['FILES'],bindings:{BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');
  for(const f of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',f),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  for(const id of ['alice','bob']){await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind(id,id,`${id}@example.com`).run();await DB.prepare('INSERT INTO runners(id,owner_id,name,token_hash,created_at) VALUES(?,?,?,?,?)').bind(id,id,id,createHash('sha256').update(id==='alice'?'a'.repeat(64):'b'.repeat(64)).digest('hex'),'2026').run();}
  await DB.prepare('INSERT INTO projects (id,owner_id,title,created_at) VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  await DB.prepare('INSERT INTO desktop_plan_imports VALUES(?,?,?,?,?,?)').bind('alice','req','hash','p','mutation','2026').run();
  const data=Buffer.alloc(25*1024*1024+17,0x61), hash=createHash('sha256').update(data).digest('hex'),url=`http://localhost/api/runner/imports/technical-plan/req/files/${'c'.repeat(64)}`;
  const upload=(token,sha=hash)=>worker.dispatchFetch(url,{method:'POST',headers:{authorization:`Bearer ${token.repeat(64)}`,'x-file-name':'grande.txt','x-content-sha256':sha,'x-savia-stream-size':String(data.length),'content-type':'text/plain'},body:data});
  assert.equal((await upload('b')).status,404);
  const bad=await upload('a','f'.repeat(64));assert.ok(bad.status>=400);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM project_files').first()).n,0);
  const wrongSize=await worker.dispatchFetch(url,{method:'POST',headers:{authorization:`Bearer ${'a'.repeat(64)}`,'x-file-name':'grande.txt','x-content-sha256':hash,'x-savia-stream-size':String(data.length+1),'content-type':'text/plain'},body:data});assert.ok(wrongSize.status>=400);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM project_files').first()).n,0);
  const result=await upload('a');assert.equal(result.status,201,await result.clone().text());const file=(await result.json()).file;assert.equal(file.size,data.length);
  assert.equal((await upload('a')).status,200);
  const altered=Buffer.from(data);altered[0]=0x62;
  const alteredRetry=await worker.dispatchFetch(url,{method:'POST',headers:{authorization:`Bearer ${'a'.repeat(64)}`,'x-file-name':'grande.txt','x-content-sha256':hash,'x-savia-stream-size':String(data.length),'content-type':'text/plain'},body:altered});assert.equal(alteredRetry.status,400);
  const row=await DB.prepare('SELECT object_key FROM project_files WHERE id=?').bind(file.id).first();assert.equal((await FILES.head(row.object_key)).size,data.length);
  const snapshot=join(build,'snapshot');
  await createComponentSnapshot(snapshot,{metadata:{project:{title:'Proyecto grande'},files:[{id:'original',name:'grande.txt',content_type:'text/plain',size:data.length}]},included:['project-header','project-files'],omitted:['other-project-data','other-account-data','credentials'],objects:[{id:'original',size:data.length,sha256:hash,open:()=>Readable.from(data)}]});
  const config=join(build,'runner.json');await writeFile(config,JSON.stringify({server:(await worker.ready).origin,token:'b'.repeat(64)}));
  const cli=process.env.SAVIA_RUNNER_CLI || resolve(root,'../runner/cli.mjs');
  const restored=await promisify(execFile)(process.execPath,[cli,'restore-project-components','--config',config,'--snapshot',snapshot]);assert.match(restored.stdout,/parcial/i);
  try {assert.match((await promisify(execFile)(process.execPath,[cli,'restore-project-components','--config',config,'--snapshot',snapshot])).stdout,/parcial/i);} catch(error) {throw new Error('El reintento de CLI falló',{cause:error});}
  const recovered=await DB.prepare('SELECT f.size,f.object_key FROM project_files f JOIN projects p ON p.id=f.project_id WHERE p.owner_id=?').bind('bob').first();assert.equal(recovered.size,data.length);assert.equal((await FILES.head(recovered.object_key)).size,data.length);
  const huge=Buffer.alloc(50*1024*1024+1,0x63),hugeHash=createHash('sha256').update(huge).digest('hex'),hugeSnapshot=join(build,'huge-snapshot');
  const mp=`http://localhost/api/runner/imports/technical-plan/req/files/${'d'.repeat(64)}/multipart`, auth={authorization:`Bearer ${'a'.repeat(64)}`}, meta={name:'multipart.pdf',contentType:'application/pdf',size:huge.length,hash:'f'.repeat(64)};
  const start=()=>worker.dispatchFetch(`${mp}/start`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify(meta)});
  const first=await(await start()).json();assert.equal(first.partSize,10*1024*1024);
  const tampered=await worker.dispatchFetch(`${mp}/part/1`,{method:'POST',headers:{...auth,'x-savia-multipart':`${first.handle}x`},body:'x'});assert.equal(tampered.status,400);
  const wrongOwner=await worker.dispatchFetch(`${mp}/part/1`,{method:'POST',headers:{authorization:`Bearer ${'b'.repeat(64)}`,'x-savia-multipart':first.handle},body:'x'});assert.equal(wrongOwner.status,400);
  const abort=await worker.dispatchFetch(`${mp}/abort`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({handle:first.handle})});assert.equal(abort.status,200);
  const afterAbort=await worker.dispatchFetch(`${mp}/part/1`,{method:'POST',headers:{...auth,'x-savia-multipart':first.handle},body:'x'});assert.equal(afterAbort.status,409);
  const invalid=await(await start()).json(),invalidParts=Array.from({length:Math.ceil(huge.length/invalid.partSize)},(_,i)=>({partNumber:i+1,etag:'not-an-etag'}));
  const failedCommit=await worker.dispatchFetch(`${mp}/complete`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({handle:invalid.handle,parts:invalidParts})});assert.ok(failedCommit.status>=400);
  const afterFailure=await worker.dispatchFetch(`${mp}/part/1`,{method:'POST',headers:{...auth,'x-savia-multipart':invalid.handle},body:'x'});assert.equal(afterFailure.status,409);
  const second=await(await start()).json(),parts=[];
  const incomplete=await worker.dispatchFetch(`${mp}/complete`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({handle:second.handle,parts:[]})});assert.equal(incomplete.status,400);
  for(let offset=0,n=1;offset<huge.length;offset+=second.partSize,n++){const response=await worker.dispatchFetch(`${mp}/part/${n}`,{method:'POST',headers:{...auth,'x-savia-multipart':second.handle},body:huge.subarray(offset,offset+second.partSize)});assert.equal(response.status,200);parts.push(await response.json());}
  const mismatch=await worker.dispatchFetch(`${mp}/complete`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({handle:second.handle,parts})});assert.equal(mismatch.status,400);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM project_files WHERE name=?').bind('multipart.pdf').first()).n,0);
  assert.equal((await FILES.list({prefix:'desktop-multipart/p/'})).objects.length,0);
  await createComponentSnapshot(hugeSnapshot,{metadata:{project:{title:'Proyecto multipart'},files:[{id:'large',name:'grande.pdf',content_type:'application/pdf',size:huge.length}]},included:['project-header','project-files'],omitted:['other-project-data','other-account-data','credentials'],objects:[{id:'large',size:huge.length,sha256:hugeHash,open:()=>Readable.from(huge)}]});
  assert.match((await promisify(execFile)(process.execPath,[cli,'restore-project-components','--config',config,'--snapshot',hugeSnapshot])).stdout,/parcial/i);
  const hugeRow=await DB.prepare("SELECT f.size,f.object_key FROM project_files f JOIN projects p ON p.id=f.project_id WHERE p.owner_id=? AND p.title=?").bind('bob','Proyecto multipart').first();assert.equal(hugeRow.size,huge.length);assert.equal((await FILES.head(hugeRow.object_key)).size,huge.length);
  assert.match((await promisify(execFile)(process.execPath,[cli,'restore-project-components','--config',config,'--snapshot',hugeSnapshot])).stdout,/parcial/i);
 }finally{await worker?.dispose();await rm(build,{recursive:true,force:true});}
});
