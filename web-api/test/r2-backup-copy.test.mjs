import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('copies and verifies R2 objects without overwriting existing data',async()=>{
 const script=await readFile(new URL('../../infra/web/r2_copy_worker.mjs',import.meta.url),'utf8');
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],r2Buckets:['SOURCE','TARGET'],bindings:{COPY_SECRET:'secret',SOURCE_PREFIX:'',TARGET_PREFIX:'snapshots/test/'}}));
 try{
  const source=await mf.getR2Bucket('SOURCE'),target=await mf.getR2Bucket('TARGET');
  const value=new Uint8Array(2*1024*1024).fill(42);
  await source.put('project/test.pdf',value,{httpMetadata:{contentType:'application/pdf'},customMetadata:{kind:'test'}});
  const post=(action,body={})=>mf.dispatchFetch('http://localhost/'+action,{method:'POST',headers:{authorization:'Bearer secret','content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await mf.dispatchFetch('http://localhost/list',{method:'POST'})).status,401);
  assert.equal((await(await post('target-empty')).json()).empty,true);
  const list=await(await post('list')).json();assert.equal(list.objects.length,1);
  const copied=await post('copy',list.objects[0]);assert.equal(copied.status,200);const result=await copied.json();assert.equal(result.size,value.length);assert.match(result.sha256,/^[0-9a-f]{64}$/);
  const obj=await target.get('snapshots/test/project/test.pdf');assert.equal(obj.httpMetadata.contentType,'application/pdf');assert.equal(obj.customMetadata.kind,'test');assert.deepEqual(new Uint8Array(await obj.arrayBuffer()),value);
  assert.equal((await post('copy',list.objects[0])).status,409);
  assert.equal((await(await post('target-empty')).json()).empty,false);
  await source.put('changed.txt','old');
  const previous=(await(await post('list')).json()).objects.find(x=>x.key==='changed.txt');
  await source.put('changed.txt','new');
  assert.equal((await post('copy',previous)).status,409);
  await source.put('empty.txt','');
  const empty=(await(await post('list')).json()).objects.find(x=>x.key==='empty.txt');
  const emptyResult=await post('copy',empty);assert.equal(emptyResult.status,200);assert.equal((await emptyResult.json()).sha256,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
 }finally{await mf.dispose();}
});
