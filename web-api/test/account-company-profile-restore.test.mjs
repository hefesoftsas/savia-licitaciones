import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {companyProfile} from '../src/company-profile.js';
import {importAccountCompanyProfileSnapshot} from '../src/account-company-profile-restore.js';
import {importDesktopCompanyProfileImage} from '../src/desktop-company-profile-image.js';
import {createHash} from 'node:crypto';

test('restaura perfiles e imágenes con recibos aislados e idempotentes',{timeout:30000},async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'restore-profile'},r2Buckets:['FILES']}));
 try{
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  for(const id of ['alice','bob','carol','dave'])await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind(id,id,`${id}@example.com`).run();
  const env={DB,FILES},profile=(await(await companyProfile(new Request('http://localhost'),env,'alice')).json()).profile;profile.companyName='Empresa';
  const invoke=(owner,id,value)=>importAccountCompanyProfileSnapshot(new Request('http://localhost',{method:'POST',body:JSON.stringify({profile:value})}),env,{ownerId:owner},id);
  const original={profile,updatedAt:'2026-01-01'};
  assert.equal((await invoke('alice','capture',original)).status,201);assert.equal((await invoke('alice','capture',original)).status,200);
  assert.equal((await invoke('alice','different',original)).status,409);assert.equal((await invoke('alice','capture',null)).status,409);
  await DB.prepare('DELETE FROM company_profiles WHERE owner_id=?').bind('alice').run();assert.equal((await invoke('alice','capture',original)).status,200);assert.equal(await DB.prepare('SELECT 1 FROM company_profiles WHERE owner_id=?').bind('alice').first(),null);
  assert.equal((await invoke('bob','capture',null)).status,201);
  const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,1]),sourceId='source',key=createHash('sha256').update(sourceId).digest('hex');
  const upload=()=>{const form=new FormData();form.set('metadata',JSON.stringify({sourceId,name:'office.png',customName:'',fieldKey:'officeEnvironment',sortOrder:0,createdAt:'2026'}));form.set('file',new Blob([bytes],{type:'image/png'}),'office.png');return importDesktopCompanyProfileImage(new Request('http://localhost',{method:'POST',body:form}),env,{ownerId:'bob'},'capture',key,true);};
  const created=await upload();assert.equal(created.status,201);const {imageId}=await created.json();assert.equal((await upload()).status,200);assert.equal(await DB.prepare('SELECT 1 FROM company_profiles WHERE owner_id=?').bind('bob').first(),null);
  await DB.prepare('DELETE FROM company_profile_images WHERE id=?').bind(imageId).run();assert.equal((await upload()).status,410);
  assert.equal((await invoke('carol','capture',original)).status,201);const row=await DB.prepare('SELECT updated_at FROM company_profiles WHERE owner_id=?').bind('carol').first();assert.equal(row.updated_at,original.updatedAt);
  const concurrent=await Promise.all([invoke('dave','first',original),invoke('dave','second',original)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409]);
 }finally{await worker.dispose();}
});
