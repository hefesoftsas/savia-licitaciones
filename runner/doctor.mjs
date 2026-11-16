import {access,readFile,stat} from 'node:fs/promises';
import {constants,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {createRequire} from 'node:module';

function supportedNode(value){const match=/^(\d+)\.(\d+)\.(\d+)/.exec(value);if(!match)return false;const [,major,minor]=match.map(Number);return major>22||(major===22&&minor>=13);}
async function readJson(path){try{return {value:JSON.parse(await readFile(path,'utf8'))};}catch(error){return {error:error?.code==='ENOENT'?'missing':'invalid'};}}
async function digestFile(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
async function inspectFile(path,expected,platform){try{const item=await stat(path);if(!item.isFile())return 'error';await access(path,platform==='win32'?constants.F_OK:constants.X_OK);if(expected&&!/^[a-f0-9]{64}$/.test(expected))return 'error';if(expected&&await digestFile(path)!==expected)return 'error';return 'ok';}catch{return 'error';}}
function validConfig(value){if(!value||typeof value.runnerId!=='string'||!value.runnerId||typeof value.token!=='string'||!value.token||typeof value.server!=='string')return false;try{const url=new URL(value.server);return !url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'&&(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)));}catch{return false;}}
export async function inspectRunner({root,configPath,platform=process.platform,arch=process.arch,nodeVersion=process.versions.node,toolsOverride=process.env.SAVIA_AGENT_TOOLS_BIN_DIR,probeSharp=directory=>createRequire(join(directory,'client','package.json'))('sharp')}={}){
 const checks=[],add=(id,status,message)=>checks.push({id,status,message}),target=`${platform}-${arch}`,manifestFile=await readJson(join(root,'manifest.json')),manifest=manifestFile.value;
 add('node',supportedNode(nodeVersion)?'ok':'error',supportedNode(nodeVersion)?`Node ${nodeVersion}: compatible.`:`Node ${nodeVersion}: se requiere Node 22.13 o posterior.`);
 if(manifestFile.error==='missing')add('manifest','warning','No hay manifiesto de distribución; se comprueba el checkout sin verificar integridad.');
 else if(manifestFile.error||manifest?.format!==1||!Array.isArray(manifest.tools))add('manifest','error','El manifiesto de distribución no es válido.');
 else add('manifest','ok','Manifiesto de distribución disponible.');
 if(manifest){const compatible=manifest.platform===platform&&manifest.arch===arch;add('platform',compatible?'ok':'error',compatible?`Plataforma ${target}: compatible.`:`Esta distribución es para ${manifest.platform}-${manifest.arch}; la máquina ejecuta ${target}.`);}
 else add('platform','warning',`Plataforma ${target}: no se pudo comparar con una distribución.`);
 const dir=toolsOverride||join(root,'client','vendor','agent-tools',target,'bin');
 for(const name of ['rg','fd','jq']){const entry=manifest?.tools?.find?.(item=>item.command===name),expected=toolsOverride?undefined:entry?.binary_sha256,verified=!!manifest&&!toolsOverride;
  const status=await inspectFile(join(dir,name+(platform==='win32'?'.exe':'')),verified?(expected||'invalid'):undefined,platform);
  add(`tool-${name}`,status==='error'?'error':verified?'ok':'warning',status==='error'?`Herramienta ${name} ausente, sin permiso o con hash incorrecto.`:verified?`Herramienta ${name}: archivo y hash correctos.`:`Herramienta ${name} disponible; integridad no verificada.`);
 }
 const helperName=platform==='win32'?'openxmlhelper.exe':'openxmlhelper',relative=`client/vendor/openxml-tools/${target}/${helperName}`,expected=manifest?.openxml?.sha256;
 const helper=await inspectFile(join(root,...relative.split('/')),manifest?(manifest.openxml?.path===relative?expected||'invalid':'invalid'):undefined,platform);
 add('openxml',helper==='error'?'error':manifest?'ok':'warning',helper==='error'?'Helper OpenXML ausente, sin permiso o con hash incorrecto.':manifest?'Helper OpenXML: archivo y hash correctos.':'Helper OpenXML disponible; integridad no verificada.');
 try{await probeSharp(root);add('sharp','ok','Conversión de imágenes: dependencia nativa disponible.');}catch{add('sharp','error','No se pudo cargar la dependencia nativa de imágenes para esta plataforma; usa una distribución preparada para este sistema.');}
 const config=await readJson(configPath);add('config',config.error==='missing'?'warning':config.error||!validConfig(config.value)?'error':'ok',config.error==='missing'?'Runner aún no emparejado.':config.error||!validConfig(config.value)?'Configuración de emparejamiento no válida.':'Configuración de emparejamiento disponible; conexión y credencial no verificadas.');
 return {checks};
}
