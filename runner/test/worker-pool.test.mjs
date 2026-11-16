import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runWorkerPool} from '../worker-pool.mjs';
test('limits concurrent jobs and does not interrupt jobs when the limit is lowered',async()=>{
 const abort=new AbortController(),gates=[],states=[];let limit=2,active=0,peak=0;
 const pool=runWorkerPool({signal:abort.signal,intervalMs:5,refreshMs:5,getLimit:async()=>limit,recover:async()=>{},run:async()=>{active++;peak=Math.max(peak,active);return new Promise(resolve=>gates.push(()=>{active--;resolve({state:'succeeded'});}));},onOutcome:result=>states.push(result.state)});
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal(gates.length,2);assert.equal(peak,2);
 limit=1;await new Promise(resolve=>setTimeout(resolve,15));gates.shift()();await new Promise(resolve=>setTimeout(resolve,15));assert.equal(gates.length,1);
 abort.abort();gates.shift()();await pool;assert.equal(active,0);assert.equal(states.length,2);
});
test('does not recover outboxes while another task is running',async()=>{
 const abort=new AbortController();let active=0,recoveryDuringTask=false,release;const gate=new Promise(resolve=>release=resolve);
 const pool=runWorkerPool({signal:abort.signal,intervalMs:5,refreshMs:5,getLimit:async()=>2,recover:async()=>{if(active)recoveryDuringTask=true;},run:async()=>{active++;await gate;active--;return {state:'idle',pollAfterMs:10000};}});
 await new Promise(resolve=>setTimeout(resolve,25));abort.abort();release();await pool;assert.equal(recoveryDuringTask,false);
});
test('pauses new claims after a recoverable outbox error until active tasks finish',async()=>{
 const abort=new AbortController();let calls=0,recoveries=0,release;const gate=new Promise(resolve=>{release=resolve;});
 const pool=runWorkerPool({signal:abort.signal,intervalMs:5,refreshMs:5,intervalOverride:5,getLimit:async()=>2,recover:async()=>{recoveries++;},run:async()=>{calls++;if(calls===1){await gate;return {state:'succeeded'};}if(calls===2)throw Object.assign(new Error('pending'),{code:'OUTBOX_DRAFT_PENDING'});abort.abort();return {state:'idle'};}});
 await new Promise(resolve=>setTimeout(resolve,40));assert.equal(calls,2);release();await pool;assert.ok(recoveries>=2);assert.ok(calls>=3&&calls<=4);
});
test('claims and completes two different jobs in parallel without mixing their events',{timeout:15000},async()=>{
 const {createServer}=await import('node:http'),{Worker}=await import('node:worker_threads');
 const abort=new AbortController(),completed=[],events=[],barriers=[];let claims=0;
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const input=body?JSON.parse(body):{};res.setHeader('content-type','application/json');
  if(req.url==='/api/runner/jobs/claim'){const n=++claims;res.end(JSON.stringify(n<=2?{job:{id:`job-${n}`,projectId:'p',kind:'fixture',payload:{n}},lease:`lease-${n}`,leaseDurationMs:60000}:{job:null,pollAfterMs:10000}));return;}
  if(req.url==='/barrier'){barriers.push(res);if(barriers.length===2)for(const pending of barriers)pending.end('{}');return;}
  if(req.url?.endsWith('/complete')){completed.push({path:req.url,result:input.result});if(completed.length===2)abort.abort();}
  res.end(JSON.stringify({ok:true}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const url=`http://127.0.0.1:${server.address().port}`;await runWorkerPool({signal:abort.signal,intervalMs:5,refreshMs:5,getLimit:async()=>2,recover:async()=>{},run:()=>new Promise((resolve,reject)=>{let outcome;const worker=new Worker(new URL('./fixtures/isolated-task.mjs',import.meta.url),{workerData:{server:url},stdout:true,stderr:true});worker.on('message',message=>{if(message.event)events.push(message.event);if(message.outcome)outcome=message.outcome;});worker.once('error',reject);worker.once('exit',code=>code===0&&outcome?resolve(outcome):reject(new Error('worker failed')));})});
  assert.equal(barriers.length,2);assert.deepEqual(completed.map(x=>x.result.value).sort(),[1,2]);for(const item of completed)assert.equal(item.result.environment,`job-${item.result.value}`);
  for(const event of events.filter(x=>x.code==='agent.console'))assert.match(JSON.stringify(event.details),new RegExp(`job ${event.jobId.endsWith('1')?'1':'2'}`));
 }finally{abort.abort();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('the actual connector runs two isolated slots and delivers both results',{timeout:30000},async()=>{
 const {createServer}=await import('node:http'),{spawn}=await import('node:child_process'),{once}=await import('node:events');
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{randomUUID}=await import('node:crypto'),{fileURLToPath}=await import('node:url');
 const dir=await mkdtemp(join(tmpdir(),'savia-parallel-cli-')),queued=[1,2].map(n=>({id:randomUUID(),projectId:'p',kind:'economic-offer.calculate',payload:{draft:{items:[{name:`Item ${n}`,quantity:'1',price:String(n),rate:'0'}]}}})),completed=[],pending=[];let child,resolveFinished;
 const finished=new Promise(resolve=>resolveFinished=resolve);
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const value=body?JSON.parse(body):{};res.setHeader('content-type','application/json');
  if(req.url==='/api/runners/heartbeat'){res.end(JSON.stringify({ok:true,maxAgents:2}));return;}
  if(req.url==='/api/runner/jobs/claim'){const job=queued.shift();res.end(JSON.stringify(job?{job,lease:'a'.repeat(64),leaseDurationMs:60000}:{job:null,pollAfterMs:10000}));return;}
  if(req.url?.endsWith('/complete')){completed.push(value);pending.push(res);if(completed.length===2){for(const reply of pending)reply.end('{"ok":true}');resolveFinished();}return;}
  res.end('{"ok":true}');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const config=join(dir,'runner.json');await writeFile(config,JSON.stringify({server:`http://127.0.0.1:${server.address().port}`,runnerId:'fixture',token:'fixture-token'}));const cli=process.env.SAVIA_TEST_RUNNER_CLI||fileURLToPath(new URL('../cli.mjs',import.meta.url)),runtime=process.env.SAVIA_TEST_RUNNER_NODE||process.execPath;child=spawn(runtime,[cli,'run','--config',config,'--poll-ms','100'],{stdio:'ignore',env:{...process.env,...(process.env.SAVIA_TEST_RUNNER_NODE?{ELECTRON_RUN_AS_NODE:'1'}:{})}});await Promise.race([finished,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('No se ejecutaron las dos tareas.')),20000);timer.unref();})]);assert.deepEqual(completed.map(x=>x.status),['succeeded','succeeded']);assert.deepEqual(completed.map(x=>x.result.total).sort(),['1.00','2.00']);
 }finally{if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
