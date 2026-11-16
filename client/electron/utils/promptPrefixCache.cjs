const { setTimeout: delay } = require('node:timers/promises');

const PREFIX_WARMUP_SETTLE_MS = 1500;

// Put shared materials in a separate user message: providers reuse prefix caches only at message boundaries, not matching prefixes inside one message;
// warming and real requests share this function for byte-identical messages. Without shared materials, use only system and item content.
function sharedPrefixMessages(system, sharedInput, itemInput) {
  return [
    { role: 'system', content: system },
    ...(sharedInput ? [{ role: 'user', content: sharedInput }] : []),
    ...(itemInput ? [{ role: 'user', content: itemInput }] : []),
  ];
}

// Providers write caches only at the end of the request's final message; later requests hit only at message boundaries;
// warm shared prefixes with short prefix-only requests first; failures do not affect later requests.
// Without signal, the caller's queue scope handles cancellation.
async function warmPromptPrefix({ aiService, messages, signal, onActivity, logTitle, label }) {
  onActivity?.({ message: `正在预热${label}缓存` });
  try {
    await aiService.chat({ signal, logTitle, output_token_limit: 1, messages });
    // Some services build prefix caches asynchronously after request completion; briefly wait before releasing later requests.
    await delay(PREFIX_WARMUP_SETTLE_MS, undefined, signal ? { signal } : undefined);
  } catch (error) {
    signal?.throwIfAborted();
    onActivity?.({ message: `${label}缓存预热失败，直接继续：${error.message}` });
  }
}

module.exports = { sharedPrefixMessages, warmPromptPrefix };
