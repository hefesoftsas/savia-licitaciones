// Exercises the shipped Node + runner against a local fixture. No model calls.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import controllerModule from './app/controller.cjs';
const index = process.argv.indexOf('--bundle');
if (index < 0 || !process.argv[index + 1]) throw new Error('Indica --bundle.');
const bundle = resolve(process.argv[index + 1]);
const nodeIndex = process.argv.indexOf('--node');
const executable = nodeIndex < 0 ? join(bundle, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node') : resolve(process.argv[nodeIndex + 1]);
const runtimeEnv = process.argv.includes('--electron-runtime') ? { ELECTRON_RUN_AS_NODE: '1' } : {};
const replacementIndex=process.argv.indexOf('--replacement-bundle');
const replacementNodeIndex=process.argv.indexOf('--replacement-node');
if((replacementIndex<0)!==(replacementNodeIndex<0))throw new Error('Indica --replacement-bundle y --replacement-node juntos.');
const replacementBundle=replacementIndex<0?null:resolve(process.argv[replacementIndex+1]);
const replacementNode=replacementNodeIndex<0?null:resolve(process.argv[replacementNodeIndex+1]);
const directory = await mkdtemp(join(tmpdir(), 'savia-connector-smoke-'));
const config = join(directory, 'Conexión equipo 中文', 'runner.json');
const code = 'a'.repeat(64), token = 'fixture-only-connector-token';
let paired = false, claims = 0;
const server = createServer(async (request, response) => {
  let body = ''; for await (const chunk of request) body += chunk;
  response.setHeader('content-type', 'application/json');
  if (request.url === '/api/runners/pair') {
    paired = JSON.parse(body).code === code;
    response.statusCode = paired ? 200 : 400;
    response.end(JSON.stringify({ runner: { id: 'fixture-runner' }, token }));
  } else if (request.headers.authorization !== `Bearer ${token}`) {
    response.statusCode = 401; response.end('{}');
  } else if (request.url === '/api/runner/jobs/claim') {
    claims++; response.end('{"job":null}');
  } else response.end('{}');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const controller = new controllerModule.ConnectorController({
  node: executable,
  cli: join(bundle, 'runner/cli.mjs'), config, cwd: bundle,
  spawnImpl: (command, args, options) => spawn(command, args, { ...options, env: { ...process.env, ...runtimeEnv, TMPDIR: directory, TEMP: directory, TMP: directory } })
});
let replacement;
try {
  await controller.initialize();
  await controller.pair({ server: `http://127.0.0.1:${server.address().port}`, name: 'Equipo de prueba 中文', code });
  const deadline = Date.now() + 30000;
  while (!claims && Date.now() < deadline) { if (controller.snapshot().error) break; await delay(100); }
  assert.equal(paired, true, 'pairing must reach server');
  assert.ok(claims > 0, `bundled runner must poll for work: ${controller.snapshot().error || 'unknown'}`);
  assert.equal(controller.snapshot().running, true);
  assert.equal(JSON.stringify(controller.snapshot()).includes(token), false);
  assert.equal(JSON.parse(await readFile(config, 'utf8')).token, token);
  await controller.stop();
  assert.equal(controller.snapshot().running, false);
  if(replacementBundle&&replacementNode){
    const before=await readFile(config,'utf8'),previousClaims=claims;
    replacement=new controllerModule.ConnectorController({
      node:replacementNode,cli:join(replacementBundle,'runner/cli.mjs'),config,cwd:replacementBundle,
      spawnImpl:(command,args,options)=>spawn(command,args,{...options,env:{...process.env,...runtimeEnv,TMPDIR:directory,TEMP:directory,TMP:directory}})
    });
    await replacement.initialize();assert.equal(replacement.snapshot().paired,true,'the existing pairing must survive the update');
    replacement.start();const deadline=Date.now()+30000;
    while(claims===previousClaims&&Date.now()<deadline){if(replacement.snapshot().error)break;await delay(100);}
    assert.ok(claims>previousClaims,'the updated runner must poll using the existing connection');
    assert.equal(await readFile(config,'utf8'),before,'updating must preserve the pairing file');
    await replacement.stop();
    console.log('OK: updated connector uses the existing pairing and polls for work.');
  }
  console.log('OK: bundled runtime pairs, polls for tasks and stops; credentials stay outside UI.');
} finally {
  await replacement?.shutdown();
  await controller.shutdown();
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
