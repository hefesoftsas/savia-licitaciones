const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { ConnectorController } = require('../app/controller.cjs');
const input = { server: 'https://savia.example', name: 'Mi equipo', code: 'a'.repeat(64) };
function fixture() {
 const calls = [];
 const controller = new ConnectorController({node: '/bundled/node', cli: '/bundled/cli.mjs', config: '/perfil/连接/runner.json', cwd: '/bundled', readConfig: async () => JSON.stringify({server:input.server, runnerId:'id',token:'secret'}), spawnImpl: (node,args,options) => {
  const child = new EventEmitter();child.stdout=new EventEmitter();child.pid=100;child.signals=[];child.stdin=new EventEmitter();child.stdin.end=value=>{child.input=value;};child.kill=signal=>{child.signals.push(signal);return true;};calls.push({node,args,options,child});return child;
 }});
 return {controller,calls};
}
test('shutdown waits for pairing and cannot start a runner after pairing exits successfully',async()=>{
 const {controller,calls}=fixture();const pairing=controller.pair(input);const result=pairing.catch(error=>error.message);let finished=false;const closing=controller.shutdown().then(()=>{finished=true;});await Promise.resolve();assert.equal(finished,false);calls[0].child.emit('exit',0);await closing;assert.equal(await result,'operation_cancelled');assert.equal(calls.length,1);assert.throws(()=>controller.start(),/operation_cancelled/);
});
test('concurrent stop calls share termination and prevent a new start',async()=>{
 const {controller,calls}=fixture();await controller.initialize();controller.start();calls[0].child.emit('spawn');const first=controller.stop();const second=controller.stop();assert.deepEqual(calls[0].child.signals,['SIGTERM']);assert.throws(()=>controller.start(),/busy/);calls[0].child.emit('exit',0);await Promise.all([first,second]);assert.equal(controller.snapshot().running,false);assert.equal(controller.snapshot().error,null);assert.equal(controller.snapshot().busy,false);
});
test('detecta un runner externo y deja de mostrarlo al detenerse',async()=>{
 const {controller}=fixture(); let external=true;
 controller.readExternalStatus=async()=>external;
 await controller.initialize(); await controller.refreshExternalStatus();
 assert.equal(controller.snapshot().running,true); assert.equal(controller.snapshot().external,true);
 assert.throws(()=>controller.start(),/busy/);
 external=false; await controller.refreshExternalStatus();
 assert.equal(controller.snapshot().running,false); assert.equal(controller.snapshot().external,false);
 await controller.shutdown();
});
test('solo reconoce la señal reciente del runner de esta conexión',async()=>{
 const {mkdtemp,writeFile,rm}=require('node:fs/promises');const {tmpdir}=require('node:os');const {join}=require('node:path');
 const dir=await mkdtemp(join(tmpdir(),'savia-status-'));const {controller}=fixture();controller.config=join(dir,'runner.json');
 try { await controller.initialize(); const path=`${controller.config}.status`;
  await writeFile(path,JSON.stringify({pid:process.pid,runnerId:'id',updatedAt:Date.now()}));assert.equal(await controller.readExternalStatus(),true);
  await writeFile(path,JSON.stringify({pid:process.pid,runnerId:'other',updatedAt:Date.now()}));assert.equal(await controller.readExternalStatus(),false);
  await writeFile(path,JSON.stringify({pid:process.pid,runnerId:'id',updatedAt:Date.now()-16000}));assert.equal(await controller.readExternalStatus(),false);
 } finally { await controller.shutdown(); await rm(dir,{recursive:true,force:true}); }
});
test('spawn failure while stopping resolves without waiting for an exit that never arrives',async()=>{
 const {controller,calls}=fixture();await controller.initialize();controller.start();calls[0].child.pid=undefined;const stopped=controller.stop();calls[0].child.emit('error',new Error('ENOENT /private'));await stopped;assert.equal(controller.snapshot().running,false);assert.equal(controller.snapshot().busy,false);
});
test('pairing code is piped and never included in arguments or public state',async()=>{
 const {controller,calls}=fixture();const pairing=controller.pair(input);assert.equal(calls[0].child.input,input.code+'\n');assert.equal(JSON.stringify(calls[0].args).includes(input.code),false);calls[0].child.emit('exit',0);await pairing;calls[1].child.emit('spawn');assert.equal(controller.snapshot().running,true);assert.equal(JSON.stringify(controller.snapshot()).includes(input.code),false);const stopped=controller.stop();calls[1].child.emit('exit',0);await stopped;
});
test('saved config cannot open an arbitrary protocol and never exposes its token',async()=>{
 const {controller}=fixture();await controller.initialize();assert.equal('token' in controller.snapshot(),false);controller.readConfig=async()=>JSON.stringify({server:'file:///private',runnerId:'id',token:'secret'});controller.state.paired=false;await controller.initialize();assert.equal(controller.snapshot().paired,false);assert.equal(controller.snapshot().error,'configuration_unavailable');
});
test('stop returns a settled snapshot suitable for rendering',async()=>{
 const {controller,calls}=fixture();await controller.initialize();controller.start();calls[0].child.emit('spawn');const stopping=controller.stop();calls[0].child.emit('exit',0);const result=await stopping;assert.equal(result.busy,false);assert.equal(result.running,false);
});
test('real bundled-style child starts and exits through shutdown with a Unicode path',async()=>{
 const {mkdtemp,writeFile,rm}=require('node:fs/promises');const {tmpdir}=require('node:os');const {join}=require('node:path');
 const directory=await mkdtemp(join(tmpdir(),'savia-conector-连接-'));
 const cli=join(directory,'runner.cjs');await writeFile(cli,"setInterval(() => {}, 1000);",'utf8');
 const controller=new ConnectorController({node:process.execPath,cli,config:join(directory,'perfil.json'),cwd:directory,readConfig:async()=>JSON.stringify({server:input.server,runnerId:'id',token:'private'})});
 try{await controller.initialize();controller.start();const child=controller.child;await new Promise(resolve=>child.once('spawn',resolve));assert.equal(controller.snapshot().running,true);await controller.shutdown();assert.equal(controller.child,null);assert.equal(controller.snapshot().running,false);}finally{await controller.shutdown();await rm(directory,{recursive:true,force:true});}
});
test('pair timeout retains ownership until the child actually exits',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {controller,calls}=fixture();const result=controller.pair(input).catch(error=>error.message);t.mock.timers.tick(65000);await Promise.resolve();assert.equal(controller.snapshot().busy,true);await assert.rejects(controller.pair(input),/busy/);calls[0].child.emit('exit',null);assert.equal(await result,'pair_timeout');assert.equal(controller.pairChild,null);assert.equal(controller.snapshot().busy,false);
});
test('late exit after termination deadline releases pairing ownership for retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {controller,calls}=fixture();const result=controller.pair(input).catch(error=>error.message);t.mock.timers.tick(65000);await new Promise(setImmediate);t.mock.timers.tick(12000);assert.equal(await result,'stop_failed');assert.notEqual(controller.pairChild,null);calls[0].child.emit('exit',null);await Promise.resolve();assert.equal(controller.pairChild,null);
});
test('uses the shared Electron Node mode for both pairing and work without exposing environment',async()=>{
 const {controller,calls}=fixture();controller.env={ELECTRON_RUN_AS_NODE:'1',PRIVATE_TEST_VALUE:'not-for-ui'};
 const pairing=controller.pair(input);assert.equal(calls[0].options.env.ELECTRON_RUN_AS_NODE,'1');calls[0].child.emit('exit',0);await pairing;
 assert.equal(calls[1].options.env.ELECTRON_RUN_AS_NODE,'1');assert.equal(JSON.stringify(controller.snapshot()).includes('not-for-ui'),false);
 calls[1].child.emit('spawn');const stopping=controller.stop();calls[1].child.emit('exit',0);await stopping;
});

test('structured activity handles split lines and drops arbitrary output and extra fields',async()=>{
 const {controller,calls}=fixture();await controller.initialize();controller.start();const child=calls[0].child;child.emit('spawn');
 const event={type:'savia-activity',jobId:'job-1',code:'ocr.page',at:new Date().toISOString(),details:{document:'Pliego.pdf',page:2,totalPages:8,secret:'hidden'},secret:'hidden'};
 const line=JSON.stringify(event)+'\n';child.stdout.emit('data','not a log\n'+line.slice(0,30));assert.equal(controller.snapshot().activity?.length||0,0);child.stdout.emit('data',line.slice(30));
 assert.deepEqual(controller.snapshot().activity[0].details,{document:'Pliego.pdf',page:2,totalPages:8});assert.equal(JSON.stringify(controller.snapshot()).includes('hidden'),false);
 const stopped=controller.stop();child.emit('exit',0);await stopped;
});
