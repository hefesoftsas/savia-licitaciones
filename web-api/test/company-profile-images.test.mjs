import {test} from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {dirname,join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('las imágenes del perfil se aíslan y se eliminan de forma reintentable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-profile-images-'));let worker;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'profile-images'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(url,options={})=>worker.dispatchFetch(`http://localhost${url}`,options),signup=async name=>{const r=await req('/api/auth/sign-up/email',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({name,email:`${name}@example.com`,password:'password-123456'})});return r.headers.get('set-cookie').split(';')[0];},alice=await signup('alice'),bob=await signup('bob');
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=','base64'),path='/api/company-profile/images';
  const upload=(cookie,body=bytes,field='officeEnvironment')=>req(path,{method:'POST',headers:{cookie,origin:'http://localhost','x-file-name':encodeURIComponent('Oficina ñ.png'),'x-field-key':field},body});
  assert.equal((await req(path)).status,401);assert.equal((await upload(alice,bytes,'no-existe')).status,400);assert.equal((await upload(alice,Buffer.from('no imagen'))).status,400);
  const created=await upload(alice);assert.equal(created.status,201);const image=(await created.json()).image;
  assert.equal((await(await req(path,{headers:{cookie:alice}})).json()).images[0].fieldKey,'officeEnvironment');assert.deepEqual((await(await req(path,{headers:{cookie:bob}})).json()).images,[]);
  assert.equal((await req(`${path}/${image.id}`,{headers:{cookie:bob}})).status,404);assert.deepEqual(Buffer.from(await(await req(`${path}/${image.id}`,{headers:{cookie:alice}})).arrayBuffer()),bytes);
  assert.equal((await req(`${path}/${image.id}`,{method:'DELETE',headers:{cookie:alice,origin:'http://bad.example'}})).status,403);
  const owner=(await db.prepare('SELECT id FROM user WHERE email=?').bind('alice@example.com').first()).id,bucket=await worker.getR2Bucket('FILES'),{profileImages}=await import('../src/company-profile-images.js');
  const deleteRequest=new Request(`http://localhost${path}/${image.id}`,{method:'DELETE',headers:{origin:'http://localhost'}}),failedBucket={delete:async()=>{throw Error('offline');}};
  assert.equal((await profileImages(deleteRequest,{DB:db,FILES:failedBucket,BETTER_AUTH_URL:'http://localhost'},owner,image.id)).status,503);
  assert.equal((await(await req(path,{headers:{cookie:alice}})).json()).images[0].deleting,true);
  assert.equal((await req(`${path}/${image.id}`,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}})).status,204);assert.equal((await bucket.list()).objects.length,0);assert.deepEqual((await(await req(path,{headers:{cookie:alice}})).json()).images,[]);
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
