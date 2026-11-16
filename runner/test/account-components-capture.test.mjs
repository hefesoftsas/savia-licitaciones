import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {captureAccountComponents,accountComponentNames} from '../account-components-capture.mjs';

test('coordina capturas parciales en una carpeta nueva sin guardar la credencial',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-account-group-'));
 try{
  const destination=join(root,'capture'),seen=[];
  const captures=Object.fromEntries(accountComponentNames.map(name=>[name,async options=>{seen.push(name);assert.equal(options.token,'secreto');await writeFile(options.directory+'.called','ok');}]));
  const result=await captureAccountComponents({server:'https://example.invalid',token:'secreto',destination,captures});
  assert.deepEqual(seen,accountComponentNames);assert.equal(result.complete,false);assert.deepEqual(result.components,accountComponentNames);
  const index=await readFile(join(destination,'index.json'),'utf8');assert.doesNotMatch(index,/secreto/);assert.deepEqual(JSON.parse(index),result);
  await assert.rejects(captureAccountComponents({server:'https://example.invalid',token:'secreto',destination,captures}),/existe/i);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('no reemplaza un índice creado durante la captura',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-account-group-collision-'));
 try{const destination=join(root,'capture'),captures=Object.fromEntries(accountComponentNames.map(name=>[name,async()=>{}]));await assert.rejects(captureAccountComponents({server:'https://example.invalid',token:'test',destination,captures,onProgress:name=>{if(name===accountComponentNames.at(-1))writeFileSync(join(destination,'index.json'),'ajeno');}}));assert.equal(await readFile(join(destination,'index.json'),'utf8'),'ajeno');}finally{await rm(root,{recursive:true,force:true});}
});

test('conserva los componentes terminados y no publica índice si una captura falla',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-account-group-fail-'));
 try{
  const destination=join(root,'capture'),seen=[];
  const captures=Object.fromEntries(accountComponentNames.map((name,index)=>[name,async options=>{seen.push(name);if(index===2)throw new Error('datos cambiaron');await writeFile(options.directory+'.called','ok');}]));
  await assert.rejects(captureAccountComponents({server:'https://example.invalid',token:'secreto',destination,captures}),/datos cambiaron/);
  assert.deepEqual(seen,accountComponentNames.slice(0,3));assert.equal(await readFile(join(destination,`${accountComponentNames[0]}.called`),'utf8'),'ok');await assert.rejects(readFile(join(destination,'index.json')),{code:'ENOENT'});
 }finally{await rm(root,{recursive:true,force:true});}
});
