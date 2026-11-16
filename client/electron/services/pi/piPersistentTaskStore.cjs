const fs = require('node:fs');
const path = require('node:path');
const { createPiEnvironmentLayout } = require('./piEnvironment.cjs');

const TASK_STATE_FILE = 'task-state.json';
const DELETE_MAX_RETRIES = 5;
const DELETE_RETRY_DELAY_MS = 100;

function nowIso() {
  return new Date().toISOString();
}

function safeTaskKey(value) {
  const key = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  if (!key) throw new Error('持久 Agent 任务缺少有效任务标识');
  return key;
}

// Compute task-specific directory layouts dynamically from Electron userData.
function getPersistentAgentTaskPaths(app, taskKey) {
  const layout = createPiEnvironmentLayout(app);
  const taskRoot = path.join(layout.tasksRoot, safeTaskKey(taskKey));
  return {
    taskRoot,
    workspaceDir: path.join(taskRoot, 'workspace'),
    sessionsDir: path.join(taskRoot, 'sessions'),
    stateFile: path.join(taskRoot, TASK_STATE_FILE),
    resultFile: path.join(taskRoot, 'result.json'),
  };
}

// Resolve session filenames in state files against the current user's dynamic task directory.
function getPersistentAgentSessionPath(app, taskKey, sessionFile) {
  const fileName = String(sessionFile || '').trim();
  if (!fileName || path.basename(fileName) !== fileName || !fileName.endsWith('.jsonl')) {
    throw new Error('持久 Agent Session 文件名无效，请重新执行当前业务任务');
  }
  return path.join(getPersistentAgentTaskPaths(app, taskKey).sessionsDir, fileName);
}

// Delete persistent task directories; Windows file-handle release may lag briefly, requiring Node's native retry handling.
function removePersistentAgentTaskRoot(taskRoot) {
  fs.rmSync(taskRoot, {
    recursive: true,
    force: true,
    maxRetries: DELETE_MAX_RETRIES,
    retryDelay: DELETE_RETRY_DELAY_MS,
  });
}

// Create fresh persistent task directories; regenerating the same business task clears previous artifacts.
function createPersistentAgentTask(app, taskKey, state = {}) {
  const paths = getPersistentAgentTaskPaths(app, taskKey);
  removePersistentAgentTaskRoot(paths.taskRoot);
  fs.mkdirSync(paths.workspaceDir, { recursive: true });
  fs.mkdirSync(paths.sessionsDir, { recursive: true });
  const nextState = {
    task_key: taskKey,
    status: 'created',
    created_at: nowIso(),
    updated_at: nowIso(),
    ...state,
  };
  fs.writeFileSync(paths.stateFile, JSON.stringify(nextState, null, 2), 'utf-8');
  return { paths, state: nextState };
}

// Read persistent agent checkpoints, returning null if absent.
function loadPersistentAgentTask(app, taskKey) {
  const paths = getPersistentAgentTaskPaths(app, taskKey);
  if (!fs.existsSync(paths.stateFile)) return null;
  try {
    const state = JSON.parse(fs.readFileSync(paths.stateFile, 'utf-8'));
    return { paths, state };
  } catch (error) {
    throw new Error(`持久 Agent 任务状态损坏：${error?.message || String(error)}`);
  }
}

// Update persistent checkpoints while preserving task creation time.
function updatePersistentAgentTask(app, taskKey, partial = {}) {
  const current = loadPersistentAgentTask(app, taskKey);
  if (!current) throw new Error('持久 Agent 任务不存在，请重新执行当前业务任务');
  const nextState = {
    ...current.state,
    ...partial,
    task_key: taskKey,
    updated_at: nowIso(),
  };
  fs.writeFileSync(current.paths.stateFile, JSON.stringify(nextState, null, 2), 'utf-8');
  return { paths: current.paths, state: nextState };
}

// Delete the complete agent workspace, session, and checkpoint associated with business content.
function deletePersistentAgentTask(app, taskKey) {
  const paths = getPersistentAgentTaskPaths(app, taskKey);
  removePersistentAgentTaskRoot(paths.taskRoot);
}

module.exports = {
  createPersistentAgentTask,
  deletePersistentAgentTask,
  getPersistentAgentSessionPath,
  getPersistentAgentTaskPaths,
  loadPersistentAgentTask,
  updatePersistentAgentTask,
};
