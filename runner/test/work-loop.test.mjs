import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createOutbox } from '../outbox.mjs';
const { runOnce, recoverPending, recoverTechnicalDrafts } = await import(process.env.SAVIA_TEST_RUNNER_WORK_LOOP || new URL('../work-loop.mjs', import.meta.url));

async function fixture(handler, action) {
  const server = createServer(async (req, res) => { const chunks = []; for await (const chunk of req) chunks.push(chunk); const body = Buffer.concat(chunks).toString('utf8'); await handler(req, res, JSON.parse(body || '{}')); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await action(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const respond = (res, body = { ok: true }, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const claim = { job: { id: 'job', kind: 'test', payload: {} }, lease: 'fixture-lease', leaseDurationMs: 400 };
const opts = { renewIntervalMs: 30, retryDelayMs: 10, deliveryTimeoutMs: 500, leaseSafetyMs: 20, requestTimeoutMs: 200 };

test('renueva con la última etapa sin incluir contenido de actividad', async () => {
  const renewals = [];
  await fixture((req, res, body) => {
    if (req.url.endsWith('/claim')) return respond(res, claim);
    if (req.url.endsWith('/renew')) { renewals.push(body); return respond(res); }
    if (req.url.endsWith('/complete')) return respond(res);
  }, async server => {
    const result = await runOnce({ server, token: 'token', ...opts, handlers: { test: async (_payload, context) => {
      context.reportProgress('reading'); await delay(80); return {};
    } } });
    assert.equal(result.state, 'succeeded');
    assert.ok(renewals.some(item => item.progress === 'reading'));
  });
});

test('recupera confirmaciones perdidas al guardar planes y borradores técnicos sin repetir su generación', async () => {
  const received = { plan: [], draft: [] }; let executions = 0;
  await fixture((req, res, body) => {
    if (req.url.endsWith('/claim')) return respond(res, claim);
    if (req.url.endsWith('/renew')) return respond(res);
    if (req.url.endsWith('/complete')) return respond(res);
    const kind = req.url.endsWith('/technical-batch/plan') ? 'plan' : req.url.endsWith('/technical-batch/drafts/node') ? 'draft' : null;
    if (kind) { received[kind].push(body); if (received[kind].length === 1) return res.socket.destroy(); return respond(res); }
  }, async server => {
    const result = await runOnce({ server, token: 'token', ...opts, handlers: { test: async (_payload, context) => { executions++; await context.saveTechnicalBatchPlans({plans:[]}); await context.saveTechnicalBatchDraft('node','Contenido'); return {done:true}; } } });
    assert.equal(result.state,'succeeded'); assert.equal(executions,1);
    for (const messages of Object.values(received)) { assert.equal(messages.length,2); assert.deepEqual(messages[0],messages[1]); }
  });
});

test('no reintenta un rechazo definitivo al guardar un borrador técnico', async () => {
  let attempts=0;
  await fixture((req,res)=>{
    if(req.url.endsWith('/claim'))return respond(res,claim);
    if(req.url.endsWith('/renew'))return respond(res);
    if(req.url.endsWith('/complete'))return respond(res);
    if(req.url.endsWith('/technical-batch/drafts/node')){attempts++;return respond(res,{},409);}
  },async server=>{
    const result=await runOnce({server,token:'token',...opts,handlers:{test:async(_payload,context)=>{await context.saveTechnicalBatchDraft('node','Contenido');return {};}}});
    assert.equal(result.state,'failed');assert.equal(attempts,1);
  });
});

test('interrumpe los reintentos de borrador cuando se pierde la concesión', async () => {
  let attempts=0,completions=0;
  await fixture((req,res)=>{
    if(req.url.endsWith('/claim'))return respond(res,claim);
    if(req.url.endsWith('/renew'))return respond(res,{},409);
    if(req.url.endsWith('/complete')){completions++;return respond(res);}
    if(req.url.endsWith('/technical-batch/drafts/node')){attempts++;return respond(res,{},503);}
  },async server=>{
    await assert.rejects(runOnce({server,token:'token',...opts,handlers:{test:async(_payload,context)=>{await context.saveTechnicalBatchDraft('node','Contenido');return {};}}}),/409/);
    assert.ok(attempts>=1);assert.equal(completions,0);
  });
});

test('conserva cifrado un borrador no confirmado y lo recupera antes de reclamar otra tarea',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'savia-draft-')),jobId='12345678-1234-4234-8234-123456789abc';let offline=true,completions=0,received;
  try{await fixture((req,res,body)=>{
    if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,id:jobId}});
    if(req.url.endsWith('/renew'))return respond(res);
    if(req.url.endsWith('/complete')){completions++;return respond(res);}
    if(req.url.endsWith('/technical-batch/drafts/node')){if(offline)return respond(res,{},503);received=body;return respond(res);}
  },async server=>{
    const config={directory,server,runnerId:'fixture',token:'token'},draftOutbox=createOutbox(config);
    await assert.rejects(runOnce({server,token:'token',draftOutbox,...opts,deliveryTimeoutMs:0,handlers:{test:async(_payload,context)=>{await context.saveTechnicalBatchDraft('node','Información privada');return {};}}}),/503/);
    assert.equal(completions,0);assert.equal((await draftOutbox.list()).length,1);const disk=await (await import('node:fs/promises')).readFile(join(directory,`${jobId}.json`),'utf8');assert.doesNotMatch(disk,/Información privada/);
    offline=false;const recovered=await recoverTechnicalDrafts({server,token:'token',outbox:createOutbox(config)});assert.equal(recovered.delivered,1);assert.equal(received.content,'Información privada');assert.deepEqual(await draftOutbox.list(),[]);
  });}finally{await rm(directory,{recursive:true,force:true});}
});

test('conserva para exportar un borrador cuya concesión venció',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-draft-rejected-')),jobId='12345678-1234-4234-8234-123456789abc';
 try{await fixture((req,res)=>respond(res,{},409),async server=>{
  const outbox=createOutbox({directory,server,runnerId:'fixture',token:'token'});await outbox.save(jobId,{lease:'old',status:'technical-draft',result:{nodeId:'node',content:'Texto conservado'}});
  const recovered=await recoverTechnicalDrafts({server,token:'token',outbox});assert.deepEqual(recovered.rejected,[jobId]);assert.equal((await outbox.list())[0].state,'rejected');
  const destination=join(directory,'export.json');await outbox.export(jobId,destination);const exported=JSON.parse(await (await import('node:fs/promises')).readFile(destination,'utf8'));assert.equal(exported.result.content,'Texto conservado');assert.equal(exported.lease,undefined);
 });}finally{await rm(directory,{recursive:true,force:true});}
});

test('recupera la planificación cifrada tras un cierre antes de su confirmación',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-plan-pending-')),jobId='12345678-1234-4234-8234-123456789abc';let offline=true,received,completions=0;
 try{await fixture((req,res,body)=>{
  if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,id:jobId}});
  if(req.url.endsWith('/renew'))return respond(res);
  if(req.url.endsWith('/complete')){completions++;return respond(res);}
  if(req.url.endsWith('/technical-batch/plan')){if(offline)return respond(res,{},503);received=body;return respond(res);}
 },async server=>{
  const config={directory,server,runnerId:'fixture',token:'token'},draftOutbox=createOutbox(config),plans={plans:[{id:'a',focus:'Datos confidenciales'}]};
  await assert.rejects(runOnce({server,token:'token',draftOutbox,...opts,deliveryTimeoutMs:0,handlers:{test:async(_payload,context)=>{await context.saveTechnicalBatchPlans(plans);return {};}}}),/503/);
  assert.equal(completions,0);assert.doesNotMatch(await (await import('node:fs/promises')).readFile(join(directory,`${jobId}.json`),'utf8'),/Datos confidenciales/);
  offline=false;assert.equal((await recoverTechnicalDrafts({server,token:'token',outbox:createOutbox(config)})).delivered,1);assert.deepEqual(received.plans,plans);assert.deepEqual(await draftOutbox.list(),[]);
 });}finally{await rm(directory,{recursive:true,force:true});}
});

test('una planificación rechazada queda disponible para exportar sin revelar la concesión',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-plan-rejected-')),jobId='12345678-1234-4234-8234-123456789abc';
 try{await fixture((req,res)=>respond(res,{},409),async server=>{
  const outbox=createOutbox({directory,server,runnerId:'fixture',token:'token'}),plans={plans:[{id:'a'}]};await outbox.save(jobId,{lease:'secret',status:'technical-plan',result:{plans}});
  assert.deepEqual((await recoverTechnicalDrafts({server,token:'token',outbox})).rejected,[jobId]);const dest=join(directory,'plan.json');await outbox.export(jobId,dest);const exported=JSON.parse(await (await import('node:fs/promises')).readFile(dest,'utf8'));assert.deepEqual(exported.result.plans,plans);assert.equal(exported.lease,undefined);
 });}finally{await rm(directory,{recursive:true,force:true});}
});
test('recupera una revisión de coherencia cifrada tras una entrega interrumpida',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-review-pending-')),jobId='12345678-1234-4234-8234-123456789abc';let offline=true,received,completions=0;
 try{await fixture((req,res,body)=>{if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,id:jobId}});if(req.url.endsWith('/renew'))return respond(res);if(req.url.endsWith('/complete')){completions++;return respond(res);}if(req.url.endsWith('/technical-batch/consistency')){if(offline)return respond(res,{},503);received=body;return respond(res);}},async server=>{
  const config={directory,server,runnerId:'fixture',token:'token'},draftOutbox=createOutbox(config),review={checked_ids:['a'],sections:[],unresolved:[]};
  await assert.rejects(runOnce({server,token:'token',draftOutbox,...opts,deliveryTimeoutMs:0,handlers:{test:async(_payload,context)=>{await context.saveTechnicalBatchConsistency(review);return {};}}}),/503/);assert.equal(completions,0);
  offline=false;assert.equal((await recoverTechnicalDrafts({server,token:'token',outbox:createOutbox(config)})).delivered,1);assert.deepEqual(received.review,review);assert.deepEqual(await draftOutbox.list(),[]);
 });}finally{await rm(directory,{recursive:true,force:true});}
});
test('conserva y reenvía un punto de control por capítulo tras una desconexión',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-ledger-pending-')),jobId='12345678-1234-4234-8234-123456789abc';let offline=true,received,completions=0;
 try{await fixture((req,res,body)=>{if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,id:jobId}});if(req.url.endsWith('/renew'))return respond(res);if(req.url.endsWith('/complete')){completions++;return respond(res);}if(req.url.endsWith('/technical-batch/ledger/node')){if(offline)return respond(res,{},503);received=body;return respond(res);}},async server=>{
  const config={directory,server,runnerId:'fixture',token:'token'},draftOutbox=createOutbox(config),entry={id:'node',reference:false,fingerprint:'a'.repeat(64),facts:[],issues:[]};await assert.rejects(runOnce({server,token:'token',draftOutbox,...opts,deliveryTimeoutMs:0,handlers:{test:async(_payload,context)=>{await context.saveTechnicalBatchLedger(entry);return {};}}}),/503/);assert.equal(completions,0);offline=false;assert.equal((await recoverTechnicalDrafts({server,token:'token',outbox:createOutbox(config)})).delivered,1);assert.deepEqual(received.entry,entry);assert.deepEqual(await draftOutbox.list(),[]);
 });}finally{await rm(directory,{recursive:true,force:true});}
});
test('reintenta la lectura individual de capítulos ante una interrupción temporal',async()=>{
 let attempts=0;await fixture((req,res)=>{if(req.url.endsWith('/claim'))return respond(res,claim);if(req.url.endsWith('/renew')||req.url.endsWith('/complete'))return respond(res);if(req.url.endsWith('/technical-batch/section/node')){attempts++;return attempts===1?respond(res,{},503):respond(res,{section:{id:'node',title:'A',content:'Texto',reference:false}});}},async server=>{
  const outcome=await runOnce({server,token:'token',...opts,handlers:{test:async(_payload,context)=>{const section=await context.getTechnicalBatchSection('node');assert.equal(section.content,'Texto');return {};}}});assert.equal(outcome.state,'succeeded');assert.equal(attempts,2);
 });
});
test('reenvía un punto de control rechazado al reclamar de nuevo el mismo lote',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-ledger-resume-')),jobId='12345678-1234-4234-8234-123456789abc';let received;
 try{await fixture((req,res,body)=>{if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,id:jobId,kind:'technical-plan.generate-batch'},lease:'new-lease'});if(req.url.endsWith('/renew')||req.url.endsWith('/complete'))return respond(res);if(req.url.endsWith('/technical-batch/ledger/node')){received=body;return respond(res);}},async server=>{
  const draftOutbox=createOutbox({directory,server,runnerId:'fixture',token:'token'}),entry={id:'node',reference:false,fingerprint:'a'.repeat(64),facts:[],issues:[]};await draftOutbox.save(jobId,{lease:'old',status:'technical-ledger',result:{entry}});await draftOutbox.reject(jobId);
  const outcome=await runOnce({server,token:'token',draftOutbox,...opts,handlers:{'technical-plan.generate-batch':async()=>{assert.equal(received.lease,'new-lease');assert.deepEqual(received.entry,entry);return {};}}});assert.equal(outcome.state,'succeeded');assert.deepEqual(await draftOutbox.list(),[]);
 });}finally{await rm(directory,{recursive:true,force:true});}
});

test('al reanudar el mismo lote entrega la etapa rechazada con la nueva concesión antes de generar',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-resumed-stage-')),jobId='12345678-1234-4234-8234-123456789abc';let delivered,executions=0;
 try{await fixture((req,res,body)=>{
  if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,id:jobId,kind:'technical-plan.generate-batch'},lease:'new-lease'});
  if(req.url.endsWith('/renew')||req.url.endsWith('/complete'))return respond(res);
  if(req.url.endsWith('/technical-batch/drafts/node')){delivered=body;return respond(res);}
 },async server=>{
  const draftOutbox=createOutbox({directory,server,runnerId:'fixture',token:'token'});await draftOutbox.save(jobId,{lease:'old',status:'technical-draft',result:{nodeId:'node',content:'Ya generado'}});await draftOutbox.reject(jobId);
  const result=await runOnce({server,token:'token',draftOutbox,...opts,handlers:{'technical-plan.generate-batch':async()=>{executions++;assert.equal(delivered.content,'Ya generado');return {};}}});
  assert.equal(result.state,'succeeded');assert.equal(delivered.lease,'new-lease');assert.equal(executions,1);assert.deepEqual(await draftOutbox.list(),[]);
 });}finally{await rm(directory,{recursive:true,force:true});}
});

test('no genera ni descarta la etapa conservada si el servidor rechaza recuperarla',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-recovery-conflict-')),jobId='12345678-1234-4234-8234-123456789abc';let executions=0,completions=0;
 try{await fixture((req,res)=>{
  if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,id:jobId,kind:'technical-plan.generate-batch'},lease:'new-lease'});
  if(req.url.endsWith('/renew'))return respond(res);
  if(req.url.endsWith('/complete')){completions++;return respond(res);}
  if(req.url.endsWith('/technical-batch/plan'))return respond(res,{},409);
 },async server=>{
  const draftOutbox=createOutbox({directory,server,runnerId:'fixture',token:'token'});await draftOutbox.save(jobId,{lease:'old',status:'technical-plan',result:{plans:{plans:[{id:'a'}]}}});await draftOutbox.reject(jobId);
  await assert.rejects(runOnce({server,token:'token',draftOutbox,...opts,handlers:{'technical-plan.generate-batch':async()=>{executions++;return {};}}}),{code:'OUTBOX_CONFLICT'});
  assert.equal(executions,0);assert.equal(completions,0);assert.equal((await draftOutbox.list())[0].state,'rejected');
 });}finally{await rm(directory,{recursive:true,force:true});}
});

test('reintenta entregar el mismo resultado tras errores temporales sin ejecutar la tarea otra vez', async () => {
  let calls = 0, executions = 0; const payloads = [];
  await fixture((req, res, body) => {
    if (req.url.endsWith('/claim')) return respond(res, claim);
    if (req.url.endsWith('/renew')) return respond(res);
    if (req.url.endsWith('/complete')) { calls++; payloads.push(body); return calls < 3 ? respond(res, { error: 'unavailable' }, 503) : respond(res); }
  }, async server => {
    const result = await runOnce({ server, token: 'token', ...opts, handlers: { test: async () => { executions++; return { text: 'resultado token' }; } } });
    assert.equal(result.state, 'succeeded'); assert.equal(executions, 1); assert.equal(calls, 3); assert.deepEqual(payloads[0], payloads[2]); assert.equal(payloads[0].result.text, 'resultado [redactado]');
  });
});

test('recupera una confirmación perdida aunque la renovación posterior diga que el trabajo ya terminó', async () => {
  let completions = 0, renewals = 0; const payloads = [];
  await fixture((req, res, body) => {
    if (req.url.endsWith('/claim')) return respond(res, claim);
    if (req.url.endsWith('/renew')) { renewals++; return respond(res, { error: 'lease_conflict' }, 409); }
    if (req.url.endsWith('/complete')) { completions++; payloads.push(body); if (completions === 1) return res.socket.destroy(); return respond(res); }
  }, async server => {
    const result = await runOnce({ server, token: 'token', ...opts, retryDelayMs: 70, handlers: { test: async () => ({ text: 'ok' }) } });
    assert.equal(result.state, 'succeeded'); assert.ok(completions >= 2); assert.ok(renewals >= 1); assert.ok(payloads.every(payload => JSON.stringify(payload) === JSON.stringify(payloads[0])));
  });
});

test('tolera un fallo transitorio de renovación durante el trabajo', async () => {
  let renewals = 0, aborted = false;
  await fixture((req, res) => {
    if (req.url.endsWith('/claim')) return respond(res, claim);
    if (req.url.endsWith('/renew')) { renewals++; return renewals === 1 ? respond(res, { error: 'unavailable' }, 503) : respond(res); }
    if (req.url.endsWith('/complete')) return respond(res);
  }, async server => {
    const result = await runOnce({ server, token: 'token', ...opts, handlers: { test: async (_payload, context) => { context.signal.addEventListener('abort', () => { aborted = true; }); await delay(120); return { text: 'ok' }; } } });
    assert.equal(result.state, 'succeeded'); assert.ok(renewals >= 2); assert.equal(aborted, false);
  });
});

test('cancela la ejecución si el servidor rechaza definitivamente la concesión', async () => {
  let completed = false;
  await fixture((req, res) => {
    if (req.url.endsWith('/claim')) return respond(res, claim);
    if (req.url.endsWith('/renew')) return respond(res, { error: 'lease_conflict' }, 409);
    if (req.url.endsWith('/complete')) { completed = true; return respond(res); }
  }, async server => {
    await assert.rejects(runOnce({ server, token: 'token', ...opts, handlers: { test: async (_payload, context) => { await new Promise(resolve => context.signal.addEventListener('abort', resolve, { once: true })); throw Error('cancelado'); } } }), /409/);
    assert.equal(completed, false);
  });
});

test('interrumpe el agente si la red impide renovar antes del vencimiento seguro', async () => {
  let completions = 0;
  await fixture((req, res) => {
    if (req.url.endsWith('/claim')) return respond(res, { ...claim, leaseDurationMs: 150 });
    if (req.url.endsWith('/renew')) return respond(res, { error: 'unavailable' }, 503);
    if (req.url.endsWith('/complete')) { completions++; return respond(res); }
  }, async server => {
    await assert.rejects(runOnce({ server, token: 'token', ...opts, handlers: { test: async (_payload, context) => { await new Promise(resolve => context.signal.addEventListener('abort', resolve, { once: true })); throw Error('cancelado'); } } }), /renovar/);
    assert.equal(completions, 0);
  });
});

test('detiene la entrega ante un rechazo definitivo y limita reintentos temporales', async () => {
  for (const status of [409, 503]) {
    let attempts = 0;
    await fixture((req, res) => {
      if (req.url.endsWith('/claim')) return respond(res, claim);
      if (req.url.endsWith('/renew')) return respond(res);
      if (req.url.endsWith('/complete')) { attempts++; return respond(res, { error: 'failure' }, status); }
    }, async server => {
      await assert.rejects(runOnce({ server, token: 'token', ...opts, deliveryTimeoutMs: 60, handlers: { test: async () => ({ text: 'ok' }) } }), new RegExp(String(status)));
      if (status === 409) assert.equal(attempts, 1); else assert.ok(attempts > 1);
    });
  }
});

test('conserva un resultado cifrado tras una desconexión y lo reenvía al reiniciar', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'savia-delivery-'));
  const jobId = '12345678-1234-4234-8234-123456789abc';
  let unavailable = true, executions = 0, saved;
  try {
    await fixture((req, res, body) => {
      if (req.url.endsWith('/claim')) return respond(res, { ...claim, job: { ...claim.job, id: jobId } });
      if (req.url.endsWith('/renew')) return respond(res);
      if (req.url.endsWith('/complete')) { if (unavailable) return respond(res, { error: 'offline' }, 503); saved = body; return respond(res); }
    }, async server => {
      const config = { directory, server, token: 'token', runnerId: 'fixture' };
      const outbox = createOutbox(config);
      await assert.rejects(runOnce({ server, token: 'token', ...opts, deliveryTimeoutMs: 0, outbox, handlers: { test: async () => { executions++; return { text: 'token contenido' }; } } }), /503/);
      assert.equal((await outbox.list()).length, 1);
      unavailable = false;
      const recovered = await recoverPending({ server, token: 'token', outbox: createOutbox(config), requestTimeoutMs: 200 });
      assert.equal(recovered.delivered, 1); assert.equal(recovered.rejected.length, 0);
      assert.equal(executions, 1); assert.equal(saved.result.text, '[redactado] contenido');
      assert.deepEqual(await outbox.list(), []);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('conserva aparte los resultados de concesiones rechazadas sin volver a ejecutar', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'savia-delivery-'));
  const jobId = '12345678-1234-4234-8234-123456789abc';
  try {
    await fixture((_req, res) => respond(res, { error: 'lease_conflict' }, 409), async server => {
      const outbox = createOutbox({ directory, server, token: 'token', runnerId: 'fixture' });
      await outbox.save(jobId, { lease: 'old', status: 'succeeded', result: { text: 'resultado' } });
      const recovered = await recoverPending({ server, token: 'token', outbox });
      assert.deepEqual(recovered.rejected, [jobId]); assert.equal(recovered.delivered, 0);
      assert.deepEqual((await outbox.list()).map(item => item.state), ['rejected']);
      assert.equal((await outbox.read(jobId, 'rejected')).result.text, 'resultado');
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('conserva el resultado si el agente termina justo después de perder la concesión', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'savia-delivery-'));
  const jobId = '12345678-1234-4234-8234-123456789abc';
  try {
    await fixture((req, res) => {
      if (req.url.endsWith('/claim')) return respond(res, { ...claim, job: { ...claim.job, id: jobId } });
      if (req.url.endsWith('/renew')) return respond(res, { error: 'lease_conflict' }, 409);
      return respond(res, { error: 'lease_conflict' }, 409);
    }, async server => {
      const outbox = createOutbox({ directory, server, token: 'token', runnerId: 'fixture' });
      await assert.rejects(runOnce({ server, token: 'token', outbox, ...opts, handlers: { test: async (_payload, context) => { await new Promise(resolve => context.signal.addEventListener('abort', resolve, { once: true })); return { text: 'trabajo terminado' }; } } }), /409/);
      assert.equal((await outbox.read(jobId, 'rejected')).result.text, 'trabajo terminado');
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('una copia dañada detiene la recuperación y no se confunde con un error de red', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'savia-delivery-'));
  const jobId = '12345678-1234-4234-8234-123456789abc';
  let calls = 0;
  try {
    await fixture((_req, res) => { calls++; respond(res); }, async server => {
      const outbox = createOutbox({ directory, server, token: 'token', runnerId: 'fixture' });
      await outbox.save(jobId, { lease: 'old', status: 'succeeded', result: { text: 'resultado' } });
      await writeFile(join(directory, `${jobId}.json`), 'invalid');
      await assert.rejects(recoverPending({ server, token: 'token', outbox }), { code: 'OUTBOX_UNREADABLE' });
      assert.equal(calls, 0); assert.equal((await outbox.list())[0].state, 'pending');
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('espera la respuesta explícita, renueva la concesión y reintenta la pregunta sin filtrar secretos', async () => {
  let attempts = 0, polls = 0, renewals = 0, sent;
  await fixture((req, res, body) => {
    if (req.url.endsWith('/claim')) return respond(res, claim);
    if (req.url.endsWith('/renew')) { renewals++; return respond(res); }
    if (req.url.endsWith('/credential')) return respond(res, { credential: { secret: 'provider-secret' } });
    if (req.url.endsWith('/questions')) { attempts++; sent = body; return attempts === 1 ? respond(res, {}, 503) : respond(res, { question: { id: 'q1', state: 'pending' } }); }
    if (req.url.endsWith('/questions/q1')) { polls++; return respond(res, { question: polls < 3 ? { state: 'pending' } : { state: 'answered', response: { answer: 'Sí', selected_option: 'Sí', is_custom: false } } }); }
    if (req.url.endsWith('/complete')) return respond(res);
  }, async server => {
    const result = await runOnce({ server, token: 'token', ...opts, questionPollMs: 30, handlers: { test: async (_, ctx) => {
      await ctx.getCredential();
      const answer = await ctx.askUser({ tool_call_id: 'call-1', question: 'Clave provider-secret token', options: [{ label: 'Sí', custom: false }, { label: 'No', custom: false }] });
      assert.equal(answer.answer, 'Sí'); return {};
    } } });
    assert.equal(result.state, 'succeeded'); assert.equal(attempts, 2); assert.ok(renewals >= 1); assert.equal(sent.question, 'Clave [redactado] [redactado]'); assert.equal(sent.toolCallId, 'call-1');
  });
});

test('cancela la espera de una pregunta si se pierde la concesión', async () => {
  let polled = false;
  await fixture((req, res) => {
    if (req.url.endsWith('/claim')) return respond(res, claim);
    if (req.url.endsWith('/renew')) return respond(res, {}, 409);
    if (req.url.endsWith('/questions')) return respond(res, { question: { id: 'q', state: 'pending' } });
    if (req.url.endsWith('/questions/q')) { polled = true; return respond(res, { question: { id: 'q', state: 'pending' } }); }
  }, async server => {
    await assert.rejects(runOnce({ server, token: 'token', ...opts, questionPollMs: 5, handlers: { test: (_, ctx) => ctx.askUser({ tool_call_id: 'call', question: '¿Continuar?', options: [{ label: 'Sí', custom: false }, { label: 'No', custom: false }] }) } }), /409/);
    assert.equal(polled, true);
  });
});

test('el runner obtiene y comprueba la captura de oportunidades con su concesión',async()=>{
 const paths=[];
 await fixture((req,res,body)=>{if(req.url.endsWith('/claim'))return respond(res,claim);if(req.url.endsWith('/renew'))return respond(res);if(req.url.includes('/opportunity-context')){paths.push([req.url,body.lease]);return respond(res,req.url.includes('?check=1')?{ok:true}:{profile:{industry:'Software'},shortlist:[]});}if(req.url.endsWith('/complete'))return respond(res);},async server=>{
  const result=await runOnce({server,token:'token',...opts,handlers:{test:async(_,ctx)=>{const sources=await ctx.getOpportunitySources();assert.equal(sources.profile.industry,'Software');await ctx.assertOpportunitySources();return {ok:true};}}});assert.equal(result.state,'succeeded');
 });
 assert.deepEqual(paths,[['/api/runner/jobs/job/opportunity-context','fixture-lease'],['/api/runner/jobs/job/opportunity-context?check=1','fixture-lease']]);
});
test('recupera cifrada una propuesta de extensión al reanudar con una nueva concesión',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-word-resume-')),jobId='12345678-1234-4234-8234-123456789abc';let received;
 try{await fixture((req,res,body)=>{if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,id:jobId,kind:'technical-plan.generate-batch'},lease:'new-lease'});if(req.url.endsWith('/renew')||req.url.endsWith('/complete'))return respond(res);if(req.url.endsWith('/technical-batch/word-adjustment/node')){received=body;return respond(res);}},async server=>{
  const draftOutbox=createOutbox({directory,server,runnerId:'fixture',token:'token'}),adjustment={nodeId:'node',targetWords:800,content:'Propuesta'};await draftOutbox.save(jobId,{lease:'old',status:'technical-word-adjustment',result:adjustment});await draftOutbox.reject(jobId);
  const outcome=await runOnce({server,token:'token',draftOutbox,...opts,handlers:{'technical-plan.generate-batch':async()=>{assert.deepEqual(received,{lease:'new-lease',targetWords:800,content:'Propuesta'});return {};}}});assert.equal(outcome.state,'succeeded');assert.deepEqual(await draftOutbox.list(),[]);
 });}finally{await rm(directory,{recursive:true,force:true});}
});
test('reenvía el plan de extensión cifrado al reanudar el lote',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-word-plan-')),jobId='12345678-1234-4234-8234-123456789abc';let received;
 try{await fixture((req,res,body)=>{if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,id:jobId,kind:'technical-plan.generate-batch'},lease:'new-lease'});if(req.url.endsWith('/renew')||req.url.endsWith('/complete'))return respond(res);if(req.url.endsWith('/technical-batch/word-plan')){received=body;return respond(res);}},async server=>{
 const draftOutbox=createOutbox({directory,server,runnerId:'fixture',token:'token'});await draftOutbox.save(jobId,{lease:'old',status:'technical-word-plan',result:{plan:null}});await draftOutbox.reject(jobId);const outcome=await runOnce({server,token:'token',draftOutbox,...opts,handlers:{'technical-plan.generate-batch':async()=>{assert.deepEqual(received,{lease:'new-lease',plan:null});return {};}}});assert.equal(outcome.state,'succeeded');
 });}finally{await rm(directory,{recursive:true,force:true});}
});
test('solicita la versión de coherencia de cada capítulo al revisar',async()=>{let received;await fixture((req,res,body)=>{if(req.url.endsWith('/claim'))return respond(res,claim);if(req.url.endsWith('/renew')||req.url.endsWith('/complete'))return respond(res);if(req.url.endsWith('/technical-batch/section/node')){received=body;return respond(res,{section:{id:'node',title:'A',content:'Ajustado',reference:false}});}},async server=>{const outcome=await runOnce({server,token:'token',...opts,handlers:{test:async(_payload,context)=>{const result=await context.getTechnicalBatchSection('node','consistency');assert.equal(result.content,'Ajustado');return {};}}});assert.equal(outcome.state,'succeeded');assert.equal(received.stage,'consistency');});});

test('conserva consumo parcial de cada intento de viabilidad en éxito y error',async()=>{
 for(const fail of [false,true]){let completed;
  await fixture((req,res,body)=>{if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,kind:'feasibility.analyze',credentialId:'cred'}});if(req.url.endsWith('/complete')){completed=body;return respond(res);}return respond(res);},async server=>{
   const outcome=await runOnce({server,token:'token',...opts,handlers:{'feasibility.analyze':async(_payload,context)=>{context.reportUsage({input:10,output:5,cacheRead:2,cacheWrite:0,totalTokens:17});context.reportUsage({input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0});if(fail)throw Error('contenido privado');return {content:'ok'};}}});
   assert.equal(outcome.state,fail?'failed':'succeeded');assert.deepEqual(completed.result.usage,{input:10,output:5,cacheRead:2,cacheWrite:0,reportedCalls:1,unreportedCalls:1});if(fail)assert.doesNotMatch(completed.result.message,/contenido privado/);
  });
 }
});

test('advierte y entrega el resultado si excede la capacidad recuperable local',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-outbox-large-')),jobId='12345678-1234-4234-8234-123456789abc';let received,warnings=[];
 try{await fixture((req,res,body)=>{if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,id:jobId}});if(req.url.endsWith('/complete')){received=body;return respond(res);}return respond(res);},async server=>{
  const outbox=createOutbox({directory:dir,server,token:'token',runnerId:'fixture'});
  const result=await runOnce({server,token:'token',outbox,...opts,requestTimeoutMs:2000,onWarning:message=>warnings.push(message),handlers:{test:async()=>({text:'ñ'.repeat(2500000)})}});
  assert.equal(result.state,'succeeded');assert.equal(received.result.text.length,2500000);assert.equal(warnings.length,1);assert.deepEqual(await outbox.list(),[]);
 });}finally{await rm(dir,{recursive:true,force:true});}
});

test('detiene la etapa técnica demasiado grande antes de enviarla sin crear copia ilegible',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-large-draft-')),jobId='12345678-1234-4234-8234-123456789abc';let stageRequests=0,completions=0;
 try{await fixture((req,res)=>{if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,id:jobId}});if(req.url.endsWith('/technical-batch/drafts/node'))stageRequests++;if(req.url.endsWith('/complete'))completions++;return respond(res);},async server=>{
  const draftOutbox=createOutbox({directory,server,token:'token',runnerId:'fixture'});
  await assert.rejects(runOnce({server,token:'token',draftOutbox,...opts,handlers:{test:async(_payload,context)=>{await context.saveTechnicalBatchDraft('node','ñ'.repeat(2500000));return {};}}}),{code:'OUTBOX_UNAVAILABLE'});
  assert.equal(stageRequests,0);assert.equal(completions,0);assert.deepEqual(await draftOutbox.list(),[]);
 });}finally{await rm(directory,{recursive:true,force:true});}
});

test('entrega el documento por flujo bajo la concesión sin consumir su cuerpo anticipadamente',async()=>{
 let authorized=false;
 await fixture((req,res,body)=>{
  if(req.url.endsWith('/claim'))return respond(res,claim);
  if(req.url.endsWith('/renew')||req.url.endsWith('/complete'))return respond(res);
  if(req.url.endsWith('/files/file')){authorized=req.headers.authorization==='Bearer token'&&body.lease===claim.lease;res.writeHead(200,{'content-type':'application/pdf','x-savia-file-name':encodeURIComponent('pliego.pdf')});res.write('%PDF-');setTimeout(()=>res.end('prueba'),20);}
 },async server=>{
  const result=await runOnce({server,token:'token',...opts,handlers:{test:async(_payload,context)=>{const file=await context.getFileStream('file');assert.equal(file.name,'pliego.pdf');assert.equal(file.contentType,'application/pdf');assert.ok(file.body instanceof ReadableStream);assert.equal(await new Response(file.body).text(),'%PDF-prueba');return {};}}});assert.equal(result.state,'succeeded');assert.equal(authorized,true);
 });
});

test('interrumpe una descarga por flujo si se pierde la concesión',async()=>{
 let requested=false;
 await fixture((req,res)=>{
  if(req.url.endsWith('/claim'))return respond(res,claim);
  if(req.url.endsWith('/renew'))return respond(res,{},409);
  if(req.url.endsWith('/files/file')){requested=true;res.writeHead(200,{'content-type':'application/pdf','x-savia-file-name':'pliego.pdf'});res.write('%PDF-');}
 },async server=>{
  await assert.rejects(runOnce({server,token:'token',...opts,handlers:{test:async(_payload,context)=>{const file=await context.getFileStream('file');await new Response(file.body).arrayBuffer();return {};}}}),/409/);assert.equal(requested,true);
 });
});

test('conserva la copia cifrada hasta confirmar el resultado y la retira después',async()=>{
 const calls=[];await fixture((req,res)=>{if(req.url.endsWith('/claim'))return respond(res,claim);if(req.url.endsWith('/renew'))return respond(res);if(req.url.endsWith('/complete')){calls.push('complete');return respond(res);}},async server=>{const artifactOutbox={save:async()=>calls.push('save'),remove:async()=>calls.push('remove')};const result=await runOnce({server,token:'token',...opts,artifactOutbox,uploadLargeArtifactFn:async()=>{calls.push('upload');return {id:'artifact'};},handlers:{test:async(_payload,context)=>{const artifact=await context.uploadArtifactFile('/tmp/file');return {artifactId:artifact.id};}}});assert.equal(result.state,'succeeded');assert.deepEqual(calls,['save','upload','complete','remove']);});
});
test('conserva la copia cifrada si falla la entrega',async()=>{
 const calls=[];await fixture((req,res)=>{if(req.url.endsWith('/claim'))return respond(res,claim);if(req.url.endsWith('/renew'))return respond(res);if(req.url.endsWith('/complete')){calls.push('complete');return respond(res);}},async server=>{const artifactOutbox={save:async()=>calls.push('save'),remove:async()=>calls.push('remove')};await assert.rejects(runOnce({server,token:'token',...opts,artifactOutbox,uploadLargeArtifactFn:async()=>{throw Error('offline');},handlers:{test:async(_payload,context)=>context.uploadArtifactFile('/tmp/file')}}),{code:'OUTBOX_ARTIFACT_PENDING'});assert.deepEqual(calls,['save']);});
});

test('retira la copia cifrada al recuperar la confirmación de una tarea terminada',async()=>{
 const calls=[],outbox={list:async()=>[{jobId:'job',state:'pending'}],read:async()=>({lease:'lease',status:'succeeded',result:{}}),remove:async()=>calls.push('result')},artifactOutbox={remove:async()=>calls.push('artifact')};await fixture((_req,res)=>respond(res),async server=>{const recovered=await recoverPending({server,token:'token',outbox,artifactOutbox});assert.equal(recovered.delivered,1);assert.deepEqual(calls,['artifact','result']);});
});

test('una entrega interrumpida deja una copia cifrada exportable con la configuración original',async()=>{
 const {createArtifactOutbox}=await import('../artifact-outbox.mjs'),{readFile}=await import('node:fs/promises'),dir=await mkdtemp(join(tmpdir(),'savia-artifact-recovery-')),jobId='12345678-1234-4234-8234-123456789abc',path=join(dir,'fixed.docx'),destination=join(dir,'recovered.docx');try{await writeFile(path,'documento privado');await fixture((req,res)=>{if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,id:jobId}});if(req.url.endsWith('/renew'))return respond(res);},async server=>{const options={directory:join(dir,'outbox'),server,runnerId:'runner',token:'token'},artifactOutbox=createArtifactOutbox(options);await assert.rejects(runOnce({server,token:'token',...opts,artifactOutbox,uploadLargeArtifactFn:async()=>{throw Error('offline');},handlers:{test:async(_payload,context)=>context.uploadArtifactFile(path)}}),{code:'OUTBOX_ARTIFACT_PENDING'});assert.equal((await artifactOutbox.list()).length,1);assert.equal((await readFile(join(options.directory,`${jobId}.bin`))).includes(Buffer.from('documento privado')),false);await createArtifactOutbox(options).export(jobId,destination);assert.equal(await readFile(destination,'utf8'),'documento privado');});}finally{await rm(dir,{recursive:true,force:true});}
});

test('recupera una copia cifrada con su informe sin repetir la corrección', async () => {
  const directory=await mkdtemp(join(tmpdir(),'savia-artifact-recovery-')),jobId='12345678-1234-4234-8234-123456789abc';let completions=[];
  try { await fixture((req,res,body)=>{
    if(req.url.endsWith('/renew'))return respond(res);
    if(req.url.endsWith('/repair-report'))return respond(res,{report:{id:'report-1'}});
    if(req.url.endsWith('/complete')){completions.push(body);return respond(res);}
  },async server=>{
    const {createArtifactOutbox}=await import('../artifact-outbox.mjs');
    const config={server,runnerId:'fixture',token:'token'},artifactOutbox=createArtifactOutbox({...config,directory:join(directory,'artifacts')}),artifactMetaOutbox=createOutbox({...config,directory:join(directory,'meta')}),outbox=createOutbox({...config,directory:join(directory,'outbox')});
    const path=join(directory,'original.docx');await writeFile(path,'documento privado');await artifactOutbox.save(jobId,path);
    await artifactMetaOutbox.save(jobId,{lease:'lease',status:'artifact-pending',result:{report:{notes:['privado']},resultBase:{inspectionJobId:'inspection'}}});
    const {recoverArtifactPending}=await import(process.env.SAVIA_TEST_RUNNER_WORK_LOOP || new URL('../work-loop.mjs',import.meta.url));
    const result=await recoverArtifactPending({server,token:'token',artifactOutbox,artifactMetaOutbox,outbox,uploadLargeArtifactFn:async({path})=>{assert.equal(await (await import('node:fs/promises')).readFile(path,'utf8'),'documento privado');return {id:'artifact-1'};}});
    assert.equal(result.delivered,1);assert.equal(completions[0].result.artifactId,'artifact-1');assert.equal(completions[0].result.reportId,'report-1');assert.deepEqual(await artifactOutbox.list(),[]);assert.deepEqual(await artifactMetaOutbox.list(),[]);
  }); } finally {await rm(directory,{recursive:true,force:true});}
});

test('conserva la copia cuando la concesión anterior ha vencido', async () => {
 const directory=await mkdtemp(join(tmpdir(),'savia-artifact-expired-')),jobId='12345678-1234-4234-8234-123456789abc';
 try{await fixture((req,res)=>respond(res,{},409),async server=>{
  const {createArtifactOutbox}=await import('../artifact-outbox.mjs'),config={server,runnerId:'fixture',token:'token'},artifactOutbox=createArtifactOutbox({...config,directory:join(directory,'artifacts')}),artifactMetaOutbox=createOutbox({...config,directory:join(directory,'meta')}),outbox=createOutbox({...config,directory:join(directory,'outbox')});
  const path=join(directory,'original');await writeFile(path,'copia');await artifactOutbox.save(jobId,path);await artifactMetaOutbox.save(jobId,{lease:'old',status:'artifact-pending',result:{report:null,resultBase:{}}});
  const {recoverArtifactPending}=await import(process.env.SAVIA_TEST_RUNNER_WORK_LOOP || new URL('../work-loop.mjs',import.meta.url));const result=await recoverArtifactPending({server,token:'token',artifactOutbox,artifactMetaOutbox,outbox});
  assert.deepEqual(result.rejected,[jobId]);assert.equal((await artifactOutbox.list()).length,1);assert.equal((await artifactMetaOutbox.list())[0].state,'rejected');
 });}finally{await rm(directory,{recursive:true,force:true});}
});

test('guarda informe y resultado cifrados antes de interrumpir una carga de copia', async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-artifact-save-')),jobId='12345678-1234-4234-8234-123456789abc';
 try{await fixture((req,res)=>{if(req.url.endsWith('/claim'))return respond(res,{...claim,job:{...claim.job,id:jobId}});if(req.url.endsWith('/renew'))return respond(res);},async server=>{
  const {createArtifactOutbox}=await import('../artifact-outbox.mjs'),config={server,runnerId:'fixture',token:'token'},artifactOutbox=createArtifactOutbox({...config,directory:join(directory,'artifacts')}),artifactMetaOutbox=createOutbox({...config,directory:join(directory,'meta')});const path=join(directory,'source');await writeFile(path,'documento');
  await assert.rejects(runOnce({server,token:'token',artifactOutbox,artifactMetaOutbox,...opts,uploadLargeArtifactFn:async()=>{throw new Error('offline');},handlers:{test:async(_,context)=>context.uploadArtifactFile(path,{report:{notes:['privado']},resultBase:{inspectionJobId:'x'}})}}),{code:'OUTBOX_ARTIFACT_PENDING'});
  assert.equal((await artifactMetaOutbox.read(jobId,'pending')).result.report.notes[0],'privado');assert.equal((await artifactOutbox.list()).length,1);assert.doesNotMatch(await (await import('node:fs/promises')).readFile(join(directory,'meta',`${jobId}.json`),'utf8'),/privado/);
 });}finally{await rm(directory,{recursive:true,force:true});}
});

test('interrumpe la recuperación si se pierde la concesión durante la carga',{timeout:10000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'savia-artifact-renew-')),jobId='12345678-1234-4234-8234-123456789abc';let renewals=0,completions=0,markUploadStarted;const uploadStarted=new Promise(resolve=>{markUploadStarted=resolve;});
 try{await fixture(async(req,res)=>{if(req.url.endsWith('/renew')){if(++renewals===1)return respond(res);await uploadStarted;return respond(res,{},409);}if(req.url.endsWith('/complete')){completions++;return respond(res);}},async server=>{
  const {createArtifactOutbox}=await import('../artifact-outbox.mjs'),config={server,runnerId:'fixture',token:'token'},artifactOutbox=createArtifactOutbox({...config,directory:join(directory,'artifacts')}),artifactMetaOutbox=createOutbox({...config,directory:join(directory,'meta')}),outbox=createOutbox({...config,directory:join(directory,'outbox')});const path=join(directory,'original');await writeFile(path,'copia');await artifactOutbox.save(jobId,path);await artifactMetaOutbox.save(jobId,{lease:'old',status:'artifact-pending',result:{report:null,resultBase:{}}});
  const {recoverArtifactPending}=await import(process.env.SAVIA_TEST_RUNNER_WORK_LOOP || new URL('../work-loop.mjs',import.meta.url));await assert.rejects(recoverArtifactPending({server,token:'token',artifactOutbox,artifactMetaOutbox,outbox,renewIntervalMs:10,uploadLargeArtifactFn:async({signal})=>{markUploadStarted();await delay(1000,undefined,{signal});return {id:'never'};}}));
  assert.equal(completions,0);assert.equal((await artifactOutbox.list()).length,1);assert.equal((await artifactMetaOutbox.list()).length,1);
 });}finally{await rm(directory,{recursive:true,force:true});}
});

test('console preserves tool output in ordered chunks and redacts secrets before splitting',async()=>{
 const seen=[];
 await fixture((req,res)=>{if(req.url.endsWith('/claim'))return respond(res,claim);return respond(res);},async server=>{
  const result=await runOnce({server,token:'private-runner-token',...opts,onActivity:event=>seen.push(event),handlers:{test:async(_,context)=>{context.reportConsole({event:'tool.end',tool:'read',apiKey:'private-key',text:'x'.repeat(7990)+'private-runner-token'+'y'.repeat(9000)});return {ok:true};}}});
  assert.equal(result.state,'succeeded');
 });
 const entries=seen.filter(e=>e.code==='agent.console');assert.ok(entries.length>1);
 const text=entries.map(e=>e.details.text).join('');assert.equal(text.includes('private-runner-token'),false);assert.equal(text.includes('private-key'),false);assert.match(text,/redactado/);assert.ok(text.includes('y'.repeat(9000)));assert.equal(entries[0].details.part,1);
});

test('usa el modelo elegido en la web con la clave local del conector', async () => {
 let seen, completion;
 await fixture((req,res,body)=>{
  if(req.url.endsWith('/claim')) return respond(res,{...claim,localModel:'glm-5.1',job:{...claim.job,kind:'tender-chat.send',payload:{localRunner:true}}});
  if(req.url.endsWith('/complete')) { completion=body; return respond(res); }
  if(req.url.endsWith('/renew')) return respond(res);
 },async server=>{
  const result=await runOnce({server,token:'token',...opts,localCredentialLoader:async()=>({provider:'opencode-go',model:'muse-spark-1.3-contributor',secret:'local-only'}),handlers:{'tender-chat.send':async(_payload,context)=>{seen=await context.getCredential();return {answer:'Respuesta'};}}});
  assert.equal(result.state,'succeeded');
  assert.deepEqual(seen,{provider:'opencode-go',model:'glm-5.1',secret:'local-only'});
  assert.equal(completion.result.model,'glm-5.1');
  assert.ok(!JSON.stringify(completion).includes('local-only'));
 });
});

test('reintenta descargas y contexto ante errores 500 transitorios sin fallar en 404', async () => {
 let fileCalls = 0;
 let missingCalls = 0;
 await fixture((req, res) => {
  if (req.url.endsWith('/claim')) return respond(res, claim);
  if (req.url.endsWith('/renew') || req.url.endsWith('/complete')) return respond(res);
  if (req.url.endsWith('/files/file')) {
   fileCalls++;
   if (fileCalls === 1) return respond(res, { error: 'internal_error' }, 500);
   res.writeHead(200, { 'content-type': 'text/plain' });
   res.end('ok-after-retry');
   return;
  }
  if (req.url.endsWith('/files/missing')) {
   missingCalls++;
   return respond(res, { error: 'not_found' }, 404);
  }
 }, async server => {
  const result = await runOnce({
   server,
   token: 'token',
   ...opts,
   handlers: {
    test: async (_payload, context) => {
     const data = await context.getFile('file');
     assert.equal(Buffer.from(data).toString('utf8'), 'ok-after-retry');
     await assert.rejects(context.getFile('missing'), /404/);
     return { ok: true };
    },
   },
  });
  assert.equal(result.state, 'succeeded');
  assert.equal(fileCalls, 2);
  assert.equal(missingCalls, 1);
 });
});
