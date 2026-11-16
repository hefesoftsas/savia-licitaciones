import {test} from 'node:test';
import assert from 'node:assert/strict';
import {restoreSnapshot} from '../../infra/web/cloud_restore.mjs';
const manifest={version:1,prefix:'snapshots/x/objects/',database:{restoreSha256:'d'.repeat(64)},count:1,objects:[{key:'a',size:3,sha256:'a'.repeat(64)}]};
function setup(){const steps=[];return {steps,options:{manifest,verifyDatabase:async()=>true,targetsEmpty:async()=>true,listObjects:async()=>[{key:'snapshots/x/objects/a',size:3,version:'1'}],copyObject:async()=>({size:3,sha256:'a'.repeat(64)}),restoreDatabase:async()=>steps.push('db'),checkForeignKeys:async()=>true}};}
test('restores verified objects and then the isolated database',async()=>{const {steps,options}=setup();assert.equal((await restoreSnapshot(options)).count,1);assert.deepEqual(steps,['db']);});
test('does not restore into nonempty resources or with a changed manifest',async()=>{let x=setup();x.options.targetsEmpty=async()=>false;await assert.rejects(restoreSnapshot(x.options));assert.deepEqual(x.steps,[]);x=setup();x.options.listObjects=async()=>[];await assert.rejects(restoreSnapshot(x.options));assert.deepEqual(x.steps,[]);});
test('does not import D1 when an object checksum differs',async()=>{const {steps,options}=setup();options.copyObject=async()=>({size:3,sha256:'wrong'});await assert.rejects(restoreSnapshot(options));assert.deepEqual(steps,[]);});
