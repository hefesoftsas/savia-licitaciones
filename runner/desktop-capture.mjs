import { lstat, realpath } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { normalizeCompanyRegistry } = require('./electron/services/companyRegistry.cjs');
const { captureOfflineCompany } = require('./electron/services/companyBackupOffline.cjs');
const { writeCompanyBackupFile } = require('./electron/services/companyBackupFile.cjs');
const { normalizeExportFormat } = require('./electron/services/exportFormatDefaults.cjs');

class LocalDatabase {
 constructor(filename, options = {}) {
  if (options.fileMustExist && !existsSync(filename)) throw new Error('No se encuentra la base de datos.');
  this.name = filename; this.db = new DatabaseSync(filename, { readOnly: !!options.readonly });
 }
 exec(sql) { return this.db.exec(sql); }
 pragma(name, options = {}) {
  if (!['user_version', 'data_version', 'quick_check'].includes(name)) throw new Error('Consulta SQLite no permitida.');
  const rows = this.db.prepare(`PRAGMA ${name}`).all();
  return options.simple ? Object.values(rows[0] || {})[0] : rows;
 }
 backup(destination) { return backup(this.db, destination); }
 close() { this.db.close(); }
}
async function validatedRoot(userData) {
 if (typeof userData !== 'string' || !isAbsolute(userData)) throw new Error('Indica la ruta absoluta de los datos de Savia con --user-data.');
 const root = await realpath(userData); if (!(await lstat(root)).isDirectory()) throw new Error('La ruta de datos no es una carpeta.'); return root;
}
function readRegistry(root) {
 let config;
 try { config = JSON.parse(readFileSync(join(root, 'user_config.json'), 'utf8')); }
 catch (error) { if (error.code !== 'ENOENT') throw new Error('No se pudo leer la configuración de empresas.'); config = {}; }
 if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('La configuración de empresas no es válida.');
 if (config.company_workspaces === undefined) {
  let entries = []; try { entries = readdirSync(join(root, 'company-profiles'), { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (entries.some(entry => entry.isDirectory() && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(entry.name))) throw new Error('Falta el índice de empresas; conserva las carpetas para su recuperación.');
 }
 return normalizeCompanyRegistry(config?.company_workspaces);
}
export async function listDesktopCompanies(userData) {
 const root = await validatedRoot(userData); return readRegistry(root);
}
export async function createDesktopBackup({ userData, companyId, output }) {
 const root = await validatedRoot(userData);
 if (typeof output !== 'string' || !isAbsolute(output)) throw new Error('Indica una ruta absoluta nueva con --output.');
 const parent = await realpath(dirname(output)), rel = relative(root, parent);
 if (!rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) throw new Error('Guarda el respaldo fuera de la carpeta de datos de Savia.');
 try { await lstat(output); throw new Error('Ya existe un archivo en la ubicación seleccionada.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
 let capturedState;
 const archive = await captureOfflineCompany({ userData: root, companyId, Database: LocalDatabase, maxSchema: 69, configStore: { load: () => { capturedState = readRegistry(root); return { company_workspaces: capturedState }; } } });
 writeCompanyBackupFile(output, archive);
 return { companyId, companyName: capturedState.companies.find(company => company.id === companyId).name };
}

// Desktop backups intentionally exclude shared settings; read only the selected format directly.
export async function readDesktopExportFormat(userData) {
 const root=await validatedRoot(userData),file=join(root,'user_config.json'),info=await lstat(file);
 if(!info.isFile()||info.isSymbolicLink()||info.size>1024*1024)throw new Error('La configuración de escritorio no es compatible.');
 let config;try{config=JSON.parse(readFileSync(file,'utf8'));}catch{throw new Error('No se pudo leer la configuración de escritorio.');}
 if(!config?.export_format||typeof config.export_format!=='object'||Array.isArray(config.export_format))throw new Error('La configuración no contiene un formato de exportación.');
 return normalizeExportFormat(config.export_format);
}
