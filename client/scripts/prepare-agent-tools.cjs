const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const AdmZip = require('adm-zip');

const ROOT = path.resolve(__dirname, '..');
const VENDOR_ROOT = path.join(ROOT, 'vendor', 'agent-tools');

// Pinned SHA256 hashes of official assets downloaded directly from GitHub,
// verified on 2026-10-24. Guard against silent asset replacement in
// releases or malicious redirects: if an asset changes, preparation fails
// instead of packaging an unknown binary.
// Hashes also pin the Linux assets used for container preparation.
const TOOL_SHA256 = {
  rg: {
    'linux-x64': '4cf9f2741e6c465ffdb7c26f38056a59e2a2544b51f7cc128ef28337eeae4d8e',
    'linux-arm64': 'c827481c4ff4ea10c9dc7a4022c8de5db34a5737cb74484d62eb94a95841ab2f',
    'win32-x64': 'd0f534024c42afd6cb4d38907c25cd2b249b79bbe6cc1dbee8e3e37c2b6e25a1',
    'darwin-x64': 'fc87e78f7cb3fea12d69072e7ef3b21509754717b746368fd40d88963630e2b3',
    'darwin-arm64': '24ad76777745fbff131c8fbc466742b011f925bfa4fffa2ded6def23b5b937be',
  },
  fd: {
    'linux-x64': '2b6bfaae8c48f12050813c2ffe1884c61ea26e750d803df9c9114550a314cd14',
    'linux-arm64': '66f297e404400a3358e9a0c0b2f3f4725956e7e4435427a9ae56e22adbe73a68',
    'win32-x64': '318aa2a6fa664325933e81fda60d523fff29444129e91ebf0726b5b3bcd8b059',
    'darwin-x64': '50d30f13fe3d5914b14c4fff5abcbd4d0cdab4b855970a6956f4f006c17117a3',
    'darwin-arm64': '0570263812089120bc2a5d84f9e65cd0c25e4a4d724c80075c357239c74ae904',
  },
  jq: {
    'linux-x64': '5942c9b0934e510ee61eb3e30273f1b3fe2590df93933a93d7c58b81d19c8ff5',
    'linux-arm64': '4dd2d8a0661df0b22f1bb9a1f9830f06b6f3b8f7d91211a1ef5d7c4f06a8b4a5',
    'win32-x64': '7451fbbf37feffb9bf262bd97c54f0da558c63f0748e64152dd87b0a07b6d6ab',
    'darwin-x64': '4155822bbf5ea90f5c79cf254665975eb4274d426d0709770c21774de5407443',
    'darwin-arm64': '0bbe619e663e0de2c550be2fe0d240d076799d6f8a652b70fa04aea8a8362e8a',
  },
};

const TOOL_SOURCES = {
  rg: {
    repo: 'BurntSushi/ripgrep',
    versionEnv: 'RIPGREP_VERSION',
    assetEnv: 'RIPGREP_ASSET_URL',
    defaultVersion: '14.1.1',
    patterns: {
      'linux-x64': [/ripgrep-.*x86_64-unknown-linux-musl\.tar\.gz$/i],
      'linux-arm64': [/ripgrep-.*aarch64-unknown-linux-gnu\.tar\.gz$/i],
      'win32-x64': [/ripgrep-.*x86_64-pc-windows-msvc\.zip$/i],
      'darwin-x64': [/ripgrep-.*x86_64-apple-darwin\.tar\.gz$/i],
      'darwin-arm64': [/ripgrep-.*aarch64-apple-darwin\.tar\.gz$/i],
    },
    binaryPattern: /^rg(\.exe)?$/i,
  },
  fd: {
    repo: 'sharkdp/fd',
    versionEnv: 'FD_VERSION',
    assetEnv: 'FD_ASSET_URL',
    defaultVersion: 'v10.3.0',
    patterns: {
      'linux-x64': [/fd-.*x86_64-unknown-linux-musl\.tar\.gz$/i],
      'linux-arm64': [/fd-.*aarch64-unknown-linux-gnu\.tar\.gz$/i],
      'win32-x64': [/fd-.*x86_64-pc-windows-msvc\.zip$/i],
      'darwin-x64': [/fd-.*x86_64-apple-darwin\.tar\.gz$/i],
      'darwin-arm64': [/fd-.*aarch64-apple-darwin\.tar\.gz$/i],
    },
    binaryPattern: /^fd(\.exe)?$/i,
  },
  jq: {
    repo: 'jqlang/jq',
    versionEnv: 'JQ_VERSION',
    assetEnv: 'JQ_ASSET_URL',
    defaultVersion: 'jq-1.7.1',
    patterns: {
      'linux-x64': [/jq-linux-amd64$/i],
      'linux-arm64': [/jq-linux-arm64$/i],
      'win32-x64': [/jq-windows-amd64\.exe$/i],
      'darwin-x64': [/jq-macos-amd64$/i],
      'darwin-arm64': [/jq-macos-arm64$/i],
    },
    binaryPattern: /^jq(\.exe)?$|^jq-(windows|macos|linux)/i,
  },
};

function readArg(name, fallback = '') {
  const prefix = `${name}=`;
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  const inline = process.argv.find((item) => item.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'savia-agent-tools-preparer', Accept: 'application/vnd.github+json' };
    https.get(url, { headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub API 请求失败 ${res.statusCode}: ${body.slice(0, 500)}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, targetPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const file = fs.createWriteStream(targetPath);
    const request = (currentUrl, redirectCount = 0) => {
      https.get(currentUrl, { headers: { 'User-Agent': 'savia-agent-tools-preparer' } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirectCount > 5) return reject(new Error('下载智能体命令工具重定向过多'));
          request(new URL(res.headers.location, currentUrl).toString(), redirectCount + 1);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`下载智能体命令工具失败：HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      }).on('error', reject);
    };
    file.on('error', reject);
    request(url);
  });
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

// Compare downloaded asset hashes with pinned values. Without a pinned hash
// (custom version from the environment), warn and continue at the operator's
// discretion; with a pinned hash, any mismatch aborts preparation.
function verifyAssetHash(command, asset, downloadPath, key) {
  const expected = (TOOL_SHA256[command] || {})[key];
  const actual = sha256File(downloadPath);
  if (!expected) {
    console.warn(`[seguridad] sin hash fijado para ${command} ${key} (${asset.name}); se acepta el asset descargado. Fija el hash antes de publicar.`);
    return actual;
  }
  if (actual !== expected) {
    fs.rmSync(downloadPath, { force: true });
    throw new Error(`[seguridad] hash SHA256 inesperado para ${command} ${key}: esperado ${expected}, obtenido ${actual}. Posible asset sustituido; descarga rechazada.`);
  }
  return actual;
}

function findAsset(release, source, key) {
  if (process.env[source.assetEnv]) {
    return { name: path.basename(new URL(process.env[source.assetEnv]).pathname), browser_download_url: process.env[source.assetEnv] };
  }
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const patterns = source.patterns[key] || [];
  for (const pattern of patterns) {
    const matched = assets.find((asset) => pattern.test(asset.name));
    if (matched) return matched;
  }
  throw new Error(`没有找到 ${key} 对应的工具 release asset。可用资产：\n${assets.map((asset) => asset.name).join('\n')}`);
}

function walkFiles(dir) {
  return fs.readdirSync(dir).flatMap((name) => {
    const filePath = path.join(dir, name);
    return fs.statSync(filePath).isDirectory() ? walkFiles(filePath) : [filePath];
  });
}

function extractAsset(assetPath, extractDir) {
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  if (/\.zip$/i.test(assetPath)) {
    new AdmZip(assetPath).extractAllTo(extractDir, true);
    return extractDir;
  }
  if (/\.(tar\.gz|tgz)$/i.test(assetPath)) {
    execFileSync('tar', ['-xzf', assetPath, '-C', extractDir], { stdio: 'pipe' });
    return extractDir;
  }
  return '';
}

function findBinary(assetPath, extractDir, source) {
  if (!extractDir) return assetPath;
  const files = walkFiles(extractDir);
  const matched = files.find((file) => source.binaryPattern.test(path.basename(file)));
  if (!matched) throw new Error(`解压后没有找到工具可执行文件：${assetPath}`);
  return matched;
}

function verifyExecutable(filePath, command) {
  execFileSync(filePath, ['--version'], { stdio: 'pipe', timeout: 15000 });
  if (command === 'jq') {
    execFileSync(filePath, ['-n', '1+1'], { stdio: 'pipe', timeout: 15000 });
  }
}

// Read the target tool version.
function getRequestedVersion(source) {
  return String(process.env[source.versionEnv] || source.defaultVersion).trim();
}

// Build the executable name for the target platform.
function getExecutableName(command, platform) {
  return platform === 'win32' ? `${command}.exe` : command;
}

// Execute binaries only when host and target match exactly; leave cross-platform validation to the corresponding release job.
function canExecuteTarget(platform, arch) {
  return platform === process.platform && arch === process.arch;
}

// Download and organize one target-platform tool.
async function prepareTool({ command, source, key, platform, arch, tmpRoot, binDir, verifyAfterCopy }) {
  const version = getRequestedVersion(source);
  const release = await requestJson(`https://api.github.com/repos/${source.repo}/releases/tags/${encodeURIComponent(version)}`);
  const asset = findAsset(release, source, key);
  const downloadPath = path.join(tmpRoot, `${command}-${asset.name}`);
  const extractDir = path.join(tmpRoot, `${command}-extract`);
  await downloadFile(asset.browser_download_url, downloadPath);
  const assetSha256 = verifyAssetHash(command, asset, downloadPath, key);
  const extractedDir = extractAsset(downloadPath, extractDir);
  const binaryPath = findBinary(downloadPath, extractedDir, source);
  const targetName = getExecutableName(command, platform);
  const targetPath = path.join(binDir, targetName);
  fs.copyFileSync(binaryPath, targetPath);
  if (platform !== 'win32') fs.chmodSync(targetPath, 0o755);
  if (verifyAfterCopy) verifyExecutable(targetPath, command);
  return { command, version, repo: source.repo, asset: asset.name, sha256: assetSha256, binary_sha256: sha256File(targetPath), platform, arch, key };
}

async function main() {
  const platform = readArg('--platform', process.platform);
  const arch = readArg('--arch', process.arch);
  const key = `${platform}-${arch}`;
  if (!['win32-x64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64'].includes(key)) {
    throw new Error(`不支持的工具平台，当前为 ${key}`);
  }

  const targetRoot = path.join(VENDOR_ROOT, key);
  const tmpRoot = path.join(ROOT, '.tmp-agent-tools-download', key);
  const stagedTargetRoot = path.join(tmpRoot, 'staged-target');
  const stagedBinDir = path.join(stagedTargetRoot, 'bin');
  const verifyAfterCopy = canExecuteTarget(platform, arch);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.mkdirSync(stagedBinDir, { recursive: true });

  try {
    const tools = [];
    for (const command of ['rg', 'fd', 'jq']) {
      tools.push(await prepareTool({
        command,
        source: TOOL_SOURCES[command],
        key,
        platform,
        arch,
        tmpRoot,
        binDir: stagedBinDir,
        verifyAfterCopy,
      }));
    }

    fs.writeFileSync(path.join(stagedTargetRoot, 'manifest.json'), JSON.stringify({
      platform,
      arch,
      key,
      tools,
      prepared_at: new Date().toISOString(),
    }, null, 2), 'utf-8');
    fs.writeFileSync(path.join(stagedTargetRoot, 'VERSION'), tools.map((item) => `${item.command}=${item.version}`).join('\n') + '\n', 'utf-8');

    fs.mkdirSync(VENDOR_ROOT, { recursive: true });
    fs.rmSync(targetRoot, { recursive: true, force: true });
    fs.renameSync(stagedTargetRoot, targetRoot);
    console.log(`Prepared Agent tools: ${path.join(targetRoot, 'bin')}`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error?.stack || error?.message || String(error)); process.exit(1); });
