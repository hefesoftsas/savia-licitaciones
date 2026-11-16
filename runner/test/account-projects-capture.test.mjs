import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {captureAccountProjects} from '../account-projects-capture.mjs';

test('captura todos los proyectos y confirma el inventario antes de publicar',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-projects-group-'));try{
  const destination=join(root,'capture'),calls=[],ids=Array.from({length:103},(_,i)=>`project-${String(i).padStart(3,'0')}`);let fetches=0;
  const fetchImpl=async url=>{fetches++;const after=new URL(url).searchParams.get('after'),remaining=ids.filter(id=>!after||id>after),page=remaining.slice(0,100);return Response.json({projects:page.map(id=>({id})),nextCursor:remaining.length>100?page.at(-1):null});};
  const capture=async({projectId,destination})=>{calls.push(projectId);await writeFile(destination+'.fixture','capturado');};
  const result=await captureAccountProjects({server:'https://example.invalid',token:'secreto',destination,fetchImpl,capture});assert.deepEqual(calls,ids);assert.equal(fetches,4);assert.equal(result.complete,false);assert.equal(result.atomic,false);assert.equal(result.projects.length,103);assert.ok(result.projects.every(x=>/^[a-f0-9]{64}$/.test(x.directory)));const contents=await readFile(join(destination,'index.json'),'utf8');assert.doesNotMatch(contents,/secreto/);assert.deepEqual(JSON.parse(contents),result);
  await assert.rejects(captureAccountProjects({destination,fetchImpl,capture}),/existe/i);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('detiene la publicación si el inventario cambia o una captura falla',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-projects-change-'));try{
  let fetches=0;const fetchImpl=async()=>Response.json({projects:(++fetches===1?['a','b']:['a','c']).map(id=>({id})),nextCursor:null}),destination=join(root,'changed');
  await assert.rejects(captureAccountProjects({server:'https://example.invalid',token:'test',destination,fetchImpl,capture:async()=>{}}),/inventario.*cambió/i);await assert.rejects(readFile(join(destination,'index.json')),{code:'ENOENT'});
  const failed=join(root,'failed'),calls=[];await assert.rejects(captureAccountProjects({server:'https://example.invalid',token:'test',destination:failed,fetchImpl:async()=>Response.json({projects:[{id:'a'},{id:'b'}],nextCursor:null}),capture:async({projectId})=>{calls.push(projectId);if(projectId==='b')throw Error('error de lectura');}}),/b.*error de lectura/);assert.deepEqual(calls,['a','b']);await assert.rejects(readFile(join(failed,'index.json')),{code:'ENOENT'});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('rechaza respuestas inválidas, duplicadas y cursores que no avanzan',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-projects-invalid-'));try{
  for(const [n,body] of [{projects:[{id:'x'},{id:'x'}],nextCursor:null},{projects:[{id:'../x'}],nextCursor:null},{projects:[{id:'a'}],nextCursor:'a'}].entries())await assert.rejects(captureAccountProjects({server:'https://example.invalid',token:'test',destination:join(root,String(n)),fetchImpl:async()=>Response.json(body),capture:async()=>{}}),/inventario.*inválid/i);
 }finally{await rm(root,{recursive:true,force:true});}
});
