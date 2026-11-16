import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('web y Better Auth comparten origen con Wrangler y Miniflare', { timeout: 120000 }, async () => {
  const config = JSON.parse(await readFile(join(root, 'wrangler.web.local.jsonc'), 'utf8'));
  assert.equal(config.workers_dev, false);
  assert.equal(config.assets.binding, 'ASSETS');
  assert.deepEqual(config.assets.run_worker_first, ['/api', '/api/*']);
  assert.equal(config.ai, undefined);
  const persistence = await mkdtemp(join(tmpdir(), 'savia-site-d1-'));
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' };
  let child;
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--config', 'wrangler.web.local.jsonc', '--persist-to', persistence], { cwd: root, stdio: 'pipe', maxBuffer: 16 * 1024 * 1024, env });
    child = spawn('pnpm', ['exec', 'wrangler', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--config', 'wrangler.web.local.jsonc', '--persist-to', persistence,
      '--var', 'BETTER_AUTH_SECRET:test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', '--var', `BETTER_AUTH_URL:${origin}`, '--var', 'AUTH_ALLOW_REGISTRATION:true', '--var', 'CREDENTIAL_KEY_ID:local-test', '--var', 'CREDENTIAL_KEY_HEX:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'], { cwd: root, stdio: 'ignore', env, detached: true });
    const request = (path, options = {}) => fetch(`${origin}${path}`, options);
    let home;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (child.exitCode !== null) throw new Error(`Wrangler terminó antes de iniciar: ${child.exitCode}`);
      try { home = await request('/'); break; } catch { await delay(250); }
    }
    assert.ok(home, 'Wrangler debe iniciar');
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /<html lang="es">/);
    const script = html.match(/src="(\/assets\/[^\"]+\.js)"/);
    assert.ok(script);
    assert.equal((await request(script[1])).status, 200);
    assert.equal((await request('/proyectos/ejemplo', { headers: { accept: 'text/html' } })).status, 200);
    assert.equal((await request('/api/no-existe', { headers: { accept: 'text/html' } })).status, 404);
    assert.equal((await request('/api/me')).status, 401);
    const signup = await request('/api/auth/sign-up/email', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ name: 'Alice', email: 'alice@example.com', password: 'test-password-12345' }) });
    assert.equal(signup.status, 200, await signup.clone().text());
    const cookie = signup.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    const create = await request('/api/projects', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Oferta pública' }) });
    assert.equal(create.status, 201, await create.clone().text());
    assert.equal((await (await request('/api/projects', { headers: { cookie } })).json()).projects[0].title, 'Oferta pública');
    const project=(await create.json()).project;
    const other=await request('/api/auth/sign-up/email',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({name:'Bob',email:'bob@example.com',password:'test-password-12345'})});assert.equal(other.status,200);const otherCookie=other.headers.get('set-cookie').split(';')[0];
    const removable=await request('/api/projects',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({title:'Temporal'})});assert.equal(removable.status,201);const removableId=(await removable.json()).project.id;assert.equal((await request(`/api/projects/${removableId}`,{method:'DELETE',headers:{cookie:otherCookie,origin}})).status,404);assert.equal((await request(`/api/projects/${removableId}`,{method:'DELETE',headers:{cookie}})).status,403);assert.equal((await request(`/api/projects/${removableId}`,{method:'DELETE',headers:{cookie,origin}})).status,204);
    const upload=()=>request(`/api/projects/${project.id}/files`,{method:'POST',headers:{cookie,origin,'content-type':'text/plain','x-file-name':'pliego.txt','idempotency-key':'site-upload'},body:'Plazo: treinta días'});
    const first=await upload();assert.equal(first.status,201);const file=(await first.json()).file;const replay=await upload();assert.equal(replay.status,200);assert.equal((await replay.json()).file.id,file.id);
    assert.equal((await request(`/api/projects/${project.id}/files/${file.id}`,{headers:{cookie:otherCookie}})).status,404);
    const post=(path,data,authCookie=cookie,headers={})=>request(path,{method:'POST',headers:{origin,'content-type':'application/json',...(authCookie?{cookie:authCookie}:{}),...headers},body:JSON.stringify(data)});
    const credential=await post('/api/provider-credentials',{provider:'opencode-go',model:'fixture',secret:'local-test-fixture'});assert.equal(credential.status,201);const credentialId=(await credential.json()).credential.id;
    const requirement=await post(`/api/projects/${project.id}/workflow/requirements`,{title:'Experiencia'});assert.equal(requirement.status,201);const requirementId=(await requirement.json()).item.id;
    const support=await post(`/api/projects/${project.id}/workflow/requirements/${requirementId}/supports`,{title:'Certificado requerido'});assert.equal(support.status,201);
    const review=await request(`/api/projects/${project.id}/preflight`,{headers:{cookie}});assert.equal(review.status,200);const reviewData=await review.json();assert.ok(reviewData.items.some(item=>item.code==='support_missing'&&item.title==='Certificado requerido'));
    assert.equal((await request(`/api/projects/${project.id}/preflight`,{headers:{cookie:otherCookie}})).status,404);
    assert.doesNotMatch(JSON.stringify(await (await request('/api/provider-credentials',{headers:{cookie}})).json()),/local-test-fixture/);
    const pairing=await post('/api/runner-pairings',{});assert.equal(pairing.status,201);const connected=await post('/api/runners/pair',{name:'Runner local',code:(await pairing.json()).code},null);assert.equal(connected.status,201);const connectedRunner=await connected.json(),token=connectedRunner.token;
    const queued=await post(`/api/projects/${project.id}/jobs`,{kind:'tender-chat.send',credentialId,payload:{question:'¿Cuál es el plazo?',fileIds:[file.id],dataProcessingConsent:true}},cookie,{'idempotency-key':'site-job'});assert.equal(queued.status,201);const job=(await queued.json()).job;
    const before=(await(await request(`/api/projects/${project.id}/jobs`,{headers:{cookie}})).json()).jobs.find(item=>item.id===job.id);assert.equal(before.state,'queued');
    process.env.SAVIA_HEADLESS_RUNNER='1';const {runOnce}=await import('../../runner/work-loop.mjs'),{createTenderChatHandler}=await import('../../runner/tender-chat.mjs'),{createOutbox}=await import('../../runner/outbox.mjs');const handler=createTenderChatHandler({temporaryRoot:persistence});
    const outbox=createOutbox({directory:join(persistence,'outbox'),server:origin,runnerId:'site-runner',token}),originalFetch=globalThis.fetch,observed=[],modelRequests=[];globalThis.fetch=async(input,options={})=>{const target=typeof input==='string'?input:input.url;if(target.startsWith(`${origin}/api/runner/jobs/${job.id}/`))observed.push(new URL(target).pathname);if(target=== 'https://opencode.ai/inference/go/openai/v1/responses'){assert.equal(new Headers(options.headers).get('authorization'),'Bearer local-test-fixture');const body=JSON.parse(options.body);modelRequests.push(body);const output=modelRequests.length===1?[{type:'function_call',call_id:'call_read',name:'read',arguments:JSON.stringify({path:'sources/1.md'})}]:[{type:'message',content:[{type:'output_text',text:'El plazo es treinta días.\n<suggested_questions>[]</suggested_questions>'}]}];return new Response(JSON.stringify({id:`fixture-${modelRequests.length}`,status:'completed',model:'fixture',output,usage:{input_tokens:10,output_tokens:10,total_tokens:20}}),{headers:{'content-type':'application/json'}});}const parsed=new URL(target);if(!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))throw new Error('La prueba bloqueó un destino externo inesperado.');return originalFetch(input,options);};let done;try{done=await runOnce({server:origin,token,outbox,handlers:{'tender-chat.send':handler}});}finally{globalThis.fetch=originalFetch;}assert.equal(done.state,'succeeded');assert.equal(done.jobId,job.id);assert.equal(modelRequests.length,2);assert.ok(JSON.stringify(modelRequests[1].input).includes('Plazo: treinta días'));assert.ok(observed.includes(`/api/runner/jobs/${job.id}/credential`));assert.ok(observed.includes(`/api/runner/jobs/${job.id}/files/${file.id}`));assert.ok(observed.includes(`/api/runner/jobs/${job.id}/complete`));assert.deepEqual(await outbox.list(),[]);
    const after=(await(await request(`/api/projects/${project.id}/jobs`,{headers:{cookie}})).json()).jobs.find(item=>item.id===job.id);assert.equal(after.state,'succeeded');assert.match(after.result.answer,/treinta días/);assert.doesNotMatch(JSON.stringify(after),/local-test-fixture/);assert.equal((await request(`/api/projects/${project.id}/jobs`,{headers:{cookie:otherCookie}})).status,404);

    const second=await post(`/api/projects/${project.id}/jobs`,{kind:'tender-chat.send',credentialId,payload:{question:'¿Cuál es el plazo?',fileIds:[file.id],dataProcessingConsent:true}},cookie,{'idempotency-key':'site-cli-job'});assert.equal(second.status,201);const secondJob=(await second.json()).job;
    const configPath=join(persistence,'runner.json'),mockPath=join(persistence,'provider-fixture.mjs');await writeFile(configPath,JSON.stringify({server:origin,runnerId:connectedRunner.runner.id,token}));
    await writeFile(mockPath,`const original=globalThis.fetch;let calls=0;globalThis.fetch=async(input,options={})=>{const target=typeof input==='string'?input:input.url;if(target==='https://opencode.ai/inference/go/openai/v1/responses'){if(new Headers(options.headers).get('authorization')!=='Bearer local-test-fixture')throw Error('Credencial incorrecta');const body=JSON.parse(options.body);calls++;if(calls===2&&!JSON.stringify(body.input).includes('Plazo: treinta días'))throw Error('Documento ausente');const output=calls===1?[{type:'function_call',call_id:'read',name:'read',arguments:JSON.stringify({path:'sources/1.md'})}]:[{type:'message',content:[{type:'output_text',text:'El plazo es treinta días.\\n<suggested_questions>[]</suggested_questions>'}]}];return new Response(JSON.stringify({id:'fixture-'+calls,status:'completed',model:'fixture',output,usage:{input_tokens:10,output_tokens:10,total_tokens:20}}),{headers:{'content-type':'application/json'}});}const url=new URL(target);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Destino externo inesperado');return original(input,options);};`);
    const cli=process.env.SAVIA_TEST_RUNNER_CLI||resolve(root,'../runner/cli.mjs');await promisify(execFile)(process.execPath,[cli,'run-once','--config',configPath],{timeout:60000,env:{...process.env,NODE_OPTIONS:`--import=${pathToFileURL(mockPath).href}`}});
    const cliJob=(await(await request(`/api/projects/${project.id}/jobs`,{headers:{cookie}})).json()).jobs.find(item=>item.id===secondJob.id);assert.equal(cliJob.state,'succeeded');assert.match(cliJob.result.answer,/treinta días/);assert.doesNotMatch(JSON.stringify(cliJob),/local-test-fixture/);

  } finally {
    if (child && child.exitCode === null) {
      globalThis.process.kill(-child.pid, 'SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
    await rm(persistence, { recursive: true, force: true });
  }
});
