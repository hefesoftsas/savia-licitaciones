import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createOpportunityRunnerScheduler} from '../opportunity-runner-scheduler.mjs';
test('comprueba como máximo cada quince minutos, sin solapar y vuelve a intentar tras error',async()=>{
 let now=0,calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
 const scheduler=createOpportunityRunnerScheduler({clock:()=>now,send:async()=>{calls++;if(calls===1)await gate;if(calls===2)throw new Error('network');}});
 const first=scheduler.tick();await scheduler.tick();assert.equal(calls,1);release();await first;now=899999;await scheduler.tick();assert.equal(calls,1);now=900000;await scheduler.tick();assert.equal(calls,2);now=1800000;await scheduler.tick();assert.equal(calls,3);scheduler.stop();now=2700000;await scheduler.tick();assert.equal(calls,3);
});

test('al detener el runner cancela la comprobación en curso',async()=>{
 let aborted=false;const scheduler=createOpportunityRunnerScheduler({send:signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));},{once:true}))});
 const pending=scheduler.tick();scheduler.stop();await pending;assert.equal(aborted,true);
});

test('el runner continuo consulta la programación con su token cuando está libre',{timeout:30000},async()=>{
 const {createServer}=await import('node:http'),{spawn}=await import('node:child_process'),{once}=await import('node:events'),{fileURLToPath}=await import('node:url');
 const dir=await mkdtemp(join(tmpdir(),'savia-runner-due-cli-'));let child,resolveDue,resolveCleanup;
 const due=new Promise(resolve=>{resolveDue=resolve;}),cleanup=new Promise(resolve=>{resolveCleanup=resolve;}),seen=[];
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;seen.push({path:req.url,authorization:req.headers.authorization,body});res.setHeader('content-type','application/json');if(req.url==='/api/runner/jobs/claim')res.end(JSON.stringify({job:null}));else if(req.url==='/api/runner/opportunity-suggestions/due'){res.end(JSON.stringify({started:false}));resolveDue();}else if(req.url==='/api/runner/imports/cleanup'){res.end(JSON.stringify({removed:0,failed:0}));resolveCleanup();}else{res.statusCode=404;res.end('{}');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const config=join(dir,'runner.json');await writeFile(config,JSON.stringify({server:`http://127.0.0.1:${server.address().port}`,runnerId:'runner',token:'fixture-token'}));
  const cli=process.env.SAVIA_TEST_RUNNER_CLI||fileURLToPath(new URL('../cli.mjs',import.meta.url));child=spawn(process.execPath,[cli,'run','--config',config,'--poll-ms','100'],{stdio:'ignore'});
  let timer;try{await Promise.race([Promise.all([due,cleanup]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('el runner no consultó la programación')),20000);})]);}finally{clearTimeout(timer);}
  assert.ok(seen.some(item=>item.path==='/api/runner/jobs/claim'));assert.equal(seen.find(item=>item.path==='/api/runner/opportunity-suggestions/due').authorization,'Bearer fixture-token');assert.equal(seen.find(item=>item.path==='/api/runner/imports/cleanup').authorization,'Bearer fixture-token');
 }finally{if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('reduce el sondeo al estar inactivo y mantiene respuesta tras una tarea',async()=>{
 const {runnerPollDelay}=await import('../opportunity-runner-scheduler.mjs');
 assert.equal(runnerPollDelay('idle'),10000);
 assert.equal(runnerPollDelay('idle',undefined,30000),30000);
 assert.equal(runnerPollDelay('succeeded'),3000);
 assert.equal(runnerPollDelay('idle',15000),15000);
});
