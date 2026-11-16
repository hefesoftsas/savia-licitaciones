'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// The temporary file is in the destination directory so publishing does not
// cross filesystems. A hard link publishes only when the destination is absent.
function writeCompanyBackupFile(destination, bytes) {
  if (typeof destination !== 'string' || !path.isAbsolute(destination) || !Buffer.isBuffer(bytes)) {
    throw new Error('No se pudo preparar el archivo de respaldo.');
  }
  const temporary = path.join(path.dirname(destination), `.savia-backup-${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    try { fs.linkSync(temporary, destination); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('Ya existe un archivo en la ubicación seleccionada. Elige otro nombre.');
      throw error;
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temporary, { force: true });
  }
}
module.exports = { writeCompanyBackupFile };
