import { cp, mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { basename, dirname, resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function argument(name) { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; }
const bundleArg = argument('--bundle'), outputArg = argument('--output');
if (!bundleArg || !outputArg || !isAbsolute(bundleArg) || !isAbsolute(outputArg)) throw new Error('Usa --bundle y --output con rutas absolutas; output debe ser una carpeta nueva.');
const bundle = await realpath(bundleArg), output = join(await realpath(dirname(resolve(outputArg))), basename(resolve(outputArg))), target = `${process.platform}-${process.arch}`;
if (!['darwin-arm64','darwin-x64','win32-x64','linux-x64','linux-arm64'].includes(target)) throw new Error(`Plataforma no compatible: ${target}`);
const manifest = JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8'));
if (manifest.format !== 1 || manifest.platform !== process.platform || manifest.arch !== process.arch) throw new Error('El runner debe estar preparado en la misma plataforma y arquitectura.');
await mkdir(output); // Never overwrite an existing build.
const staging = join(output, 'staging');
await mkdir(staging);
function execute(command, parameters, options = {}) {
  const result = spawnSync(command, parameters, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`La preparación falló: ${result.status ?? result.signal}`);
  return result;
}
const app = join(staging, 'app');
await cp(join(root, 'connector/app'), app, { recursive: true });
const clientRequire = createRequire(join(root, 'client/package.json'));
const electronVersion = clientRequire('electron/package.json').version;
const config = {
  appId: 'app.savia.connector', productName: 'Savia Conector', electronVersion,
  directories: { app, output: join(output, 'installers'), buildResources: join(root, 'client/assets') },
  files: ['**/*'], asar: true, npmRebuild: false,
  extraResources: [{ from: bundle, to: 'runner-bundle', filter: ['**/*', '!runtime{,/**/*}'] }],
  artifactName: 'Savia-Conector-${version}-${os}-${arch}.${ext}',
  electronLanguages: ['es', 'en', 'en-US', 'en-GB'],
  mac: { target: ['dmg'], icon: join(root, 'client/assets/icon.icns'), category: 'public.app-category.productivity', identity: null },
  win: { target: ['nsis'], icon: join(root, 'client/assets/icon.ico') },
  linux: { target: ['AppImage'], category: 'Utility', executableName: 'savia-conector', icon: join(root, 'connector/app/savia.svg') },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, shortcutName: 'Savia Conector', deleteAppDataOnUninstall: false, installerLanguages: ['es_ES', 'en_US'], displayLanguageSelector: false },
  publish: null
};
await writeFile(join(staging, 'builder.json'), JSON.stringify(config, null, 2), 'utf8');
const builder = clientRequire.resolve('electron-builder/cli.js');
execute(process.execPath, [builder, '--projectDir', app, '--config', join(staging, 'builder.json'), process.platform === 'darwin' ? '--mac' : process.platform === 'win32' ? '--win' : '--linux', `--${process.arch}`, '--publish', 'never']);
const packaged = process.platform === 'darwin'
  ? join(output,'installers',process.arch==='arm64'?'mac-arm64':'mac','Savia Conector.app','Contents')
  : process.platform === 'win32'
    ? join(output,'installers','win-unpacked')
    : join(output,'installers',process.arch==='arm64'?'linux-arm64-unpacked':'linux-unpacked');
const executable = process.platform === 'darwin' ? join(packaged,'MacOS','Savia Conector') : process.platform === 'win32' ? join(packaged,'Savia Conector.exe') : join(packaged,'savia-conector');
const packagedBundle = join(packaged,process.platform==='darwin'?'Resources':'resources','runner-bundle');
execute(executable,[join(packagedBundle,'runner/cli.mjs'),'doctor','--config',join(staging,'unpaired.json')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
execute(executable,[join(root,'connector/verify-documents.mjs'),packagedBundle],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
execute(process.execPath,[join(root,'connector/smoke.mjs'),'--bundle',packagedBundle,'--node',executable,'--electron-runtime']);
console.log(`Instaladores preparados y comprobados en ${join(output, 'installers')}`);
