const minimumAge = 2 * 24 * 60 * 60 * 1000;
// Public release evidence for the two immutable non-registry archives already in the client lockfile.
const archiveEvidence = new Map([
  ['https://codeload.github.com/WiseLibs/better-sqlite3/tar.gz/refs/tags/v12.12.0|sha512-2w7ZEBmFwlHAZ3qIDqJY4hvfttqyChAuIh8s7rT8tNpJPwZv8R0VhsN0YYkLvQGhyTILFgQMxLA+1bF3W4N+Mw==', '2026-07-15T06:13:00Z'],
  ['https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz|sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==', '2024-07-12T15:47:14Z'],
]);
export function lockFromPnpmList(list, lockText) {
  const packages = {};
  const stack = [...list];
  let index = 0;
  while (stack.length) {
    const item = stack.pop();
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, entry] of Object.entries(item[group] || {})) {
        stack.push(entry);
        if (!entry.version) continue;
        if (!entry.resolved) throw new Error(`${name}@${entry.version}: fuente sin fecha verificable`);
        const value = { name: entry.from || name, version: entry.version, resolved: entry.resolved };
        for (const evidence of archiveEvidence.keys()) {
          const [url, integrity] = evidence.split('|');
          if (url === entry.resolved && lockText.split('\n').some(line => line.includes(`integrity: ${integrity}`) && line.includes(`tarball: ${url}`))) value.integrity = integrity;
        }
        packages[`node_modules/${index++}`] = value;
      }
    }
  }
  if (!index) throw new Error('El listado de dependencias de pnpm está vacío.');
  return { packages };
}
async function registryTimes(name) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`no se pudo consultar ${name}: HTTP ${response.status}`);
  return (await response.json()).time || {};
}
export async function verifyLockfile(lock, { now = Date.now(), fetchTimes = registryTimes } = {}) {
  if (!lock?.packages) throw new Error('El archivo de bloqueo no contiene paquetes verificables.');
  const entries = Object.entries(lock.packages).filter(([key, value]) => key && value.version && !value.link);
  const cache = new Map();
  const issues = [];
  let index = 0;
  async function worker() {
    while (index < entries.length) {
      const [key, entry] = entries[index++];
      const name = entry.name || key.split('node_modules/').pop();
      const source = entry.resolved || '';
      let published;
      if (source && !source.startsWith('https://registry.npmjs.org/')) {
        published = archiveEvidence.get(`${source}|${entry.integrity}`);
        if (!published) { issues.push(`${name}@${entry.version}: fuente sin fecha verificable`); continue; }
      } else {
        try {
          if (!cache.has(name)) cache.set(name, fetchTimes(name));
          const times = await cache.get(name);
          published = times[entry.version];
        } catch { issues.push(`${name}@${entry.version}: no se pudo verificar la fecha`); continue; }
      }
      const released = Date.parse(published);
      if (!Number.isFinite(released)) issues.push(`${name}@${entry.version}: fecha no disponible`);
      else if (now - released < minimumAge) issues.push(`${name}@${entry.version}: tiene menos de 2 días`);
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker));
  if (issues.length) throw new Error(`Instalación detenida: ${issues.length} paquetes no cumplen la política.\n${issues.sort().join('\n')}`);
  return entries.length;
}
