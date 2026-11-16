import { chmod, link, mkdir, open, readFile, readdir, rm } from 'node:fs/promises';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join } from 'node:path';

const maxPayloadBytes = 5_000_000;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const filename = jobId => { if (!idPattern.test(jobId)) throw new Error('Identificador de tarea no válido.'); return `${jobId}.json`; };
async function entries(path, state) {
  try { return (await readdir(path)).filter(name => idPattern.test(name.replace(/\.json$/, '')) && name.endsWith('.json')).map(name => ({ jobId: name.slice(0, -5), state })); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
export async function hasOutboxFiles(directory) {
  return (await entries(directory, 'pending')).length > 0 || (await entries(join(directory, 'rejected'), 'rejected')).length > 0;
}
export function createOutbox({ directory, server, runnerId, token, exportPublish = link }) {
  if (!isAbsolute(directory) || !server || !runnerId || typeof token !== 'string' || !token) throw new Error('Configuración de recuperación no válida.');
  const key = Buffer.from(hkdfSync('sha256', Buffer.from(token), Buffer.from(server), Buffer.from(`savia-runner-outbox-v1:${runnerId}`), 32));
  const rejected = join(directory, 'rejected');
  const pathFor = (jobId, state) => join(state === 'pending' ? directory : state === 'rejected' ? rejected : (() => { throw new Error('Estado no válido.'); })(), filename(jobId));
  const aad = jobId => Buffer.from(JSON.stringify([1, server, runnerId, jobId]));
  async function read(jobId, state) {
    const envelope = JSON.parse(await readFile(pathFor(jobId, state), 'utf8'));
    if (envelope.version !== 1 || typeof envelope.iv !== 'string' || typeof envelope.tag !== 'string' || typeof envelope.data !== 'string') throw new Error('Resultado de recuperación inválido.');
    const iv = Buffer.from(envelope.iv, 'base64'), tag = Buffer.from(envelope.tag, 'base64'), data = Buffer.from(envelope.data, 'base64');
    if (iv.length !== 12 || tag.length !== 16 || data.length > maxPayloadBytes) throw new Error('Resultado de recuperación inválido.');
    const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAAD(aad(jobId)); decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
  }
  async function save(jobId, completion) {
    const path = pathFor(jobId, 'pending');
    const payload = Buffer.from(JSON.stringify(completion), 'utf8');
    if (payload.length > maxPayloadBytes) throw new Error('El resultado supera el límite de tamaño de la copia recuperable.');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(aad(jobId));
    const data = Buffer.concat([cipher.update(payload), cipher.final()]);
    const encoded = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
    const temporary = join(directory, `.${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(encoded, 'utf8'); await file.sync(); } finally { await file.close(); }
      try { await link(temporary, path); }
      catch (error) { if (error.code !== 'EEXIST' || JSON.stringify(await read(jobId, 'pending')) !== JSON.stringify(completion)) throw error; }
    } finally { await rm(temporary, { force: true }); }
  }
  async function list() { return [...await entries(directory, 'pending'), ...await entries(rejected, 'rejected')].sort((a, b) => a.jobId.localeCompare(b.jobId) || a.state.localeCompare(b.state)); }
  async function reject(jobId) {
    await mkdir(rejected, { recursive: true, mode: 0o700 });
    const from = pathFor(jobId, 'pending'), to = pathFor(jobId, 'rejected');
    try { await link(from, to); }
    catch (error) { if (error.code !== 'EEXIST' || JSON.stringify(await read(jobId, 'pending')) !== JSON.stringify(await read(jobId, 'rejected'))) throw error; }
    await rm(from);
  }
  async function remove(jobId, state) { await rm(pathFor(jobId, state), { force: true }); }
  async function exportResult(jobId, destination) {
    if (!isAbsolute(destination)) throw new Error('La ruta de exportación debe ser absoluta.');
    const all = await list(), item = all.find(value => value.jobId === jobId && value.state === 'rejected') || all.find(value => value.jobId === jobId);
    if (!item) throw new Error('Resultado no encontrado.');
    const completion = await read(jobId, item.state);
    const temporary = join(dirname(destination), `.savia-${randomUUID()}.tmp`);
    let file;
    try {
      file = await open(temporary, 'wx', 0o600);
      await file.writeFile(JSON.stringify({ jobId, status: completion.status, result: completion.result }, null, 2) + '\n', 'utf8');
      await file.sync(); await file.close(); file = null;
      await exportPublish(temporary, destination);
      if (process.platform !== 'win32') await chmod(destination, 0o600);
    } finally { if (file) await file.close().catch(() => {}); await rm(temporary, { force: true }); }
  }
  return { save, read, list, reject, remove, export: exportResult };
}
