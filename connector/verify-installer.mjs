// Install only into a temporary directory. Windows execution is restricted to CI,
// because the NSIS installer also creates per-user registry entries and shortcuts.
import {spawnSync} from 'node:child_process';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const index=process.argv.indexOf('--installer');
if(index<0||!process.argv[index+1])throw Error('Indica --installer con la ruta del instalador.');
const installer=resolve(process.argv[index+1]);
if(!['darwin','win32','linux'].includes(process.platform))throw Error('Plataforma no compatible.');
if(process.platform==='win32'&&process.env.CI!=='true')throw Error('La instalación silenciosa solo se permite en CI.');
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const temporary=await mkdtemp(join(tmpdir(),'savia-installer-check-'));
const installation=join(temporary,'installed');
let mounted=false,installed=false;
function run(command,args,env=process.env){
 const result=spawnSync(command,args,{stdio:'inherit',env,timeout:600000});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error(`Falló ${command}: ${result.status??result.signal}`);
}
try{
 if(process.platform==='darwin'){
  const mount=join(temporary,'mount');
  const {mkdir}=await import('node:fs/promises');await mkdir(mount);
  run('hdiutil',['attach',installer,'-readonly','-nobrowse','-mountpoint',mount,'-quiet']);mounted=true;
  run('ditto',[join(mount,'Savia Conector.app'),join(installation,'Savia Conector.app')]);
 }else if(process.platform==='linux'){
  const {chmod}=await import('node:fs/promises');
  await chmod(installer,0o755);
  const extract=spawnSync(installer,['--appimage-extract'],{cwd:temporary,stdio:'inherit',timeout:180000});
  if(extract.error)throw extract.error;
  if(extract.status!==0)throw Error(`Falló extracción AppImage: ${extract.status??extract.signal}`);
 }else{
  const extractDir=join(temporary,'nsis');
  run('7z',['x',installer,`-o${extractDir}`,'-y']);
  const pluginsDir=join(extractDir,'$PLUGINSDIR');
  const pluginFiles=await readdir(pluginsDir).catch(()=>[]);
  const appArchive=pluginFiles.find(name=>/^app-.*\.7z$/i.test(name));
  if(!appArchive)throw Error('No se encontró app-*.7z dentro del instalador NSIS.');
  run('7z',['x',join(pluginsDir,appArchive),`-o${installation}`,'-y']);
 }
 const app=process.platform==='darwin'?join(installation,'Savia Conector.app','Contents'):process.platform==='linux'?join(temporary,'squashfs-root'):installation;
 const executable=process.platform==='darwin'?join(app,'MacOS','Savia Conector'):process.platform==='linux'?join(app,'savia-conector'):join(app,'Savia Conector.exe');
 const bundle=join(app,process.platform==='darwin'?'Resources':'resources','runner-bundle');
 if(process.platform==='win32'){
  const {stat}=await import('node:fs/promises');
  await stat(executable);
  await stat(join(bundle,'runner','cli.mjs'));
 }else{
  run(process.execPath,[join(root,'connector','smoke.mjs'),'--bundle',bundle,'--node',executable,'--electron-runtime']);
  run(executable,[join(root,'connector','verify-documents.mjs'),bundle],{...process.env,ELECTRON_RUN_AS_NODE:'1'});
 }
 console.log('OK: el instalador preparó una copia temporal funcional.');
}finally{
 if(installed){
  const files=await readdir(installation).catch(()=>[]);
  const uninstaller=files.find(name=>/^uninstall.*\.exe$/i.test(name));
  if(!uninstaller)throw Error('No se encontró el desinstalador de la prueba.');
  run(join(installation,uninstaller),['/S']);
 }
 if(mounted)run('hdiutil',['detach',join(temporary,'mount'),'-quiet']);
 await rm(temporary,{recursive:true,force:true});
}
