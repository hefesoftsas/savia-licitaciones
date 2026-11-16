import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile} from 'node:fs/promises';
import {projectSelection} from '../src/project-selection.js';
test('recuerda el proyecto por cuenta y descarta selecciones eliminadas o ajenas',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'project-selection'}}));
 try{const DB=await worker.getD1Database('DB');await DB.prepare('CREATE TABLE user(id TEXT PRIMARY KEY)').run();await DB.prepare('CREATE TABLE projects(id TEXT PRIMARY KEY,owner_id TEXT REFERENCES user(id))').run();await DB.prepare("INSERT INTO user VALUES('alice'),('bob')").run();await DB.prepare("INSERT INTO projects VALUES('a','alice'),('b','bob')").run();await DB.prepare(await readFile(new URL('../migrations/0156_project_selection.sql',import.meta.url),'utf8')).run();const env={DB,BETTER_AUTH_URL:'http://localhost'};
 const get=async owner=>(await projectSelection(new Request('http://localhost/api/project-selection'),env,owner)).json();
 const put=(projectId,origin='http://localhost')=>projectSelection(new Request('http://localhost/api/project-selection',{method:'PUT',headers:{origin,'content-type':'application/json'},body:JSON.stringify({projectId})}),env,'alice');
 assert.deepEqual(await get('alice'),{projectId:null});assert.equal((await put('a')).status,200);assert.deepEqual(await get('alice'),{projectId:'a'});assert.deepEqual(await get('bob'),{projectId:null});assert.equal((await put('b')).status,404);assert.equal((await put('a','http://other')).status,403);assert.deepEqual(await get('alice'),{projectId:'a'});await DB.prepare("DELETE FROM projects WHERE id='a'").run();assert.deepEqual(await get('alice'),{projectId:null});
 }finally{await worker.dispose();}
});
