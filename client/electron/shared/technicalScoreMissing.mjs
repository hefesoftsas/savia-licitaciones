export function isMissingTechnicalScoreItems(content) {
  const text = String(content || '').trim();
  if (text === '未提取到') return true;
  const section = text.match(/^##[\t ]+技术评分项[\t ]*\r?\n([\s\S]*?)(?=^#{1,2}[\t ]|$(?![\s\S]))/m)?.[1]?.trim();
  if (!section) return false;
  if (section === '没有提及') return true;
  const fields = new Set();
  for (const line of section.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    const match = line.match(/^(?:[-*]\s*)?【(评分项名称|权重\/分值|评分标准|数据来源)】\s*[：:]\s*(没有提及|未提取到|No se menciona|No se encontró información)[.。]?$/i);
    if (!match || fields.has(match[1])) return false;
    fields.add(match[1]);
  }
  return ['评分项名称','权重/分值','评分标准','数据来源'].every(field => fields.has(field));
}
