'use strict';

// Native dialogs do not pass through the renderer's translation layer.
function nativeUiText(configOrStore, { es, en, zh }) {
  let config = null;
  try { config = typeof configOrStore?.load === 'function' ? configOrStore.load() : configOrStore; } catch { /* use default */ }
  const language = String(config?.ui_language || 'es').toLowerCase().split(/[-_]/)[0];
  return language === 'zh' ? zh : language === 'en' ? en : es;
}

module.exports = { nativeUiText };
