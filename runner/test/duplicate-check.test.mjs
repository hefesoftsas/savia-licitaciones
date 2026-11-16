import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

process.env.SAVIA_HEADLESS_RUNNER='1';
const {createDuplicateCheckHandler}=await import(process.env.SAVIA_TEST_DUPLICATE_MODULE||new URL('../duplicate-check.mjs',import.meta.url));

test('el motor de escritorio compara documentos reales y limpia el espacio temporal',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-duplicate-runner-'));
 try {
  const shared='La empresa cuenta con un equipo profesional especializado en contratación pública.';
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=',image=`![Diagrama](data:image/png;base64,${png})`;
  const documents={a:{name:'Oferta A.md',bytes:Buffer.from(`# Plan técnico\n\n${shared}\n\nUna frase exclusiva de la primera oferta.\n\n${image}`)},b:{name:'Oferta B.md',bytes:Buffer.from(`# Plan técnico\n\n${shared}\n\nOtra frase exclusiva de la segunda oferta.\n\n${image}`)}};
  const handler=createDuplicateCheckHandler({temporaryRoot:dir});
  const result=await handler({fileIds:['a','b'],tenderFileIds:[],bidFileIds:['a','b'],language:'es'},{signal:new AbortController().signal,getFileInfo:async id=>documents[id]});
  assert.deepEqual(result.sourceFiles,[{id:'a',name:'Oferta A.md'},{id:'b',name:'Oferta B.md'}]);
  assert.equal(result.status,'success');assert.ok(result.contentAnalysis.duplicateSentences.some(row=>row.sentence.includes('equipo profesional')));
  assert.ok(result.outlineAnalysis.files.length===2);assert.ok(result.metadataAnalysis.files.length===2);
  assert.equal(result.imageAnalysis.duplicateImages.length,1);assert.deepEqual(result.previews[0].bytes,Buffer.from(png,'base64'));
  const metadata=result.metadataAnalysis.files.flatMap(file=>file.metadata);assert.ok(metadata.some(item=>item.key==='file_sha256'));assert.ok(!metadata.some(item=>['created_at','modified_at','accessed_at'].includes(item.key)));
  assert.equal(JSON.stringify(result).includes(dir),false);assert.deepEqual(await readdir(dir),[]);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('el motor respeta la cancelación y elimina los archivos descargados',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-duplicate-cancel-'));try{
  const controller=new AbortController(),handler=createDuplicateCheckHandler({temporaryRoot:dir});
  await assert.rejects(handler({fileIds:['a','b'],tenderFileIds:[],bidFileIds:['a','b'],language:'es'},{signal:controller.signal,getFileInfo:async()=>{controller.abort();return {name:'a.md',bytes:Buffer.from('Privado')};}}));
  assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('rechaza identidades inseguras, roles repetidos y formatos no compatibles',async()=>{
 const handler=createDuplicateCheckHandler();const context={signal:new AbortController().signal,getFileInfo:async()=>({name:'archivo.exe',bytes:Buffer.from('archivo')})};
 await assert.rejects(handler({fileIds:['../fuera'],tenderFileIds:[],bidFileIds:['../fuera']},context));
 await assert.rejects(handler({fileIds:['a','b'],tenderFileIds:['a','a'],bidFileIds:['b']},context));
 await assert.rejects(handler({fileIds:['a'],tenderFileIds:[],bidFileIds:['a']},context));
});

test('un archivo dañado produce un resultado parcial explícito y limpia los temporales',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-duplicate-invalid-'));try{
  const handler=createDuplicateCheckHandler({temporaryRoot:dir});
  const result=await handler({fileIds:['a'],tenderFileIds:[],bidFileIds:['a']},{signal:new AbortController().signal,getFileInfo:async()=>({name:'dañado.docx',bytes:Buffer.from('no es un documento')})});
  assert.equal(result.status,'error');assert.ok([result.metadataAnalysis,result.outlineAnalysis,result.contentAnalysis,result.imageAnalysis].some(section=>section.status==='error'));assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('compara archivos recibidos por flujo sin pedir el cuerpo completo',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-duplicate-stream-'));try{const handler=createDuplicateCheckHandler({temporaryRoot:dir}),content='# Plan\n\nUna frase de prueba.';
  const result=await handler({fileIds:['a','b'],tenderFileIds:[],bidFileIds:['a','b']},{signal:new AbortController().signal,getFileInfo:async()=>{throw Error('no usar buffer');},getFileStream:async id=>({name:`${id}.md`,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(content));c.close();}})})});
  assert.equal(result.status,'success');assert.equal(result.sourceFiles.length,2);assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
