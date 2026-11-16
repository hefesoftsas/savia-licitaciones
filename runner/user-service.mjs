import {execFile} from 'node:child_process';
import {mkdir,readFile,unlink,writeFile,lstat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname,isAbsolute,join,win32} from 'node:path';
import {promisify} from 'node:util';
const execute=promisify(execFile),marker='Savia runner user service; managed by Savia';
const xml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const unit=value=>`"${value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('%','%%').replaceAll('$',()=> '$$')}"`;
export function windowsTaskDefinition({node,cli,config,sid}){
 for(const value of [node,cli,config])if(typeof value!=='string'||!win32.isAbsolute(value)||/[\x00-\x1f\x7f%"<>|?*]/.test(value)||/[\\/]$/.test(value))throw new Error('Las rutas del servicio deben ser absolutas y válidas.');
 if(typeof sid!=='string'||!/^S-1-(?:\d+-)+\d+$/.test(sid))throw new Error('No se pudo identificar la sesión.');
 const args=`"${cli}" run --config "${config}"`;
 return `<?xml version="1.0"?>\n<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">\n<RegistrationInfo><Description>${marker}</Description></RegistrationInfo>\n<Triggers><LogonTrigger><Enabled>true</Enabled><UserId>${sid}</UserId></LogonTrigger></Triggers>\n<Principals><Principal id="Savia"><UserId>${sid}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>\n<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Enabled>true</Enabled></Settings>\n<Actions Context="Savia"><Exec><Command>${xml(node)}</Command><Arguments>${xml(args)}</Arguments></Exec></Actions>\n</Task>\n`;
}
export function windowsTaskMatches(task,expected){
 try{windowsTaskDefinition(expected);}catch{return false;}
 if(!task||task.description!==marker||task.sid!==expected.sid||task.logonType!=='InteractiveToken'||task.runLevel!=='LeastPrivilege'||task.principalCount!==1||task.principalId!=='Savia'||task.actionContext!=='Savia'||!Array.isArray(task.actions)||task.actions.length!==1||!Array.isArray(task.triggers)||task.triggers.length!==1)return false;
 const [action]=task.actions,[trigger]=task.triggers;
 return !!action&&action.type==='Exec'&&action.command===expected.node&&action.arguments===`"${expected.cli}" run --config "${expected.config}"`&&!!trigger&&trigger.type==='Logon'&&trigger.sid===expected.sid&&trigger.enabled===true;
}
export function windowsTaskStore(file){
 async function read(){
  try{
   if(!(await lstat(file)).isFile())throw new Error('registro inválido');
   const data=JSON.parse(await readFile(file,'utf8'));
   if(!data||Object.keys(data).sort().join(',')!=='cli,config,node,sid')throw new Error('registro inválido');
   windowsTaskDefinition(data);return data;
  }catch(error){if(error.code==='ENOENT')return null;throw new Error('El registro de la tarea de Savia no es válido.');}
 }
 return {read,async create(value){
  const {node,cli,config,sid}=value,record={node,cli,config,sid};windowsTaskDefinition(record);
  await mkdir(dirname(file),{recursive:true});
  try{await writeFile(file,JSON.stringify(record),{flag:'wx',mode:0o600});}catch(error){if(error.code==='EEXIST')throw new Error('Ya existe un registro de servicio; no se reemplazó.');throw error;}
 },async remove(){if(!await read())throw new Error('No existe el registro de la tarea de Savia.');await unlink(file);}};
}
const windowsSchedulerScript=String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$payload = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__PAYLOAD__')) | ConvertFrom-Json
if ([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $payload.sid) { throw 'Session identity mismatch' }
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$folder = $service.GetFolder('\')
$name = 'Savia-Runner-' + $payload.sid
if ($payload.operation -eq 'create') {
  $definition = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload.definition))
  $null = $folder.RegisterTask($name, $definition, 2, $payload.sid, $null, 3, $null)
  '{"state":"ok"}'; exit
}
try { $task = $folder.GetTask($name) }
catch { if ($_.Exception.HResult -eq -2147024894 -and $payload.operation -eq 'query') { '{"state":"absent"}'; exit }; throw }
if ($payload.operation -eq 'start') { $null = $task.Run($null); '{"state":"ok"}'; exit }
if ($payload.operation -eq 'stop') { $null = $task.Stop(0); if ($task.GetInstances(0).Count -ne 0) { throw 'Task still running' }; '{"state":"ok"}'; exit }
if ($payload.operation -eq 'remove') { $null = $folder.DeleteTask($name, 0); '{"state":"ok"}'; exit }
if ($payload.operation -ne 'query') { throw 'Invalid operation' }
[xml]$doc = $task.Xml
function Value($node, $path) { $child = $node.SelectSingleNode($path); if ($null -eq $child) { return $null }; return $child.InnerText }
function Sid($value) { if ($null -eq $value -or $value -match '^S-1-(\d+-)+\d+$') { return $value }; return ([System.Security.Principal.NTAccount]::new($value)).Translate([System.Security.Principal.SecurityIdentifier]).Value }
$root = $doc.DocumentElement
$principals = $root.SelectNodes("./*[local-name()='Principals']/*[local-name()='Principal']")
$principal = $principals.Item(0)
$actionRoot = $root.SelectSingleNode("./*[local-name()='Actions']")
$actions = @($actionRoot.SelectNodes('./*') | ForEach-Object { @{type=$_.LocalName; command=(Value $_ "./*[local-name()='Command']"); arguments=(Value $_ "./*[local-name()='Arguments']")} })
$triggers = @($root.SelectNodes("./*[local-name()='Triggers']/*") | ForEach-Object { $enabled=Value $_ "./*[local-name()='Enabled']"; @{type=($_.LocalName -replace 'Trigger$',''); sid=(Sid (Value $_ "./*[local-name()='UserId']")); enabled=($null -eq $enabled -or $enabled -eq 'true' -or $enabled -eq '1')} })
$runLevel=Value $principal "./*[local-name()='RunLevel']"; if ($null -eq $runLevel) { $runLevel='LeastPrivilege' }
@{state='present'; task=@{description=(Value $root "./*[local-name()='RegistrationInfo']/*[local-name()='Description']"); sid=(Sid (Value $principal "./*[local-name()='UserId']")); logonType=(Value $principal "./*[local-name()='LogonType']"); runLevel=$runLevel; principalCount=$principals.Count; principalId=$principal.GetAttribute('id'); actionContext=$actionRoot.GetAttribute('Context'); actions=$actions; triggers=$triggers}} | ConvertTo-Json -Depth 8 -Compress
`;
export function windowsTaskScheduler({sid,exec=execute}){
 if(typeof sid!=='string'||!/^S-1-(?:\d+-)+\d+$/.test(sid))throw new Error('No se pudo identificar la sesión.');
 async function call(operation,definition){
  const payload={sid,operation,...(definition===undefined?{}:{definition:Buffer.from(definition,'utf8').toString('base64')})};
  const script=windowsSchedulerScript.replace('__PAYLOAD__',Buffer.from(JSON.stringify(payload),'utf8').toString('base64'));
  try{
   const {stdout}=await exec('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')]);
   const result=JSON.parse(stdout);
   if(operation==='query'&&result?.state==='absent')return null;
   if(operation==='query'&&result?.state==='present'&&result.task&&typeof result.task==='object'&&!Array.isArray(result.task))return result.task;
   if(operation!=='query'&&result?.state==='ok')return;
   throw new Error('unexpected response');
  }catch{throw new Error(operation==='query'?'No se pudo confirmar la consulta al Programador de tareas.':'No se pudo completar la operación en el Programador de tareas.');}
 }
 return {query:()=>call('query'),create:definition=>call('create',definition),start:()=>call('start'),stop:()=>call('stop'),remove:()=>call('remove')};
}
// scheduler.create must fail if the task name already exists; query must throw on an unknown state.
export async function installWindowsTask({expected,store,scheduler}){
 const definition=windowsTaskDefinition(expected);
 if(await scheduler.query())throw new Error('Ya existe una tarea con ese nombre; no se reemplazó.');
 const {node,cli,config,sid}=expected;
 await store.create({node,cli,config,sid});
 await scheduler.create(definition);
 if(!windowsTaskMatches(await scheduler.query(),expected))throw new Error('No se pudo confirmar que la tarea instalada sea propia de Savia.');
 await scheduler.start();
}
export async function removeWindowsTask({store,scheduler}){
 const expected=await store.read();
 if(!expected)throw new Error('No existe un registro de la tarea de Savia.');
 const task=await scheduler.query();
 if(task){
  if(!windowsTaskMatches(task,expected))throw new Error('La tarea registrada no es la propia de Savia; no se modificó.');
  await scheduler.stop();
  if(!windowsTaskMatches(await scheduler.query(),expected))throw new Error('No se pudo confirmar que la tarea sea propia de Savia; no se eliminó.');
  await scheduler.remove();
 }
 await store.remove();
}
async function currentWindowsSid(exec=execute){
 const script='[Console]::Write([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value)';
 try{
  const {stdout}=await exec('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')]);
  const sid=stdout.trim();if(!/^S-1-(?:\d+-)+\d+$/.test(sid))throw new Error('invalid SID');return sid;
 }catch{throw new Error('No se pudo identificar la sesión de Windows.');}
}
export async function installWindowsUserService({node=process.execPath,cli,config,stateFile=join(homedir(),'.savia','runner-task.json'),identity=currentWindowsSid,readConfig=path=>readFile(path,'utf8'),schedulerFactory=windowsTaskScheduler}){
 let paired;try{paired=JSON.parse(await readConfig(config));}catch{throw new Error('Conecta primero este equipo a Savia.');}
 if(!paired?.server||!paired?.runnerId||!paired?.token)throw new Error('Conecta primero este equipo a Savia.');
 const sid=await identity(),expected={node,cli,config,sid},store=windowsTaskStore(stateFile),scheduler=schedulerFactory({sid});
 await installWindowsTask({expected,store,scheduler});return stateFile;
}
export async function removeWindowsUserService({stateFile=join(homedir(),'.savia','runner-task.json'),identity=currentWindowsSid,schedulerFactory=windowsTaskScheduler}){
 const store=windowsTaskStore(stateFile),expected=await store.read();
 if(!expected)throw new Error('No existe un registro de la tarea de Savia.');
 const sid=await identity();if(expected.sid!==sid)throw new Error('La identidad de la sesión no coincide con la tarea de Savia.');
 await removeWindowsTask({store,scheduler:schedulerFactory({sid})});return stateFile;
}
function validate(options){for(const value of [options.node,options.cli,options.config])if(typeof value!=='string'||!isAbsolute(value)||/[\x00-\x1f\x7f]/.test(value))throw new Error('Las rutas del servicio deben ser absolutas y válidas.');}
export function serviceDefinition(platform,options){
 validate(options);const args=[options.node,options.cli,'run','--config',options.config];
 if(platform==='darwin')return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<!-- ${marker} -->\n<plist version="1.0"><dict>\n<key>Label</key><string>com.savia.runner</string>\n<key>ProgramArguments</key><array>${args.map(arg=>`<string>${xml(arg)}</string>`).join('')}</array>\n<key>RunAtLoad</key><true/>\n<key>StandardOutPath</key><string>/dev/null</string>\n<key>StandardErrorPath</key><string>/dev/null</string>\n</dict></plist>\n`;
 if(platform==='linux')return `# ${marker}\n[Unit]\nDescription=Savia local runner\n[Service]\nType=simple\nExecStart=${args.map(unit).join(' ')}\nRestart=no\nStandardOutput=null\n[Install]\nWantedBy=default.target\n`;
 throw new Error('El inicio de sesión aún no está disponible en este sistema.');
}
function details({platform=process.platform,home=homedir(),uid=process.getuid?.(),node=process.execPath,cli,config,exec=execute}){
 if(!isAbsolute(home))throw new Error('Directorio de usuario inválido.');
 if(platform==='darwin'&&!Number.isSafeInteger(uid))throw new Error('No se pudo identificar la sesión.');
 const file=platform==='darwin'?join(home,'Library','LaunchAgents','com.savia.runner.plist'):platform==='linux'?join(home,'.config','systemd','user','savia-runner.service'):null;
 if(!file)throw new Error('El inicio de sesión aún no está disponible en este sistema.');
 return {platform,file,uid,node,cli,config,exec};
}
export async function installUserService(options){
 if((options.platform??process.platform)==='win32')return installWindowsUserService(options);
 const d=details(options),definition=serviceDefinition(d.platform,d);let config;try{config=JSON.parse(await readFile(d.config,'utf8'));}catch{throw new Error('Conecta primero este equipo a Savia.');}
 if(!config?.server||!config?.runnerId||!config?.token)throw new Error('Conecta primero este equipo a Savia.');
 await mkdir(dirname(d.file),{recursive:true});try{await writeFile(d.file,definition,{flag:'wx',mode:0o600});}catch(error){if(error.code==='EEXIST')throw new Error('Ya existe un archivo de servicio; no se reemplazó.');throw error;}
 let enableAttempted=false;
 try{if(d.platform==='darwin')await d.exec('launchctl',['bootstrap',`gui/${d.uid}`,d.file]);else{await d.exec('systemctl',['--user','daemon-reload']);enableAttempted=true;await d.exec('systemctl',['--user','enable','--now','savia-runner.service']);}}
 catch(error){if(d.platform==='linux'&&enableAttempted){try{await d.exec('systemctl',['--user','disable','--now','savia-runner.service']);}catch{throw new Error('No se pudo confirmar la reversión del servicio. Ejecuta service-remove cuando systemd esté disponible.');}}await unlink(d.file).catch(()=>{});if(d.platform==='linux'){try{await d.exec('systemctl',['--user','daemon-reload']);}catch{}}throw error;}
 return d.file;
}
export async function removeUserService(options){
 if((options.platform??process.platform)==='win32')return removeWindowsUserService(options);
 const d=details(options);let text;try{const info=await lstat(d.file);if(!info.isFile())throw new Error('El archivo no es un servicio propio de Savia.');text=await readFile(d.file,'utf8');}catch(error){if(error.code==='ENOENT')throw new Error('No existe el servicio de Savia.');throw error;}
 if(!text.includes(marker))throw new Error('El archivo no es un servicio propio de Savia.');
 if(d.platform==='darwin')await d.exec('launchctl',['bootout',`gui/${d.uid}`,d.file]);else await d.exec('systemctl',['--user','disable','--now','savia-runner.service']);
 await unlink(d.file);if(d.platform==='linux')await d.exec('systemctl',['--user','daemon-reload']);return d.file;
}
