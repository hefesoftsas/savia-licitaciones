'use strict';

function hasPriceCap(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => (key === 'max_price' && item != null) || hasPriceCap(item));
}

// The evaluator never returns the key; it only decides whether a real run is eligible.
function inspectEvaluationConfig(config) {
  if (config?.text_model_provider !== 'opencode-go') return { ready: false, reason: 'provider' };
  const profile = config.text_model_profiles?.['opencode-go'] || {};
  if (!(config.api_key ?? profile.api_key) || !(config.model_name ?? profile.model_name)) return { ready: false, reason: 'credentials' };
  // The existing client does not expose a verifiable cap in the outgoing request.
  if (hasPriceCap(config)) return { ready: false, reason: 'price-cap' };
  return { ready: true };
}

module.exports = { inspectEvaluationConfig };
