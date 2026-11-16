const { AsyncLocalStorage } = require('node:async_hooks');

const activityStorage = new AsyncLocalStorage();

// Get the agent owning the current async chain; ordinary business requests have no agent context.
function getAiRequestActivity() {
  return activityStorage.getStore() || null;
}

// Execute in a specified agent context, including explicitly clearing context for unowned requests.
function runWithAiRequestActivity(activity, runner) {
  return activityStorage.run(activity, runner);
}

// Fix ownership at enqueue and restore it at dequeue/retry to avoid inheriting another request driving the queue.
function bindAiRequestActivity(runner) {
  const activity = getAiRequestActivity();
  return (...args) => runWithAiRequestActivity(activity, () => runner(...args));
}

// Report actual AI responses only; the owning agent decides whether to refresh activity and notify its parent.
function notifyAiResponse(activity = getAiRequestActivity()) {
  activity?.onResponse();
}

// Notify on every actual request success/failure, preserving original return values and errors.
async function withAiResponseActivity(runner) {
  const activity = getAiRequestActivity();
  try {
    return await runner();
  } finally {
    notifyAiResponse(activity);
  }
}

module.exports = {
  getAiRequestActivity,
  runWithAiRequestActivity,
  bindAiRequestActivity,
  notifyAiResponse,
  withAiResponseActivity,
};
