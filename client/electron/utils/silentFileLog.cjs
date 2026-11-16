const fs = require('node:fs/promises');
const path = require('node:path');

const fileOperationTails = new Map();

// Generate stable shared queue keys per file while retaining actual write paths.
function resolveLogTarget(filePath) {
  const value = String(filePath || '').trim();
  if (!value) return null;

  const targetPath = path.resolve(value);
  return {
    targetPath,
    queueKey: process.platform === 'win32' ? targetPath.toLowerCase() : targetPath,
  };
}

// Enqueue file operations in a per-path FIFO; exceptions terminate only the current logging operation.
function enqueueFileOperation(filePath, operation) {
  try {
    const target = resolveLogTarget(filePath);
    if (!target) return;

    const previous = fileOperationTails.get(target.queueKey) || Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => operation(target.targetPath))
      .catch(() => undefined);

    fileOperationTails.set(target.queueKey, current);
    void current.then(() => {
      if (fileOperationTails.get(target.queueKey) === current) {
        fileOperationTails.delete(target.queueKey);
      }
    });
  } catch {
    // Diagnostic logging must not affect the main workflow.
  }
}

// Serialize JSON; outer handling silently discards unserializable logs.
function serializeJson(value, space) {
  const content = JSON.stringify(value, null, space);
  if (typeof content !== 'string') {
    throw new Error('日志内容无法序列化');
  }
  return content;
}

// Append one compact JSONL record asynchronously.
function enqueueJsonLine(filePath, entry) {
  enqueueFileOperation(filePath, async (targetPath) => {
    const content = `${serializeJson(entry)}\n`;
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.appendFile(targetPath, content, 'utf-8');
  });
}

// Overwrite JSON asynchronously, with best-effort old-file cleanup if final-state writes fail.
function enqueueJsonReplace(filePath, payload, options = {}) {
  try {
    const space = options.space;
    const removeOnFailure = options.removeOnFailure === true;
    enqueueFileOperation(filePath, async (targetPath) => {
      try {
        const content = serializeJson(payload, space);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, content, 'utf-8');
      } catch (error) {
        if (removeOnFailure) {
          try {
            await fs.rm(targetPath, { force: true });
          } catch {
            // Allow stale logs when the filesystem is unavailable.
          }
        }
        throw error;
      }
    });
  } catch {
    // Diagnostic logging must not affect the main workflow.
  }
}

// Delete log files asynchronously after pending writes finish.
function enqueueLogRemoval(filePath) {
  enqueueFileOperation(filePath, (targetPath) => fs.rm(targetPath, { force: true }));
}

module.exports = {
  enqueueJsonLine,
  enqueueJsonReplace,
  enqueueLogRemoval,
};
