import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('imágenes de certificados se almacenan y eliminan junto al propietario',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-cert-images-'));let worker;
 try {
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'cert-images'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),post=(path,body,cookie)=>req(path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  async function signup(name){const r=await post('/api/auth/sign-up/email',{name,email:`${name}@example.com`,password:'password-123456'});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
  const alice=await signup('alice'),bob=await signup('bob'),payload={name:'Certificado',number:'',validityMode:'',validFrom:'',validTo:''};const cert=(await (await post('/api/company-certificates',payload,alice)).json()).certificate;
  const path=`/api/company-certificates/${cert.id}/images`, png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=','base64');
  const upload=(cookie,data,name='prueba ñ.png',origin='http://localhost')=>req(path,{method:'POST',headers:{origin,cookie,'x-file-name':encodeURIComponent(name),'content-type':'image/png'},body:data});
  assert.equal((await upload(bob,png)).status,404);assert.equal((await upload(alice,png,'prueba.png','https://other.example')).status,403);assert.equal((await upload(alice,Buffer.from('invalido'))).status,400);
  const uploaded=await upload(alice,png);assert.equal(uploaded.status,201);const image=(await uploaded.json()).image;assert.equal(image.name,'prueba ñ.png');
  assert.equal((await req(path,{headers:{cookie:bob}})).status,404);assert.equal((await (await req(path,{headers:{cookie:alice}})).json()).images.length,1);
  const filePath=`${path}/${image.id}`,file=await req(filePath,{headers:{cookie:alice}});assert.equal(file.status,200);assert.deepEqual(Buffer.from(await file.arrayBuffer()),png);assert.equal((await req(filePath,{headers:{cookie:bob}})).status,404);
  const delImage=cookie=>req(filePath,{method:'DELETE',headers:{origin:'http://localhost',cookie}});
  assert.equal((await delImage(bob)).status,404);assert.equal((await delImage(alice)).status,204);assert.equal((await delImage(alice)).status,204);assert.equal((await req(filePath,{headers:{cookie:alice}})).status,404);
  assert.equal((await upload(alice,png)).status,201);
  const remove=(cookie,version)=>req(`/api/company-certificates/${cert.id}`,{method:'DELETE',headers:{origin:'http://localhost',cookie,'content-type':'application/json'},body:JSON.stringify({version})});
  assert.equal((await remove(alice,0)).status,400);assert.equal((await remove(alice,1)).status,204);assert.equal((await req(filePath,{headers:{cookie:alice}})).status,404);assert.equal((await (await worker.getR2Bucket('FILES')).list()).objects.length,0);
  const { certificateImages }=await import('../src/certificate-images.js'), { companyCertificates }=await import('../src/company-certificates.js');
  const owner=(await db.prepare('SELECT id FROM user WHERE email = ?').bind('alice@example.com').first()).id,bucket=await worker.getR2Bucket('FILES');
  const next=(await (await post('/api/company-certificates',payload,alice)).json()).certificate, nextPath=`/api/company-certificates/${next.id}/images`;
  const nextUpload=await uploadFor(nextPath,alice,png); assert.equal(nextUpload.status,201); const nextImage=(await nextUpload.json()).image;
  async function uploadFor(target,cookie,data){return req(target,{method:'POST',headers:{origin:'http://localhost',cookie,'x-file-name':'test.png','content-type':'image/png'},body:data});}
  const failing={DB:db,BETTER_AUTH_URL:'http://localhost',FILES:{delete:async()=>{throw Error('simulated');}}}, deleteReq=()=>new Request(`http://localhost/api/company-certificates/${next.id}`,{method:'DELETE',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({version:1})});
  const imageDelete=()=>new Request('http://localhost/delete-image',{method:'DELETE',headers:{origin:'http://localhost'}});
  assert.equal((await certificateImages(imageDelete(),failing,owner,next.id,nextImage.id)).status,503);
  const pendingImages=(await (await req(nextPath,{headers:{cookie:alice}})).json()).images;assert.equal(pendingImages[0].deleting,true);
  assert.equal((await certificateImages(imageDelete(),{DB:db,FILES:bucket,BETTER_AUTH_URL:'http://localhost'},owner,next.id,nextImage.id)).status,204);
  assert.equal((await uploadFor(nextPath,alice,png)).status,201);
  assert.equal((await companyCertificates(deleteReq(),failing,owner,next.id)).status,503);
  assert.equal((await (await req('/api/company-certificates',{headers:{cookie:alice}})).json()).certificates.find(item=>item.id===next.id).deleting,true);
  assert.equal((await uploadFor(nextPath,alice,png)).status,404);assert.equal((await req(nextPath,{headers:{cookie:alice}})).status,404);
  assert.equal((await companyCertificates(deleteReq(),{DB:db,FILES:bucket,BETTER_AUTH_URL:'http://localhost'},owner,next.id)).status,204);assert.equal((await bucket.list()).objects.length,0);
  const racing=(await (await post('/api/company-certificates',payload,alice)).json()).certificate;let entered,proceed;const enteredPromise=new Promise(resolve=>entered=resolve),proceedPromise=new Promise(resolve=>proceed=resolve);
  const slowBucket={put:async(key,data)=>{entered();await proceedPromise;return bucket.put(key,data);},delete:key=>bucket.delete(key)};
  const pending=certificateImages(new Request('http://localhost/upload',{method:'POST',headers:{origin:'http://localhost','x-file-name':'test.png','content-type':'image/png'},body:png}),{DB:db,FILES:slowBucket,BETTER_AUTH_URL:'http://localhost'},owner,racing.id);
  await enteredPromise;const deleteRace=new Request('http://localhost/delete',{method:'DELETE',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({version:1})});
  assert.equal((await companyCertificates(deleteRace,{DB:db,FILES:bucket,BETTER_AUTH_URL:'http://localhost'},owner,racing.id)).status,204);proceed();assert.equal((await pending).status,404);assert.equal((await bucket.list()).objects.length,0);

 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
