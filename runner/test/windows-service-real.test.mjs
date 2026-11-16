import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {installUserService,removeUserService,windowsTaskMatches,windowsTaskScheduler,windowsTaskStore} from '../user-service.mjs';

test('instala, ejecuta y retira una tarea temporal real de la sesión Windows',{skip:process.platform!=='win32'||process.env.SAVIA_TEST_WINDOWS_TASK!=='1',timeout:60000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-task-real-')),config=join(root,'runner.json'),stateFile=join(root,'task.json'),cli=join(root,'fixture.mjs'),marker=join(root,'ejecutado.txt'),name=`Savia-Test-${randomUUID()}`,execute=promisify(execFile);
 let scheduler;
 const schedulerFactory=({sid})=>scheduler=windowsTaskScheduler({sid,exec:async(command,args)=>{
  const script=Buffer.from(args.at(-1),'base64').toString('utf16le'),old="$name = 'Savia-Runner-' + $payload.sid";
  assert.ok(script.includes(old));const replacement=`$name = '${name}'`,updated=script.replace(old,replacement);
  try{return await execute(command,[...args.slice(0,-1),Buffer.from(updated,'utf16le').toString('base64')]);}
  catch(error){console.error('Diagnóstico del Programador de tareas:',error.stderr);throw error;}
 }});
 try{
  await writeFile(config,JSON.stringify({server:'https://example.invalid',runnerId:'fixture',token:'solo-prueba'}));
  await writeFile(cli,`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'ejecutado');setTimeout(()=>{},60000);`);
  await installUserService({node:process.execPath,cli,config,stateFile,schedulerFactory});
  let started=false;for(let attempt=0;attempt<50;attempt++){try{started=(await readFile(marker,'utf8'))==='ejecutado';if(started)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
  assert.equal(started,true,'La tarea no ejecutó el programa de prueba.');
  await removeUserService({stateFile,schedulerFactory});assert.equal(await scheduler.query(),null);
 }finally{
  if(scheduler){const task=await scheduler.query(),expected=await windowsTaskStore(stateFile).read();if(task&&expected&&windowsTaskMatches(task,expected)){await scheduler.stop();await scheduler.remove();}}
  if(scheduler&&await scheduler.query())throw new Error(`No se pudo retirar la tarea temporal ${name}.`);
  await rm(root,{recursive:true,force:true});
 }
});
