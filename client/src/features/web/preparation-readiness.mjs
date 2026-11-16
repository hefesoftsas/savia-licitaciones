const pendingPattern = /【(?:待填写|待补充|待确认)】|[\[【]\s*(?:pendiente\s+por\s+(?:completar|confirmar)|pending(?:\s+completion|\s+confirmation)?|to\s+be\s+completed)\s*[\]】]/i;
export const hasPendingFacts = value => pendingPattern.test(String(value ?? ''));
export function pendingFactLocations(groups = []) {
  return groups.flatMap(group => ['title', 'content'].flatMap(field => [...String(group[field] ?? '').matchAll(new RegExp(pendingPattern.source, 'gi'))].map(match => ({groupId:group.id, field, start:match.index, end:match.index+match[0].length}))));
}
export function incompleteChapters(outline = []) {
  return outline.flatMap(node => node.children?.length ? incompleteChapters(node.children) : !node.content?.trim() || hasPendingFacts(node.content) ? [node] : []);
}
