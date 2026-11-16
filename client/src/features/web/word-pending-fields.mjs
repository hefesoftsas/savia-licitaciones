// Work on semantic search matches, including off-screen and table paragraphs.
export const pendingPrefixes = ['[POR DEFINIR', '[Pendiente por completar', '[Pendiente por confirmar', '[Pending', '[To be completed', '[Firma]', '【待填写】', '【待补充】', '【待确认】'];
export function collectPendingFields(editor) {
  const ends = editor.findMatches(']');
  const scopeKey = match => JSON.stringify(match.scope ?? { kind: 'body' });
  const unique = new Map();
  for (const prefix of pendingPrefixes) {
    for (const match of editor.findMatches(prefix)) {
      const end = prefix.endsWith(']') || prefix.endsWith('】') ? null : ends.find(candidate => candidate.blockId === match.blockId && scopeKey(candidate) === scopeKey(match) && candidate.start >= match.start + match.length);
      if (!end && !prefix.endsWith(']') && !prefix.endsWith('】')) continue;
      const field = {...match, length: end ? end.start + end.length - match.start : match.length};
      unique.set(`${scopeKey(field)}:${field.blockId}:${field.start}`, field);
    }
  }
  return [...unique.values()].sort((a,b) => scopeKey(a).localeCompare(scopeKey(b)) || a.paragraphIndex-b.paragraphIndex || a.start-b.start);
}
export function pendingFieldIndex(fields, active, direction) {
  if (!fields.length) return -1;
  if (!active) return direction < 0 ? fields.length - 1 : 0;
  const index = fields.findIndex(field => field.blockId === active.blockId && field.start === active.start && JSON.stringify(field.scope) === JSON.stringify(active.scope));
  if (index >= 0) return (index + direction + fields.length) % fields.length;
  const next = fields.findIndex(field => field.paragraphIndex > active.paragraphIndex || (field.paragraphIndex === active.paragraphIndex && field.start >= active.start));
  return direction < 0 ? (next < 0 ? fields.length - 1 : (next - 1 + fields.length) % fields.length) : (next < 0 ? 0 : next);
}
