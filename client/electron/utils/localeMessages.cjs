'use strict';

/**
 * Bilingual user-facing messages for Main -> Renderer IPC errors.
 *
 * Compatibility contract (do not break):
 * - Every message keeps the original Chinese substring verbatim at the head,
 *   so existing Renderer parsers that search Chinese substrings keep matching.
 * - Format is `zh (es / en)` when both translations exist, `zh (es)` or
 *   `zh (en)` when only one exists, and plain `zh` when none exists.
 * - `throw new Error(...)` call sites keep throwing; only the message text
 *   becomes bilingual. Long LLM prompts are out of scope and stay untouched.
 */

const SUPPORTED_LOCALES = new Set(['es', 'en']);

function normalizeLocale(value) {
  const raw = String(value == null ? '' : value).trim().toLowerCase();
  if (!raw) return 'es';
  const base = raw.split(/[-_]/)[0];
  if (SUPPORTED_LOCALES.has(base)) return base;
  if (base.startsWith('es')) return 'es';
  if (base.startsWith('en')) return 'en';
  if (base.startsWith('zh')) return 'es';
  return 'es';
}

function pickLocaleMessage(locale, zh, es, en) {
  const zhText = zh == null ? '' : String(zh);
  const esText = es == null ? '' : String(es);
  const enText = en == null ? '' : String(en);
  if (!zhText) return esText || enText || '';
  const lang = normalizeLocale(locale);
  const pair = esText && enText && esText !== enText
    ? `${esText} / ${enText}`
    : (esText || enText);
  // Messages retain both translations for legacy parser compatibility;
  // zh prefix is always kept for parser compatibility.
  if (lang === 'en') {
    const first = enText || esText;
    if (!first) return zhText;
    if (enText && esText && enText !== esText) return `${zhText} (${enText} / ${esText})`;
    return `${zhText} (${first})`;
  }
  if (lang === 'es') {
    const first = esText || enText;
    if (!first) return zhText;
    if (esText && enText && esText !== enText) return `${zhText} (${esText} / ${enText})`;
    return `${zhText} (${first})`;
  }
  if (!pair) return zhText;
  return `${zhText} (${pair})`;
}

/**
 * Read UI language from user_config.json via configStore.
 * Accepts: configStore with load(), plain config object, or null.
 * Returns 'zh' | 'es' | 'en', default 'zh'. Never throws.
 */
function detectLocaleFromConfig(configStore) {
  try {
    let config = null;
    if (configStore && typeof configStore.load === 'function') {
      config = configStore.load();
    } else if (configStore && typeof configStore === 'object') {
      config = configStore;
    }
    const language = config && config.language != null
      ? config.language
      : config && config.ui_language != null
        ? config.ui_language
        : config && config.locale != null
          ? config.locale
          : 'es';
    return normalizeLocale(language);
  } catch {
    return 'es';
  }
}

module.exports = {
  normalizeLocale,
  pickLocaleMessage,
  detectLocaleFromConfig,
};
