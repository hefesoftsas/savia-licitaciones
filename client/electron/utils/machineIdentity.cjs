const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const brand = require('../../brand.json');

const PROJECT_NAME = brand.identity.projectName;
const APP_ID = brand.identity.appId;
const CLIENT_ID_VERSION = 'machine-v1';

// Read the Windows installation identifier.
function readWindowsMachineGuid() {
  try {
    const output = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 3000,
    });
    return output.match(/MachineGuid\s+REG_\w+\s+([^\r\n]+)/i)?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

// Read the macOS hardware identifier.
function readMacMachineId() {
  try {
    const output = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
      encoding: 'utf-8',
      timeout: 3000,
    });
    return output.match(/"IOPlatformUUID"\s+=\s+"([^"]+)"/)?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

// Read the Linux installation identifier.
function readLinuxMachineId() {
  for (const filePath of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try {
      const value = fs.readFileSync(filePath, 'utf-8').trim();
      if (value) return value;
    } catch {}
  }
  return '';
}

// Return a stable machine identifier for the current OS.
function getOsMachineId() {
  const value = process.platform === 'win32'
    ? readWindowsMachineGuid()
    : process.platform === 'darwin'
    ? readMacMachineId()
    : readLinuxMachineId();
  return value || `${process.platform}:${os.hostname()}`;
}

// Generate a repeatable machine-hash ID only when configuration lacks a Client ID.
function createAnalyticsClientId() {
  const digest = crypto.createHash('sha256')
    .update(`${CLIENT_ID_VERSION}\0${PROJECT_NAME}\0${APP_ID}\0${getOsMachineId()}`, 'utf-8')
    .digest('hex');
  return `${CLIENT_ID_VERSION}-${digest}`;
}

module.exports = {
  createAnalyticsClientId,
  getOsMachineId,
};
