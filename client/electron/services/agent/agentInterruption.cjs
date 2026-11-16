const EXPECTED_INTERRUPTION_CODES = new Set([
  'AGENT_DISCONNECTED',
  'AI_QUEUE_SCOPE_PAUSED',
  'CONTENT_GENERATION_PAUSED',
  'TASK_CANCELLED',
]);

// Convert the parent task's default AbortError into a task cancellation error with a stable code.
function resolveAgentAbortReason(signal, fallbackMessage = 'Agent 任务已取消') {
  const reason = signal?.reason;
  if (reason instanceof Error && reason.name !== 'AbortError') return reason;
  const error = new Error(reason && reason.name !== 'AbortError' ? String(reason) : fallbackMessage);
  error.code = 'TASK_CANCELLED';
  return error;
}

// Identify normal interruptions caused by user actions or the app lifecycle so they do not count as agent failures.
function isExpectedAgentInterruption(error) {
  const code = String(error?.code || error?.cause?.code || '');
  const message = String(error?.message || error || '');
  return EXPECTED_INTERRUPTION_CODES.has(code)
    || message === 'CONTENT_GENERATION_PAUSED'
    || message.includes('请求已取消')
    || message.includes('任务已取消')
    || message.includes('服务正在关闭')
    || message.includes('队列已暂停');
}

module.exports = {
  isExpectedAgentInterruption,
  resolveAgentAbortReason,
};
