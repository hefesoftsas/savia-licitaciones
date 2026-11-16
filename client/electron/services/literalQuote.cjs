'use strict';

const normalizeQuote = value => String(value || '').normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('es');
const alphanumeric = character => Boolean(character && /[\p{L}\p{N}]/u.test(character));
const digit = character => Boolean(character && /\p{N}/u.test(character));
const before = (value, index) => index > 0 ? Array.from(value.slice(Math.max(0, index - 2), index)).at(-1) || '' : '';
const after = (value, index) => index < value.length ? String.fromCodePoint(value.codePointAt(index)) : '';

// Match complete edge words/numbers, not a substring inside another one.
// Thousands/decimal punctuation surrounded by digits belongs to the number.
function containsLiteralQuote(source, quote) {
  const haystack = normalizeQuote(source), needle = normalizeQuote(quote);
  if (!needle) return false;
  const first = after(needle, 0), last = before(needle, needle.length);
  let index = -1;
  while ((index = haystack.indexOf(needle, index + 1)) !== -1) {
    const end = index + needle.length, previous = before(haystack, index), next = after(haystack, end);
    if (alphanumeric(first) && alphanumeric(previous)) continue;
    if (alphanumeric(last) && alphanumeric(next)) continue;
    if (digit(first) && /[.,]/.test(previous) && digit(before(haystack, index - 1))) continue;
    if (digit(last) && /[.,]/.test(next) && digit(after(haystack, end + 1))) continue;
    return true;
  }
  return false;
}

module.exports = { containsLiteralQuote };
