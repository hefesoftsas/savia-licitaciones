import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCategoryCache} from '../src/features/web/secop-category-cache.mjs';
test('reabrir y remontar categorías reutiliza datos sin otra petición; peticiones concurrentes comparten carga',async()=>{
 let calls=0,release;const cache=createCategoryCache();
 const send=async()=>{calls++;await new Promise(resolve=>{release=resolve});return {success:true,data:['Bogotá']};};
 const first=cache.load('secop-ii','department',send),second=cache.load('secop-ii','department',send);
 assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);release();
 assert.deepEqual(await first,['Bogotá']);assert.deepEqual(cache.peek('secop-ii','department'),['Bogotá']);
 assert.deepEqual(await cache.load('secop-ii','department',send),['Bogotá']);assert.equal(calls,1);
});
test('caché separa fuentes y categorías, vence y permite reintentar tras errores',async()=>{
 let now=0,calls=0;const cache=createCategoryCache({now:()=>now,ttl:100});
 const send=async()=>{calls++;return {success:true,data:[]};};
 await cache.load('secop-ii','department',send);assert.deepEqual(cache.peek('secop-ii','department'),[]);
 assert.equal(cache.peek('secop-i','department'),null);assert.equal(cache.peek('secop-ii','status'),null);
 now=100;assert.equal(cache.peek('secop-ii','department'),null);await cache.load('secop-ii','department',send);assert.equal(calls,2);
 await assert.rejects(cache.load('secop-ii','status',async()=>{throw new Error('offline')}),/offline/);
 await assert.rejects(cache.load('secop-ii','status',async()=>({success:false,message:'upstream'})),/upstream/);
 assert.deepEqual(await cache.load('secop-ii','status',send),[]);
});
