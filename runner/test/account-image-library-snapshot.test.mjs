import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {captureAccountImageLibrary} from '../account-image-library-snapshot.mjs';
test('una descarga interrumpida cancela la captura sin publicar un manifiesto',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-library-interrupted-')),directory=join(root,'snapshot');
 try{const image={id:'image',name:'archivo.png',contentType:'image/png',size:9,createdAt:'2026',missingReason:null,etag:'etag',version:'b'.repeat(64)},fetchImpl=async url=>url.includes('/images/')?new Response(new ReadableStream({start(controller){controller.enqueue(Uint8Array.of(137,80,78));controller.error(new Error('conexión perdida'));}})):Response.json({revision:'a'.repeat(64),images:[image]});
  await assert.rejects(captureAccountImageLibrary({server:'https://example.test',token:'token',directory,fetchImpl}),/conexión perdida/);await assert.rejects(access(join(directory,'manifest.json')));
 }finally{await rm(root,{recursive:true,force:true});}
});
