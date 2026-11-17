import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { preparePlanLibraryImages, openPlanLibraryImage } from '../src/project-library-images.js';
import { runnerProjectCapture } from '../src/project-capture-route.js';

test('localiza imágenes mencionadas por el plan y limita la descarga a su propietario',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'library-snapshot'},r2Buckets:['FILES']}));
 try {
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();
  await DB.prepare('INSERT INTO projects (id,owner_id,title,created_at) VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();
  const id='00000000-0000-4000-8000-000000000001',ref=`/api/image-library/${id}/file`,content=`![Imagen](${ref})`;
  await DB.prepare('INSERT INTO project_technical_plan_nodes(project_id,node_id,parent_node_id,sort_order,title,description,content_mode,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind('p','node',null,0,'Capítulo','','manual-fill',content,'success','2026','2026').run();
  await FILES.put('private-image','data');
  await DB.prepare('INSERT INTO image_library_web(id,owner_id,name,content_type,object_key,size,created_at,sequence) VALUES (?,?,?,?,?,?,?,?)').bind(id,'alice','imagen.png','image/png','private-image',4,'2026',1).run();
  const env={DB,FILES},prepared=await preparePlanLibraryImages(env,'alice',[{content}]);
  assert.equal(prepared.images.length,1);assert.doesNotMatch(JSON.stringify(prepared.images),/private-image/);
  const capture=await (await runnerProjectCapture(new Request('http://localhost/capture'),env,{ownerId:'alice'},'p')).json();
  assert.equal(capture.libraryImages[0].id,id);
  const image=prepared.images[0];
  assert.equal(await new Response(await openPlanLibraryImage(env,'alice','p',id,image.etag,image.version)).text(),'data');
  assert.equal(await openPlanLibraryImage(env,'bob','p',id,image.etag,image.version),null);
  await FILES.put('private-image','otro');
  await assert.rejects(prepared.assertUnchanged(),/imagen/i);
  await assert.rejects(openPlanLibraryImage(env,'alice','p',id,image.etag,image.version),/imagen/i);
 } finally {await worker.dispose();}
});
