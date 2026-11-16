import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transferDesktopPlanDocument} from '../desktop-plan-documents.mjs';

test('elige flujo o partes según el tamaño y conserva la identidad del documento',async()=>{
 const calls=[],fetchImpl=async(url,options)=>{
  const body=options.body;let size=0;if(body&&typeof body!=='string'){if(Buffer.isBuffer(body))size=body.length;else for await(const chunk of body)size+=chunk.length;}
  calls.push({url,headers:options.headers,size});
  if(url.endsWith('/start'))return Response.json({handle:'handle',partSize:10*1024*1024});
  if(url.includes('/part/'))return Response.json({partNumber:Number(url.split('/').pop()),etag:'etag'});
  return Response.json({file:{id:'file'}});
 };
 const base={server:'http://localhost',token:'token',requestId:'id',sourceKey:'a'.repeat(64),name:'pliego.pdf',contentType:'application/pdf',fetchImpl};
 assert.equal(await transferDesktopPlanDocument({...base,bytes:Buffer.alloc(25*1024*1024+1,1)}),'imported');
 assert.equal(calls[0].headers['x-savia-stream-size'],String(25*1024*1024+1));assert.equal(calls[0].size,25*1024*1024+1);
 calls.length=0;assert.equal(await transferDesktopPlanDocument({...base,bytes:Buffer.alloc(50*1024*1024+1,2)}),'imported');
 assert.ok(calls[0].url.endsWith('/multipart/start'));assert.deepEqual(calls.filter(call=>call.url.includes('/part/')).map(call=>call.size),[10*1024*1024,10*1024*1024,10*1024*1024,10*1024*1024,10*1024*1024,1]);assert.ok(calls.at(-1).url.endsWith('/multipart/complete'));
});

test('informa si un documento previamente importado fue retirado',async()=>{
 const status=await transferDesktopPlanDocument({server:'http://localhost',token:'token',requestId:'id',sourceKey:'b'.repeat(64),name:'pliego.pdf',contentType:'application/pdf',bytes:Buffer.from('documento'),fetchImpl:async()=>new Response(null,{status:410})});assert.equal(status,'removed');
});
