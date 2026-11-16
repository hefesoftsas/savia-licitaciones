import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { preparePlanLibraryImages } from '../src/project-library-images.js';

test('una mención de código con un objeto ausente no interrumpe la selección preliminar',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'candidate'},r2Buckets:['FILES']}));
 try {
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();
  const id='00000000-0000-4000-8000-000000000099';
  await DB.prepare('INSERT INTO image_library_web(id,owner_id,name,content_type,object_key,size,created_at,sequence) VALUES (?,?,?,?,?,?,?,?)').bind(id,'alice','ausente.png','image/png','missing-object',8,'2026',1).run();
  const content=`\`\`\`\n![Ejemplo](/api/image-library/${id}/file)\n\`\`\``;
  const prepared=await preparePlanLibraryImages({DB,FILES},'alice',[{content}]);
  assert.equal(prepared.images[0].etag,null);
  await prepared.assertUnchanged();
  await FILES.put('missing-object','12345678');
  await assert.rejects(prepared.assertUnchanged(),/imagen/i);
 } finally {await worker.dispose();}
});
