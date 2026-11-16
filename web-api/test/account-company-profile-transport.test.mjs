import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {companyProfile} from '../src/company-profile.js';
import {prepareCompanyProfileTransport,openCompanyProfileImage} from '../src/account-company-profile-transport.js';
import {runnerCompanyProfileCapture} from '../src/account-company-profile-capture.js';

test('captura perfil e imágenes privadas y detecta cambios o eliminaciones incompletas',{timeout:30000},async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'profile-snapshot'},r2Buckets:['FILES']}));
 try{
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  for(const id of ['alice','bob'])await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind(id,id,`${id}@example.com`).run();
  const env={DB,FILES},profile=(await(await companyProfile(new Request('http://localhost'),env,'alice')).json()).profile;profile.companyName='Empresa';
  const image=Uint8Array.from([137,80,78,71,13,10,26,10,1]);await FILES.put('picture',image);await DB.prepare('INSERT INTO company_profile_images(id,owner_id,name,custom_name,field_key,content_type,object_key,size,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind('img','alice','oficina.png','Oficina','officeEnvironment','image/png','picture',image.length,0,'2026').run();
  const without=await prepareCompanyProfileTransport(env,'alice');assert.equal(without.profile,null);assert.equal(without.images.length,1);
  await DB.prepare('INSERT INTO company_profiles VALUES(?,?,?,?)').bind('alice',JSON.stringify(profile),1,'2026').run();await assert.rejects(without.assertUnchanged());
  const snapshot=await prepareCompanyProfileTransport(env,'alice');assert.deepEqual(snapshot.profile,{profile,updatedAt:'2026'});assert.equal(snapshot.images[0].id,'img');const source=snapshot.images[0];
  assert.equal(await openCompanyProfileImage(env,'bob','img',source.etag,source.version),null);assert.deepEqual(new Uint8Array(await new Response(await openCompanyProfileImage(env,'alice','img',source.etag,source.version)).arrayBuffer()),image);
  const captured=await(await runnerCompanyProfileCapture(new Request('http://localhost/capture'),env,{ownerId:'alice'})).json();assert.deepEqual(captured.profile,{profile,updatedAt:'2026'});assert.match(captured.revision,/^[a-f0-9]{64}$/);
  const request=new Request(`http://localhost/capture?etag=${encodeURIComponent(source.etag)}&version=${source.version}`);assert.equal((await runnerCompanyProfileCapture(request,env,{ownerId:'bob'},'img')).status,404);
  await DB.prepare('UPDATE company_profile_images SET custom_name=? WHERE id=?').bind('Cambiado','img').run();await assert.rejects(snapshot.assertUnchanged());await assert.rejects(openCompanyProfileImage(env,'alice','img',source.etag,source.version));
  assert.equal((await runnerCompanyProfileCapture(request,env,{ownerId:'alice'},'img')).status,409);
  const newer=await prepareCompanyProfileTransport(env,'alice');await FILES.put('picture',Uint8Array.from([137,80,78,71,13,10,26,10,2]));await assert.rejects(newer.assertUnchanged());await assert.rejects(openCompanyProfileImage(env,'alice','img',newer.images[0].etag,newer.images[0].version));
  await FILES.delete('picture');await assert.rejects(prepareCompanyProfileTransport(env,'alice'));
  await FILES.put('picture',image);await DB.prepare('INSERT INTO company_profile_image_deletions(id,owner_id,name,field_key,content_type,object_key,size,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind('pending','alice','x.png','officeEnvironment','image/png','pending',1,1,'2026').run();await assert.rejects(prepareCompanyProfileTransport(env,'alice'));
  assert.deepEqual((await prepareCompanyProfileTransport(env,'bob')).images,[]);assert.equal(await prepareCompanyProfileTransport(env,'unknown'),null);
 }finally{await worker.dispose();}
});
