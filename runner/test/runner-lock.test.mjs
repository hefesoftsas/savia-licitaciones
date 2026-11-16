import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,access,writeFile,symlink,mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const fixture=fileURLToPath(new URL('./fixtures/lock-process.mjs',import.meta.url));
function start(config){const child=spawn(process.execPath,[fixture,config],{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';const ready=new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.includes('acquired\n'))resolve(true);});child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',reject);child.on('exit',code=>resolve(code===0&&stdout.includes('acquired\n')));});return {child,ready,done:new Promise(resolve=>child.on('exit',code=>resolve({code,stdout,stderr})))};}
test('solo un proceso usa la misma configuración y otra configuración permanece independiente',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-lock-'));try{const config=join(root,'a','runner.json'),a=start(config);assert.equal(await a.ready,true);const b=start(config);assert.equal(await b.ready,false);assert.match((await b.done).stderr,/instancia|ocupad/i);const other=start(join(root,'b','runner.json'));assert.equal(await other.ready,true);other.child.stdin.write('stop');await other.done;a.child.stdin.write('stop');assert.equal((await a.done).code,0);const again=start(config);assert.equal(await again.ready,true);again.child.stdin.write('stop');await again.done;}finally{await rm(root,{recursive:true,force:true});}
});
test('recupera un bloqueo de un proceso terminado y mantiene exclusión bajo competencia',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-lock-stale-'));try{const config=join(root,'runner.json'),dead=start(config);assert.equal(await dead.ready,true);dead.child.kill('SIGKILL');await dead.done;const candidates=Array.from({length:6},()=>start(config));const results=await Promise.all(candidates.map(x=>x.ready));assert.equal(results.filter(Boolean).length,1);for(let i=0;i<candidates.length;i++)if(results[i])candidates[i].child.stdin.write('stop');await Promise.all(candidates.map(x=>x.done));await assert.rejects(access(`${config}.lock`));}finally{await rm(root,{recursive:true,force:true});}
});

test('el CLI protege ejecución, emparejamiento y bandejas mientras otro proceso está activo',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-lock-cli-'));let holder;
 try{const config=join(root,'runner.json');await writeFile(config,JSON.stringify({server:'http://localhost',runnerId:'test',token:'test'}));holder=start(config);assert.equal(await holder.ready,true);const cli=process.env.SAVIA_TEST_RUNNER_CLI||fileURLToPath(new URL('../cli.mjs',import.meta.url)),run=promisify(execFile);
  for(const command of ['run','run-once','pair','outbox-export','outbox-discard','service-install'])await assert.rejects(run(process.execPath,[cli,command,'--config',config],{timeout:5000}),/Otra instancia/);
  holder.child.stdin.write('stop');await holder.done;holder=null;
 }finally{if(holder){holder.child.kill('SIGKILL');await holder.done;}await rm(root,{recursive:true,force:true});}
});
test('rutas alternativas a la misma configuración comparten bloqueo',{skip:process.platform==='win32'},async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-lock-alias-'));let holder;
 try{const config=join(root,'runner.json'),alias=join(root,'alias.json');await writeFile(config,'{}');await symlink(config,alias);holder=start(config);assert.equal(await holder.ready,true);const other=start(alias);assert.equal(await other.ready,false);assert.match((await other.done).stderr,/instancia/);holder.child.stdin.write('stop');await holder.done;holder=null;}
 finally{if(holder){holder.child.kill('SIGKILL');await holder.done;}await rm(root,{recursive:true,force:true});}
});

test('no elimina un bloqueo cuya propiedad no puede verificar',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-lock-unknown-'));try{const config=join(root,'runner.json'),lock=`${config}.lock`;await mkdir(lock);await writeFile(join(lock,'owner.json'),'información inválida');const attempt=start(config);assert.equal(await attempt.ready,false);assert.match((await attempt.done).stderr,/instancia/);assert.equal(await readFile(join(lock,'owner.json'),'utf8'),'información inválida');}finally{await rm(root,{recursive:true,force:true});}
});
