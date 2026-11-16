import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const moduleUrl=process.env.SAVIA_TEST_PACKAGED_RUNNER?pathToFileURL(join(process.env.SAVIA_TEST_PACKAGED_RUNNER,'runner','user-service.mjs')).href:new URL('../user-service.mjs',import.meta.url).href;
const {installUserService,removeUserService,serviceDefinition,windowsTaskDefinition,windowsTaskMatches,installWindowsTask,removeWindowsTask,windowsTaskStore,windowsTaskScheduler,installWindowsUserService,removeWindowsUserService}=await import(moduleUrl);

test('prepara tarea Windows de sesión para el usuario indicado, sin credenciales',()=>{
 const definition=windowsTaskDefinition({node:'C:\\Program Files\\nodejs\\node.exe',cli:'C:\\Savia & equipo\\runner\\cli.mjs',config:'C:\\Usuarios\\Ana\\runner.json',sid:'S-1-5-21-123-456-789-1001'});
 assert.match(definition,/^<\?xml version="1\.0"\?>/);
 assert.match(definition,/<Task version="1\.3" xmlns="http:\/\/schemas\.microsoft\.com\/windows\/2004\/02\/mit\/task">/);
 assert.match(definition,/<LogonType>InteractiveToken<\/LogonType>/);
 assert.match(definition,/<UserId>S-1-5-21-123-456-789-1001<\/UserId>/);
 assert.match(definition,/<Command>C:\\Program Files\\nodejs\\node.exe<\/Command>/);
 assert.match(definition,/<Arguments>&quot;C:\\Savia &amp; equipo\\runner\\cli.mjs&quot; run --config &quot;C:\\Usuarios\\Ana\\runner.json&quot;<\/Arguments>/);
 assert.doesNotMatch(definition,/token secreto|<Password>/i);
 assert.throws(()=>windowsTaskDefinition({node:'C:\\node.exe',cli:'C:\\%USERPROFILE%\\cli.mjs',config:'C:\\config.json',sid:'S-1-5-21-1'}),/rutas/i);
 assert.throws(()=>windowsTaskDefinition({node:'C:\\node.exe',cli:'C:\\cli.mjs',config:'C:\\config.json',sid:'otro usuario'}),/identificar/i);
 assert.throws(()=>windowsTaskDefinition({node:'C:\\node.exe',cli:'C:\\directorio\\',config:'C:\\config.json',sid:'S-1-5-21-1'}),/rutas/i);
});

test('la definición Windows satisface el esquema suministrado del Programador de tareas',{skip:!process.env.SAVIA_WINDOWS_TASK_SCHEMA},()=>{
 const definition=windowsTaskDefinition({node:'C:\\Program Files\\nodejs\\node.exe',cli:'C:\\Savia & equipo\\runner\\cli.mjs',config:'C:\\Usuarios\\Ana\\runner.json',sid:'S-1-5-21-123-456-789-1001'});
 const result=spawnSync('xmllint',['--noout','--schema',process.env.SAVIA_WINDOWS_TASK_SCHEMA,'-'],{input:definition,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.error?.message);
});

test('solo identifica una tarea Windows si coinciden identidad, acción y disparador completos',()=>{
 const expected={node:'C:\\node.exe',cli:'C:\\Savia\\cli.mjs',config:'C:\\Savia\\runner.json',sid:'S-1-5-21-42'};
 const actual={description:'Savia runner user service; managed by Savia',sid:expected.sid,logonType:'InteractiveToken',runLevel:'LeastPrivilege',principalCount:1,principalId:'Savia',actionContext:'Savia',actions:[{type:'Exec',command:expected.node,arguments:'"C:\\Savia\\cli.mjs" run --config "C:\\Savia\\runner.json"'}],triggers:[{type:'Logon',sid:expected.sid,enabled:true}]};
 assert.equal(windowsTaskMatches(actual,expected),true);
 for(const changed of [{...actual,sid:'S-1-5-21-43'},{...actual,logonType:'Password'},{...actual,runLevel:'HighestAvailable'},{...actual,principalCount:2},{...actual,actionContext:'otro'},{...actual,description:'tarea ajena'},{...actual,actions:[...actual.actions,{type:'Exec',command:'C:\\otro.exe',arguments:''}]},{...actual,actions:[{...actual.actions[0],arguments:'--otro'}]},{...actual,triggers:[{type:'Logon',sid:'S-1-5-21-43',enabled:true}]},{...actual,triggers:[{...actual.triggers[0],enabled:false}]},{...actual,triggers:[...actual.triggers,{type:'Boot'}]},null]) assert.equal(windowsTaskMatches(changed,expected),false);
});

test('el gestor Windows conserva el estado ante fallo incierto y no retira tareas ajenas',async()=>{
 const expected={node:'C:\\node.exe',cli:'C:\\Savia\\cli.mjs',config:'C:\\Savia\\runner.json',sid:'S-1-5-21-42'};
 let saved=null,task=null,failCreate=true,removed=0,started=0;
 const store={create:async v=>{if(saved)throw Error('existe');saved=v;},read:async()=>saved,remove:async()=>{saved=null;}};
 const scheduler={query:async()=>task,create:async()=>{if(failCreate)throw Error('resultado incierto');},start:async()=>{started++;},stop:async()=>{},remove:async()=>{removed++;task=null;}};
 await assert.rejects(installWindowsTask({expected,store,scheduler}),/incierto/);assert.deepEqual(saved,expected);
 task={description:'ajena'};await assert.rejects(removeWindowsTask({store,scheduler}),/propia/i);assert.equal(removed,0);assert.deepEqual(saved,expected);
 task=null;await removeWindowsTask({store,scheduler});assert.equal(saved,null);
 failCreate=false;task={description:'ajena'};await assert.rejects(installWindowsTask({expected,store,scheduler}),/existe/i);assert.equal(removed,0);assert.equal(started,0);
});

test('el gestor Windows inicia y retira la tarea comprobada y conserva el estado si falla la consulta',async()=>{
 const expected={node:'C:\\node.exe',cli:'C:\\Savia\\cli.mjs',config:'C:\\Savia\\runner.json',sid:'S-1-5-21-42'},events=[];
 const own={description:'Savia runner user service; managed by Savia',sid:expected.sid,logonType:'InteractiveToken',runLevel:'LeastPrivilege',principalCount:1,principalId:'Savia',actionContext:'Savia',actions:[{type:'Exec',command:expected.node,arguments:'"C:\\Savia\\cli.mjs" run --config "C:\\Savia\\runner.json"'}],triggers:[{type:'Logon',sid:expected.sid,enabled:true}]};
 let saved=null,task=null,unknown=false;
 const store={create:async v=>{saved=v;events.push('save');},read:async()=>saved,remove:async()=>{saved=null;events.push('forget');}};
 const scheduler={query:async()=>{if(unknown)throw Error('desconocido');return task;},create:async()=>{task=own;events.push('create');},start:async()=>events.push('start'),stop:async()=>events.push('stop'),remove:async()=>{task=null;events.push('remove');}};
 await installWindowsTask({expected:{...expected,token:'secreto'},store,scheduler});assert.deepEqual(saved,expected);assert.deepEqual(events,['save','create','start']);unknown=true;
 await assert.rejects(removeWindowsTask({store,scheduler}),/desconocido/);assert.deepEqual(saved,expected);assert.deepEqual(events,['save','create','start']);
 unknown=false;await removeWindowsTask({store,scheduler});assert.equal(saved,null);assert.deepEqual(events,['save','create','start','stop','remove','forget']);
});

test('el registro Windows es exclusivo, validado y no reemplaza archivos existentes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-task-store-'));try{
  const file=join(root,'state','task.json'),store=windowsTaskStore(file),expected={node:'C:\\node.exe',cli:'C:\\Savia\\cli.mjs',config:'C:\\Savia\\runner.json',sid:'S-1-5-21-42'};
  assert.equal(await store.read(),null);await store.create({...expected,token:'secreto'});assert.deepEqual(await store.read(),expected);assert.doesNotMatch(await readFile(file,'utf8'),/secreto/);
  await assert.rejects(store.create(expected),/existe/i);await store.remove();assert.equal(await store.read(),null);
  if(process.platform!=='win32'){const target=join(root,'ajeno');await writeFile(target,'contenido ajeno');await symlink(target,file);await assert.rejects(store.read(),/registro/i);await assert.rejects(store.remove(),/registro/i);assert.equal(await readFile(target,'utf8'),'contenido ajeno');}
 }finally{await rm(root,{recursive:true,force:true});}
});

test('recupera desde disco una instalación Windows cuyo resultado fue incierto',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-task-recovery-'));try{
  const expected={node:'C:\\node.exe',cli:'C:\\Savia\\cli.mjs',config:'C:\\Savia\\runner.json',sid:'S-1-5-21-42'},file=join(root,'task.json');
  const own={description:'Savia runner user service; managed by Savia',sid:expected.sid,logonType:'InteractiveToken',runLevel:'LeastPrivilege',principalCount:1,principalId:'Savia',actionContext:'Savia',actions:[{type:'Exec',command:expected.node,arguments:'"C:\\Savia\\cli.mjs" run --config "C:\\Savia\\runner.json"'}],triggers:[{type:'Logon',sid:expected.sid,enabled:true}]};
  let task=null;const events=[],scheduler={query:async()=>task,create:async()=>{task=own;throw Error('se perdió la respuesta');},start:async()=>events.push('start'),stop:async()=>events.push('stop'),remove:async()=>{events.push('remove');task=null;}};
  await assert.rejects(installWindowsTask({expected,store:windowsTaskStore(file),scheduler}),/se perdió/);
  assert.deepEqual(await windowsTaskStore(file).read(),expected);await removeWindowsTask({store:windowsTaskStore(file),scheduler});
  assert.deepEqual(events,['stop','remove']);assert.equal(await windowsTaskStore(file).read(),null);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('el servicio Windows exige equipo conectado y comprueba la identidad al retirarlo',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-win-service-'));try{
  const expected={node:'C:\\node.exe',cli:'C:\\Savia\\cli.mjs',config:'C:\\Savia\\runner.json',sid:'S-1-5-21-42'},file=join(root,'task.json');let currentSid=expected.sid,connected=false,task=null;const calls=[];
  const own={description:'Savia runner user service; managed by Savia',sid:expected.sid,logonType:'InteractiveToken',runLevel:'LeastPrivilege',principalCount:1,principalId:'Savia',actionContext:'Savia',actions:[{type:'Exec',command:expected.node,arguments:'"C:\\Savia\\cli.mjs" run --config "C:\\Savia\\runner.json"'}],triggers:[{type:'Logon',sid:expected.sid,enabled:true}]};
  const schedulerFactory=({sid})=>({query:async()=>{calls.push(`query:${sid}`);return task;},create:async()=>{task=own;},start:async()=>calls.push('start'),stop:async()=>calls.push('stop'),remove:async()=>{calls.push('remove');task=null;}});
  const options={platform:'win32',node:expected.node,cli:expected.cli,config:expected.config,stateFile:file,identity:async()=>currentSid,readConfig:async()=>connected?JSON.stringify({server:'https://example.test',runnerId:'r',token:'secreto'}):'{}',schedulerFactory};
  await assert.rejects(installUserService(options),/conecta/i);assert.deepEqual(calls,[]);connected=true;await installUserService(options);assert.ok(calls.includes('start'));assert.doesNotMatch(await readFile(file,'utf8'),/secreto/);
  currentSid='S-1-5-21-99';await assert.rejects(removeUserService(options),/identidad/i);assert.ok(!calls.includes('stop'));currentSid=expected.sid;await removeUserService(options);assert.ok(calls.includes('remove'));await assert.rejects(readFile(file),{code:'ENOENT'});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('el adaptador Windows distingue una ausencia confirmada de una consulta fallida',async()=>{
 const calls=[],results=['{"state":"absent"}','{"state":"present","task":{"description":"ejemplo"}}','salida inválida'];
 const scheduler=windowsTaskScheduler({sid:'S-1-5-21-42',exec:async(command,args)=>{calls.push({command,args});return {stdout:results.shift()};}});
 assert.equal(await scheduler.query(),null);assert.deepEqual(await scheduler.query(),{description:'ejemplo'});await assert.rejects(scheduler.query(),/consulta/i);
 assert.equal(calls.length,3);assert.ok(calls.every(call=>call.command==='powershell.exe'&&call.args.includes('-EncodedCommand')));
 const script=Buffer.from(calls[0].args.at(-1),'base64').toString('utf16le');assert.match(script,/GetTask/);assert.match(script,/-2147024894/);
 const errorScheduler=windowsTaskScheduler({sid:'S-1-5-21-42',exec:async()=>{throw new Error('denegado');}});await assert.rejects(errorScheduler.query(),/consulta/i);
 assert.throws(()=>windowsTaskScheduler({sid:'usuario'}),/identificar/i);
});

test('el adaptador Windows transmite la definición sin interpolarla y exige confirmación de cada operación',async()=>{
 const scripts=[],scheduler=windowsTaskScheduler({sid:'S-1-5-21-42',exec:async(_command,args)=>{scripts.push(Buffer.from(args.at(-1),'base64').toString('utf16le'));return {stdout:'{"state":"ok"}'};}});
 const definition='archivo con comillas " y texto $variable';await scheduler.create(definition);await scheduler.start();await scheduler.stop();await scheduler.remove();
 assert.equal(scripts.length,4);assert.match(scripts[0],/RegisterTask\(\$name, \$definition, 2,/);assert.ok(!scripts[0].includes(definition));
 assert.match(scripts[2],/GetInstances\(0\)\.Count/);
 const encoded=scripts[0].match(/FromBase64String\('([^']+)'\)/)[1],payload=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
 assert.equal(Buffer.from(payload.definition,'base64').toString('utf8'),definition);assert.deepEqual(scripts.map(script=>JSON.parse(Buffer.from(script.match(/FromBase64String\('([^']+)'\)/)[1],'base64').toString('utf8')).operation),['create','start','stop','remove']);
 const invalid=windowsTaskScheduler({sid:'S-1-5-21-42',exec:async()=>({stdout:'{"state":"absent"}'})});await assert.rejects(invalid.remove(),/operación/i);
});

test('PowerShell interpreta el XML consultado y detecta una acción adicional',{skip:!process.env.SAVIA_TEST_PWSH},async()=>{
 const expected={node:'C:\\Program Files\\node.exe',cli:'C:\\Savia & equipo\\cli.mjs',config:'C:\\Savia\\runner.json',sid:'S-1-5-21-42'};
 let script;const scheduler=windowsTaskScheduler({sid:expected.sid,exec:async(_command,args)=>{script=Buffer.from(args.at(-1),'base64').toString('utf16le');return {stdout:'{"state":"absent"}'};}});await scheduler.query();
 const query=script.slice(script.indexOf('[xml]$doc = $task.Xml'));assert.ok(query.startsWith('[xml]$doc'));
 function interpret(xml){
  const payload=Buffer.from(xml,'utf8').toString('base64'),source=`$ErrorActionPreference='Stop'; $task=[pscustomobject]@{Xml=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))};\n${query}`;
  const result=spawnSync('pwsh',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout).task;
 }
 const original=windowsTaskDefinition(expected);assert.equal(windowsTaskMatches(interpret(original),expected),true);
 assert.equal(windowsTaskMatches(interpret(original.replace('<RunLevel>LeastPrivilege</RunLevel>','').replace('<Enabled>true</Enabled>','')),expected),true);
 const extra=original.replace('</Actions>','<Exec><Command>C:\\otro.exe</Command></Exec></Actions>');assert.equal(windowsTaskMatches(interpret(extra),expected),false);
 assert.equal(windowsTaskMatches(interpret(original.replace('Context="Savia"','Context="otro"')),expected),false);
 assert.equal(windowsTaskMatches(interpret(original.replace('<Enabled>true</Enabled><UserId>','<Enabled>false</Enabled><UserId>')),expected),false);
});

test('genera definiciones con rutas escapadas y sin credenciales',()=>{
 const options={node:'/Apps/Node & Java/node',cli:'/app ruta/runner/cli.mjs',config:'/cuenta/archivo "a".json'};
 const mac=serviceDefinition('darwin',options),linux=serviceDefinition('linux',options);
 assert.match(mac,/Node &amp; Java/);assert.match(mac,/&quot;a&quot;/);assert.match(mac,/<key>RunAtLoad<\/key>\s*<true\/>/);assert.doesNotMatch(mac,/KeepAlive/);
 assert.match(linux,/ExecStart="\/Apps\/Node & Java\/node"/);assert.match(linux,/\\"a\\"/);assert.match(linux,/Restart=no/);assert.ok(!mac.includes('token'));assert.ok(!linux.includes('token'));
});
test('instala y retira solo sus propios archivos y no sobrescribe otros',{timeout:10000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-service-')),config=join(root,'runner.json'),calls=[];try{await writeFile(config,JSON.stringify({server:'https://example.test',runnerId:'r',token:'secret'}));
  const options={platform:'darwin',home:root,uid:501,node:'/node',cli:'/runner/cli.mjs',config,exec:async(command,args)=>calls.push({command,args})};
  const file=await installUserService(options);assert.equal(file,join(root,'Library','LaunchAgents','com.savia.runner.plist'));assert.ok((await readFile(file,'utf8')).includes('com.savia.runner'));assert.ok(!(await readFile(file,'utf8')).includes('secret'));assert.deepEqual(calls[0],{command:'launchctl',args:['bootstrap','gui/501',file]});
  await assert.rejects(installUserService(options),/existe/i);assert.equal(calls.length,1);await removeUserService(options);assert.deepEqual(calls[1],{command:'launchctl',args:['bootout','gui/501',file]});await assert.rejects(readFile(file),{code:'ENOENT'});
  await mkdir(dirname(file),{recursive:true});await writeFile(file,'contenido ajeno');await assert.rejects(removeUserService(options),/propio/i);assert.equal(await readFile(file,'utf8'),'contenido ajeno');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('no instala sin emparejamiento y revierte un fallo de registro',{timeout:10000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-service-'));try{const config=join(root,'runner.json'),calls=[];const options={platform:'linux',home:root,node:'/node',cli:'/runner/cli.mjs',config,exec:async(c,a)=>{calls.push([c,a]);if(a.includes('enable'))throw Error('failed');}};
  await assert.rejects(installUserService(options),/conecta/i);assert.equal(calls.length,0);await writeFile(config,JSON.stringify({server:'https://example.test',runnerId:'r',token:'secret'}));await assert.rejects(installUserService(options),/failed/);await assert.rejects(readFile(join(root,'.config','systemd','user','savia-runner.service')),{code:'ENOENT'});assert.ok(calls.some(([,args])=>args.includes('disable')));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('conserva la definición cuando no puede confirmar la reversión de systemd',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-service-'));try{const config=join(root,'runner.json');await writeFile(config,JSON.stringify({server:'https://example.test',runnerId:'r',token:'secret'}));const options={platform:'linux',home:root,node:'/node',cli:'/runner/cli.mjs',config,exec:async(_command,args)=>{if(args.includes('enable')||args.includes('disable'))throw Error('systemd unavailable');}};
  await assert.rejects(installUserService(options),/no se pudo confirmar|could not confirm/i);assert.match(await readFile(join(root,'.config','systemd','user','savia-runner.service'),'utf8'),/Savia runner user service/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('activa y retira la unidad de usuario Linux en el orden previsto',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-service-'));try{const config=join(root,'runner.json'),calls=[];await writeFile(config,JSON.stringify({server:'https://example.test',runnerId:'r',token:'secret'}));const options={platform:'linux',home:root,node:'/node',cli:'/runner/cli.mjs',config,exec:async(command,args)=>calls.push([command,...args])};
  const file=await installUserService(options);assert.match(await readFile(file,'utf8'),/WantedBy=default.target/);await removeUserService(options);
  assert.deepEqual(calls,[['systemctl','--user','daemon-reload'],['systemctl','--user','enable','--now','savia-runner.service'],['systemctl','--user','disable','--now','savia-runner.service'],['systemctl','--user','daemon-reload']]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('escapa los caracteres especiales de systemd y rechaza saltos de línea',()=>{
 const base={node:'/usr/bin/node',cli:'/app/$cash/100%/cli.mjs',config:'/datos/runner.json'};assert.match(serviceDefinition('linux',base),/\$\$cash\/100%%/);assert.throws(()=>serviceDefinition('linux',{...base,config:'/datos/\nmal'}),/válidas/);
});
