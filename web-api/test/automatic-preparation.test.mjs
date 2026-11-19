import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runOnce } from '../../runner/work-loop.mjs';
import { createWordExportHandler } from '../../runner/technical-plan-export.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const ambiguousScore of [false,true]) test(ambiguousScore ? 'pide solo la decisión de puntuación cuando el análisis es inconcluso' : 'prepara hasta Word sin revisiones intermedias y respeta pausa y reanudación', async () => {
 const build = await mkdtemp(join(tmpdir(), 'savia-outline-')); let worker;
 try {
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', build], { cwd: root, stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile(join(build, 'index.js'), 'utf8'), compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'automatic-prep-test' }, r2Buckets: ['FILES'], bindings: { AUTH_ALLOW_REGISTRATION:'true', BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz', BETTER_AUTH_URL: 'http://localhost', CREDENTIAL_KEY_HEX: '11'.repeat(32), CREDENTIAL_KEY_ID: 'test' } }));
  const db = await worker.getD1Database('DB'); for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort()) for (const sql of (await readFile(join(root, 'migrations', file), 'utf8')).split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const req = (path, options = {}) => worker.dispatchFetch(`http://localhost${path}`, options);
  const post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  async function signup(name) { const r = await post('/api/auth/sign-up/email', { name, email: `${name}@example.com`, password: 'password-123456' }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }
  const alice = await signup('alice'), bob = await signup('bob');
  const project = (await (await post('/api/projects', { title: 'Proyecto' }, { cookie: alice })).json()).project;
  const path = `/api/projects/${project.id}`;
  await req(`${path}/technical-plan`, { headers: { cookie: alice } });
  const file = (await (await req(`${path}/files`, { method: 'POST', headers: { cookie: alice, origin: 'http://localhost', 'x-file-name': 'pliego.txt', 'content-type': 'text/plain' }, body: 'Pliego' })).json()).file;
  const credential = (await (await post('/api/provider-credentials', { provider: 'opencode-go', model: 'fixture', secret: 'fixture-secret' }, { cookie: alice })).json()).credential;
  const pairing = await (await post('/api/runner-pairings', {}, { cookie: alice })).json(); const runner = await (await post('/api/runners/pair', { code: pairing.code, name: 'Equipo' })).json(); const agent = { authorization: `Bearer ${runner.token}` };

  const url = `${path}/automatic-preparation`;
  const command = (action, extra = {}) => post(url, {action,...extra}, {cookie:alice});
  const state = async () => (await (await req(url,{headers:{cookie:alice}})).json()).preparation;
  const setup = {fileIds:[file.id],credentialId:credential.id,language:'es',consent:true};
  assert.equal((await req(url,{headers:{cookie:bob}})).status,404);
  assert.equal((await command('start',{...setup,consent:false})).status,400);
  assert.equal((await command('start',setup)).status,200);
  const kinds=['analyze','generate-roots','expand-outline','generate-facts','generate-batch'].map(kind=>'technical-plan.'+kind);
  const claim = async () => {
   const r=await post('/api/runner/jobs/claim',{kinds},agent);
   assert.equal(r.status,200,await r.clone().text());
   return r.json();
  };
  const claimNext=async expected=>{
   for(let i=0;i<8;i++){
    const result=await claim();
    if(result.job){
     assert.equal(result.job.kind,'technical-plan.'+expected);
     return result;
    }
   }
   assert.fail('No job queued: '+JSON.stringify(await state()));
  };
  const complete=async ({job,lease},result)=>{
   const r=await post(`/api/runner/jobs/${job.id}/complete`,{lease,status:'succeeded',result},agent);
   assert.equal(r.status,200,await r.clone().text());
  };
  let active=await claimNext('analyze');
  assert.equal(active.job.payload.category,'project-overview');
  assert.equal((await (await command('pause')).json()).preparation.status,'paused');
  await complete(active,{content:'Resumen del proyecto'});
  assert.equal((await claim()).job,null);
  const analyses=async () => (await (await req(`${path}/technical-analyses`,{headers:{cookie:alice}})).json()).analyses;
  assert.equal((await analyses()).length,0);
  assert.equal((await (await command('resume')).json()).preparation.status,'running');
  for(const [category,content] of [['technical-score',ambiguousScore?'El informe no es concluyente.':'No hay puntuación técnica.'],['response-requirements','Requisitos de la oferta']]){
   active=await claimNext('analyze');
   assert.equal(active.job.payload.category,category);
   await complete(active,{content});
  }
  active=await claimNext('generate-roots');
  const leafId=crypto.randomUUID();
  const chapter={id:leafId,title:'Metodología',description:'Alcance técnico',attr:'技术',content_mode:'ai-generate'};
  await complete(active,{outline:[chapter]});
  if(ambiguousScore){
   assert.equal((await claim()).job,null);
   assert.equal((await claim()).job,null);
   assert.equal((await state()).reason,'technical_score_unknown');
   assert.equal((await command('resume',{technicalScore:'none'})).status,200);
  }
  active=await claimNext('expand-outline');
  assert.equal(active.job.payload.noTechnicalScore,true);
  await complete(active,{outline:[chapter],warnings:[]});
  active=await claimNext('generate-facts');
  await complete(active,{groups:[{id:'plazo',title:'Plazo',content:'Dos meses'}]});
  active=await claimNext('generate-batch');
  const draft=await post(`/api/runner/jobs/${active.job.id}/technical-batch/drafts/${leafId}`,{lease:active.lease,content:'Ejecutaremos un diagnóstico del sistema.'},agent);
  assert.equal(draft.status,201,await draft.clone().text());
  await complete(active,{generatedCount:1});
  assert.equal((await claim()).job,null);
  const outcome=await runOnce({server:(await worker.ready).origin,token:runner.token,handlers:{'technical-plan.export-word':createWordExportHandler()}});
  assert.equal(outcome.state,'succeeded',JSON.stringify(outcome));
  assert.equal((await claim()).job,null);
  const done=await state();
  assert.equal(done.status,'ready',JSON.stringify(done));
  assert.equal(done.wordId,outcome.jobId);
  const word=await req(`${path}/jobs/${done.wordId}/artifact`,{headers:{cookie:alice}});
  assert.equal(word.status,200);
  assert.deepEqual([...new Uint8Array(await word.arrayBuffer()).slice(0,4)],[80,75,3,4]);
  assert.equal((await analyses()).filter(item=>item.current).length,3);
  const facts=await (await req(`${path}/technical-facts`,{headers:{cookie:alice}})).json();
  assert.equal(facts.current,true);
  assert.equal(facts.groups[0].content,'Dos meses');
 } finally { await worker?.dispose(); await rm(build,{recursive:true,force:true}); }
});
