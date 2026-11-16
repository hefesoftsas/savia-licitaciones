const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const VENDOR_ROOT = path.join(ROOT, 'vendor', 'agent-tools');

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function readArg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  const inline = process.argv.find((item) => item.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function verifyExecutable(filePath, command, expectedSha256) {
  if (!fs.existsSync(filePath)) throw new Error(`缺少智能体常用命令：${filePath}`);
  if (process.platform !== 'win32') fs.accessSync(filePath, fs.constants.X_OK);
  // Compare the binary hash against the preparation manifest to detect replacements.
  if (expectedSha256) {
    const actual = sha256File(filePath);
    if (actual !== expectedSha256) {
      throw new Error(`[seguridad] hash del binario ${command} no coincide con el manifiesto (${filePath})；posible sustitución.`);
    }
  } else {
    console.warn(`[seguridad] el manifiesto no registra hash para ${command}；verificación de hash omitida (manifiesto antiguo).`);
  }
  execFileSync(filePath, ['--version'], { stdio: 'pipe', timeout: 15000 });
  if (command === 'jq') execFileSync(filePath, ['-n', '1+1'], { stdio: 'pipe', timeout: 15000 });
}

// Validate target-platform versions and the resource manifest.
function verifyTargetMetadata(targetRoot, platform, arch, key) {
  const versionPath = path.join(targetRoot, 'VERSION');
  const manifestPath = path.join(targetRoot, 'manifest.json');
  if (!fs.existsSync(versionPath)) throw new Error(`缺少智能体工具版本文件：${versionPath}`);
  if (!fs.existsSync(manifestPath)) throw new Error(`缺少智能体工具清单：${manifestPath}`);

  const versions = Object.fromEntries(fs.readFileSync(versionPath, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split('=', 2)));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (manifest.platform !== platform || manifest.arch !== arch || manifest.key !== key || !Array.isArray(manifest.tools)) {
    throw new Error(`智能体工具清单与目标平台不一致：${manifestPath}`);
  }
  ['rg', 'fd', 'jq'].forEach((command) => {
    const tool = manifest.tools.find((item) => item.command === command);
    if (!versions[command] || !tool || tool.version !== versions[command]) {
      throw new Error(`智能体工具版本与清单不一致：${command}`);
    }
  });
  return manifest;
}

function main() {
  const platform = readArg('--platform', process.platform);
  const arch = readArg('--arch', process.arch);
  const key = `${platform}-${arch}`;
  const extension = platform === 'win32' ? '.exe' : '';
  const targetRoot = path.join(VENDOR_ROOT, key);
  const binDir = path.join(targetRoot, 'bin');
  verifyTargetMetadata(targetRoot, platform, arch, key);
  const manifest = JSON.parse(fs.readFileSync(path.join(targetRoot, 'manifest.json'), 'utf-8'));
  const hashByCommand = Object.fromEntries((manifest.tools || []).map((item) => [item.command, item.binary_sha256 || '']));
  ['rg', 'fd', 'jq'].forEach((command) => verifyExecutable(path.join(binDir, `${command}${extension}`), command, hashByCommand[command]));
  console.log(`Agent tools verified: ${binDir}`);
}

try { main(); } catch (error) { console.error(error?.stack || error?.message || String(error)); process.exit(1); }
