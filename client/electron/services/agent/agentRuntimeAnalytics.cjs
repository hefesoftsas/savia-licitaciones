// Telemetry removed: preserve the signature to keep callers unchanged;
// no network requests are made.
function trackAgentRuntime(app, configStore, status, meta = {}) {
  return undefined;
}

module.exports = {
  trackAgentRuntime,
};
