import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureSnapshot} from '../../infra/web/cloud_backup.mjs';

test('waits for active operations before exporting and copying, then unlocks',async()=>{
 let statusCalls=0;const steps=[];
 const gate={async lock(){steps.push('lock');},async status(){steps.push('status');return {locked:true,owned:true,active:statusCalls++===0?1:0};},async unlock(){steps.push('unlock');}};
 const result=await captureSnapshot({gate,wait:async()=>{},exportDatabase:async()=>{steps.push('database');return {sha256:'db'};},copyObjects:async()=>{steps.push('objects');return {count:2};},saveManifest:async()=>steps.push('manifest')});
 assert.equal(result.count,2);assert.deepEqual(steps,['lock','status','status','database','status','objects','status','manifest','unlock']);
});
test('refuses a snapshot when the gate cannot drain and always unlocks',async()=>{
 const steps=[];const gate={async lock(){},async status(){return {locked:true,owned:true,active:1};},async unlock(){steps.push('unlock');}};
 await assert.rejects(captureSnapshot({gate,attempts:2,wait:async()=>{},exportDatabase:async()=>steps.push('database'),copyObjects:async()=>steps.push('objects'),saveManifest:async()=>steps.push('manifest')}));
 assert.deepEqual(steps,['unlock']);
});
test('does not commit a manifest if the maintenance lock is lost',async()=>{
 let calls=0;const steps=[];const gate={async lock(){},async status(){return {locked:++calls===1,owned:true,active:0};},async unlock(){steps.push('unlock');}};
 await assert.rejects(captureSnapshot({gate,wait:async()=>{},exportDatabase:async()=>({}),copyObjects:async()=>steps.push('objects'),saveManifest:async()=>steps.push('manifest')}));
 assert.deepEqual(steps,['unlock']);
});
test('rejects a lock owned by another capture',async()=>{
 const steps=[];const gate={async lock(){},async status(){return {locked:true,owned:false,active:0};},async unlock(){steps.push('unlock');}};
 await assert.rejects(captureSnapshot({gate,exportDatabase:async()=>steps.push('db'),copyObjects:async()=>steps.push('objects'),saveManifest:async()=>steps.push('manifest')}));
 assert.deepEqual(steps,['unlock']);
});
