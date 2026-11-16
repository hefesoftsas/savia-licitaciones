const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MANIFEST_FILE = 'manifest.json';
const COPIES_DIR = 'files';
const RECORDS_DIR = 'records';

function hashOf(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Normalize registration keys to workspace-relative POSIX paths so resumed tasks identify the same files.
function toRelative(workspaceDir, file) {
  const relative = path.relative(path.resolve(workspaceDir), path.resolve(workspaceDir, String(file || '')));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`受保护文件必须位于工作区内：${file}`);
  return relative.split(path.sep).join('/');
}

// Keep originals of program-written, agent-protected files outside the workspace; compare before submission and restore changed/deleted files.
// Callers name groups; replacing one group leaves others intact. Persist registrations with task directories across pause/resume.
function createWorkspaceBaseline({ workspaceDir, baselineDir }) {
  const manifestPath = path.join(baselineDir, MANIFEST_FILE);
  const copiesDir = path.join(baselineDir, COPIES_DIR);
  let groups = {};
  try {
    groups = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).groups || {};
  } catch {}

  // Also delete original copies no longer referenced by any group.
  function save() {
    fs.mkdirSync(copiesDir, { recursive: true });
    const used = new Set(Object.values(groups).flatMap(entries => Object.values(entries).map(entry => entry.hash)));
    for (const name of fs.readdirSync(copiesDir)) {
      if (!used.has(name)) fs.rmSync(path.join(copiesDir, name), { force: true });
    }
    fs.writeFileSync(`${manifestPath}.tmp`, JSON.stringify({ groups }, null, 2), 'utf8');
    fs.renameSync(`${manifestPath}.tmp`, manifestPath);
  }

  // Record current content and file state; do not register missing files.
  function snapshot(relative) {
    const absolute = path.join(workspaceDir, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
    const buffer = fs.readFileSync(absolute);
    const hash = hashOf(buffer);
    const copy = path.join(copiesDir, hash);
    if (!fs.existsSync(copy)) {
      fs.mkdirSync(copiesDir, { recursive: true });
      fs.writeFileSync(copy, buffer);
    }
    const { size, mtimeMs } = fs.statSync(absolute);
    return { hash, size, mtime: mtimeMs };
  }

  function entriesFor(files) {
    return Object.fromEntries(files.map(file => toRelative(workspaceDir, file))
      .map(relative => [relative, snapshot(relative)])
      .filter(([, entry]) => entry));
  }

  return {
    // Add or refresh registrations after the program itself rewrites protected files.
    protect(group, files) {
      if (!files.length) return;
      groups[group] = { ...groups[group], ...entriesFor(files) };
      save();
    },
    // Replace an entire group with current content.
    setGroup(group, files) {
      groups[group] = entriesFor(files);
      save();
    },
    // Unregister files handed to the agent for editing so they are no longer restored.
    release(group, files) {
      const entries = { ...groups[group] };
      for (const file of files) delete entries[toRelative(workspaceDir, file)];
      groups[group] = entries;
      save();
    },
    files(group) {
      return Object.keys(groups[group] || {});
    },
    // Treat unchanged size/mtime as unmodified; compare other files by content hash and restore as needed, returning relative restored paths.
    restore() {
      const restored = new Set();
      for (const entries of Object.values(groups)) {
        for (const [relative, entry] of Object.entries(entries)) {
          const absolute = path.join(workspaceDir, relative);
          const stat = fs.existsSync(absolute) ? fs.statSync(absolute) : null;
          if (stat?.isFile() && stat.size === entry.size && stat.mtimeMs === entry.mtime) continue;
          if (stat?.isFile() && hashOf(fs.readFileSync(absolute)) === entry.hash) {
            entry.mtime = stat.mtimeMs;
            continue;
          }
          fs.mkdirSync(path.dirname(absolute), { recursive: true });
          fs.copyFileSync(path.join(copiesDir, entry.hash), absolute);
          entry.mtime = fs.statSync(absolute).mtimeMs;
          restored.add(relative);
        }
      }
      save();
      return [...restored];
    },
    // Business code stores validation evidence, such as original image blocks, in the same task directory outside the agent workspace.
    saveRecord(name, value) {
      const file = path.join(baselineDir, RECORDS_DIR, `${name}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(value), 'utf8');
      fs.renameSync(`${file}.tmp`, file);
    },
    loadRecord(name) {
      try {
        return JSON.parse(fs.readFileSync(path.join(baselineDir, RECORDS_DIR, `${name}.json`), 'utf8'));
      } catch {
        return null;
      }
    },
  };
}

module.exports = { createWorkspaceBaseline };
