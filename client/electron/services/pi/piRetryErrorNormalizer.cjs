const brand = require('../../../brand.json');
const RETRYABLE_ERROR_PREFIX = 'Provider returned error: ';
const UPSTREAM_TEMPORARILY_UNAVAILABLE_PATTERN = /\bupstream service temporarily unavailable\b/i;
const PI_RETRY_ERROR_NORMALIZER_NAME = 'savia-retry-error-normalizer';
const PI_RETRY_ERROR_NORMALIZER_PATH = `<inline:${PI_RETRY_ERROR_NORMALIZER_NAME}>`;

// Normalize known transient gateway errors into messages recognized by Pi's native retry logic.
function normalizePiRetryableErrorMessage(value) {
  const message = String(value || '').trim();
  if (!message || message.startsWith(RETRYABLE_ERROR_PREFIX)) return message;
  if (!UPSTREAM_TEMPORARILY_UNAVAILABLE_PATTERN.test(message)) return message;
  return `${RETRYABLE_ERROR_PREFIX}${message}`;
}

// Restore original gateway error wording for user interfaces and business state.
function restorePiErrorMessage(value) {
  const message = String(value || '');
  return message.startsWith(RETRYABLE_ERROR_PREFIX)
    ? message.slice(RETRYABLE_ERROR_PREFIX.length)
    : message;
}

// Register an inline extension to normalize provider errors before Pi decides whether to retry automatically.
function createPiRetryErrorNormalizer() {
  return {
    name: PI_RETRY_ERROR_NORMALIZER_NAME,
    factory(pi) {
      pi.on('message_end', (event, context) => {
        const message = event.message;
        if (message?.role !== 'assistant' || message.stopReason !== 'error') return undefined;
        if (message.provider !== brand.slug && context.model?.provider !== brand.slug) return undefined;
        const normalized = normalizePiRetryableErrorMessage(message.errorMessage);
        if (!normalized || normalized === message.errorMessage) return undefined;
        return { message: { ...message, errorMessage: normalized } };
      });
    },
  };
}

module.exports = {
  PI_RETRY_ERROR_NORMALIZER_PATH,
  createPiRetryErrorNormalizer,
  normalizePiRetryableErrorMessage,
  restorePiErrorMessage,
};
