export function validTechnicalFormat(format) {
  return format && typeof format === 'object' && !Array.isArray(format)
    && Object.keys(format).every(key=>['font','fontSize','lineSpacing','margin'].includes(key))
    && (format.font===undefined || typeof format.font==='string' && /^[\p{L}\d .-]{1,60}$/u.test(format.font))
    && (format.fontSize===undefined || [6.5,7.5,9,10.5,12,14,15,16,18,22,24,26,36,42].includes(format.fontSize))
    && (format.lineSpacing===undefined || Number.isFinite(format.lineSpacing) && format.lineSpacing>=1 && format.lineSpacing<=3)
    && (format.margin===undefined || Number.isFinite(format.margin) && format.margin>=1 && format.margin<=5);
}
export function readBidDocumentRules(content) {
  const match = /(?:^|\n)\s*\`\`\`json\s*\n\s*(\{[^\`]*"bidDocuments"[^\`]*\})\s*\n\s*\`\`\`\s*$/i.exec(content || '');
  if (!match) return null;
  let rules;
  try { rules=JSON.parse(match[1]).bidDocuments; } catch { return null; }
  if (!rules || rules.separate!==true) return null;
  if (!Number.isSafeInteger(rules.economicAnnex) || rules.economicAnnex<1 || rules.economicAnnex>999) return {incomplete:true};
  const {pageLimit,format} = rules;
  if (pageLimit != null && (!Number.isSafeInteger(pageLimit) || pageLimit<1 || pageLimit>500)) return {incomplete:true};
  if (format != null && !validTechnicalFormat(format)) return {incomplete:true};
  return {economicAnnex:rules.economicAnnex,...(pageLimit ? {pageLimit} : {}),...(format ? {format} : {})};
}
export function technicalLeaves(outline) {
  const leaves = nodes => nodes.flatMap(node=>node.children?.length ? leaves(node.children) : [node]);
  return leaves(outline.filter(node=>node.attr==='技术'));
}
