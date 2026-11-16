'use strict';

// Normalize recognized document attributes inside tags without changing offsets,
// text nodes, comments or quoted attribute values.
const ATTRIBUTE = /^(\s)data-[a-z]{2}-(asset-ref|generation|export-page-template|export-template|outline-number|row-even|preset|role|size|fit|rows)(?=\s*=)/i;

function normalizeTag(tag) {
  if (tag.startsWith('<!--')) return tag;
  let quote = '';
  let result = '';
  for (let i = 0; i < tag.length; i += 1) {
    const char = tag[i];
    if (quote) {
      result += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; result += char; continue; }
    const match = /\s/.test(char) && tag.slice(i + 1, i + 6).toLowerCase() === 'data-'
      ? ATTRIBUTE.exec(tag.slice(i)) : null;
    if (match) {
      result += `${match[1]}data-sv-${match[2]}`;
      i += match[0].length - 1;
    } else result += char;
  }
  return result;
}

function normalizeSaviaMarkup(value) {
  const html = String(value ?? '');
  return html.replace(/<!--[\s\S]*?(?:-->|$)|<(?:[^>"']|"[^"]*"|'[^']*')*>/g, normalizeTag);
}

module.exports = { normalizeSaviaMarkup };
