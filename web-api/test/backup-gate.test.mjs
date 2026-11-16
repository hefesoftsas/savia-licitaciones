import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BackupGate, withBackupGate} from '../src/backup-gate.js';

function gateFixture(){
  const data=new Map(); let serial=Promise.resolve();
  const storage={async get(k){return structuredClone(data.get(k));},async put(k,v){data.set(k,structuredClone(v));}};
  const state={storage,blockConcurrencyWhile(fn){const next=serial.then(fn);serial=next.catch(()=>{});return next;}};
  const gate=new BackupGate(state), stub={fetch:(input,init)=>gate.fetch(new Request(input,init))};
  return {stub,env:{BACKUP_GATE_ENABLED:'true',BACKUP_GATE:{idFromName:()=>1,get:()=>stub},BACKUP_CONTROL_TOKEN:'control-token'}};
}
async function control(env,action,nonce){return withBackupGate(new Request('https://example.test/api/_backup/'+action,{method:'POST',headers:{authorization:'Bearer control-token','content-type':'application/json'},body:JSON.stringify({nonce})}),env,()=>{throw Error('must not route');});}
test('maintenance blocks all API requests and waits for existing requests to finish',async()=>{
  const {env}=gateFixture(); let finish; const waiting=new Promise(resolve=>{finish=resolve;});let started;const startedPromise=new Promise(resolve=>{started=resolve;});
  const active=withBackupGate(new Request('https://example.test/api/example'),env,async()=>{started();await waiting;return new Response('ok');});await startedPromise;
  assert.equal((await control(env,'lock','a')).status,200);
  let status=await(await control(env,'status','a')).json();assert.equal(status.active,1);
  assert.equal(status.owned,true);assert.equal((await(await control(env,'status','other')).json()).owned,false);
  assert.equal((await withBackupGate(new Request('https://example.test/api/example'),env,()=>new Response('bad'))).status,503);
  assert.equal((await control(env,'unlock','wrong')).status,409);
  finish();assert.equal((await active).status,200);
  status=await(await control(env,'status','a')).json();assert.equal(status.active,0);
  assert.equal((await control(env,'unlock','a')).status,200);
  assert.equal((await withBackupGate(new Request('https://example.test/api/example'),env,()=>new Response('ok'))).status,200);
});
test('fails closed if enabled without gate or if control authentication fails',async()=>{
  assert.equal((await withBackupGate(new Request('https://example.test/api/me'),{BACKUP_GATE_ENABLED:'true'},()=>new Response('bad'))).status,503);
  const {env}=gateFixture();assert.equal((await withBackupGate(new Request('https://example.test/api/_backup/status',{method:'POST'}),env,()=>new Response('bad'))).status,401);
});
test('failed handlers release their request lease',async()=>{
  const {env}=gateFixture();await assert.rejects(withBackupGate(new Request('https://example.test/api/x'),env,()=>{throw Error('failure');}));
  await control(env,'lock','b');assert.equal((await(await control(env,'status','b')).json()).active,0);
});
