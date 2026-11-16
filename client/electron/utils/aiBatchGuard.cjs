const { AI_QUEUE_SCOPE_PAUSED } = require('./aiRequestQueue.cjs');

const AI_UPSTREAM_UNAVAILABLE = 'AI_UPSTREAM_UNAVAILABLE';
const AI_UPSTREAM_FAILURE_LIMIT = 10;

// Treat requests discarded by the queue on pause like signal aborts, not failures.
function isBatchCancelled(error, signal) {
  return Boolean(signal?.aborted) || error?.code === AI_QUEUE_SCOPE_PAUSED;
}

// Consecutive AI request failures without usable replies or intervening success mark the service unavailable and stop remaining batch dispatches.
// Validation failures with actual service responses reset the count; exclude pause, cancellation, and results after batch shutdown.
function createAiBatchGuard({ signal, limit = AI_UPSTREAM_FAILURE_LIMIT } = {}) {
  const controller = new AbortController();
  const batchSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let failures = 0;
  let tripped = null;
  return {
    signal: batchSignal,
    get error() { return tripped; },
    success() {
      if (!tripped) failures = 0;
    },
    failure(error) {
      if (tripped || isBatchCancelled(error, batchSignal)) return;
      if (error?.isAiRequestError !== true) {
        failures = 0;
        return;
      }
      failures += 1;
      if (failures < limit) return;
      tripped = new Error(`AI 服务连续 ${limit} 个请求失败，已停止派发剩余请求，已完成结果已保留，服务恢复后点击继续即可接着处理。最后一次错误：${error.message || error}`);
      tripped.code = AI_UPSTREAM_UNAVAILABLE;
      tripped.cause = error;
      controller.abort(tripped);
    },
  };
}

module.exports = {
  AI_UPSTREAM_FAILURE_LIMIT,
  AI_UPSTREAM_UNAVAILABLE,
  createAiBatchGuard,
  isBatchCancelled,
};
