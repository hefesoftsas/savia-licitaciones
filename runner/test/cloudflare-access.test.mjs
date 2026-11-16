import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createAccessFetch, accessHeaders} from '../cloudflare-access.mjs';

test('Access credentials are sent only to the configured HTTPS origin', async () => {
  const calls=[];
  const fetch=createAccessFetch('https://savia.example', {clientId:'id',clientSecret:'secret'}, async (...args)=>{calls.push(args);return new Response('ok');});
  await fetch('https://savia.example/api/runner/jobs', {headers:{authorization:'Bearer runner'}});
  await fetch('https://provider.example/api', {headers:{authorization:'Bearer model'}});
  assert.equal(calls[0][1].headers.get('cf-access-client-id'),'id');
  assert.equal(calls[0][1].headers.get('cf-access-client-secret'),'secret');
  assert.equal(calls[0][1].headers.get('authorization'),'Bearer runner');
  assert.equal(calls[0][1].redirect,'error');
  assert.equal(calls[1][1].headers.authorization,'Bearer model');
  assert.equal(calls[1][1].headers['cf-access-client-secret'],undefined);
});

test('Access headers reject incomplete credentials and insecure servers', () => {
  assert.throws(()=>accessHeaders('https://savia.example',{clientId:'id'}));
  assert.throws(()=>accessHeaders('http://savia.example',{clientId:'id',clientSecret:'secret'}));
  assert.deepEqual(accessHeaders('https://savia.example',null),{});
});

test('the runner heartbeat uses saved Access credentials alongside its runner token', async () => {
 const dir=await mkdtemp(join(tmpdir(),'savia-access-test-'));
 try {
  const config=join(dir,'config.json'), preload=join(dir,'fetch.mjs'), captured=join(dir,'captured.json');
  await writeFile(config,JSON.stringify({server:'https://savia.example',token:'test-runner-token',cloudflareAccess:{clientId:'test-id',clientSecret:'test-secret'}}));
  await writeFile(preload,`import {writeFileSync} from 'node:fs'; globalThis.fetch=async (url, options)=>{writeFileSync(${JSON.stringify(captured)},JSON.stringify({url,headers:Object.fromEntries(new Headers(options.headers)),redirect:options.redirect}));return new Response('{}',{status:200,headers:{'content-type':'application/json'}})};`);
  const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
  const run=spawnSync(process.execPath,['--import',preload,cli,'heartbeat','--config',config],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const sent=JSON.parse(await readFile(captured,'utf8'));
  assert.equal(sent.url,'https://savia.example/api/runners/heartbeat');
  assert.equal(sent.headers.authorization,'Bearer test-runner-token');
  assert.equal(sent.headers['cf-access-client-id'],'test-id');
  assert.equal(sent.headers['cf-access-client-secret'],'test-secret');
  assert.equal(sent.redirect,'error');
 } finally { await rm(dir,{recursive:true,force:true}); }
});
