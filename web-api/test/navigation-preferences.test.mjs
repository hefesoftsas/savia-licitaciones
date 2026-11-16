import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile} from 'node:fs/promises';
import {navigationPreferences} from '../src/navigation-preferences.js';
import {defaultNavigation,moveNavigationItem,validNavigation,matchesNavigation,migrateNavigation} from '../../client/src/features/web/navigation-layout.mjs';
test('organiza categorías sin perder secciones y busca ignorando acentos',()=>{
 assert.equal(defaultNavigation()[0].items[0],'secop');
 const original=defaultNavigation(),moved=moveNavigationItem(original,'projects','company','company-profile');assert.equal(moved[1].items[0],'projects');assert.equal(moved[0].items.includes('projects'),false);assert.ok(validNavigation(moved));assert.ok(matchesNavigation('Revisiones de rechazo','RECHAZO'));assert.ok(matchesNavigation('Imágenes','imagenes'));assert.equal(validNavigation([...moved,{id:'extra',name:'Extra',items:['projects']}]),false);
});
test('guarda organización por usuario y rechaza pérdida de opciones',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'navigation'}}));
 try{const DB=await worker.getD1Database('DB');await DB.prepare('CREATE TABLE user(id TEXT PRIMARY KEY)').run();await DB.prepare("INSERT INTO user VALUES('alice'),('bob')").run();await DB.prepare(await readFile(new URL('../migrations/0155_navigation_preferences.sql',import.meta.url),'utf8')).run();const env={DB,BETTER_AUTH_URL:'http://localhost'};const get=owner=>navigationPreferences(new Request('http://localhost/api/navigation-preferences'),env,owner);const put=(groups,origin='http://localhost')=>navigationPreferences(new Request('http://localhost/api/navigation-preferences',{method:'PUT',headers:{origin,'content-type':'application/json'},body:JSON.stringify({groups})}),env,'alice');
 const groups=moveNavigationItem(defaultNavigation(),'secop','company');groups.push({id:'custom',name:'Favoritos',items:[]});const saved=moveNavigationItem(groups,'projects','custom');assert.equal((await put(saved)).status,200);assert.deepEqual((await(await get('alice')).json()).groups,saved);assert.deepEqual((await(await get('bob')).json()).groups,defaultNavigation());assert.equal((await put(saved,'https://other.test')).status,403);assert.equal((await put(saved.map(g=>({...g,items:g.items.filter(id=>id!=='projects')})))).status,400);assert.deepEqual((await(await get('alice')).json()).groups,saved);
 }finally{await worker.dispose();}
});

test('retira el asistente de menús antiguos conservando categorías y orden personalizado',()=>{
 const groups=defaultNavigation();groups.reverse();groups[1].name='Mis recursos';groups[0].items.splice(1,0,'assistant');
 const migrated=migrateNavigation(groups);assert.equal(migrated.flatMap(group=>group.items).includes('assistant'),false);assert.deepEqual(migrated.map(group=>group.id),groups.map(group=>group.id));assert.equal(migrated[1].name,'Mis recursos');assert.ok(validNavigation(migrated));
});
