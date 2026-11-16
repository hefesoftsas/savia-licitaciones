import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {extractTenderSources} from '../tender-chat.mjs';

test('procesa una fuente descargada por flujo sin cargar el original en el transporte',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-stream-source-'));try{let parsed=false;
  const context={getFileInfo:()=>{throw Error('no debe usar buffer');},getFileStream:async()=>({name:'pliego.pdf',contentType:'application/pdf',body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('%PDF-fuente'));controller.close();}})})};
  const sources=await extractTenderSources(['one'],context,{}, {},dir,false,{parse:async(_app,path)=>{parsed=true;assert.equal(await readFile(path,'utf8'),'%PDF-fuente');return 'Contenido de prueba';}});
  assert.equal(parsed,true);assert.equal(sources[0].content,'Contenido de prueba');assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('limita la descarga, elimina restos y rechaza archivos de formato incorrecto',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-stream-source-'));try{
  const source=bytes=>({getFileStream:async()=>({name:'pliego.pdf',contentType:'application/pdf',body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(bytes));controller.close();}})})});
  await assert.rejects(extractTenderSources(['x'],source('%PDF-excesivo'),{}, {},dir,false,{maxFileBytes:5}),/tamaño/i);assert.deepEqual(await readdir(dir),[]);
  await assert.rejects(extractTenderSources(['x'],source('no es PDF'),{}, {},dir,false),/formato/i);assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('decodifica texto UTF-8 completo y retira el temporal',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-stream-text-'));try{const bytes=new TextEncoder().encode('Señal y plazo'),context={getFileStream:async()=>({name:'pliego.txt',contentType:'text/plain',body:new ReadableStream({start(controller){controller.enqueue(bytes.subarray(0,3));controller.enqueue(bytes.subarray(3));controller.close();}})})};const [source]=await extractTenderSources(['x'],context,{}, {},dir,false);assert.equal(source.content,'Señal y plazo');assert.deepEqual(await readdir(dir),[]);}finally{await rm(dir,{recursive:true,force:true});}
});

test('una cancelación durante el flujo retira el archivo parcial',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-stream-cancel-'));try{const controller=new AbortController(),context={signal:controller.signal,getFileStream:async()=>({name:'pliego.pdf',contentType:'application/pdf',body:new ReadableStream({start(stream){stream.enqueue(new TextEncoder().encode('%PDF-'));controller.abort();}})})};await assert.rejects(extractTenderSources(['x'],context,{}, {},dir,false));assert.deepEqual(await readdir(dir),[]);}finally{await rm(dir,{recursive:true,force:true});}
});
