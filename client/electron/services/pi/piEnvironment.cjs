const fs = require('node:fs');
const path = require('node:path');
const { getAgentRuntimeDir } = require('../../utils/paths.cjs');
const {
  applyAgentToolEnvironment,
  ensureAgentToolEnvironment,
  getAgentWorkspaceInstructions,
} = require('../agent/agentToolEnvironment.cjs');

const PI_RUNTIME_ID = 'pi';

// Create an isolated Pi runtime directory to avoid reading the user's Pi configuration.
function createPiEnvironmentLayout(app) {
  const runtimeRoot = path.join(getAgentRuntimeDir(app), PI_RUNTIME_ID);
  const serviceRoot = path.join(runtimeRoot, 'service');
  const homeDir = path.join(serviceRoot, 'home');
  return {
    runtimeRoot,
    serviceRoot,
    workspaceDir: path.join(serviceRoot, 'workspace'),
    tasksRoot: path.join(runtimeRoot, 'tasks'),
    homeDir,
    agentDir: path.join(homeDir, '.pi', 'agent'),
    tempDir: path.join(serviceRoot, 'tmp'),
  };
}

// Create required Pi directories and the shared command environment.
function preparePiEnvironment(app) {
  const layout = createPiEnvironmentLayout(app);
  Object.values(layout).forEach((directory) => fs.mkdirSync(directory, { recursive: true }));
  const toolEnvironment = ensureAgentToolEnvironment({
    app,
    runtimeRoot: layout.serviceRoot,
    workspaceDir: layout.workspaceDir,
    writeInstructions: false,
  });
  // Pi's native grep/find resolve tools in the Electron process, not the shell environment below.
  // Use the packaged binaries and disable Pi's automatic downloads in this offline client.
  const pathKey = process.platform === 'win32' && process.env.Path ? 'Path' : 'PATH';
  const existing = process.env[pathKey] || '';
  const entries = existing.split(path.delimiter).filter(Boolean);
  const bundled = toolEnvironment.bundledToolsBinDir;
  const equalPath = value => process.platform === 'win32' ? value.toLowerCase() === bundled.toLowerCase() : value === bundled;
  if (!entries.some(equalPath)) process.env[pathKey] = [bundled, ...entries].join(path.delimiter);
  if (process.platform === 'win32') process.env.PATH = process.env[pathKey];
  process.env.PI_CODING_AGENT_DIR = layout.agentDir;
  process.env.PI_OFFLINE = '1';
  const env = applyAgentToolEnvironment({
    ...process.env,
    HOME: layout.homeDir,
    USERPROFILE: layout.homeDir,
    TEMP: layout.tempDir,
    TMP: layout.tempDir,
    TMPDIR: layout.tempDir,
  }, toolEnvironment);
  const shellPath = process.platform === 'win32'
    ? path.join(process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : '/bin/sh';
  const shellCommandPrefix = process.platform === 'win32'
    ? [
      "@('cat', 'cp', 'ls', 'mkdir', 'mv', 'pwd', 'rm', 'sort') | ForEach-Object { Remove-Item -LiteralPath \"Alias:$_\" -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath \"Function:$_\" -Force -ErrorAction SilentlyContinue }",
      '[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)',
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
      '$OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    ].join('\n')
    : '';
  return {
    layout,
    env,
    shellPath,
    shellCommandPrefix,
    toolEnvironment,
    instructions: getAgentWorkspaceInstructions(process.platform),
  };
}

module.exports = {
  createPiEnvironmentLayout,
  preparePiEnvironment,
};
